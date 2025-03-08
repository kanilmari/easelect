// add_row_columns.go
package gt_1_row_create

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"easelect/backend/general_tables/models"
	backend "easelect/backend/main_app"

	"strings"
)

func GetAddRowColumnsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "Missing table parameter", http.StatusBadRequest)
		return
	}
	GetAddRowColumnsHandler(w, r, tableName)
}

func GetAddRowColumnsHandler(w http.ResponseWriter, r *http.Request, tableName string) {
	schemaName := "public" // Voidaan tarvittaessa hakea skeeman nimi

	columns, err := getAddRowColumnsWithTypes(tableName, schemaName)
	if err != nil {
		log.Printf("Virhe sarakkeiden haussa taululle %s: %v", tableName, err)
		http.Error(w, "Virhe sarakkeiden haussa", http.StatusInternalServerError)
		return
	}

	// Poissuljettavat sarakkeet
	excludeColumns := map[string]bool{
		"id":      true,
		"created": true,
		"updated": true,
		// Lisää muita tarvittaessa
	}

	// Valmistele data frontendille
	var columnsForFrontend []models.AddRowColumnInfo
	for _, col := range columns {
		if excludeColumns[strings.ToLower(col.ColumnName)] || strings.ToUpper(col.IsIdentity) == "YES" || col.ColumnDefault != "" {
			continue
		}
		columnsForFrontend = append(columnsForFrontend, col)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(columnsForFrontend); err != nil {
		log.Printf("Virhe vastauksen enkoodauksessa: %v", err)
		http.Error(w, "Virhe vastauksen enkoodauksessa", http.StatusInternalServerError)
	}
}

func getAddRowColumnsWithTypes(tableName string, schemaName string) ([]models.AddRowColumnInfo, error) {
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
            c.udt_name
        FROM
            information_schema.columns c
        LEFT JOIN (
            SELECT
                kcu.column_name,
                ccu.table_schema AS foreign_table_schema,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM
                information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE
                tc.constraint_type = 'FOREIGN KEY' AND
                tc.table_name = $1 AND
                tc.table_schema = $2
        ) AS fk_info
            ON c.column_name = fk_info.column_name
        WHERE
            c.table_name = $1 AND
            c.table_schema = $2
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
			&udtName, // <-- luetaan
		); err != nil {
			return nil, err
		}

		col.ColumnDefault = columnDefault.String
		col.GenerationExpression = generationExpression.String
		col.ForeignTableSchema = foreignTableSchema.String
		col.ForeignTableName = foreignTableName.String
		col.ForeignColumnName = foreignColumnName.String
		col.UdtName = udtName

		// "Korjaus": jos data_type == "USER-DEFINED" ja udt_name == "geometry",
		// niin muutetaan col.DataType = "geometry",
		// jotta frontin ei tarvitse arpoa
		if strings.ToLower(col.DataType) == "user-defined" && strings.ToLower(col.UdtName) == "geometry" {
			col.DataType = "geometry"
		}

		columns = append(columns, col)
	}

	return columns, nil
}

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
		return nil, fmt.Errorf("error querying columns by co_number: %v", err)
	}
	defer rows.Close()

	var columns []models.ColumnInfo
	for rows.Next() {
		var col models.ColumnInfo
		err := rows.Scan(&col.ColumnUid, &col.ColumnName, &col.CoNumber)
		if err != nil {
			return nil, fmt.Errorf("error scanning column info: %v", err)
		}
		columns = append(columns, col)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %v", err)
	}

	return columns, nil
}
