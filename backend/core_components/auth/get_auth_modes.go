// get_auth_modes.go
package auth

import (
	"database/sql"
	backend "easelect/backend/core_components"
	e_sessions "easelect/backend/core_components/sessions"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
)

// roleDbMapping on globaali kartta, josta roolin perusteella
// saadaan oikea tietokantayhteys (DbAdmin, DbBasic, DbGuest jne.)
var RoleDbMapping = map[string]*sql.DB{
	"admin": backend.DbAdmin,
	"basic": backend.DbBasic,
	"guest": backend.DbGuest,
}

// GetAuthModesHandler tallentaa käyttäjän roolin sessioon
func GetAuthModesHandler(response_writer http.ResponseWriter, request *http.Request) {
	fmt.Printf("\033[32mGetAuthModesHandler\033[0m\n")

	// 1. Tarkistetaan, onko käyttäjä kirjautunut
	userID, err := e_sessions.GetUserIDFromSession(request)
	if err != nil || userID <= 0 {
		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
		return
	}

	// 2. Luetaan järjestelmästä 'admin_mode' -avain (true / false / auto)
	var adminModeString string
	err = backend.DbGuest.QueryRow("SELECT text_value FROM system_config WHERE key = 'admin_mode'").Scan(&adminModeString)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe auth modes -dataa haettaessa", http.StatusInternalServerError)
		return
	}
	adminModeString = strings.ToLower(adminModeString)

	// Selvitetään, onko käyttäjä "admin"-ryhmässä, jos admin_mode = "auto"
	var adminMode bool
	switch adminModeString {
	case "true":
		adminMode = true
	case "false":
		adminMode = false
	case "auto":
		rows, errGroupFetch := backend.DbGuest.Query(`
			SELECT g.id, g.name
			FROM auth_user_groups g
			JOIN auth_user_group_memberships ug ON g.id = ug.group_id
			WHERE ug.user_id = $1
		`, userID)
		if errGroupFetch != nil {
			log.Printf("\033[31mvirhe: %s\033[0m\n", errGroupFetch.Error())
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
				if groupName == "admins" {
					userIsInAdmins = true
					break
				}
			}
			adminMode = userIsInAdmins
		}
	default:
		// Jos tietokannan arvo on jokin muu, asetetaan varmuuden vuoksi false
		adminMode = false
	}

	// 3. Päätellään, tarvitaanko login- vai logout-painiketta (guest = userID=1)
	var buttonState string
	if userID == 1 {
		buttonState = "login"
	} else {
		buttonState = "logout"
	}

	// Määritetään rooli userID:n ja adminMode-arvon mukaan
	var userRole string
	if userID == 1 {
		userRole = "guest"
	} else if adminMode {
		userRole = "admin"
	} else {
		userRole = "basic"
	}

	// Tallennetaan rooli sessioon
	session, err := e_sessions.GetStore().Get(request, "session")
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		// Emme lopeta, mutta kerromme, että sessio ei ehkä toimi
	}
	session.Values["user_role"] = userRole

	// Session data (demotulostus)
	fmt.Printf("\033[32mSession data: %v\033[0m\n", session.Values)

	if err := session.Save(request, response_writer); err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "sessio tallennus epäonnistui", http.StatusInternalServerError)
		return
	}

	// 4. Palautetaan JSON-muotoinen vastaus (admin_mode vain true/false)
	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	responseData := map[string]interface{}{
		"admin_mode":   adminMode,   // aina bool
		"needs_button": buttonState, // login tai logout
	}
	if err := json.NewEncoder(response_writer).Encode(responseData); err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "virhe auth modes -koodauksessa", http.StatusInternalServerError)
		return
	}
}
