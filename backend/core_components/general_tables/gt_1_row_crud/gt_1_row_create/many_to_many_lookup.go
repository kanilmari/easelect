// many_to_many_lookup.go
package gt_1_row_create

import (
	"encoding/json"
	"fmt"
	"net/http"

	backend "easelect/backend/core_components"
)

// ManyToManyInfo edustaa many-to-many -suhdetta dedikoidusta taulusta
type ManyToManyInfo struct {
	LinkTableName      string `json:"bridging_table_name"`
	MainTableFkColumn  string `json:"main_table_fk_column"`
	ThirdTableName     string `json:"third_table_name"`
	ThirdTableFkColumn string `json:"third_table_fk_column"`
}

// GetManyToManyTablesHandlerWrapper hakee many-to-many -suhteet
// dedikoidusta taulusta, joissa päätauluna on annettu main_table_name.
func GetManyToManyTablesHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "missing 'table' query parameter", http.StatusBadRequest)
		return
	}
	if err := GetManyToManyTablesHandler(w, tableName); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe many-to-many -liitostaulujen haussa", http.StatusInternalServerError)
	}
}

// GetManyToManyTablesHandler suorittaa kyselyn foreign_key_relations_m_m -tauluun
// ja palauttaa ne rivit, joissa main_table_name vastaa annettua arvoa.
func GetManyToManyTablesHandler(w http.ResponseWriter, mainTable string) error {
	query := `
	SELECT
		bridging_table_name,
		CASE 
			WHEN table_a_name = $1 THEN bridging_col_a 
			ELSE bridging_col_b 
		END AS main_table_fk_column,
		CASE 
			WHEN table_a_name = $1 THEN table_b_name 
			ELSE table_a_name 
		END AS third_table_name,
		CASE 
			WHEN table_a_name = $1 THEN table_b_column 
			ELSE table_a_column 
		END AS third_table_fk_column
	FROM foreign_key_relations_m_m
	WHERE (table_a_name = $1 OR table_b_name = $1);
	`

	rows, err := backend.Db.Query(query, mainTable)
	if err != nil {
		return err
	}
	defer rows.Close()

	var results []ManyToManyInfo
	for rows.Next() {
		var info ManyToManyInfo
		if err := rows.Scan(&info.LinkTableName, &info.MainTableFkColumn, &info.ThirdTableName, &info.ThirdTableFkColumn); err != nil {
			return err
		}
		results = append(results, info)
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(results)
}
