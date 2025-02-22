// add_row_handler.go
package gt_1_row_create

import (
	"database/sql"
	gt_triggers "easelect/backend/general_tables/triggers"
	backend "easelect/backend/main_app"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/lib/pq"
)

func AddRowHandler(w http.ResponseWriter, r *http.Request, tableName string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST requests are allowed", http.StatusMethodNotAllowed)
		return
	}

	var newRow map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&newRow); err != nil {
		log.Printf("Error reading data: %v", err)
		http.Error(w, "Error reading data", http.StatusBadRequest)
		return
	}

	log.Printf("Received data for insertion: %+v", newRow)

	schemaName := "public"

	// Fetch columns and data types
	columnsInfo, err := getAddRowColumnsWithTypes(tableName, schemaName)
	if err != nil {
		log.Printf("Error fetching columns from table %s: %v", tableName, err)
		http.Error(w, "Error fetching columns", http.StatusInternalServerError)
		return
	}

	// Rakennetaan kartta, josta löytyy sarakkeen nimi -> data_type
	columnTypeMap := make(map[string]string)
	for _, col := range columnsInfo {
		columnTypeMap[col.ColumnName] = col.DataType
	}

	// Exclude specific columns
	excludeColumns := []string{"id", "created", "updated", "openai_embedding", "creation_spec"}

	// Create a list of allowed columns
	allowedColumns := make(map[string]bool)
	for _, col := range columnsInfo {
		colName := col.ColumnName
		generationExpression := col.GenerationExpression
		isIdentity := strings.ToUpper(col.IsIdentity) == "YES"

		if contains(excludeColumns, strings.ToLower(colName)) {
			continue
		}

		if generationExpression != "" || isIdentity {
			continue
		}

		allowedColumns[colName] = true
	}

	log.Printf("Allowed columns for insertion: %v", allowedColumns)

	// Filter newRow to include only allowed columns
	filteredRow := make(map[string]interface{})
	for col, val := range newRow {
		if allowedColumns[col] {
			// Jos sarake on integer-tyyppinen ja arvo on tyhjä merkkijono,
			// vaihdetaan se nil:ksi tai yritetään parse int:ksi.
			colType := columnTypeMap[col]
			if isIntegerType(colType) {
				switch raw := val.(type) {
				case string:
					trimmed := strings.TrimSpace(raw)
					if trimmed == "" {
						// Tyhjä string -> NULL
						val = nil
					} else {
						// Yritetään parse integeriksi
						parsedVal, parseErr := strconv.Atoi(trimmed)
						if parseErr != nil {
							log.Printf("Invalid integer value %q for column %s: %v", raw, col, parseErr)
							http.Error(w, fmt.Sprintf("invalid integer value for column %s: %v", col, parseErr), http.StatusBadRequest)
							return
						}
						val = parsedVal
					}
				}
			}
			filteredRow[col] = val
		}
	}

	log.Printf("Filtered row for insertion: %+v", filteredRow)

	// Build the INSERT SQL statement
	insertColumns := []string{}
	placeholders := []string{}
	values := []interface{}{}
	i := 1
	for col, val := range filteredRow {
		insertColumns = append(insertColumns, pq.QuoteIdentifier(col))
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		values = append(values, val)
		i++
	}

	if len(insertColumns) == 0 {
		log.Printf("No valid columns to insert")
		http.Error(w, "No valid columns to insert", http.StatusBadRequest)
		return
	}

	insertQuery := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING *",
		pq.QuoteIdentifier(tableName), strings.Join(insertColumns, ", "), strings.Join(placeholders, ", "))

	log.Printf("Executing INSERT SQL: %s", insertQuery)
	log.Printf("Values for insertion: %+v", values)

	// Execute INSERT and fetch the inserted row
	row := backend.Db.QueryRow(insertQuery, values...)

	// Fetch column names and types
	columnNames, dataTypes, err := getColumnNamesAndTypes(tableName)
	if err != nil {
		log.Printf("Error fetching column names and types: %v", err)
		http.Error(w, "Error fetching column names and types", http.StatusInternalServerError)
		return
	}

	// Prepare to scan the row into appropriate types
	valuesSlice := make([]interface{}, len(columnNames))
	for i, dataType := range dataTypes {
		switch dataType {
		case "integer", "bigint", "smallint":
			valuesSlice[i] = new(sql.NullInt64)
		case "text", "character varying":
			valuesSlice[i] = new(sql.NullString)
		case "timestamp with time zone", "timestamp without time zone":
			valuesSlice[i] = new(sql.NullTime)
		default:
			valuesSlice[i] = new(interface{})
		}
	}

	// Scan the row
	err = row.Scan(valuesSlice...)
	if err != nil {
		log.Printf("Error scanning inserted row: %v", err)
		http.Error(w, "Error scanning inserted row", http.StatusInternalServerError)
		return
	}

	// Build the insertedRow map
	insertedRow := make(map[string]interface{})
	for i, colName := range columnNames {
		switch v := valuesSlice[i].(type) {
		case *sql.NullInt64:
			if v.Valid {
				insertedRow[colName] = v.Int64
			} else {
				insertedRow[colName] = nil
			}
		case *sql.NullString:
			if v.Valid {
				insertedRow[colName] = v.String
			} else {
				insertedRow[colName] = nil
			}
		case *sql.NullTime:
			if v.Valid {
				insertedRow[colName] = v.Time
			} else {
				insertedRow[colName] = nil
			}
		default:
			insertedRow[colName] = v
		}
	}

	log.Printf("Inserted row into table %s: %+v", tableName, insertedRow)

	// Execute triggers if any
	err = gt_triggers.ExecuteTriggers(tableName, insertedRow)
	if err != nil {
		log.Printf("Error executing triggers: %v", err)
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Row inserted successfully",
	})
}

// isIntegerType palauttaa true, jos data_type on jonkin sortin integer
func isIntegerType(dataType string) bool {
	dataType = strings.ToLower(dataType)
	return strings.Contains(dataType, "int")
}

// Modify getColumnNamesAndTypes to fetch column names and data types
func getColumnNamesAndTypes(tableName string) ([]string, []string, error) {
	query := `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
    `
	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var columnNames []string
	var dataTypes []string
	for rows.Next() {
		var columnName string
		var dataType string
		if err := rows.Scan(&columnName, &dataType); err != nil {
			return nil, nil, err
		}
		columnNames = append(columnNames, columnName)
		dataTypes = append(dataTypes, dataType)
	}
	return columnNames, dataTypes, nil
}
