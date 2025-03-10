// add_row_handler.go
package gt_1_row_create

import (
	"database/sql"
	backend "easelect/backend/main_app"
	gt_triggers "easelect/backend/main_app/general_tables/triggers"
	e_sessions "easelect/backend/main_app/sessions"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/lib/pq"
)

func AddRowHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "Missing 'table' query parameter", http.StatusBadRequest)
		return
	}
	AddRowHandler(w, r, tableName)
}

type ChildRowPayload struct {
	TableName         string                 `json:"tableName"`
	ReferencingColumn string                 `json:"referencingColumn"`
	Data              map[string]interface{} `json:"data"`
}

type ManyToManyPayload struct {
	LinkTableName      string                 `json:"linkTableName"`
	MainTableFkColumn  string                 `json:"mainTableFkColumn"`
	ThirdTableName     string                 `json:"thirdTableName"`
	ThirdTableFkColumn string                 `json:"thirdTableFkColumn"`
	SelectedValue      interface{}            `json:"selectedValue"`
	IsNewRow           bool                   `json:"isNewRow"`
	NewRowData         map[string]interface{} `json:"newRowData,omitempty"`
}

func AddRowHandler(w http.ResponseWriter, r *http.Request, tableName string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST requests are allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "error reading data", http.StatusBadRequest)
		return
	}

	// Haetaan nykyisen käyttäjän tunniste
	currentUserID, err := getCurrentUserID(r)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe käyttäjätunnuksen haussa", http.StatusInternalServerError)
		return
	}

	// Poimitaan lapsidata 1->moni
	var childRows []ChildRowPayload
	if raw := payload["_childRows"]; raw != nil {
		bytes, err := json.Marshal(raw)
		if err == nil {
			json.Unmarshal(bytes, &childRows)
		}
		delete(payload, "_childRows")
	}

	// Poimitaan monesta->moneen
	var manyToManyRows []ManyToManyPayload
	if raw := payload["_manyToMany"]; raw != nil {
		bytes, err := json.Marshal(raw)
		if err == nil {
			json.Unmarshal(bytes, &manyToManyRows)
		}
		delete(payload, "_manyToMany")
	}

	schemaName := "public"
	columnsInfo, err := getAddRowColumnsWithTypes(tableName, schemaName)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "error fetching columns", http.StatusInternalServerError)
		return
	}

	columnTypeMap := make(map[string]string)
	for _, col := range columnsInfo {
		columnTypeMap[col.ColumnName] = col.DataType
	}

	excludeColumns := []string{"id", "created", "updated", "openai_embedding", "creation_spec"}

	allowedColumns := make(map[string]bool)
	for _, col := range columnsInfo {
		colName := col.ColumnName
		isIdentity := strings.ToUpper(col.IsIdentity) == "YES"
		if contains(excludeColumns, strings.ToLower(colName)) {
			continue
		}
		if col.GenerationExpression != "" || isIdentity {
			continue
		}
		allowedColumns[colName] = true
	}

	filteredRow := make(map[string]interface{})
	for colName, val := range payload {
		if allowedColumns[colName] {
			colType := columnTypeMap[colName]
			if isIntegerType(colType) {
				switch raw := val.(type) {
				case string:
					trimmed := strings.TrimSpace(raw)
					if trimmed == "" {
						val = nil
					} else {
						parsedVal, parseErr := strconv.Atoi(trimmed)
						if parseErr != nil {
							fmt.Printf("\033[31mvirhe: %s\033[0m\n", parseErr.Error())
							http.Error(w, fmt.Sprintf("invalid integer value for column %s", colName), http.StatusBadRequest)
							return
						}
						val = parsedVal
					}
				}
			}
			filteredRow[colName] = val
		}
	}

	// Tarkistetaan source_insert_specs ja asetetaan user_id, jos tarpeen
	for _, col := range columnsInfo {
		if col.SourceInsertSpecs != "" {
			var specs map[string]string
			if err := json.Unmarshal([]byte(col.SourceInsertSpecs), &specs); err == nil {
				if val, ok := specs["user_id"]; ok && val == "currentUser" && col.ColumnName == "user_id" {
					filteredRow["user_id"] = currentUserID
				}
			}
		}
	}

	tx, err := backend.Db.Begin()
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe aloitettaessa transaktiota", http.StatusInternalServerError)
		return
	}

	// 1) Lisätään päärivi
	mainRowID, err := insertMainRow(tx, tableName, filteredRow, columnTypeMap)
	if err != nil {
		tx.Rollback()
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
		return
	}

	// 2) Lisätään lapsirivit (1->moni)
	for _, child := range childRows {
		err := insertSingleChildRow(tx, mainRowID, child)
		if err != nil {
			tx.Rollback()
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
			return
		}
	}

	// 3) Lisätään monesta->moneen -liitokset
	for _, m2m := range manyToManyRows {
		var linkValue interface{} = m2m.SelectedValue

		if m2m.IsNewRow && m2m.NewRowData != nil {
			newID, errNew := insertNewThirdTableRow(tx, m2m.ThirdTableName, m2m.NewRowData)
			if errNew != nil {
				tx.Rollback()
				fmt.Printf("\033[31mvirhe: %s\033[0m\n", errNew.Error())
				http.Error(w, "virhe kolmannen taulun rivin lisäyksessä", http.StatusInternalServerError)
				return
			}
			linkValue = newID
		}

		if linkValue == nil {
			continue
		}

		if err := insertOneManyToManyRelation(tx, mainRowID, ManyToManyPayload{
			LinkTableName:      m2m.LinkTableName,
			MainTableFkColumn:  m2m.MainTableFkColumn,
			ThirdTableFkColumn: m2m.ThirdTableFkColumn,
			SelectedValue:      linkValue,
		}); err != nil {
			tx.Rollback()
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe M2M-liitoksen lisäyksessä", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
		return
	}

	insertedRow := map[string]interface{}{"id": mainRowID}
	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		// Ei välttämättä katkaista
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "rivi lisätty onnistuneesti",
	})
}

func getCurrentUserID(r *http.Request) (int, error) {
	store := e_sessions.GetStore()
	session, err := store.Get(r, "session")
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return 0, fmt.Errorf("session get error: %v", err)
	}

	rawUserID, ok := session.Values["user_id"]
	if !ok {
		fmt.Printf("\033[31mvirhe: käyttäjän ID puuttuu sessiosta\033[0m\n")
		return 0, fmt.Errorf("käyttäjän ID puuttuu sessiosta")
	}

	userID, ok := rawUserID.(int)
	if !ok {
		fmt.Printf("\033[31mvirhe: käyttäjän ID on väärää tyyppiä sessiossa\033[0m\n")
		return 0, fmt.Errorf("user ID invalid type in session")
	}

	return userID, nil
}

func insertMainRow(tx *sql.Tx, tableName string, rowData map[string]interface{}, columnTypeMap map[string]string) (int64, error) {
	insertColumns := []string{}
	placeholders := []string{}
	values := []interface{}{}

	i := 1
	for col, val := range rowData {
		if col == "" {
			fmt.Printf("\033[31m[ERROR] Tyhjä sarakkeen nimi löydetty taulussa %s.\033[0m\n", tableName)
		} else {
			fmt.Printf("[DEBUG] Lisättävä sarake: '%s' taulusta '%s', arvo: '%v', tyyppi: '%s'\n", col, tableName, val, columnTypeMap[col])
		}

		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
		colType := strings.ToLower(columnTypeMap[col])

		if strings.Contains(colType, "geometry") {
			if val == nil || val == "" {
				oletusPseudolokaatio := "POINT(24.9384 60.1699)"
				placeholders = append(placeholders, fmt.Sprintf("ST_GeomFromText($%d, 4326)", i))
				values = append(values, oletusPseudolokaatio)
				i++
				continue
			}
			placeholders = append(placeholders, fmt.Sprintf("ST_GeomFromText($%d, 4326)", i))
			values = append(values, val)
			i++
			continue
		}

		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		values = append(values, val)
		i++
	}

	if len(insertColumns) == 0 {
		return 0, fmt.Errorf("ei validia saraketta lisättäväksi taulussa %s", tableName)
	}

	insertQuery := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
		pq.QuoteIdentifier(tableName),
		strings.Join(insertColumns, ", "),
		strings.Join(placeholders, ", "),
	)

	fmt.Printf("[DEBUG] Suoritetaan kysely: %s\nArvot: %v\n", insertQuery, values)

	var mainRowID int64
	err := tx.QueryRow(insertQuery, values...).Scan(&mainRowID)
	if err != nil {
		fmt.Printf("\033[31m[ERROR] Virhe lisättäessä pääriviä tauluun %s: %s\033[0m\n", tableName, err.Error())
		return 0, err
	}
	return mainRowID, nil
}

func isIntegerType(dataType string) bool {
	dataType = strings.ToLower(dataType)
	return strings.Contains(dataType, "int")
}

func insertSingleChildRow(tx *sql.Tx, mainRowID int64, child ChildRowPayload) error {
	fmt.Printf("[DEBUG] Lisätään lapsirivi tauluun '%s' käyttäen viiteavainta '%s'. Alkuperäinen data: %v\n", child.TableName, child.ReferencingColumn, child.Data)
	if child.TableName == "" || child.ReferencingColumn == "" {
		return fmt.Errorf("puuttuva lapsidatan kenttä: tableName tai referencingColumn")
	}
	if child.Data == nil {
		return nil
	}

	child.Data[child.ReferencingColumn] = mainRowID

	insertColumns := []string{}
	placeholders := []string{}
	values := []interface{}{}

	i := 1
	for col, val := range child.Data {
		fmt.Printf("[DEBUG] Lisättävä lapsitaulun sarake: '%s', arvo: '%v'\n", col, val)
		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		values = append(values, val)
		i++
	}
	if len(insertColumns) == 0 {
		return nil
	}

	insertQuery := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s)",
		pq.QuoteIdentifier(child.TableName),
		strings.Join(insertColumns, ", "),
		strings.Join(placeholders, ", "),
	)
	fmt.Printf("[DEBUG] Suoritetaan lapsitaulun kysely: %s\nArvot: %v\n", insertQuery, values)
	_, err := tx.Exec(insertQuery, values...)
	return err
}

func insertNewThirdTableRow(tx *sql.Tx, tableName string, rowData map[string]interface{}) (int64, error) {
	fmt.Printf("[DEBUG] Lisätään uusi rivi kolmanteen tauluun '%s'. Data: %v\n", tableName, rowData)
	if len(rowData) == 0 {
		return 0, nil
	}

	insertCols := []string{}
	placeholders := []string{}
	var values []interface{}

	i := 1
	for col, val := range rowData {
		fmt.Printf("[DEBUG] Kolmannen taulun sarake: '%s', arvo: '%v'\n", col, val)
		insertCols = append(insertCols, pq.QuoteIdentifier(col))
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		values = append(values, val)
		i++
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
		pq.QuoteIdentifier(tableName),
		strings.Join(insertCols, ", "),
		strings.Join(placeholders, ", "),
	)

	fmt.Printf("[DEBUG] Suoritetaan kysely: %s\nArvot: %v\n", query, values)

	var newID int64
	err := tx.QueryRow(query, values...).Scan(&newID)
	if err != nil {
		fmt.Printf("\033[31m[ERROR] Virhe lisättäessä uutta riviä kolmanteen tauluun %s: %s\033[0m\n", tableName, err.Error())
		return 0, err
	}
	return newID, nil
}

func insertOneManyToManyRelation(tx *sql.Tx, mainRowID int64, m2m ManyToManyPayload) error {
	fmt.Printf("[DEBUG] Lisätään M2M-liitos: linkataulu '%s' – sarakkeet '%s' (päätaulu) ja '%s' (kolmas taulu), arvo: %v\n",
		m2m.LinkTableName, m2m.MainTableFkColumn, m2m.ThirdTableFkColumn, m2m.SelectedValue)

	insertQuery := fmt.Sprintf(
		"INSERT INTO %s (%s, %s) VALUES ($1, $2)",
		pq.QuoteIdentifier(m2m.LinkTableName),
		pq.QuoteIdentifier(m2m.MainTableFkColumn),
		pq.QuoteIdentifier(m2m.ThirdTableFkColumn),
	)
	fmt.Printf("[DEBUG] Suoritetaan liitoskysely: %s\n", insertQuery)
	_, err := tx.Exec(insertQuery, mainRowID, m2m.SelectedValue)
	if err != nil {
		fmt.Printf("\033[31m[ERROR] Virhe M2M-liitosta lisättäessä: %s\033[0m\n", err.Error())
	}
	return err
}

// // add_row_handler.go 2025-03-10--01-19
// package gt_1_row_create

// import (
// 	"database/sql"
// 	backend "easelect/backend/main_app"
// 	gt_triggers "easelect/backend/main_app/general_tables/triggers"
// 	"encoding/json"
// 	"fmt"
// 	"net/http"
// 	"strconv"
// 	"strings"

// 	"github.com/lib/pq"
// )

// func AddRowHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// 	tableName := r.URL.Query().Get("table")
// 	if tableName == "" {
// 		http.Error(w, "Missing 'table' query parameter", http.StatusBadRequest)
// 		return
// 	}
// 	AddRowHandler(w, r, tableName)
// }

// type ChildRowPayload struct {
// 	TableName         string                 `json:"tableName"`
// 	ReferencingColumn string                 `json:"referencingColumn"`
// 	Data              map[string]interface{} `json:"data"`
// }

// type ManyToManyPayload struct {
// 	LinkTableName      string                 `json:"linkTableName"`
// 	MainTableFkColumn  string                 `json:"mainTableFkColumn"`
// 	ThirdTableName     string                 `json:"thirdTableName"`
// 	ThirdTableFkColumn string                 `json:"thirdTableFkColumn"`
// 	SelectedValue      interface{}            `json:"selectedValue"`
// 	IsNewRow           bool                   `json:"isNewRow"`
// 	NewRowData         map[string]interface{} `json:"newRowData,omitempty"`
// }

// func AddRowHandler(w http.ResponseWriter, r *http.Request, tableName string) {
// 	if r.Method != http.MethodPost {
// 		http.Error(w, "Only POST requests are allowed", http.StatusMethodNotAllowed)
// 		return
// 	}

// 	var payload map[string]interface{}
// 	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "error reading data", http.StatusBadRequest)
// 		return
// 	}

// 	// Poimitaan lapsidata 1->moni
// 	var childRows []ChildRowPayload
// 	if raw := payload["_childRows"]; raw != nil {
// 		bytes, err := json.Marshal(raw)
// 		if err == nil {
// 			json.Unmarshal(bytes, &childRows)
// 		}
// 		delete(payload, "_childRows")
// 	}

// 	// Poimitaan monesta->moneen
// 	var manyToManyRows []ManyToManyPayload
// 	if raw := payload["_manyToMany"]; raw != nil {
// 		bytes, err := json.Marshal(raw)
// 		if err == nil {
// 			json.Unmarshal(bytes, &manyToManyRows)
// 		}
// 		delete(payload, "_manyToMany")
// 	}

// 	schemaName := "public"
// 	columnsInfo, err := getAddRowColumnsWithTypes(tableName, schemaName)
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "error fetching columns", http.StatusInternalServerError)
// 		return
// 	}

// 	// // Haetaan currentUser-arvo
// 	// currentUserID, err := getCurrentUserID(r)
// 	// if err != nil {
// 	// 	fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 	// 	http.Error(w, "virhe käyttäjätunnuksen haussa", http.StatusInternalServerError)
// 	// 	return
// 	// }

// 	// --- Poistettu aiempi allow_form_insertion_on_source / inputMethodOnSource -logiikka ---

// 	columnTypeMap := make(map[string]string)
// 	for _, col := range columnsInfo {
// 		columnTypeMap[col.ColumnName] = col.DataType
// 	}

// 	excludeColumns := []string{"id", "created", "updated", "openai_embedding", "creation_spec"}

// 	allowedColumns := make(map[string]bool)
// 	for _, col := range columnsInfo {
// 		colName := col.ColumnName
// 		isIdentity := strings.ToUpper(col.IsIdentity) == "YES"
// 		if contains(excludeColumns, strings.ToLower(colName)) {
// 			continue
// 		}
// 		if col.GenerationExpression != "" || isIdentity {
// 			continue
// 		}
// 		allowedColumns[colName] = true
// 	}

// 	filteredRow := make(map[string]interface{})
// 	for colName, val := range payload {
// 		if allowedColumns[colName] {
// 			colType := columnTypeMap[colName]
// 			if isIntegerType(colType) {
// 				switch raw := val.(type) {
// 				case string:
// 					trimmed := strings.TrimSpace(raw)
// 					if trimmed == "" {
// 						val = nil
// 					} else {
// 						parsedVal, parseErr := strconv.Atoi(trimmed)
// 						if parseErr != nil {
// 							fmt.Printf("\033[31mvirhe: %s\033[0m\n", parseErr.Error())
// 							http.Error(w, fmt.Sprintf("invalid integer value for column %s", colName), http.StatusBadRequest)
// 							return
// 						}
// 						val = parsedVal
// 					}
// 				}
// 			}
// 			filteredRow[colName] = val
// 		}
// 	}

// 	tx, err := backend.Db.Begin()
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe aloitettaessa transaktiota", http.StatusInternalServerError)
// 		return
// 	}

// 	// 1) Lisätään päärivi
// 	mainRowID, err := insertMainRow(tx, tableName, filteredRow, columnTypeMap)
// 	if err != nil {
// 		tx.Rollback()
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
// 		return
// 	}

// 	// 2) Lisätään lapsirivit (1->moni)
// 	for _, child := range childRows {
// 		err := insertSingleChildRow(tx, mainRowID, child)
// 		if err != nil {
// 			tx.Rollback()
// 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
// 			return
// 		}
// 	}

// 	// 3) Lisätään monesta->moneen -liitokset
// 	for _, m2m := range manyToManyRows {
// 		var linkValue interface{} = m2m.SelectedValue

// 		if m2m.IsNewRow && m2m.NewRowData != nil {
// 			newID, errNew := insertNewThirdTableRow(tx, m2m.ThirdTableName, m2m.NewRowData)
// 			if errNew != nil {
// 				tx.Rollback()
// 				fmt.Printf("\033[31mvirhe: %s\033[0m\n", errNew.Error())
// 				http.Error(w, "virhe kolmannen taulun rivin lisäyksessä", http.StatusInternalServerError)
// 				return
// 			}
// 			linkValue = newID
// 		}

// 		if linkValue == nil {
// 			continue
// 		}

// 		if err := insertOneManyToManyRelation(tx, mainRowID, ManyToManyPayload{
// 			LinkTableName:      m2m.LinkTableName,
// 			MainTableFkColumn:  m2m.MainTableFkColumn,
// 			ThirdTableFkColumn: m2m.ThirdTableFkColumn,
// 			SelectedValue:      linkValue,
// 		}); err != nil {
// 			tx.Rollback()
// 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 			http.Error(w, "virhe M2M-liitoksen lisäyksessä", http.StatusInternalServerError)
// 			return
// 		}
// 	}

// 	if err := tx.Commit(); err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
// 		return
// 	}

// 	insertedRow := map[string]interface{}{"id": mainRowID}
// 	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		// Ei välttämättä katkaista
// 	}

// 	w.WriteHeader(http.StatusCreated)
// 	json.NewEncoder(w).Encode(map[string]string{
// 		"message": "rivi lisätty onnistuneesti",
// 	})
// }

// // func getCurrentUserID(r *http.Request) (int, error) {
// // 	store := e_sessions.GetStore()
// // 	session, err := store.Get(r, "session")
// // 	if err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		return 0, fmt.Errorf("session get error: %v", err)
// // 	}

// // 	rawUserID, ok := session.Values["user_id"]
// // 	if !ok {
// // 		fmt.Printf("\033[31mvirhe: käyttäjän ID puuttuu sessiosta\033[0m\n")
// // 		return 0, fmt.Errorf("käyttäjän ID puuttuu sessiosta")
// // 	}

// // 	userID, ok := rawUserID.(int)
// // 	if !ok {
// // 		fmt.Printf("\033[31mvirhe: käyttäjän ID on väärää tyyppiä sessiossa\033[0m\n")
// // 		return 0, fmt.Errorf("user ID invalid type in session")
// // 	}

// // 	return userID, nil
// // }

// func insertMainRow(tx *sql.Tx, tableName string, rowData map[string]interface{}, columnTypeMap map[string]string) (int64, error) {
// 	insertColumns := []string{}
// 	placeholders := []string{}
// 	values := []interface{}{}

// 	i := 1
// 	for col, val := range rowData {
// 		if col == "" {
// 			fmt.Printf("\033[31m[ERROR] Tyhjä sarakkeen nimi löydetty taulussa %s.\033[0m\n", tableName)
// 		} else {
// 			fmt.Printf("[DEBUG] Lisättävä sarake: '%s' taulusta '%s', arvo: '%v', tyyppi: '%s'\n", col, tableName, val, columnTypeMap[col])
// 		}

// 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// 		colType := strings.ToLower(columnTypeMap[col])

// 		if strings.Contains(colType, "geometry") {
// 			if val == nil || val == "" {
// 				oletusPseudolokaatio := "POINT(24.9384 60.1699)"
// 				placeholders = append(placeholders, fmt.Sprintf("ST_GeomFromText($%d, 4326)", i))
// 				values = append(values, oletusPseudolokaatio)
// 				i++
// 				continue
// 			}
// 			placeholders = append(placeholders, fmt.Sprintf("ST_GeomFromText($%d, 4326)", i))
// 			values = append(values, val)
// 			i++
// 			continue
// 		}

// 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// 		values = append(values, val)
// 		i++
// 	}

// 	if len(insertColumns) == 0 {
// 		return 0, fmt.Errorf("ei validia saraketta lisättäväksi taulussa %s", tableName)
// 	}

// 	insertQuery := fmt.Sprintf(
// 		"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
// 		pq.QuoteIdentifier(tableName),
// 		strings.Join(insertColumns, ", "),
// 		strings.Join(placeholders, ", "),
// 	)

// 	fmt.Printf("[DEBUG] Suoritetaan kysely: %s\nArvot: %v\n", insertQuery, values)

// 	var mainRowID int64
// 	err := tx.QueryRow(insertQuery, values...).Scan(&mainRowID)
// 	if err != nil {
// 		fmt.Printf("\033[31m[ERROR] Virhe lisättäessä pääriviä tauluun %s: %s\033[0m\n", tableName, err.Error())
// 		return 0, err
// 	}
// 	return mainRowID, nil
// }

// func isIntegerType(dataType string) bool {
// 	dataType = strings.ToLower(dataType)
// 	return strings.Contains(dataType, "int")
// }

// func insertSingleChildRow(tx *sql.Tx, mainRowID int64, child ChildRowPayload) error {
// 	fmt.Printf("[DEBUG] Lisätään lapsirivi tauluun '%s' käyttäen viiteavainta '%s'. Alkuperäinen data: %v\n", child.TableName, child.ReferencingColumn, child.Data)
// 	if child.TableName == "" || child.ReferencingColumn == "" {
// 		return fmt.Errorf("puuttuva lapsidatan kenttä: tableName tai referencingColumn")
// 	}
// 	if child.Data == nil {
// 		return nil
// 	}

// 	child.Data[child.ReferencingColumn] = mainRowID

// 	insertColumns := []string{}
// 	placeholders := []string{}
// 	values := []interface{}{}

// 	i := 1
// 	for col, val := range child.Data {
// 		fmt.Printf("[DEBUG] Lisättävä lapsitaulun sarake: '%s', arvo: '%v'\n", col, val)
// 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// 		values = append(values, val)
// 		i++
// 	}
// 	if len(insertColumns) == 0 {
// 		return nil
// 	}

// 	insertQuery := fmt.Sprintf(
// 		"INSERT INTO %s (%s) VALUES (%s)",
// 		pq.QuoteIdentifier(child.TableName),
// 		strings.Join(insertColumns, ", "),
// 		strings.Join(placeholders, ", "),
// 	)
// 	fmt.Printf("[DEBUG] Suoritetaan lapsitaulun kysely: %s\nArvot: %v\n", insertQuery, values)
// 	_, err := tx.Exec(insertQuery, values...)
// 	return err
// }

// func insertNewThirdTableRow(tx *sql.Tx, tableName string, rowData map[string]interface{}) (int64, error) {
// 	fmt.Printf("[DEBUG] Lisätään uusi rivi kolmanteen tauluun '%s'. Data: %v\n", tableName, rowData)
// 	if len(rowData) == 0 {
// 		return 0, nil
// 	}

// 	insertCols := []string{}
// 	placeholders := []string{}
// 	var values []interface{}

// 	i := 1
// 	for col, val := range rowData {
// 		fmt.Printf("[DEBUG] Kolmannen taulun sarake: '%s', arvo: '%v'\n", col, val)
// 		insertCols = append(insertCols, pq.QuoteIdentifier(col))
// 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// 		values = append(values, val)
// 		i++
// 	}

// 	query := fmt.Sprintf(
// 		"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
// 		pq.QuoteIdentifier(tableName),
// 		strings.Join(insertCols, ", "),
// 		strings.Join(placeholders, ", "),
// 	)

// 	fmt.Printf("[DEBUG] Suoritetaan kysely: %s\nArvot: %v\n", query, values)

// 	var newID int64
// 	err := tx.QueryRow(query, values...).Scan(&newID)
// 	if err != nil {
// 		fmt.Printf("\033[31m[ERROR] Virhe lisättäessä uutta riviä kolmanteen tauluun %s: %s\033[0m\n", tableName, err.Error())
// 		return 0, err
// 	}
// 	return newID, nil
// }

// func insertOneManyToManyRelation(tx *sql.Tx, mainRowID int64, m2m ManyToManyPayload) error {
// 	fmt.Printf("[DEBUG] Lisätään M2M-liitos: linkataulu '%s' – sarakkeet '%s' (päätaulu) ja '%s' (kolmas taulu), arvo: %v\n",
// 		m2m.LinkTableName, m2m.MainTableFkColumn, m2m.ThirdTableFkColumn, m2m.SelectedValue)

// 	insertQuery := fmt.Sprintf(
// 		"INSERT INTO %s (%s, %s) VALUES ($1, $2)",
// 		pq.QuoteIdentifier(m2m.LinkTableName),
// 		pq.QuoteIdentifier(m2m.MainTableFkColumn),
// 		pq.QuoteIdentifier(m2m.ThirdTableFkColumn),
// 	)
// 	fmt.Printf("[DEBUG] Suoritetaan liitoskysely: %s\n", insertQuery)
// 	_, err := tx.Exec(insertQuery, mainRowID, m2m.SelectedValue)
// 	if err != nil {
// 		fmt.Printf("\033[31m[ERROR] Virhe M2M-liitosta lisättäessä: %s\033[0m\n", err.Error())
// 	}
// 	return err
// }
