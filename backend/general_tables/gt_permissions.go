// permissions.go
package general_tables

import (
	"easelect/backend"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

type Permission struct {
	AuthUserGroupID  int    `json:"auth_user_group_id"`
	FunctionID       int    `json:"function_id"`
	TargetSchemaName string `json:"target_schema_name"`
	TargetTableName  string `json:"target_table_name"`
}

func PermissionsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getPermissions(w, r)
	case http.MethodPost:
		createPermissions(w, r)
	default:
		http.Error(w, "metodi ei ole sallittu", http.StatusMethodNotAllowed)
	}
}

func getPermissions(w http.ResponseWriter, r *http.Request) {
	_ = r // Estetään käyttämättömän parametrin varoitus

	query := `
		SELECT auth_user_group_id, function_id, target_schema_name, target_table_name
		FROM auth_group_table_func_rights
	`
	rows, err := backend.Db.Query(query)
	if err != nil {
		log.Printf("virhe oikeuksia haettaessa: %v", err)
		http.Error(w, "virhe oikeuksia haettaessa", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var permissions []Permission
	for rows.Next() {
		var p Permission
		if err := rows.Scan(&p.AuthUserGroupID, &p.FunctionID, &p.TargetSchemaName, &p.TargetTableName); err != nil {
			log.Printf("virhe rivin lukemisessa: %v", err)
			http.Error(w, "virhe rivin lukemisessa", http.StatusInternalServerError)
			return
		}
		permissions = append(permissions, p)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(permissions); err != nil {
		log.Printf("virhe vastauksen enkoodauksessa: %v", err)
		http.Error(w, "virhe vastauksen enkoodauksessa", http.StatusInternalServerError)
	}
}

func createPermissions(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Permissions []Permission `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		log.Printf("virhe datan dekoodauksessa: %v", err)
		http.Error(w, "virheellinen data", http.StatusBadRequest)
		return
	}

	// Jos ei tule yhtään uutta oikeutta, ei tehdä mitään
	if len(payload.Permissions) == 0 {
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"message": "ei uusia oikeuksia tallennettu",
		})
		return
	}

	// Poistettu aiempi funktiopaketin tarkistus, sallitaan kaikki funktiot nyt.

	tableName := payload.Permissions[0].TargetTableName
	schemaName := payload.Permissions[0].TargetSchemaName

	// Tarkistetaan, onko vanhoja oikeuksia olemassa
	countQuery := `
		SELECT COUNT(*) 
		FROM auth_group_table_func_rights
		WHERE target_schema_name = $1 AND target_table_name = $2
	`
	var count int
	if err := backend.Db.QueryRow(countQuery, schemaName, tableName).Scan(&count); err != nil {
		log.Printf("virhe laskettaessa olemassa olevia oikeuksia: %v", err)
		http.Error(w, "virhe laskettaessa olemassa olevia oikeuksia", http.StatusInternalServerError)
		return
	}

	if count > 0 {
		delQuery := `
			DELETE FROM auth_group_table_func_rights
			WHERE target_schema_name = $1 AND target_table_name = $2
		`
		res, err := backend.Db.Exec(delQuery, schemaName, tableName)
		if err != nil {
			log.Printf("virhe poistettaessa vanhoja oikeuksia: %v", err)
			http.Error(w, "virhe poistettaessa vanhoja oikeuksia", http.StatusInternalServerError)
			return
		}
		rowsDeleted, _ := res.RowsAffected()
		log.Printf("Poistettiin %d vanhaa oikeutta taulusta %s.%s", rowsDeleted, schemaName, tableName)
	} else {
		log.Printf("Ei vanhoja oikeuksia taulussa %s.%s, ei suoriteta DELETE-operaatiota", schemaName, tableName)
	}

	// Lisätään uudet oikeudet
	for _, perm := range payload.Permissions {
		err := insertPermission(perm)
		if err != nil {
			log.Printf("virhe oikeuden tallennuksessa: %v", err)
			http.Error(w, "virhe oikeuden tallennuksessa", http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": "oikeudet tallennettu onnistuneesti",
	})
}

func insertPermission(p Permission) error {
	query := `
        INSERT INTO auth_group_table_func_rights 
            (auth_user_group_id, function_id, target_schema_name, target_table_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (auth_user_group_id, function_id, target_schema_name, target_table_name)
        DO NOTHING
    `
	_, err := backend.Db.Exec(query, p.AuthUserGroupID, p.FunctionID, p.TargetSchemaName, p.TargetTableName)
	if err != nil {
		return fmt.Errorf("virhe insertissä: %w", err)
	}
	return nil
}
