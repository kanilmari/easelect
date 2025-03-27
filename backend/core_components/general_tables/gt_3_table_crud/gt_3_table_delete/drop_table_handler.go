// drop_table_handler.go
package gt_3_table_delete

import (
	backend "easelect/backend/core_components"
	"easelect/backend/core_components/security"
	"encoding/json"
	"fmt"
	"net/http"
)

type DropTableRequest struct {
	TableName string `json:"table_name"`
}

func DropTableHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "vain POST sallittu", http.StatusMethodNotAllowed)
		return
	}

	var req DropTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Errorf("virheellinen data: %w", err).Error(), http.StatusBadRequest)
		return
	}

	if req.TableName == "" {
		http.Error(w, "taulun nimi puuttuu", http.StatusBadRequest)
		return
	}

	sanitizedTableName, err := security.SanitizeIdentifier(req.TableName)
	if err != nil {
		http.Error(w, fmt.Errorf("virhe taulun nimen validoinnissa: %w", err).Error(), http.StatusBadRequest)
		return
	}

	dropStmt := fmt.Sprintf("DROP TABLE %s CASCADE", sanitizedTableName)
	_, err = backend.Db.Exec(dropStmt)
	if err != nil {
		http.Error(w, fmt.Errorf("virhe taulun poistossa: %w", err).Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": fmt.Sprintf("Taulu %s poistettu", sanitizedTableName)})
}

func DeleteRemovedTables() error {
	deleteQuery := `
        DELETE FROM system_db_tables
        WHERE table_name NOT IN (
            SELECT c.relname
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
        );
    `
	_, err := backend.Db.Exec(deleteQuery)
	if err != nil {
		return fmt.Errorf("error deleting removed tables: %v", err)
	}
	return nil
}
