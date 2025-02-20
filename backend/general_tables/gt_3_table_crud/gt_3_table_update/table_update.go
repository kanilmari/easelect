// // table_update.go
package gt_3_table_update

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
)

// UpdateOidsAndTableNames päivittää system_db_tables-taulun OID-arvot ja taulunimet,
// ja kutsuu callbackeja joilla poistetaan/lisätään tauluja sekä päivitetään sarakkeet.
func UpdateOidsAndTableNames(
	db *sql.DB,
	deleteRemovedTablesFunc func() error,
	insertNewTablesFunc func() error,
	updateColumnsForExistingTablesFunc func() error,
) error {

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
	_, err := db.Exec(updateNameQuery)
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
	_, err = db.Exec(updateOidQuery)
	if err != nil {
		return fmt.Errorf("virhe OID-arvojen päivittämisessä: %v", err)
	}

	// Vaihe 3: Poista taulut, joita ei enää ole
	err = deleteRemovedTablesFunc()
	if err != nil {
		return err
	}

	// Vaihe 4: Lisää uudet taulut
	err = insertNewTablesFunc()
	if err != nil {
		return err
	}

	// Vaihe 5: Päivitä sarakkeet ja col_display_order
	err = updateColumnsForExistingTablesFunc()
	if err != nil {
		return fmt.Errorf("virhe sarakkeiden ja col_display_order päivityksessä: %v", err)
	}

	return nil
}

// UpdateColumnsForExistingTables käy system_db_tables-läpi ja päivittää saraketiedot
// (columns ja col_display_order). Tänne tuodaan callbackit, jotta tämä paketti
// ei riippuisi suoraan muista pienistä paketeista.
func UpdateColumnsForExistingTables(
	db *sql.DB,
	getColumnIDsForTableUIDFunc func(int) ([]int, error),
	updateColDisplayOrderFunc func(existingOrder, allColumns []int) []int,
) error {
	query := `SELECT table_uid, table_name, col_display_order FROM system_db_tables`
	rows, err := db.Query(query)
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

		// Hae päivitetyt saraketiedot callbackin kautta
		columns, err := getColumnIDsForTableUIDFunc(tableUID)
		if err != nil {
			log.Printf("\033[31mvirhe sarakkeiden hakemisessa taululle %s: %s\033[0m\n",
				tableName, err.Error())
			continue
		}

		// Muunna saraketiedot JSONiksi
		columnsJSON, err := json.Marshal(columns)
		if err != nil {
			log.Printf("\033[31mvirhe sarakkeiden marshallauksessa taululle %s: %s\033[0m\n",
				tableName, err.Error())
			continue
		}

		// Päivitä columns-sarake
		updateQuery := `
            UPDATE system_db_tables
            SET columns = $1
            WHERE table_uid = $2
        `
		_, err = db.Exec(updateQuery, string(columnsJSON), tableUID)
		if err != nil {
			log.Printf("\033[31mvirhe columns-päivityksessä taululle %s: %s\033[0m\n",
				tableName, err.Error())
			continue
		}

		// col_display_order
		var colDisplayOrder []int
		if colDisplayOrderStr.Valid && colDisplayOrderStr.String != "" {
			if err := json.Unmarshal([]byte(colDisplayOrderStr.String), &colDisplayOrder); err != nil {
				log.Printf("\033[31mvirhe col_display_order unmarshalissa taululle %s: %s\033[0m\n",
					tableName, err.Error())
				colDisplayOrder = nil
			}
		}

		// Päivitetään display order callbackin avulla
		colDisplayOrder = updateColDisplayOrderFunc(colDisplayOrder, columns)

		// Tallennus
		colDisplayOrderJSON, err := json.Marshal(colDisplayOrder)
		if err != nil {
			log.Printf("\033[31mvirhe col_display_order marshallauksessa taululle %s: %s\033[0m\n",
				tableName, err.Error())
			continue
		}

		updateColDisplayOrderQuery := `
            UPDATE system_db_tables
            SET col_display_order = $1
            WHERE table_uid = $2
        `
		_, err = db.Exec(updateColDisplayOrderQuery, string(colDisplayOrderJSON), tableUID)
		if err != nil {
			log.Printf("\033[31mvirhe col_display_order päivityksessä taululle %s: %s\033[0m\n",
				tableName, err.Error())
			continue
		}
	}
	return nil
}

// UpdateColDisplayOrder on yleishyödyllinen apufunktio, joka yhdistää vanhat
// ja mahdolliset uudet sarakkeet oikeaan järjestykseen.
func UpdateColDisplayOrder(existingOrder, allColumns []int) []int {
	newOrder := []int{}

	columnsSet := make(map[int]bool)
	for _, col := range allColumns {
		columnsSet[col] = true
	}

	// Pidä olemassa olevien sarakkeiden järjestys, jos ne vielä ovat
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

// Tämä funktio sisältää sen SQL- ja validointilogiikan, joka ennen oli suoraan
// UpdateColumnOrderHandlerissa. Nyt se on erillään HTTP:stä ja vain toteuttaa
// "päivitä col_display_order" -rutiinin system_db_tables-tauluun.
func UpdateColumnOrder(
	db *sql.DB,
	sanitizedTableName string,
	newOrder []int,
) error {
	// 1) Hae entiset sarakkeet (JSON) system_db_tables-taulusta
	var existingColumnsJSON string
	query := `SELECT columns FROM system_db_tables WHERE table_name = $1`
	err := db.QueryRow(query, sanitizedTableName).Scan(&existingColumnsJSON)
	if err != nil {
		log.Printf("\033[31mvirhe olemassa olevien sarakkeiden haussa taululle %s: %s\033[0m\n",
			sanitizedTableName, err.Error())
		return fmt.Errorf("virhe haettaessa olemassa olevia sarakkeita: %w", err)
	}

	// 2) JSON --> []int
	var existingColumns []int
	err = json.Unmarshal([]byte(existingColumnsJSON), &existingColumns)
	if err != nil {
		log.Printf("\033[31mvirhe sarakkeiden JSON-unmarshallingissa: %s\033[0m\n", err.Error())
		return fmt.Errorf("virhe käsiteltäessä olemassa olevia sarakkeita: %w", err)
	}

	// 3) Tarkista lukumäärä
	if len(newOrder) != len(existingColumns) {
		return fmt.Errorf("sarakkeiden lukumäärä ei täsmää olemassa olevien sarakkeiden kanssa")
	}

	// 4) Tarkista sarakkeet (duplicates, jne.)
	existingMap := make(map[int]bool)
	for _, col := range existingColumns {
		existingMap[col] = true
	}

	newOrderMap := make(map[int]bool)
	for _, col := range newOrder {
		if newOrderMap[col] {
			return fmt.Errorf("uudessa järjestyksessä on päällekkäisiä sarakkeita")
		}
		newOrderMap[col] = true

		if !existingMap[col] {
			return fmt.Errorf("päivitettävät sarakkeet eivät täsmää olemassa olevien sarakkeiden kanssa")
		}
	}

	// 5) Päivitetään col_display_order
	newOrderJSON, err := json.Marshal(newOrder)
	if err != nil {
		log.Printf("\033[31mvirhe marshalling new order: %s\033[0m\n", err.Error())
		return fmt.Errorf("virhe tallennettaessa järjestystä: %w", err)
	}

	updateQuery := `
        UPDATE system_db_tables
        SET col_display_order = $1
        WHERE table_name = $2
    `
	_, err = db.Exec(updateQuery, string(newOrderJSON), sanitizedTableName)
	if err != nil {
		log.Printf("\033[31mvirhe col_display_orderin päivityksessä taululle %s: %s\033[0m\n",
			sanitizedTableName, err.Error())
		return fmt.Errorf("virhe tallennettaessa järjestystä: %w", err)
	}

	return nil
}
