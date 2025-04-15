// add_row_handler.go
package gt_1_row_create

import (
	"context"
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
	"time"

	backend "easelect/backend/core_components"
	gt_triggers "easelect/backend/core_components/general_tables/triggers"
	e_sessions "easelect/backend/core_components/sessions"

	"github.com/lib/pq"
	// Huom. lisää nämä moduulit go.mod:iin:
	//   github.com/sashabaranov/go-openai v1.6.0 (tai uudempi)
	//   github.com/pgvector/pgvector-go   v0.0.0-20230419003241-071478c7611d (tai uudempi)
	pgvector "github.com/pgvector/pgvector-go"
	"github.com/sashabaranov/go-openai"
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
//  5. Jos taulusta löytyy openai_embedding-sarake, generoi upouuden rivin teksteistä embeddingin
//     ja tallentaa sen openai_embedding-sarakkeeseen (synkronisesti).
func AddRowMultipartHandler(w http.ResponseWriter, r *http.Request, tableName string) {
	err := r.ParseMultipartForm(50 << 20) // sallit. esim. 50 MB
	if err != nil {
		fmt.Printf("\033[31m[add_row_handler.go] [AddRowMultipartHandler] virhe: %s\033[0m\n", err.Error())
		http.Error(w, "multipart parse error", http.StatusBadRequest)
		return
	}

	tableUID, err := getTableUID(tableName)
	if err != nil {
		fmt.Printf("\033[31m[add_row_handler.go] [AddRowMultipartHandler] virhe: %s\033[0m\n", err.Error())
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
		fmt.Printf("\033[31m[add_row_handler.go] [AddRowMultipartHandler] virhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe jsonin parsinnassa", http.StatusBadRequest)
		return
	}

	// 1) Lisätään data kantaan (pää, lapsirivit, M2M) -> saamme mainRowID + lapsirivien tiedot
	mainRowID, childInsertResults, err := insertDataAccordingToPayload(w, r, tableName, payload)
	if err != nil {
		// insertDataAccordingToPayload hoitaa virhevastausten antamisen
		return
	}

	// 2) Tallennetaan tiedostot
	saveUploadedFiles(w, r.MultipartForm.File, "media", tableUID, mainRowID, childInsertResults)

	// 3) Tarkista, onko taulussa openai_embedding-sarake -> jos kyllä, generoi embedding
	if hasOpenAIEmbeddingColumn(tableName) {
		if errEmb := generateOpenAIEmbeddingForSingleRow(tableName, mainRowID); errEmb != nil {
			fmt.Printf("\033[31m[add_row_handler.go] [AddRowMultipartHandler -> generateOpenAIEmbeddingForSingleRow] virhe: %s\033[0m\n", errEmb.Error())
			// ei estä riviä toimimasta, jatketaan
		}
	}

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
		fmt.Printf("\033[31m[add_row_handler.go] [insertDataAccordingToPayload] virhe: %s\033[0m\n", err.Error())
		http.Error(w, "käyttäjätunnusta ei voitu hakea", http.StatusInternalServerError)
		return 0, nil, err
	}

	// Haetaan myös käyttäjänimi sessiosta
	currentUsername, err := getCurrentUsername(r)
	if err != nil {
		fmt.Printf("\033[31m[add_row_handler.go] [insertDataAccordingToPayload] virhe: %s\033[0m\n", err.Error())
		http.Error(w, "käyttäjänimen hakeminen sessiosta epäonnistui", http.StatusInternalServerError)
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
		fmt.Printf("\033[31m[add_row_handler.go] [insertDataAccordingToPayload] virhe: %s\033[0m\n", err.Error())
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
	// ja poistetaan "vector" -sarakkeet, eli ei tallenneta niitä käyttöliittymästä
	filteredRow := map[string]interface{}{}
	for colName, val := range payload {
		colType := strings.ToLower(columnTypeMap[colName])
		// Jos se on vector-sarake, ohitetaan
		if strings.Contains(colType, "vector") {
			continue
		}
		if allowedColumns[colName] {
			// Jos tyyppi on integer ja arvo on tyhjä string, muutetaan 0 (dummy).
			if isIntegerType(colType) {
				if s, ok := val.(string); ok {
					trimmed := strings.TrimSpace(s)
					if trimmed == "" {
						val = 0
						fmt.Printf("[INFO] int-sarake '%s' oli tyhjä, asetetaan dummy-arvo 0\n", colName)
					} else {
						parsedVal, parseErr := strconv.Atoi(trimmed)
						if parseErr != nil {
							fmt.Printf("\033[31m[add_row_handler.go] [insertDataAccordingToPayload] virhe: %s\033[0m\n", parseErr.Error())
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

	// TODO: Muuta tämä dynaamiseksi, jotta ei tarvitse erikseen lisätä jokaista saraketta
	// Tarkistetaan source_insert_specs (esim. user_id = currentUser), jonka avulla voidaan lisätä käyttäjätunnus (fk) pääasialliseen tauluun
	for _, col := range columnsInfo {
		if col.SourceInsertSpecs != "" {
			var specs map[string]string
			if err := json.Unmarshal([]byte(col.SourceInsertSpecs), &specs); err == nil {
				// user_id -> currentUser
				if val, ok := specs["user_id"]; ok && val == "currentUser" && col.ColumnName == "user_id" {
					filteredRow["user_id"] = currentUserID
					fmt.Printf("[DEBUG] asetan user_id = '%d' (currentUser)\n", currentUserID)
				}
				// cached_username -> currentUserName
				if val, ok := specs["cached_username"]; ok && val == "currentUserName" {
					filteredRow["cached_username"] = currentUsername
					fmt.Printf("[DEBUG] asetan cached_username = '%s' (currentUserName)\n", currentUsername)
				}
			}
		}
	}

	tx, err := backend.Db.Begin()
	if err != nil {
		fmt.Printf("\033[31m[add_row_handler.go] [insertDataAccordingToPayload] virhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe transaktion aloituksessa", http.StatusInternalServerError)
		return 0, nil, err
	}

	// 1) Päärivi
	mainRowID, err := insertMainRow(tx, tableName, filteredRow, columnTypeMap)
	if err != nil {
		tx.Rollback()
		fmt.Printf("\033[31m[add_row_handler.go] [insertDataAccordingToPayload] virhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe päärivin lisäyksessä", http.StatusInternalServerError)
		return 0, nil, err
	}

	childInsertResults := []ChildInsertResult{}

	// 2) Lapsirivit
	for i, child := range childRows {
		// Lapselta ohitetaan myös vector-sarakkeet
		childCols, err2 := getAddRowColumnsWithTypes(child.TableName, schemaName)
		if err2 != nil {
			tx.Rollback()
			fmt.Printf("\033[31m[add_row_handler.go] [insertDataAccordingToPayload] virhe: %s\033[0m\n", err2.Error())
			http.Error(w, "virhe lapsitaulun sarakkeiden haussa", http.StatusInternalServerError)
			return 0, nil, err2
		}
		childTypeMap := make(map[string]string)
		for _, cc := range childCols {
			childTypeMap[cc.ColumnName] = cc.DataType
		}

		for colName, rawVal := range child.Data {
			colType := strings.ToLower(childTypeMap[colName])
			if strings.Contains(colType, "vector") {
				// Poistetaan, ettei tallenneta lapsen vector-sarakkeita
				delete(child.Data, colName)
				continue
			}
			// Jos integer-tyyppi ja tyhjä
			if isIntegerType(colType) {
				if s, ok := rawVal.(string); ok {
					if strings.TrimSpace(s) == "" {
						child.Data[colName] = 0
						fmt.Printf("[INFO] child int-sarake '%s' oli tyhjä, asetetaan dummy-arvo 0\n", colName)
					} else {
						parsedVal, parseErr := strconv.Atoi(strings.TrimSpace(s))
						if parseErr != nil {
							tx.Rollback()
							fmt.Printf("\033[31m[add_row_handler.go] [insertDataAccordingToPayload] virhe: %s\033[0m\n", parseErr.Error())
							http.Error(w, "invalid integer value for "+colName, http.StatusBadRequest)
							return 0, nil, parseErr
						}
						child.Data[colName] = parsedVal
					}
				}
			}
		}

		cID, cErr := insertSingleChildRow(tx, mainRowID, child)
		if cErr != nil {
			tx.Rollback()
			fmt.Printf("\033[31m[add_row_handler.go] [insertDataAccordingToPayload] virhe: %s\033[0m\n", cErr.Error())
			http.Error(w, "virhe aliobjektin lisäyksessä", http.StatusInternalServerError)
			return 0, nil, cErr
		}
		// esim. "file_child_0"
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
				fmt.Printf("\033[31m[add_row_handler.go] [insertDataAccordingToPayload] virhe: %s\033[0m\n", errNew.Error())
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
			fmt.Printf("\033[31m[add_row_handler.go] [insertDataAccordingToPayload] virhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe M2M-liitoksen lisäyksessä", http.StatusInternalServerError)
			return 0, nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		fmt.Printf("\033[31m[add_row_handler.go] [insertDataAccordingToPayload] virhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe transaktion commitissa", http.StatusInternalServerError)
		return 0, nil, err
	}

	// Mahdolliset triggerit
	insertedRow := map[string]interface{}{"id": mainRowID}
	if err := gt_triggers.ExecuteTriggers(tableName, insertedRow); err != nil {
		fmt.Printf("\033[31m[add_row_handler.go] [executeTriggers] virhe: %s\033[0m\n", err.Error())
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
			fmt.Printf("\033[31m[add_row_handler.go] [saveUploadedFiles] virhe: %s\033[0m\n", err.Error())
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
			fmt.Printf("\033[31m[add_row_handler.go] [saveUploadedFiles] virhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe kansiota luodessa", http.StatusInternalServerError)
			continue
		}

		// Uusi tiedostonimi
		originalExt := filepath.Ext(fh.Filename)
		newFileName := fmt.Sprintf("%s_%d_%d%s", tableUID, mainRowID, childRowID, originalExt)
		savePath := filepath.Join(subFolder, newFileName)

		dstFile, err := os.Create(savePath)
		if err != nil {
			fmt.Printf("\033[31m[add_row_handler.go] [saveUploadedFiles] virhe: %s\033[0m\n", err.Error())
			http.Error(w, "virhe tiedoston luomisessa", http.StatusInternalServerError)
			continue
		}

		_, err = io.Copy(dstFile, srcFile)
		dstFile.Close()
		if err != nil {
			fmt.Printf("\033[31m[add_row_handler.go] [saveUploadedFiles] virhe: %s\033[0m\n", err.Error())
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
			fmt.Printf("\033[31m[add_row_handler.go] [saveUploadedFiles -> updateCacheTargetsNoTx] virhe: %s\033[0m\n", err.Error())
		}
	}
}

// updateFilenameInChildRow tekee pienen UPDATE-lauseen tallentaakseen
// uuden tiedostonimen lapsirivin "filename"-sarakkeeseen.
func updateFilenameInChildRow(childTableName string, childRowID int64, newFileName string) {
	updateQ := fmt.Sprintf(`UPDATE %s SET filename=$1 WHERE id=$2`, pq.QuoteIdentifier(childTableName))
	if _, err := backend.Db.Exec(updateQ, newFileName, childRowID); err != nil {
		fmt.Printf("\033[31m[add_row_handler.go] [updateFilenameInChildRow] virhe: tiedostonimen päivitys tauluun=%s, id=%d: %s\033[0m\n", childTableName, childRowID, err.Error())
	}
}

// queryExecer rajapinta, jota sekä *sql.DB että *sql.Tx toteuttavat.
// Näin voimme kutsua samaa funktiota sekä transaktion sisällä (tx) että ulkopuolella (db).
type queryExecer interface {
	Exec(query string, args ...interface{}) (sql.Result, error)
	QueryRow(query string, args ...interface{}) *sql.Row
}

// updateCacheTargets (transaktion sisällä) – kutsuu yhteistä base-funktiota.
func updateCacheTargets(
	tx *sql.Tx,
	sourceTable string,
	sourceColumn string,
	childData map[string]interface{},
) error {
	return updateCacheTargetsBase(tx, sourceTable, sourceColumn, childData)
}

// updateCacheTargetsNoTx (transaktion ulkopuolella) – kutsuu samaa base-funktiota,
// mutta käyttää *sql.DB-olion sijaan.
func updateCacheTargetsNoTx(
	sourceTable string,
	sourceColumn string,
	childData map[string]interface{},
) error {
	return updateCacheTargetsBase(backend.Db, sourceTable, sourceColumn, childData)
}

// updateCacheTargetsBase sisältää varsinaisen logiikan. Sitä ajetaan joko tx:n tai db:n kautta.
func updateCacheTargetsBase(
	db queryExecer,
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

	err := db.QueryRow(query, sourceTable, sourceColumn).Scan(
		&targetInsertSpecs, &targetTableName, &targetColumnName,
	)
	if err != nil {
		// Ei välttämättä ole riviä => ei tarvitse päivittää mitään
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

	// Kahlataan jokainen cacheTargets ja ajetaan UPDATE-lauseet
	for _, target := range cacheTargets {
		targetObj, _ := target.(map[string]interface{})
		targetTblName, _ := targetObj["table"].(string)
		targetColName, _ := targetObj["column"].(string)
		if targetTblName == "" || targetColName == "" {
			continue
		}

		updateQuery := fmt.Sprintf(
			`UPDATE %s SET %s = $1 WHERE %s = $2`,
			pq.QuoteIdentifier(targetTblName),
			pq.QuoteIdentifier(targetColName),
			pq.QuoteIdentifier(targetColumnName),
		)

		if _, execErr := db.Exec(updateQuery, filenameStr, referencingValue); execErr != nil {
			return fmt.Errorf("\033[31mvirhe: cache update error table=%s col=%s: %v\033[0m",
				targetTblName, targetColName, execErr)
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
		fmt.Printf("\033[31m[add_row_handler.go] [insertSingleChildRow] virhe: %s\033[0m\n", err.Error())
		return 0, err
	}

	// Tämän jälkeen (transaktion sisällä) päivitetään mahdolliset cacheTargets
	if cacheErr := updateCacheTargets(tx, child.TableName, child.ReferencingColumn, child.Data); cacheErr != nil {
		fmt.Printf("\033[31m[add_row_handler.go] [insertSingleChildRow -> updateCacheTargets] virhe: %s\033[0m\n", cacheErr.Error())
		return 0, cacheErr
	}

	return childRowID, nil
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
		fmt.Printf("\033[31m[add_row_handler.go] [insertNewThirdTableRow] virhe: %s\033[0m\n", err.Error())
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
		fmt.Printf("\033[31m[add_row_handler.go] [insertOneManyToManyRelation] virhe: %s\033[0m\n", err.Error())
	}
	return err
}

// getCurrentUserID hakee sessiosta user_id:n (int) tai virheen
func getCurrentUserID(r *http.Request) (int, error) {
	store := e_sessions.GetStore()
	session, err := store.Get(r, "session")
	if err != nil {
		fmt.Printf("\033[31m[add_row_handler.go] [getCurrentUserID] virhe: %s\033[0m\n", err.Error())
		return 0, fmt.Errorf("session get error: %v", err)
	}
	rawUserID, ok := session.Values["user_id"]
	if !ok {
		fmt.Printf("\033[31m[add_row_handler.go] [getCurrentUserID] virhe: käyttäjän ID puuttuu sessiosta\033[0m\n")
		return 0, fmt.Errorf("käyttäjän ID puuttuu sessiosta")
	}
	userID, ok := rawUserID.(int)
	if !ok {
		fmt.Printf("\033[31m[add_row_handler.go] [getCurrentUserID] virhe: käyttäjän ID on väärää tyyppiä sessiossa\033[0m\n")
		return 0, fmt.Errorf("user ID invalid type in session")
	}
	return userID, nil
}

// getCurrentUsername hakee sessiosta "username"-arvon (string) tai virheen
func getCurrentUsername(r *http.Request) (string, error) {
	store := e_sessions.GetStore()
	session, err := store.Get(r, "session")
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return "", fmt.Errorf("session get error: %v", err)
	}
	rawUsername, ok := session.Values["username"]
	if !ok {
		fmt.Printf("\033[31mvirhe: käyttäjänimi puuttuu sessiosta\033[0m\n")
		return "", fmt.Errorf("käyttäjänimi puuttuu sessiosta")
	}
	username, ok := rawUsername.(string)
	if !ok {
		fmt.Printf("\033[31mvirhe: käyttäjänimi on väärää tyyppiä sessiossa\033[0m\n")
		return "", fmt.Errorf("username invalid type in session")
	}
	return username, nil
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

		// Erikoiskäsittely geometry-tyypille
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
		fmt.Printf("\033[31m[add_row_handler.go] [insertMainRow] virhe: %s\033[0m\n", err.Error())
		return 0, err
	}
	return mainRowID, nil
}

// hasOpenAIEmbeddingColumn palauttaa true, jos taulussa on openai_embedding -sarake.
func hasOpenAIEmbeddingColumn(tableName string) bool {
	query := `
		SELECT column_name
		FROM information_schema.columns
		WHERE table_name = $1
		  AND column_name = 'openai_embedding'
	`
	var dummyCol string
	err := backend.Db.QueryRow(query, tableName).Scan(&dummyCol)
	if err == sql.ErrNoRows {
		return false
	} else if err != nil {
		fmt.Printf("\033[31m[add_row_handler.go] [hasOpenAIEmbeddingColumn] virhe: %s\033[0m\n", err.Error())
		return false
	}
	// dummyCol ei sinällään tarvita, vain varmistus että sarake on.
	return true
}

// generateOpenAIEmbeddingForSingleRow hakee rivin tekstisarakkeet, muodostaa embeddingin
// ja tallentaa sen openai_embedding-sarakkeeseen.
func generateOpenAIEmbeddingForSingleRow(tableName string, rowID int64) error {
	// 1) Onko OPENAI_API_KEY asetettu
	apiKey := os.Getenv("OPENAI_API_KEY")
	if strings.TrimSpace(apiKey) == "" {
		return fmt.Errorf("OPENAI_API_KEY puuttuu ympäristömuuttujista")
	}
	modelName := os.Getenv("OPENAI_EMBEDDING_MODEL")
	if modelName == "" {
		modelName = "text-embedding-ada-002"
	}

	// 2) Haetaan tekstisarakkeiden nimet
	textCols, err := getTextColumns(tableName)
	if err != nil {
		return fmt.Errorf("tekstisarakkeiden haku epäonnistui: %w", err)
	}
	if len(textCols) == 0 {
		// Ei ole tekstisarakkeita -> ei embeddingiä
		return nil
	}

	// 3) Ladataan tämä rivi, vain tekstikolumnit
	selectCols := strings.Join(textCols, ", ")
	sqlStr := fmt.Sprintf(`SELECT %s FROM %s WHERE id=$1`, selectCols, pq.QuoteIdentifier(tableName))
	row := backend.Db.QueryRow(sqlStr, rowID)

	data := make([]interface{}, len(textCols))
	ptrs := make([]interface{}, len(textCols))
	for i := range data {
		ptrs[i] = &data[i]
	}
	if err := row.Scan(ptrs...); err != nil {
		return fmt.Errorf("rivin (id=%d) lukeminen epäonnistui: %w", rowID, err)
	}

	// 4) Rakennetaan yksi iso tekstilauseke niistä sarakkeista, joista löytyy arvo
	var textParts []string
	for i := range textCols {
		val := data[i]
		if val == nil {
			continue
		}
		strVal := fmt.Sprintf("%v", val)
		trimmed := strings.TrimSpace(strVal)
		if trimmed != "" {
			textParts = append(textParts, trimmed)
		}
	}
	joinedText := strings.Join(textParts, " / ")
	if strings.TrimSpace(joinedText) == "" {
		// Ei tekstisisältöä
		return nil
	}

	// 5) Kutsutaan OpenAI-embeddings
	client := openai.NewClient(apiKey)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := client.CreateEmbeddings(ctx, openai.EmbeddingRequest{
		Model: openai.EmbeddingModel(modelName),
		Input: []string{joinedText},
	})
	if err != nil {
		return fmt.Errorf("OpenAI embedding error: %w", err)
	}
	if len(resp.Data) == 0 {
		return fmt.Errorf("openAI ei palauttanut dataa")
	}
	embedding := resp.Data[0].Embedding

	// 6) Tallennetaan vektori
	vectorVal := pgvector.NewVector(embedding)
	updateQuery := fmt.Sprintf(`UPDATE %s SET openai_embedding = $1 WHERE id = $2`, pq.QuoteIdentifier(tableName))
	if _, err := backend.Db.Exec(updateQuery, vectorVal, rowID); err != nil {
		return fmt.Errorf("embeddingin tallennus epäonnistui: %w", err)
	}

	return nil
}

// getTextColumns hakee text/varchar -sarakkeiden nimet
func getTextColumns(tableName string) ([]string, error) {
	query := `
		SELECT column_name
		FROM information_schema.columns
		WHERE table_name = $1
		  AND data_type IN ('text','character varying')
		ORDER BY ordinal_position
	`
	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

// isIntegerType on apu-funktio integer-tyypin tunnistamiseen
func isIntegerType(dataType string) bool {
	dataType = strings.ToLower(dataType)
	return strings.Contains(dataType, "int")
}
