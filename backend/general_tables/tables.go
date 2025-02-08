// tables.go
package general_tables

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"rapsa/backend"
	"rapsa/backend/general_tables/gt_crud"
	"rapsa/backend/general_tables/models"

	_ "github.com/lib/pq"
)

// GetGroupedTables palauttaa ryhmitellyt taulut ilman tietotyyppejä sarakkeissa
func GetGroupedTables(response_writer http.ResponseWriter, http_request *http.Request) {
	select_tables_query := `SELECT id, table_name, columns FROM system_db_tables`
	query_rows, query_error := backend.Db.Query(select_tables_query)
	if query_error != nil {
		log.Printf("virhe taulujen hakemisessa: %v", query_error)
		http.Error(response_writer, "virhe taulujen hakemisessa", http.StatusInternalServerError)
		return
	}
	defer query_rows.Close()

	var tables_list []models.Table
	for query_rows.Next() {
		var single_table models.Table
		var columns_json_string string

		scan_error := query_rows.Scan(&single_table.ID, &single_table.TableName, &columns_json_string)
		if scan_error != nil {
			log.Printf("virhe taulujen käsittelyssä: %v", scan_error)
			http.Error(response_writer, "virhe taulujen käsittelyssä", http.StatusInternalServerError)
			return
		}

		unmarshal_error := json.Unmarshal([]byte(columns_json_string), &single_table.Columns)
		if unmarshal_error != nil {
			log.Printf("virhe columns-sarakkeen purkamisessa taululle %s: %v", single_table.TableName, unmarshal_error)
			http.Error(response_writer, "virhe taulujen käsittelyssä", http.StatusInternalServerError)
			return
		}

		tables_list = append(tables_list, single_table)
	}

	response_map := map[string]interface{}{
		"tables": tables_list,
	}

	response_writer.Header().Set("Content-Type", "application/json")
	encode_error := json.NewEncoder(response_writer).Encode(response_map)
	if encode_error != nil {
		log.Printf("virhe vastauksen enkoodauksessa: %v", encode_error)
		http.Error(response_writer, "virhe vastauksen enkoodauksessa", http.StatusInternalServerError)
	}
}

func UpdateOidsAndTableNames() error {
	// Vaihe 1: Päivitä taulun nimi, jos se on muuttunut
	updateNameQuery := `
        WITH table_oids AS (
            SELECT c.oid, c.relname AS table_name
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
        )
        UPDATE system_db_tables
        SET table_name = table_oids.table_name
        FROM table_oids
        WHERE system_db_tables.cached_oid = table_oids.oid
            AND system_db_tables.table_name != table_oids.table_name;
    `
	_, err := backend.Db.Exec(updateNameQuery)
	if err != nil {
		return fmt.Errorf("virhe taulun nimien päivittämisessä: %v", err)
	}

	// Vaihe 2: Päivitä cached_oid taulun nimen perusteella, jos OID on muuttunut
	updateOidQuery := `
        WITH table_oids AS (
            SELECT c.oid, c.relname AS table_name
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
        )
        UPDATE system_db_tables
        SET cached_oid = table_oids.oid
        FROM table_oids
        WHERE system_db_tables.table_name = table_oids.table_name
            AND system_db_tables.cached_oid != table_oids.oid;
    `
	_, err = backend.Db.Exec(updateOidQuery)
	if err != nil {
		return fmt.Errorf("virhe OID-arvojen päivittämisessä: %v", err)
	}

	// Vaihe 3: Poista taulut, joita ei enää ole
	err = DeleteRemovedTables()
	if err != nil {
		return err
	}

	// Vaihe 4: Lisää uudet taulut
	err = InsertNewTables()
	if err != nil {
		return err
	}

	// Vaihe 5: Päivitä sarakkeet ja col_display_order olemassa oleville tauluille
	err = UpdateColumnsForExistingTables()
	if err != nil {
		return fmt.Errorf("virhe sarakkeiden ja col_display_order päivityksessä: %v", err)
	}

	return nil
}

func DeleteRemovedTables() error {
	deleteQuery := `
        DELETE FROM system_db_tables
        WHERE table_name NOT IN (
            SELECT c.relname
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
        );
    `
	_, err := backend.Db.Exec(deleteQuery)
	if err != nil {
		return fmt.Errorf("error deleting removed tables: %v", err)
	}
	return nil
}

// InsertNewTables lisää system_db_tables-tauluun uudet taulut
func InsertNewTables() error {
	// Hakee kaikki taulut public-skeemasta, joita ei vielä ole system_db_tables-taulussa
	tablesQuery := `
        SELECT c.oid, c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
            AND c.relkind = 'r' -- Vain normaalit taulut
            AND c.oid NOT IN (SELECT cached_oid FROM system_db_tables)
    `
	rows, err := backend.Db.Query(tablesQuery)
	if err != nil {
		return fmt.Errorf("error fetching new tables: %v", err)
	}
	defer rows.Close()

	type TableInfo struct {
		OID       int
		TableName string
	}

	var newTables []TableInfo

	for rows.Next() {
		var table TableInfo
		if err := rows.Scan(&table.OID, &table.TableName); err != nil {
			return fmt.Errorf("error scanning table info: %v", err)
		}
		newTables = append(newTables, table)
	}

	for _, table := range newTables {
		// Hakee taulun sarakkeet
		columns, err := GetColumnsForTable(table.TableName)
		if err != nil {
			log.Printf("Error fetching columns for table %s: %v", table.TableName, err)
			continue
		}

		// Muuntaa sarakkeet JSON-muotoon
		columnsJSON, err := json.Marshal(columns)
		if err != nil {
			log.Printf("Error marshalling columns for table %s: %v", table.TableName, err)
			continue
		}

		// Lisää system_db_tables-tauluun
		insertQuery := `
            INSERT INTO system_db_tables (cached_oid, table_name, columns)
            VALUES ($1, $2, $3)
        `

		_, err = backend.Db.Exec(insertQuery, table.OID, table.TableName, string(columnsJSON))
		if err != nil {
			log.Printf("Error inserting table %s into system_db_tables: %v", table.TableName, err)
			continue
		}
	}

	return nil
}

// GetColumnsForTable hakee taulun sarakkeiden nimet
func GetColumnsForTable(tableName string) ([]string, error) {
	query := `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
    `
	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []string
	for rows.Next() {
		var columnName string
		if err := rows.Scan(&columnName); err != nil {
			return nil, err
		}
		columns = append(columns, columnName)
	}
	return columns, nil
}

func HandleUpdateOidsAndTableNames(w http.ResponseWriter, r *http.Request) {
	err := UpdateOidsAndTableNames()
	if err != nil {
		http.Error(w, fmt.Sprintf("Error updating OID values and table names: %v", err), http.StatusInternalServerError)
		return
	}

	err = gt_crud.UpdateColumnMetadata()
	if err != nil {
		http.Error(w, fmt.Sprintf("Error updating column metadata: %v", err), http.StatusInternalServerError)
		return
	}

	fmt.Fprintf(w, "OID values, table names, and column metadata updated successfully.")
}

// UpdateColumnsForExistingTables päivittää olemassa olevien taulujen sarakkeet system_db_tables-taulussa
// Päivitetään myös UpdateColumnsForExistingTables-funktio
func UpdateColumnsForExistingTables() error {
	// Hakee kaikki taulut system_db_tables-taulusta
	query := `SELECT table_uid, table_name, col_display_order FROM system_db_tables`
	rows, err := backend.Db.Query(query)
	if err != nil {
		return fmt.Errorf("error fetching tables from system_db_tables: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var tableUID int
		var tableName string
		var colDisplayOrderStr sql.NullString
		if err := rows.Scan(&tableUID, &tableName, &colDisplayOrderStr); err != nil {
			return fmt.Errorf("error scanning table info: %v", err)
		}

		// Hae päivitetyt saraketiedot system_column_details-taulusta
		columns, err := GetColumnIDsForTableUID(tableUID)
		if err != nil {
			log.Printf("Error fetching column IDs for table %s: %v",
				tableName, err)
			continue
		}

		// Muunna saraketiedot JSON-muotoon
		columnsJSON, err := json.Marshal(columns)
		if err != nil {
			log.Printf("Error marshalling column IDs for table %s: %v",
				tableName, err)
			continue
		}

		// Päivitä columns-sarake system_db_tables-taulussa
		updateQuery := `
            UPDATE system_db_tables
            SET columns = $1
            WHERE table_uid = $2
        `
		_, err = backend.Db.Exec(updateQuery, string(columnsJSON), tableUID)
		if err != nil {
			log.Printf("Error updating columns for table %s: %v",
				tableName, err)
			continue
		}

		// Päivitä col_display_order
		var colDisplayOrder []int

		if colDisplayOrderStr.Valid && colDisplayOrderStr.String != "" {
			if err := json.Unmarshal([]byte(colDisplayOrderStr.String),
				&colDisplayOrder); err != nil {
				log.Printf("Error unmarshalling col_display_order for "+
					"table %s: %v", tableName, err)
				colDisplayOrder = nil
			}
		}

		// Päivitä col_display_order lisäämällä uudet column_uid:t
		colDisplayOrder = updateColDisplayOrder(colDisplayOrder, columns)

		// Päivitä col_display_order system_db_tables-tauluun
		colDisplayOrderJSON, err := json.Marshal(colDisplayOrder)
		if err != nil {
			log.Printf("Error marshalling col_display_order for table %s: %v",
				tableName, err)
			continue
		}

		updateColDisplayOrderQuery := `
            UPDATE system_db_tables
            SET col_display_order = $1
            WHERE table_uid = $2
        `
		_, err = backend.Db.Exec(updateColDisplayOrderQuery,
			string(colDisplayOrderJSON), tableUID)
		if err != nil {
			log.Printf("Error updating col_display_order for table %s: %v",
				tableName, err)
			continue
		}
	}
	return nil
}

func GetColumnIDsForTableUID(tableUID int) ([]int, error) {
	query := `
        SELECT column_uid
        FROM system_column_details
        WHERE table_uid = $1
        ORDER BY attnum
    `
	rows, err := backend.Db.Query(query, tableUID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columnIDs []int
	for rows.Next() {
		var columnID int
		if err := rows.Scan(&columnID); err != nil {
			return nil, err
		}
		columnIDs = append(columnIDs, columnID)
	}
	return columnIDs, nil
}

func updateColDisplayOrder(existingOrder, allColumns []int) []int {
	// Luo uusi järjestyslista
	newOrder := []int{}

	// Luo setti kaikista sarakkeista nopeaa hakua varten
	columnsSet := make(map[int]bool)
	for _, col := range allColumns {
		columnsSet[col] = true
	}

	// Lisää olemassa olevat sarakkeet järjestyksessä, jotka ovat vielä olemassa
	for _, colID := range existingOrder {
		if columnsSet[colID] {
			newOrder = append(newOrder, colID)
			delete(columnsSet, colID)
		}
	}

	// Lisää uudet sarakkeet loppuun
	for colID := range columnsSet {
		newOrder = append(newOrder, colID)
	}

	return newOrder
}

func GetColumnNameToIDMap(tableName string) (map[string]int, error) {
	query := `
        SELECT column_name, column_uid
        FROM system_column_details
        WHERE table_name = $1
    `
	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columnMap := make(map[string]int)
	for rows.Next() {
		var columnName string
		var columnID int
		if err := rows.Scan(&columnName, &columnID); err != nil {
			return nil, err
		}
		columnMap[columnName] = columnID
	}
	return columnMap, nil
}

func GetColumnIDsForTable(tableName string) ([]int, error) {
	query := `
        SELECT column_uid
        FROM system_column_details
        WHERE table_name = $1
        ORDER BY attnum
    `
	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columnIDs []int
	for rows.Next() {
		var columnID int
		if err := rows.Scan(&columnID); err != nil {
			return nil, err
		}
		columnIDs = append(columnIDs, columnID)
	}
	return columnIDs, nil
}
