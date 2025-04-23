// file: vector_search_handler.go
package gt_1_row_read

import (
	"context"
	"database/sql" // tarvitaan *sql.DB
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/lib/pq"
	pgvector "github.com/pgvector/pgvector-go"
	"github.com/sashabaranov/go-openai"

	backend "easelect/backend/core_components"
	"easelect/backend/core_components/general_tables/gt_2_column_crud/gt_2_column_read"
	"easelect/backend/core_components/general_tables/models"
	e_sessions "easelect/backend/core_components/sessions"
)

// GetResultsVector on rinnakkainen endpoint GetResults-funktiolle, mutta tukee
// vector_query-parametria, jolla toteutetaan semanttinen haku (ORDER BY openai_embedding <-> $N).
func GetResultsVector(response_writer http.ResponseWriter, request *http.Request) {
	table_name := request.URL.Query().Get("table")
	if table_name == "" {
		http.Error(response_writer, "Taulun nimi puuttuu", http.StatusBadRequest)
		return
	}

	//------------------------------------------------
	// 1. Haetaan user_role sessiosta ja valitaan DB
	session, err := e_sessions.GetStore().Get(request, "session")
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe session haussa", http.StatusInternalServerError)
		return
	}
	userRole, _ := session.Values["user_role"].(string)
	if userRole == "" {
		userRole = "guest"
	}

	// Roolikartta - mukauta omaan käyttöön
	roleDbMapping := map[string]*sql.DB{
		"admin": backend.DbAdmin,
		"basic": backend.DbBasic,
		"guest": backend.DbGuest,
	}
	currentDb, found := roleDbMapping[userRole]
	if !found {
		currentDb = roleDbMapping["guest"]
	}

	//------------------------------------------------
	// 2. Luetaan results_per_load ja offset currentDb:ltä
	var results_per_load_str string
	err = currentDb.QueryRow(`
	SELECT int_value 
	FROM system_config 
	WHERE key = 'results_load_amount'
	`).Scan(&results_per_load_str)
	if err != nil {
		log.Printf("\033[31mvirhe haettaessa results_load_amount: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe konfiguraatiota haettaessa", http.StatusInternalServerError)
		return
	}
	results_per_load, err := strconv.Atoi(results_per_load_str)
	if err != nil {
		log.Printf("\033[31mvirhe muunnettaessa results_load_amount kokonaisluvuksi: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe konfiguraation arvossa", http.StatusInternalServerError)
		return
	}

	offset_str := request.URL.Query().Get("offset")
	offset_value := 0
	if offset_str != "" {
		offset_value, err = strconv.Atoi(offset_str)
		if err != nil {
			log.Printf("\033[31mvirhe muunnettaessa offset kokonaisluvuksi: %s\033[0m\n", err.Error())
			http.Error(response_writer, "virhe offset-parametrissa", http.StatusBadRequest)
			return
		}
	}

	//------------------------------------------------
	// 3. Haetaan saraketiedot
	columns_map, err := gt_2_column_read.GetColumnsMapForTable(table_name)
	if err != nil {
		log.Printf("\033[31mvirhe sarakkeiden haussa: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe sarakkeiden haussa", http.StatusInternalServerError)
		return
	}
	column_uids := make([]int, 0, len(columns_map))
	for uid := range columns_map {
		column_uids = append(column_uids, uid)
	}

	// 4. Haetaan sarakkeiden tietotyypit (mahdollisesti ulkoavaimet yms.)
	column_data_types, err := getColumnDataTypesWithFK(table_name, currentDb)
	if err != nil {
		log.Printf("\033[31mvirhe sarakkeiden tietotyyppien haussa: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe sarakkeiden tietotyyppien haussa", http.StatusInternalServerError)
		return
	}

	columns_by_name := make(map[string]models.ColumnInfo)
	for _, column_info := range columns_map {
		columns_by_name[column_info.ColumnName] = column_info
	}

	//------------------------------------------------
	// 5. Rakennetaan SELECT- ja JOIN-lauseet
	select_columns, join_clauses, column_expressions, err :=
		buildJoinsWith1MRelations(currentDb, table_name, columns_map, column_uids)
	if err != nil {
		log.Printf("\033[31mvirhe JOIN-liitosten rakentamisessa: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe JOIN-liitosten rakentamisessa", http.StatusInternalServerError)
		return
	}

	//------------------------------------------------
	// 6. Rakennetaan WHERE- ja ORDER BY -ehdot
	where_clause, query_args, err := buildWhereClause(
		request.URL.Query(),
		table_name,
		columns_by_name,
		column_expressions,
	)
	if err != nil {
		log.Printf("\033[31mvirhe WHERE-ehdon rakentamisessa: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe WHERE-ehdon rakentamisessa", http.StatusInternalServerError)
		return
	}
	order_by_clause, err := buildOrderByClause(
		request.URL.Query(),
		table_name,
		columns_by_name,
		column_expressions,
	)
	if err != nil {
		log.Printf("\033[31mvirhe ORDER BY -ehdon rakentamisessa: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe ORDER BY -ehdon rakentamisessa", http.StatusBadRequest)
		return
	}

	//------------------------------------------------
	// 7. Tarkistetaan semanttisen haun parametri (vector_query=...)
	vector_query := request.URL.Query().Get("vector_query")
	if vector_query != "" {
		log.Printf("[DEBUG] semanttinen haku param: %s", vector_query)

		// Tarkista, onko openai_embedding-sarake olemassa
		var columnExists bool
		err = currentDb.QueryRow(
			`SELECT EXISTS (
	SELECT 1
	FROM information_schema.columns
	WHERE table_name = $1
	AND column_name = 'openai_embedding'
	AND table_schema = 'public'
	)`,
			table_name,
		).Scan(&columnExists)
		if err != nil {
			log.Printf("Virhe tarkistettaessa openai_embedding-saraketta: %v", err)
			http.Error(response_writer, "virhe sarakkeen tarkistuksessa", http.StatusInternalServerError)
			return
		}
		if !columnExists {
			log.Printf("openai_embedding-sarake puuttuu taulusta %s", table_name)
			response_data := map[string]interface{}{
				"columns":        []string{},
				"data":           []map[string]interface{}{},
				"types":          map[string]interface{}{},
				"resultsPerLoad": 0,
			}
			json.NewEncoder(response_writer).Encode(response_data)
			return
		}

		vectorVal, embErr := generateVectorParam(vector_query)
		if embErr != nil {
			log.Printf("\033[31mvirhe generateVectorParam: %s\033[0m\n", embErr.Error())
			http.Error(response_writer, fmt.Sprintf("virhe generateVectorParam: %v", embErr), http.StatusInternalServerError)
			return
		}

		query_args = append(query_args, vectorVal)
		paramIndex := len(query_args)
		// Korvataan order_by_clause vektori-etäisyysperusteella
		order_by_clause = fmt.Sprintf(" ORDER BY %s.openai_embedding <-> $%d",
			pq.QuoteIdentifier(table_name),
			paramIndex,
		)
	}

	// ------------------------------------------------
	// 8. Kootaan lopullinen SQL-kysely
	query := fmt.Sprintf(
		"SELECT %s FROM %s %s%s%s LIMIT %d OFFSET %d",
		select_columns,
		pq.QuoteIdentifier(table_name),
		join_clauses,
		where_clause,
		order_by_clause,
		results_per_load,
		offset_value,
	)

	// Lisätään lokitus: tulostetaan SQL-kysely ja argumentit
	log.Printf("Suoritetaan SQL-kysely: %s, argumentit: %v", query, query_args)

	rows_result, err := currentDb.Query(query, query_args...)
	if err != nil {
		log.Printf("\033[31mvirhe suoritettaessa kyselyä: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe tietoja haettaessa", http.StatusInternalServerError)
		return
	}
	defer rows_result.Close()

	// ------------------------------------------------
	// 9. Luetaan tulokset ja muotoillaan JSON
	result_columns, err := rows_result.Columns()
	if err != nil {
		log.Printf("\033[31mvirhe sarakkeiden haussa tuloksesta: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe sarakkeiden haussa", http.StatusInternalServerError)
		return
	}

	var query_results []map[string]interface{}
	for rows_result.Next() {
		row_values := make([]interface{}, len(result_columns))
		row_pointers := make([]interface{}, len(result_columns))
		for i := range row_values {
			row_pointers[i] = &row_values[i]
		}

		if err := rows_result.Scan(row_pointers...); err != nil {
			log.Printf("\033[31mvirhe rivien käsittelyssä: %s\033[0m\n", err.Error())
			http.Error(response_writer, "virhe rivien käsittelyssä", http.StatusInternalServerError)
			return
		}

		current_row_result := make(map[string]interface{})
		for i, column_name := range result_columns {
			val := row_values[i]
			switch typed_val := val.(type) {
			case time.Time:
				current_row_result[column_name] = typed_val.Format("2006-01-02 15:04:05")
			case []byte:
				current_row_result[column_name] = string(typed_val)
			default:
				current_row_result[column_name] = typed_val
			}
		}
		query_results = append(query_results, current_row_result)
	}

	if err := rows_result.Err(); err != nil {
		log.Printf("\033[31mvirhe rivien käsittelyssä (rows_result err): %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe rivien käsittelyssä", http.StatusInternalServerError)
		return
	}

	// Lisätään laajennettu lokitus tulosten määrästä ja esimerkistä
	if len(query_results) == 0 {
		log.Printf("Vektorihaku ei palauttanut rivejä taululle %s, kysely: %s, argumentit: %v", table_name, query, query_args)
	} else {
		log.Printf("Vektorihaku palautti %d riviä taululle %s", len(query_results), table_name)
		// Valinnainen: tulosta ensimmäinen tulos tarkistusta varten
		// if len(query_results) > 0 {
		// 	log.Printf("Ensimmäinen tulos: %v", query_results[0])
		// }
	}

	// 10. Palautetaan tulokset JSON-muodossa
	response_data := map[string]interface{}{
		"columns":        result_columns,
		"data":           query_results,
		"types":          column_data_types,
		"resultsPerLoad": results_per_load,
	}

	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(response_writer).Encode(response_data); err != nil {
		log.Printf("\033[31mvirhe vastauksen koodauksessa: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe vastauksen koodauksessa", http.StatusInternalServerError)
		return
	}
}

// generateVectorParam hakee openai-embeddingin ja rakentaa pgvector.Vectorin
func generateVectorParam(queryText string) (pgvector.Vector, error) {
	openaiKey := os.Getenv("OPENAI_API_KEY")
	if openaiKey == "" {
		return pgvector.Vector{}, fmt.Errorf("missing OPENAI_API_KEY")
	}
	embeddingModel := os.Getenv("OPENAI_EMBEDDING_MODEL")
	if embeddingModel == "" {
		embeddingModel = "text-embedding-ada-002"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client := openai.NewClient(openaiKey)
	embedReq := openai.EmbeddingRequest{
		Model: openai.EmbeddingModel(embeddingModel),
		Input: []string{queryText},
	}
	embedResp, err := client.CreateEmbeddings(ctx, embedReq)
	if err != nil {
		return pgvector.Vector{}, fmt.Errorf("openai embedding error: %w", err)
	}
	if len(embedResp.Data) == 0 {
		return pgvector.Vector{}, fmt.Errorf("embedding returned no data")
	}

	float32Slice := embedResp.Data[0].Embedding
	vectorVal := pgvector.NewVector(float32Slice)
	return vectorVal, nil
}

// // vector_search_handler.go
// package gt_1_row_read

// import (
// 	"context"
// 	"encoding/json"
// 	"fmt"
// 	"log"
// 	"net/http"
// 	"os"
// 	"strconv"
// 	"time"

// 	"database/sql" // lisätty jos tarvitset *sql.DB-tyypin

// 	backend "easelect/backend/core_components"
// 	"easelect/backend/core_components/general_tables/gt_2_column_crud/gt_2_column_read"
// 	"easelect/backend/core_components/general_tables/models"
// 	e_sessions "easelect/backend/core_components/sessions"

// 	"github.com/lib/pq"
// 	pgvector "github.com/pgvector/pgvector-go"
// 	"github.com/sashabaranov/go-openai"
// )

// // GetResultsVector on rinnakkainen endpoint GetResults-funktiolle, mutta tukee
// // vector_query-parametria, jolla toteutetaan semanttinen haku (ORDER BY openai_embedding <-> $N).
// func GetResultsVector(response_writer http.ResponseWriter, request *http.Request) {
// 	table_name := request.URL.Query().Get("table")
// 	if table_name == "" {
// 		http.Error(response_writer, "Taulun nimi puuttuu", http.StatusBadRequest)
// 		return
// 	}

// 	//------------------------------------------------
// 	// 1. Haetaan user_role sessiosta ja valitaan DB
// 	session, err := e_sessions.GetStore().Get(request, "session")
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe session haussa", http.StatusInternalServerError)
// 		return
// 	}
// 	userRole, _ := session.Values["user_role"].(string)
// 	if userRole == "" {
// 		userRole = "guest"
// 	}

// 	// Roolikartta - mukauta omaan käyttöön
// 	roleDbMapping := map[string]*sql.DB{
// 		"admin": backend.DbAdmin,
// 		"basic": backend.DbBasic,
// 		"guest": backend.DbGuest,
// 	}
// 	currentDb, found := roleDbMapping[userRole]
// 	if !found {
// 		currentDb = roleDbMapping["guest"]
// 	}

// 	//------------------------------------------------
// 	// 2. Luetaan results_per_load ja offset currentDb:ltä
// 	var results_per_load_str string
// 	err = currentDb.QueryRow(`
// 		SELECT int_value
// 		FROM system_config
// 		WHERE key = 'results_load_amount'
// 	`).Scan(&results_per_load_str)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe haettaessa results_load_amount: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe konfiguraatiota haettaessa", http.StatusInternalServerError)
// 		return
// 	}
// 	results_per_load, err := strconv.Atoi(results_per_load_str)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe muunnettaessa results_load_amount kokonaisluvuksi: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe konfiguraation arvossa", http.StatusInternalServerError)
// 		return
// 	}

// 	offset_str := request.URL.Query().Get("offset")
// 	offset_value := 0
// 	if offset_str != "" {
// 		offset_value, err = strconv.Atoi(offset_str)
// 		if err != nil {
// 			log.Printf("\033[31mvirhe muunnettaessa offset kokonaisluvuksi: %s\033[0m\n", err.Error())
// 			http.Error(response_writer, "virhe offset-parametrissa", http.StatusBadRequest)
// 			return
// 		}
// 	}

// 	//------------------------------------------------
// 	// 3. Haetaan saraketiedot
// 	columns_map, err := gt_2_column_read.GetColumnsMapForTable(table_name)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe sarakkeiden haussa: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe sarakkeiden haussa", http.StatusInternalServerError)
// 		return
// 	}
// 	column_uids := make([]int, 0, len(columns_map))
// 	for uid := range columns_map {
// 		column_uids = append(column_uids, uid)
// 	}

// 	// 4. Haetaan sarakkeiden tietotyypit
// 	column_data_types, err := getColumnDataTypesWithFK(table_name, currentDb)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe sarakkeiden tietotyyppien haussa: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe sarakkeiden tietotyyppien haussa", http.StatusInternalServerError)
// 		return
// 	}

// 	columns_by_name := make(map[string]models.ColumnInfo)
// 	for _, column_info := range columns_map {
// 		columns_by_name[column_info.ColumnName] = column_info
// 	}

// 	//------------------------------------------------
// 	// 5. Rakennetaan SELECT- ja JOIN-lauseet (ilman db-parametria)
// 	select_columns, join_clauses, column_expressions, err :=
// 		buildJoins(table_name, columns_map, column_uids)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe JOIN-liitosten rakentamisessa: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe JOIN-liitosten rakentamisessa", http.StatusInternalServerError)
// 		return
// 	}

// 	//------------------------------------------------
// 	// 6. Rakennetaan WHERE ja ORDER BY
// 	where_clause, query_args, err := buildWhereClause(
// 		request.URL.Query(),
// 		table_name,
// 		columns_by_name,
// 		column_expressions,
// 	)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe WHERE-ehdon rakentamisessa: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe WHERE-ehdon rakentamisessa", http.StatusInternalServerError)
// 		return
// 	}
// 	order_by_clause, err := buildOrderByClause(
// 		request.URL.Query(),
// 		table_name,
// 		columns_by_name,
// 		column_expressions,
// 	)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe ORDER BY -ehdon rakentamisessa: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe ORDER BY -ehdon rakentamisessa", http.StatusBadRequest)
// 		return
// 	}

// 	//------------------------------------------------
// 	// 7. Tarkistetaan semanttisen haun parametri (vector_query=...)
// 	vector_query := request.URL.Query().Get("vector_query")
// 	if vector_query != "" {
// 		log.Printf("[DEBUG] semanttinen haku param: %s", vector_query)

// 		vectorVal, embErr := generateVectorParam(vector_query)
// 		if embErr != nil {
// 			log.Printf("\033[31mvirhe generateVectorParam: %s\033[0m\n", embErr.Error())
// 			http.Error(response_writer, fmt.Sprintf("virhe generateVectorParam: %v", embErr), http.StatusInternalServerError)
// 			return
// 		}

// 		query_args = append(query_args, vectorVal)
// 		paramIndex := len(query_args)
// 		order_by_clause = fmt.Sprintf(" ORDER BY %s.openai_embedding <-> $%d",
// 			pq.QuoteIdentifier(table_name),
// 			paramIndex,
// 		)
// 	}

// 	//------------------------------------------------
// 	// 8. Koostetaan lopullinen SQL-kysely ja suoritetaan dynaamisella DB:llä
// 	query := fmt.Sprintf(
// 		"SELECT %s FROM %s %s%s%s LIMIT %d OFFSET %d",
// 		select_columns,
// 		pq.QuoteIdentifier(table_name),
// 		join_clauses,
// 		where_clause,
// 		order_by_clause,
// 		results_per_load,
// 		offset_value,
// 	)

// 	rows_result, err := currentDb.Query(query, query_args...)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe suoritettaessa kyselyä: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe tietoja haettaessa", http.StatusInternalServerError)
// 		return
// 	}
// 	defer rows_result.Close()

// 	//------------------------------------------------
// 	// 9. Luetaan tulokset ja muotoillaan JSON
// 	result_columns, err := rows_result.Columns()
// 	if err != nil {
// 		log.Printf("\033[31mvirhe sarakkeiden haussa tuloksesta: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe sarakkeiden haussa", http.StatusInternalServerError)
// 		return
// 	}

// 	var query_results []map[string]interface{}
// 	for rows_result.Next() {
// 		row_values := make([]interface{}, len(result_columns))
// 		row_pointers := make([]interface{}, len(result_columns))
// 		for i := range row_values {
// 			row_pointers[i] = &row_values[i]
// 		}

// 		if err := rows_result.Scan(row_pointers...); err != nil {
// 			log.Printf("\033[31mvirhe rivien käsittelyssä: %s\033[0m\n", err.Error())
// 			http.Error(response_writer, "virhe rivien käsittelyssä", http.StatusInternalServerError)
// 			return
// 		}

// 		current_row_result := make(map[string]interface{})
// 		for i, column_name := range result_columns {
// 			val := row_values[i]
// 			switch typed_val := val.(type) {
// 			case time.Time:
// 				formatted_time := typed_val.Format("2006-01-02 15:04:05")
// 				current_row_result[column_name] = formatted_time
// 			case []byte:
// 				current_row_result[column_name] = string(typed_val)
// 			default:
// 				current_row_result[column_name] = typed_val
// 			}
// 		}
// 		query_results = append(query_results, current_row_result)
// 	}

// 	// 10. Palautetaan tulokset JSON-muodossa
// 	response_data := map[string]interface{}{
// 		"columns":        result_columns,
// 		"data":           query_results,
// 		"types":          column_data_types,
// 		"resultsPerLoad": results_per_load,
// 	}

// 	response_writer.Header().Set("Content-Type", "application/json")
// 	if err := json.NewEncoder(response_writer).Encode(response_data); err != nil {
// 		log.Printf("\033[31mvirhe vastauksen koodauksessa: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe vastauksen koodauksessa", http.StatusInternalServerError)
// 		return
// 	}
// }

// // generateVectorParam hakee openai-embeddingin ja rakentaa pgvector.Vectorin
// func generateVectorParam(queryText string) (pgvector.Vector, error) {
// 	openaiKey := os.Getenv("OPENAI_API_KEY")
// 	if openaiKey == "" {
// 		return pgvector.Vector{}, fmt.Errorf("missing OPENAI_API_KEY")
// 	}
// 	embeddingModel := os.Getenv("OPENAI_EMBEDDING_MODEL")
// 	if embeddingModel == "" {
// 		embeddingModel = "text-embedding-ada-002"
// 	}

// 	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
// 	defer cancel()

// 	client := openai.NewClient(openaiKey)
// 	embedReq := openai.EmbeddingRequest{
// 		Model: openai.EmbeddingModel(embeddingModel),
// 		Input: []string{queryText},
// 	}
// 	embedResp, err := client.CreateEmbeddings(ctx, embedReq)
// 	if err != nil {
// 		return pgvector.Vector{}, fmt.Errorf("openai embedding error: %w", err)
// 	}
// 	if len(embedResp.Data) == 0 {
// 		return pgvector.Vector{}, fmt.Errorf("embedding returned no data")
// 	}

// 	float32Slice := embedResp.Data[0].Embedding
// 	// Muodostetaan pgvector.Vector suoraan []float32:stä
// 	vectorVal := pgvector.NewVector(float32Slice)
// 	return vectorVal, nil
// }

// // // vector_search_handler.go
// // package gt_1_row_read

// // import (
// // 	"context"
// // 	"encoding/json"
// // 	"fmt"
// // 	"log"
// // 	"net/http"
// // 	"os"

// // 	backend "easelect/backend/core_components"
// // 	"easelect/backend/core_components/general_tables/gt_2_column_crud/gt_2_column_read"
// // 	"easelect/backend/core_components/general_tables/models"

// // 	"strconv"
// // 	"time"

// // 	// pgvector-go kirjaston import
// // 	"github.com/lib/pq"
// // 	pgvector "github.com/pgvector/pgvector-go"
// // 	"github.com/sashabaranov/go-openai"
// // )

// // // GetResultsVector on kopio GetResults-funktiosta, mutta tukee vector_query-
// // // parametria, jolla toteutetaan semanttinen haku (ORDER BY openai_embedding <-> $N).
// // // HUOM: Emme muuta vanhaa GetResults-funktiota, vaan tämä on rinnakkainen endpoint.
// // func GetResultsVector(response_writer http.ResponseWriter, request *http.Request) {
// // 	table_name := request.URL.Query().Get("table")
// // 	if table_name == "" {
// // 		http.Error(response_writer, "Taulun nimi puuttuu", http.StatusBadRequest)
// // 		return
// // 	}

// // 	// 1) Haetaan results_load_amount
// // 	var results_per_load_str string
// // 	err := backend.Db.QueryRow("SELECT json_value FROM system_config WHERE key = 'results_load_amount'").Scan(&results_per_load_str)
// // 	if err != nil {
// // 		log.Printf("virhe haettaessa results_load_amount: %v", err)
// // 		http.Error(response_writer, "virhe konfiguraatiota haettaessa", http.StatusInternalServerError)
// // 		return
// // 	}
// // 	results_per_load, err := strconv.Atoi(results_per_load_str)
// // 	if err != nil {
// // 		log.Printf("virhe muunnettaessa results_load_amount kokonaisluvuksi: %v", err)
// // 		http.Error(response_writer, "virhe konfiguraation arvossa", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	// 2) offset
// // 	offset_str := request.URL.Query().Get("offset")
// // 	offset_value := 0
// // 	if offset_str != "" {
// // 		offset_value, err = strconv.Atoi(offset_str)
// // 		if err != nil {
// // 			log.Printf("virhe muunnettaessa offset kokonaisluvuksi: %v", err)
// // 			http.Error(response_writer, "virhe offset-parametrissa", http.StatusBadRequest)
// // 			return
// // 		}
// // 	}

// // 	// --- POISTETTU getOrderedColumns ---

// // 	// Haetaan saraketiedot suoraan ilman getOrderedColumns
// // 	// Käytetään omaa "GetColumnsMapForTable"-funktiota tms.
// // 	columns_map, err := gt_2_column_read.GetColumnsMapForTable(table_name)
// // 	if err != nil {
// // 		log.Printf("virhe sarakkeiden haussa: %v", err)
// // 		http.Error(response_writer, "virhe sarakkeiden haussa", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	// Jos buildJoins vaatii column_uids-listan, luodaan se yksinkertaisesti:
// // 	column_uids := make([]int, 0, len(columns_map))
// // 	for uid := range columns_map {
// // 		column_uids = append(column_uids, uid)
// // 	}

// // 	// Haetaan sarakkeiden tietotyypit (kuten aiemmin)
// // 	column_data_types, err := getColumnDataTypesWithFK(table_name)
// // 	if err != nil {
// // 		log.Printf("virhe sarakkeiden tietotyyppien haussa: %v", err)
// // 		http.Error(response_writer, "virhe sarakkeiden tietotyyppien haussa", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	columns_by_name := make(map[string]models.ColumnInfo)
// // 	for _, column_info := range columns_map {
// // 		columns_by_name[column_info.ColumnName] = column_info
// // 	}

// // 	// Rakennetaan SELECT- ja JOIN-lauseet (kuten ennen)
// // 	select_columns, join_clauses, column_expressions, err := buildJoins(table_name, columns_map, column_uids)
// // 	if err != nil {
// // 		log.Printf("virhe JOIN-liitosten rakentamisessa: %v", err)
// // 		http.Error(response_writer, "virhe JOIN-liitosten rakentamisessa", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	// 4) WHERE-filtterit
// // 	where_clause, query_args, err := buildWhereClause(request.URL.Query(), table_name, columns_by_name, column_expressions)
// // 	if err != nil {
// // 		log.Printf("virhe WHERE-ehdon rakentamisessa: %v", err)
// // 		http.Error(response_writer, "virhe WHERE-ehdon rakentamisessa", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	// 5) Normaali ORDER BY
// // 	order_by_clause, err := buildOrderByClause(request.URL.Query(), table_name, columns_by_name, column_expressions)
// // 	if err != nil {
// // 		log.Printf("virhe ORDER BY -ehdon rakentamisessa: %v", err)
// // 		http.Error(response_writer, "virhe ORDER BY -ehdon rakentamisessa", http.StatusBadRequest)
// // 		return
// // 	}

// // 	// 6) Tarkistetaan semanttisen haun parametri (vector_query=...)
// // 	vector_query := request.URL.Query().Get("vector_query")
// // 	if vector_query != "" {
// // 		log.Printf("[DEBUG] semanttinen haku param: %s", vector_query)

// // 		// Luodaan embedding
// // 		vectorVal, embErr := generateVectorParam(vector_query)
// // 		if embErr != nil {
// // 			log.Printf("virhe generateVectorParam: %v", embErr)
// // 			http.Error(response_writer, fmt.Sprintf("virhe generateVectorParam: %v", embErr), http.StatusInternalServerError)
// // 			return
// // 		}

// // 		// Lisätään parametri query_args:iin
// // 		query_args = append(query_args, vectorVal)
// // 		paramIndex := len(query_args)

// // 		// Ylikirjoitetaan order_by_clause: ORDER BY openai_embedding <-> $N
// // 		order_by_clause = fmt.Sprintf(" ORDER BY %s.openai_embedding <-> $%d",
// // 			pq.QuoteIdentifier(table_name),
// // 			paramIndex,
// // 		)
// // 	}

// // 	// 7) Koostetaan lopullinen SQL-kysely
// // 	query := fmt.Sprintf(
// // 		"SELECT %s FROM %s %s%s%s LIMIT %d OFFSET %d",
// // 		select_columns,
// // 		pq.QuoteIdentifier(table_name),
// // 		join_clauses,
// // 		where_clause,
// // 		order_by_clause,
// // 		results_per_load,
// // 		offset_value,
// // 	)

// // 	rows_result, err := backend.Db.Query(query, query_args...)
// // 	if err != nil {
// // 		log.Printf("virhe suoritettaessa kyselyä: %v", err)
// // 		http.Error(response_writer, "virhe tietoja haettaessa", http.StatusInternalServerError)
// // 		return
// // 	}
// // 	defer rows_result.Close()

// // 	// 8) Luetaan tulokset ja muotoillaan JSON kuten GetResults
// // 	result_columns, err := rows_result.Columns()
// // 	if err != nil {
// // 		log.Printf("virhe sarakkeiden haussa tuloksesta: %v", err)
// // 		http.Error(response_writer, "virhe sarakkeiden haussa", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	var query_results []map[string]interface{}
// // 	for rows_result.Next() {
// // 		row_values := make([]interface{}, len(result_columns))
// // 		row_pointers := make([]interface{}, len(result_columns))
// // 		for i := range row_values {
// // 			row_pointers[i] = &row_values[i]
// // 		}

// // 		if err := rows_result.Scan(row_pointers...); err != nil {
// // 			log.Printf("virhe rivien käsittelyssä: %v", err)
// // 			http.Error(response_writer, "virhe rivien käsittelyssä", http.StatusInternalServerError)
// // 			return
// // 		}

// // 		current_row_result := make(map[string]interface{})
// // 		for i, column_name := range result_columns {
// // 			val := row_values[i]
// // 			switch typed_val := val.(type) {
// // 			case time.Time:
// // 				formatted_time := typed_val.Format("2006-01-02 15:04:05")
// // 				current_row_result[column_name] = formatted_time
// // 			case []byte:
// // 				current_row_result[column_name] = string(typed_val)
// // 			default:
// // 				current_row_result[column_name] = typed_val
// // 			}
// // 		}
// // 		query_results = append(query_results, current_row_result)
// // 	}

// // 	response_data := map[string]interface{}{
// // 		"columns":        result_columns,
// // 		"data":           query_results,
// // 		"types":          column_data_types,
// // 		"resultsPerLoad": results_per_load,
// // 	}

// // 	response_writer.Header().Set("Content-Type", "application/json")
// // 	if err := json.NewEncoder(response_writer).Encode(response_data); err != nil {
// // 		log.Printf("virhe vastauksen koodauksessa: %v", err)
// // 		http.Error(response_writer, "virhe vastauksen koodauksessa", http.StatusInternalServerError)
// // 		return
// // 	}
// // }

// // // generateVectorParam hakee openai-embeddingin ja rakentaa pgvector.Vectorin
// // func generateVectorParam(queryText string) (pgvector.Vector, error) {
// // 	openaiKey := os.Getenv("OPENAI_API_KEY")
// // 	if openaiKey == "" {
// // 		return pgvector.Vector{}, fmt.Errorf("missing OPENAI_API_KEY")
// // 	}
// // 	embeddingModel := os.Getenv("OPENAI_EMBEDDING_MODEL")
// // 	if embeddingModel == "" {
// // 		embeddingModel = "text-embedding-ada-002"
// // 	}

// // 	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
// // 	defer cancel()

// // 	client := openai.NewClient(openaiKey)
// // 	embedReq := openai.EmbeddingRequest{
// // 		Model: openai.EmbeddingModel(embeddingModel),
// // 		Input: []string{queryText},
// // 	}
// // 	embedResp, err := client.CreateEmbeddings(ctx, embedReq)
// // 	if err != nil {
// // 		return pgvector.Vector{}, fmt.Errorf("openai embedding error: %w", err)
// // 	}
// // 	if len(embedResp.Data) == 0 {
// // 		return pgvector.Vector{}, fmt.Errorf("embedding returned no data")
// // 	}

// // 	float32Slice := embedResp.Data[0].Embedding
// // 	// Muodostetaan pgvector.Vector suoraan []float32:stä
// // 	vectorVal := pgvector.NewVector(float32Slice)
// // 	return vectorVal, nil
// // }
