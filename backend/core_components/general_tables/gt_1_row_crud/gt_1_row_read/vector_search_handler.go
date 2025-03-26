// vector_search_handler.go
package gt_1_row_read

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	backend "easelect/backend/core_components"
	"easelect/backend/core_components/general_tables/gt_2_column_crud/gt_2_column_read"
	"easelect/backend/core_components/general_tables/models"

	"strconv"
	"time"

	// pgvector-go kirjaston import
	"github.com/lib/pq"
	pgvector "github.com/pgvector/pgvector-go"
	"github.com/sashabaranov/go-openai"
)

// GetResultsVector on kopio GetResults-funktiosta, mutta tukee vector_query-
// parametria, jolla toteutetaan semanttinen haku (ORDER BY openai_embedding <-> $N).
// HUOM: Emme muuta vanhaa GetResults-funktiota, vaan tämä on rinnakkainen endpoint.
func GetResultsVector(response_writer http.ResponseWriter, request *http.Request) {
	table_name := request.URL.Query().Get("table")
	if table_name == "" {
		http.Error(response_writer, "Taulun nimi puuttuu", http.StatusBadRequest)
		return
	}

	// 1) Haetaan results_load_amount
	var results_per_load_str string
	err := backend.Db.QueryRow("SELECT json_value FROM system_config WHERE key = 'results_load_amount'").Scan(&results_per_load_str)
	if err != nil {
		log.Printf("virhe haettaessa results_load_amount: %v", err)
		http.Error(response_writer, "virhe konfiguraatiota haettaessa", http.StatusInternalServerError)
		return
	}
	results_per_load, err := strconv.Atoi(results_per_load_str)
	if err != nil {
		log.Printf("virhe muunnettaessa results_load_amount kokonaisluvuksi: %v", err)
		http.Error(response_writer, "virhe konfiguraation arvossa", http.StatusInternalServerError)
		return
	}

	// 2) offset
	offset_str := request.URL.Query().Get("offset")
	offset_value := 0
	if offset_str != "" {
		offset_value, err = strconv.Atoi(offset_str)
		if err != nil {
			log.Printf("virhe muunnettaessa offset kokonaisluvuksi: %v", err)
			http.Error(response_writer, "virhe offset-parametrissa", http.StatusBadRequest)
			return
		}
	}

	// --- POISTETTU getOrderedColumns ---

	// Haetaan saraketiedot suoraan ilman getOrderedColumns
	// Käytetään omaa "GetColumnsMapForTable"-funktiota tms.
	columns_map, err := gt_2_column_read.GetColumnsMapForTable(table_name)
	if err != nil {
		log.Printf("virhe sarakkeiden haussa: %v", err)
		http.Error(response_writer, "virhe sarakkeiden haussa", http.StatusInternalServerError)
		return
	}

	// Jos buildJoins vaatii column_uids-listan, luodaan se yksinkertaisesti:
	column_uids := make([]int, 0, len(columns_map))
	for uid := range columns_map {
		column_uids = append(column_uids, uid)
	}

	// Haetaan sarakkeiden tietotyypit (kuten aiemmin)
	column_data_types, err := getColumnDataTypesWithFK(table_name)
	if err != nil {
		log.Printf("virhe sarakkeiden tietotyyppien haussa: %v", err)
		http.Error(response_writer, "virhe sarakkeiden tietotyyppien haussa", http.StatusInternalServerError)
		return
	}

	columns_by_name := make(map[string]models.ColumnInfo)
	for _, column_info := range columns_map {
		columns_by_name[column_info.ColumnName] = column_info
	}

	// Rakennetaan SELECT- ja JOIN-lauseet (kuten ennen)
	select_columns, join_clauses, column_expressions, err := buildJoins(table_name, columns_map, column_uids)
	if err != nil {
		log.Printf("virhe JOIN-liitosten rakentamisessa: %v", err)
		http.Error(response_writer, "virhe JOIN-liitosten rakentamisessa", http.StatusInternalServerError)
		return
	}

	// 4) WHERE-filtterit
	where_clause, query_args, err := buildWhereClause(request.URL.Query(), table_name, columns_by_name, column_expressions)
	if err != nil {
		log.Printf("virhe WHERE-ehdon rakentamisessa: %v", err)
		http.Error(response_writer, "virhe WHERE-ehdon rakentamisessa", http.StatusInternalServerError)
		return
	}

	// 5) Normaali ORDER BY
	order_by_clause, err := buildOrderByClause(request.URL.Query(), table_name, columns_by_name, column_expressions)
	if err != nil {
		log.Printf("virhe ORDER BY -ehdon rakentamisessa: %v", err)
		http.Error(response_writer, "virhe ORDER BY -ehdon rakentamisessa", http.StatusBadRequest)
		return
	}

	// 6) Tarkistetaan semanttisen haun parametri (vector_query=...)
	vector_query := request.URL.Query().Get("vector_query")
	if vector_query != "" {
		log.Printf("[DEBUG] semanttinen haku param: %s", vector_query)

		// Luodaan embedding
		vectorVal, embErr := generateVectorParam(vector_query)
		if embErr != nil {
			log.Printf("virhe generateVectorParam: %v", embErr)
			http.Error(response_writer, fmt.Sprintf("virhe generateVectorParam: %v", embErr), http.StatusInternalServerError)
			return
		}

		// Lisätään parametri query_args:iin
		query_args = append(query_args, vectorVal)
		paramIndex := len(query_args)

		// Ylikirjoitetaan order_by_clause: ORDER BY openai_embedding <-> $N
		order_by_clause = fmt.Sprintf(" ORDER BY %s.openai_embedding <-> $%d",
			pq.QuoteIdentifier(table_name),
			paramIndex,
		)
	}

	// 7) Koostetaan lopullinen SQL-kysely
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

	rows_result, err := backend.Db.Query(query, query_args...)
	if err != nil {
		log.Printf("virhe suoritettaessa kyselyä: %v", err)
		http.Error(response_writer, "virhe tietoja haettaessa", http.StatusInternalServerError)
		return
	}
	defer rows_result.Close()

	// 8) Luetaan tulokset ja muotoillaan JSON kuten GetResults
	result_columns, err := rows_result.Columns()
	if err != nil {
		log.Printf("virhe sarakkeiden haussa tuloksesta: %v", err)
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
			log.Printf("virhe rivien käsittelyssä: %v", err)
			http.Error(response_writer, "virhe rivien käsittelyssä", http.StatusInternalServerError)
			return
		}

		current_row_result := make(map[string]interface{})
		for i, column_name := range result_columns {
			val := row_values[i]
			switch typed_val := val.(type) {
			case time.Time:
				formatted_time := typed_val.Format("2006-01-02 15:04:05")
				current_row_result[column_name] = formatted_time
			case []byte:
				current_row_result[column_name] = string(typed_val)
			default:
				current_row_result[column_name] = typed_val
			}
		}
		query_results = append(query_results, current_row_result)
	}

	response_data := map[string]interface{}{
		"columns":        result_columns,
		"data":           query_results,
		"types":          column_data_types,
		"resultsPerLoad": results_per_load,
	}

	response_writer.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(response_writer).Encode(response_data); err != nil {
		log.Printf("virhe vastauksen koodauksessa: %v", err)
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
	// Muodostetaan pgvector.Vector suoraan []float32:stä
	vectorVal := pgvector.NewVector(float32Slice)
	return vectorVal, nil
}
