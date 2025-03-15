// add_row_multipart.go
package gt_1_row_create

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	backend "easelect/backend/core_components"
	gt_triggers "easelect/backend/core_components/general_tables/triggers"
	e_sessions "easelect/backend/core_components/sessions"

	"github.com/lib/pq"
)

// ChildRowPayload sisältää lapsirivin tiedot
type ChildRowPayload struct {
	TableName         string                 `json:"tableName"`
	ReferencingColumn string                 `json:"referencingColumn"`
	Data              map[string]interface{} `json:"data"`
}

// ManyToManyPayload sisältää m2m-liitosta koskevat tiedot
type ManyToManyPayload struct {
	LinkTableName      string                 `json:"linkTableName"`
	MainTableFkColumn  string                 `json:"mainTableFkColumn"`
	ThirdTableName     string                 `json:"thirdTableName"`
	ThirdTableFkColumn string                 `json:"thirdTableFkColumn"`
	SelectedValue      interface{}            `json:"selectedValue"`
	IsNewRow           bool                   `json:"isNewRow"`
	NewRowData         map[string]interface{} `json:"newRowData,omitempty"`
}

// ChildInsertResult kantaa tiedot yhdestä lapsirivistä, jotta tiedämme
// tallennusvaiheessa (saveUploadedFiles) mm. lapsirivin ID, taulun nimen jne.
type ChildInsertResult struct {
	FieldKey          string // esim. "file_child_0"
	TableName         string
	ReferencingColumn string
	ChildRowID        int64
	MainRowID         int64
}

// AddRowMultipartHandlerWrapper hoitaa /api/add-row-multipart?table=... -pyyntöjä
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
//   - jsonPayload (lomakkeen tekstikentät JSON:na)
//   - mahdolliset tiedostot lapsitauluille (file_child_0, file_child_1, ...)
//
// Tallennuksen logiikka:
//  1. luo päärivin (RETURNING id -> mainRowID)
//  2. luo lapsirivit (RETURNING id -> childRowID) ja kerää talteen ChildInsertResult-listaan
//  3. tallentaa tiedostot polkuun: media/<tableUID>/<mainRowID>/, nimeksi <tableUID>_<mainRowID>_<childRowID>.ext
//  4. päivittää lapsirivin "filename" (ja mahdolliset cacheTargets) samalle nimelle
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

	// 1) Lisätään data kantaan (pää, lapsirivit, M2M) -> saamme mainRowID + lapsirivien tiedot
	mainRowID, childInsertResults, err := insertDataAccordingToPayload(w, r, tableName, payload)
	if err != nil {
		// insertDataAccordingToPayload hoitaa virhevastausten antamisen
		return
	}

	// 2) Tallennetaan tiedostot, kun tiedämme jo mainRowID:n ja lapsirivien ID:t
	saveUploadedFiles(w, r.MultipartForm.File, "media", tableUID, mainRowID, childInsertResults)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "rivi (ja tiedostot) lisätty onnistuneesti ☀️",
	})
}

// insertDataAccordingToPayload lisää päätaulun rivin, lapsirivit ja M2M-liitokset.
// Palauttaa luodun päärivin id-arvon (mainRowID) sekä ChildInsertResult-listan lapsiriveistä.
func insertDataAccordingToPayload(
	w http.ResponseWriter,
	r *http.Request,
	tableName string,
	payload map[string]interface{},
) (int64, []ChildInsertResult, error) {

	currentUserID, err := getCurrentUserID(r)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "käyttäjätunnusta ei voitu hakea", http.StatusInternalServerError)
		return 0, nil, err
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
		return 0, nil, err
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
							return 0, nil, parseErr
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
		return 0, nil, err
	}

	// 1) Päärivi
	mainRowID, err := insertMainRow(tx, tableName, filteredRow, columnTypeMap)
	if err != nil {
		tx.Rollback()
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
		return 0, nil, err
	}

	childInsertResults := []ChildInsertResult{}

	// 2) Lapsirivit
	for i, child := range childRows {
		cID, cErr := insertSingleChildRow(tx, mainRowID, child)
		if cErr != nil {
			tx.Rollback()
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", cErr.Error())
			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
			return 0, nil, cErr
		}
		// Esim. "file_child_0"
		fieldKey := fmt.Sprintf("file_child_%d", i)
		childInsertResults = append(childInsertResults, ChildInsertResult{
			FieldKey:          fieldKey,
			TableName:         child.TableName,
			ReferencingColumn: child.ReferencingColumn,
			ChildRowID:        cID,
			MainRowID:         mainRowID,
		})
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
				return 0, nil, errNew
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
			return 0, nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
		return 0, nil, err
	}

	// Mahdolliset triggerit
	insertedRow := map[string]interface{}{"id": mainRowID}
	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
		fmt.Printf("\033[31mvirhe triggers: %s\033[0m\n", err.Error())
		// jatketaan silti
	}

	return mainRowID, childInsertResults, nil
}

// saveUploadedFiles tallentaa lomakkeen tiedostokentät levyyn polkuun:
//
//	media/<tableUID>/<mainRowID>/
//
// Nimeää tiedoston <tableUID>_<mainRowID>_<childRowID>.ext
// ja päivittää lapsirivin "filename"-sarakkeen sekä mahdolliset
// "cacheTargets" (updateCacheTargets).
func saveUploadedFiles(
	w http.ResponseWriter,
	fileMap map[string][]*multipart.FileHeader,
	baseDir string,
	tableUID string,
	mainRowID int64,
	childInsertResults []ChildInsertResult,
) {
	// Kerätään ChildInsertResult map-muotoon fieldKey -> ChildInsertResult
	resultMap := make(map[string]ChildInsertResult)
	for _, res := range childInsertResults {
		resultMap[res.FieldKey] = res
	}

	for fieldName, fhArray := range fileMap {
		// Haemme vain lapsitauluihin liittyviä file_child_X -kenttiä
		if !strings.HasPrefix(fieldName, "file_child_") {
			continue
		}
		if len(fhArray) == 0 {
			continue
		}
		fh := fhArray[0]

		srcFile, err := fh.Open()
		if err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe tiedoston avauksessa", http.StatusInternalServerError)
			continue
		}
		defer srcFile.Close()

		resInfo := resultMap[fieldName]
		childRowID := resInfo.ChildRowID
		childTableName := resInfo.TableName
		referencingColumn := resInfo.ReferencingColumn

		// Kansion luonti: media/<tableUID>/<mainRowID>/
		subFolder := filepath.Join(baseDir, tableUID, fmt.Sprintf("%d", mainRowID))
		err = os.MkdirAll(subFolder, 0755)
		if err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe kansiota luodessa", http.StatusInternalServerError)
			continue
		}

		// Uusi tiedostonimi
		originalExt := filepath.Ext(fh.Filename)
		newFileName := fmt.Sprintf("%s_%d_%d%s", tableUID, mainRowID, childRowID, originalExt)
		savePath := filepath.Join(subFolder, newFileName)

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

		// Päivitetään lapsirivin filename-sarake:
		updateFilenameInChildRow(childTableName, childRowID, newFileName)

		// Kutsutaan uudelleen updateCacheTargets, jotta sama nimi päivittyy cache-sarakkeisiin:
		// Luodaan "childData", jossa relevantit sarakkeet:
		tempChildData := map[string]interface{}{
			referencingColumn: mainRowID, // esim. service_id = <mainRowID>
			"filename":        newFileName,
		}
		if err := updateCacheTargetsNoTx(childTableName, referencingColumn, tempChildData); err != nil {
			fmt.Printf("\033[31mvirhe (cacheTargets): %s\033[0m\n", err.Error())
		}
	}
}

// updateFilenameInChildRow tekee pienen UPDATE-lauseen tallentaakseen
// uuden tiedostonimen lapsirivin "filename"-sarakkeeseen.
func updateFilenameInChildRow(childTableName string, childRowID int64, newFileName string) {
	updateQ := fmt.Sprintf(`UPDATE %s SET filename=$1 WHERE id=$2`, pq.QuoteIdentifier(childTableName))
	if _, err := backend.Db.Exec(updateQ, newFileName, childRowID); err != nil {
		fmt.Printf("\033[31mvirhe: tiedostonimen päivitys tauluun=%s, id=%d: %s\033[0m\n", childTableName, childRowID, err.Error())
	}
}

// updateCacheTargetsNoTx kutsuu samaa logiikkaa kuin updateCacheTargets, mutta
// ilman transaktiota. (Voit myös halutessasi avata mini-tx:n.)
func updateCacheTargetsNoTx(sourceTable string, sourceColumn string, childData map[string]interface{}) error {
	query := `
		SELECT target_insert_specs, target_table_name, target_column_name
		FROM foreign_key_relations_1_m
		WHERE source_table_name = $1
		  AND source_column_name = $2
		LIMIT 1
	`
	var targetInsertSpecs string
	var targetTableName string
	var targetColumnName string

	err := backend.Db.QueryRow(query, sourceTable, sourceColumn).Scan(
		&targetInsertSpecs, &targetTableName, &targetColumnName,
	)
	if err != nil {
		// Ei välttämättä ole riviä
		return nil
	}

	if targetInsertSpecs == "" {
		return nil
	}

	var specs map[string]interface{}
	if err := json.Unmarshal([]byte(targetInsertSpecs), &specs); err != nil {
		return err
	}

	fileUpload, ok := specs["file_upload"].(map[string]interface{})
	if !ok {
		return nil
	}

	filenameColumn, _ := fileUpload["filename_column"].(string)
	if filenameColumn == "" {
		return nil
	}

	rawFilename, ok := childData[filenameColumn]
	if !ok {
		return nil
	}
	filenameStr, _ := rawFilename.(string)
	if filenameStr == "" {
		return nil
	}

	cacheTargets, ok := fileUpload["cache_targets"].([]interface{})
	if !ok {
		return nil
	}

	refVal, refOk := childData[sourceColumn]
	if !refOk {
		return nil
	}

	// Päivitetään jokaiselle cacheTargets-riville tiedostonimi
	for _, target := range cacheTargets {
		targetObj, _ := target.(map[string]interface{})
		tblName, _ := targetObj["table"].(string)
		colName, _ := targetObj["column"].(string)
		if tblName == "" || colName == "" {
			continue
		}
		updateQuery := fmt.Sprintf(`UPDATE %s SET %s = $1 WHERE %s = $2`,
			pq.QuoteIdentifier(tblName),
			pq.QuoteIdentifier(colName),
			pq.QuoteIdentifier(targetColumnName),
		)
		if _, err := backend.Db.Exec(updateQuery, filenameStr, refVal); err != nil {
			return fmt.Errorf("cache update error table=%s col=%s: %v", tblName, colName, err)
		}
	}
	return nil
}

// insertSingleChildRow lisää yksittäisen lapsirivin child.TableName-tauluun
// ja asettaa referencingColumnin arvoksi mainRowID.
// Palauttaa lisätyn rivin id-arvon (childRowID).
func insertSingleChildRow(tx *sql.Tx, mainRowID int64, child ChildRowPayload) (int64, error) {
	if child.TableName == "" || child.ReferencingColumn == "" {
		return 0, fmt.Errorf("puuttuva lapsidatan kenttä: tableName tai referencingColumn")
	}
	if child.Data == nil {
		return 0, nil
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
		return 0, nil
	}

	insertQuery := fmt.Sprintf(
		`INSERT INTO %s (%s) VALUES (%s) RETURNING id`,
		pq.QuoteIdentifier(child.TableName),
		strings.Join(insertColumns, ", "),
		strings.Join(placeholders, ", "),
	)

	var childRowID int64
	err := tx.QueryRow(insertQuery, values...).Scan(&childRowID)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return 0, err
	}

	// Tämän jälkeen (transaktion sisällä) päivitetään mahdolliset cacheTargets
	if cacheErr := updateCacheTargets(tx, child.TableName, child.ReferencingColumn, child.Data); cacheErr != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", cacheErr.Error())
		return 0, cacheErr
	}

	return childRowID, nil
}

// updateCacheTargets (transaktion sisällä) – sama idea kuin updateCacheTargetsNoTx.
func updateCacheTargets(
	tx *sql.Tx,
	sourceTable string,
	sourceColumn string,
	childData map[string]interface{},
) error {
	query := `
		SELECT target_insert_specs, target_table_name, target_column_name
		FROM foreign_key_relations_1_m
		WHERE source_table_name = $1
		  AND source_column_name = $2
		LIMIT 1
	`
	var targetInsertSpecs string
	var targetTableName string
	var targetColumnName string

	err := tx.QueryRow(query, sourceTable, sourceColumn).Scan(
		&targetInsertSpecs, &targetTableName, &targetColumnName,
	)
	if err != nil {
		// Ei välttämättä ole virhe, jos ei ole riviä
		return nil
	}
	if targetInsertSpecs == "" {
		return nil
	}

	var specs map[string]interface{}
	if err := json.Unmarshal([]byte(targetInsertSpecs), &specs); err != nil {
		return err
	}
	fileUpload, ok := specs["file_upload"].(map[string]interface{})
	if !ok {
		return nil
	}

	filenameColumn, _ := fileUpload["filename_column"].(string)
	if filenameColumn == "" {
		return nil
	}
	rawFilename, ok := childData[filenameColumn]
	if !ok {
		return nil
	}
	filenameStr, ok := rawFilename.(string)
	if !ok || filenameStr == "" {
		return nil
	}

	cacheTargets, ok := fileUpload["cache_targets"].([]interface{})
	if !ok {
		return nil
	}
	referencingValue, refOk := childData[sourceColumn]
	if !refOk {
		return nil
	}
	for _, target := range cacheTargets {
		targetObj, _ := target.(map[string]interface{})
		tableName, _ := targetObj["table"].(string)
		colName, _ := targetObj["column"].(string)
		if tableName == "" || colName == "" {
			continue
		}
		updateQuery := fmt.Sprintf(`UPDATE %s SET %s = $1 WHERE %s = $2`,
			pq.QuoteIdentifier(tableName),
			pq.QuoteIdentifier(colName),
			pq.QuoteIdentifier(targetColumnName),
		)
		if _, err := tx.Exec(updateQuery, filenameStr, referencingValue); err != nil {
			return fmt.Errorf("cache update error table=%s col=%s: %v", tableName, colName, err)
		}
	}
	return nil
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

		// Esimerkki: geometry-tyyppi
		if strings.Contains(colType, "geometry") {
			if val == nil || val == "" {
				val = "POINT(24.9384 60.1699)" // jonkinlainen oletus
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

// isIntegerType on apu-funktio integer-tyypin tunnistamiseen
func isIntegerType(dataType string) bool {
	dataType = strings.ToLower(dataType)
	return strings.Contains(dataType, "int")
}
