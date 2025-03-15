// column_update.go
package gt_2_column_update

import (
	"database/sql"
	backend "easelect/backend/core_components"
	gt_2_column_crud "easelect/backend/core_components/general_tables/gt_2_column_crud"
	"fmt"
	"log"
	"strings"
)

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
		// Hae saraketiedot mukaan lukien attnum
		columnsQuery := fmt.Sprintf(`
			SELECT a.attname,
			       a.attnum,
			       pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
			FROM pg_attribute a
			WHERE a.attrelid = '%s'::regclass
			  AND a.attnum > 0
			  AND NOT a.attisdropped
			ORDER BY a.attnum
		`, table.TableName)

		colRows, err := backend.Db.Query(columnsQuery)
		if err != nil {
			log.Printf("error fetching columns for table %s: %v", table.TableName, err)
			continue
		}
		defer colRows.Close()

		// Talletetaan sarakkeen nimi -> (data_type, attnum)
		type ColumnSmallInfo struct {
			DataType  string
			AttNumber int
		}
		existingColumns := make(map[string]ColumnSmallInfo)

		for colRows.Next() {
			var colName string
			var attNumber int
			var dataType string
			if err := colRows.Scan(&colName, &attNumber, &dataType); err != nil {
				log.Printf("error scanning column info for table %s: %v", table.TableName, err)
				continue
			}
			existingColumns[colName] = ColumnSmallInfo{
				DataType:  dataType,
				AttNumber: attNumber,
			}
		}

		// Hae olemassa olevat system_column_details-rivit käyttäen column_name:a
		metadataQuery := `
            SELECT column_name, column_uid, data_type
            FROM system_column_details
            WHERE table_uid = $1
        `
		metaRows, err := backend.Db.Query(metadataQuery, table.TableUID)
		if err != nil {
			log.Printf("error fetching metadata for table %s: %v", table.TableName, err)
			continue
		}
		defer metaRows.Close()

		// Talletetaan column_name -> (column_uid, data_type)
		type ExistingMeta struct {
			ColumnUID int
			DataType  *string // voi olla nil, jos data_type on null
		}
		existingMetadata := make(map[string]ExistingMeta)

		for metaRows.Next() {
			var colName string
			var columnID int
			var dataType sql.NullString

			if err := metaRows.Scan(&colName, &columnID, &dataType); err != nil {
				log.Printf("error scanning metadata for table %s: %v", table.TableName, err)
				continue
			}
			existingMetadata[colName] = ExistingMeta{
				ColumnUID: columnID,
				DataType:  nilIfEmpty(dataType),
			}
		}

		// Päivitä tai lisää sarakkeet
		for colName, col := range existingColumns {
			if metaInfo, exists := existingMetadata[colName]; exists {
				// Sarake on jo olemassa, päivitetään column_name ja data_type.
				updateQuery := `
                    UPDATE system_column_details
                    SET column_name = $1,
                        data_type   = $2
                    WHERE column_uid = $3
                `
				_, err = backend.Db.Exec(
					updateQuery,
					colName,
					col.DataType,
					metaInfo.ColumnUID,
				)
				if err != nil {
					log.Printf("error updating system_column_details for table %s, column %s: %v",
						table.TableName, colName, err)
					continue
				}
			} else {
				// Uusi sarake, lisätään se ja asetetaan co_number = attNumber
				insertQuery := `
                    INSERT INTO system_column_details
                        (table_uid, column_name, data_type, co_number)
                    VALUES ($1, $2, $3, $4)
                `
				_, err = backend.Db.Exec(
					insertQuery,
					table.TableUID,
					colName,
					col.DataType,
					col.AttNumber,
				)
				if err != nil {
					log.Printf("error inserting into system_column_details for table %s, column %s: %v",
						table.TableName, colName, err)
					continue
				}
			}
		}

		// Poista sarakkeet, joita ei enää ole
		for colName := range existingMetadata {
			if _, exists := existingColumns[colName]; !exists {
				deleteQuery := `
                    DELETE FROM system_column_details
                    WHERE table_uid = $1 AND column_name = $2
                `
				_, err = backend.Db.Exec(deleteQuery, table.TableUID, colName)
				if err != nil {
					log.Printf("error deleting from system_column_details for table %s, column %s: %v",
						table.TableName, colName, err)
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

// UpdateColumns päivittää sarakkeiden nimen/tyypin annetussa taulussa.
// Tämä on entinen "UpdateColumns(...)", siirretty erilliseen pakettiin.
// Parametrina annetaan "sanitizeIdentifierFunc", jotta tämä paketti ei viittaa suoraan security-pakettiin.
func UpdateColumns(
	tx *sql.Tx,
	sanitizedTableName string,
	modifiedCols []gt_2_column_crud.ModifiedCol,
	sanitizeIdentifierFunc func(string) (string, error),
) error {
	fmt.Println("Muokataan sarakkeita (jos on):", modifiedCols)

	for _, mcol := range modifiedCols {
		fmt.Println("Käsitellään muokkaus:", mcol)

		sOrigName, err := sanitizeIdentifierFunc(mcol.OriginalName)
		if err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			return err
		}

		sNewName, err := sanitizeIdentifierFunc(mcol.NewName)
		if err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			return err
		}

		// Sarakkeen uudelleennimeäminen
		if sOrigName != sNewName {
			renameStmt := fmt.Sprintf("ALTER TABLE %s RENAME COLUMN %s TO %s",
				sanitizedTableName, sOrigName, sNewName)
			fmt.Println("Uudelleennimetään sarake:", renameStmt)

			_, err = tx.Exec(renameStmt)
			if err != nil {
				fmt.Printf("\033[31mvirhe sarakkeen uudelleennimeämisessä: %s\033[0m\n", err.Error())
				return err
			}
		}

		// Sarakkeen tyypin muuttaminen
		newType := strings.ToUpper(mcol.DataType)
		if newType == "VARCHAR" && mcol.Length != nil {
			newType = fmt.Sprintf("VARCHAR(%d)", *mcol.Length)
		}
		alterTypeStmt := fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s TYPE %s",
			sanitizedTableName, sNewName, newType)
		fmt.Println("Muokataan sarakkeen tyyppiä:", alterTypeStmt)

		_, err = tx.Exec(alterTypeStmt)
		if err != nil {
			fmt.Printf("\033[31mvirhe sarakkeen tyypin muuttamisessa: %s\033[0m\n", err.Error())
			return err
		}
	}
	return nil
}
