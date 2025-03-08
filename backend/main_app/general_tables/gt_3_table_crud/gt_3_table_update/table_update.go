// // table_update.go
package gt_3_table_update

import (
	"database/sql"
	"fmt"
)

// UpdateOidsAndTableNames päivittää system_db_tables-taulun OID-arvot ja taulunimet,
// ja kutsuu callbackeja joilla poistetaan/lisätään tauluja sekä päivitetään sarakkeet.
func UpdateOidsAndTableNames(
	db *sql.DB,
	deleteRemovedTablesFunc func() error,
	insertNewTablesFunc func() error,
	// updateColumnsForExistingTablesFunc func() error,
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

	return nil
}