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
            fk_info.foreign_column_name
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
		); err != nil {
			return nil, err
		}

		// Käsittele mahdolliset NULL-arvot
		col.ColumnDefault = columnDefault.String
		col.GenerationExpression = generationExpression.String
		col.ForeignTableSchema = foreignTableSchema.String
		col.ForeignTableName = foreignTableName.String
		col.ForeignColumnName = foreignColumnName.String

		columns = append(columns, col)
	}

	return columns, nil
}

// func GetAddRowColumnsOrdered(tableName string) ([]models.ColumnInfo, error) {
// 	// Step 1: Fetch col_display_order from system_db_tables
// 	var colDisplayOrderStr sql.NullString
// 	colDisplayOrderQuery := `SELECT col_display_order FROM system_db_tables WHERE table_name = $1`
// 	err := backend.Db.QueryRow(colDisplayOrderQuery, tableName).Scan(&colDisplayOrderStr)
// 	if err != nil {
// 		return nil, fmt.Errorf("error fetching col_display_order for table %s: %v", tableName, err)
// 	}

// 	var colDisplayOrder []int // Tämä sisältää column_uid-arvot
// 	if colDisplayOrderStr.Valid && colDisplayOrderStr.String != "" {
// 		if err := json.Unmarshal([]byte(colDisplayOrderStr.String), &colDisplayOrder); err != nil {
// 			return nil, fmt.Errorf("error unmarshalling col_display_order for table %s: %v", tableName, err)
// 		}
// 	}

// 	// Step 2: Get column details from system_column_details
// 	columnsMap, err := gt_2_column_read.GetColumnsMapForTable(tableName)
// 	if err != nil {
// 		return nil, fmt.Errorf("error fetching columns for table %s: %v", tableName, err)
// 	}

// 	// Step 3: Determine the order of columns
// 	var orderedColumns []models.ColumnInfo
// 	if len(colDisplayOrder) > 0 {
// 		// Use col_display_order, ensuring columns exist
// 		for _, colUid := range colDisplayOrder {
// 			if colInfo, exists := columnsMap[colUid]; exists {
// 				orderedColumns = append(orderedColumns, colInfo)
// 			}
// 		}
// 		// Add any new columns not in col_display_order
// 		for colUid, colInfo := range columnsMap {
// 			if !containsColumnUid(orderedColumns, colUid) {
// 				orderedColumns = append(orderedColumns, colInfo)
// 			}
// 		}
// 	} else {
// 		// Use default order (attnum)
// 		columns := make([]models.ColumnInfo, 0, len(columnsMap))
// 		for _, colInfo := range columnsMap {
// 			columns = append(columns, colInfo)
// 		}
// 		sort.Slice(columns, func(i, j int) bool {
// 			return columns[i].Attnum < columns[j].Attnum
// 		})
// 		orderedColumns = columns
// 	}

// 	return orderedColumns, nil
// }

func GetAddRowColumnsOrdered(tableName string) ([]models.ColumnInfo, error) {
    // Huom: käytetään esimerkin vuoksi suoraan "SELECT ... ORDER BY attnum"
    query := `
        SELECT
            scd.column_uid,
            scd.column_name,
            scd.attnum
        FROM system_column_details scd
        JOIN system_db_tables sdt ON sdt.table_uid = scd.table_uid
        WHERE sdt.table_name = $1
        ORDER BY scd.attnum
    `

    rows, err := backend.Db.Query(query, tableName)
    if err != nil {
        return nil, fmt.Errorf("error querying columns by attnum: %v", err)
    }
    defer rows.Close()

    var columns []models.ColumnInfo
    for rows.Next() {
        var col models.ColumnInfo
        err := rows.Scan(&col.ColumnUid, &col.ColumnName, &col.Attnum)
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


// Helper function to check if a column_uid exists in the slice
// func containsColumnUid(columns []models.ColumnInfo, columnUid int) bool {
// 	for _, col := range columns {
// 		if col.ColumnUid == columnUid {
// 			return true
// 		}
// 	}
// 	return false
// }
