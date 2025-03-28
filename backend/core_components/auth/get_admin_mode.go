// get_admin_mode.go
package auth

import (
	backend "easelect/backend/core_components"
	"easelect/backend/core_components/general_tables/gt_1_row_crud/gt_1_row_read"
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

func GetAdminModeHandler(response_writer http.ResponseWriter, request *http.Request) {
	// 1. Tarkistetaan, onko käyttäjä kirjautunut
	userID, err := gt_1_row_read.GetUserIDFromSession(request)
	if err != nil || userID <= 0 {
		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
		return
	}

	// 2. Kysellään kantaan tallennettu admin_mode (text_value)
	var adminModeString string
	err = backend.Db.QueryRow("SELECT text_value FROM system_config WHERE key = 'admin_mode'").Scan(&adminModeString)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe admin-modea haettaessa", http.StatusInternalServerError)
		return
	}

	adminModeString = strings.ToLower(adminModeString)
	var adminMode bool

	switch adminModeString {
	case "true":
		// Palautetaan aina true
		adminMode = true
	case "false":
		// Palautetaan aina false
		adminMode = false
	case "auto":
		// Tarkistetaan, onko käyttäjä ryhmässä "admins"
		rows, errGroupFetch := backend.Db.Query(`
			SELECT g.id, g.name
			FROM auth_user_groups g
			JOIN auth_user_group_memberships ug ON g.id = ug.group_id
			WHERE ug.user_id = $1
		`, userID)
		if errGroupFetch != nil {
			log.Printf("\033[31mvirhe: %s\033[0m\n", errGroupFetch.Error())
			// Palautetaan fallback-arvona false, jos ryhmien haku epäonnistuu
			adminMode = false
		} else {
			defer rows.Close()
			userIsInAdmins := false
			for rows.Next() {
				var groupID int
				var groupName string
				if scanErr := rows.Scan(&groupID, &groupName); scanErr != nil {
					log.Printf("\033[31mvirhe: %s\033[0m\n", scanErr.Error())
					adminMode = false
					break
				}

				// Lokitetaan jokainen ryhmä, johon käyttäjä kuuluu
				log.Printf("[GetAdminModeHandler] Käyttäjä %d on ryhmässä %d nimeltä '%s'",
					userID, groupID, groupName)

				// Jos jokin näistä ryhmistä on "admins", merkitään adminMode = true
				if groupName == "admins" {
					userIsInAdmins = true
					// Halutessasi voit breakata heti löydyttyä:
					break
				}
			}
			adminMode = userIsInAdmins
		}
	default:
		// Jos tietokannassa on jokin muu arvo kuin 'true', 'false' tai 'auto', varmuuden vuoksi false
		adminMode = false
	}

	// Kirjataan lopullinen päätelmä
	log.Printf("[GetAdminModeHandler] Käyttäjä %d -> adminMode=%t (tietokannan arvo: '%s')",
		userID, adminMode, adminModeString)

	// 3. Palautetaan JSON-muotoinen vastaus
	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(response_writer).Encode(map[string]bool{
		"admin_mode": adminMode,
	}); err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe admin moden koodauksessa", http.StatusInternalServerError)
		return
	}
}

// func GetAdminModeHandler(response_writer http.ResponseWriter, request *http.Request) {
// 	// 1. Tarkistetaan, onko käyttäjä kirjautunut
// 	userID, err := gt_1_row_read.GetUserIDFromSession(request)
// 	if err != nil || userID <= 0 {
// 		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
// 		return
// 	}

// 	// 2. Kysellään kantaan tallennettu admin_mode
// 	var adminModeStr string
// 	err = backend.Db.QueryRow("SELECT text_value FROM system_config WHERE key = 'admin_mode'").Scan(&adminModeStr)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe admin-modea haettaessa", http.StatusInternalServerError)
// 		return
// 	}

// 	adminMode := strings.ToLower(adminModeStr) == "true"

// 	// 3. Palautetaan JSON-muotoinen vastaus
// 	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
// 	if err := json.NewEncoder(response_writer).Encode(map[string]bool{
// 		"admin_mode": adminMode,
// 	}); err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe admin moden koodauksessa", http.StatusInternalServerError)
// 		return
// 	}
// }
