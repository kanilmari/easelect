// columnOrder.go

package general_tables

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"rapsa/backend"
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

func UpdateColumnOrderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Metodi ei ole sallittu", http.StatusMethodNotAllowed)
		return
	}

	var requestData struct {
		TableName string `json:"table_name"`
		NewOrder  []int  `json:"new_order"` // Tämä sisältää column_uid -arvot kokonaislukuina
	}

	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		log.Printf("UpdateColumnOrderHandler: Virhe datan dekoodauksessa: %v", err)
		http.Error(w, "Virheellinen data", http.StatusBadRequest)
		return
	}

	if requestData.TableName == "" || len(requestData.NewOrder) == 0 {
		http.Error(w, "Taulun nimi tai uusi järjestys puuttuu", http.StatusBadRequest)
		return
	}

	// Haetaan olemassa olevat sarakkeet tietokannasta
	var existingColumnsJSON string
	query := `SELECT columns FROM system_db_tables WHERE table_name = $1`
	err := backend.Db.QueryRow(query, requestData.TableName).Scan(&existingColumnsJSON)
	if err != nil {
		log.Printf("Virhe haettaessa olemassa olevia sarakkeita taululle %s: %v", requestData.TableName, err)
		http.Error(w, "Virhe haettaessa olemassa olevia sarakkeita", http.StatusInternalServerError)
		return
	}

	// Muutetaan JSON-stringi sliceksi
	var existingColumns []int
	err = json.Unmarshal([]byte(existingColumnsJSON), &existingColumns)
	if err != nil {
		log.Printf("Virhe parsittaessa olemassa olevia sarakkeita JSON: %v", err)
		http.Error(w, "Virhe käsiteltäessä olemassa olevia sarakkeita", http.StatusInternalServerError)
		return
	}

	// Ensimmäinen ehto: tarkistetaan, että sarakkeiden lukumäärä on sama
	if len(requestData.NewOrder) != len(existingColumns) {
		http.Error(w, "Sarakkeiden lukumäärä ei täsmää olemassa olevien sarakkeiden kanssa", http.StatusBadRequest)
		return
	}

	// Toinen ehto: tarkistetaan, että päivitettävät sarakkeet ovat samat kuin olemassa olevat sarakkeet
	existingColumnsMap := make(map[int]bool)
	for _, col := range existingColumns {
		existingColumnsMap[col] = true
	}

	newOrderColumnsMap := make(map[int]bool)
	for _, col := range requestData.NewOrder {
		// Tarkistetaan myös, ettei tule päällekkäisiä sarakkeita
		if newOrderColumnsMap[col] {
			http.Error(w, "Uudessa järjestyksessä on päällekkäisiä sarakkeita", http.StatusBadRequest)
			return
		}
		newOrderColumnsMap[col] = true

		if !existingColumnsMap[col] {
			http.Error(w, "Päivitettävät sarakkeet eivät täsmää olemassa olevien sarakkeiden kanssa", http.StatusBadRequest)
			return
		}
	}

	// Convert the new order to JSON string
	newOrderJSON, err := json.Marshal(requestData.NewOrder)
	if err != nil {
		log.Printf("Virhe marshalling new order: %v", err)
		http.Error(w, "Virhe tallennettaessa järjestystä", http.StatusInternalServerError)
		return
	}

	// Update the col_display_order field in system_db_tables
	query = `
        UPDATE system_db_tables
        SET col_display_order = $1
        WHERE table_name = $2
    `
	_, err = backend.Db.Exec(query, string(newOrderJSON), requestData.TableName)
	if err != nil {
		log.Printf("Virhe päivitettäessä col_display_order taululle %s: %v", requestData.TableName, err)
		http.Error(w, "Virhe tallennettaessa järjestystä", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Sarakkeiden järjestys tallennettu onnistuneesti",
	})
}
