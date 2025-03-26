package gt_1_row_read

import (
	backend "easelect/backend/core_components"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/lib/pq"
)

// GetRowCountHandlerWrapper palauttaa annetun taulun rivimäärän JSON-muodossa.
// Reitti on /api/get-row-count?table=NIMI
func GetRowCountHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	table_name := r.URL.Query().Get("table")
	if table_name == "" {
		http.Error(w, "missing table parameter", http.StatusBadRequest)
		return
	}

	row_count_value, err := get_row_count(table_name)
	if err != nil {
		log.Printf("error getting row count for table %s: %v", table_name, err)
		http.Error(w, "error counting rows", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"row_count": row_count_value,
	})
}

// get_row_count lukee rivimäärän taulusta table_name.
func get_row_count(table_name string) (int, error) {
	// Käytä pq.QuoteIdentifier suojaamaan taulun nimeä
	safe_table_name := pq.QuoteIdentifier(table_name)
	query_str := fmt.Sprintf("SELECT COUNT(*) FROM %s", safe_table_name)

	var row_count_value int
	err := backend.Db.QueryRow(query_str).Scan(&row_count_value)
	if err != nil {
		return 0, fmt.Errorf("error counting rows: %w", err)
	}
	return row_count_value, nil
}
