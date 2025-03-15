// get_dynamic_child_items.go

package gt_1_row_read

import (
	backend "easelect/backend/core_components"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/lib/pq"
)

// GetDynamicChildItemsHandler etsii referencing_table/column -parit,
// joilla referenced_table = parent_table, ja hakee lapsirivit,
// joissa referencing_column = parent_pk_value.
func GetDynamicChildItemsHandler(response_writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(response_writer, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Luetaan body
	var body_data struct {
		Parent_table    string `json:"parent_table"`
		Parent_pk_value string `json:"parent_pk_value"`
	}
	if err := json.NewDecoder(request.Body).Decode(&body_data); err != nil {
		log.Printf("\033[31mvirhe: dynaaminen lapsihaku, dekoodaus epäonnistui: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe dekoodattaessa dataa", http.StatusBadRequest)
		return
	}

	if body_data.Parent_table == "" {
		http.Error(response_writer, "parent_table puuttuu", http.StatusBadRequest)
		return
	}
	if body_data.Parent_pk_value == "" {
		http.Error(response_writer, "parent_pk_value puuttuu", http.StatusBadRequest)
		return
	}

	log.Printf("Dynaaminen lapsihaku: table=%s, pk_value=%s", body_data.Parent_table, body_data.Parent_pk_value)

	// Kysely, jolla haetaan ne foreign key -rivit, joissa ccu.table_name = haluttu taulu
	query_fk := `
        SELECT
            tc.constraint_name,
            tc.table_name AS referencing_table,
            kcu.column_name AS referencing_column,
            ccu.table_name AS referenced_table,
            ccu.column_name AS referenced_column
        FROM
            information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.constraint_schema = kcu.constraint_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.constraint_schema = tc.constraint_schema
        WHERE
            tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_name = $1
    `

	rows_fk, err := backend.Db.Query(query_fk, body_data.Parent_table)
	if err != nil {
		log.Printf("\033[31mvirhe: foreign key -haku epäonnistui: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe foreign key -haussa", http.StatusInternalServerError)
		return
	}
	defer rows_fk.Close()

	type FKInfo struct {
		Constraint_name    string
		Referencing_table  string
		Referencing_column string
		Referenced_table   string
		Referenced_column  string
	}

	var fk_infos []FKInfo
	for rows_fk.Next() {
		var f FKInfo
		if err := rows_fk.Scan(&f.Constraint_name, &f.Referencing_table, &f.Referencing_column,
			&f.Referenced_table, &f.Referenced_column); err != nil {
			log.Printf("\033[31mvirhe: foreign key -scan: %s\033[0m\n", err.Error())
			http.Error(response_writer, "virhe foreign key -datassa", http.StatusInternalServerError)
			return
		}
		fk_infos = append(fk_infos, f)
	}

	// Muunnetaan parent_pk_value intiksi (jos pk on numeerinen)
	parent_id, err := strconv.Atoi(body_data.Parent_pk_value)
	if err != nil {
		log.Printf("\033[31mvirhe: parent_pk_value ei ole int: %s\033[0m\n", err.Error())
		http.Error(response_writer, "parent_pk_value ei ollut int", http.StatusBadRequest)
		return
	}

	// Rakenne palautusta varten:
	// child_tables_list = [
	//   { table_name: "children", column_name: "parent_id", rows: [...] },
	//   ...
	// ]
	type ChildTableResult struct {
		Table_name  string                   `json:"table"`
		Column_name string                   `json:"column"`
		Rows        []map[string]interface{} `json:"rows"`
	}

	var child_tables_list []ChildTableResult

	for _, fk_row := range fk_infos {
		query_child := fmt.Sprintf("SELECT * FROM %s WHERE %s = $1",
			pq.QuoteIdentifier(fk_row.Referencing_table),
			pq.QuoteIdentifier(fk_row.Referencing_column),
		)
		child_rows, err := backend.Db.Query(query_child, parent_id)
		if err != nil {
			log.Printf("\033[31mvirhe: lapsirivien haku taulusta %s: %s\033[0m\n", fk_row.Referencing_table, err.Error())
			continue
		}

		cols, err := child_rows.Columns()
		if err != nil {
			log.Printf("\033[31mvirhe: columns-luku taulusta %s: %s\033[0m\n", fk_row.Referencing_table, err.Error())
			child_rows.Close()
			continue
		}

		var table_rows []map[string]interface{}
		for child_rows.Next() {
			vals := make([]interface{}, len(cols))
			val_ptrs := make([]interface{}, len(cols))
			for i := range vals {
				val_ptrs[i] = &vals[i]
			}

			if err := child_rows.Scan(val_ptrs...); err != nil {
				log.Printf("\033[31mvirhe: lapsirivin scan taulusta %s: %s\033[0m\n", fk_row.Referencing_table, err.Error())
				continue
			}

			row_map := make(map[string]interface{})
			for i, col_name := range cols {
				switch typed_val := vals[i].(type) {
				case []byte:
					row_map[col_name] = string(typed_val)
				default:
					row_map[col_name] = typed_val
				}
			}
			table_rows = append(table_rows, row_map)
		}
		child_rows.Close()

		child_tables_list = append(child_tables_list, ChildTableResult{
			Table_name:  fk_row.Referencing_table,
			Column_name: fk_row.Referencing_column,
			Rows:        table_rows,
		})
	}

	resp := map[string]interface{}{
		"child_tables": child_tables_list,
	}
	log.Printf("\033[32mchild_tables_list = %+v\033[0m\n]", child_tables_list)
	response_writer.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(response_writer).Encode(resp); err != nil {
		log.Printf("\033[31mvirhe: lapsivastauksen koodaus: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe lapsivastauksen koodauksessa", http.StatusInternalServerError)
		return
	}
}
