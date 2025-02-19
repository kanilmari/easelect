// columnOrder.go

package gt_2_column_crud

import (
	"database/sql"
	backend "easelect/backend/main_app"
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

func GetTableDefaultSortColumnHandler(w http.ResponseWriter, r *http.Request) {
	// Expected URL path: /api/table-default-sort-column/{table_name}
	tableName := strings.TrimPrefix(r.URL.Path, "/api/table-default-sort-column/")
	if tableName == "" {
		http.Error(w, "Table name is required", http.StatusBadRequest)
		return
	}

	// Fetch col_display_order from system_db_tables
	var colDisplayOrderStr sql.NullString
	query := `SELECT col_display_order FROM system_db_tables WHERE table_name = $1`
	err := backend.Db.QueryRow(query, tableName).Scan(&colDisplayOrderStr)
	if err != nil {
		log.Printf("Error fetching col_display_order for table %s: %v", tableName, err)
		http.Error(w, "Error fetching default sort column", http.StatusInternalServerError)
		return
	}

	var colDisplayOrder []int
	if colDisplayOrderStr.Valid && colDisplayOrderStr.String != "" {
		if err := json.Unmarshal([]byte(colDisplayOrderStr.String), &colDisplayOrder); err != nil {
			log.Printf("Error unmarshalling col_display_order for table %s: %v", tableName, err)
			http.Error(w, "Error processing default sort column", http.StatusInternalServerError)
			return
		}
	} else {
		http.Error(w, "No default sort column found", http.StatusNotFound)
		return
	}

	if len(colDisplayOrder) == 0 {
		http.Error(w, "No default sort column found", http.StatusNotFound)
		return
	}

	// Fetch the column name for the first column_uid in col_display_order
	firstColumnUid := colDisplayOrder[0]

	var columnName string
	query = `SELECT column_name FROM system_column_details WHERE id = $1`
	err = backend.Db.QueryRow(query, firstColumnUid).Scan(&columnName)
	if err != nil {
		log.Printf("Error fetching column_name for column_uid %d: %v", firstColumnUid, err)
		http.Error(w, "Error fetching default sort column", http.StatusInternalServerError)
		return
	}

	// Return the column name as JSON
	response := map[string]string{
		"default_sort_column": columnName,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding response: %v", err)
		http.Error(w, "Error encoding response", http.StatusInternalServerError)
		return
	}
}
