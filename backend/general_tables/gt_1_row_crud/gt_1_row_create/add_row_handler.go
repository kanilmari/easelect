// add_row_handler.go
package gt_1_row_create

import (
	"database/sql"
	gt_triggers "easelect/backend/general_tables/triggers"
	backend "easelect/backend/main_app"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/lib/pq"
)

// ChildRowPayload kuten aiemmin
type ChildRowPayload struct {
	TableName         string                 `json:"tableName"`
	ReferencingColumn string                 `json:"referencingColumn"`
	Data              map[string]interface{} `json:"data"` // 1 rivi
}

// ManyToManyPayload laajennettuna, jotta voidaan lisätä uusi rivi "kolmanteen" tauluun
type ManyToManyPayload struct {
	LinkTableName      string                 `json:"linkTableName"`
	MainTableFkColumn  string                 `json:"mainTableFkColumn"`
	ThirdTableName     string                 `json:"thirdTableName"`
	ThirdTableFkColumn string                 `json:"thirdTableFkColumn"`
	SelectedValue      interface{}            `json:"selectedValue"` // jos olemassaoleva rivi
	IsNewRow           bool                   `json:"isNewRow"`
	NewRowData         map[string]interface{} `json:"newRowData,omitempty"` // kentät uuden rivin luontiin
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

	// Rakennetaan sarake -> data_type -kartta
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

	// Suodatetaan pään row-data
	filteredRow := make(map[string]interface{})
	for col, val := range payload {
		if allowedColumns[col] {
			colType := columnTypeMap[col]
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
							http.Error(w, fmt.Sprintf("invalid integer value for column %s", col), http.StatusBadRequest)
							return
						}
						val = parsedVal
					}
				}
			}
			filteredRow[col] = val
		}
	}

	tx, err := backend.Db.Begin()
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe aloitettaessa transaktiota", http.StatusInternalServerError)
		return
	}

	// 1) lisätään päärivi
	mainRowID, err := insertMainRow(tx, tableName, filteredRow)
	if err != nil {
		tx.Rollback()
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
		return
	}

	// 2) lapsirivit (1->moni)
	for _, child := range childRows {
		err := insertSingleChildRow(tx, mainRowID, child)
		if err != nil {
			tx.Rollback()
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
			return
		}
	}

	// 3) monesta->moneen -liitokset
	for _, m2m := range manyToManyRows {
		var linkValue interface{} = m2m.SelectedValue

		// Jos halutaan luoda uusi rivi "kolmanteen" tauluun
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

		// Jos linkValue on nil, ei tehdä bridgingiä
		if linkValue == nil {
			continue
		}

		// Lisätään bridging-rivi
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

	// Kommitointi
	if err := tx.Commit(); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
		return
	}

	// Mahdolliset triggerit
	insertedRow := map[string]interface{}{"id": mainRowID}
	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		// ei välttämättä katkaista
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "rivi lisätty onnistuneesti",
	})
}

func insertMainRow(tx *sql.Tx, tableName string, rowData map[string]interface{}) (int64, error) {
	insertColumns := []string{}
	placeholders := []string{}
	values := []interface{}{}

	i := 1
	for col, val := range rowData {
		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		values = append(values, val)
		i++
	}
	if len(insertColumns) == 0 {
		return 0, fmt.Errorf("ei validia saraketta lisättäväksi")
	}

	insertQuery := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
		pq.QuoteIdentifier(tableName),
		strings.Join(insertColumns, ", "),
		strings.Join(placeholders, ", "),
	)
	var mainRowID int64
	err := tx.QueryRow(insertQuery, values...).Scan(&mainRowID)
	if err != nil {
		return 0, err
	}
	return mainRowID, nil
}

// isIntegerType palauttaa true, jos data_type on jonkin sortin integer
func isIntegerType(dataType string) bool {
	dataType = strings.ToLower(dataType)
	return strings.Contains(dataType, "int")
}

// Lapsirivin lisäys (1->moni)
func insertSingleChildRow(tx *sql.Tx, mainRowID int64, child ChildRowPayload) error {
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
		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		values = append(values, val)
		i++
	}
	if len(insertColumns) == 0 {
		// ei sarakkeita -> ei tehdä mitään
		return nil
	}

	insertQuery := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s)",
		pq.QuoteIdentifier(child.TableName),
		strings.Join(insertColumns, ", "),
		strings.Join(placeholders, ", "),
	)
	_, err := tx.Exec(insertQuery, values...)
	return err
}

// Uuden rivin luonti "kolmanteen tauluun" (M2M)
func insertNewThirdTableRow(tx *sql.Tx, tableName string, rowData map[string]interface{}) (int64, error) {
	if len(rowData) == 0 {
		return 0, nil
	}

	insertCols := []string{}
	placeholders := []string{}
	var values []interface{}

	i := 1
	for col, val := range rowData {
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

	var newID int64
	err := tx.QueryRow(query, values...).Scan(&newID)
	if err != nil {
		return 0, err
	}
	return newID, nil
}

// Many-to-many -liitoksen lisäys bridging-tauluun
func insertOneManyToManyRelation(tx *sql.Tx, mainRowID int64, m2m ManyToManyPayload) error {
	insertQuery := fmt.Sprintf(
		"INSERT INTO %s (%s, %s) VALUES ($1, $2)",
		pq.QuoteIdentifier(m2m.LinkTableName),
		pq.QuoteIdentifier(m2m.MainTableFkColumn),
		pq.QuoteIdentifier(m2m.ThirdTableFkColumn),
	)
	_, err := tx.Exec(insertQuery, mainRowID, m2m.SelectedValue)
	return err
}

// // add_row_handler.go
// package gt_1_row_create

// import (
// 	"database/sql"
// 	gt_triggers "easelect/backend/general_tables/triggers"
// 	backend "easelect/backend/main_app"
// 	"encoding/json"
// 	"fmt"
// 	"net/http"
// 	"strconv"
// 	"strings"

// 	"github.com/lib/pq"
// )

// // ChildRowPayload kuten aiemmin
// type ChildRowPayload struct {
// 	TableName         string                 `json:"tableName"`
// 	ReferencingColumn string                 `json:"referencingColumn"`
// 	Data              map[string]interface{} `json:"data"` // 1 rivi
// }

// // ManyToManyPayload
// type ManyToManyPayload struct {
// 	LinkTableName      string      `json:"linkTableName"`
// 	MainTableFkColumn  string      `json:"mainTableFkColumn"`
// 	ThirdTableName     string      `json:"thirdTableName"`
// 	ThirdTableFkColumn string      `json:"thirdTableFkColumn"`
// 	SelectedValue      interface{} `json:"selectedValue"` // userin valitsema "kolmas id"
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

// 	// Rakennetaan sarake -> data_type -kartta
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

// 	// Suodatetaan pään row-data
// 	filteredRow := make(map[string]interface{})
// 	for col, val := range payload {
// 		if allowedColumns[col] {
// 			colType := columnTypeMap[col]
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
// 							http.Error(w, fmt.Sprintf("invalid integer value for column %s", col), http.StatusBadRequest)
// 							return
// 						}
// 						val = parsedVal
// 					}
// 				}
// 			}
// 			filteredRow[col] = val
// 		}
// 	}

// 	tx, err := backend.Db.Begin()
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe aloitettaessa transaktiota", http.StatusInternalServerError)
// 		return
// 	}

// 	// 1) lisätään päärivi
// 	mainRowID, err := insertMainRow(tx, tableName, filteredRow)
// 	if err != nil {
// 		tx.Rollback()
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
// 		return
// 	}

// 	// 2) lapsirivit (1->moni)
// 	for _, child := range childRows {
// 		err := insertSingleChildRow(tx, mainRowID, child)
// 		if err != nil {
// 			tx.Rollback()
// 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
// 			return
// 		}
// 	}

// 	// 3) monesta->moneen -liitokset
// 	for _, m2m := range manyToManyRows {
// 		if m2m.SelectedValue == nil {
// 			continue
// 		}
// 		if err := insertOneManyToManyRelation(tx, mainRowID, m2m); err != nil {
// 			tx.Rollback()
// 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 			http.Error(w, "virhe M2M-liitoksen lisäyksessä", http.StatusInternalServerError)
// 			return
// 		}
// 	}

// 	// Kommitointi
// 	if err := tx.Commit(); err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
// 		return
// 	}

// 	// Mahdolliset triggerit
// 	insertedRow := map[string]interface{}{"id": mainRowID}
// 	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		// ei välttämättä katkaista
// 	}

// 	w.WriteHeader(http.StatusCreated)
// 	json.NewEncoder(w).Encode(map[string]string{
// 		"message": "rivi lisätty onnistuneesti",
// 	})
// }

// func insertMainRow(tx *sql.Tx, tableName string, rowData map[string]interface{}) (int64, error) {
// 	insertColumns := []string{}
// 	placeholders := []string{}
// 	values := []interface{}{}

// 	i := 1
// 	for col, val := range rowData {
// 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// 		values = append(values, val)
// 		i++
// 	}
// 	if len(insertColumns) == 0 {
// 		return 0, fmt.Errorf("ei validia saraketta lisättäväksi")
// 	}

// 	insertQuery := fmt.Sprintf(
// 		"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
// 		pq.QuoteIdentifier(tableName),
// 		strings.Join(insertColumns, ", "),
// 		strings.Join(placeholders, ", "),
// 	)
// 	var mainRowID int64
// 	err := tx.QueryRow(insertQuery, values...).Scan(&mainRowID)
// 	if err != nil {
// 		return 0, err
// 	}
// 	return mainRowID, nil
// }

// // isIntegerType palauttaa true, jos data_type on jonkin sortin integer
// func isIntegerType(dataType string) bool {
// 	dataType = strings.ToLower(dataType)
// 	return strings.Contains(dataType, "int")
// }

// // Lapsirivin lisäys (1->moni)
// func insertSingleChildRow(tx *sql.Tx, mainRowID int64, child ChildRowPayload) error {
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
// 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// 		values = append(values, val)
// 		i++
// 	}
// 	if len(insertColumns) == 0 {
// 		// ei sarakkeita -> ei tehdä mitään
// 		return nil
// 	}

// 	insertQuery := fmt.Sprintf(
// 		"INSERT INTO %s (%s) VALUES (%s)",
// 		pq.QuoteIdentifier(child.TableName),
// 		strings.Join(insertColumns, ", "),
// 		strings.Join(placeholders, ", "),
// 	)
// 	_, err := tx.Exec(insertQuery, values...)
// 	return err
// }

// // Many-to-many -liitoksen lisäys
// func insertOneManyToManyRelation(tx *sql.Tx, mainRowID int64, m2m ManyToManyPayload) error {
// 	insertQuery := fmt.Sprintf(
// 		"INSERT INTO %s (%s, %s) VALUES ($1, $2)",
// 		pq.QuoteIdentifier(m2m.LinkTableName),
// 		pq.QuoteIdentifier(m2m.MainTableFkColumn),
// 		pq.QuoteIdentifier(m2m.ThirdTableFkColumn),
// 	)
// 	_, err := tx.Exec(insertQuery, mainRowID, m2m.SelectedValue)
// 	return err
// }

// // // add_row_handler.go
// // package gt_1_row_create

// // import (
// // 	"database/sql"
// // 	gt_triggers "easelect/backend/general_tables/triggers"
// // 	backend "easelect/backend/main_app"
// // 	"encoding/json"
// // 	"fmt"
// // 	"net/http"
// // 	"strconv"
// // 	"strings"

// // 	"github.com/lib/pq"
// // )

// // // ChildRowPayload kuten aiemmin
// // type ChildRowPayload struct {
// // 	TableName         string                 `json:"tableName"`
// // 	ReferencingColumn string                 `json:"referencingColumn"`
// // 	Data              map[string]interface{} `json:"data"` // 1 rivi
// // }

// // // ManyToManyPayload
// // type ManyToManyPayload struct {
// // 	LinkTableName      string      `json:"linkTableName"`
// // 	MainTableFkColumn  string      `json:"mainTableFkColumn"`
// // 	ThirdTableName     string      `json:"thirdTableName"`
// // 	ThirdTableFkColumn string      `json:"thirdTableFkColumn"`
// // 	SelectedValue      interface{} `json:"selectedValue"` // userin valitsema "kolmas id"
// // }

// // func AddRowHandler(w http.ResponseWriter, r *http.Request, tableName string) {
// // 	if r.Method != http.MethodPost {
// // 		http.Error(w, "Only POST requests are allowed", http.StatusMethodNotAllowed)
// // 		return
// // 	}

// // 	var payload map[string]interface{}
// // 	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(w, "error reading data", http.StatusBadRequest)
// // 		return
// // 	}

// // 	// Poimitaan lapsidata 1->moni
// // 	var childRows []ChildRowPayload
// // 	if raw := payload["_childRows"]; raw != nil {
// // 		bytes, err := json.Marshal(raw)
// // 		if err == nil {
// // 			json.Unmarshal(bytes, &childRows)
// // 		}
// // 		delete(payload, "_childRows")
// // 	}

// // 	// Poimitaan monesta->moneen
// // 	var manyToManyRows []ManyToManyPayload
// // 	if raw := payload["_manyToMany"]; raw != nil {
// // 		bytes, err := json.Marshal(raw)
// // 		if err == nil {
// // 			json.Unmarshal(bytes, &manyToManyRows)
// // 		}
// // 		delete(payload, "_manyToMany")
// // 	}

// // 	schemaName := "public"
// // 	columnsInfo, err := getAddRowColumnsWithTypes(tableName, schemaName)
// // 	if err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(w, "error fetching columns", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	// Rakennetaan sarake -> data_type -kartta
// // 	columnTypeMap := make(map[string]string)
// // 	for _, col := range columnsInfo {
// // 		columnTypeMap[col.ColumnName] = col.DataType
// // 	}

// // 	excludeColumns := []string{"id", "created", "updated", "openai_embedding", "creation_spec"}

// // 	allowedColumns := make(map[string]bool)
// // 	for _, col := range columnsInfo {
// // 		colName := col.ColumnName
// // 		isIdentity := strings.ToUpper(col.IsIdentity) == "YES"
// // 		if contains(excludeColumns, strings.ToLower(colName)) {
// // 			continue
// // 		}
// // 		if col.GenerationExpression != "" || isIdentity {
// // 			continue
// // 		}
// // 		allowedColumns[colName] = true
// // 	}

// // 	// Suodatetaan pään row-data
// // 	filteredRow := make(map[string]interface{})
// // 	for col, val := range payload {
// // 		if allowedColumns[col] {
// // 			colType := columnTypeMap[col]
// // 			if isIntegerType(colType) {
// // 				switch raw := val.(type) {
// // 				case string:
// // 					trimmed := strings.TrimSpace(raw)
// // 					if trimmed == "" {
// // 						val = nil
// // 					} else {
// // 						parsedVal, parseErr := strconv.Atoi(trimmed)
// // 						if parseErr != nil {
// // 							fmt.Printf("\033[31mvirhe: %s\033[0m\n", parseErr.Error())
// // 							http.Error(w, fmt.Sprintf("invalid integer value for column %s", col), http.StatusBadRequest)
// // 							return
// // 						}
// // 						val = parsedVal
// // 					}
// // 				}
// // 			}
// // 			filteredRow[col] = val
// // 		}
// // 	}

// // 	tx, err := backend.Db.Begin()
// // 	if err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(w, "virhe aloitettaessa transaktiota", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	// 1) lisätään päärivi
// // 	mainRowID, err := insertMainRow(tx, tableName, filteredRow)
// // 	if err != nil {
// // 		tx.Rollback()
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	// 2) lapsirivit (1->moni)
// // 	for _, child := range childRows {
// // 		err := insertSingleChildRow(tx, mainRowID, child)
// // 		if err != nil {
// // 			tx.Rollback()
// // 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
// // 			return
// // 		}
// // 	}

// // 	// 3) monesta->moneen -liitokset
// // 	for _, m2m := range manyToManyRows {
// // 		if m2m.SelectedValue == nil {
// // 			continue
// // 		}
// // 		if err := insertOneManyToManyRelation(tx, mainRowID, m2m); err != nil {
// // 			tx.Rollback()
// // 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 			http.Error(w, "virhe M2M-liitoksen lisäyksessä", http.StatusInternalServerError)
// // 			return
// // 		}
// // 	}

// // 	// Kommitointi
// // 	if err := tx.Commit(); err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	// Mahdolliset triggerit
// // 	insertedRow := map[string]interface{}{"id": mainRowID}
// // 	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		// ei välttämättä katkaista
// // 	}

// // 	w.WriteHeader(http.StatusCreated)
// // 	json.NewEncoder(w).Encode(map[string]string{
// // 		"message": "rivi lisätty onnistuneesti",
// // 	})
// // }

// // func insertMainRow(tx *sql.Tx, tableName string, rowData map[string]interface{}) (int64, error) {
// // 	insertColumns := []string{}
// // 	placeholders := []string{}
// // 	values := []interface{}{}

// // 	i := 1
// // 	for col, val := range rowData {
// // 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // 		values = append(values, val)
// // 		i++
// // 	}
// // 	if len(insertColumns) == 0 {
// // 		return 0, fmt.Errorf("ei validia saraketta lisättäväksi")
// // 	}

// // 	insertQuery := fmt.Sprintf(
// // 		"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
// // 		pq.QuoteIdentifier(tableName),
// // 		strings.Join(insertColumns, ", "),
// // 		strings.Join(placeholders, ", "),
// // 	)
// // 	var mainRowID int64
// // 	err := tx.QueryRow(insertQuery, values...).Scan(&mainRowID)
// // 	if err != nil {
// // 		return 0, err
// // 	}
// // 	return mainRowID, nil
// // }

// // // isIntegerType palauttaa true, jos data_type on jonkin sortin integer
// // func isIntegerType(dataType string) bool {
// // 	dataType = strings.ToLower(dataType)
// // 	return strings.Contains(dataType, "int")
// // }

// // // Lapsirivin lisäys (1->moni)
// // func insertSingleChildRow(tx *sql.Tx, mainRowID int64, child ChildRowPayload) error {
// // 	if child.TableName == "" || child.ReferencingColumn == "" {
// // 		return fmt.Errorf("puuttuva lapsidatan kenttä: tableName tai referencingColumn")
// // 	}
// // 	if child.Data == nil {
// // 		return nil
// // 	}

// // 	child.Data[child.ReferencingColumn] = mainRowID

// // 	insertColumns := []string{}
// // 	placeholders := []string{}
// // 	values := []interface{}{}

// // 	i := 1
// // 	for col, val := range child.Data {
// // 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // 		values = append(values, val)
// // 		i++
// // 	}
// // 	if len(insertColumns) == 0 {
// // 		// ei sarakkeita -> ei tehdä mitään
// // 		return nil
// // 	}

// // 	insertQuery := fmt.Sprintf(
// // 		"INSERT INTO %s (%s) VALUES (%s)",
// // 		pq.QuoteIdentifier(child.TableName),
// // 		strings.Join(insertColumns, ", "),
// // 		strings.Join(placeholders, ", "),
// // 	)
// // 	_, err := tx.Exec(insertQuery, values...)
// // 	return err
// // }

// // // Many-to-many -liitoksen lisäys
// // func insertOneManyToManyRelation(tx *sql.Tx, mainRowID int64, m2m ManyToManyPayload) error {
// // 	insertQuery := fmt.Sprintf(
// // 		"INSERT INTO %s (%s, %s) VALUES ($1, $2)",
// // 		pq.QuoteIdentifier(m2m.LinkTableName),
// // 		pq.QuoteIdentifier(m2m.MainTableFkColumn),
// // 		pq.QuoteIdentifier(m2m.ThirdTableFkColumn),
// // 	)
// // 	_, err := tx.Exec(insertQuery, mainRowID, m2m.SelectedValue)
// // 	return err
// // }

// // // // add_row_handler.go
// // // package gt_1_row_create

// // // import (
// // // 	"database/sql"
// // // 	gt_triggers "easelect/backend/general_tables/triggers"
// // // 	backend "easelect/backend/main_app"
// // // 	"encoding/json"
// // // 	"fmt"
// // // 	"net/http"
// // // 	"strconv"
// // // 	"strings"

// // // 	"github.com/lib/pq"
// // // )

// // // type ChildRowPayload struct {
// // // 	TableName         string                 `json:"tableName"`
// // // 	ReferencingColumn string                 `json:"referencingColumn"`
// // // 	Data              map[string]interface{} `json:"data"` // 1 rivi
// // // 	// Jos haluat tukea useita rivejä samaan lapsitauluun, voit laajentaa
// // // 	// Data -> []map[string]interface{}
// // // }

// // // func AddRowHandler(w http.ResponseWriter, r *http.Request, tableName string) {
// // // 	if r.Method != http.MethodPost {
// // // 		http.Error(w, "Only POST requests are allowed", http.StatusMethodNotAllowed)
// // // 		return
// // // 	}

// // // 	var payload map[string]interface{}
// // // 	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "error reading data", http.StatusBadRequest)
// // // 		return
// // // 	}

// // // 	// Poimitaan lapsidata, jos on
// // // 	var childRows []ChildRowPayload
// // // 	if raw := payload["_childRows"]; raw != nil {
// // // 		// Oletetaan, että _childRows on array
// // // 		// (JS: data['_childRows'] = modal_form_state['_childRowsArray'])
// // // 		bytes, err := json.Marshal(raw)
// // // 		if err == nil {
// // // 			json.Unmarshal(bytes, &childRows)
// // // 		}
// // // 		// poista se varsinaisesta datasta, ettei se mene suoraan pään insertin sekaan
// // // 		delete(payload, "_childRows")
// // // 	}

// // // 	schemaName := "public"
// // // 	columnsInfo, err := getAddRowColumnsWithTypes(tableName, schemaName)
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "error fetching columns", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	// Kartta sarake -> data_type
// // // 	columnTypeMap := make(map[string]string)
// // // 	for _, col := range columnsInfo {
// // // 		columnTypeMap[col.ColumnName] = col.DataType
// // // 	}

// // // 	excludeColumns := []string{"id", "created", "updated", "openai_embedding", "creation_spec"}

// // // 	allowedColumns := make(map[string]bool)
// // // 	for _, col := range columnsInfo {
// // // 		colName := col.ColumnName
// // // 		isIdentity := strings.ToUpper(col.IsIdentity) == "YES"
// // // 		if contains(excludeColumns, strings.ToLower(colName)) {
// // // 			continue
// // // 		}
// // // 		if col.GenerationExpression != "" || isIdentity {
// // // 			continue
// // // 		}
// // // 		allowedColumns[colName] = true
// // // 	}

// // // 	// suodatetaan päärivin data
// // // 	filteredRow := make(map[string]interface{})
// // // 	for col, val := range payload {
// // // 		if allowedColumns[col] {
// // // 			colType := columnTypeMap[col]
// // // 			// jos integer-tyyppinen ja val on string, parsi int
// // // 			if isIntegerType(colType) {
// // // 				switch raw := val.(type) {
// // // 				case string:
// // // 					trimmed := strings.TrimSpace(raw)
// // // 					if trimmed == "" {
// // // 						val = nil
// // // 					} else {
// // // 						parsedVal, parseErr := strconv.Atoi(trimmed)
// // // 						if parseErr != nil {
// // // 							fmt.Printf("\033[31mvirhe: %s\033[0m\n", parseErr.Error())
// // // 							http.Error(w, fmt.Sprintf("invalid integer value for column %s", col), http.StatusBadRequest)
// // // 							return
// // // 						}
// // // 						val = parsedVal
// // // 					}
// // // 				}
// // // 			}
// // // 			filteredRow[col] = val
// // // 		}
// // // 	}

// // // 	tx, err := backend.Db.Begin()
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "virhe aloitettaessa transaktiota", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	// 1) lisätään päärivi
// // // 	mainRowID, err := insertMainRow(tx, tableName, filteredRow)
// // // 	if err != nil {
// // // 		tx.Rollback()
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	// 2) käydään läpi lapsirivit
// // // 	for _, child := range childRows {
// // // 		err := insertSingleChildRow(tx, mainRowID, child)
// // // 		if err != nil {
// // // 			tx.Rollback()
// // // 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
// // // 			return
// // // 		}
// // // 	}

// // // 	// commitoi
// // // 	if err := tx.Commit(); err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	// (mahdolliset triggerit)
// // // 	insertedRow := map[string]interface{}{
// // // 		"id": mainRowID,
// // // 	}
// // // 	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		// ei välttämättä katkaista
// // // 	}

// // // 	w.WriteHeader(http.StatusCreated)
// // // 	json.NewEncoder(w).Encode(map[string]string{
// // // 		"message": "rivi lisätty onnistuneesti",
// // // 	})
// // // }

// // // func insertMainRow(tx *sql.Tx, tableName string, rowData map[string]interface{}) (int64, error) {
// // // 	insertColumns := []string{}
// // // 	placeholders := []string{}
// // // 	values := []interface{}{}

// // // 	i := 1
// // // 	for col, val := range rowData {
// // // 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// // // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // // 		values = append(values, val)
// // // 		i++
// // // 	}
// // // 	if len(insertColumns) == 0 {
// // // 		return 0, fmt.Errorf("ei validia saraketta lisättäväksi")
// // // 	}

// // // 	insertQuery := fmt.Sprintf(
// // // 		"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
// // // 		pq.QuoteIdentifier(tableName),
// // // 		strings.Join(insertColumns, ", "),
// // // 		strings.Join(placeholders, ", "),
// // // 	)

// // // 	var mainRowID int64
// // // 	err := tx.QueryRow(insertQuery, values...).Scan(&mainRowID)
// // // 	if err != nil {
// // // 		return 0, err
// // // 	}
// // // 	return mainRowID, nil
// // // }

// // // // insertSingleChildRow lisää yhden rivin lapsitauluun
// // // func insertSingleChildRow(tx *sql.Tx, mainRowID int64, child ChildRowPayload) error {
// // // 	if child.TableName == "" || child.ReferencingColumn == "" {
// // // 		return fmt.Errorf("puuttuva lapsidatan kenttä: tableName tai referencingColumn")
// // // 	}
// // // 	if child.Data == nil {
// // // 		// Ei dataa, ei lisättävää
// // // 		return nil
// // // 	}

// // // 	// aseta mainRowID lapsirivin referencingColumnille
// // // 	child.Data[child.ReferencingColumn] = mainRowID

// // // 	// Rakennetaan INSERT
// // // 	insertColumns := []string{}
// // // 	placeholders := []string{}
// // // 	values := []interface{}{}

// // // 	i := 1
// // // 	for col, val := range child.Data {
// // // 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// // // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // // 		values = append(values, val)
// // // 		i++
// // // 	}
// // // 	if len(insertColumns) == 0 {
// // // 		// ei sarakkeita -> ei tehdä mitään
// // // 		return nil
// // // 	}

// // // 	insertQuery := fmt.Sprintf(
// // // 		"INSERT INTO %s (%s) VALUES (%s)",
// // // 		pq.QuoteIdentifier(child.TableName),
// // // 		strings.Join(insertColumns, ", "),
// // // 		strings.Join(placeholders, ", "),
// // // 	)

// // // 	_, err := tx.Exec(insertQuery, values...)
// // // 	return err
// // // }

// // // // // insertChildRowDynamically lisää yhden lapsirivin; childData on muotoa:
// // // // //
// // // // //	{
// // // // //	  "tableName": "locations",
// // // // //	  "referencingColumn": "service_id",
// // // // //	  "data": {
// // // // //	      "location_name": "foo",
// // // // //	      "description": "bar"
// // // // //	  }
// // // // //	}
// // // // //
// // // // // mainRowID asetetaan lapsirivin referencingColumn-sarakkeelle.
// // // // func insertChildRowDynamically(tx *sql.Tx, mainRowID int64, childData map[string]interface{}) error {
// // // // 	childTableRaw, hasCT := childData["tableName"]
// // // // 	refColRaw, hasRC := childData["referencingColumn"]
// // // // 	dataRaw, hasData := childData["data"]

// // // // 	if !hasCT || !hasRC || !hasData {
// // // // 		return fmt.Errorf("puuttuva lapsidatan kenttä")
// // // // 	}

// // // // 	childTable, ok1 := childTableRaw.(string)
// // // // 	referencingColumn, ok2 := refColRaw.(string)
// // // // 	childRow, ok3 := dataRaw.(map[string]interface{})
// // // // 	if !ok1 || !ok2 || !ok3 {
// // // // 		return fmt.Errorf("virheellinen lapsidatan tyyppi")
// // // // 	}

// // // // 	// asetetaan mainRowID referencingColumnille
// // // // 	childRow[referencingColumn] = mainRowID

// // // // 	// Rakennetaan insert
// // // // 	insertColumns := []string{}
// // // // 	placeholders := []string{}
// // // // 	values := []interface{}{}

// // // // 	i := 1
// // // // 	for col, val := range childRow {
// // // // 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// // // // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // // // 		values = append(values, val)
// // // // 		i++
// // // // 	}
// // // // 	if len(insertColumns) == 0 {
// // // // 		return fmt.Errorf("ei lapsisarakkeita lisättäväksi")
// // // // 	}

// // // // 	insertQuery := fmt.Sprintf(
// // // // 		"INSERT INTO %s (%s) VALUES (%s)",
// // // // 		pq.QuoteIdentifier(childTable),
// // // // 		strings.Join(insertColumns, ", "),
// // // // 		strings.Join(placeholders, ", "),
// // // // 	)
// // // // 	_, err := tx.Exec(insertQuery, values...)
// // // // 	return err
// // // // }

// // // // isIntegerType palauttaa true, jos data_type on jonkin sortin integer
// // // func isIntegerType(dataType string) bool {
// // // 	dataType = strings.ToLower(dataType)
// // // 	return strings.Contains(dataType, "int")
// // // }

// // // // // Modify getColumnNamesAndTypes to fetch column names and data types
// // // // func getColumnNamesAndTypes(tableName string) ([]string, []string, error) {
// // // // 	query := `
// // // //         SELECT column_name, data_type
// // // //         FROM information_schema.columns
// // // //         WHERE table_name = $1
// // // //         ORDER BY ordinal_position
// // // //     `
// // // // 	rows, err := backend.Db.Query(query, tableName)
// // // // 	if err != nil {
// // // // 		return nil, nil, err
// // // // 	}
// // // // 	defer rows.Close()

// // // // 	var columnNames []string
// // // // 	var dataTypes []string
// // // // 	for rows.Next() {
// // // // 		var columnName string
// // // // 		var dataType string
// // // // 		if err := rows.Scan(&columnName, &dataType); err != nil {
// // // // 			return nil, nil, err
// // // // 		}
// // // // 		columnNames = append(columnNames, columnName)
// // // // 		dataTypes = append(dataTypes, dataType)
// // // // 	}
// // // // 	return columnNames, dataTypes, nil
// // // // }
