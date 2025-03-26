// create_table.go
package gt_3_table_create

import (
	"database/sql"
	backend "easelect/backend/core_components"
	"fmt"
	"log"
	"strings"
)

type ForeignKeyDefinition struct {
	ReferencingColumn string `json:"referencingColumn"`
	ReferencedTable   string `json:"referencedTable"`
	ReferencedColumn  string `json:"referencedColumn"`
}

func CreateTableInDatabase(db *sql.DB, table_name string, columns map[string]string, foreign_keys []ForeignKeyDefinition) error {
	var query_builder strings.Builder
	query_builder.WriteString(fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (", table_name))

	columns_count := 0
	updated_found := false

	for col_name, col_type := range columns {
		col_type_upper := strings.ToUpper(col_type)

		// Tarkistetaan, onko sarake nimeltään 'updated'
		if strings.EqualFold(col_name, "updated") {
			updated_found = true
		}

		// Jos sarake on nimeltään "id" ja tyyppi on SERIAL, merkitään se PRIMARY KEY:ksi
		if strings.EqualFold(col_name, "id") && strings.HasPrefix(col_type_upper, "SERIAL") {
			query_builder.WriteString(fmt.Sprintf("%s %s PRIMARY KEY", col_name, col_type_upper))
		} else {
			query_builder.WriteString(fmt.Sprintf("%s %s", col_name, col_type_upper))
		}

		columns_count++
		if columns_count < len(columns) {
			query_builder.WriteString(", ")
		}
	}

	// Lisätään vierasavaimet
	for _, fk := range foreign_keys {
		constraint_name := fmt.Sprintf("fk_%s_%s", table_name, fk.ReferencingColumn)
		query_builder.WriteString(fmt.Sprintf(
			", CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s)",
			constraint_name,
			fk.ReferencingColumn,
			fk.ReferencedTable,
			fk.ReferencedColumn,
		))
	}

	query_builder.WriteString(");")
	create_table_query := query_builder.String()

	_, err := db.Exec(create_table_query)
	if err != nil {
		return fmt.Errorf("virhe taulun luomisessa: %w", err)
	}

	// Jos 'updated'-saraketta on mukana, luodaan trigger + funktio sen päivittämiseen
	if updated_found {
		trigger_func := fmt.Sprintf(`
            CREATE OR REPLACE FUNCTION set_%s_updated_timestamp()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `, table_name)

		_, err = db.Exec(trigger_func)
		if err != nil {
			return fmt.Errorf("virhe trigger-funktion luomisessa: %w", err)
		}

		trigger_stmt := fmt.Sprintf(`
            CREATE TRIGGER update_%s_timestamp
            BEFORE UPDATE ON %s
            FOR EACH ROW
            EXECUTE PROCEDURE set_%s_updated_timestamp();
        `, table_name, table_name, table_name)

		_, err = db.Exec(trigger_stmt)
		if err != nil {
			return fmt.Errorf("virhe triggerin luomisessa: %w", err)
		}
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
		// Lisää system_db_tables-tauluun ilman columns-saraketta
		insertQuery := `
            INSERT INTO system_db_tables (cached_oid, table_name)
            VALUES ($1, $2)
        `

		_, err = backend.Db.Exec(insertQuery, table.OID, table.TableName)
		if err != nil {
			log.Printf("Error inserting table %s into system_db_tables: %v", table.TableName, err)
			continue
		}
	}

	return nil
}
