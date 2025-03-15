// one_to_many_relations.go
package gt_1_row_create

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	backend "easelect/backend/core_components"
)

// OneToManyRelation edustaa riviä foreign_key_relations_1_m -taulussa
type OneToManyRelation struct {
	SourceTableName           string       `json:"source_table_name"`
	SourceColumnName          string       `json:"source_column_name"`
	TargetTableName           string       `json:"target_table_name"`
	TargetColumnName          string       `json:"target_column_name"`
	InsertNewTargetWithSource sql.NullBool `json:"insert_new_target_with_source"`
	InsertNewSourceWithTarget sql.NullBool `json:"insert_new_source_with_target"`
	SourceInsertSpecs         string       `json:"source_insert_specs"`
	TargetInsertSpecs         string       `json:"target_insert_specs"`
	ReferenceDirection        string       `json:"reference_direction"`
}

// GetOneToManyRelationsHandlerWrapper hakee foreign_key_relations_1_m -taulusta
// kaikki 1->m-suhteet, joissa target_table_name = annettu taulu.
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
		insert_new_target_with_source,
		insert_new_source_with_target,
		source_insert_specs,
		target_insert_specs,
		reference_direction
		FROM foreign_key_relations_1_m
		WHERE target_table_name = $1
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
			&rel.InsertNewTargetWithSource,
			&rel.InsertNewSourceWithTarget,
			&rel.SourceInsertSpecs,
			&rel.TargetInsertSpecs,
			&rel.ReferenceDirection,
		); err != nil {
			return err
		}
		results = append(results, rel)
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(results)
}
