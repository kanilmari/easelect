package foreign_keys

import (
	"database/sql"
	"fmt"
	"log"
)

// SyncOneToManyFKConstraints lukee kaikki tietokannan ulkoavaimet (FOREIGN KEY)
// ja synkronoi ne foreign_key_relations_1_m -tauluun.
// Nyt rajataan mukaan vain ne ulkoavaimet, joissa *lähdetaululla*
// on yksisarakkeinen PK. "1" viittaa siis lähdetauluun.
func SyncOneToManyFKConstraints(db *sql.DB) error {
	log.Println("[INFO] Synchronizing 1-to-many foreign keys...")

	// 1. Haetaan kaikki ulkoavaimet tietokannasta.
	const qryAllFKs = `
		SELECT
			t.relname AS source_table,
			a.attname AS source_column,
			ft.relname AS target_table,
			fa.attname AS target_column
		FROM pg_constraint c
		JOIN pg_class t       ON c.conrelid = t.oid
		JOIN pg_namespace ns  ON ns.oid = t.relnamespace
		JOIN pg_class ft      ON c.confrelid = ft.oid
		JOIN pg_attribute a   ON a.attrelid = t.oid  AND a.attnum  = ANY(c.conkey)
		JOIN pg_attribute fa  ON fa.attrelid = ft.oid AND fa.attnum = ANY(c.confkey)
		WHERE c.contype = 'f'
		-- HUOM! Emme rajoita target-puolta tässä
	`

	type dbConstraint struct {
		SourceTable  string
		SourceColumn string
		TargetTable  string
		TargetColumn string
	}

	rows, err := db.Query(qryAllFKs)
	if err != nil {
		return fmt.Errorf("cannot query existing fk constraints from DB: %w", err)
	}
	defer rows.Close()

	foundConstraints := make(map[string]dbConstraint)

	for rows.Next() {
		var c dbConstraint
		if err := rows.Scan(
			&c.SourceTable,
			&c.SourceColumn,
			&c.TargetTable,
			&c.TargetColumn,
		); err != nil {
			return fmt.Errorf("cannot scan fk constraints from DB: %w", err)
		}

		key := fmt.Sprintf("%s.%s->%s.%s",
			c.SourceTable, c.SourceColumn, c.TargetTable, c.TargetColumn)

		// Tarkistetaan, että LÄHDETAULULLA on tasan yksi-sarakkeinen PK
		singlePK, checkErr := hasSingleColumnPK(db, c.SourceTable)
		if checkErr != nil {
			return fmt.Errorf("error checking PK for table %s: %w",
				c.SourceTable, checkErr)
		}
		if !singlePK {
			log.Printf("[INFO] Skipping constraint %s: source table %s does NOT have a single-col PK.",
				key, c.SourceTable)
			continue
		}

		foundConstraints[key] = c
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("fk constraints row iteration error: %w", err)
	}

	// 2. Haetaan rivit foreign_key_relations_1_m -taulusta
	const qryAllCustom = `
		SELECT
			id,
			source_table_name,
			source_column_name,
			target_table_name,
			target_column_name,
			allow_form_insertion
		FROM foreign_key_relations_1_m
	`

	type existingRelation struct {
		ID                 int64
		SourceTable        string
		SourceColumn       string
		TargetTable        string
		TargetColumn       string
		AllowFormInsertion bool
	}

	rows2, err := db.Query(qryAllCustom)
	if err != nil {
		return fmt.Errorf("cannot query foreign_key_relations_1_m table: %w", err)
	}
	defer rows2.Close()

	existingRows := make(map[string]existingRelation)

	for rows2.Next() {
		var er existingRelation
		if err := rows2.Scan(
			&er.ID,
			&er.SourceTable,
			&er.SourceColumn,
			&er.TargetTable,
			&er.TargetColumn,
			&er.AllowFormInsertion,
		); err != nil {
			return fmt.Errorf("cannot scan row from foreign_key_relations_1_m: %w", err)
		}

		key := fmt.Sprintf("%s.%s->%s.%s",
			er.SourceTable, er.SourceColumn, er.TargetTable, er.TargetColumn)
		existingRows[key] = er
	}
	if err := rows2.Err(); err != nil {
		return fmt.Errorf("foreign_key_relations_1_m rows iteration error: %w", err)
	}

	// 3. Määritetään uudet vs. poistettavat constraintit
	var toInsert []dbConstraint
	var toDelete []int64

	for key, c := range foundConstraints {
		if _, ok := existingRows[key]; !ok {
			toInsert = append(toInsert, c)
		}
	}
	for key, er := range existingRows {
		if _, ok := foundConstraints[key]; !ok {
			toDelete = append(toDelete, er.ID)
		}
	}

	// 4. Lisäykset
	for _, c := range toInsert {
		_, err := db.Exec(`
            INSERT INTO foreign_key_relations_1_m
            (source_table_name, source_column_name, target_table_name, target_column_name, reference_direction, allow_form_insertion)
            VALUES ($1, $2, $3, $4, $5, $6)
        `,
			c.SourceTable,
			c.SourceColumn,
			c.TargetTable,
			c.TargetColumn,
			fmt.Sprintf("%s->%s", c.SourceTable, c.TargetTable),
			false, // oletusarvo
		)
		if err != nil {
			return fmt.Errorf(
				"cannot insert new FK row (%s.%s->%s.%s): %w",
				c.SourceTable, c.SourceColumn,
				c.TargetTable, c.TargetColumn,
				err,
			)
		}
		log.Printf("[INFO] Inserted new 1->m constraint: %s.%s -> %s.%s",
			c.SourceTable, c.SourceColumn,
			c.TargetTable, c.TargetColumn)
	}

	// 5. Poistot
	for _, rowID := range toDelete {
		_, err := db.Exec(`DELETE FROM foreign_key_relations_1_m WHERE id = $1`, rowID)
		if err != nil {
			return fmt.Errorf("cannot delete obsolete FK row (id=%d): %w", rowID, err)
		}
		log.Printf("[INFO] Deleted obsolete 1->m constraint with id=%d", rowID)
	}

	log.Printf("[INFO] FK sync complete. Inserted %d, Deleted %d, unchanged %d",
		len(toInsert),
		len(toDelete),
		len(existingRows)-len(toDelete),
	)
	return nil
}

// hasSingleColumnPK palauttaa true, jos annetuilla parametreilla
// (tableName) on tasan yksi PRIMARY KEY -sarake. Ei vertaa PK-sarakkeen nimeä
// mihinkään tiettyyn ulkoavainsarakkeeseen – pelkästään lukumäärä ratkaisee.
func hasSingleColumnPK(db *sql.DB, tableName string) (bool, error) {
	q := `
		SELECT a.attname
		FROM pg_index i
		JOIN pg_class c ON i.indrelid = c.oid
		JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
		WHERE c.relname = $1
		  AND i.indisprimary
	`
	rows, err := db.Query(q, tableName)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	var pkCols []string
	for rows.Next() {
		var pkCol string
		if err := rows.Scan(&pkCol); err != nil {
			return false, err
		}
		pkCols = append(pkCols, pkCol)
	}
	if err := rows.Err(); err != nil {
		return false, err
	}

	// Palautetaan true vain, jos PK-sarakkeita on täsmälleen yksi
	return len(pkCols) == 1, nil
}

// // sync_foreign_key_relations_1_m.go
// package foreign_keys

// import (
// 	"database/sql"
// 	"fmt"
// 	"log"
// )

// // SyncOneToManyFKConstraints reads all actual foreign key constraints in the DB
// // and syncs them with the foreign_key_relations_1_m table:
// //  1. Inserts new rows for any FK constraints that do not exist in the table
// //  2. Removes rows from the table that no longer exist as a real FK in the DB
// //  3. Preserves user-managed fields (like allow_form_insertion) on existing rows
// //
// // N.B.: This is a simplified example. In a real-world case, you might want
// // to do extra checks, e.g. ensure the referenced column is a PRIMARY KEY or UNIQUE
// // so that it truly is "1-to-many". You might also want to wrap this in a
// // transaction for atomic commits/rollbacks.
// func SyncOneToManyFKConstraints(db *sql.DB) error {
// 	log.Println("[INFO] Synchronizing 1-to-many foreign keys...")

// 	// 1. Query all actual FOREIGN KEY constraints in the DB (and optionally filter only 1->m).
// 	//    We'll treat *any* foreign key referencing a PK or UNIQUE column as 1->m for demonstration.
// 	//    This query picks table + column pairs (source) referencing table + column pairs (target).
// 	//    We skip detail about whether it's 1->1 vs. 1->m (that might require additional checks).
// 	const qryAllFKs = `
//         SELECT
//             t.relname AS source_table,
//             a.attname AS source_column,
//             ft.relname AS target_table,
//             fa.attname AS target_column
//         FROM pg_constraint c
//         JOIN pg_class t ON c.conrelid = t.oid
//         JOIN pg_namespace ns ON ns.oid = t.relnamespace
//         JOIN pg_class ft ON c.confrelid = ft.oid
//         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
//         JOIN pg_attribute fa ON fa.attrelid = ft.oid AND fa.attnum = ANY(c.confkey)
//         WHERE c.contype = 'f';
//     `

// 	type dbConstraint struct {
// 		SourceTable  string
// 		SourceColumn string
// 		TargetTable  string
// 		TargetColumn string
// 	}
// 	rows, err := db.Query(qryAllFKs)
// 	if err != nil {
// 		return fmt.Errorf("cannot query existing fk constraints from DB: %w", err)
// 	}
// 	defer rows.Close()

// 	foundConstraints := make(map[string]dbConstraint)

// 	for rows.Next() {
// 		var c dbConstraint
// 		err := rows.Scan(&c.SourceTable, &c.SourceColumn, &c.TargetTable, &c.TargetColumn)
// 		if err != nil {
// 			return fmt.Errorf("cannot scan fk constraints from DB: %w", err)
// 		}
// 		// Build a unique key from the 4-tuple
// 		key := fmt.Sprintf("%s.%s->%s.%s", c.SourceTable, c.SourceColumn, c.TargetTable, c.TargetColumn)
// 		foundConstraints[key] = c
// 	}
// 	if err := rows.Err(); err != nil {
// 		return fmt.Errorf("fk constraints row iteration error: %w", err)
// 	}

// 	// 2. Query all rows from foreign_key_relations_1_m so we can:
// 	//    - Keep track of which ones are in the DB
// 	//    - Insert new ones that are missing
// 	//    - Delete old ones that do not exist as actual FKs
// 	const qryAllCustom = `
// 		SELECT
// 			id,
// 			source_table_name,
// 			source_column_name,
// 			target_table_name,
// 			target_column_name,
// 			allow_form_insertion
// 		FROM foreign_key_relations_1_m
// 	`
// 	type existingRelation struct {
// 		ID                 int64
// 		SourceTable        string
// 		SourceColumn       string
// 		TargetTable        string
// 		TargetColumn       string
// 		AllowFormInsertion bool
// 	}
// 	rows2, err := db.Query(qryAllCustom)
// 	if err != nil {
// 		return fmt.Errorf("cannot query foreign_key_relations_1_m table: %w", err)
// 	}
// 	defer rows2.Close()

// 	existingRows := make(map[string]existingRelation)

// 	for rows2.Next() {
// 		var er existingRelation
// 		err := rows2.Scan(
// 			&er.ID,
// 			&er.SourceTable,
// 			&er.SourceColumn,
// 			&er.TargetTable,
// 			&er.TargetColumn,
// 			&er.AllowFormInsertion,
// 		)
// 		if err != nil {
// 			return fmt.Errorf("cannot scan row from foreign_key_relations_1_m: %w", err)
// 		}

// 		key := fmt.Sprintf("%s.%s->%s.%s", er.SourceTable, er.SourceColumn, er.TargetTable, er.TargetColumn)
// 		existingRows[key] = er
// 	}
// 	if err := rows2.Err(); err != nil {
// 		return fmt.Errorf("foreign_key_relations_1_m rows iteration error: %w", err)
// 	}

// 	// 3. Determine which constraints are new (in DB but not in foreign_key_relations_1_m)
// 	//    and which are obsolete (in table but not in DB).
// 	var toInsert []dbConstraint
// 	var toDelete []int64

// 	// 3a. For every actual FK from DB, check if we have it in foreign_key_relations_1_m
// 	for key, c := range foundConstraints {
// 		if _, ok := existingRows[key]; !ok {
// 			toInsert = append(toInsert, c)
// 		}
// 	}

// 	// 3b. For every row in foreign_key_relations_1_m, check if that FK still exists in DB
// 	for key, er := range existingRows {
// 		if _, ok := foundConstraints[key]; !ok {
// 			toDelete = append(toDelete, er.ID)
// 		}
// 	}

// 	// 4. Perform the inserts & deletes.
// 	//    You may want to do this in a transaction. For simplicity, we do it directly.
// 	for _, c := range toInsert {
// 		// For new constraints, we might default allow_form_insertion to false (or true).
// 		_, err := db.Exec(`
//             INSERT INTO foreign_key_relations_1_m
//             (source_table_name, source_column_name, target_table_name, target_column_name, reference_direction, allow_form_insertion)
//             VALUES ($1, $2, $3, $4, $5, $6)
//         `,
// 			c.SourceTable, c.SourceColumn,
// 			c.TargetTable, c.TargetColumn,
// 			// For reference_direction, do whatever suits your logic. We’ll store "source->target" or the like.
// 			fmt.Sprintf("%s->%s", c.SourceTable, c.TargetTable),
// 			false, // new constraints default to false (or true if you prefer).
// 		)
// 		if err != nil {
// 			return fmt.Errorf("cannot insert new FK row (%s.%s->%s.%s): %w",
// 				c.SourceTable, c.SourceColumn, c.TargetTable, c.TargetColumn, err)
// 		}
// 		log.Printf("[INFO] Inserted new 1->m constraint in foreign_key_relations_1_m: %s.%s -> %s.%s",
// 			c.SourceTable, c.SourceColumn, c.TargetTable, c.TargetColumn)
// 	}

// 	for _, rowID := range toDelete {
// 		_, err := db.Exec(`
//             DELETE FROM foreign_key_relations_1_m
//             WHERE id = $1
//         `, rowID)
// 		if err != nil {
// 			return fmt.Errorf("cannot delete obsolete FK row (id=%d): %w", rowID, err)
// 		}
// 		log.Printf("[INFO] Deleted obsolete 1->m constraint from foreign_key_relations_1_m: row id=%d", rowID)
// 	}

// 	log.Printf("[INFO] FK sync complete. Inserted %d, Deleted %d, unchanged %d",
// 		len(toInsert), len(toDelete), (len(existingRows) - len(toDelete)))

// 	return nil
// }
