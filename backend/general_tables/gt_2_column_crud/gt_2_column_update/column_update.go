// column_update.go
package gt_2_column_update

import (
	"database/sql"
	// josta saa ModifiedCol
	// BRIDGE
	// gt_3_table_crud_imports_handler "easelect/backend/general_tables/gt_3_table_crud/gt_3_table_crud_imports_handler"
	backend "easelect/backend/main_app"
	"fmt"
	"log"
)

// // column_update.go
// package gt_2_column_update

// import (
// 	"database/sql"
// 	"easelect/backend/general_tables/gt_2_column_crud/gt_2_column_create"
// 	"easelect/backend/general_tables/gt_2_column_crud/gt_2_column_delete"
// 	backend "easelect/backend/main_app"
// 	"easelect/backend/main_app/security"
// 	"encoding/json"
// 	"fmt"
// 	"log"
// 	"net/http"
// 	"strings"
// )

// func UpdateColumnOrderHandler(w http.ResponseWriter, r *http.Request) {
// 	if r.Method != http.MethodPost {
// 		http.Error(w, "Metodi ei ole sallittu", http.StatusMethodNotAllowed)
// 		return
// 	}

// 	var requestData struct {
// 		TableName string `json:"table_name"`
// 		NewOrder  []int  `json:"new_order"` // Tämä sisältää column_uid -arvot kokonaislukuina
// 	}

// 	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
// 		log.Printf("UpdateColumnOrderHandler: Virhe datan dekoodauksessa: %v", err)
// 		http.Error(w, "Virheellinen data", http.StatusBadRequest)
// 		return
// 	}

// 	if requestData.TableName == "" || len(requestData.NewOrder) == 0 {
// 		http.Error(w, "Taulun nimi tai uusi järjestys puuttuu", http.StatusBadRequest)
// 		return
// 	}

// 	// Haetaan olemassa olevat sarakkeet tietokannasta
// 	var existingColumnsJSON string
// 	query := `SELECT columns FROM system_db_tables WHERE table_name = $1`
// 	err := backend.Db.QueryRow(query, requestData.TableName).Scan(&existingColumnsJSON)
// 	if err != nil {
// 		log.Printf("Virhe haettaessa olemassa olevia sarakkeita taululle %s: %v", requestData.TableName, err)
// 		http.Error(w, "Virhe haettaessa olemassa olevia sarakkeita", http.StatusInternalServerError)
// 		return
// 	}

// 	// Muutetaan JSON-stringi sliceksi
// 	var existingColumns []int
// 	err = json.Unmarshal([]byte(existingColumnsJSON), &existingColumns)
// 	if err != nil {
// 		log.Printf("Virhe parsittaessa olemassa olevia sarakkeita JSON: %v", err)
// 		http.Error(w, "Virhe käsiteltäessä olemassa olevia sarakkeita", http.StatusInternalServerError)
// 		return
// 	}

// 	// Ensimmäinen ehto: tarkistetaan, että sarakkeiden lukumäärä on sama
// 	if len(requestData.NewOrder) != len(existingColumns) {
// 		http.Error(w, "Sarakkeiden lukumäärä ei täsmää olemassa olevien sarakkeiden kanssa", http.StatusBadRequest)
// 		return
// 	}

// 	// Toinen ehto: tarkistetaan, että päivitettävät sarakkeet ovat samat kuin olemassa olevat sarakkeet
// 	existingColumnsMap := make(map[int]bool)
// 	for _, col := range existingColumns {
// 		existingColumnsMap[col] = true
// 	}

// 	newOrderColumnsMap := make(map[int]bool)
// 	for _, col := range requestData.NewOrder {
// 		// Tarkistetaan myös, ettei tule päällekkäisiä sarakkeita
// 		if newOrderColumnsMap[col] {
// 			http.Error(w, "Uudessa järjestyksessä on päällekkäisiä sarakkeita", http.StatusBadRequest)
// 			return
// 		}
// 		newOrderColumnsMap[col] = true

// 		if !existingColumnsMap[col] {
// 			http.Error(w, "Päivitettävät sarakkeet eivät täsmää olemassa olevien sarakkeiden kanssa", http.StatusBadRequest)
// 			return
// 		}
// 	}

// 	// Convert the new order to JSON string
// 	newOrderJSON, err := json.Marshal(requestData.NewOrder)
// 	if err != nil {
// 		log.Printf("Virhe marshalling new order: %v", err)
// 		http.Error(w, "Virhe tallennettaessa järjestystä", http.StatusInternalServerError)
// 		return
// 	}

// 	// Update the col_display_order field in system_db_tables
// 	query = `
//         UPDATE system_db_tables
//         SET col_display_order = $1
//         WHERE table_name = $2
//     `
// 	_, err = backend.Db.Exec(query, string(newOrderJSON), requestData.TableName)
// 	if err != nil {
// 		log.Printf("Virhe päivitettäessä col_display_order taululle %s: %v", requestData.TableName, err)
// 		http.Error(w, "Virhe tallennettaessa järjestystä", http.StatusInternalServerError)
// 		return
// 	}

// 	w.WriteHeader(http.StatusOK)
// 	json.NewEncoder(w).Encode(map[string]string{
// 		"message": "Sarakkeiden järjestys tallennettu onnistuneesti",
// 	})
// }

// func UpdateColumns(tx *sql.Tx, sanitizedTableName string, modifiedCols []ModifiedCol) error {
// 	fmt.Println("Muokataan sarakkeita (jos on):", modifiedCols)
// 	for _, mcol := range modifiedCols {
// 		fmt.Println("Käsitellään muokkaus:", mcol)
// 		sOrigName, err2 := security.SanitizeIdentifier(mcol.OriginalName)
// 		if err2 != nil {
// 			return err2
// 		}

// 		sNewName, err2 := security.SanitizeIdentifier(mcol.NewName)
// 		if err2 != nil {
// 			return err2
// 		}

// 		// Sarakkeen uudelleennimeäminen
// 		if sOrigName != sNewName {
// 			renameStmt := fmt.Sprintf("ALTER TABLE %s RENAME COLUMN %s TO %s", sanitizedTableName, sOrigName, sNewName)
// 			fmt.Println("Uudelleennimetään sarake:", renameStmt)
// 			_, err2 = tx.Exec(renameStmt)
// 			if err2 != nil {
// 				fmt.Println("Virhe uudelleennimetessä saraketta:", err2)
// 				return err2
// 			}
// 		}

// 		// Sarakkeen tyypin muuttaminen
// 		newType := strings.ToUpper(mcol.DataType)
// 		if newType == "VARCHAR" && mcol.Length != nil {
// 			newType = fmt.Sprintf("VARCHAR(%d)", *mcol.Length)
// 		}
// 		alterTypeStmt := fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s TYPE %s", sanitizedTableName, sNewName, newType)
// 		fmt.Println("Muokataan sarakkeen tyyppiä:", alterTypeStmt)
// 		_, err2 = tx.Exec(alterTypeStmt)
// 		if err2 != nil {
// 			fmt.Println("Virhe muutettaessa sarakkeen tyyppiä:", err2)
// 			return err2
// 		}
// 	}
// 	return nil
// }

func UpdateColumnMetadata() error {
	// Poista rivit system_column_details-taulusta, joiden table_uid ei enää ole olemassa
	cleanupQuery := `
        DELETE FROM system_column_details
        WHERE table_uid NOT IN (
            SELECT table_uid FROM system_db_tables
        )
    `
	_, err := backend.Db.Exec(cleanupQuery)
	if err != nil {
		return fmt.Errorf("error cleaning up obsolete entries: %v", err)
	}

	// Hae kaikki taulut system_db_tables-taulusta
	tablesQuery := `
        SELECT table_name, table_uid
        FROM system_db_tables
    `
	rows, err := backend.Db.Query(tablesQuery)
	if err != nil {
		return fmt.Errorf("error fetching tables: %v", err)
	}
	defer rows.Close()

	type TableInfo struct {
		TableName string
		TableUID  int
	}

	var tables []TableInfo

	for rows.Next() {
		var table TableInfo
		if err := rows.Scan(&table.TableName, &table.TableUID); err != nil {
			return fmt.Errorf("error scanning table info: %v", err)
		}
		tables = append(tables, table)
	}

	// Iteroi jokainen taulu
	for _, table := range tables {

		// Hae saraketiedot
		columnsQuery := fmt.Sprintf(`
			SELECT a.attnum,
				a.attname,
				pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
			FROM pg_attribute a
			WHERE a.attrelid = '%s'::regclass
			AND a.attnum > 0
			AND NOT a.attisdropped
			ORDER BY a.attnum
		`, table.TableName)

		colRows, err := backend.Db.Query(columnsQuery)
		if err != nil {
			log.Printf("error fetching columns for table %s: %v",
				table.TableName, err)
			continue
		}
		defer colRows.Close()

		// Talletetaan attnum -> (column_name, data_type)
		type ColumnSmallInfo struct {
			ColumnName string
			DataType   string
		}
		existingColumns := make(map[int]ColumnSmallInfo)

		for colRows.Next() {
			var attnum int
			var col ColumnSmallInfo
			if err := colRows.Scan(&attnum, &col.ColumnName, &col.DataType); err != nil {
				log.Printf("error scanning column info for table %s: %v",
					table.TableName, err)
				continue
			}
			existingColumns[attnum] = col
		}

		// Hae olemassa olevat system_column_details-rivit
		metadataQuery := `
            SELECT attnum, column_name, column_uid, data_type
            FROM system_column_details
            WHERE table_uid = $1
        `
		metaRows, err := backend.Db.Query(metadataQuery, table.TableUID)
		if err != nil {
			log.Printf("error fetching metadata for table %s: %v",
				table.TableName, err)
			continue
		}
		defer metaRows.Close()

		// Talletetaan attnum -> (column_uid, data_type)
		type ExistingMeta struct {
			ColumnUID int
			DataType  *string // tässä voi olla nil, jos data_type on null
		}
		existingMetadata := make(map[int]ExistingMeta)

		for metaRows.Next() {
			var attnum int
			var columnName string
			var columnID int
			var dataType sql.NullString

			if err := metaRows.Scan(&attnum, &columnName, &columnID, &dataType); err != nil {
				log.Printf("error scanning metadata for table %s: %v",
					table.TableName, err)
				continue
			}
			existingMetadata[attnum] = ExistingMeta{
				ColumnUID: columnID,
				DataType:  nilIfEmpty(dataType),
			}
		}

		// Päivitä tai lisää sarakkeet
		for attnum, col := range existingColumns {
			if metaInfo, exists := existingMetadata[attnum]; exists {
				// Sarake on jo olemassa, päivitetään tiedot (myös data_type)
				updateQuery := `
                    UPDATE system_column_details
                    SET column_name = $1,
                        attnum      = $2,
                        data_type   = $3
                    WHERE column_uid = $4
                `
				_, err = backend.Db.Exec(
					updateQuery,
					col.ColumnName,
					attnum,
					col.DataType,
					metaInfo.ColumnUID,
				)
				if err != nil {
					log.Printf("error updating system_column_details for "+
						"table %s, column %s: %v",
						table.TableName, col.ColumnName, err)
					continue
				}
			} else {
				// Uusi sarake, lisätään se
				insertQuery := `
                    INSERT INTO system_column_details
                        (table_uid, attnum, column_name, data_type)
                    VALUES ($1, $2, $3, $4)
                `
				_, err = backend.Db.Exec(
					insertQuery,
					table.TableUID,
					attnum,
					col.ColumnName,
					col.DataType,
				)
				if err != nil {
					log.Printf("error inserting into system_column_details "+
						"for table %s, column %s: %v",
						table.TableName, col.ColumnName, err)
					continue
				}
			}
		}

		// Poista sarakkeet, joita ei enää ole
		for attnum := range existingMetadata {
			if _, exists := existingColumns[attnum]; !exists {
				deleteQuery := `
                    DELETE FROM system_column_details
                    WHERE table_uid = $1 AND attnum = $2
                `
				_, err = backend.Db.Exec(deleteQuery, table.TableUID, attnum)
				if err != nil {
					log.Printf("error deleting from system_column_details "+
						"for table %s, attnum %d: %v",
						table.TableName, attnum, err)
					continue
				}
			}
		}
	}

	return nil
}

// nilIfEmpty on pieni apufunktio, jolla muutetaan mahdollinen NullString osoittimeksi
func nilIfEmpty(ns sql.NullString) *string {
	if ns.Valid {
		s := ns.String
		return &s
	}
	return nil
}

// func UpdateColDisplayOrder(existingOrder, allColumns []int) []int {
// 	// Luo uusi järjestyslista
// 	newOrder := []int{}

// 	// Luo setti kaikista sarakkeista nopeaa hakua varten
// 	columnsSet := make(map[int]bool)
// 	for _, col := range allColumns {
// 		columnsSet[col] = true
// 	}

// 	// Lisää olemassa olevat sarakkeet järjestyksessä, jotka ovat vielä olemassa
// 	for _, colID := range existingOrder {
// 		if columnsSet[colID] {
// 			newOrder = append(newOrder, colID)
// 			delete(columnsSet, colID)
// 		}
// 	}

// 	// Lisää uudet sarakkeet loppuun
// 	for colID := range columnsSet {
// 		newOrder = append(newOrder, colID)
// 	}

// 	return newOrder
// }

// type ModifyColumnsRequest struct {
// 	TableName    string        `json:"table_name"`
// 	ModifiedCols []ModifiedCol `json:"modified_columns"`
// 	AddedCols    []ModifiedCol `json:"added_columns"`
// 	RemovedCols  []string      `json:"removed_columns"`
// }

// type ModifiedCol struct {
// 	OriginalName string `json:"original_name"`
// 	NewName      string `json:"new_name"`
// 	DataType     string `json:"data_type"`
// 	Length       *int   `json:"length,omitempty"`
// }

// func ModifyColumnsHandler(w http.ResponseWriter, r *http.Request) {
// 	fmt.Println("ModifyColumnsHandler started")
// 	if r.Method != http.MethodPost {
// 		http.Error(w, "vain POST sallittu", http.StatusMethodNotAllowed)
// 		return
// 	}

// 	var req ModifyColumnsRequest
// 	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
// 		log.Printf("virhe datan dekoodauksessa: %v", err)
// 		http.Error(w, "virheellinen data", http.StatusBadRequest)
// 		return
// 	}

// 	fmt.Printf("Vastaanotettu pyyntö: TableName=%s\n", req.TableName)
// 	fmt.Printf("ModifiedCols: %#v\n", req.ModifiedCols)
// 	fmt.Printf("AddedCols: %#v\n", req.AddedCols)
// 	fmt.Printf("RemovedCols: %#v\n", req.RemovedCols)

// 	if req.TableName == "" {
// 		http.Error(w, "taulun nimi puuttuu", http.StatusBadRequest)
// 		return
// 	}

// 	sanitizedTableName, err := security.SanitizeIdentifier(req.TableName)
// 	if err != nil {
// 		fmt.Println("Virhe taulun nimen validoinnissa:", err)
// 		http.Error(w, err.Error(), http.StatusBadRequest)
// 		return
// 	}

// 	tx, err := backend.Db.Begin()
// 	if err != nil {
// 		fmt.Println("Transaktion aloittaminen epäonnistui:", err)
// 		http.Error(w, fmt.Sprintf("virhe transaktion aloittamisessa: %v", err), http.StatusInternalServerError)
// 		return
// 	}
// 	defer func() {
// 		if err != nil {
// 			fmt.Println("Virhe tapahtui, rollbackataan:", err)
// 			tx.Rollback()
// 		} else {
// 			cerr := tx.Commit()
// 			if cerr != nil {
// 				log.Printf("virhe transaktion commitissa: %v", cerr)
// 				http.Error(w, "virhe tallennettaessa muutoksia", http.StatusInternalServerError)
// 			} else {
// 				fmt.Println("Transaktio commitattu onnistuneesti")
// 			}
// 		}
// 	}()

// 	// Poisto
// 	if removeErr := gt_2_column_delete.RemoveColumns(tx, sanitizedTableName, req.RemovedCols); removeErr != nil {
// 		err = removeErr
// 		return
// 	}

// 	// Muokkaus
// 	if updateErr := UpdateColumns(tx, sanitizedTableName, req.ModifiedCols); updateErr != nil {
// 		err = updateErr
// 		return
// 	}

// 	// Luonti
// 	if addErr := gt_2_column_create.AddNewColumns(tx, sanitizedTableName, req.AddedCols); addErr != nil {
// 		err = addErr
// 		return
// 	}

// 	// OID ja taulunimet
// 	fmt.Println("Päivitetään OID:t ja taulujen nimet.")
// 	err = gt_3_table_update.UpdateOidsAndTableNames()
// 	if err != nil {
// 		fmt.Println("Virhe päivitettäessä OID-arvoja:", err)
// 		http.Error(w, fmt.Sprintf("virhe päivitettäessä OID-arvoja ja taulujen nimiä: Taulu %s: %v", sanitizedTableName, err), http.StatusInternalServerError)
// 		return
// 	}

// 	fmt.Println("Muutokset tallennettu onnistuneesti.")
// 	w.Header().Set("Content-Type", "application/json")
// 	json.NewEncoder(w).Encode(map[string]string{"message": "Muutokset tallennettu onnistuneesti"})
// }
