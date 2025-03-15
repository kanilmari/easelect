// update_row.go
package gt_1_row_update

import (
	backend "easelect/backend/core_components"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/lib/pq"
)

func UpdateRowHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "Missing ?table= parameter", http.StatusBadRequest)
		return
	}
	UpdateRowHandler(w, r, tableName)
}

// UpdateRowHandler handles updating a row in the database
func UpdateRowHandler(w http.ResponseWriter, r *http.Request, tableName string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST requests are allowed", http.StatusMethodNotAllowed)
		return
	}

	var updateRequest struct {
		ID     int64       `json:"id"`
		Column string      `json:"column"`
		Value  interface{} `json:"value"`
	}

	if err := json.NewDecoder(r.Body).Decode(&updateRequest); err != nil {
		log.Printf("Error decoding update request: %v", err)
		http.Error(w, "Invalid request data", http.StatusBadRequest)
		return
	}

	// Validate input
	if updateRequest.ID == 0 || updateRequest.Column == "" {
		http.Error(w, "ID and Column are required", http.StatusBadRequest)
		return
	}

	// Get table_uid from table_name
	tableUID, err := getTableUID(tableName)
	if err != nil {
		log.Printf("Error fetching table_uid for table %s: %v", tableName, err)
		http.Error(w, "Error fetching table information", http.StatusInternalServerError)
		return
	}

	// Check if the column is editable
	editable, err := isColumnEditable(tableUID, updateRequest.Column)
	if err != nil {
		log.Printf("Error checking if column is editable: %v", err)
		http.Error(w, "Error checking column permissions", http.StatusInternalServerError)
		return
	}
	if !editable {
		http.Error(w, "Column is not editable", http.StatusForbidden)
		return
	}

	// Fetch column data type
	dataType, err := getColumnDataType(tableName, updateRequest.Column) // Käytä tableName:a, jos haet information_schema.columns:sta
	if err != nil {
		log.Printf("Error fetching data type for column %s: %v", updateRequest.Column, err)
		http.Error(w, "Error fetching column data type", http.StatusInternalServerError)
		return
	}

	// Convert the value based on data type
	value, err := convertValue(updateRequest.Value, dataType)
	if err != nil {
		log.Printf("Error converting value: %v", err)
		http.Error(w, "Invalid value type", http.StatusBadRequest)
		return
	}

	// Build the UPDATE SQL statement
	query := fmt.Sprintf("UPDATE %s SET %s = $1 WHERE id = $2", pq.QuoteIdentifier(tableName), pq.QuoteIdentifier(updateRequest.Column))

	// Execute the query
	_, err = backend.Db.Exec(query, value, updateRequest.ID)
	if err != nil {
		log.Printf("Error updating row in table %s: %v", tableName, err)
		http.Error(w, "Error updating row", http.StatusInternalServerError)
		return
	}

	// Return success
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Row updated successfully",
	})
}

// Function to get table_uid from table_name
func getTableUID(tableName string) (int, error) {
	var tableUID int
	query := `
        SELECT table_uid
        FROM system_db_tables
        WHERE table_name = $1
    `
	err := backend.Db.QueryRow(query, tableName).Scan(&tableUID)
	if err != nil {
		return 0, err
	}
	return tableUID, nil
}

// Function to check if a column is editable
func isColumnEditable(tableUID int, columnName string) (bool, error) {
	var editable bool
	query := `
        SELECT editable_in_ui
        FROM system_column_details
        WHERE table_uid = $1 AND column_name = $2
    `
	err := backend.Db.QueryRow(query, tableUID, columnName).Scan(&editable)
	if err != nil {
		return false, err
	}
	return editable, nil
}

func getColumnDataType(tableName, columnName string) (string, error) {
	var dataType string
	query := `
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2 AND table_schema = 'public'
    `
	err := backend.Db.QueryRow(query, tableName, columnName).Scan(&dataType)
	if err != nil {
		return "", err
	}
	return dataType, nil
}

func convertValue(value interface{}, dataType string) (interface{}, error) {
	switch {
	case strings.Contains(dataType, "integer"), strings.Contains(dataType, "bigint"), strings.Contains(dataType, "smallint"):
		// Handle both float64 and string representations
		var intValue int64
		switch v := value.(type) {
		case float64:
			intValue = int64(v)
		case string:
			parsedInt, err := strconv.ParseInt(v, 10, 64)
			if err != nil {
				return nil, fmt.Errorf("invalid integer value")
			}
			intValue = parsedInt
		default:
			return nil, fmt.Errorf("invalid integer value")
		}
		return intValue, nil
	case strings.Contains(dataType, "boolean"):
		boolValue, ok := value.(bool)
		if !ok {
			return nil, fmt.Errorf("invalid boolean value")
		}
		return boolValue, nil
	case strings.Contains(dataType, "character varying"), strings.Contains(dataType, "text"):
		strValue, ok := value.(string)
		if !ok {
			return nil, fmt.Errorf("invalid string value")
		}
		return strValue, nil
	case strings.Contains(dataType, "timestamp"), strings.Contains(dataType, "date"):
		strValue, ok := value.(string)
		if !ok {
			return nil, fmt.Errorf("invalid date value")
		}
		parsedTime, err := time.Parse("2006-01-02", strValue)
		if err != nil {
			return nil, fmt.Errorf("invalid date format")
		}
		return parsedTime, nil
	case strings.Contains(dataType, "numeric"), strings.Contains(dataType, "decimal"):
		var floatValue float64
		switch v := value.(type) {
		case float64:
			floatValue = v
		case string:
			parsedFloat, err := strconv.ParseFloat(v, 64)
			if err != nil {
				return nil, fmt.Errorf("invalid numeric value")
			}
			floatValue = parsedFloat
		default:
			return nil, fmt.Errorf("invalid numeric value")
		}
		return floatValue, nil
	default:
		return value, nil
	}
}
