// getResults.go
package gt_1_row_read

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"

	backend "easelect/backend/core_components"
	"easelect/backend/core_components/general_tables/gt_2_column_crud/gt_2_column_read"
	"easelect/backend/core_components/general_tables/models"
	"easelect/backend/core_components/general_tables/utils"
	e_sessions "easelect/backend/core_components/sessions"
	"strconv"
	"strings"
	"time"

	"github.com/lib/pq"
)

// get_results_handler_wrapper.go
func GetResultsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	table_name := r.URL.Query().Get("table")
	if table_name == "" {
		http.Error(w, "missing 'table' query parameter", http.StatusBadRequest)
		return
	}

	GetResults(w, r)
}

func GetResults(response_writer http.ResponseWriter, request *http.Request) {
	table_name := request.URL.Query().Get("table")
	if table_name == "" {
		http.Error(response_writer, "Taulun nimi puuttuu", http.StatusBadRequest)
		return
	}

	// 1. Hae user_id sessiosta
	userID, err := GetUserIDFromSession(request)
	if err != nil || userID <= 0 {
		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
		return
	}

	// 2. Haetaan results_per_load ja offset
	var results_per_load_str string
	err = backend.Db.QueryRow("SELECT int_value FROM system_config WHERE key = 'results_load_amount'").Scan(&results_per_load_str)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe konfiguraatiota haettaessa", http.StatusInternalServerError)
		return
	}
	results_per_load, err := strconv.Atoi(results_per_load_str)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe konfiguraation arvossa", http.StatusInternalServerError)
		return
	}

	offset_str := request.URL.Query().Get("offset")
	offset_value := 0
	if offset_str != "" {
		offset_value, err = strconv.Atoi(offset_str)
		if err != nil {
			log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(response_writer, "virhe offset-parametrissa", http.StatusBadRequest)
			return
		}
	}

	// 3. Haetaan käyttäjän sarakeasetukset kyseiselle taululle ja varmennetaan puuttuvat rivit
	userColumnSettings, err := ensureAndFetchUserColumnSettings(userID, table_name)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe sarakeasetuksissa", http.StatusInternalServerError)
		return
	}

	// Tulostetaan sarakeasetukset palvelimen konsoliin
	// log.Printf("User column settings for table '%s': %+v", table_name, userColumnSettings)

	// 4. Haetaan muun datan osalta saraketietoja, tietotyyppejä ym.
	column_data_types, err := getColumnDataTypesWithFK(table_name)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe sarakkeiden tietotyyppien haussa", http.StatusInternalServerError)
		return
	}

	// Haetaan sarakkeet ja liitokset käytettäväksi vain näkyville sarakkeille
	columnsMap, err := gt_2_column_read.GetColumnsMapForTable(table_name)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe sarakkeiden tietojen haussa", http.StatusInternalServerError)
		return
	}

	// Rajataan asetuksista vain näkyvät (is_hidden=false)
	visibleColUids := make([]int, 0)
	for _, cs := range userColumnSettings {
		if cs.IsHidden {
			continue
		}
		for uid, colInfo := range columnsMap {
			if colInfo.ColumnName == cs.ColumnName {
				visibleColUids = append(visibleColUids, uid)
				break
			}
		}
	}

	// Rakennetaan SELECT- ja JOIN-osat näkyville sarakkeille
	selectColumns, joinClauses, columnExpressions, err := buildJoins(table_name, columnsMap, visibleColUids)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe JOIN-liitosten rakentamisessa", http.StatusInternalServerError)
		return
	}

	// Rakennetaan WHERE- ja ORDER BY -ehdot
	where_clause, query_args, err := buildWhereClause(request.URL.Query(), table_name, buildColumnsByName(columnsMap), columnExpressions)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe WHERE-ehdon rakentamisessa", http.StatusInternalServerError)
		return
	}
	order_by_clause, err := buildOrderByClause(request.URL.Query(), table_name, buildColumnsByName(columnsMap), columnExpressions)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe ORDER BY -ehdon rakentamisessa", http.StatusBadRequest)
		return
	}

	// 5. Kootaan lopullinen SQL-kysely
	query := fmt.Sprintf(
		"SELECT %s FROM %s %s%s%s LIMIT %d OFFSET %d",
		selectColumns,
		pq.QuoteIdentifier(table_name),
		joinClauses,
		where_clause,
		order_by_clause,
		results_per_load,
		offset_value,
	)

	rows_result, err := backend.Db.Query(query, query_args...)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe tietoja haettaessa", http.StatusInternalServerError)
		return
	}
	defer rows_result.Close()

	result_columns, err := rows_result.Columns()
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
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
			log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
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
				s := string(typed_val)
				// Rajataan openai_embedding max 500 merkkiin
				if column_name == "openai_embedding" && len(s) > 500 {
					s = s[:500] + "..."
				}
				current_row_result[column_name] = s
			case string:
				s := typed_val
				// Rajataan openai_embedding max 500 merkkiin
				if column_name == "openai_embedding" && len(s) > 500 {
					s = s[:500] + "..."
				}
				current_row_result[column_name] = s
			default:
				current_row_result[column_name] = typed_val
			}
		}
		query_results = append(query_results, current_row_result)
	}
	if err := rows_result.Err(); err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe rivien käsittelyssä (err)", http.StatusInternalServerError)
		return
	}

	response_data := map[string]interface{}{
		"columns":            result_columns,
		"data":               query_results,
		"types":              column_data_types,
		"resultsPerLoad":     results_per_load,
		"userColumnSettings": userColumnSettings,
	}

	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(response_writer).Encode(response_data); err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe vastauksen koodauksessa", http.StatusInternalServerError)
		return
	}
}

// getUserIDFromSession lukee user_id:n Gorilla-sessiosta.
func GetUserIDFromSession(r *http.Request) (int, error) {
	store := e_sessions.GetStore()
	session, err := store.Get(r, "session")
	if err != nil {
		return 0, fmt.Errorf("session get failed: %w", err)
	}
	val, ok := session.Values["user_id"]
	if !ok {
		return 0, fmt.Errorf("user_id puuttuu sessiosta")
	}
	userID, ok2 := val.(int)
	if !ok2 {
		return 0, fmt.Errorf("user_id ei ole int")
	}
	return userID, nil
}

// ensureAndFetchUserColumnSettings hakee käyttäjän sarakeasetukset kyseiselle taululle.
// Jos asetuksia ei löydy user_column_settings -taulusta, palautetaan oletusarvot system_column_details -taulusta.
func ensureAndFetchUserColumnSettings(userID int, tableName string) ([]UserColumnSetting, error) {
	// Yritetään ensin hakea käyttäjäkohtaiset asetukset.
	queryUserSettings := `
        SELECT 
            column_name, 
            sort_order, 
            column_width_px, 
            is_hidden
        FROM user_column_settings
        WHERE user_id = $1
          AND table_name = $2
        ORDER BY sort_order
    `
	rows, err := backend.Db.Query(queryUserSettings, userID, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []UserColumnSetting
	for rows.Next() {
		var ucs UserColumnSetting
		if err := rows.Scan(&ucs.ColumnName, &ucs.SortOrder, &ucs.ColumnWidth, &ucs.IsHidden); err != nil {
			log.Printf("scan virhe user_column_settings: %v", err)
			continue
		}
		results = append(results, ucs)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Jos käyttäjäkohtaisia asetuksia ei ole, käytetään oletusarvoja system_column_details -taulusta.
	if len(results) == 0 {
		queryDefaults := `
            SELECT 
                scd.column_name, 
                scd.co_number AS sort_order, 
                0 AS column_width_px, 
                false AS is_hidden
            FROM system_db_tables sdt
            JOIN system_column_details scd ON scd.table_uid = sdt.table_uid
            WHERE sdt.table_name = $1
            ORDER BY scd.co_number
        `
		rows, err := backend.Db.Query(queryDefaults, tableName)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		for rows.Next() {
			var ucs UserColumnSetting
			if err := rows.Scan(&ucs.ColumnName, &ucs.SortOrder, &ucs.ColumnWidth, &ucs.IsHidden); err != nil {
				log.Printf("scan virhe system_column_details: %v", err)
				continue
			}
			results = append(results, ucs)
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	return results, nil
}

// UserColumnSetting on pieni struct user_column_settings -riville
type UserColumnSetting struct {
	ColumnName  string `json:"column_name"`
	SortOrder   int    `json:"sort_order"`
	ColumnWidth int    `json:"column_width_px"`
	IsHidden    bool   `json:"is_hidden"`
}

// buildColumnsByName on apufunktio, joka luo "colName -> ColumnInfo"
func buildColumnsByName(colsMap map[int]models.ColumnInfo) map[string]models.ColumnInfo {
	byName := make(map[string]models.ColumnInfo)
	for _, ci := range colsMap {
		byName[ci.ColumnName] = ci
	}
	return byName
}

func getColumnDataTypesWithFK(tableName string) (map[string]interface{}, error) {
	// fmt.Printf("\033[36m[getColumnDataTypesWithFK] haetaan taulun '%s' sarake- ja fk-tiedot...\033[0m\n", tableName)

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
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return nil, fmt.Errorf("getColumnDataTypesWithFK: %v", err)
	}
	defer rows.Close()

	data_types := make(map[string]interface{})

	for rows.Next() {
		var columnName, dataType string
		var foreignTableName, foreignColumnName sql.NullString
		var cardElement string
		var showKeyOnCard bool

		if err := rows.Scan(&columnName, &dataType, &foreignTableName, &foreignColumnName, &cardElement, &showKeyOnCard); err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			return nil, fmt.Errorf("getColumnDataTypesWithFK: %v", err)
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

		// Lisätään pieni loki tämän sarakkeen tiedoista
		// fmt.Printf("  - Sarake '%s' -> %+v\n", columnName, columnInfo)
		data_types[columnName] = columnInfo
	}

	if err := rows.Err(); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return nil, fmt.Errorf("getColumnDataTypesWithFK, rows error: %v", err)
	}

	fmt.Printf("\033[36m[getColumnDataTypesWithFK] taulun '%s' saraketiedot ladattu onnistuneesti.\033[0m\n", tableName)
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

	for param, values := range queryParams {
		// ohitetaan tietyt parametrit
		if param == "table" || param == "sort_column" || param == "sort_order" {
			continue
		}
		if len(values) == 0 {
			continue
		}

		// Käytetään vain ensimmäistä param-arvoa
		rawValue := values[0]

		// Selvitetään, mikä sarake tai expression vastaa 'param'-nimistä kenttää
		columnName := ""
		if expr, ok := columnExpressions[param]; ok {
			columnName = expr
		} else if _, exists := columnsByName[param]; exists {
			columnName = fmt.Sprintf("%s.%s",
				pq.QuoteIdentifier(tableName),
				pq.QuoteIdentifier(param))
		} else {
			// Tuntematon parametri => ohitetaan
			continue
		}

		// 1) Parsitaan syöte => tokenit
		tokens := parseAdvancedSearch(rawValue)
		if len(tokens) == 0 {
			// ei ehtoa
			continue
		}

		// 2) Muodostetaan ehto tälle sarakkeelle
		condition, condArgs, nextArgIdx := buildConditionForTokens(columnName, tokens, argIdx)
		if condition != "" {
			whereClauses = append(whereClauses, condition)
			args = append(args, condArgs...)
			argIdx = nextArgIdx
		}
	}

	// Lopuksi liitetään kaikki "parametriehdot" AND-operaattorilla keskenään
	whereClause := ""
	if len(whereClauses) > 0 {
		whereClause = " WHERE " + strings.Join(whereClauses, " AND ")
	}

	return whereClause, args, nil
}

// buildConditionForTokens rakentaa yhdelle sarakkeelle (columnName)
// SQL-ehtolauseen annettujen tokenien perusteella.
//
// argIndex on bind-parametrien laskuri (esim. $1, $2, ...).
// Palauttaa:
//   - ehto (string)
//   - bind-arvot ([]interface{})
//   - uusi argIndex

// buildConditionForTokens rakentaa yhdelle sarakkeelle (columnName)
// SQL-ehtolauseen annettujen tokenien perusteella.
func buildConditionForTokens(
	columnName string,
	tokens []Token,
	argIndex int,
) (string, []interface{}, int) {

	var exprParts []string
	var args []interface{}

	// Oletusarvoinen looginen operaattori (jos ei AND tai OR ole annettu)
	currentOp := "AND"

	for _, t := range tokens {
		switch t.Type {
		case TokenAnd:
			currentOp = "AND"

		case TokenOr:
			currentOp = "OR"

		case TokenAll:
			// TokenAll = "*" => “kaikki” => laitetaan vain (TRUE)
			exprParts = append(exprParts, currentOp, "TRUE")

		case TokenExclude:
			if t.Value == "" {
				// != "" => sarake ei saa olla NULL eikä tyhjä
				expr := fmt.Sprintf("(%s IS NOT NULL AND %s <> '')", columnName, columnName)
				exprParts = append(exprParts, currentOp, expr)
			} else {
				// Esim. != "k*rhu" => korvataan * -> %
				v := strings.ReplaceAll(t.Value, "*", "%")

				// col NOT ILIKE '%k%rhu%'
				expr := fmt.Sprintf("%s::text NOT ILIKE $%d", columnName, argIndex)
				exprParts = append(exprParts, currentOp, expr)
				args = append(args, "%"+v+"%")
				argIndex++
			}

		case TokenInclude:
			if t.Value == "" {
				// "" => sarake on NULL TAI ''
				expr := fmt.Sprintf("(%s IS NULL OR %s = '')", columnName, columnName)
				exprParts = append(exprParts, currentOp, expr)
			} else {
				// Esim. k*rhu => k%rhu
				v := strings.ReplaceAll(t.Value, "*", "%")

				// col ILIKE '%k%rhu%'
				expr := fmt.Sprintf("%s::text ILIKE $%d", columnName, argIndex)
				exprParts = append(exprParts, currentOp, expr)
				args = append(args, "%"+v+"%")
				argIndex++
			}
		}
	}

	// Käsitellään, jos exprParts on tyhjä
	if len(exprParts) == 0 {
		// Ei ehtoja
		return "", nil, argIndex
	}

	// Jos eka osa on AND/OR, poistetaan se
	if exprParts[0] == "AND" || exprParts[0] == "OR" {
		exprParts = exprParts[1:]
	}

	// Muodostetaan lopullinen ehto
	finalExpr := "(" + strings.Join(exprParts, " ") + ")"

	return finalExpr, args, argIndex
}
