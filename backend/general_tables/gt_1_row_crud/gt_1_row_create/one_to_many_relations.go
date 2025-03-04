// one_to_many_relations.go
package gt_1_row_create

import (
	"encoding/json"
	"fmt"
	"net/http"

	backend "easelect/backend/main_app"
)

// OneToManyRelation edustaa riviä foreign_key_relations_1_m -taulussa
type OneToManyRelation struct {
	SourceTableName    string `json:"source_table_name"`
	SourceColumnName   string `json:"source_column_name"`
	TargetTableName    string `json:"target_table_name"`
	TargetColumnName   string `json:"target_column_name"`
	ReferenceDirection string `json:"reference_direction"`
	AllowFormInsertion bool   `json:"allow_form_insertion"`
}

// GetOneToManyRelationsHandlerWrapper hakee foreign_key_relations_1_m -taulusta
// kaikki 1->m-suhteet, joissa (target_table_name = annettu taulu) AND (allow_form_insertion = true).
func GetOneToManyRelationsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "missing 'table' query parameter", http.StatusBadRequest)
		return
	}

	if err := GetOneToManyRelationsHandler(w, tableName); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "virhe 1->m -suhteiden haussa", http.StatusInternalServerError)
	}
}

func GetOneToManyRelationsHandler(w http.ResponseWriter, mainTableName string) error {
	query := `
		SELECT
			source_table_name,
			source_column_name,
			target_table_name,
			target_column_name,
			reference_direction,
			allow_form_insertion
		FROM foreign_key_relations_1_m
		WHERE target_table_name = $1
		  AND allow_form_insertion = true
	`

	rows, err := backend.Db.Query(query, mainTableName)
	if err != nil {
		return err
	}
	defer rows.Close()

	var results []OneToManyRelation
	for rows.Next() {
		var rel OneToManyRelation
		if err := rows.Scan(
			&rel.SourceTableName,
			&rel.SourceColumnName,
			&rel.TargetTableName,
			&rel.TargetColumnName,
			&rel.ReferenceDirection,
			&rel.AllowFormInsertion,
		); err != nil {
			return err
		}
		results = append(results, rel)
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(results)
}
