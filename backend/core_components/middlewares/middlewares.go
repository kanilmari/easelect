// middlewares.go
package middlewares

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"strings"

	backend "easelect/backend/core_components" // Tarvitsemme vain Db
	e_sessions "easelect/backend/core_components/sessions"
	// Sessioiden Store
)

// WithUserLogging kirjaa lokiin perustietoja HTTP-pyynnöistä, jos debug on true.
func WithUserLogging(original_handler http.HandlerFunc) http.HandlerFunc {
	debug := false // Aseta tähän true tai false tarpeen mukaan

	return func(w http.ResponseWriter, r *http.Request) {
		// Vältetään lokituksen spämmäystä staattisilla tiedostoilla
		if strings.HasSuffix(r.URL.Path, ".css") ||
			strings.HasSuffix(r.URL.Path, ".js") ||
			strings.HasSuffix(r.URL.Path, ".ico") {
			original_handler(w, r)
			return
		}

		// Jos debug on false, ohitetaan lokitus ja kutsutaan alkuperäinen handler
		if !debug {
			original_handler(w, r)
			return
		}

		log_line := fmt.Sprintf("[Route: %s", r.URL.Path)

		table_name := r.URL.Query().Get("table")
		if table_name != "" {
			log_line += fmt.Sprintf(", table: %s", table_name)
		}

		store := e_sessions.GetStore()
		session, err := store.Get(r, "session")
		if err != nil {
			log_line += fmt.Sprintf(", session err: %v]", err)
			log.Println(log_line)
			original_handler(w, r)
			return
		}

		user_val, ok := session.Values["user_id"]
		if !ok {
			log_line += ", anonymous]"
			log.Println(log_line)
			original_handler(w, r)
			return
		}

		user_id, ok2 := user_val.(int)
		if !ok2 {
			log_line += ", user_id not int]"
			log.Println(log_line)
			original_handler(w, r)
			return
		}

		// Haetaan käyttäjänimi
		var user_name string
		err_query := backend.Db.QueryRow(`SELECT username FROM auth_users WHERE id = $1`, user_id).Scan(&user_name)
		if err_query != nil {
			log_line += fmt.Sprintf(", user_id: %d, userName fetch error: %v]", user_id, err_query)
			log.Println(log_line)
			original_handler(w, r)
			return
		}

		// Haetaan ryhmät
		rows, err_groups := backend.Db.Query(`
            SELECT g.name
            FROM auth_user_groups g
            JOIN auth_user_group_memberships ug 
                ON g.id = ug.group_id
            WHERE ug.user_id = $1
        `, user_id)
		if err_groups != nil {
			log_line += fmt.Sprintf(", user: %s, group fetch error: %v]", user_name, err_groups)
			log.Println(log_line)
			original_handler(w, r)
			return
		}

		var group_names []string
		for rows.Next() {
			var group_name string
			if scan_err := rows.Scan(&group_name); scan_err == nil {
				group_names = append(group_names, group_name)
			}
		}
		rows.Close()

		if len(group_names) == 0 {
			log_line += fmt.Sprintf(", user: %s, groups: none]", user_name)
		} else {
			log_line += fmt.Sprintf(", user: %s, groups: %v]", user_name, group_names)
		}

		log_line += "]"
		log.Println(log_line)

		original_handler(w, r)
	}
}

// WithLoginCheck varmistaa, että sessiossa on user_id.
// Ei tee function- tai table-level -oikeustarkistuksia.
func WithLoginCheck(original_handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		store := e_sessions.GetStore()
		session, err := store.Get(r, "session")
		if err != nil {
			log.Printf("\033[31m[WithLoginCheck] session haku epäonnistui: %v\033[0m", err)
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		user_id_val, ok := session.Values["user_id"]
		if !ok {
			log.Printf("\033[31m[WithLoginCheck] anonyymi -> uudelleenohjaus login-sivulle\033[0m")
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		_, ok2 := user_id_val.(int)
		if !ok2 {
			log.Printf("\033[31m[WithLoginCheck] user_id ei ole int -> ei oikeuksia\033[0m")
			http.Error(w, "403 - Forbidden", http.StatusForbidden)
			return
		}

		original_handler(w, r)
	}
}

// Yhdistetty tarkistusfunktio: tarkistaa sekä function-level että (tarvittaessa) table-level -oikeudet.
func userHasFunctionPermission(userID int, functionName, tableName string) bool {
	var query string
	var dummy int
	var err error

	// Jos kutsussa ei ole taulua, pitää löytyä tauluton rivi (target_table_name = '' tai IS NULL).
	if tableName == "" {
		query = `
			SELECT 1
			FROM auth_group_table_func_rights gf
			JOIN functions f ON gf.function_id = f.id
			JOIN auth_user_group_memberships ug ON gf.auth_user_group_id = ug.group_id
			WHERE f.name = $1
			  AND ug.user_id = $2
			  AND (gf.target_table_name = '' OR gf.target_table_name IS NULL)
			LIMIT 1
		`
		err = backend.Db.QueryRow(query, functionName, userID).Scan(&dummy)
	} else {
		// Jos taulunimi on annettu, pitää löytyä täsmälleen sama taulu
		query = `
			SELECT 1
			FROM auth_group_table_func_rights gf
			JOIN functions f ON gf.function_id = f.id
			JOIN auth_user_group_memberships ug ON gf.auth_user_group_id = ug.group_id
			WHERE f.name = $1
			  AND ug.user_id = $2
			  AND gf.target_table_name = $3
			LIMIT 1
		`
		err = backend.Db.QueryRow(query, functionName, userID, tableName).Scan(&dummy)
	}

	if err == sql.ErrNoRows {
		log.Printf("\033[31m[userHasFunctionPermission] Ei löytynyt oikeusriviä funktiolle='%s', taululle='%s' (userID=%d)\033[0m",
			functionName, tableName, userID)
		return false
	} else if err != nil {
		log.Printf("\033[31m[userHasFunctionPermission] Tietokantavirhe: %v\033[0m", err)
		return false
	}

	log.Printf("\033[32m[userHasFunctionPermission] OK - Löytyi oikeus funktiolle='%s', taululle='%s' (userID=%d)\033[0m",
		functionName, tableName, userID)
	return true
}

func WithAccessControl(handlerName string, originalHandler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		// --- Session ja käyttäjätarkistus ---
		store := e_sessions.GetStore()
		session, err := store.Get(r, "session")
		if err != nil {
			log.Printf("\033[31m[WithAccessControl][%s] session-haku epäonnistui: %v\033[0m", handlerName, err)
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		userIDVal, ok := session.Values["user_id"]
		if !ok {
			log.Printf("\033[31m[WithAccessControl][%s] Anonyymi käyttäjä -> uudelleenohjaus login-sivulle\033[0m", handlerName)
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		userID, ok2 := userIDVal.(int)
		if !ok2 {
			log.Printf("\033[31m[WithAccessControl][%s] user_id ei ole int -> ei oikeuksia\033[0m", handlerName)
			http.Error(w, "403 - Forbidden", http.StatusForbidden)
			return
		}

		// Hae käyttäjänimi lokitusta varten
		var username string
		err = backend.Db.QueryRow("SELECT username FROM auth_users WHERE id = $1", userID).Scan(&username)
		if err != nil {
			log.Printf("\033[31m[WithAccessControl][%s] Käyttäjänimen haku epäonnistui, userID=%d: %v\033[0m",
				handlerName, userID, err)
			username = fmt.Sprintf("id:%d", userID) // fallback
		}

		// --- Tarkista, mitä tauluja (jos mitään) parametreissa on ---
		tablesParam := r.URL.Query().Get("tables")
		if tablesParam != "" {
			// Usean taulun pyyntö: ?tables=table1,table2
			tableList := strings.Split(tablesParam, ",")
			for i := range tableList {
				tableList[i] = strings.TrimSpace(tableList[i])
			}

			for _, tbl := range tableList {
				// log.Printf("[WithAccessControl][%s] Tarkistetaan käyttäjän %s (id=%d) oikeus funktiolle='%s' tauluun='%s'",
				// 	handlerName, username, userID, handlerName, tbl)

				if !userHasFunctionPermission(userID, handlerName, tbl) {
					// log.Printf("\033[31m[WithAccessControl][%s] EI oikeutta -> 403\033[0m", handlerName)
					http.Error(w, "403 - Forbidden (multiple tables)", http.StatusForbidden)
					return
				}
			}

		} else {
			// Yhden taulun pyyntö ?table=...
			tableName := r.URL.Query().Get("table")

			// Jos taulunimi on annettu, tarkistetaan oikeus sille
			if tableName != "" {
				// log.Printf("[WithAccessControl][%s] Tarkistetaan käyttäjän %s (id=%d) oikeus funktiolle='%s' tauluun='%s'",
				// 	handlerName, username, userID, handlerName, tableName)

				if !userHasFunctionPermission(userID, handlerName, tableName) {
					// log.Printf("\033[31m[WithAccessControl][%s] EI oikeutta -> 403\033[0m", handlerName)
					http.Error(w, "403 - Forbidden (single table)", http.StatusForbidden)
					return
				}
			} else {
				// Ei taulunimeä ollenkaan = "tauluton" kutsu
				// log.Printf("[WithAccessControl][%s] Tarkistetaan käyttäjän %s (id=%d) tauluton oikeus funktiolle='%s'",
				// 	handlerName, username, userID, handlerName)

				if !userHasFunctionPermission(userID, handlerName, "") {
					// log.Printf("\033[31m[WithAccessControl][%s] EI oikeutta (tauluton) -> 403\033[0m", handlerName)
					http.Error(w, "403 - Forbidden (function-level)", http.StatusForbidden)
					return
				}
			}
		}

		// // Kaikki ok -> lokitetaan onnistuminen ja suoritetaan varsinainen handler
		// log.Printf("\033[32m[WithAccessControl][%s] Käyttöoikeustarkastus onnistui käyttäjälle %s (id=%d)\033[0m",
		// 	handlerName, username, userID)
		originalHandler(w, r)
	}
}

// WithDeviceIDCheck varmistaa, että sessionin device_id vastaa device_id-evästettä.
func WithDeviceIDCheck(originalHandler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		store := e_sessions.GetStore()
		session, err := store.Get(r, "session")
		if err != nil {
			log.Printf("[WithDeviceIDCheck] session haku epäonnistui: %v", err)
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		// Haetaan session arvot
		sess_device_id, _ := session.Values["device_id"].(string)
		if sess_device_id == "" {
			log.Printf("[WithDeviceIDCheck] ei device_id:tä sessiossa -> login")
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		// Haetaan device_id-eväste
		cookie_device_id, err := r.Cookie("device_id")
		if err != nil || cookie_device_id.Value == "" {
			log.Printf("[WithDeviceIDCheck] ei device_id-evästettä -> login")
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		if cookie_device_id.Value != sess_device_id {
			log.Printf("[WithDeviceIDCheck] device_id eroaa sessiosta -> login")
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		// OK -> jatketaan varsinaiseen handleriin
		originalHandler(w, r)
	}
}

// WithFingerprintCheck varmistaa, että tämänhetkinen fingerprint (pyynnön mukana tullut)
// täsmää sessiossa tallennettuun fingerprint_hash-arvoon.
// Se voidaan ketjuttaa WithLoginCheckin tai WithDeviceIDCheckin jälkeen.
func WithFingerprintCheck(originalHandler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		store := e_sessions.GetStore()
		session, err := store.Get(r, "session")
		if err != nil {
			log.Printf("\033[31mvirhe: session haku epäonnistui: %s\033[0m\n", err.Error())
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		sessFingerprint, _ := session.Values["fingerprint_hash"].(string)
		if sessFingerprint == "" {
			log.Printf("[WithFingerprintCheck] sessiossa ei fingerprint_hash-arvoa")
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		// Luetaan fingerprint evästeestä
		cookieFingerprint, cookieErr := r.Cookie("fingerprint")
		if cookieErr != nil || cookieFingerprint.Value == "" {
			log.Printf("[WithFingerprintCheck] ei fingerprint-evästettä pyynnössä")
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		// Lokitetaan debugina
		// log.Printf("[WithFingerprintCheck] sessFingerprint='%s', cookieFingerprint='%s'",
		// 	sessFingerprint, cookieFingerprint.Value)

		// Verrataan sessiossa ja evästeessä olevaa fingerprintiä
		if sessFingerprint != cookieFingerprint.Value {
			log.Println("[WithFingerprintCheck] fingerprint mismatch -> kirjaudutaan ulos")
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		// OK -> jatketaan
		originalHandler(w, r)
	}
}
