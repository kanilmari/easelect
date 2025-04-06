// table_update.go
package gt_3_table_update

import (
	"database/sql"
	"fmt"
)

// UpdateOidsAndTableNames päivittää system_db_tables-taulun OID-arvot, taulunimet ja skeemanimet,
// ja kutsuu callbackeja joilla poistetaan/lisätään tauluja.
func UpdateOidsAndTableNames(
	db *sql.DB,
	deleteRemovedTablesFunc func() error,
	insertNewTablesFunc func() error,
) error {

	// Vaihe 1: Päivitetään taulun ja skeeman nimi, jos se on muuttunut
	updateNameQuery := `
		WITH table_oids AS (
			SELECT
				c.oid,
				c.relname AS table_name,
				n.nspname AS schema_name
			FROM pg_class c
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE
				n.nspname NOT LIKE 'pg_%'
				AND n.nspname <> 'information_schema'
				AND c.relkind = 'r'
		)
		UPDATE system_db_tables
		SET
			table_name  = table_oids.table_name,
			schema_name = table_oids.schema_name
		FROM table_oids
		WHERE
			system_db_tables.cached_oid = table_oids.oid
			AND (
				system_db_tables.table_name  != table_oids.table_name
				OR system_db_tables.schema_name != table_oids.schema_name
			);
	`
	_, err := db.Exec(updateNameQuery)
	if err != nil {
		return fmt.Errorf("\033[31mvirhe taulun nimien päivittämisessä: %v\033[0m", err)
	}

	// Vaihe 2: Päivitetään cached_oid taulun ja skeeman perusteella, jos OID on muuttunut
	updateOidQuery := `
		WITH table_oids AS (
			SELECT
				c.oid,
				c.relname AS table_name,
				n.nspname AS schema_name
			FROM pg_class c
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE
				n.nspname NOT LIKE 'pg_%'
				AND n.nspname <> 'information_schema'
				AND c.relkind = 'r'
		)
		UPDATE system_db_tables
		SET cached_oid = table_oids.oid
		FROM table_oids
		WHERE
			system_db_tables.table_name  = table_oids.table_name
			AND system_db_tables.schema_name = table_oids.schema_name
			AND system_db_tables.cached_oid  != table_oids.oid;
	`
	_, err = db.Exec(updateOidQuery)
	if err != nil {
		return fmt.Errorf("\033[31mvirhe OID-arvojen päivittämisessä: %v\033[0m", err)
	}

	// Vaihe 3: Poistetaan taulut, joita ei enää ole
	err = deleteRemovedTablesFunc()
	if err != nil {
		return err
	}

	// Vaihe 4: Lisätään uudet taulut
	err = insertNewTablesFunc()
	if err != nil {
		return err
	}

	return nil
}
