// tables.go
package general_tables

import (
	"easelect/backend/core_components/general_tables/crud_workflows"
	"easelect/backend/core_components/general_tables/gt_2_column_crud/gt_2_column_update"
	"easelect/backend/core_components/general_tables/models"
	backend "easelect/backend/core_components"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	_ "github.com/lib/pq"
)

func GetGroupedTables(response_writer http.ResponseWriter, http_request *http.Request) {
	select_tables_query := `SELECT id, table_name FROM system_db_tables ORDER BY table_name`
	query_rows, query_error := backend.Db.Query(select_tables_query)
	if query_error != nil {
		log.Printf("virhe taulujen hakemisessa: %v", query_error)
		http.Error(response_writer, "virhe taulujen hakemisessa", http.StatusInternalServerError)
		return
	}
	defer query_rows.Close()

	var tables_list []models.Table
	for query_rows.Next() {
		var single_table models.Table

		scan_error := query_rows.Scan(&single_table.ID, &single_table.TableName)
		if scan_error != nil {
			log.Printf("virhe taulujen käsittelyssä: %v", scan_error)
			http.Error(response_writer, "virhe taulujen käsittelyssä", http.StatusInternalServerError)
			return
		}

		tables_list = append(tables_list, single_table)
	}

	response_map := map[string]interface{}{
		"tables": tables_list,
	}

	response_writer.Header().Set("Content-Type", "application/json")
	encode_error := json.NewEncoder(response_writer).Encode(response_map)
	if encode_error != nil {
		log.Printf("virhe vastauksen enkoodauksessa: %v", encode_error)
		http.Error(response_writer, "virhe vastauksen enkoodauksessa", http.StatusInternalServerError)
	}
}


func HandleUpdateOidsAndTableNames(w http.ResponseWriter, r *http.Request) {
	err := crud_workflows.UpdateOidsAndTableNamesWithBridge()
	if err != nil {
		http.Error(w, fmt.Sprintf("Error updating OID values and table names: %v", err), http.StatusInternalServerError)
		return
	}

	err = gt_2_column_update.UpdateColumnMetadata()
	if err != nil {
		http.Error(w, fmt.Sprintf("Error updating column metadata: %v", err), http.StatusInternalServerError)
		return
	}

	fmt.Fprintf(w, "OID values, table names, and column metadata updated successfully.")
}

func GetColumnNameToIDMap(tableName string) (map[string]int, error) {
	query := `
        SELECT column_name, column_uid
        FROM system_column_details
        WHERE table_name = $1
    `
	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columnMap := make(map[string]int)
	for rows.Next() {
		var columnName string
		var columnID int
		if err := rows.Scan(&columnName, &columnID); err != nil {
			return nil, err
		}
		columnMap[columnName] = columnID
	}
	return columnMap, nil
}

func GetColumnIDsForTable(tableName string) ([]int, error) {
	query := `
        SELECT column_uid
        FROM system_column_details
        WHERE table_name = $1
        ORDER BY co_number
    `
	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columnIDs []int
	for rows.Next() {
		var columnID int
		if err := rows.Scan(&columnID); err != nil {
			return nil, err
		}
		columnIDs = append(columnIDs, columnID)
	}
	return columnIDs, nil
}
