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

// // get_auth_modes.go
// package auth

// import (
// 	backend "easelect/backend/core_components"
// 	"easelect/backend/core_components/general_tables/gt_1_row_crud/gt_1_row_read"
// 	e_sessions "easelect/backend/core_components/sessions"
// 	"encoding/json"
// 	"log"
// 	"net/http"
// 	"strings"
// )

// func GetAuthModesHandler(response_writer http.ResponseWriter, request *http.Request) {
// 	// 1. Tarkistetaan, onko käyttäjä kirjautunut
// 	userID, err := gt_1_row_read.GetUserIDFromSession(request)
// 	if err != nil || userID <= 0 {
// 		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
// 		return
// 	}

// 	// 2. Luetaan järjestelmästä 'admin_mode' -avain (true / false / auto)
// 	var adminModeString string
// 	err = backend.DbGuest.QueryRow("SELECT text_value FROM system_config WHERE key = 'admin_mode'").Scan(&adminModeString)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe auth modes -dataa haettaessa", http.StatusInternalServerError)
// 		return
// 	}

// 	adminModeString = strings.ToLower(adminModeString)

// 	// Selvitetään onko käyttäjä ryhmässä "admins"
// 	var adminMode bool
// 	switch adminModeString {
// 	case "true":
// 		adminMode = true
// 	case "false":
// 		adminMode = false
// 	case "auto":
// 		rows, errGroupFetch := backend.DbGuest.Query(`
// 			SELECT g.id, g.name
// 			FROM auth_user_groups g
// 			JOIN auth_user_group_memberships ug ON g.id = ug.group_id
// 			WHERE ug.user_id = $1
// 		`, userID)
// 		if errGroupFetch != nil {
// 			log.Printf("\033[31mvirhe: %s\033[0m\n", errGroupFetch.Error())
// 			adminMode = false
// 		} else {
// 			defer rows.Close()
// 			userIsInAdmins := false
// 			for rows.Next() {
// 				var groupID int
// 				var groupName string
// 				if scanErr := rows.Scan(&groupID, &groupName); scanErr != nil {
// 					log.Printf("\033[31mvirhe: %s\033[0m\n", scanErr.Error())
// 					adminMode = false
// 					break
// 				}
// 				if groupName == "admins" {
// 					userIsInAdmins = true
// 					break
// 				}
// 			}
// 			adminMode = userIsInAdmins
// 		}
// 	default:
// 		// Jos tietokannan arvo on jokin muu, asetetaan varmuuden vuoksi false
// 		adminMode = false
// 	}

// 	// Määritetään rooli userID:n ja adminMode-arvon mukaan
// 	var userRole string
// 	if userID == 1 {
// 		userRole = "guest"
// 	} else if adminMode {
// 		userRole = "admin"
// 	} else {
// 		userRole = "basic"
// 	}

// 	log.Printf("[GetAuthModesHandler] Käyttäjä %d => rooli '%s', adminMode=%t", userID, userRole, adminMode)

// 	// Tallennetaan rooli sessioon
// 	session, err := e_sessions.GetStore().Get(request, "my-session")
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		// Emme lopeta, mutta kerromme, että sessio ei ehkä toimi
// 	}

// 	session.Values["user_role"] = userRole
// 	if err := session.Save(request, response_writer); err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "sessio tallennus epäonnistui", http.StatusInternalServerError)
// 		return
// 	}

// 	// Rakennetaan JSON-vastaus ja lähetetään
// 	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
// 	responseData := map[string]interface{}{
// 		"user_role":  userRole,
// 		"admin_mode": adminMode, // vain true/false
// 	}

// 	if err := json.NewEncoder(response_writer).Encode(responseData); err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(response_writer, "virhe auth modes -koodauksessa", http.StatusInternalServerError)
// 		return
// 	}
// }

// // // get_auth_modes.go
// // package auth

// // import (
// // 	backend "easelect/backend/core_components"
// // 	"easelect/backend/core_components/general_tables/gt_1_row_crud/gt_1_row_read"
// // 	e_sessions "easelect/backend/core_components/sessions"
// // 	"encoding/json"
// // 	"log"
// // 	"net/http"
// // 	"strings"
// // )

// // func GetAuthModesHandler(response_writer http.ResponseWriter, request *http.Request) {
// // 	// 1. Tarkistetaan, onko käyttäjä kirjautunut
// // 	userID, err := gt_1_row_read.GetUserIDFromSession(request)
// // 	if err != nil || userID <= 0 {
// // 		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
// // 		return
// // 	}

// // 	// 2. Luetaan järjestelmästä 'admin_mode' -avain
// // 	var adminModeString string
// // 	err = backend.DbGuest.QueryRow("SELECT text_value FROM system_config WHERE key = 'admin_mode'").Scan(&adminModeString)
// // 	if err != nil {
// // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(response_writer, "virhe auth modes -dataa haettaessa", http.StatusInternalServerError)
// // 		return
// // 	}
// // 	adminModeString = strings.ToLower(adminModeString)

// // 	// Tarkistetaan, onko käyttäjä "admins"-ryhmässä
// // 	var adminMode bool
// // 	switch adminModeString {
// // 	case "true":
// // 		adminMode = true
// // 	case "false":
// // 		adminMode = false
// // 	case "auto":
// // 		rows, errGroupFetch := backend.DbGuest.Query(`
// // 			SELECT g.id, g.name
// // 			FROM auth_user_groups g
// // 			JOIN auth_user_group_memberships ug ON g.id = ug.group_id
// // 			WHERE ug.user_id = $1
// // 		`, userID)
// // 		if errGroupFetch != nil {
// // 			log.Printf("\033[31mvirhe: %s\033[0m\n", errGroupFetch.Error())
// // 			adminMode = false
// // 		} else {
// // 			defer rows.Close()
// // 			userIsInAdmins := false
// // 			for rows.Next() {
// // 				var groupID int
// // 				var groupName string
// // 				if scanErr := rows.Scan(&groupID, &groupName); scanErr != nil {
// // 					log.Printf("\033[31mvirhe: %s\033[0m\n", scanErr.Error())
// // 					adminMode = false
// // 					break
// // 				}
// // 				if groupName == "admins" {
// // 					userIsInAdmins = true
// // 					break
// // 				}
// // 			}
// // 			adminMode = userIsInAdmins
// // 		}
// // 	default:
// // 		adminMode = false
// // 	}

// // 	// Jos userID on 1, kutsumme sitä "guestiksi"
// // 	// Jos adminMode on true, niin "admin"
// // 	// Muutoin "basic"
// // 	var userRole string
// // 	if userID == 1 {
// // 		userRole = "guest"
// // 	} else if adminMode {
// // 		userRole = "admin"
// // 	} else {
// // 		userRole = "basic"
// // 	}

// // 	log.Printf("[GetAuthModesHandler] Käyttäjä %d => rooli '%s'", userID, userRole)

// // 	// Tallennetaan rooli sessioon
// // 	session, err := e_sessions.GetStore().Get(request, "my-session")
// // 	if err != nil {
// // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		// Emme lopeta, mutta kerromme, että sessio ei ehkä toimi
// // 	}

// // 	session.Values["user_role"] = userRole

// // 	// Tallenna sessio
// // 	if err := session.Save(request, response_writer); err != nil {
// // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(response_writer, "sessio tallennus epäonnistui", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	// Rakennetaan JSON-vastaus
// // 	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
// // 	responseData := map[string]interface{}{
// // 		"user_role":  userRole,
// // 		"admin_mode": adminModeString,
// // 	}
// // 	if err := json.NewEncoder(response_writer).Encode(responseData); err != nil {
// // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(response_writer, "virhe auth modes -koodauksessa", http.StatusInternalServerError)
// // 		return
// // 	}
// // }

// // // // get_auth_modes.go
// // // package auth

// // // import (
// // // 	backend "easelect/backend/core_components"
// // // 	"easelect/backend/core_components/general_tables/gt_1_row_crud/gt_1_row_read"
// // // 	"encoding/json"
// // // 	"log"
// // // 	"net/http"
// // // 	"strings"
// // // )

// // // func GetAuthModesHandler(response_writer http.ResponseWriter, request *http.Request) {
// // // 	// 1. Tarkistetaan, onko käyttäjä kirjautunut
// // // 	userID, err := gt_1_row_read.GetUserIDFromSession(request)
// // // 	if err != nil || userID <= 0 {
// // // 		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
// // // 		return
// // // 	}

// // // 	// 2. Luetaan järjestelmästä 'admin_mode' -avain, joka vaikuttaa admin-tilan selvittelyyn
// // // 	var adminModeString string
// // // 	err = backend.Db.QueryRow("SELECT text_value FROM system_config WHERE key = 'admin_mode'").Scan(&adminModeString)
// // // 	if err != nil {
// // // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(response_writer, "virhe auth modes -dataa haettaessa", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	adminModeString = strings.ToLower(adminModeString)
// // // 	var adminMode bool

// // // 	switch adminModeString {
// // // 	case "true":
// // // 		adminMode = true
// // // 	case "false":
// // // 		adminMode = false
// // // 	case "auto":
// // // 		// Tarkistetaan, onko käyttäjä ryhmässä "admins"
// // // 		rows, errGroupFetch := backend.Db.Query(`
// // // 			SELECT g.id, g.name
// // // 			FROM auth_user_groups g
// // // 			JOIN auth_user_group_memberships ug ON g.id = ug.group_id
// // // 			WHERE ug.user_id = $1
// // // 		`, userID)
// // // 		if errGroupFetch != nil {
// // // 			log.Printf("\033[31mvirhe: %s\033[0m\n", errGroupFetch.Error())
// // // 			adminMode = false
// // // 		} else {
// // // 			defer rows.Close()
// // // 			userIsInAdmins := false
// // // 			for rows.Next() {
// // // 				var groupID int
// // // 				var groupName string
// // // 				if scanErr := rows.Scan(&groupID, &groupName); scanErr != nil {
// // // 					log.Printf("\033[31mvirhe: %s\033[0m\n", scanErr.Error())
// // // 					adminMode = false
// // // 					break
// // // 				}
// // // 				log.Printf("[GetAuthModesHandler] Käyttäjä %d on ryhmässä %d nimeltä '%s'",
// // // 					userID, groupID, groupName)
// // // 				if groupName == "admins" {
// // // 					userIsInAdmins = true
// // // 					break
// // // 				}
// // // 			}
// // // 			adminMode = userIsInAdmins
// // // 		}
// // // 	default:
// // // 		adminMode = false
// // // 	}

// // // 	// 3. Päätellään, tarvitaanko login- vai logout-painiketta (guest = userID=1)
// // // 	var buttonState string
// // // 	if userID == 1 {
// // // 		buttonState = "login"
// // // 	} else {
// // // 		buttonState = "logout"
// // // 	}

// // // 	// Kirjataan lopullinen päätelmä
// // // 	log.Printf("[GetAuthModesHandler] Käyttäjä %d -> adminMode=%t (tietokannan arvo: '%s'), buttonState=%s",
// // // 		userID, adminMode, adminModeString, buttonState)

// // // 	// 4. Palautetaan JSON-muotoinen vastaus
// // // 	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
// // // 	responseData := map[string]interface{}{
// // // 		"admin_mode":   adminMode,   // haluttaessa "is_admin_mode"
// // // 		"needs_button": buttonState, // haluttaessa "auth_button" tms.
// // // 	}

// // // 	if err := json.NewEncoder(response_writer).Encode(responseData); err != nil {
// // // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(response_writer, "virhe auth modes -koodauksessa", http.StatusInternalServerError)
// // // 		return
// // // 	}
// // // }

// // // // // get_auth_modes.go
// // // // package auth

// // // // import (
// // // // 	backend "easelect/backend/core_components"
// // // // 	"easelect/backend/core_components/general_tables/gt_1_row_crud/gt_1_row_read"
// // // // 	"encoding/json"
// // // // 	"log"
// // // // 	"net/http"
// // // // 	"strings"
// // // // )

// // // // func GetAuthModesHandler(response_writer http.ResponseWriter, request *http.Request) {
// // // // 	// 1. Tarkistetaan, onko käyttäjä kirjautunut
// // // // 	userID, err := gt_1_row_read.GetUserIDFromSession(request)
// // // // 	if err != nil || userID <= 0 {
// // // // 		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
// // // // 		return
// // // // 	}

// // // // 	// 2. Kysellään kantaan tallennettu admin_mode (text_value)
// // // // 	var adminModeString string
// // // // 	err = backend.Db.QueryRow("SELECT text_value FROM system_config WHERE key = 'admin_mode'").Scan(&adminModeString)
// // // // 	if err != nil {
// // // // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // // 		http.Error(response_writer, "virhe admin-modea haettaessa", http.StatusInternalServerError)
// // // // 		return
// // // // 	}

// // // // 	adminModeString = strings.ToLower(adminModeString)
// // // // 	var adminMode bool

// // // // 	switch adminModeString {
// // // // 	case "true":
// // // // 		adminMode = true
// // // // 	case "false":
// // // // 		adminMode = false
// // // // 	case "auto":
// // // // 		// Tarkistetaan, onko käyttäjä ryhmässä "admins"
// // // // 		rows, errGroupFetch := backend.Db.Query(`
// // // // 			SELECT g.id, g.name
// // // // 			FROM auth_user_groups g
// // // // 			JOIN auth_user_group_memberships ug ON g.id = ug.group_id
// // // // 			WHERE ug.user_id = $1
// // // // 		`, userID)
// // // // 		if errGroupFetch != nil {
// // // // 			log.Printf("\033[31mvirhe: %s\033[0m\n", errGroupFetch.Error())
// // // // 			adminMode = false
// // // // 		} else {
// // // // 			defer rows.Close()
// // // // 			userIsInAdmins := false
// // // // 			for rows.Next() {
// // // // 				var groupID int
// // // // 				var groupName string
// // // // 				if scanErr := rows.Scan(&groupID, &groupName); scanErr != nil {
// // // // 					log.Printf("\033[31mvirhe: %s\033[0m\n", scanErr.Error())
// // // // 					adminMode = false
// // // // 					break
// // // // 				}
// // // // 				log.Printf("[GetAdminModeHandler] Käyttäjä %d on ryhmässä %d nimeltä '%s'",
// // // // 					userID, groupID, groupName)
// // // // 				if groupName == "admins" {
// // // // 					userIsInAdmins = true
// // // // 					break
// // // // 				}
// // // // 			}
// // // // 			adminMode = userIsInAdmins
// // // // 		}
// // // // 	default:
// // // // 		adminMode = false
// // // // 	}

// // // // 	// Tarkistetaan, onko käyttäjä "guest" (userID == 1).
// // // // 	// Jos kyllä, needs_button = "login", muussa tapauksessa "logout".
// // // // 	var needsButtonValue string
// // // // 	if userID == 1 {
// // // // 		needsButtonValue = "login"
// // // // 	} else {
// // // // 		needsButtonValue = "logout"
// // // // 	}

// // // // 	// Kirjataan lopullinen päätelmä
// // // // 	log.Printf("[GetAdminModeHandler] Käyttäjä %d -> adminMode=%t (tietokannan arvo: '%s'), needsButton=%s",
// // // // 		userID, adminMode, adminModeString, needsButtonValue)

// // // // 	// 3. Palautetaan JSON-muotoinen vastaus
// // // // 	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
// // // // 	responseData := map[string]interface{}{
// // // // 		"admin_mode":   adminMode,
// // // // 		"needs_button": needsButtonValue,
// // // // 	}

// // // // 	if err := json.NewEncoder(response_writer).Encode(responseData); err != nil {
// // // // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // // 		http.Error(response_writer, "virhe admin moden koodauksessa", http.StatusInternalServerError)
// // // // 		return
// // // // 	}
// // // // }

// // // // // // get_admin_mode.go
// // // // // package auth

// // // // // import (
// // // // // 	backend "easelect/backend/core_components"
// // // // // 	"easelect/backend/core_components/general_tables/gt_1_row_crud/gt_1_row_read"
// // // // // 	"encoding/json"
// // // // // 	"log"
// // // // // 	"net/http"
// // // // // 	"strings"
// // // // // )

// // // // // func GetAdminModeHandler(response_writer http.ResponseWriter, request *http.Request) {
// // // // // 	// 1. Tarkistetaan, onko käyttäjä kirjautunut
// // // // // 	userID, err := gt_1_row_read.GetUserIDFromSession(request)
// // // // // 	if err != nil || userID <= 0 {
// // // // // 		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
// // // // // 		return
// // // // // 	}

// // // // // 	// 2. Kysellään kantaan tallennettu admin_mode (text_value)
// // // // // 	var adminModeString string
// // // // // 	err = backend.Db.QueryRow("SELECT text_value FROM system_config WHERE key = 'admin_mode'").Scan(&adminModeString)
// // // // // 	if err != nil {
// // // // // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // // // 		http.Error(response_writer, "virhe admin-modea haettaessa", http.StatusInternalServerError)
// // // // // 		return
// // // // // 	}

// // // // // 	adminModeString = strings.ToLower(adminModeString)
// // // // // 	var adminMode bool

// // // // // 	switch adminModeString {
// // // // // 	case "true":
// // // // // 		// Palautetaan aina true
// // // // // 		adminMode = true
// // // // // 	case "false":
// // // // // 		// Palautetaan aina false
// // // // // 		adminMode = false
// // // // // 	case "auto":
// // // // // 		// Tarkistetaan, onko käyttäjä ryhmässä "admins"
// // // // // 		rows, errGroupFetch := backend.Db.Query(`
// // // // // 			SELECT g.id, g.name
// // // // // 			FROM auth_user_groups g
// // // // // 			JOIN auth_user_group_memberships ug ON g.id = ug.group_id
// // // // // 			WHERE ug.user_id = $1
// // // // // 		`, userID)
// // // // // 		if errGroupFetch != nil {
// // // // // 			log.Printf("\033[31mvirhe: %s\033[0m\n", errGroupFetch.Error())
// // // // // 			// Palautetaan fallback-arvona false, jos ryhmien haku epäonnistuu
// // // // // 			adminMode = false
// // // // // 		} else {
// // // // // 			defer rows.Close()
// // // // // 			userIsInAdmins := false
// // // // // 			for rows.Next() {
// // // // // 				var groupID int
// // // // // 				var groupName string
// // // // // 				if scanErr := rows.Scan(&groupID, &groupName); scanErr != nil {
// // // // // 					log.Printf("\033[31mvirhe: %s\033[0m\n", scanErr.Error())
// // // // // 					adminMode = false
// // // // // 					break
// // // // // 				}

// // // // // 				// Lokitetaan jokainen ryhmä, johon käyttäjä kuuluu
// // // // // 				log.Printf("[GetAdminModeHandler] Käyttäjä %d on ryhmässä %d nimeltä '%s'",
// // // // // 					userID, groupID, groupName)

// // // // // 				// Jos jokin näistä ryhmistä on "admins", merkitään adminMode = true
// // // // // 				if groupName == "admins" {
// // // // // 					userIsInAdmins = true
// // // // // 					break
// // // // // 				}
// // // // // 			}
// // // // // 			adminMode = userIsInAdmins
// // // // // 		}
// // // // // 	default:
// // // // // 		// Jos tietokannassa on jokin muu arvo kuin 'true', 'false' tai 'auto', varmuuden vuoksi false
// // // // // 		adminMode = false
// // // // // 	}

// // // // // 	// -- Lisätty: onko käyttäjä "guest"? Jos userID == 1, oletamme sen.
// // // // // 	//    Tässä voisi myös tehdä ryhmätarkistuksen, jos haluat varmistua "guest"-ryhmän nimestä.
// // // // // 	needsLoginButton := (userID == 1)

// // // // // 	// Kirjataan lopullinen päätelmä
// // // // // 	log.Printf("[GetAdminModeHandler] Käyttäjä %d -> adminMode=%t (tietokannan arvo: '%s'), needsLoginButton=%t",
// // // // // 		userID, adminMode, adminModeString, needsLoginButton)

// // // // // 	// 3. Palautetaan JSON-muotoinen vastaus
// // // // // 	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
// // // // // 	responseData := map[string]interface{}{
// // // // // 		"admin_mode":         adminMode,
// // // // // 		"needs_login_button": needsLoginButton,
// // // // // 	}
// // // // // 	if err := json.NewEncoder(response_writer).Encode(responseData); err != nil {
// // // // // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // // // 		http.Error(response_writer, "virhe admin moden koodauksessa", http.StatusInternalServerError)
// // // // // 		return
// // // // // 	}
// // // // // }

// // // // // // // get_admin_mode.go
// // // // // // package auth

// // // // // // import (
// // // // // // 	backend "easelect/backend/core_components"
// // // // // // 	"easelect/backend/core_components/general_tables/gt_1_row_crud/gt_1_row_read"
// // // // // // 	"encoding/json"
// // // // // // 	"log"
// // // // // // 	"net/http"
// // // // // // 	"strings"
// // // // // // )

// // // // // // func GetAdminModeHandler(response_writer http.ResponseWriter, request *http.Request) {
// // // // // // 	// 1. Tarkistetaan, onko käyttäjä kirjautunut
// // // // // // 	userID, err := gt_1_row_read.GetUserIDFromSession(request)
// // // // // // 	if err != nil || userID <= 0 {
// // // // // // 		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
// // // // // // 		return
// // // // // // 	}

// // // // // // 	// 2. Kysellään kantaan tallennettu admin_mode (text_value)
// // // // // // 	var adminModeString string
// // // // // // 	err = backend.Db.QueryRow("SELECT text_value FROM system_config WHERE key = 'admin_mode'").Scan(&adminModeString)
// // // // // // 	if err != nil {
// // // // // // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // // // // 		http.Error(response_writer, "virhe admin-modea haettaessa", http.StatusInternalServerError)
// // // // // // 		return
// // // // // // 	}

// // // // // // 	adminModeString = strings.ToLower(adminModeString)
// // // // // // 	var adminMode bool

// // // // // // 	switch adminModeString {
// // // // // // 	case "true":
// // // // // // 		// Palautetaan aina true
// // // // // // 		adminMode = true
// // // // // // 	case "false":
// // // // // // 		// Palautetaan aina false
// // // // // // 		adminMode = false
// // // // // // 	case "auto":
// // // // // // 		// Tarkistetaan, onko käyttäjä ryhmässä "admins"
// // // // // // 		rows, errGroupFetch := backend.Db.Query(`
// // // // // // 			SELECT g.id, g.name
// // // // // // 			FROM auth_user_groups g
// // // // // // 			JOIN auth_user_group_memberships ug ON g.id = ug.group_id
// // // // // // 			WHERE ug.user_id = $1
// // // // // // 		`, userID)
// // // // // // 		if errGroupFetch != nil {
// // // // // // 			log.Printf("\033[31mvirhe: %s\033[0m\n", errGroupFetch.Error())
// // // // // // 			// Palautetaan fallback-arvona false, jos ryhmien haku epäonnistuu
// // // // // // 			adminMode = false
// // // // // // 		} else {
// // // // // // 			defer rows.Close()
// // // // // // 			userIsInAdmins := false
// // // // // // 			for rows.Next() {
// // // // // // 				var groupID int
// // // // // // 				var groupName string
// // // // // // 				if scanErr := rows.Scan(&groupID, &groupName); scanErr != nil {
// // // // // // 					log.Printf("\033[31mvirhe: %s\033[0m\n", scanErr.Error())
// // // // // // 					adminMode = false
// // // // // // 					break
// // // // // // 				}

// // // // // // 				// Lokitetaan jokainen ryhmä, johon käyttäjä kuuluu
// // // // // // 				log.Printf("[GetAdminModeHandler] Käyttäjä %d on ryhmässä %d nimeltä '%s'",
// // // // // // 					userID, groupID, groupName)

// // // // // // 				// Jos jokin näistä ryhmistä on "admins", merkitään adminMode = true
// // // // // // 				if groupName == "admins" {
// // // // // // 					userIsInAdmins = true
// // // // // // 					// Halutessasi voit breakata heti löydyttyä:
// // // // // // 					break
// // // // // // 				}
// // // // // // 			}
// // // // // // 			adminMode = userIsInAdmins
// // // // // // 		}
// // // // // // 	default:
// // // // // // 		// Jos tietokannassa on jokin muu arvo kuin 'true', 'false' tai 'auto', varmuuden vuoksi false
// // // // // // 		adminMode = false
// // // // // // 	}

// // // // // // 	// Kirjataan lopullinen päätelmä
// // // // // // 	log.Printf("[GetAdminModeHandler] Käyttäjä %d -> adminMode=%t (tietokannan arvo: '%s')",
// // // // // // 		userID, adminMode, adminModeString)

// // // // // // 	// 3. Palautetaan JSON-muotoinen vastaus
// // // // // // 	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
// // // // // // 	if err := json.NewEncoder(response_writer).Encode(map[string]bool{
// // // // // // 		"admin_mode": adminMode,
// // // // // // 	}); err != nil {
// // // // // // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // // // // 		http.Error(response_writer, "virhe admin moden koodauksessa", http.StatusInternalServerError)
// // // // // // 		return
// // // // // // 	}
// // // // // // }
