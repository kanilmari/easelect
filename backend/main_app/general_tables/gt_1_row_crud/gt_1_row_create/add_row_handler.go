// add_row_multipart.go
package gt_1_row_create

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart" // <-- Tärkeä
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	backend "easelect/backend/main_app"
	gt_triggers "easelect/backend/main_app/general_tables/triggers"
	e_sessions "easelect/backend/main_app/sessions"

	"github.com/lib/pq"
)

// ChildRowPayload ja ManyToManyPayload kuten ennen
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

// AddRowMultipartHandlerWrapper ohjaa /api/add-row-multipart?table=... -pyyntöjä
func AddRowMultipartHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "missing 'table' query parameter", http.StatusBadRequest)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "only POST requests are allowed", http.StatusMethodNotAllowed)
		return
	}
	AddRowMultipartHandler(w, r, tableName)
}

// AddRowMultipartHandler lukee multipart/form-data -pyynnön, jossa
// - jsonPayload (lomakkeen tekstikentät JSON:na)
// - mahdolliset tiedostot lapsitauluille (file_child_0, file_child_1, ...)
//
// Tällä versiolla tallennamme ensin päätaulun rivin, jotta saamme
// luodun mainRowID-arvon. Tiedostot tallennamme polkuun:
//
//	media/<tableUID>/<mainRowID>/<tiedostonimi>
func AddRowMultipartHandler(w http.ResponseWriter, r *http.Request, tableName string) {
	err := r.ParseMultipartForm(50 << 20) // Sallit. esim. 50 MB
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "multipart parse error", http.StatusBadRequest)
		return
	}

	// Haetaan tableUID
	tableUID, err := getTableUID(tableName)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "taululle ei löydy table_uid-arvoa", http.StatusInternalServerError)
		return
	}

	jsonPayload := r.FormValue("jsonPayload")
	if jsonPayload == "" {
		http.Error(w, "jsonPayload puuttuu", http.StatusBadRequest)
		return
	}

	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(jsonPayload), &payload); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe jsonin parsinnassa", http.StatusBadRequest)
		return
	}

	// 1) Lisätään data kantaan (pää, lapsirivit, M2M) -> saamme mainRowID
	mainRowID, err := insertDataAccordingToPayload(w, r, tableName, payload)
	if err != nil {
		// insertDataAccordingToPayload hoitaa virhevastausten antamisen
		return
	}

	// 2) Tallennetaan tiedostot, kun tiedämme jo mainRowID:n
	saveUploadedFiles(w, r.MultipartForm.File, "media", tableUID, mainRowID)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "rivi (ja tiedostot) lisätty onnistuneesti",
	})
}

// insertDataAccordingToPayload lisää päätaulun rivin, lapsirivit ja M2M-liitokset.
// Palauttaa luodun päärivin id-arvon (mainRowID).
func insertDataAccordingToPayload(w http.ResponseWriter, r *http.Request, tableName string, payload map[string]interface{}) (int64, error) {
	currentUserID, err := getCurrentUserID(r)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "käyttäjätunnusta ei voitu hakea", http.StatusInternalServerError)
		return 0, err
	}

	// Erota lapsirivit ja M2M
	var childRows []ChildRowPayload
	if raw := payload["_childRows"]; raw != nil {
		bytes, err := json.Marshal(raw)
		if err == nil {
			json.Unmarshal(bytes, &childRows)
		}
		delete(payload, "_childRows")
	}

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
		http.Error(w, "virhe sarakkeiden haussa", http.StatusInternalServerError)
		return 0, err
	}

	columnTypeMap := make(map[string]string)
	for _, col := range columnsInfo {
		columnTypeMap[col.ColumnName] = col.DataType
	}

	excludeColumns := []string{"id", "created", "updated", "openai_embedding", "creation_spec"}
	allowedColumns := map[string]bool{}
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

	// Suodatetaan vain sallitut sarakkeet pään riviltä
	filteredRow := map[string]interface{}{}
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
							http.Error(w, "invalid integer value for "+colName, http.StatusBadRequest)
							return 0, parseErr
						}
						val = parsedVal
					}
				}
			}
			filteredRow[colName] = val
		}
	}

	// Tarkistetaan source_insert_specs (esim. user_id = currentUser)
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
		http.Error(w, "virhe transaktion aloituksessa", http.StatusInternalServerError)
		return 0, err
	}

	// 1) Päärivi
	mainRowID, err := insertMainRow(tx, tableName, filteredRow, columnTypeMap)
	if err != nil {
		tx.Rollback()
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
		return 0, err
	}

	// 2) Lapsirivit
	for _, child := range childRows {
		if err := insertSingleChildRow(tx, mainRowID, child); err != nil {
			tx.Rollback()
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
			return 0, err
		}
	}

	// 3) M2M
	for _, m2m := range manyToManyRows {
		var linkValue interface{} = m2m.SelectedValue
		if m2m.IsNewRow && m2m.NewRowData != nil {
			newID, errNew := insertNewThirdTableRow(tx, m2m.ThirdTableName, m2m.NewRowData)
			if errNew != nil {
				tx.Rollback()
				fmt.Printf("\033[31mvirhe: %s\033[0m\n", errNew.Error())
				http.Error(w, "virhe kolmannen taulun lisäyksessä", http.StatusInternalServerError)
				return 0, errNew
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
			return 0, err
		}
	}

	if err := tx.Commit(); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
		return 0, err
	}

	// Mahdolliset triggerit
	insertedRow := map[string]interface{}{"id": mainRowID}
	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
		fmt.Printf("\033[31mvirhe triggers: %s\033[0m\n", err.Error())
		// jatketaan silti
	}

	return mainRowID, nil
}

// saveUploadedFiles tallentaa lomakkeen tiedostokentät levyyn polkuun:
//
//	media/<tableUID>/<mainRowID>/<tiedostonimi>
func saveUploadedFiles(
	w http.ResponseWriter,
	fileMap map[string][]*multipart.FileHeader,
	baseDir string,
	tableUID string,
	mainRowID int64,
) {
	for fieldName, fhArray := range fileMap {
		if !strings.HasPrefix(fieldName, "file_child_") {
			continue
		}
		if len(fhArray) == 0 {
			continue
		}
		// Tässä esimerkissä käsitellään vain ensimmäinen tiedosto
		fh := fhArray[0]

		srcFile, err := fh.Open()
		if err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe tiedoston avauksessa", http.StatusInternalServerError)
			continue
		}
		defer srcFile.Close()

		// Polku: media/<tableUID>/<mainRowID>
		subFolder := filepath.Join(baseDir, tableUID, fmt.Sprintf("%d", mainRowID))
		err = os.MkdirAll(subFolder, 0755)
		if err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe kansiota luodessa", http.StatusInternalServerError)
			continue
		}

		savePath := filepath.Join(subFolder, fh.Filename)
		dstFile, err := os.Create(savePath)
		if err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe tiedoston luomisessa", http.StatusInternalServerError)
			continue
		}

		_, err = io.Copy(dstFile, srcFile)
		dstFile.Close()
		if err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe tiedostoa tallennettaessa", http.StatusInternalServerError)
			continue
		}
		fmt.Printf("[INFO] tallennettu tiedosto: %s\n", savePath)
	}
}

// getCurrentUserID hakee sessiosta user_id:n (int) tai virheen
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

// getTableUID hakee table_uid-arvon system_db_tables-taulusta
func getTableUID(tableName string) (string, error) {
	var foundUID string
	query := `SELECT table_uid FROM system_db_tables WHERE table_name = $1`
	err := backend.Db.QueryRow(query, tableName).Scan(&foundUID)
	if err != nil {
		return "", err
	}
	return foundUID, nil
}

// insertMainRow lisää päärivin tauluun ja palauttaa luodun rivin id-arvon
func insertMainRow(tx *sql.Tx, tableName string, rowData map[string]interface{}, columnTypeMap map[string]string) (int64, error) {
	insertColumns := []string{}
	placeholders := []string{}
	values := []interface{}{}
	i := 1

	for col, val := range rowData {
		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
		colType := strings.ToLower(columnTypeMap[col])

		// Mahdollinen geometry-tyyppi
		if strings.Contains(colType, "geometry") {
			if val == nil || val == "" {
				val = "POINT(24.9384 60.1699)"
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
		`INSERT INTO %s (%s) VALUES (%s) RETURNING id`,
		pq.QuoteIdentifier(tableName),
		strings.Join(insertColumns, ", "),
		strings.Join(placeholders, ", "),
	)

	var mainRowID int64
	err := tx.QueryRow(insertQuery, values...).Scan(&mainRowID)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return 0, err
	}
	return mainRowID, nil
}

// insertSingleChildRow lisää yksittäisen lapsirivin child.TableName-tauluun
// ja asettaa referencingColumnin arvoksi mainRowID.
func insertSingleChildRow(tx *sql.Tx, mainRowID int64, child ChildRowPayload) error {
	if child.TableName == "" || child.ReferencingColumn == "" {
		return fmt.Errorf("puuttuva lapsidatan kenttä: tableName tai referencingColumn")
	}
	if child.Data == nil {
		return nil
	}
	// Poistetaan _file -kenttä, ettei yritetä SQL:ään
	delete(child.Data, "_file")

	// Lisätään viite päärivin ID:hen
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
		return nil
	}

	insertQuery := fmt.Sprintf(
		`INSERT INTO %s (%s) VALUES (%s)`,
		pq.QuoteIdentifier(child.TableName),
		strings.Join(insertColumns, ", "),
		strings.Join(placeholders, ", "),
	)

	_, err := tx.Exec(insertQuery, values...)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
	}
	return err
}

// insertNewThirdTableRow lisää uuden rivin kolmanteen tauluun (m2m), jos
// sellaista ei vielä ole. Palauttaa luodun rivin ID:n.
func insertNewThirdTableRow(tx *sql.Tx, tableName string, rowData map[string]interface{}) (int64, error) {
	if len(rowData) == 0 {
		return 0, nil
	}

	insertCols := []string{}
	placeholders := []string{}
	values := []interface{}{}
	i := 1

	for col, val := range rowData {
		insertCols = append(insertCols, pq.QuoteIdentifier(col))
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		values = append(values, val)
		i++
	}

	query := fmt.Sprintf(
		`INSERT INTO %s (%s) VALUES (%s) RETURNING id`,
		pq.QuoteIdentifier(tableName),
		strings.Join(insertCols, ", "),
		strings.Join(placeholders, ", "),
	)

	var newID int64
	err := tx.QueryRow(query, values...).Scan(&newID)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return 0, err
	}
	return newID, nil
}

// insertOneManyToManyRelation lisää m2m-suhteen linkkitauluun.
func insertOneManyToManyRelation(tx *sql.Tx, mainRowID int64, m2m ManyToManyPayload) error {
	insertQuery := fmt.Sprintf(
		`INSERT INTO %s (%s, %s) VALUES ($1, $2)`,
		pq.QuoteIdentifier(m2m.LinkTableName),
		pq.QuoteIdentifier(m2m.MainTableFkColumn),
		pq.QuoteIdentifier(m2m.ThirdTableFkColumn),
	)
	_, err := tx.Exec(insertQuery, mainRowID, m2m.SelectedValue)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
	}
	return err
}

// apu-funktio integer-tyypin tarkistukseen
func isIntegerType(dataType string) bool {
	dataType = strings.ToLower(dataType)
	return strings.Contains(dataType, "int")
}

// // add_row_multipart.go
// package gt_1_row_create

// import (
// 	"database/sql"
// 	"encoding/json"
// 	"fmt"
// 	"io"
// 	"mime/multipart" // <-- Tärkeä
// 	"net/http"
// 	"os"
// 	"path/filepath"
// 	"strconv"
// 	"strings"

// 	backend "easelect/backend/main_app"
// 	gt_triggers "easelect/backend/main_app/general_tables/triggers"
// 	e_sessions "easelect/backend/main_app/sessions"

// 	"github.com/lib/pq"
// )

// // ChildRowPayload ja ManyToManyPayload kuten ennen
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

// // AddRowMultipartHandlerWrapper ohjaa /api/add-row-multipart?table=... -pyyntöjä
// func AddRowMultipartHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// 	tableName := r.URL.Query().Get("table")
// 	if tableName == "" {
// 		http.Error(w, "missing 'table' query parameter", http.StatusBadRequest)
// 		return
// 	}
// 	if r.Method != http.MethodPost {
// 		http.Error(w, "only POST requests are allowed", http.StatusMethodNotAllowed)
// 		return
// 	}
// 	AddRowMultipartHandler(w, r, tableName)
// }

// // AddRowMultipartHandler lukee multipart/form-data -pyynnön, jossa
// // - jsonPayload (lomakkeen tekstikentät JSON:na)
// // - mahdolliset tiedostot lapsitauluille (file_child_0, file_child_1, ...)
// // Tiedostot tallennetaan levyyn, vain tiedostonimet menevät kantaan.
// func AddRowMultipartHandler(w http.ResponseWriter, r *http.Request, tableName string) {
// 	err := r.ParseMultipartForm(50 << 20) // sallit. esim. 50 MB
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "multipart parse error", http.StatusBadRequest)
// 		return
// 	}

// 	jsonPayload := r.FormValue("jsonPayload")
// 	if jsonPayload == "" {
// 		http.Error(w, "jsonPayload puuttuu", http.StatusBadRequest)
// 		return
// 	}

// 	var payload map[string]interface{}
// 	if err := json.Unmarshal([]byte(jsonPayload), &payload); err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe jsonin parsinnassa", http.StatusBadRequest)
// 		return
// 	}

// 	// Haetaan table_uid, jotta tiedostot menevät media/table_uid -kansioon
// 	tableUID, err := getTableUID(tableName)
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		// Jos haluat mieluummin sallia sen, ettei table_uid:tä löydy, voit esim. laittaa fallbackin:
// 		// tableUID = "unknown"
// 		// mutta tässä heitetään virhe
// 		http.Error(w, "taululle ei löydy table_uid-arvoa", http.StatusInternalServerError)
// 		return
// 	}

// 	// Tallennetaan tiedostot kovalevylle
// 	saveUploadedFiles(w, r.MultipartForm.File, "media", tableUID)

// 	// Lisätään rivi (pää + lapsi + M2M) kantaan
// 	if err := insertDataAccordingToPayload(w, r, tableName, payload); err != nil {
// 		// insertDataAccordingToPayload hoitaa virhevastausten antamisen
// 		return
// 	}

// 	w.WriteHeader(http.StatusCreated)
// 	json.NewEncoder(w).Encode(map[string]string{
// 		"message": "rivi (ja tiedostot) lisätty onnistuneesti",
// 	})
// }

// // insertDataAccordingToPayload kopioi pitkälti vanhan AddRowHandlerin logiikan
// func insertDataAccordingToPayload(w http.ResponseWriter, r *http.Request, tableName string, payload map[string]interface{}) error {
// 	currentUserID, err := getCurrentUserID(r)
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "käyttäjätunnusta ei voitu hakea", http.StatusInternalServerError)
// 		return err
// 	}

// 	// Erota lapsirivit ja M2M
// 	var childRows []ChildRowPayload
// 	if raw := payload["_childRows"]; raw != nil {
// 		bytes, err := json.Marshal(raw)
// 		if err == nil {
// 			json.Unmarshal(bytes, &childRows)
// 		}
// 		delete(payload, "_childRows")
// 	}

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
// 		http.Error(w, "virhe sarakkeiden haussa", http.StatusInternalServerError)
// 		return err
// 	}

// 	columnTypeMap := make(map[string]string)
// 	for _, col := range columnsInfo {
// 		columnTypeMap[col.ColumnName] = col.DataType
// 	}

// 	excludeColumns := []string{"id", "created", "updated", "openai_embedding", "creation_spec"}
// 	allowedColumns := map[string]bool{}
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

// 	// Suodatetaan vain sallitut sarakkeet pään riviltä
// 	filteredRow := map[string]interface{}{}
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
// 							http.Error(w, "invalid integer value for "+colName, http.StatusBadRequest)
// 							return parseErr
// 						}
// 						val = parsedVal
// 					}
// 				}
// 			}
// 			filteredRow[colName] = val
// 		}
// 	}

// 	// Tarkistetaan source_insert_specs (esim. user_id = currentUser)
// 	for _, col := range columnsInfo {
// 		if col.SourceInsertSpecs != "" {
// 			var specs map[string]string
// 			if err := json.Unmarshal([]byte(col.SourceInsertSpecs), &specs); err == nil {
// 				if val, ok := specs["user_id"]; ok && val == "currentUser" && col.ColumnName == "user_id" {
// 					filteredRow["user_id"] = currentUserID
// 				}
// 			}
// 		}
// 	}

// 	tx, err := backend.Db.Begin()
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe transaktion aloituksessa", http.StatusInternalServerError)
// 		return err
// 	}

// 	// 1) Päärivi
// 	mainRowID, err := insertMainRow(tx, tableName, filteredRow, columnTypeMap)
// 	if err != nil {
// 		tx.Rollback()
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
// 		return err
// 	}

// 	// 2) Lapsirivit
// 	for _, child := range childRows {
// 		if err := insertSingleChildRow(tx, mainRowID, child); err != nil {
// 			tx.Rollback()
// 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
// 			return err
// 		}
// 	}

// 	// 3) M2M
// 	for _, m2m := range manyToManyRows {
// 		var linkValue interface{} = m2m.SelectedValue
// 		if m2m.IsNewRow && m2m.NewRowData != nil {
// 			newID, errNew := insertNewThirdTableRow(tx, m2m.ThirdTableName, m2m.NewRowData)
// 			if errNew != nil {
// 				tx.Rollback()
// 				fmt.Printf("\033[31mvirhe: %s\033[0m\n", errNew.Error())
// 				http.Error(w, "virhe kolmannen taulun lisäyksessä", http.StatusInternalServerError)
// 				return errNew
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
// 			return err
// 		}
// 	}

// 	if err := tx.Commit(); err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
// 		return err
// 	}

// 	// Mahdolliset triggerit
// 	insertedRow := map[string]interface{}{"id": mainRowID}
// 	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
// 		fmt.Printf("\033[31mvirhe triggers: %s\033[0m\n", err.Error())
// 		// jatketaan silti
// 	}

// 	return nil
// }

// // saveUploadedFiles tallentaa lomakkeen tiedostokentät levyyn.
// // Nyt se tallentaa media/<tableUID>/<tiedostonimi>
// func saveUploadedFiles(w http.ResponseWriter, fileMap map[string][]*multipart.FileHeader, baseDir string, tableUID string) {
// 	for fieldName, fhArray := range fileMap {
// 		if !strings.HasPrefix(fieldName, "file_child_") {
// 			continue
// 		}
// 		if len(fhArray) == 0 {
// 			continue
// 		}
// 		// Tässä esimerkissä vain ensimmäinen
// 		fh := fhArray[0]

// 		srcFile, err := fh.Open()
// 		if err != nil {
// 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 			http.Error(w, "virhe tiedoston avauksessa", http.StatusInternalServerError)
// 			continue
// 		}
// 		defer srcFile.Close()

// 		subFolder := filepath.Join(baseDir, tableUID)
// 		err = os.MkdirAll(subFolder, 0755)
// 		if err != nil {
// 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 			http.Error(w, "virhe kansiota luodessa", http.StatusInternalServerError)
// 			continue
// 		}

// 		savePath := filepath.Join(subFolder, fh.Filename)

// 		dstFile, err := os.Create(savePath)
// 		if err != nil {
// 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 			http.Error(w, "virhe tiedoston luomisessa", http.StatusInternalServerError)
// 			continue
// 		}

// 		_, err = io.Copy(dstFile, srcFile)
// 		dstFile.Close()
// 		if err != nil {
// 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 			http.Error(w, "virhe tiedostoa tallennettaessa", http.StatusInternalServerError)
// 			continue
// 		}
// 		fmt.Printf("[INFO] tallennettu tiedosto: %s\n", savePath)
// 	}
// }

// // getCurrentUserID jne.
// func getCurrentUserID(r *http.Request) (int, error) {
// 	store := e_sessions.GetStore()
// 	session, err := store.Get(r, "session")
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		return 0, fmt.Errorf("session get error: %v", err)
// 	}
// 	rawUserID, ok := session.Values["user_id"]
// 	if !ok {
// 		fmt.Printf("\033[31mvirhe: käyttäjän ID puuttuu sessiosta\033[0m\n")
// 		return 0, fmt.Errorf("käyttäjän ID puuttuu sessiosta")
// 	}
// 	userID, ok := rawUserID.(int)
// 	if !ok {
// 		fmt.Printf("\033[31mvirhe: käyttäjän ID on väärää tyyppiä sessiossa\033[0m\n")
// 		return 0, fmt.Errorf("user ID invalid type in session")
// 	}
// 	return userID, nil
// }

// // getTableUID hakee table_uid-arvon system_db_tables-taulusta
// func getTableUID(tableName string) (string, error) {
// 	var foundUID string
// 	query := `SELECT table_uid FROM system_db_tables WHERE table_name = $1`
// 	err := backend.Db.QueryRow(query, tableName).Scan(&foundUID)
// 	if err != nil {
// 		return "", err
// 	}
// 	return foundUID, nil
// }

// func insertMainRow(tx *sql.Tx, tableName string, rowData map[string]interface{}, columnTypeMap map[string]string) (int64, error) {
// 	insertColumns := []string{}
// 	placeholders := []string{}
// 	values := []interface{}{}
// 	i := 1

// 	for col, val := range rowData {
// 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// 		colType := strings.ToLower(columnTypeMap[col])

// 		if strings.Contains(colType, "geometry") {
// 			if val == nil || val == "" {
// 				val = "POINT(24.9384 60.1699)"
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
// 		`INSERT INTO %s (%s) VALUES (%s) RETURNING id`,
// 		pq.QuoteIdentifier(tableName),
// 		strings.Join(insertColumns, ", "),
// 		strings.Join(placeholders, ", "),
// 	)

// 	var mainRowID int64
// 	err := tx.QueryRow(insertQuery, values...).Scan(&mainRowID)
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		return 0, err
// 	}
// 	return mainRowID, nil
// }

// func insertSingleChildRow(tx *sql.Tx, mainRowID int64, child ChildRowPayload) error {
// 	if child.TableName == "" || child.ReferencingColumn == "" {
// 		return fmt.Errorf("puuttuva lapsidatan kenttä: tableName tai referencingColumn")
// 	}
// 	if child.Data == nil {
// 		return nil
// 	}
// 	// Poistetaan _file -kenttä, ettei yritetä SQL:ään
// 	delete(child.Data, "_file")

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
// 		return nil
// 	}

// 	insertQuery := fmt.Sprintf(
// 		`INSERT INTO %s (%s) VALUES (%s)`,
// 		pq.QuoteIdentifier(child.TableName),
// 		strings.Join(insertColumns, ", "),
// 		strings.Join(placeholders, ", "),
// 	)

// 	_, err := tx.Exec(insertQuery, values...)
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 	}
// 	return err
// }

// func insertNewThirdTableRow(tx *sql.Tx, tableName string, rowData map[string]interface{}) (int64, error) {
// 	if len(rowData) == 0 {
// 		return 0, nil
// 	}
// 	insertCols := []string{}
// 	placeholders := []string{}
// 	values := []interface{}{}
// 	i := 1

// 	for col, val := range rowData {
// 		insertCols = append(insertCols, pq.QuoteIdentifier(col))
// 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// 		values = append(values, val)
// 		i++
// 	}
// 	query := fmt.Sprintf(
// 		`INSERT INTO %s (%s) VALUES (%s) RETURNING id`,
// 		pq.QuoteIdentifier(tableName),
// 		strings.Join(insertCols, ", "),
// 		strings.Join(placeholders, ", "),
// 	)

// 	var newID int64
// 	err := tx.QueryRow(query, values...).Scan(&newID)
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		return 0, err
// 	}
// 	return newID, nil
// }

// func insertOneManyToManyRelation(tx *sql.Tx, mainRowID int64, m2m ManyToManyPayload) error {
// 	insertQuery := fmt.Sprintf(
// 		`INSERT INTO %s (%s, %s) VALUES ($1, $2)`,
// 		pq.QuoteIdentifier(m2m.LinkTableName),
// 		pq.QuoteIdentifier(m2m.MainTableFkColumn),
// 		pq.QuoteIdentifier(m2m.ThirdTableFkColumn),
// 	)
// 	_, err := tx.Exec(insertQuery, mainRowID, m2m.SelectedValue)
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 	}
// 	return err
// }

// func isIntegerType(dataType string) bool {
// 	dataType = strings.ToLower(dataType)
// 	return strings.Contains(dataType, "int")
// }

// // // add_row_multipart.go
// // package gt_1_row_create

// // import (
// // 	"database/sql"
// // 	"encoding/json"
// // 	"fmt"
// // 	"io"
// // 	"mime/multipart" // <-- Tärkeä
// // 	"net/http"
// // 	"os"
// // 	"path/filepath"
// // 	"strconv"
// // 	"strings"

// // 	backend "easelect/backend/main_app"
// // 	gt_triggers "easelect/backend/main_app/general_tables/triggers"
// // 	e_sessions "easelect/backend/main_app/sessions"

// // 	"github.com/lib/pq"
// // )

// // // ChildRowPayload ja ManyToManyPayload kuten ennen
// // type ChildRowPayload struct {
// // 	TableName         string                 `json:"tableName"`
// // 	ReferencingColumn string                 `json:"referencingColumn"`
// // 	Data              map[string]interface{} `json:"data"`
// // }

// // type ManyToManyPayload struct {
// // 	LinkTableName      string                 `json:"linkTableName"`
// // 	MainTableFkColumn  string                 `json:"mainTableFkColumn"`
// // 	ThirdTableName     string                 `json:"thirdTableName"`
// // 	ThirdTableFkColumn string                 `json:"thirdTableFkColumn"`
// // 	SelectedValue      interface{}            `json:"selectedValue"`
// // 	IsNewRow           bool                   `json:"isNewRow"`
// // 	NewRowData         map[string]interface{} `json:"newRowData,omitempty"`
// // }

// // // AddRowMultipartHandlerWrapper ohjaa /api/add-row-multipart?table=... -pyyntöjä
// // func AddRowMultipartHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// // 	tableName := r.URL.Query().Get("table")
// // 	if tableName == "" {
// // 		http.Error(w, "missing 'table' query parameter", http.StatusBadRequest)
// // 		return
// // 	}
// // 	if r.Method != http.MethodPost {
// // 		http.Error(w, "only POST requests are allowed", http.StatusMethodNotAllowed)
// // 		return
// // 	}
// // 	AddRowMultipartHandler(w, r, tableName)
// // }

// // // AddRowMultipartHandler lukee multipart/form-data -pyynnön, jossa
// // // - jsonPayload (lomakkeen tekstikentät JSON:na)
// // // - mahdolliset tiedostot lapsitauluille (file_child_0, file_child_1, ...)
// // // Tiedostot tallennetaan levyyn, vain tiedostonimet menevät kantaan.
// // func AddRowMultipartHandler(w http.ResponseWriter, r *http.Request, tableName string) {
// // 	err := r.ParseMultipartForm(50 << 20) // Sallit. esim. 50 MB
// // 	if err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(w, "multipart parse error", http.StatusBadRequest)
// // 		return
// // 	}

// // 	jsonPayload := r.FormValue("jsonPayload")
// // 	if jsonPayload == "" {
// // 		http.Error(w, "jsonPayload puuttuu", http.StatusBadRequest)
// // 		return
// // 	}

// // 	var payload map[string]interface{}
// // 	if err := json.Unmarshal([]byte(jsonPayload), &payload); err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(w, "virhe jsonin parsinnassa", http.StatusBadRequest)
// // 		return
// // 	}

// // 	// Tallennetaan tiedostot kovalevylle
// // 	saveUploadedFiles(w, r.MultipartForm.File, "media")

// // 	// Lisätään rivi (pää + lapsi + M2M) kantaan
// // 	if err := insertDataAccordingToPayload(w, r, tableName, payload); err != nil {
// // 		// insertDataAccordingToPayload hoitaa virhevastausten antamisen
// // 		return
// // 	}

// // 	w.WriteHeader(http.StatusCreated)
// // 	json.NewEncoder(w).Encode(map[string]string{
// // 		"message": "rivi (ja tiedostot) lisätty onnistuneesti",
// // 	})
// // }

// // // insertDataAccordingToPayload kopioi pitkälti vanhan AddRowHandlerin logiikan
// // func insertDataAccordingToPayload(w http.ResponseWriter, r *http.Request, tableName string, payload map[string]interface{}) error {
// // 	currentUserID, err := getCurrentUserID(r)
// // 	if err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(w, "käyttäjätunnusta ei voitu hakea", http.StatusInternalServerError)
// // 		return err
// // 	}

// // 	// Erota lapsirivit ja M2M
// // 	var childRows []ChildRowPayload
// // 	if raw := payload["_childRows"]; raw != nil {
// // 		bytes, err := json.Marshal(raw)
// // 		if err == nil {
// // 			json.Unmarshal(bytes, &childRows)
// // 		}
// // 		delete(payload, "_childRows")
// // 	}

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
// // 		http.Error(w, "virhe sarakkeiden haussa", http.StatusInternalServerError)
// // 		return err
// // 	}

// // 	columnTypeMap := make(map[string]string)
// // 	for _, col := range columnsInfo {
// // 		columnTypeMap[col.ColumnName] = col.DataType
// // 	}

// // 	excludeColumns := []string{"id", "created", "updated", "openai_embedding", "creation_spec"}
// // 	allowedColumns := map[string]bool{}
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

// // 	// Suodatetaan vain sallitut sarakkeet pään riviltä
// // 	filteredRow := map[string]interface{}{}
// // 	for colName, val := range payload {
// // 		if allowedColumns[colName] {
// // 			colType := columnTypeMap[colName]
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
// // 							http.Error(w, "invalid integer value for "+colName, http.StatusBadRequest)
// // 							return parseErr
// // 						}
// // 						val = parsedVal
// // 					}
// // 				}
// // 			}
// // 			filteredRow[colName] = val
// // 		}
// // 	}

// // 	// Tarkistetaan source_insert_specs (esim. user_id = currentUser)
// // 	for _, col := range columnsInfo {
// // 		if col.SourceInsertSpecs != "" {
// // 			var specs map[string]string
// // 			if err := json.Unmarshal([]byte(col.SourceInsertSpecs), &specs); err == nil {
// // 				if val, ok := specs["user_id"]; ok && val == "currentUser" && col.ColumnName == "user_id" {
// // 					filteredRow["user_id"] = currentUserID
// // 				}
// // 			}
// // 		}
// // 	}

// // 	tx, err := backend.Db.Begin()
// // 	if err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(w, "virhe transaktion aloituksessa", http.StatusInternalServerError)
// // 		return err
// // 	}

// // 	// 1) Päärivi
// // 	mainRowID, err := insertMainRow(tx, tableName, filteredRow, columnTypeMap)
// // 	if err != nil {
// // 		tx.Rollback()
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
// // 		return err
// // 	}

// // 	// 2) Lapsirivit
// // 	for _, child := range childRows {
// // 		if err := insertSingleChildRow(tx, mainRowID, child); err != nil {
// // 			tx.Rollback()
// // 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
// // 			return err
// // 		}
// // 	}

// // 	// 3) M2M
// // 	for _, m2m := range manyToManyRows {
// // 		var linkValue interface{} = m2m.SelectedValue
// // 		if m2m.IsNewRow && m2m.NewRowData != nil {
// // 			newID, errNew := insertNewThirdTableRow(tx, m2m.ThirdTableName, m2m.NewRowData)
// // 			if errNew != nil {
// // 				tx.Rollback()
// // 				fmt.Printf("\033[31mvirhe: %s\033[0m\n", errNew.Error())
// // 				http.Error(w, "virhe kolmannen taulun lisäyksessä", http.StatusInternalServerError)
// // 				return errNew
// // 			}
// // 			linkValue = newID
// // 		}
// // 		if linkValue == nil {
// // 			continue
// // 		}
// // 		if err := insertOneManyToManyRelation(tx, mainRowID, ManyToManyPayload{
// // 			LinkTableName:      m2m.LinkTableName,
// // 			MainTableFkColumn:  m2m.MainTableFkColumn,
// // 			ThirdTableFkColumn: m2m.ThirdTableFkColumn,
// // 			SelectedValue:      linkValue,
// // 		}); err != nil {
// // 			tx.Rollback()
// // 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 			http.Error(w, "virhe M2M-liitoksen lisäyksessä", http.StatusInternalServerError)
// // 			return err
// // 		}
// // 	}

// // 	if err := tx.Commit(); err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
// // 		return err
// // 	}

// // 	// Mahdolliset triggerit
// // 	insertedRow := map[string]interface{}{"id": mainRowID}
// // 	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
// // 		fmt.Printf("\033[31mvirhe triggers: %s\033[0m\n", err.Error())
// // 		// jatketaan silti
// // 	}

// // 	return nil
// // }

// // // saveUploadedFiles tallentaa lomakkeen tiedostokentät levyyn.
// // // Huom: Käytetään mime/multipart.FileHeader, ei net/http.FileHeader
// // func saveUploadedFiles(w http.ResponseWriter, fileMap map[string][]*multipart.FileHeader, baseDir string) {
// // 	for fieldName, fhArray := range fileMap {
// // 		if !strings.HasPrefix(fieldName, "file_child_") {
// // 			continue
// // 		}
// // 		if len(fhArray) == 0 {
// // 			continue
// // 		}
// // 		// Tässä esimerkissä vain ensimmäinen
// // 		fh := fhArray[0]

// // 		srcFile, err := fh.Open()
// // 		if err != nil {
// // 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 			http.Error(w, "virhe tiedoston avauksessa", http.StatusInternalServerError)
// // 			continue
// // 		}
// // 		defer srcFile.Close()

// // 		err = os.MkdirAll(baseDir, 0755)
// // 		if err != nil {
// // 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 			http.Error(w, "virhe kansiota luodessa", http.StatusInternalServerError)
// // 			continue
// // 		}
// // 		savePath := filepath.Join(baseDir, fh.Filename)

// // 		dstFile, err := os.Create(savePath)
// // 		if err != nil {
// // 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 			http.Error(w, "virhe tiedoston luomisessa", http.StatusInternalServerError)
// // 			continue
// // 		}

// // 		_, err = io.Copy(dstFile, srcFile)
// // 		dstFile.Close()
// // 		if err != nil {
// // 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 			http.Error(w, "virhe tiedostoa tallennettaessa", http.StatusInternalServerError)
// // 			continue
// // 		}
// // 		fmt.Printf("[INFO] tallennettu tiedosto: %s\n", savePath)
// // 	}
// // }

// // // getCurrentUserID jne. (kopioitu)
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

// // // insertMainRow, insertSingleChildRow, insertNewThirdTableRow, insertOneManyToManyRelation
// // // noudattavat samaa logiikkaa kuin aiemmin:

// // func insertMainRow(tx *sql.Tx, tableName string, rowData map[string]interface{}, columnTypeMap map[string]string) (int64, error) {
// // 	insertColumns := []string{}
// // 	placeholders := []string{}
// // 	values := []interface{}{}
// // 	i := 1

// // 	for col, val := range rowData {
// // 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// // 		colType := strings.ToLower(columnTypeMap[col])

// // 		if strings.Contains(colType, "geometry") {
// // 			if val == nil || val == "" {
// // 				val = "POINT(24.9384 60.1699)"
// // 			}
// // 			placeholders = append(placeholders, fmt.Sprintf("ST_GeomFromText($%d, 4326)", i))
// // 			values = append(values, val)
// // 			i++
// // 			continue
// // 		}
// // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // 		values = append(values, val)
// // 		i++
// // 	}

// // 	if len(insertColumns) == 0 {
// // 		return 0, fmt.Errorf("ei validia saraketta lisättäväksi taulussa %s", tableName)
// // 	}

// // 	insertQuery := fmt.Sprintf(
// // 		`INSERT INTO %s (%s) VALUES (%s) RETURNING id`,
// // 		pq.QuoteIdentifier(tableName),
// // 		strings.Join(insertColumns, ", "),
// // 		strings.Join(placeholders, ", "),
// // 	)

// // 	var mainRowID int64
// // 	err := tx.QueryRow(insertQuery, values...).Scan(&mainRowID)
// // 	if err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		return 0, err
// // 	}
// // 	return mainRowID, nil
// // }

// // func insertSingleChildRow(tx *sql.Tx, mainRowID int64, child ChildRowPayload) error {
// // 	if child.TableName == "" || child.ReferencingColumn == "" {
// // 		return fmt.Errorf("puuttuva lapsidatan kenttä: tableName tai referencingColumn")
// // 	}
// // 	if child.Data == nil {
// // 		return nil
// // 	}
// // 	// Poistetaan _file -kenttä, ettei yritetä SQL:ään
// // 	delete(child.Data, "_file")

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
// // 		return nil
// // 	}

// // 	insertQuery := fmt.Sprintf(
// // 		`INSERT INTO %s (%s) VALUES (%s)`,
// // 		pq.QuoteIdentifier(child.TableName),
// // 		strings.Join(insertColumns, ", "),
// // 		strings.Join(placeholders, ", "),
// // 	)

// // 	_, err := tx.Exec(insertQuery, values...)
// // 	if err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 	}
// // 	return err
// // }

// // func insertNewThirdTableRow(tx *sql.Tx, tableName string, rowData map[string]interface{}) (int64, error) {
// // 	if len(rowData) == 0 {
// // 		return 0, nil
// // 	}
// // 	insertCols := []string{}
// // 	placeholders := []string{}
// // 	values := []interface{}{}
// // 	i := 1

// // 	for col, val := range rowData {
// // 		insertCols = append(insertCols, pq.QuoteIdentifier(col))
// // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // 		values = append(values, val)
// // 		i++
// // 	}
// // 	query := fmt.Sprintf(
// // 		`INSERT INTO %s (%s) VALUES (%s) RETURNING id`,
// // 		pq.QuoteIdentifier(tableName),
// // 		strings.Join(insertCols, ", "),
// // 		strings.Join(placeholders, ", "),
// // 	)

// // 	var newID int64
// // 	err := tx.QueryRow(query, values...).Scan(&newID)
// // 	if err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		return 0, err
// // 	}
// // 	return newID, nil
// // }

// // func insertOneManyToManyRelation(tx *sql.Tx, mainRowID int64, m2m ManyToManyPayload) error {
// // 	insertQuery := fmt.Sprintf(
// // 		`INSERT INTO %s (%s, %s) VALUES ($1, $2)`,
// // 		pq.QuoteIdentifier(m2m.LinkTableName),
// // 		pq.QuoteIdentifier(m2m.MainTableFkColumn),
// // 		pq.QuoteIdentifier(m2m.ThirdTableFkColumn),
// // 	)
// // 	_, err := tx.Exec(insertQuery, mainRowID, m2m.SelectedValue)
// // 	if err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 	}
// // 	return err
// // }

// // func isIntegerType(dataType string) bool {
// // 	dataType = strings.ToLower(dataType)
// // 	return strings.Contains(dataType, "int")
// // }

// // // func contains(arr []string, val string) bool {
// // // 	for _, a := range arr {
// // // 		if a == val {
// // // 			return true
// // // 		}
// // // 	}
// // // 	return false
// // // }

// // // // Apufunktiot
// // // func contains(arr []string, val string) bool {
// // // 	for _, a := range arr {
// // // 		if a == val {
// // // 			return true
// // // 		}
// // // 	}
// // // 	return false
// // // }

// // // // add_row_handler.go
// // // package gt_1_row_create

// // // import (
// // // 	"database/sql"
// // // 	backend "easelect/backend/main_app"
// // // 	gt_triggers "easelect/backend/main_app/general_tables/triggers"
// // // 	e_sessions "easelect/backend/main_app/sessions"
// // // 	"encoding/json"
// // // 	"fmt"
// // // 	"net/http"
// // // 	"strconv"
// // // 	"strings"

// // // 	"github.com/lib/pq"
// // // )

// // // func AddRowHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// // // 	tableName := r.URL.Query().Get("table")
// // // 	if tableName == "" {
// // // 		http.Error(w, "Missing 'table' query parameter", http.StatusBadRequest)
// // // 		return
// // // 	}
// // // 	AddRowHandler(w, r, tableName)
// // // }

// // // type ChildRowPayload struct {
// // // 	TableName         string                 `json:"tableName"`
// // // 	ReferencingColumn string                 `json:"referencingColumn"`
// // // 	Data              map[string]interface{} `json:"data"`
// // // }

// // // type ManyToManyPayload struct {
// // // 	LinkTableName      string                 `json:"linkTableName"`
// // // 	MainTableFkColumn  string                 `json:"mainTableFkColumn"`
// // // 	ThirdTableName     string                 `json:"thirdTableName"`
// // // 	ThirdTableFkColumn string                 `json:"thirdTableFkColumn"`
// // // 	SelectedValue      interface{}            `json:"selectedValue"`
// // // 	IsNewRow           bool                   `json:"isNewRow"`
// // // 	NewRowData         map[string]interface{} `json:"newRowData,omitempty"`
// // // }

// // // func AddRowHandler(w http.ResponseWriter, r *http.Request, tableName string) {
// // // 	if r.Method != http.MethodPost {
// // // 		http.Error(w, "Only POST requests are allowed", http.StatusMethodNotAllowed)
// // // 		return
// // // 	}

// // // 	var payload map[string]interface{}
// // // 	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
// // // 		fmt.Printf("\033[31mvirhe AddRowHandler: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "error reading data", http.StatusBadRequest)
// // // 		return
// // // 	}

// // // 	// Haetaan nykyisen käyttäjän tunniste
// // // 	currentUserID, err := getCurrentUserID(r)
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31mvirhe AddRowHandler: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "virhe käyttäjätunnuksen haussa", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	// Poimitaan lapsidata 1->moni
// // // 	var childRows []ChildRowPayload
// // // 	if raw := payload["_childRows"]; raw != nil {
// // // 		bytes, err := json.Marshal(raw)
// // // 		if err == nil {
// // // 			json.Unmarshal(bytes, &childRows)
// // // 		}
// // // 		delete(payload, "_childRows")
// // // 	}

// // // 	// Poimitaan monesta->moneen
// // // 	var manyToManyRows []ManyToManyPayload
// // // 	if raw := payload["_manyToMany"]; raw != nil {
// // // 		bytes, err := json.Marshal(raw)
// // // 		if err == nil {
// // // 			json.Unmarshal(bytes, &manyToManyRows)
// // // 		}
// // // 		delete(payload, "_manyToMany")
// // // 	}

// // // 	schemaName := "public"
// // // 	columnsInfo, err := getAddRowColumnsWithTypes(tableName, schemaName)
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31mvirhe AddRowHandler: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "error fetching columns", http.StatusInternalServerError)
// // // 		return
// // // 	}

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

// // // 	filteredRow := make(map[string]interface{})
// // // 	for colName, val := range payload {
// // // 		if allowedColumns[colName] {
// // // 			colType := columnTypeMap[colName]
// // // 			if isIntegerType(colType) {
// // // 				switch raw := val.(type) {
// // // 				case string:
// // // 					trimmed := strings.TrimSpace(raw)
// // // 					if trimmed == "" {
// // // 						val = nil
// // // 					} else {
// // // 						parsedVal, parseErr := strconv.Atoi(trimmed)
// // // 						if parseErr != nil {
// // // 							fmt.Printf("\033[31mvirhe AddRowHandler: %s\033[0m\n", parseErr.Error())
// // // 							http.Error(w, fmt.Sprintf("invalid integer value for column %s", colName), http.StatusBadRequest)
// // // 							return
// // // 						}
// // // 						val = parsedVal
// // // 					}
// // // 				}
// // // 			}
// // // 			filteredRow[colName] = val
// // // 		}
// // // 	}

// // // 	// Tarkistetaan source_insert_specs ja asetetaan user_id, jos tarpeen
// // // 	for _, col := range columnsInfo {
// // // 		if col.SourceInsertSpecs != "" {
// // // 			var specs map[string]string
// // // 			if err := json.Unmarshal([]byte(col.SourceInsertSpecs), &specs); err == nil {
// // // 				if val, ok := specs["user_id"]; ok && val == "currentUser" && col.ColumnName == "user_id" {
// // // 					filteredRow["user_id"] = currentUserID
// // // 				}
// // // 			}
// // // 		}
// // // 	}

// // // 	tx, err := backend.Db.Begin()
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31mvirhe AddRowHandler: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "virhe aloitettaessa transaktiota", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	// 1) Lisätään päärivi
// // // 	mainRowID, err := insertMainRow(tx, tableName, filteredRow, columnTypeMap)
// // // 	if err != nil {
// // // 		tx.Rollback()
// // // 		fmt.Printf("\033[31mvirhe AddRowHandler: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	// 2) Lisätään lapsirivit (1->moni)
// // // 	for _, child := range childRows {
// // // 		err := insertSingleChildRow(tx, mainRowID, child)
// // // 		if err != nil {
// // // 			tx.Rollback()
// // // 			fmt.Printf("\033[31mvirhe AddRowHandler: %s\033[0m\n", err.Error())
// // // 			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
// // // 			return
// // // 		}
// // // 	}

// // // 	// 3) Lisätään monesta->moneen -liitokset
// // // 	for _, m2m := range manyToManyRows {
// // // 		var linkValue interface{} = m2m.SelectedValue

// // // 		if m2m.IsNewRow && m2m.NewRowData != nil {
// // // 			newID, errNew := insertNewThirdTableRow(tx, m2m.ThirdTableName, m2m.NewRowData)
// // // 			if errNew != nil {
// // // 				tx.Rollback()
// // // 				fmt.Printf("\033[31mvirhe AddRowHandler: %s\033[0m\n", errNew.Error())
// // // 				http.Error(w, "virhe kolmannen taulun rivin lisäyksessä", http.StatusInternalServerError)
// // // 				return
// // // 			}
// // // 			linkValue = newID
// // // 		}

// // // 		if linkValue == nil {
// // // 			continue
// // // 		}

// // // 		if err := insertOneManyToManyRelation(tx, mainRowID, ManyToManyPayload{
// // // 			LinkTableName:      m2m.LinkTableName,
// // // 			MainTableFkColumn:  m2m.MainTableFkColumn,
// // // 			ThirdTableFkColumn: m2m.ThirdTableFkColumn,
// // // 			SelectedValue:      linkValue,
// // // 		}); err != nil {
// // // 			tx.Rollback()
// // // 			fmt.Printf("\033[31mvirhe AddRowHandler: %s\033[0m\n", err.Error())
// // // 			http.Error(w, "virhe M2M-liitoksen lisäyksessä", http.StatusInternalServerError)
// // // 			return
// // // 		}
// // // 	}

// // // 	if err := tx.Commit(); err != nil {
// // // 		fmt.Printf("\033[31mvirhe AddRowHandler: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	insertedRow := map[string]interface{}{"id": mainRowID}
// // // 	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
// // // 		fmt.Printf("\033[31mvirhe AddRowHandler: %s\033[0m\n", err.Error())
// // // 		// Ei välttämättä katkaista
// // // 	}

// // // 	w.WriteHeader(http.StatusCreated)
// // // 	json.NewEncoder(w).Encode(map[string]string{
// // // 		"message": "rivi lisätty onnistuneesti",
// // // 	})
// // // }

// // // func getCurrentUserID(r *http.Request) (int, error) {
// // // 	store := e_sessions.GetStore()
// // // 	session, err := store.Get(r, "session")
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		return 0, fmt.Errorf("session get error: %v", err)
// // // 	}

// // // 	rawUserID, ok := session.Values["user_id"]
// // // 	if !ok {
// // // 		fmt.Printf("\033[31mvirhe: käyttäjän ID puuttuu sessiosta\033[0m\n")
// // // 		return 0, fmt.Errorf("käyttäjän ID puuttuu sessiosta")
// // // 	}

// // // 	userID, ok := rawUserID.(int)
// // // 	if !ok {
// // // 		fmt.Printf("\033[31mvirhe: käyttäjän ID on väärää tyyppiä sessiossa\033[0m\n")
// // // 		return 0, fmt.Errorf("user ID invalid type in session")
// // // 	}

// // // 	return userID, nil
// // // }

// // // func insertMainRow(tx *sql.Tx, tableName string, rowData map[string]interface{}, columnTypeMap map[string]string) (int64, error) {
// // // 	insertColumns := []string{}
// // // 	placeholders := []string{}
// // // 	values := []interface{}{}

// // // 	i := 1
// // // 	for col, val := range rowData {
// // // 		if col == "" {
// // // 			fmt.Printf("\033[31m[ERROR] Tyhjä sarakkeen nimi löydetty taulussa %s.\033[0m\n", tableName)
// // // 		} else {
// // // 			fmt.Printf("[DEBUG] Lisättävä sarake: '%s' taulusta '%s', arvo: '%v', tyyppi: '%s'\n", col, tableName, val, columnTypeMap[col])
// // // 		}

// // // 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// // // 		colType := strings.ToLower(columnTypeMap[col])

// // // 		if strings.Contains(colType, "geometry") {
// // // 			if val == nil || val == "" {
// // // 				oletusPseudolokaatio := "POINT(24.9384 60.1699)"
// // // 				placeholders = append(placeholders, fmt.Sprintf("ST_GeomFromText($%d, 4326)", i))
// // // 				values = append(values, oletusPseudolokaatio)
// // // 				i++
// // // 				continue
// // // 			}
// // // 			placeholders = append(placeholders, fmt.Sprintf("ST_GeomFromText($%d, 4326)", i))
// // // 			values = append(values, val)
// // // 			i++
// // // 			continue
// // // 		}

// // // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // // 		values = append(values, val)
// // // 		i++
// // // 	}

// // // 	if len(insertColumns) == 0 {
// // // 		return 0, fmt.Errorf("ei validia saraketta lisättäväksi taulussa %s", tableName)
// // // 	}

// // // 	insertQuery := fmt.Sprintf(
// // // 		"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
// // // 		pq.QuoteIdentifier(tableName),
// // // 		strings.Join(insertColumns, ", "),
// // // 		strings.Join(placeholders, ", "),
// // // 	)

// // // 	fmt.Printf("[DEBUG] Suoritetaan kysely: %s\nArvot: %v\n", insertQuery, values)

// // // 	var mainRowID int64
// // // 	err := tx.QueryRow(insertQuery, values...).Scan(&mainRowID)
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31m[ERROR] Virhe lisättäessä pääriviä tauluun %s: %s\033[0m\n", tableName, err.Error())
// // // 		return 0, err
// // // 	}
// // // 	return mainRowID, nil
// // // }

// // // func isIntegerType(dataType string) bool {
// // // 	dataType = strings.ToLower(dataType)
// // // 	return strings.Contains(dataType, "int")
// // // }

// // // func insertSingleChildRow(tx *sql.Tx, mainRowID int64, child ChildRowPayload) error {
// // // 	fmt.Printf("[DEBUG] Lisätään lapsirivi tauluun '%s' käyttäen viiteavainta '%s'. Alkuperäinen data: %v\n", child.TableName, child.ReferencingColumn, child.Data)
// // // 	if child.TableName == "" || child.ReferencingColumn == "" {
// // // 		return fmt.Errorf("puuttuva lapsidatan kenttä: tableName tai referencingColumn")
// // // 	}
// // // 	if child.Data == nil {
// // // 		return nil
// // // 	}

// // // 	// Poistetaan _file, jotta se ei aiheuta virhettä SQL-insertissä
// // // 	delete(child.Data, "_file")

// // // 	child.Data[child.ReferencingColumn] = mainRowID

// // // 	insertColumns := []string{}
// // // 	placeholders := []string{}
// // // 	values := []interface{}{}

// // // 	i := 1
// // // 	for col, val := range child.Data {
// // // 		fmt.Printf("[DEBUG] Lisättävä lapsitaulun sarake: '%s', arvo: '%v'\n", col, val)
// // // 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// // // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // // 		values = append(values, val)
// // // 		i++
// // // 	}

// // // 	if len(insertColumns) == 0 {
// // // 		return nil
// // // 	}

// // // 	insertQuery := fmt.Sprintf(
// // // 		"INSERT INTO %s (%s) VALUES (%s)",
// // // 		pq.QuoteIdentifier(child.TableName),
// // // 		strings.Join(insertColumns, ", "),
// // // 		strings.Join(placeholders, ", "),
// // // 	)
// // // 	fmt.Printf("[DEBUG] Suoritetaan lapsitaulun kysely: %s\nArvot: %v\n", insertQuery, values)

// // // 	_, err := tx.Exec(insertQuery, values...)
// // // 	return err
// // // }

// // // func insertNewThirdTableRow(tx *sql.Tx, tableName string, rowData map[string]interface{}) (int64, error) {
// // // 	fmt.Printf("[DEBUG] Lisätään uusi rivi kolmanteen tauluun '%s'. Data: %v\n", tableName, rowData)
// // // 	if len(rowData) == 0 {
// // // 		return 0, nil
// // // 	}

// // // 	insertCols := []string{}
// // // 	placeholders := []string{}
// // // 	var values []interface{}

// // // 	i := 1
// // // 	for col, val := range rowData {
// // // 		fmt.Printf("[DEBUG] Kolmannen taulun sarake: '%s', arvo: '%v'\n", col, val)
// // // 		insertCols = append(insertCols, pq.QuoteIdentifier(col))
// // // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // // 		values = append(values, val)
// // // 		i++
// // // 	}

// // // 	query := fmt.Sprintf(
// // // 		"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
// // // 		pq.QuoteIdentifier(tableName),
// // // 		strings.Join(insertCols, ", "),
// // // 		strings.Join(placeholders, ", "),
// // // 	)

// // // 	fmt.Printf("[DEBUG] Suoritetaan kysely: %s\nArvot: %v\n", query, values)

// // // 	var newID int64
// // // 	err := tx.QueryRow(query, values...).Scan(&newID)
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31m[ERROR] Virhe lisättäessä uutta riviä kolmanteen tauluun %s: %s\033[0m\n", tableName, err.Error())
// // // 		return 0, err
// // // 	}
// // // 	return newID, nil
// // // }

// // // func insertOneManyToManyRelation(tx *sql.Tx, mainRowID int64, m2m ManyToManyPayload) error {
// // // 	fmt.Printf("[DEBUG] Lisätään M2M-liitos: linkataulu '%s' – sarakkeet '%s' (päätaulu) ja '%s' (kolmas taulu), arvo: %v\n",
// // // 		m2m.LinkTableName, m2m.MainTableFkColumn, m2m.ThirdTableFkColumn, m2m.SelectedValue)

// // // 	insertQuery := fmt.Sprintf(
// // // 		"INSERT INTO %s (%s, %s) VALUES ($1, $2)",
// // // 		pq.QuoteIdentifier(m2m.LinkTableName),
// // // 		pq.QuoteIdentifier(m2m.MainTableFkColumn),
// // // 		pq.QuoteIdentifier(m2m.ThirdTableFkColumn),
// // // 	)
// // // 	fmt.Printf("[DEBUG] Suoritetaan liitoskysely: %s\n", insertQuery)
// // // 	_, err := tx.Exec(insertQuery, mainRowID, m2m.SelectedValue)
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31m[ERROR] Virhe M2M-liitosta lisättäessä: %s\033[0m\n", err.Error())
// // // 	}
// // // 	return err
// // // }

// // // // add_row_handler.go 2025-03-11--01-07
// // // package gt_1_row_create

// // // import (
// // // 	"database/sql"
// // // 	backend "easelect/backend/main_app"
// // // 	gt_triggers "easelect/backend/main_app/general_tables/triggers"
// // // 	e_sessions "easelect/backend/main_app/sessions"
// // // 	"encoding/json"
// // // 	"fmt"
// // // 	"net/http"
// // // 	"strconv"
// // // 	"strings"

// // // 	"github.com/lib/pq"
// // // )

// // // func AddRowHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// // // 	tableName := r.URL.Query().Get("table")
// // // 	if tableName == "" {
// // // 		http.Error(w, "Missing 'table' query parameter", http.StatusBadRequest)
// // // 		return
// // // 	}
// // // 	AddRowHandler(w, r, tableName)
// // // }

// // // type ChildRowPayload struct {
// // // 	TableName         string                 `json:"tableName"`
// // // 	ReferencingColumn string                 `json:"referencingColumn"`
// // // 	Data              map[string]interface{} `json:"data"`
// // // }

// // // type ManyToManyPayload struct {
// // // 	LinkTableName      string                 `json:"linkTableName"`
// // // 	MainTableFkColumn  string                 `json:"mainTableFkColumn"`
// // // 	ThirdTableName     string                 `json:"thirdTableName"`
// // // 	ThirdTableFkColumn string                 `json:"thirdTableFkColumn"`
// // // 	SelectedValue      interface{}            `json:"selectedValue"`
// // // 	IsNewRow           bool                   `json:"isNewRow"`
// // // 	NewRowData         map[string]interface{} `json:"newRowData,omitempty"`
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

// // // 	// Haetaan nykyisen käyttäjän tunniste
// // // 	currentUserID, err := getCurrentUserID(r)
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "virhe käyttäjätunnuksen haussa", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	// Poimitaan lapsidata 1->moni
// // // 	var childRows []ChildRowPayload
// // // 	if raw := payload["_childRows"]; raw != nil {
// // // 		bytes, err := json.Marshal(raw)
// // // 		if err == nil {
// // // 			json.Unmarshal(bytes, &childRows)
// // // 		}
// // // 		delete(payload, "_childRows")
// // // 	}

// // // 	// Poimitaan monesta->moneen
// // // 	var manyToManyRows []ManyToManyPayload
// // // 	if raw := payload["_manyToMany"]; raw != nil {
// // // 		bytes, err := json.Marshal(raw)
// // // 		if err == nil {
// // // 			json.Unmarshal(bytes, &manyToManyRows)
// // // 		}
// // // 		delete(payload, "_manyToMany")
// // // 	}

// // // 	schemaName := "public"
// // // 	columnsInfo, err := getAddRowColumnsWithTypes(tableName, schemaName)
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "error fetching columns", http.StatusInternalServerError)
// // // 		return
// // // 	}

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

// // // 	filteredRow := make(map[string]interface{})
// // // 	for colName, val := range payload {
// // // 		if allowedColumns[colName] {
// // // 			colType := columnTypeMap[colName]
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
// // // 							http.Error(w, fmt.Sprintf("invalid integer value for column %s", colName), http.StatusBadRequest)
// // // 							return
// // // 						}
// // // 						val = parsedVal
// // // 					}
// // // 				}
// // // 			}
// // // 			filteredRow[colName] = val
// // // 		}
// // // 	}

// // // 	// Tarkistetaan source_insert_specs ja asetetaan user_id, jos tarpeen
// // // 	for _, col := range columnsInfo {
// // // 		if col.SourceInsertSpecs != "" {
// // // 			var specs map[string]string
// // // 			if err := json.Unmarshal([]byte(col.SourceInsertSpecs), &specs); err == nil {
// // // 				if val, ok := specs["user_id"]; ok && val == "currentUser" && col.ColumnName == "user_id" {
// // // 					filteredRow["user_id"] = currentUserID
// // // 				}
// // // 			}
// // // 		}
// // // 	}

// // // 	tx, err := backend.Db.Begin()
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "virhe aloitettaessa transaktiota", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	// 1) Lisätään päärivi
// // // 	mainRowID, err := insertMainRow(tx, tableName, filteredRow, columnTypeMap)
// // // 	if err != nil {
// // // 		tx.Rollback()
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	// 2) Lisätään lapsirivit (1->moni)
// // // 	for _, child := range childRows {
// // // 		err := insertSingleChildRow(tx, mainRowID, child)
// // // 		if err != nil {
// // // 			tx.Rollback()
// // // 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
// // // 			return
// // // 		}
// // // 	}

// // // 	// 3) Lisätään monesta->moneen -liitokset
// // // 	for _, m2m := range manyToManyRows {
// // // 		var linkValue interface{} = m2m.SelectedValue

// // // 		if m2m.IsNewRow && m2m.NewRowData != nil {
// // // 			newID, errNew := insertNewThirdTableRow(tx, m2m.ThirdTableName, m2m.NewRowData)
// // // 			if errNew != nil {
// // // 				tx.Rollback()
// // // 				fmt.Printf("\033[31mvirhe: %s\033[0m\n", errNew.Error())
// // // 				http.Error(w, "virhe kolmannen taulun rivin lisäyksessä", http.StatusInternalServerError)
// // // 				return
// // // 			}
// // // 			linkValue = newID
// // // 		}

// // // 		if linkValue == nil {
// // // 			continue
// // // 		}

// // // 		if err := insertOneManyToManyRelation(tx, mainRowID, ManyToManyPayload{
// // // 			LinkTableName:      m2m.LinkTableName,
// // // 			MainTableFkColumn:  m2m.MainTableFkColumn,
// // // 			ThirdTableFkColumn: m2m.ThirdTableFkColumn,
// // // 			SelectedValue:      linkValue,
// // // 		}); err != nil {
// // // 			tx.Rollback()
// // // 			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 			http.Error(w, "virhe M2M-liitoksen lisäyksessä", http.StatusInternalServerError)
// // // 			return
// // // 		}
// // // 	}

// // // 	if err := tx.Commit(); err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	insertedRow := map[string]interface{}{"id": mainRowID}
// // // 	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		// Ei välttämättä katkaista
// // // 	}

// // // 	w.WriteHeader(http.StatusCreated)
// // // 	json.NewEncoder(w).Encode(map[string]string{
// // // 		"message": "rivi lisätty onnistuneesti",
// // // 	})
// // // }

// // // func getCurrentUserID(r *http.Request) (int, error) {
// // // 	store := e_sessions.GetStore()
// // // 	session, err := store.Get(r, "session")
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		return 0, fmt.Errorf("session get error: %v", err)
// // // 	}

// // // 	rawUserID, ok := session.Values["user_id"]
// // // 	if !ok {
// // // 		fmt.Printf("\033[31mvirhe: käyttäjän ID puuttuu sessiosta\033[0m\n")
// // // 		return 0, fmt.Errorf("käyttäjän ID puuttuu sessiosta")
// // // 	}

// // // 	userID, ok := rawUserID.(int)
// // // 	if !ok {
// // // 		fmt.Printf("\033[31mvirhe: käyttäjän ID on väärää tyyppiä sessiossa\033[0m\n")
// // // 		return 0, fmt.Errorf("user ID invalid type in session")
// // // 	}

// // // 	return userID, nil
// // // }

// // // func insertMainRow(tx *sql.Tx, tableName string, rowData map[string]interface{}, columnTypeMap map[string]string) (int64, error) {
// // // 	insertColumns := []string{}
// // // 	placeholders := []string{}
// // // 	values := []interface{}{}

// // // 	i := 1
// // // 	for col, val := range rowData {
// // // 		if col == "" {
// // // 			fmt.Printf("\033[31m[ERROR] Tyhjä sarakkeen nimi löydetty taulussa %s.\033[0m\n", tableName)
// // // 		} else {
// // // 			fmt.Printf("[DEBUG] Lisättävä sarake: '%s' taulusta '%s', arvo: '%v', tyyppi: '%s'\n", col, tableName, val, columnTypeMap[col])
// // // 		}

// // // 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// // // 		colType := strings.ToLower(columnTypeMap[col])

// // // 		if strings.Contains(colType, "geometry") {
// // // 			if val == nil || val == "" {
// // // 				oletusPseudolokaatio := "POINT(24.9384 60.1699)"
// // // 				placeholders = append(placeholders, fmt.Sprintf("ST_GeomFromText($%d, 4326)", i))
// // // 				values = append(values, oletusPseudolokaatio)
// // // 				i++
// // // 				continue
// // // 			}
// // // 			placeholders = append(placeholders, fmt.Sprintf("ST_GeomFromText($%d, 4326)", i))
// // // 			values = append(values, val)
// // // 			i++
// // // 			continue
// // // 		}

// // // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // // 		values = append(values, val)
// // // 		i++
// // // 	}

// // // 	if len(insertColumns) == 0 {
// // // 		return 0, fmt.Errorf("ei validia saraketta lisättäväksi taulussa %s", tableName)
// // // 	}

// // // 	insertQuery := fmt.Sprintf(
// // // 		"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
// // // 		pq.QuoteIdentifier(tableName),
// // // 		strings.Join(insertColumns, ", "),
// // // 		strings.Join(placeholders, ", "),
// // // 	)

// // // 	fmt.Printf("[DEBUG] Suoritetaan kysely: %s\nArvot: %v\n", insertQuery, values)

// // // 	var mainRowID int64
// // // 	err := tx.QueryRow(insertQuery, values...).Scan(&mainRowID)
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31m[ERROR] Virhe lisättäessä pääriviä tauluun %s: %s\033[0m\n", tableName, err.Error())
// // // 		return 0, err
// // // 	}
// // // 	return mainRowID, nil
// // // }

// // // func isIntegerType(dataType string) bool {
// // // 	dataType = strings.ToLower(dataType)
// // // 	return strings.Contains(dataType, "int")
// // // }

// // // func insertSingleChildRow(tx *sql.Tx, mainRowID int64, child ChildRowPayload) error {
// // // 	fmt.Printf("[DEBUG] Lisätään lapsirivi tauluun '%s' käyttäen viiteavainta '%s'. Alkuperäinen data: %v\n", child.TableName, child.ReferencingColumn, child.Data)
// // // 	if child.TableName == "" || child.ReferencingColumn == "" {
// // // 		return fmt.Errorf("puuttuva lapsidatan kenttä: tableName tai referencingColumn")
// // // 	}
// // // 	if child.Data == nil {
// // // 		return nil
// // // 	}

// // // 	child.Data[child.ReferencingColumn] = mainRowID

// // // 	insertColumns := []string{}
// // // 	placeholders := []string{}
// // // 	values := []interface{}{}

// // // 	i := 1
// // // 	for col, val := range child.Data {
// // // 		fmt.Printf("[DEBUG] Lisättävä lapsitaulun sarake: '%s', arvo: '%v'\n", col, val)
// // // 		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
// // // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // // 		values = append(values, val)
// // // 		i++
// // // 	}
// // // 	if len(insertColumns) == 0 {
// // // 		return nil
// // // 	}

// // // 	insertQuery := fmt.Sprintf(
// // // 		"INSERT INTO %s (%s) VALUES (%s)",
// // // 		pq.QuoteIdentifier(child.TableName),
// // // 		strings.Join(insertColumns, ", "),
// // // 		strings.Join(placeholders, ", "),
// // // 	)
// // // 	fmt.Printf("[DEBUG] Suoritetaan lapsitaulun kysely: %s\nArvot: %v\n", insertQuery, values)
// // // 	_, err := tx.Exec(insertQuery, values...)
// // // 	return err
// // // }

// // // func insertNewThirdTableRow(tx *sql.Tx, tableName string, rowData map[string]interface{}) (int64, error) {
// // // 	fmt.Printf("[DEBUG] Lisätään uusi rivi kolmanteen tauluun '%s'. Data: %v\n", tableName, rowData)
// // // 	if len(rowData) == 0 {
// // // 		return 0, nil
// // // 	}

// // // 	insertCols := []string{}
// // // 	placeholders := []string{}
// // // 	var values []interface{}

// // // 	i := 1
// // // 	for col, val := range rowData {
// // // 		fmt.Printf("[DEBUG] Kolmannen taulun sarake: '%s', arvo: '%v'\n", col, val)
// // // 		insertCols = append(insertCols, pq.QuoteIdentifier(col))
// // // 		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
// // // 		values = append(values, val)
// // // 		i++
// // // 	}

// // // 	query := fmt.Sprintf(
// // // 		"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
// // // 		pq.QuoteIdentifier(tableName),
// // // 		strings.Join(insertCols, ", "),
// // // 		strings.Join(placeholders, ", "),
// // // 	)

// // // 	fmt.Printf("[DEBUG] Suoritetaan kysely: %s\nArvot: %v\n", query, values)

// // // 	var newID int64
// // // 	err := tx.QueryRow(query, values...).Scan(&newID)
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31m[ERROR] Virhe lisättäessä uutta riviä kolmanteen tauluun %s: %s\033[0m\n", tableName, err.Error())
// // // 		return 0, err
// // // 	}
// // // 	return newID, nil
// // // }

// // // func insertOneManyToManyRelation(tx *sql.Tx, mainRowID int64, m2m ManyToManyPayload) error {
// // // 	fmt.Printf("[DEBUG] Lisätään M2M-liitos: linkataulu '%s' – sarakkeet '%s' (päätaulu) ja '%s' (kolmas taulu), arvo: %v\n",
// // // 		m2m.LinkTableName, m2m.MainTableFkColumn, m2m.ThirdTableFkColumn, m2m.SelectedValue)

// // // 	insertQuery := fmt.Sprintf(
// // // 		"INSERT INTO %s (%s, %s) VALUES ($1, $2)",
// // // 		pq.QuoteIdentifier(m2m.LinkTableName),
// // // 		pq.QuoteIdentifier(m2m.MainTableFkColumn),
// // // 		pq.QuoteIdentifier(m2m.ThirdTableFkColumn),
// // // 	)
// // // 	fmt.Printf("[DEBUG] Suoritetaan liitoskysely: %s\n", insertQuery)
// // // 	_, err := tx.Exec(insertQuery, mainRowID, m2m.SelectedValue)
// // // 	if err != nil {
// // // 		fmt.Printf("\033[31m[ERROR] Virhe M2M-liitosta lisättäessä: %s\033[0m\n", err.Error())
// // // 	}
// // // 	return err
// // // }
