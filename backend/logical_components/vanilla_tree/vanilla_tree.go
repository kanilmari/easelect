// File: vanilla_tree.go

package vanilla_tree

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	"easelect/backend"
)

// TreeNode edustaa puun solmua. db_id on varsinainen numeroinen ID tietokannassa,
// kun taas id on "näyttö-ID" (esim. "f_6" tai "t_testitaulu4").
type TreeNode struct {
	ID       string `json:"id"`        // esim. "f_6", "t_testitaulu4"
	Name     string `json:"name"`      // Ihmislukuisempi otsikko
	ParentID string `json:"parent_id"` // esim. "f_7" tai "null"
	DbID     int    `json:"db_id"`     // oikea integer-ID tietokantaan
}

// GetTreeDataHandler hakee kansioiden ja taulujen tiedot puumaisesti
func GetTreeDataHandler(w http.ResponseWriter, r *http.Request) {
	rowsFolders, err := backend.Db.Query(`
        SELECT id, folder_name, parent_id
        FROM table_folders
        ORDER BY id
    `)
	if err != nil {
		http.Error(w, fmt.Errorf("virhe ladattaessa kansioita: %w", err).Error(), http.StatusInternalServerError)
		return
	}
	defer rowsFolders.Close()

	var nodes []TreeNode
	for rowsFolders.Next() {
		var folderID int
		var folderName string
		var folderParent sql.NullInt64

		if err := rowsFolders.Scan(&folderID, &folderName, &folderParent); err != nil {
			http.Error(w, fmt.Errorf("virhe kansiorivin lukemisessa: %w", err).Error(), http.StatusInternalServerError)
			return
		}

		// ParentID on merkkijonona "f_<numero>" tai "null"
		parentIDStr := "null"
		if folderParent.Valid {
			parentIDStr = fmt.Sprintf("f_%d", folderParent.Int64)
		}

		// Jokainen kansio saa "f_X" ID:n, ja numeric db_id on folderID.
		nodes = append(nodes, TreeNode{
			ID:       fmt.Sprintf("f_%d", folderID),
			Name:     folderName,
			ParentID: parentIDStr,
			DbID:     folderID, // varsinainen numeerinen ID
		})
	}

	rowsTables, err := backend.Db.Query(`
        SELECT id, table_name, folder_id
        FROM system_db_tables
        ORDER BY table_name
    `)
	if err != nil {
		http.Error(w, fmt.Errorf("virhe ladattaessa tauluja: %w", err).Error(), http.StatusInternalServerError)
		return
	}
	defer rowsTables.Close()

	for rowsTables.Next() {
		var tableID int
		var tableName string
		var folderID sql.NullInt64

		if err := rowsTables.Scan(&tableID, &tableName, &folderID); err != nil {
			http.Error(w, fmt.Errorf("virhe taulurivin lukemisessa: %w", err).Error(), http.StatusInternalServerError)
			return
		}

		// Taulukolle parentID on kansio "f_X" tai "null"
		parentIDStr := "null"
		if folderID.Valid {
			parentIDStr = fmt.Sprintf("f_%d", folderID.Int64)
		}

		// Jokainen taulu saa "t_<taulunNimi>" ID:n, ja numeric db_id on tableID (system_db_tables.id).
		nodes = append(nodes, TreeNode{
			ID:       "t_" + tableName,
			Name:     tableName,
			ParentID: parentIDStr,
			DbID:     tableID,
		})
	}

	// Muodostetaan JSON
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(nodes); err != nil {
		http.Error(w, fmt.Errorf("virhe JSON-koodauksessa: %w", err).Error(), http.StatusInternalServerError)
		return
	}
}

// GetTranslationsHandler hakee esim. käännökset system_lang_keys -taulusta
// (Tämä on valinnainen esimerkki, jos käytät kielikäännöksiä)
func GetTranslationsHandler(w http.ResponseWriter, r *http.Request) {
	chosenLang := r.URL.Query().Get("lang")
	if chosenLang == "" {
		chosenLang = "en"
	}

	queryStr := fmt.Sprintf("SELECT lang_key, %s FROM system_lang_keys", chosenLang)
	rows, err := backend.Db.Query(queryStr)
	if err != nil {
		http.Error(w, fmt.Errorf("virhe haettaessa kielikäännöksiä: %w", err).Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	translationMap := make(map[string]string)
	for rows.Next() {
		var key, val string
		if err := rows.Scan(&key, &val); err != nil {
			http.Error(w, fmt.Errorf("virhe rivin lukemisessa: %w", err).Error(), http.StatusInternalServerError)
			return
		}
		translationMap[key] = val
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(translationMap); err != nil {
		http.Error(w, fmt.Errorf("virhe JSON-koodauksessa: %w", err).Error(), http.StatusInternalServerError)
		return
	}
}
