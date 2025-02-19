// create_table.go
package gt_3_table_create

// type CreateTableRequest struct {
// 	TableName   string            `json:"table_name"`
// 	Columns     map[string]string `json:"columns"`
// 	ForeignKeys []ForeignKeyDef   `json:"foreign_keys"`
// }

// type ForeignKeyDef struct {
// 	ReferencingColumn string `json:"referencing_column"`
// 	ReferencedTable   string `json:"referenced_table"`
// 	ReferencedColumn  string `json:"referenced_column"`
// }

// // isAllowedDataType tarkistaa, että sarake on jollakin sallitulla prefiksillä.
// // Tämänkaltainen toteutus tunnistaa mm. "VARCHAR(255)" alkavan "VARCHAR" jne.
// func isAllowedDataType(colType string) bool {
// 	// Tehdään isot kirjaimet vertailua varten,
// 	// ja poistetaan mahdolliset alkutai loppuvälit
// 	c := strings.ToUpper(strings.TrimSpace(colType))

// 	allowedTypePrefixes := []string{
// 		"SERIAL",
// 		"INTEGER",
// 		"VARCHAR",
// 		"TEXT",
// 		"BOOLEAN",
// 		"DATE",
// 		"TIMESTAMP", // kattaa mm. "TIMESTAMP NOT NULL...", "TIMESTAMP WITH...", jne.
// 		"TIMESTAMPTZ",
// 		"JSONB",
// 	}

// 	for _, prefix := range allowedTypePrefixes {
// 		if strings.HasPrefix(c, prefix) {
// 			return true
// 		}
// 	}
// 	return false
// }

// func CreateTableHandler(w http.ResponseWriter, r *http.Request) {
// 	if r.Method != http.MethodPost {
// 		http.Error(w, "vain POST-metodi on sallittu", http.StatusMethodNotAllowed)
// 		return
// 	}

// 	var req CreateTableRequest
// 	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
// 		http.Error(w, fmt.Errorf("virheellinen syöte: %w", err).Error(), http.StatusBadRequest)
// 		return
// 	}

// 	// Validoi taulun nimi
// 	tableName, err := security.SanitizeIdentifier(req.TableName)
// 	if err != nil {
// 		http.Error(w, err.Error(), http.StatusBadRequest)
// 		return
// 	}

// 	if len(req.Columns) == 0 {
// 		http.Error(w, "vähintään yksi sarake on pakollinen", http.StatusBadRequest)
// 		return
// 	}

// 	var queryBuilder strings.Builder
// 	queryBuilder.WriteString(fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (", tableName))

// 	columnsCount := 0
// 	var updatedFound bool

// 	// Käydään läpi sarakkeet
// 	for colName, colType := range req.Columns {
// 		sanitizedColName, err := security.SanitizeIdentifier(colName)
// 		if err != nil {
// 			http.Error(w, fmt.Sprintf("virheellinen sarakenimi: %s", colName), http.StatusBadRequest)
// 			return
// 		}

// 		// Tarkistetaan, että tyyppi on sallitulla listalla
// 		if !isAllowedDataType(colType) {
// 			http.Error(w, fmt.Sprintf("sarake '%s' käyttää kiellettyä tietotyyppiä '%s'", colName, colType), http.StatusBadRequest)
// 			return
// 		}

// 		colTypeUpper := strings.ToUpper(colType)

// 		// Katsotaan, onko kolumni nimeltään updated
// 		// (käytetään triggeriä vain, jos se on olemassa)
// 		if strings.EqualFold(sanitizedColName, "updated") {
// 			updatedFound = true
// 		}

// 		// Jos sarake on nimeltään "id" ja "SERIAL", merkitään se PRIMARY KEY:ksi
// 		if strings.EqualFold(sanitizedColName, "id") && strings.HasPrefix(colTypeUpper, "SERIAL") {
// 			queryBuilder.WriteString(fmt.Sprintf("%s %s PRIMARY KEY", sanitizedColName, colTypeUpper))
// 		} else {
// 			// Muussa tapauksessa sarake normaalisti
// 			queryBuilder.WriteString(fmt.Sprintf("%s %s", sanitizedColName, colTypeUpper))
// 		}

// 		columnsCount++
// 		if columnsCount < len(req.Columns) {
// 			queryBuilder.WriteString(", ")
// 		}
// 	}

// 	// Lisätään vierasavaimet
// 	for _, fk := range req.ForeignKeys {
// 		sanitizedRefCol, err := security.SanitizeIdentifier(fk.ReferencingColumn)
// 		if err != nil {
// 			http.Error(w, fmt.Sprintf("virheellinen vierasavaimen referoiva sarake: %s", fk.ReferencingColumn), http.StatusBadRequest)
// 			return
// 		}

// 		sanitizedRefTable, err := security.SanitizeIdentifier(fk.ReferencedTable)
// 		if err != nil {
// 			http.Error(w, fmt.Sprintf("virheellinen viitattava taulu: %s", fk.ReferencedTable), http.StatusBadRequest)
// 			return
// 		}

// 		sanitizedRefColumn, err := security.SanitizeIdentifier(fk.ReferencedColumn)
// 		if err != nil {
// 			http.Error(w, fmt.Sprintf("virheellinen viitattava sarake: %s", fk.ReferencedColumn), http.StatusBadRequest)
// 			return
// 		}

// 		constraintName := fmt.Sprintf("fk_%s_%s", tableName, sanitizedRefCol)
// 		queryBuilder.WriteString(fmt.Sprintf(", CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s)",
// 			constraintName, sanitizedRefCol, sanitizedRefTable, sanitizedRefColumn))
// 	}

// 	queryBuilder.WriteString(");")
// 	createTableQuery := queryBuilder.String()

// 	_, err = backend.Db.Exec(createTableQuery)
// 	if err != nil {
// 		http.Error(w, fmt.Errorf("virhe taulun luomisessa: %w", err).Error(), http.StatusInternalServerError)
// 		return
// 	}

// 	// Jos 'updated'-saraketta on mukana, luodaan trigger + funktio sen päivittämiseen
// 	if updatedFound {
// 		triggerFunc := fmt.Sprintf(`
//             CREATE OR REPLACE FUNCTION set_%s_updated_timestamp()
//             RETURNS TRIGGER AS $$
//             BEGIN
//                 NEW.updated = NOW();
//                 RETURN NEW;
//             END;
//             $$ LANGUAGE plpgsql;
//         `, tableName)

// 		_, err = backend.Db.Exec(triggerFunc)
// 		if err != nil {
// 			http.Error(w, fmt.Errorf("virhe trigger-funktion luomisessa: %w", err).Error(), http.StatusInternalServerError)
// 			return
// 		}

// 		triggerStmt := fmt.Sprintf(`
//             CREATE TRIGGER update_%s_timestamp
//             BEFORE UPDATE ON %s
//             FOR EACH ROW
//             EXECUTE PROCEDURE set_%s_updated_timestamp();
//         `, tableName, tableName, tableName)

// 		_, err = backend.Db.Exec(triggerStmt)
// 		if err != nil {
// 			http.Error(w, fmt.Errorf("virhe triggerin luomisessa: %w", err).Error(), http.StatusInternalServerError)
// 			return
// 		}
// 	}

// 	// Jos teillä on tarve päivittää OIDit ym., kutsu omaa funktiotanne:
// 	err = UpdateOidsAndTableNames()
// 	if err != nil {
// 		http.Error(w, fmt.Sprintf("virhe päivitettäessä OID-arvoja ja taulujen nimiä: %v", err), http.StatusInternalServerError)
// 		return
// 	}

// 	w.WriteHeader(http.StatusCreated)
// 	w.Write([]byte("Taulu luotu onnistuneesti"))
// }

// // InsertNewTables lisää system_db_tables-tauluun uudet taulut
// func InsertNewTables() error {
// 	// Hakee kaikki taulut public-skeemasta, joita ei vielä ole system_db_tables-taulussa
// 	tablesQuery := `
//         SELECT c.oid, c.relname AS table_name
//         FROM pg_class c
//         JOIN pg_namespace n ON n.oid = c.relnamespace
//         WHERE n.nspname = 'public'
//             AND c.relkind = 'r' -- Vain normaalit taulut
//             AND c.oid NOT IN (SELECT cached_oid FROM system_db_tables)
//     `
// 	rows, err := backend.Db.Query(tablesQuery)
// 	if err != nil {
// 		return fmt.Errorf("error fetching new tables: %v", err)
// 	}
// 	defer rows.Close()

// 	type TableInfo struct {
// 		OID       int
// 		TableName string
// 	}

// 	var newTables []TableInfo

// 	for rows.Next() {
// 		var table TableInfo
// 		if err := rows.Scan(&table.OID, &table.TableName); err != nil {
// 			return fmt.Errorf("error scanning table info: %v", err)
// 		}
// 		newTables = append(newTables, table)
// 	}

// 	for _, table := range newTables {
// 		// Hakee taulun sarakkeet
// 		columns, err := gt_2_column_read.GetColumnsForTable(table.TableName)
// 		if err != nil {
// 			log.Printf("Error fetching columns for table %s: %v", table.TableName, err)
// 			continue
// 		}

// 		// Muuntaa sarakkeet JSON-muotoon
// 		columnsJSON, err := json.Marshal(columns)
// 		if err != nil {
// 			log.Printf("Error marshalling columns for table %s: %v", table.TableName, err)
// 			continue
// 		}

// 		// Lisää system_db_tables-tauluun
// 		insertQuery := `
//             INSERT INTO system_db_tables (cached_oid, table_name, columns)
//             VALUES ($1, $2, $3)
//         `

// 		_, err = backend.Db.Exec(insertQuery, table.OID, table.TableName, string(columnsJSON))
// 		if err != nil {
// 			log.Printf("Error inserting table %s into system_db_tables: %v", table.TableName, err)
// 			continue
// 		}
// 	}

// 	return nil
// }

// func UpdateOidsAndTableNames() error {
// 	// Vaihe 1: Päivitä taulun nimi, jos se on muuttunut
// 	updateNameQuery := `
//         WITH table_oids AS (
//             SELECT c.oid, c.relname AS table_name
//             FROM pg_class c
//             JOIN pg_namespace n ON n.oid = c.relnamespace
//             WHERE n.nspname = 'public'
//         )
//         UPDATE system_db_tables
//         SET table_name = table_oids.table_name
//         FROM table_oids
//         WHERE system_db_tables.cached_oid = table_oids.oid
//             AND system_db_tables.table_name != table_oids.table_name;
//     `
// 	_, err := backend.Db.Exec(updateNameQuery)
// 	if err != nil {
// 		return fmt.Errorf("virhe taulun nimien päivittämisessä: %v", err)
// 	}

// 	// Vaihe 2: Päivitä cached_oid taulun nimen perusteella, jos OID on muuttunut
// 	updateOidQuery := `
//         WITH table_oids AS (
//             SELECT c.oid, c.relname AS table_name
//             FROM pg_class c
//             JOIN pg_namespace n ON n.oid = c.relnamespace
//             WHERE n.nspname = 'public'
//         )
//         UPDATE system_db_tables
//         SET cached_oid = table_oids.oid
//         FROM table_oids
//         WHERE system_db_tables.table_name = table_oids.table_name
//             AND system_db_tables.cached_oid != table_oids.oid;
//     `
// 	_, err = backend.Db.Exec(updateOidQuery)
// 	if err != nil {
// 		return fmt.Errorf("virhe OID-arvojen päivittämisessä: %v", err)
// 	}

// 	// Vaihe 3: Poista taulut, joita ei enää ole
// 	err = gt_3_table_delete.DeleteRemovedTables()
// 	if err != nil {
// 		return err
// 	}

// 	// Vaihe 4: Lisää uudet taulut
// 	err = InsertNewTables()
// 	if err != nil {
// 		return err
// 	}

// 	// Vaihe 5: Päivitä sarakkeet ja col_display_order olemassa oleville tauluille
// 	err = UpdateColumnsForExistingTables()
// 	if err != nil {
// 		return fmt.Errorf("virhe sarakkeiden ja col_display_order päivityksessä: %v", err)
// 	}

// 	return nil
// }

// // UpdateColumnsForExistingTables päivittää olemassa olevien taulujen sarakkeet system_db_tables-taulussa
// // Päivitetään myös UpdateColumnsForExistingTables-funktio
// func UpdateColumnsForExistingTables() error {
// 	// Hakee kaikki taulut system_db_tables-taulusta
// 	query := `SELECT table_uid, table_name, col_display_order FROM system_db_tables`
// 	rows, err := backend.Db.Query(query)
// 	if err != nil {
// 		return fmt.Errorf("error fetching tables from system_db_tables: %v", err)
// 	}
// 	defer rows.Close()

// 	for rows.Next() {
// 		var tableUID int
// 		var tableName string
// 		var colDisplayOrderStr sql.NullString
// 		if err := rows.Scan(&tableUID, &tableName, &colDisplayOrderStr); err != nil {
// 			return fmt.Errorf("error scanning table info: %v", err)
// 		}

// 		// Hae päivitetyt saraketiedot system_column_details-taulusta
// 		columns, err := gt_2_column_read.GetColumnIDsForTableUID(tableUID)
// 		if err != nil {
// 			log.Printf("Error fetching column IDs for table %s: %v",
// 				tableName, err)
// 			continue
// 		}

// 		// Muunna saraketiedot JSON-muotoon
// 		columnsJSON, err := json.Marshal(columns)
// 		if err != nil {
// 			log.Printf("Error marshalling column IDs for table %s: %v",
// 				tableName, err)
// 			continue
// 		}

// 		// Päivitä columns-sarake system_db_tables-taulussa
// 		updateQuery := `
//             UPDATE system_db_tables
//             SET columns = $1
//             WHERE table_uid = $2
//         `
// 		_, err = backend.Db.Exec(updateQuery, string(columnsJSON), tableUID)
// 		if err != nil {
// 			log.Printf("Error updating columns for table %s: %v",
// 				tableName, err)
// 			continue
// 		}

// 		// Päivitä col_display_order
// 		var colDisplayOrder []int

// 		if colDisplayOrderStr.Valid && colDisplayOrderStr.String != "" {
// 			if err := json.Unmarshal([]byte(colDisplayOrderStr.String),
// 				&colDisplayOrder); err != nil {
// 				log.Printf("Error unmarshalling col_display_order for "+
// 					"table %s: %v", tableName, err)
// 				colDisplayOrder = nil
// 			}
// 		}

// 		// Päivitä col_display_order lisäämällä uudet column_uid:t
// 		colDisplayOrder = UpdateColDisplayOrder(colDisplayOrder, columns)

// 		// Päivitä col_display_order system_db_tables-tauluun
// 		colDisplayOrderJSON, err := json.Marshal(colDisplayOrder)
// 		if err != nil {
// 			log.Printf("Error marshalling col_display_order for table %s: %v",
// 				tableName, err)
// 			continue
// 		}

// 		updateColDisplayOrderQuery := `
//             UPDATE system_db_tables
//             SET col_display_order = $1
//             WHERE table_uid = $2
//         `
// 		_, err = backend.Db.Exec(updateColDisplayOrderQuery,
// 			string(colDisplayOrderJSON), tableUID)
// 		if err != nil {
// 			log.Printf("Error updating col_display_order for table %s: %v",
// 				tableName, err)
// 			continue
// 		}
// 	}
// 	return nil
// }

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

// // UpdateColumns muokkaa sarakkeen nimeä tai tietotyyppiä
// func UpdateColumns(tx *sql.Tx, sanitizedTableName string, modifiedCols []gt_2_column_crud.ModifiedCol) error {
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
// 			renameStmt := fmt.Sprintf("ALTER TABLE %s RENAME COLUMN %s TO %s",
// 				sanitizedTableName, sOrigName, sNewName)
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
// 		alterTypeStmt := fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s TYPE %s",
// 			sanitizedTableName, sNewName, newType)
// 		fmt.Println("Muokataan sarakkeen tyyppiä:", alterTypeStmt)
// 		_, err2 = tx.Exec(alterTypeStmt)
// 		if err2 != nil {
// 			fmt.Println("Virhe muutettaessa sarakkeen tyyppiä:", err2)
// 			return err2
// 		}
// 	}
// 	return nil
// }

// func UpdateColumnOrderHandler(w http.ResponseWriter, r *http.Request) {
// 	if r.Method != http.MethodPost {
// 		http.Error(w, "Metodi ei ole sallittu", http.StatusMethodNotAllowed)
// 		return
// 	}

// 	var requestData struct {
// 		TableName string `json:"table_name"`
// 		NewOrder  []int  `json:"new_order"` // Tämä sisältää column_uid -arvot
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

// 	// Haetaan olemassa olevat sarakkeet (JSON) system_db_tables-taulusta
// 	var existingColumnsJSON string
// 	query := `SELECT columns FROM system_db_tables WHERE table_name = $1`
// 	err := backend.Db.QueryRow(query, requestData.TableName).Scan(&existingColumnsJSON)
// 	if err != nil {
// 		log.Printf("Virhe haettaessa olemassa olevia sarakkeita taululle %s: %v",
// 			requestData.TableName, err)
// 		http.Error(w, "Virhe haettaessa olemassa olevia sarakkeita", http.StatusInternalServerError)
// 		return
// 	}

// 	// Muutetaan JSON-stringi --> []int
// 	var existingColumns []int
// 	err = json.Unmarshal([]byte(existingColumnsJSON), &existingColumns)
// 	if err != nil {
// 		log.Printf("Virhe parsittaessa olemassa olevia sarakkeita JSON: %v", err)
// 		http.Error(w, "Virhe käsiteltäessä olemassa olevia sarakkeita", http.StatusInternalServerError)
// 		return
// 	}

// 	// 1) Tarkistetaan, että sarakkeiden lukumäärä on sama
// 	if len(requestData.NewOrder) != len(existingColumns) {
// 		http.Error(w, "Sarakkeiden lukumäärä ei täsmää olemassa olevien sarakkeiden kanssa", http.StatusBadRequest)
// 		return
// 	}

// 	// 2) Tarkistetaan, että sarakkeet ovat samat
// 	existingColumnsMap := make(map[int]bool)
// 	for _, col := range existingColumns {
// 		existingColumnsMap[col] = true
// 	}

// 	newOrderColumnsMap := make(map[int]bool)
// 	for _, col := range requestData.NewOrder {
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

// 	// Päivitetään col_display_order
// 	newOrderJSON, err := json.Marshal(requestData.NewOrder)
// 	if err != nil {
// 		log.Printf("Virhe marshalling new order: %v", err)
// 		http.Error(w, "Virhe tallennettaessa järjestystä", http.StatusInternalServerError)
// 		return
// 	}

// 	query = `
//         UPDATE system_db_tables
//         SET col_display_order = $1
//         WHERE table_name = $2
//     `
// 	_, err = backend.Db.Exec(query, string(newOrderJSON), requestData.TableName)
// 	if err != nil {
// 		log.Printf("Virhe päivitettäessä col_display_order taululle %s: %v",
// 			requestData.TableName, err)
// 		http.Error(w, "Virhe tallennettaessa järjestystä", http.StatusInternalServerError)
// 		return
// 	}

// 	w.WriteHeader(http.StatusOK)
// 	json.NewEncoder(w).Encode(map[string]string{
// 		"message": "Sarakkeiden järjestys tallennettu onnistuneesti",
// 	})
// }

// // func UpdateColDisplayOrder(existingOrder, allColumns []int) []int {
// // 	// Luo uusi järjestyslista
// // 	newOrder := []int{}

// // 	// Luo setti kaikista sarakkeista nopeaa hakua varten
// // 	columnsSet := make(map[int]bool)
// // 	for _, col := range allColumns {
// // 		columnsSet[col] = true
// // 	}

// // 	// Lisää olemassa olevat sarakkeet järjestyksessä, jotka ovat vielä olemassa
// // 	for _, colID := range existingOrder {
// // 		if columnsSet[colID] {
// // 			newOrder = append(newOrder, colID)
// // 			delete(columnsSet, colID)
// // 		}
// // 	}

// // 	// Lisää uudet sarakkeet loppuun
// // 	for colID := range columnsSet {
// // 		newOrder = append(newOrder, colID)
// // 	}

// // 	return newOrder
// // }

// type ModifyColumnsRequest struct {
// 	TableName    string                         `json:"table_name"`
// 	ModifiedCols []gt_2_column_crud.ModifiedCol `json:"modified_columns"`
// 	AddedCols    []gt_2_column_crud.ModifiedCol `json:"added_columns"`
// 	RemovedCols  []string                       `json:"removed_columns"`
// }

// // type ModifiedCol struct {
// // 	OriginalName string `json:"original_name"`
// // 	NewName      string `json:"new_name"`
// // 	DataType     string `json:"data_type"`
// // 	Length       *int   `json:"length,omitempty"`
// // }

// // ModifyColumnsHandler käyttää *bridge-funktioita* RemoveColumnsWithBridge,
// // UpdateColumnsWithBridge, AddNewColumnsWithBridge, jne.
// func ModifyColumnsHandler(w http.ResponseWriter, r *http.Request) {
// 	fmt.Println("ModifyColumnsHandler started")
// 	if r.Method != http.MethodPost {
// 		http.Error(w, "vain POST sallittu", http.StatusMethodNotAllowed)
// 		return
// 	}

// 	var req struct {
// 		TableName    string                         `json:"table_name"`
// 		ModifiedCols []gt_2_column_crud.ModifiedCol `json:"modified_columns"`
// 		AddedCols    []gt_2_column_crud.ModifiedCol `json:"added_columns"`
// 		RemovedCols  []string                       `json:"removed_columns"`
// 	}

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
// 			_ = tx.Rollback()
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

// 	// **KÄYTETÄÄN BRIDGEtiedoston funktioita** suoran importin sijaan.
// 	if removeErr := gt_3_table_crud_imports_handler.RemoveColumnsWithBridge(
// 		tx, sanitizedTableName, req.RemovedCols,
// 	); removeErr != nil {
// 		err = removeErr
// 		return
// 	}

// 	if updateErr := UpdateColumns(tx, sanitizedTableName, req.ModifiedCols); updateErr != nil {
// 		err = updateErr
// 		return
// 	}

// 	if addErr := gt_3_table_crud_imports_handler.AddNewColumnsWithBridge(
// 		tx, sanitizedTableName, req.AddedCols,
// 	); addErr != nil {
// 		err = addErr
// 		return
// 	}

// 	// Päivitetään OID ja taulunimet bridging avulla
// 	fmt.Println("Päivitetään OID:t ja taulujen nimet bridging-funktiolla.")
// 	if oidErr := gt_3_table_crud_imports_handler.UpdateOidsAndTableNamesWithBridge(); oidErr != nil {
// 		err = oidErr
// 		http.Error(w,
// 			fmt.Sprintf("virhe päivitettäessä OID-arvoja: Taulu %s: %v", sanitizedTableName, oidErr),
// 			http.StatusInternalServerError)
// 		return
// 	}

// 	fmt.Println("Muutokset tallennettu onnistuneesti.")
// 	w.Header().Set("Content-Type", "application/json")
// 	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Muutokset tallennettu onnistuneesti"})
// }
