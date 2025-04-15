// file: getResults.go
package gt_1_row_read

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/lib/pq"

	backend "easelect/backend/core_components"
	"easelect/backend/core_components/general_tables/gt_2_column_crud/gt_2_column_read"
	"easelect/backend/core_components/general_tables/models"
	e_sessions "easelect/backend/core_components/sessions"
)

// GetResultsHandlerWrapper ...
func GetResultsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	table_name := r.URL.Query().Get("list")
	if table_name == "" {
		http.Error(w, "missing 'list' query parameter", http.StatusBadRequest)
		return
	}
	GetResults(w, r)
}

func GetResults(response_writer http.ResponseWriter, request *http.Request) {
	table_name := request.URL.Query().Get("list")
	if table_name == "" {
		http.Error(response_writer, "Taulun nimi puuttuu", http.StatusBadRequest)
		return
	}

	// 1. Hae user_id sessiosta
	userID, err := e_sessions.GetUserIDFromSession(request)
	if err != nil || userID <= 0 {
		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
		return
	}

	// 1b. Hae myös user_role sessiosta, valitse oikea DB.
	session, sessErr := e_sessions.GetStore().Get(request, "session")
	if sessErr != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", sessErr.Error())
		http.Error(response_writer, "virhe session haussa", http.StatusInternalServerError)
		return
	}

	userRole, _ := session.Values["user_role"].(string)
	if userRole == "" {
		userRole = "guest"
	}

	// Esimerkkikartta roolin ja DB-yhteyden valintaan
	roleDbMapping := map[string]*sql.DB{
		"admin": backend.DbAdmin,
		"basic": backend.DbBasic,
		"guest": backend.DbGuest,
	}
	currentDb, found := roleDbMapping[userRole]
	if !found {
		currentDb = roleDbMapping["guest"]
	}

	// 2. Haetaan results_per_load ...
	var results_per_load_str string
	err = currentDb.QueryRow(
		"SELECT int_value FROM system_config WHERE key = 'results_load_amount'",
	).Scan(&results_per_load_str)
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

	// 3. Haetaan käyttäjän sarakeasetukset
	userColumnSettings, err := ensureAndFetchUserColumnSettings(userID, table_name, currentDb)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe sarakeasetuksissa", http.StatusInternalServerError)
		return
	}

	// 3b. Haetaan sarakkeet, joihin roolilla on SELECT-oikeus
	allowedColumns, err := fetchUserSelectableColumns(currentDb, table_name)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe sarakeoikeuksien haussa", http.StatusInternalServerError)
		return
	}
	allowedColumnsMap := make(map[string]bool, len(allowedColumns))
	for _, ac := range allowedColumns {
		allowedColumnsMap[ac] = true
	}

	// 4. Haetaan muun datan osalta saraketietoja
	column_data_types, err := getColumnDataTypesWithFK(table_name, currentDb)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe sarakkeiden tietotyyppien haussa", http.StatusInternalServerError)
		return
	}

	columnsMap, err := gt_2_column_read.GetColumnsMapForTable(table_name)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe sarakkeiden tietojen haussa", http.StatusInternalServerError)
		return
	}

	visibleColUids := make([]int, 0)
	for _, cs := range userColumnSettings {
		if cs.IsHidden {
			continue
		}
		if !allowedColumnsMap[cs.ColumnName] {
			continue
		}
		for uid, colInfo := range columnsMap {
			if colInfo.ColumnName == cs.ColumnName {
				visibleColUids = append(visibleColUids, uid)
				break
			}
		}
	}

	// 5. Rakennetaan SELECT- ja JOIN-osat
	selectColumns, joinClauses, columnExpressions, err := buildJoinsWith1MRelations(
		currentDb,
		table_name,
		columnsMap,
		visibleColUids,
	)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe JOIN-liitosten rakentamisessa", http.StatusInternalServerError)
		return
	}

	// Rakennetaan WHERE- ja ORDER BY -ehdot
	where_clause, query_args, err := buildWhereClause(
		request.URL.Query(),
		table_name,
		buildColumnsByName(columnsMap),
		columnExpressions,
	)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe WHERE-ehdon rakentamisessa", http.StatusInternalServerError)
		return
	}

	order_by_clause, err := buildOrderByClause(
		request.URL.Query(),
		table_name,
		buildColumnsByName(columnsMap),
		columnExpressions,
	)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe ORDER BY -ehdon rakentamisessa", http.StatusBadRequest)
		return
	}

	// 5b. Haetaan must_be_true -sarakkeet ja lisätään ne suodattimeen, jos ei admin
	mustTrueCols, err := getMustBeTrueColumns(currentDb, table_name)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe must_be_true -sarakehaussa", http.StatusInternalServerError)
		return
	}
	if userRole != "admin" {
		for _, c := range mustTrueCols {
			extraCond := fmt.Sprintf("%s.%s = TRUE", pq.QuoteIdentifier(table_name), pq.QuoteIdentifier(c))
			if where_clause == "" {
				where_clause = " WHERE " + extraCond
			} else {
				where_clause += " AND " + extraCond
			}
		}
	}

	// 6. Kootaan lopullinen SQL-kysely
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

	rows_result, err := currentDb.Query(query, query_args...)
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
				if column_name == "openai_embedding" && len(s) > 500 {
					s = s[:500] + "..."
				}
				current_row_result[column_name] = s
			case string:
				s := typed_val
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

	// Kootaan vastaus
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

// fetchUserSelectableColumns hakee sarakkeet, joihin CURRENT_USER:lla on SELECT-oikeus.
func fetchUserSelectableColumns(db *sql.DB, tableName string) ([]string, error) {
	query := `
		SELECT column_name
		FROM information_schema.column_privileges
		WHERE table_name = $1
		  AND privilege_type = 'SELECT'
		  AND grantee = current_user
	`
	rows, err := db.Query(query, tableName)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return nil, err
	}
	defer rows.Close()

	var columns []string
	for rows.Next() {
		var colName string
		if err := rows.Scan(&colName); err != nil {
			log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			continue
		}
		columns = append(columns, colName)
	}
	if err := rows.Err(); err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return nil, err
	}
	return columns, nil
}

// ensureAndFetchUserColumnSettings hakee käyttäjän sarakeasetukset
func ensureAndFetchUserColumnSettings(userID int, tableName string, db *sql.DB) ([]UserColumnSetting, error) {
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
	rows, err := db.Query(queryUserSettings, userID, tableName)
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
		rows, err := db.Query(queryDefaults, tableName)
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

// getColumnDataTypesWithFK hakee sarakkeen data_type sekä FK-tiedot (jos niitä on).
func getColumnDataTypesWithFK(tableName string, db *sql.DB) (map[string]interface{}, error) {
	query := `
        SELECT
            c.column_name,
            c.data_type,
            fk_info.foreign_table_name,
            fk_info.foreign_column_name,
            COALESCE(scd.card_element, '') AS card_element,
            COALESCE(scd.show_key_on_card, false)  AS show_key_on_card,
            COALESCE(scd.show_value_on_card, false) AS show_value_on_card
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
	rows, err := db.Query(query, tableName)
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
		var showKeyOnCard, showValueOnCard bool

		if err := rows.Scan(
			&columnName,
			&dataType,
			&foreignTableName,
			&foreignColumnName,
			&cardElement,
			&showKeyOnCard,
			&showValueOnCard,
		); err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			return nil, fmt.Errorf("getColumnDataTypesWithFK: %v", err)
		}

		columnInfo := map[string]interface{}{
			"data_type":          dataType,
			"card_element":       cardElement,
			"show_key_on_card":   showKeyOnCard,
			"show_value_on_card": showValueOnCard,
		}
		if foreignTableName.Valid && foreignColumnName.Valid {
			columnInfo["foreign_table"] = foreignTableName.String
			columnInfo["foreign_column"] = foreignColumnName.String
		}

		data_types[columnName] = columnInfo
	}
	if err := rows.Err(); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return nil, fmt.Errorf("getColumnDataTypesWithFK, rows error: %v", err)
	}

	fmt.Printf("\033[36m[getColumnDataTypesWithFK] taulun '%s' saraketiedot ladattu onnistuneesti.\033[0m\n", tableName)
	return data_types, nil
}

// buildColumnsByName on apufunktio, joka luo "colName -> ColumnInfo"
func buildColumnsByName(colsMap map[int]models.ColumnInfo) map[string]models.ColumnInfo {
	byName := make(map[string]models.ColumnInfo)
	for _, ci := range colsMap {
		byName[ci.ColumnName] = ci
	}
	return byName
}

// buildWhereClause kerää URL-parametrit => ehdot (ILIKE, jne.)
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
		if param == "list" || param == "sort_column" || param == "sort_order" || param == "offset" {
			continue
		}
		if len(values) == 0 {
			continue
		}

		rawValue := values[0]
		columnName := ""
		if expr, ok := columnExpressions[param]; ok {
			columnName = expr
		} else if _, exists := columnsByName[param]; exists {
			columnName = fmt.Sprintf("%s.%s", pq.QuoteIdentifier(tableName), pq.QuoteIdentifier(param))
		} else {
			continue
		}

		tokens := parseAdvancedSearch(rawValue)
		if len(tokens) == 0 {
			continue
		}

		condition, condArgs, nextArgIdx := buildConditionForTokens(columnName, tokens, argIdx)
		if condition != "" {
			whereClauses = append(whereClauses, condition)
			args = append(args, condArgs...)
			argIdx = nextArgIdx
		}
	}

	whereClause := ""
	if len(whereClauses) > 0 {
		whereClause = " WHERE " + strings.Join(whereClauses, " AND ")
	}
	return whereClause, args, nil
}

// buildOrderByClause hakee sort_column ja sort_order -parametrit.
func buildOrderByClause(
	queryParams url.Values,
	tableName string,
	columnsByName map[string]models.ColumnInfo,
	columnExpressions map[string]string,
) (string, error) {

	sortColumn := queryParams.Get("sort_column")
	sortOrder := strings.ToUpper(queryParams.Get("sort_order"))

	if sortColumn == "" {
		return "", nil
	}
	if sortOrder != "ASC" && sortOrder != "DESC" {
		sortOrder = "ASC"
	}

	var columnName string
	if expr, ok := columnExpressions[sortColumn]; ok {
		columnName = expr
	} else if _, exists := columnsByName[sortColumn]; exists {
		columnName = fmt.Sprintf("%s.%s", pq.QuoteIdentifier(tableName), pq.QuoteIdentifier(sortColumn))
	} else {
		return "", fmt.Errorf("tuntematon lajittelusarake: %s", sortColumn)
	}

	orderByClause := fmt.Sprintf(" ORDER BY %s %s", columnName, sortOrder)
	return orderByClause, nil
}

// buildConditionForTokens rakentaa ehdon annetuista hakutokeneista (ILIKE, NOT ILIKE, jne.)
func buildConditionForTokens(
	columnName string,
	tokens []Token,
	argIndex int,
) (string, []interface{}, int) {

	var exprParts []string
	var args []interface{}
	currentOp := "AND"

	for _, t := range tokens {
		switch t.Type {
		case TokenAnd:
			currentOp = "AND"
		case TokenOr:
			currentOp = "OR"
		case TokenAll:
			exprParts = append(exprParts, currentOp, "TRUE")
		case TokenExclude:
			if t.Value == "" {
				expr := fmt.Sprintf("(%s IS NOT NULL AND %s <> '')", columnName, columnName)
				exprParts = append(exprParts, currentOp, expr)
			} else {
				v := strings.ReplaceAll(t.Value, "*", "%")
				expr := fmt.Sprintf("%s::text NOT ILIKE $%d", columnName, argIndex)
				exprParts = append(exprParts, currentOp, expr)
				args = append(args, "%"+v+"%")
				argIndex++
			}
		case TokenInclude:
			if t.Value == "" {
				expr := fmt.Sprintf("(%s IS NULL OR %s = '')", columnName, columnName)
				exprParts = append(exprParts, currentOp, expr)
			} else {
				v := strings.ReplaceAll(t.Value, "*", "%")
				expr := fmt.Sprintf("%s::text ILIKE $%d", columnName, argIndex)
				exprParts = append(exprParts, currentOp, expr)
				args = append(args, "%"+v+"%")
				argIndex++
			}
		}
	}

	if len(exprParts) == 0 {
		return "", nil, argIndex
	}
	if exprParts[0] == "AND" || exprParts[0] == "OR" {
		exprParts = exprParts[1:]
	}
	finalExpr := "(" + strings.Join(exprParts, " ") + ")"
	return finalExpr, args, argIndex
}

// getMustBeTrueColumns hakee sarakkeet, joilla must_be_true = true.
// Niiden täytyy olla arvoltaan TRUE, jos rooli ei ole admin.
func getMustBeTrueColumns(db *sql.DB, tableName string) ([]string, error) {
	fmt.Printf("\033[36m[getMustBeTrueColumns] taulun '%s' tietoja haetaan.\033[0m\n", tableName)
	query := `
        SELECT scd.column_name
        FROM system_db_tables sdt
        JOIN system_column_details scd ON sdt.table_uid = scd.table_uid
        WHERE sdt.table_name = $1
          AND scd.must_be_true = true
    `
	rows, err := db.Query(query, tableName)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return nil, err
	}
	defer rows.Close()

	var mustTrueCols []string
	for rows.Next() {
		var colName string
		if err := rows.Scan(&colName); err != nil {
			log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			continue
		}
		mustTrueCols = append(mustTrueCols, colName)
	}
	if err := rows.Err(); err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return nil, err
	}
	return mustTrueCols, nil
}

// // file: getResults.go
// package gt_1_row_read

// import (
// 	"database/sql"
// 	"encoding/json"
// 	"fmt"
// 	"log"
// 	"net/http"
// 	"net/url"
// 	"strconv"
// 	"strings"
// 	"time"

// 	"github.com/lib/pq"

// 	backend "easelect/backend/core_components"
// 	"easelect/backend/core_components/general_tables/gt_2_column_crud/gt_2_column_read"
// 	"easelect/backend/core_components/general_tables/models"
// 	e_sessions "easelect/backend/core_components/sessions"
// )

// // GetResultsHandlerWrapper ...
// func GetResultsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// 	table_name := r.URL.Query().Get("list")
// 	if table_name == "" {
// 		http.Error(w, "missing 'list' query parameter", http.StatusBadRequest)
// 		return
// 	}
// 	GetResults(w, r)
// }

// func GetResults(response_writer http.ResponseWriter, request *http.Request) {
// 	table_name := request.URL.Query().Get("list")
// 	if table_name == "" {
// 		http.Error(response_writer, "Taulun nimi puuttuu", http.StatusBadRequest)
// 		return
// 	}

// 	// 1. Hae user_id sessiosta
// 	userID, err := e_sessions.GetUserIDFromSession(request)
// 	if err != nil || userID <= 0 {
// 		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
// 		return
// 	}

// 	// 1b. Hae myös user_role sessiosta, valitse oikea DB.
// 	session, sessErr := e_sessions.GetStore().Get(request, "session")
// 	if sessErr != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", sessErr.Error())
// 		http.Error(response_writer, "virhe session haussa", http.StatusInternalServerError)
// 		return
// 	}

// 	userRole, _ := session.Values["user_role"].(string)
// 	if userRole == "" {
// 		userRole = "guest"
// 	}

// 	// Esimerkkikartta roolin ja DB-yhteyden valintaan
// 	roleDbMapping := map[string]*sql.DB{
// 		"admin": backend.DbAdmin,
// 		"basic": backend.DbBasic,
// 		"guest": backend.DbGuest,
// 	}
// 	currentDb, found := roleDbMapping[userRole]
// 	if !found {
// 		currentDb = roleDbMapping["guest"]
// 	}

// 	// 2. Haetaan results_per_load ...
// 	var results_per_load_str string
// 	err = currentDb.QueryRow(
// 		"SELECT int_value FROM system_config WHERE key = 'results_load_amount'",
// 	).Scan(&results_per_load_str)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe konfiguraatiota haettaessa", http.StatusInternalServerError)
// 		return
// 	}
// 	results_per_load, err := strconv.Atoi(results_per_load_str)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe konfiguraation arvossa", http.StatusInternalServerError)
// 		return
// 	}

// 	offset_str := request.URL.Query().Get("offset")
// 	offset_value := 0
// 	if offset_str != "" {
// 		offset_value, err = strconv.Atoi(offset_str)
// 		if err != nil {
// 			log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 			http.Error(response_writer, "virhe offset-parametrissa", http.StatusBadRequest)
// 			return
// 		}
// 	}

// 	// 3. Haetaan käyttäjän sarakeasetukset
// 	userColumnSettings, err := ensureAndFetchUserColumnSettings(userID, table_name, currentDb)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe sarakeasetuksissa", http.StatusInternalServerError)
// 		return
// 	}

// 	// 3b. Haetaan sarakkeet, joihin roolilla on SELECT-oikeus
// 	allowedColumns, err := fetchUserSelectableColumns(currentDb, table_name)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe sarakeoikeuksien haussa", http.StatusInternalServerError)
// 		return
// 	}
// 	// Luodaan set-tyyppinen map nopeaan tarkistukseen
// 	allowedColumnsMap := make(map[string]bool, len(allowedColumns))
// 	for _, ac := range allowedColumns {
// 		allowedColumnsMap[ac] = true
// 	}

// 	// 4. Haetaan muun datan osalta saraketietoja
// 	column_data_types, err := getColumnDataTypesWithFK(table_name, currentDb)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe sarakkeiden tietotyyppien haussa", http.StatusInternalServerError)
// 		return
// 	}

// 	columnsMap, err := gt_2_column_read.GetColumnsMapForTable(table_name)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe sarakkeiden tietojen haussa", http.StatusInternalServerError)
// 		return
// 	}

// 	// Rajataan asetuksista vain näkyvät ja sallitut
// 	visibleColUids := make([]int, 0)
// 	for _, cs := range userColumnSettings {
// 		if cs.IsHidden {
// 			continue
// 		}
// 		if !allowedColumnsMap[cs.ColumnName] {
// 			continue
// 		}
// 		for uid, colInfo := range columnsMap {
// 			if colInfo.ColumnName == cs.ColumnName {
// 				visibleColUids = append(visibleColUids, uid)
// 				break
// 			}
// 		}
// 	}

// 	// 5. Rakennetaan SELECT- ja JOIN-osat näkyville sarakkeille
// 	//    (Käytämme buildJoinsWith1MRelations-funktiota, joka tarkistaa
// 	//    onko sarakkeelle määritelty cached_name_col_in_src yms.)
// 	selectColumns, joinClauses, columnExpressions, err := buildJoinsWith1MRelations(
// 		currentDb,
// 		table_name,
// 		columnsMap,
// 		visibleColUids,
// 	)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe JOIN-liitosten rakentamisessa", http.StatusInternalServerError)
// 		return
// 	}

// 	// Rakennetaan WHERE- ja ORDER BY -ehdot
// 	where_clause, query_args, err := buildWhereClause(
// 		request.URL.Query(),
// 		table_name,
// 		buildColumnsByName(columnsMap),
// 		columnExpressions,
// 	)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe WHERE-ehdon rakentamisessa", http.StatusInternalServerError)
// 		return
// 	}

// 	order_by_clause, err := buildOrderByClause(
// 		request.URL.Query(),
// 		table_name,
// 		buildColumnsByName(columnsMap),
// 		columnExpressions,
// 	)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe ORDER BY -ehdon rakentamisessa", http.StatusBadRequest)
// 		return
// 	}

// 	// 6. Kootaan lopullinen SQL-kysely
// 	query := fmt.Sprintf(
// 		"SELECT %s FROM %s %s%s%s LIMIT %d OFFSET %d",
// 		selectColumns,
// 		pq.QuoteIdentifier(table_name),
// 		joinClauses,
// 		where_clause,
// 		order_by_clause,
// 		results_per_load,
// 		offset_value,
// 	)

// 	rows_result, err := currentDb.Query(query, query_args...)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe tietoja haettaessa", http.StatusInternalServerError)
// 		return
// 	}
// 	defer rows_result.Close()

// 	result_columns, err := rows_result.Columns()
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
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
// 			log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 			http.Error(response_writer, "virhe rivien käsittelyssä", http.StatusInternalServerError)
// 			return
// 		}

// 		current_row_result := make(map[string]interface{})
// 		for i, column_name := range result_columns {
// 			val := row_values[i]
// 			switch typed_val := val.(type) {
// 			case time.Time:
// 				current_row_result[column_name] = typed_val.Format("2006-01-02 15:04:05")
// 			case []byte:
// 				s := string(typed_val)
// 				if column_name == "openai_embedding" && len(s) > 500 {
// 					s = s[:500] + "..."
// 				}
// 				current_row_result[column_name] = s
// 			case string:
// 				s := typed_val
// 				if column_name == "openai_embedding" && len(s) > 500 {
// 					s = s[:500] + "..."
// 				}
// 				current_row_result[column_name] = s
// 			default:
// 				current_row_result[column_name] = typed_val
// 			}
// 		}
// 		query_results = append(query_results, current_row_result)
// 	}
// 	if err := rows_result.Err(); err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe rivien käsittelyssä (err)", http.StatusInternalServerError)
// 		return
// 	}

// 	// Kootaan vastaus
// 	response_data := map[string]interface{}{
// 		"columns":            result_columns,
// 		"data":               query_results,
// 		"types":              column_data_types,
// 		"resultsPerLoad":     results_per_load,
// 		"userColumnSettings": userColumnSettings,
// 	}

// 	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
// 	if err := json.NewEncoder(response_writer).Encode(response_data); err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe vastauksen koodauksessa", http.StatusInternalServerError)
// 		return
// 	}
// }

// // fetchUserSelectableColumns hakee sarakkeet, joihin CURRENT_USER:lla on SELECT-oikeus.
// func fetchUserSelectableColumns(db *sql.DB, tableName string) ([]string, error) {
// 	query := `
// 		SELECT column_name
// 		FROM information_schema.column_privileges
// 		WHERE table_name = $1
// 		  AND privilege_type = 'SELECT'
// 		  AND grantee = current_user
// 	`
// 	rows, err := db.Query(query, tableName)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		return nil, err
// 	}
// 	defer rows.Close()

// 	var columns []string
// 	for rows.Next() {
// 		var colName string
// 		if err := rows.Scan(&colName); err != nil {
// 			log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 			continue
// 		}
// 		columns = append(columns, colName)
// 	}
// 	if err := rows.Err(); err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		return nil, err
// 	}
// 	return columns, nil
// }

// // ensureAndFetchUserColumnSettings hakee käyttäjän sarakeasetukset
// // kyseiselle taululle, käyttäen parametrina annettua tietokantayhteyttä (db).
// func ensureAndFetchUserColumnSettings(userID int, tableName string, db *sql.DB) ([]UserColumnSetting, error) {
// 	// Yritetään ensin hakea käyttäjäkohtaiset asetukset user_column_settings -taulusta.
// 	queryUserSettings := `
//         SELECT
//             column_name,
//             sort_order,
//             column_width_px,
//             is_hidden
//         FROM user_column_settings
//         WHERE user_id = $1
//           AND table_name = $2
//         ORDER BY sort_order
//     `
// 	rows, err := db.Query(queryUserSettings, userID, tableName)
// 	if err != nil {
// 		return nil, err
// 	}
// 	defer rows.Close()

// 	var results []UserColumnSetting
// 	for rows.Next() {
// 		var ucs UserColumnSetting
// 		if err := rows.Scan(&ucs.ColumnName, &ucs.SortOrder, &ucs.ColumnWidth, &ucs.IsHidden); err != nil {
// 			log.Printf("scan virhe user_column_settings: %v", err)
// 			continue
// 		}
// 		results = append(results, ucs)
// 	}
// 	if err := rows.Err(); err != nil {
// 		return nil, err
// 	}

// 	// Jos käyttäjäkohtaisia asetuksia ei ole, käytetään oletusarvoja system_column_details -taulusta.
// 	if len(results) == 0 {
// 		queryDefaults := `
//             SELECT
//                 scd.column_name,
//                 scd.co_number AS sort_order,
//                 0 AS column_width_px,
//                 false AS is_hidden
//             FROM system_db_tables sdt
//             JOIN system_column_details scd ON scd.table_uid = sdt.table_uid
//             WHERE sdt.table_name = $1
//             ORDER BY scd.co_number
//         `
// 		rows, err := db.Query(queryDefaults, tableName)
// 		if err != nil {
// 			return nil, err
// 		}
// 		defer rows.Close()

// 		for rows.Next() {
// 			var ucs UserColumnSetting
// 			if err := rows.Scan(&ucs.ColumnName, &ucs.SortOrder, &ucs.ColumnWidth, &ucs.IsHidden); err != nil {
// 				log.Printf("scan virhe system_column_details: %v", err)
// 				continue
// 			}
// 			results = append(results, ucs)
// 		}
// 		if err := rows.Err(); err != nil {
// 			return nil, err
// 		}
// 	}

// 	return results, nil
// }

// // UserColumnSetting on pieni struct user_column_settings -riville
// type UserColumnSetting struct {
// 	ColumnName  string `json:"column_name"`
// 	SortOrder   int    `json:"sort_order"`
// 	ColumnWidth int    `json:"column_width_px"`
// 	IsHidden    bool   `json:"is_hidden"`
// }

// // getColumnDataTypesWithFK hakee sarakkeen data_type sekä FK-tiedot (jos niitä on).
// func getColumnDataTypesWithFK(tableName string, db *sql.DB) (map[string]interface{}, error) {
// 	query := `
//         SELECT
//             c.column_name,
//             c.data_type,
//             fk_info.foreign_table_name,
//             fk_info.foreign_column_name,
//             COALESCE(scd.card_element, '') AS card_element,
//             COALESCE(scd.show_key_on_card, false)  AS show_key_on_card,
//             COALESCE(scd.show_value_on_card, false) AS show_value_on_card
//         FROM information_schema.columns c
//         LEFT JOIN (
//             SELECT
//                 kcu.column_name,
//                 ccu.table_name AS foreign_table_name,
//                 ccu.column_name AS foreign_column_name
//             FROM
//                 information_schema.table_constraints AS tc
//             JOIN information_schema.key_column_usage AS kcu
//                 ON tc.constraint_name = kcu.constraint_name
//                 AND tc.table_schema = kcu.table_schema
//             JOIN information_schema.constraint_column_usage AS ccu
//                 ON ccu.constraint_name = tc.constraint_name
//                 AND ccu.table_schema = tc.table_schema
//             WHERE tc.constraint_type = 'FOREIGN KEY'
//               AND tc.table_name = $1
//               AND tc.table_schema = 'public'
//         ) AS fk_info
//           ON c.column_name = fk_info.column_name
//           AND c.table_name = $1
//           AND c.table_schema = 'public'
//         LEFT JOIN system_column_details scd
//           ON scd.column_name = c.column_name
//           AND scd.table_uid = (
//                SELECT table_uid
//                FROM system_db_tables
//                WHERE table_name = $1
//           )
//         WHERE c.table_name = $1
//           AND c.table_schema = 'public'
//     `
// 	rows, err := db.Query(query, tableName)
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error()) //odotetaan
// 		return nil, fmt.Errorf("getColumnDataTypesWithFK: %v", err)
// 	}
// 	defer rows.Close()

// 	data_types := make(map[string]interface{})
// 	for rows.Next() {
// 		var columnName, dataType string
// 		var foreignTableName, foreignColumnName sql.NullString
// 		var cardElement string
// 		var showKeyOnCard, showValueOnCard bool

// 		if err := rows.Scan(
// 			&columnName,
// 			&dataType,
// 			&foreignTableName,
// 			&foreignColumnName,
// 			&cardElement,
// 			&showKeyOnCard,
// 			&showValueOnCard,
// 		); err != nil {
// 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error()) //odotetaan
// 			return nil, fmt.Errorf("getColumnDataTypesWithFK: %v", err)
// 		}

// 		columnInfo := map[string]interface{}{
// 			"data_type":          dataType,
// 			"card_element":       cardElement,
// 			"show_key_on_card":   showKeyOnCard,
// 			"show_value_on_card": showValueOnCard,
// 		}
// 		if foreignTableName.Valid && foreignColumnName.Valid {
// 			columnInfo["foreign_table"] = foreignTableName.String
// 			columnInfo["foreign_column"] = foreignColumnName.String
// 		}

// 		data_types[columnName] = columnInfo
// 	}
// 	if err := rows.Err(); err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error()) //odotetaan
// 		return nil, fmt.Errorf("getColumnDataTypesWithFK, rows error: %v", err)
// 	}

// 	fmt.Printf("\033[36m[getColumnDataTypesWithFK] taulun '%s' saraketiedot ladattu onnistuneesti.\033[0m\n", tableName)
// 	return data_types, nil
// }

// // buildColumnsByName on apufunktio, joka luo "colName -> ColumnInfo"
// func buildColumnsByName(colsMap map[int]models.ColumnInfo) map[string]models.ColumnInfo {
// 	byName := make(map[string]models.ColumnInfo)
// 	for _, ci := range colsMap {
// 		byName[ci.ColumnName] = ci
// 	}
// 	return byName
// }

// // buildWhereClause kerää URL-parametrit => ehdot (ILIKE, jne.)
// // Ei tee DB-kyselyjä, joten db-parametri ei ole tarpeen.
// func buildWhereClause(
// 	queryParams url.Values,
// 	tableName string,
// 	columnsByName map[string]models.ColumnInfo,
// 	columnExpressions map[string]string,
// ) (string, []interface{}, error) {

// 	var whereClauses []string
// 	var args []interface{}
// 	argIdx := 1

// 	for param, values := range queryParams {
// 		if param == "list" || param == "sort_column" || param == "sort_order" || param == "offset" {
// 			continue
// 		}
// 		if len(values) == 0 {
// 			continue
// 		}

// 		rawValue := values[0]
// 		columnName := ""
// 		if expr, ok := columnExpressions[param]; ok {
// 			columnName = expr
// 		} else if _, exists := columnsByName[param]; exists {
// 			columnName = fmt.Sprintf("%s.%s", pq.QuoteIdentifier(tableName), pq.QuoteIdentifier(param))
// 		} else {
// 			// Parametri ei vastaa mitään tunnettua saraketta
// 			continue
// 		}

// 		// parseAdvancedSearch(...) on jokin funktio, joka pilkkoo esim. "value1 & -value2" tms.
// 		tokens := parseAdvancedSearch(rawValue)
// 		if len(tokens) == 0 {
// 			continue
// 		}

// 		condition, condArgs, nextArgIdx := buildConditionForTokens(columnName, tokens, argIdx)
// 		if condition != "" {
// 			whereClauses = append(whereClauses, condition)
// 			args = append(args, condArgs...)
// 			argIdx = nextArgIdx
// 		}
// 	}

// 	whereClause := ""
// 	if len(whereClauses) > 0 {
// 		whereClause = " WHERE " + strings.Join(whereClauses, " AND ")
// 	}
// 	return whereClause, args, nil
// }

// // buildOrderByClause hakee sort_column ja sort_order -parametrit ja muodostaa ORDER BY -ehdon.
// func buildOrderByClause(
// 	queryParams url.Values,
// 	tableName string,
// 	columnsByName map[string]models.ColumnInfo,
// 	columnExpressions map[string]string,
// ) (string, error) {

// 	sortColumn := queryParams.Get("sort_column")
// 	sortOrder := strings.ToUpper(queryParams.Get("sort_order"))

// 	if sortColumn == "" {
// 		return "", nil
// 	}
// 	if sortOrder != "ASC" && sortOrder != "DESC" {
// 		sortOrder = "ASC"
// 	}

// 	var columnName string
// 	if expr, ok := columnExpressions[sortColumn]; ok {
// 		columnName = expr
// 	} else if _, exists := columnsByName[sortColumn]; exists {
// 		columnName = fmt.Sprintf("%s.%s", pq.QuoteIdentifier(tableName), pq.QuoteIdentifier(sortColumn))
// 	} else {
// 		return "", fmt.Errorf("tuntematon lajittelusarake: %s", sortColumn)
// 	}

// 	orderByClause := fmt.Sprintf(" ORDER BY %s %s", columnName, sortOrder)
// 	return orderByClause, nil
// }

// // buildConditionForTokens rakentaa ehdon annetuista hakutokeneista (ILIKE, NOT ILIKE, jne.)
// func buildConditionForTokens(
// 	columnName string,
// 	tokens []Token,
// 	argIndex int,
// ) (string, []interface{}, int) {

// 	var exprParts []string
// 	var args []interface{}
// 	currentOp := "AND"

// 	for _, t := range tokens {
// 		switch t.Type {
// 		case TokenAnd:
// 			currentOp = "AND"

// 		case TokenOr:
// 			currentOp = "OR"

// 		case TokenAll:
// 			// Näytä kaikki, => "TRUE"
// 			exprParts = append(exprParts, currentOp, "TRUE")

// 		case TokenExclude:
// 			if t.Value == "" {
// 				expr := fmt.Sprintf("(%s IS NOT NULL AND %s <> '')", columnName, columnName)
// 				exprParts = append(exprParts, currentOp, expr)
// 			} else {
// 				v := strings.ReplaceAll(t.Value, "*", "%")
// 				expr := fmt.Sprintf("%s::text NOT ILIKE $%d", columnName, argIndex)
// 				exprParts = append(exprParts, currentOp, expr)
// 				args = append(args, "%"+v+"%")
// 				argIndex++
// 			}

// 		case TokenInclude:
// 			if t.Value == "" {
// 				expr := fmt.Sprintf("(%s IS NULL OR %s = '')", columnName, columnName)
// 				exprParts = append(exprParts, currentOp, expr)
// 			} else {
// 				v := strings.ReplaceAll(t.Value, "*", "%")
// 				expr := fmt.Sprintf("%s::text ILIKE $%d", columnName, argIndex)
// 				exprParts = append(exprParts, currentOp, expr)
// 				args = append(args, "%"+v+"%")
// 				argIndex++
// 			}
// 		}
// 	}

// 	if len(exprParts) == 0 {
// 		return "", nil, argIndex
// 	}
// 	// Poistetaan mahdollinen "AND"/"OR" alusta
// 	if exprParts[0] == "AND" || exprParts[0] == "OR" {
// 		exprParts = exprParts[1:]
// 	}
// 	finalExpr := "(" + strings.Join(exprParts, " ") + ")"
// 	return finalExpr, args, argIndex
// }
