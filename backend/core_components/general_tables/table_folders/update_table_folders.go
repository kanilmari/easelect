// update_table_folders

package table_folders

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	backend "easelect/backend/core_components"
)

// HandleUpdateFolder käsittelee POST /api/update-folder
// Body: { "item_id": 123, "item_type": "folder"|"table", "new_folder_id": 456 }
func HandleUpdateFolder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ItemID      int    `json:"item_id"`
		ItemType    string `json:"item_type"`
		NewFolderID int    `json:"new_folder_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	fmt.Printf("[handleUpdateFolder] item_id=%d, item_type=%s, new_folder_id=%d\n",
		req.ItemID, req.ItemType, req.NewFolderID)

	switch strings.ToLower(req.ItemType) {
	case "folder":
		// Päivitä table_folders jos haluat "kansion siirtämistä" toisen folderin alle
		// Oletus, että table_folders: (id, folder_name, parent_folder_id)
		_, err := backend.Db.Exec(`
            UPDATE table_folders
               SET parent_id = $1
             WHERE id = $2
        `, req.NewFolderID, req.ItemID)
		if err != nil {
			http.Error(w, fmt.Sprintf("db error updating folder: %v", err), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "Folder updated successfully.")
		return

	case "table":
		// Päivitä system_db_tables: (id, table_name, folder_id)
		_, err := backend.Db.Exec(`
            UPDATE system_db_tables
               SET folder_id = $1
             WHERE id = $2
        `, req.NewFolderID, req.ItemID)
		if err != nil {
			http.Error(w, fmt.Sprintf("db error updating system_db_tables: %v", err), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "Table updated successfully.")
		return

	default:
		http.Error(w, "unknown item_type (must be 'folder' or 'table')", http.StatusBadRequest)
		return
	}
}
