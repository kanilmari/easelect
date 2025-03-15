// permissions.go
package general_tables

import (
	"database/sql"
	backend "easelect/backend/core_components"
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

// Poistaa auth_group_table_func_rights -taulusta kaikki rivit,
// joiden target_table_name on voimassaolon ulkopuolella (ei löytynyt skeemasta).
func Remove_non_existent_table_rights(db *sql.DB) error {
	// Poistetaan taulun puuttuvat viittaukset + disabled-funktioiden viittaukset
	delete_query := `
        DELETE FROM auth_group_table_func_rights agr
        WHERE
            (
                agr.target_table_name <> ''
                AND NOT EXISTS (
                    SELECT 1
                    FROM information_schema.tables t
                    WHERE t.table_schema = agr.target_schema_name
                      AND t.table_name   = agr.target_table_name
                )
            )
            OR
            (
                NOT EXISTS (
                    SELECT 1
                    FROM functions f
                    WHERE f.id = agr.function_id
                      AND f.disabled = FALSE
                )
            )
    `

	log.Println("Poistetaan auth_group_table_func_rights -taulusta puuttuvat tai disabloituihin funktioihin viittaavat rivit...")

	result, err := db.Exec(delete_query)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return err
	}

	rows_affected, err := result.RowsAffected()
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return err
	}

	log.Printf("Poistettu %d riviä auth_group_table_func_rights -taulusta", rows_affected)
	return nil
}

// Poistaa auth_group_table_func_rights -taulusta ne rivit, joiden function_id
// puuttuu kokonaan functions-taulusta TAI on merkitty disabled = true
func Remove_non_existent_or_disabled_functions(db *sql.DB) error {
	deleteQuery := `
		DELETE FROM auth_group_table_func_rights
		WHERE NOT EXISTS (
			SELECT 1
			FROM functions
			WHERE functions.id = auth_group_table_func_rights.function_id
			  AND functions.disabled = false
		)
	`

	log.Println("Poistetaan auth_group_table_func_rights -taulusta viittaukset, joiden funktio puuttuu tai on disabloitu...")

	result, err := db.Exec(deleteQuery)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return err
	}

	log.Printf("Poistettu %d riviä auth_group_table_func_rights -taulusta (funktio puuttui tai oli disabloitu).", rowsAffected)
	return nil
}

func getPermissions(w http.ResponseWriter, _ *http.Request) {
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

	if len(payload.Permissions) == 0 {
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"message": "ei uusia oikeuksia tallennettu",
		})
		return
	}

	tableName := payload.Permissions[0].TargetTableName
	schemaName := payload.Permissions[0].TargetSchemaName

	if tableName == "" {
		// *** Tauluton tapaus => Poistetaan entiset "table_name = ''" -rivimme ja lisätään uudet
		deleteQuery := `
            DELETE FROM auth_group_table_func_rights
            WHERE target_schema_name = $1 
              AND target_table_name = ''
        `
		res, err := backend.Db.Exec(deleteQuery, schemaName)
		if err != nil {
			log.Printf("virhe poistettaessa vanhoja tauluttomia oikeuksia: %v", err)
			http.Error(w, "virhe poistettaessa vanhoja tauluttomia oikeuksia", http.StatusInternalServerError)
			return
		}
		rowsDeleted, _ := res.RowsAffected()
		log.Printf("Poistettiin %d vanhaa taulutonta oikeutta skeemasta %s", rowsDeleted, schemaName)

		// Lisätään nyt uudet
		for _, perm := range payload.Permissions {
			if err := insertPermission(perm); err != nil {
				log.Printf("virhe oikeuden tallennuksessa: %v", err)
				http.Error(w, "virhe oikeuden tallennuksessa", http.StatusInternalServerError)
				return
			}
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"message": "kiinteät oikeudet tallennettu (vanhat poistettu, uudet lisätty)",
		})
		return

	} else {
		// *** Taulukohtainen tapaus
		countQuery := `
            SELECT COUNT(*) FROM auth_group_table_func_rights
            WHERE target_schema_name = $1 AND target_table_name = $2
        `
		var count int
		if err := backend.Db.QueryRow(countQuery, schemaName, tableName).Scan(&count); err != nil {
			log.Printf("virhe laskettaessa olemassaolevia oikeuksia: %v", err)
			http.Error(w, "virhe laskettaessa olemassaolevia oikeuksia", http.StatusInternalServerError)
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
		}

		for _, perm := range payload.Permissions {
			if err := insertPermission(perm); err != nil {
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
