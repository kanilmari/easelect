// getResults.go
package gt_read

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"rapsa/backend"

	"rapsa/backend/general_tables/models"
	"rapsa/backend/general_tables/utils"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/lib/pq"
)

func GetResults(response_writer http.ResponseWriter, request *http.Request) {
	table_name := request.URL.Query().Get("table")
	if table_name == "" {
		http.Error(response_writer, "Taulun nimi puuttuu", http.StatusBadRequest)
		return
	}

	var results_per_load_str string
	err := backend.Db.QueryRow("SELECT value FROM system_config WHERE key = 'results_load_amount'").Scan(&results_per_load_str)
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

	column_uids, columns_map, err := getOrderedColumns(table_name)
	if err != nil {
		log.Printf("virhe sarakkeiden haussa: %v", err)
		http.Error(response_writer, "virhe sarakkeiden haussa", http.StatusInternalServerError)
		return
	}

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

	select_columns, join_clauses, column_expressions, err := buildJoins(table_name, columns_map, column_uids)
	if err != nil {
		log.Printf("virhe JOIN-liitosten rakentamisessa: %v", err)
		http.Error(response_writer, "virhe JOIN-liitosten rakentamisessa", http.StatusInternalServerError)
		return
	}

	where_clause, query_args, err := buildWhereClause(request.URL.Query(), table_name, columns_by_name, column_expressions)
	if err != nil {
		log.Printf("virhe WHERE-ehdon rakentamisessa: %v", err)
		http.Error(response_writer, "virhe WHERE-ehdon rakentamisessa", http.StatusInternalServerError)
		return
	}

	order_by_clause, err := buildOrderByClause(request.URL.Query(), table_name, columns_by_name, column_expressions)
	if err != nil {
		log.Printf("virhe ORDER BY -ehdon rakentamisessa: %v", err)
		http.Error(response_writer, "virhe ORDER BY -ehdon rakentamisessa", http.StatusBadRequest)
		return
	}

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

	// Tulostetaan lopullinen SQL-kysely ja parametriarvot (kehityksen avuksi)
	// log.Printf("sql-kysely: %s", query) // säilytetään kommentoituna
	log.Printf("parametrit (args): %v", query_args)

	rows_result, err := backend.Db.Query(query, query_args...)
	if err != nil {
		log.Printf("virhe suoritettaessa kyselyä: %v", err)
		http.Error(response_writer, "virhe tietoja haettaessa", http.StatusInternalServerError)
		return
	}
	defer rows_result.Close()

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
				// Muotoillaan haluttuun formaattiin
				formatted_time := typed_val.Format("2006-01-02 15:04:05")
				current_row_result[column_name] = formatted_time
			case []byte:
				current_row_result[column_name] = string(typed_val)
			default:
				current_row_result[column_name] = typed_val
			}
		}

		//log.Printf("haettu rivi: %+v", current_row_result) // säilytetään kommenttina
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

// Uusi versio: lisätään show_key_on_card sarakkeeseen
func getColumnDataTypesWithFK(tableName string) (map[string]interface{}, error) {
	query := `
        SELECT
            c.column_name,
            c.data_type,
            fk_info.foreign_table_name,
            fk_info.foreign_column_name,
            COALESCE(scd.card_element, '') AS card_element,
            COALESCE(scd.show_key_on_card, false) AS show_key_on_card
        FROM information_schema.columns c
        LEFT JOIN (
            SELECT
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM
                information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_name = $1
              AND tc.table_schema = 'public'
        ) AS fk_info
          ON c.column_name = fk_info.column_name
          AND c.table_name = $1
          AND c.table_schema = 'public'
        LEFT JOIN system_column_details scd
          ON scd.column_name = c.column_name
          AND scd.table_uid = (
               SELECT table_uid
               FROM system_db_tables
               WHERE table_name = $1
          )
        WHERE c.table_name = $1
          AND c.table_schema = 'public'
    `

	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return nil, fmt.Errorf("error selecting columns data: %v", err)
	}
	defer rows.Close()

	data_types := make(map[string]interface{})
	for rows.Next() {
		var columnName, dataType string
		var foreignTableName, foreignColumnName sql.NullString
		var cardElement string
		var showKeyOnCard bool

		err := rows.Scan(
			&columnName,
			&dataType,
			&foreignTableName,
			&foreignColumnName,
			&cardElement,
			&showKeyOnCard,
		)
		if err != nil {
			return nil, fmt.Errorf("error scanning columns data: %v", err)
		}

		columnInfo := map[string]interface{}{
			"data_type":        dataType,
			"card_element":     cardElement,
			"show_key_on_card": showKeyOnCard,
		}
		if foreignTableName.Valid && foreignColumnName.Valid {
			columnInfo["foreign_table"] = foreignTableName.String
			columnInfo["foreign_column"] = foreignColumnName.String
		}

		data_types[columnName] = columnInfo
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error in rows for columns data: %v", err)
	}
	return data_types, nil
}

func buildOrderByClause(queryParams url.Values, tableName string, columnsByName map[string]models.ColumnInfo, columnExpressions map[string]string) (string, error) {
	sortColumn := queryParams.Get("sort_column")
	sortOrder := strings.ToUpper(queryParams.Get("sort_order"))

	if sortColumn == "" {
		return "", nil // Ei lajittelua
	}

	// Oletusjärjestys
	if sortOrder != "ASC" && sortOrder != "DESC" {
		sortOrder = "ASC"
	}

	columnName := ""
	if expr, ok := columnExpressions[sortColumn]; ok {
		// Käytä täysin määriteltyä sarakenimeä
		columnName = expr
	} else if _, exists := columnsByName[sortColumn]; exists {
		// Käytä päätaulun saraketta
		columnName = fmt.Sprintf("%s.%s", pq.QuoteIdentifier(tableName), pq.QuoteIdentifier(sortColumn))
	} else {
		return "", fmt.Errorf("tuntematon lajittelusarake: %s", sortColumn)
	}

	orderByClause := fmt.Sprintf(" ORDER BY %s %s", columnName, sortOrder)
	return orderByClause, nil
}

func getOrderedColumns(tableName string) ([]int, map[int]models.ColumnInfo, error) {
	// Hae table_uid system_db_tables-taulusta
	var tableUID int
	err := backend.Db.QueryRow(`
		SELECT table_uid
		FROM system_db_tables
		WHERE table_name = $1
	`, tableName).Scan(&tableUID)
	if err != nil {
		return nil, nil, fmt.Errorf("error fetching table_uid for table %s: %v", tableName, err)
	}

	// Hae col_display_order system_db_tables-taulusta
	var colDisplayOrderStr sql.NullString
	colDisplayOrderQuery := `SELECT col_display_order FROM system_db_tables WHERE table_uid = $1`
	err = backend.Db.QueryRow(colDisplayOrderQuery, tableUID).Scan(&colDisplayOrderStr)
	if err != nil {
		return nil, nil, fmt.Errorf("virhe col_display_orderin hakemisessa taululle %s: %v", tableName, err)
	}

	var colDisplayOrder []int
	if colDisplayOrderStr.Valid && colDisplayOrderStr.String != "" {
		if err := json.Unmarshal([]byte(colDisplayOrderStr.String), &colDisplayOrder); err != nil {
			log.Printf("Virhe col_display_orderin purkamisessa taululle %s: %v", tableName, err)
			colDisplayOrder = nil
		}
	}

	// Hae kaikki saraketiedot system_column_details-taulusta
	columnsMap, err := GetColumnsMapForTable(tableName)
	if err != nil {
		return nil, nil, fmt.Errorf("virhe saraketietojen haussa taululle %s: %v", tableName, err)
	}

	// Määritä sarakkeiden järjestys
	var columnUids []int
	if len(colDisplayOrder) > 0 {
		for _, colUid := range colDisplayOrder {
			if _, exists := columnsMap[colUid]; exists {
				columnUids = append(columnUids, colUid)
			} else {
				log.Printf("Saraketta column_uid %d ei löydy taulusta %s", colUid, tableName)
			}
		}
		// Lisää mahdolliset uudet sarakkeet
		for colUid := range columnsMap {
			if !containsInt(columnUids, colUid) {
				columnUids = append(columnUids, colUid)
			}
		}
	} else {
		// Oletusjärjestys
		attnumToColUid := make([]struct {
			Attnum    int
			ColumnUid int
		}, 0, len(columnsMap))
		for colUid, colInfo := range columnsMap {
			attnumToColUid = append(attnumToColUid, struct {
				Attnum    int
				ColumnUid int
			}{
				Attnum:    colInfo.Attnum,
				ColumnUid: colUid,
			})
		}
		sort.Slice(attnumToColUid, func(i, j int) bool {
			return attnumToColUid[i].Attnum < attnumToColUid[j].Attnum
		})
		for _, item := range attnumToColUid {
			columnUids = append(columnUids, item.ColumnUid)
		}
	}

	return columnUids, columnsMap, nil
}

// Helper function to check if an int exists in a slice
func containsInt(slice []int, value int) bool {
	for _, v := range slice {
		if v == value {
			return true
		}
	}
	return false
}

func buildJoins(tableName string, columnsMap map[int]models.ColumnInfo, columnUids []int) (string, string, map[string]string, error) {
	foreignKeys, err := utils.GetForeignKeysForTable(tableName)
	if err != nil {
		return "", "", nil, err
	}

	selectColumns := ""
	joinClauses := ""
	aliasCount := make(map[string]int)
	columnExpressions := make(map[string]string)

	for _, colUid := range columnUids {
		col, exists := columnsMap[colUid]
		if !exists {
			return "", "", nil, fmt.Errorf("saraketta column_uid %d ei löydy taulusta %s", colUid, tableName)
		}
		colName := col.ColumnName

		if fk, ok := foreignKeys[colName]; ok && fk.NameColumn != "" {
			aliasCount[colName]++
			alias := fmt.Sprintf("%s_alias%d", colName, aliasCount[colName])

			var generatedColumnName string
			if strings.HasSuffix(colName, "_id") {
				generatedColumnName = strings.TrimSuffix(colName, "_id") + "_name (ln)"
			} else if strings.HasSuffix(colName, "_uid") {
				generatedColumnName = strings.TrimSuffix(colName, "_uid") + "_name (ln)"
			} else {
				generatedColumnName = colName + "_name"
			}

			fullyQualifiedColumnName := fmt.Sprintf("%s.%s", pq.QuoteIdentifier(alias), pq.QuoteIdentifier(fk.NameColumn))
			columnExpressions[generatedColumnName] = fullyQualifiedColumnName

			selectColumns += fmt.Sprintf("%s.%s AS %s, %s.%s AS \"%s\", ",
				pq.QuoteIdentifier(tableName),
				pq.QuoteIdentifier(colName),
				pq.QuoteIdentifier(colName),
				pq.QuoteIdentifier(alias),
				pq.QuoteIdentifier(fk.NameColumn),
				generatedColumnName)

			joinClauses += fmt.Sprintf("LEFT JOIN %s AS %s ON %s.%s = %s.%s ",
				pq.QuoteIdentifier(fk.ReferencedTable),
				pq.QuoteIdentifier(alias),
				pq.QuoteIdentifier(tableName),
				pq.QuoteIdentifier(colName),
				pq.QuoteIdentifier(alias),
				pq.QuoteIdentifier(fk.ReferencedColumn))
		} else {
			selectColumns += fmt.Sprintf("%s.%s AS %s, ",
				pq.QuoteIdentifier(tableName),
				pq.QuoteIdentifier(colName),
				pq.QuoteIdentifier(colName))
			columnExpressions[colName] = fmt.Sprintf("%s.%s", pq.QuoteIdentifier(tableName), pq.QuoteIdentifier(colName))
		}
	}
	selectColumns = strings.TrimRight(selectColumns, ", ")

	return selectColumns, joinClauses, columnExpressions, nil
}

func buildWhereClause(
	queryParams url.Values,
	tableName string,
	columnsByName map[string]models.ColumnInfo,
	columnExpressions map[string]string,
) (string, []interface{}, error) {

	var whereClauses []string
	var args []interface{}
	argIdx := 1

	// Käydään jokainen GET-parametri läpi
	for param, values := range queryParams {
		if param == "table" || param == "sort_column" || param == "sort_order" {
			continue
		}
		if len(values) == 0 {
			continue
		}

		// Oletetaan, että käytät vain ensimmäistä hakumerkkijonoa
		rawValue := values[0]

		// Tarkistetaan, minkä sarakkeen expressionin haluamme
		columnName := ""
		if expr, ok := columnExpressions[param]; ok {
			columnName = expr
		} else if _, exists := columnsByName[param]; exists {
			columnName = fmt.Sprintf("%s.%s", pq.QuoteIdentifier(tableName), pq.QuoteIdentifier(param))
		} else {
			// tuntematon param => ohitetaan
			continue
		}

		// Parsitaan rawValue => excludeWords, includeWords
		excludeWords, includeWords := parseSearchString(rawValue)

		// Rakennetaan NOT ILIKE -ehdot
		for _, exWord := range excludeWords {
			whereClauses = append(whereClauses,
				fmt.Sprintf("%s::text NOT ILIKE $%d", columnName, argIdx))
			args = append(args, "%"+exWord+"%")
			argIdx++
		}

		// Rakennetaan ILIKE -ehdot
		for _, inWord := range includeWords {
			whereClauses = append(whereClauses,
				fmt.Sprintf("%s::text ILIKE $%d", columnName, argIdx))
			args = append(args, "%"+inWord+"%")
			argIdx++
		}
	}

	whereClause := ""
	if len(whereClauses) > 0 {
		// Liitetään AND-logiikalla
		whereClause = " WHERE " + strings.Join(whereClauses, " AND ")
	}

	return whereClause, args, nil
}
