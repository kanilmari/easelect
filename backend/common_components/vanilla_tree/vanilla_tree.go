// vanilla_tree.go

package vanilla_tree

import (
	"database/sql"
	backend "easelect/backend/core_components"
	"encoding/json"
	"fmt"
	"net/http"
)

// TreeNode edustaa puun solmua. db_id on varsinainen numeroinen ID tietokannassa.
// TableUID edustaa yksilöivää tunnistetta (UUID tms.),
// DefaultViewID on oletusnäkymän numeroinen ID, jos sellainen on tallennettu.
type TreeNode struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	ParentID        string  `json:"parent_id"`
	DbID            int     `json:"db_id"`
	TableUID        string  `json:"table_uid,omitempty"`
	DefaultViewID   *int64  `json:"default_view_id,omitempty"`
	DefaultViewName *string `json:"default_view_name,omitempty"`
}

// GetTreeDataHandler hakee kansioiden ja taulujen tiedot puumaisesti
// sekä lisäksi kaikki rivit system_column_details-taulusta (SELECT c.*, t.table_name FROM ...).
// Koska 'SELECT *' on käytössä, käsitellään dataa dynaamisesti, jottei
// sarakeluetteloa tarvitse kovakoodata.
func GetTreeDataHandler(response_writer http.ResponseWriter, request *http.Request) {
	folderRows, err := backend.Db.Query(
		`SELECT 
			id, 
			folder_name, 
			parent_id
		FROM table_folders
		ORDER BY id`)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe kansiotietojen haussa", http.StatusInternalServerError)
		return
	}
	defer folderRows.Close()

	var allNodes []TreeNode
	for folderRows.Next() {
		var folderID int
		var folderName string
		var folderParent sql.NullInt64

		if err := folderRows.Scan(&folderID, &folderName, &folderParent); err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(response_writer, "virhe kansiorivien käsittelyssä", http.StatusInternalServerError)
			return
		}

		parentIDString := "null"
		if folderParent.Valid {
			parentIDString = fmt.Sprintf("f_%d", folderParent.Int64)
		}

		allNodes = append(allNodes, TreeNode{
			ID:       fmt.Sprintf("f_%d", folderID),
			Name:     folderName,
			ParentID: parentIDString,
			DbID:     folderID,
		})
	}

	tableRows, err := backend.Db.Query(
		`SELECT
			t.id,
			t.table_name,
			t.table_uid,
			t.folder_id,
			t.default_view_id,
			v.name
		FROM system_db_tables t
		LEFT JOIN table_views v ON t.default_view_id = v.id
		ORDER BY t.table_name`)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe taulutietojen haussa", http.StatusInternalServerError)
		return
	}
	defer tableRows.Close()

	for tableRows.Next() {
		var tableID int
		var tableName, tableUID string
		var folderID sql.NullInt64
		var defaultViewID sql.NullInt64
		var defaultViewName sql.NullString

		if err := tableRows.Scan(
			&tableID,
			&tableName,
			&tableUID,
			&folderID,
			&defaultViewID,
			&defaultViewName,
		); err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(response_writer, "virhe taulujen rivien käsittelyssä", http.StatusInternalServerError)
			return
		}

		parentIDString := "null"
		if folderID.Valid {
			parentIDString = fmt.Sprintf("f_%d", folderID.Int64)
		}

		node := TreeNode{
			ID:       "t_" + tableName,
			Name:     tableName,
			ParentID: parentIDString,
			DbID:     tableID,
			TableUID: tableUID,
		}
		if defaultViewID.Valid {
			node.DefaultViewID = &defaultViewID.Int64
		}
		if defaultViewName.Valid {
			node.DefaultViewName = &defaultViewName.String
		}

		allNodes = append(allNodes, node)
	}

	// Haetaan dynaamisesti kaikki sarakkeet system_column_details-taulusta ja
	// liitetään myös table_name-jäljelle:
	detailsRows, err := backend.Db.Query(
		`SELECT c.*, t.table_name
		FROM system_column_details c
		LEFT JOIN system_db_tables t ON c.table_uid = t.table_uid
		ORDER BY c.table_uid, c.co_number`)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe column_details-haussa", http.StatusInternalServerError)
		return
	}
	defer detailsRows.Close()

	// Kyselyn sarakenimet
	resultColumns, err := detailsRows.Columns()
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe sarakkeiden nimien haussa", http.StatusInternalServerError)
		return
	}

	var allColumnDetails []map[string]interface{}

	for detailsRows.Next() {
		// Varataan paikka jokaiselle sarakkeelle
		rowValues := make([]interface{}, len(resultColumns))
		rowPointers := make([]interface{}, len(resultColumns))
		for i := range rowValues {
			rowPointers[i] = &rowValues[i]
		}

		// Luetaan rivin arvot
		if err := detailsRows.Scan(rowPointers...); err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(response_writer, "virhe column_details-rivien käsittelyssä", http.StatusInternalServerError)
			return
		}

		// Luodaan map sarakkenimi -> arvo
		currentRow := make(map[string]interface{})
		for index, columnName := range resultColumns {
			val := rowValues[index]
			switch typedVal := val.(type) {
			case []byte:
				currentRow[columnName] = string(typedVal)
			default:
				currentRow[columnName] = typedVal
			}
		}
		allColumnDetails = append(allColumnDetails, currentRow)
	}

	// Kootaan vastaus
	responseData := map[string]interface{}{
		"nodes":          allNodes,
		"column_details": allColumnDetails,
	}

	response_writer.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(response_writer).Encode(responseData); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe JSON-koodauksessa", http.StatusInternalServerError)
		return
	}
}
