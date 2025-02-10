// read_update_columns.go
package gt_crud

import (
	"database/sql"
	"easelect/backend"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
)

func GetTableColumnsHandler(w http.ResponseWriter, r *http.Request) {
	// Oletetaan, että URL-polku on /api/table-columns/{table_name}
	tableName := strings.TrimPrefix(r.URL.Path, "/api/table-columns/")
	if tableName == "" {
		http.Error(w, "Table name is required", http.StatusBadRequest)
		return
	}

	columns, err := GetTableColumnsWithTypesAndIDs(tableName)
	if err != nil {
		log.Printf("Error fetching columns: %v", err)
		http.Error(w, "Error fetching columns", http.StatusInternalServerError)
		return
	}

	// Tulostetaan lokiin jokaisen sarakkeen tiedot
	// for i, c := range columns {
	// 	log.Printf("Sarake %d: %#v", i, c)
	// }

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(columns); err != nil {
		log.Printf("Error encoding response: %v", err)
		http.Error(w, "Error encoding response", http.StatusInternalServerError)
	}
}

// file: metadata_updater.go
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

// Päivitetty GetTableColumnsWithTypesAndIDs-funktio
func GetTableColumnsWithTypesAndIDs(tableName string) ([]map[string]interface{}, error) {
	// Hae table_uid system_db_tables-taulusta
	var tableUID int
	err := backend.Db.QueryRow(`
        SELECT table_uid
        FROM system_db_tables
        WHERE table_name = $1
    `, tableName).Scan(&tableUID)
	if err != nil {
		return nil, fmt.Errorf("error fetching table_uid for table %s: %v", tableName, err)
	}

	// Hae saraketiedot liittymällä system_column_details ja information_schema.columns
	query := `
        SELECT cd.column_uid, cd.column_name, c.data_type, cd.attnum
        FROM system_column_details cd
        JOIN information_schema.columns c
          ON c.table_name = $1 AND c.column_name = cd.column_name
        WHERE cd.table_uid = $2
        ORDER BY cd.attnum
    `
	rows, err := backend.Db.Query(query, tableName, tableUID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []map[string]interface{}
	for rows.Next() {
		var (
			columnUid  int
			columnName string
			dataType   string
			attnum     int
		)
		if err := rows.Scan(&columnUid, &columnName, &dataType, &attnum); err != nil {
			return nil, err
		}
		columnInfo := map[string]interface{}{
			"column_uid":  columnUid,
			"column_name": columnName,
			"data_type":   dataType,
			"attnum":      attnum,
		}
		columns = append(columns, columnInfo)
	}
	return columns, nil
}
