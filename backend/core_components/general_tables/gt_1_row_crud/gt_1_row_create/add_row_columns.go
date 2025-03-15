// add_row_columns.go

package gt_1_row_create

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	backend "easelect/backend/core_components"
	"easelect/backend/core_components/general_tables/models"
)

// GetAddRowColumnsHandlerWrapper on HTTP-rajapintafunktio, joka hakee lisättävän rivin saraketiedot.
// Se ottaa vastaan "table"-parametrin, jonka avulla ohjataan varsinaiseen käsittelijään.
func GetAddRowColumnsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "Missing table parameter", http.StatusBadRequest)
		return
	}
	GetAddRowColumnsHandler(w, r, tableName)
}

// GetAddRowColumnsHandler hakee sarakkeiden tiedot tietylle taululle (tableName).
func GetAddRowColumnsHandler(w http.ResponseWriter, r *http.Request, tableName string) {
	schemaName := "public"

	columns, err := getAddRowColumnsWithTypes(tableName, schemaName)
	if err != nil {
		log.Printf("Virhe sarakkeiden haussa taululle %s: %v", tableName, err)
		http.Error(w, "Virhe sarakkeiden haussa", http.StatusInternalServerError)
		return
	}

	// Sarakkeet, jotka jätetään pois lomakkeelta
	excludeColumns := map[string]bool{
		"id":               true,
		"created":          true,
		"updated":          true,
		"openai_embedding": true,
		"creation_spec":    true,
	}

	var columnsForFrontend []models.AddRowColumnInfo

	for _, col := range columns {
		// 1) Onko sarake exclude-listalla?
		if excludeColumns[strings.ToLower(col.ColumnName)] {
			continue
		}

		// 2) Onko sarake identity tai onko sillä oletus?
		if strings.ToUpper(col.IsIdentity) == "YES" || col.ColumnDefault != "" {
			continue
		}

		// 3) Onko InsertNewTargetWithSource voimassa ja asettunut falseksi?
		if col.InsertNewTargetWithSource.Valid && !col.InsertNewTargetWithSource.Bool {
			continue
		}

		// 4) Onko InsertNewSourceWithTarget voimassa ja asettunut falseksi?
		if col.InsertNewSourceWithTarget.Valid && !col.InsertNewSourceWithTarget.Bool {
			continue
		}

		// Jos kaikki ok, lisätään sarake listalle
		columnsForFrontend = append(columnsForFrontend, col)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(columnsForFrontend); err != nil {
		log.Printf("Virhe vastauksen enkoodauksessa: %v", err)
		http.Error(w, "Virhe vastauksen enkoodauksessa", http.StatusInternalServerError)
	}
}

// getAddRowColumnsWithTypes hakee saraketiedot tietokannan information_schema.columns -näkymästä.
func getAddRowColumnsWithTypes(tableName, schemaName string) ([]models.AddRowColumnInfo, error) {
	query := `
    SELECT
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.is_identity,
        c.generation_expression,
        fk_info.foreign_table_schema,
        fk_info.foreign_table_name,
        fk_info.foreign_column_name,
        c.udt_name,
		fk_rel.insert_new_target_with_source,
		fk_rel.insert_new_source_with_target,
        fk_rel.source_insert_specs,
		fk_rel.target_insert_specs
    FROM information_schema.columns c
    JOIN system_db_tables sdt
        ON sdt.table_name = c.table_name
    LEFT JOIN (
        SELECT
            kcu.column_name,
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
        WHERE
            tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name = $1
    ) AS fk_info
        ON c.column_name = fk_info.column_name
    LEFT JOIN foreign_key_relations_1_m fk_rel
        ON c.table_name = fk_rel.source_table_name AND c.column_name = fk_rel.source_column_name
    WHERE
        c.table_schema = $2
        AND c.table_name = $1
    ORDER BY
        c.ordinal_position;
`

	rows, err := backend.Db.Query(query, tableName, schemaName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []models.AddRowColumnInfo

	for rows.Next() {
		var col models.AddRowColumnInfo
		var columnDefault sql.NullString
		var generationExpression sql.NullString
		var foreignTableSchema sql.NullString
		var foreignTableName sql.NullString
		var foreignColumnName sql.NullString
		var udtName string

		// Muutetaan nämä kahdeksi NullBooliksi
		var insertNewTargetWithSource sql.NullBool
		var insertNewSourceWithTarget sql.NullBool

		var sourceInsertSpecs sql.NullString
		var targetInsertSpecs sql.NullString

		if err := rows.Scan(
			&col.ColumnName,
			&col.DataType,
			&col.IsNullable,
			&columnDefault,
			&col.IsIdentity,
			&generationExpression,
			&foreignTableSchema,
			&foreignTableName,
			&foreignColumnName,
			&udtName,
			&insertNewTargetWithSource,
			&insertNewSourceWithTarget,
			&sourceInsertSpecs,
			&targetInsertSpecs,
		); err != nil {
			return nil, err
		}

		col.ColumnDefault = columnDefault.String
		col.GenerationExpression = generationExpression.String
		col.ForeignTableSchema = foreignTableSchema.String
		col.ForeignTableName = foreignTableName.String
		col.ForeignColumnName = foreignColumnName.String
		col.UdtName = udtName
		col.InsertNewTargetWithSource = insertNewTargetWithSource
		col.InsertNewSourceWithTarget = insertNewSourceWithTarget
		col.SourceInsertSpecs = sourceInsertSpecs.String
		col.TargetInsertSpecs = targetInsertSpecs.String

		// Jos data_type == "USER-DEFINED" ja udt_name == "geometry", tulkitaan data_type = "geometry"
		if strings.ToLower(col.DataType) == "user-defined" && strings.ToLower(col.UdtName) == "geometry" {
			col.DataType = "geometry"
		}

		columns = append(columns, col)
	}

	return columns, nil
}

// GetAddRowColumnsOrdered on esimerkki taulun sarakkeiden hakemisesta järjestyksessä.
func GetAddRowColumnsOrdered(tableName string) ([]models.ColumnInfo, error) {
	// Huom: käytetään esimerkin vuoksi suoraan "SELECT ... ORDER BY co_number"
	query := `
        SELECT
            scd.column_uid,
            scd.column_name,
            scd.co_number
        FROM system_column_details scd
        JOIN system_db_tables sdt ON sdt.table_uid = scd.table_uid
        WHERE sdt.table_name = $1
        ORDER BY scd.co_number
    `

	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return nil, fmt.Errorf("\033[31mvirhe: %v\033[0m", err)
	}
	defer rows.Close()

	var columns []models.ColumnInfo
	for rows.Next() {
		var col models.ColumnInfo
		err := rows.Scan(&col.ColumnUid, &col.ColumnName, &col.CoNumber)
		if err != nil {
			return nil, fmt.Errorf("\033[31mvirhe: %v\033[0m", err)
		}
		columns = append(columns, col)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("\033[31mvirhe: %v\033[0m", err)
	}

	return columns, nil
}
