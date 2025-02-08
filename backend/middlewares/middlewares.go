// middlewares.go
package middlewares

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"strings"

	"rapsa/backend"          // Tarvitsemme vain Db
	"rapsa/backend/sessions" // Sessioiden Store
)

// WithUserLogging kirjaa lokiin perustietoja HTTP-pyynnöistä.
func WithUserLogging(original_handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Vältetään lokituksen spämmäystä staattisilla tiedostoilla
		if strings.HasSuffix(r.URL.Path, ".css") ||
			strings.HasSuffix(r.URL.Path, ".js") ||
			strings.HasSuffix(r.URL.Path, ".ico") {
			original_handler(w, r)
			return
		}

		log_line := fmt.Sprintf("[Route: %s", r.URL.Path)

		table_name := r.URL.Query().Get("table")
		if table_name != "" {
			log_line += fmt.Sprintf(", table: %s", table_name)
		}

		store := sessions.GetStore()
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

// WithAccessControl tarkistaa, onko käyttäjällä oikeus kutsua annettua handler_namea
// (function-level) sekä valinnaisesti tauluun (table-level).
func WithAccessControl(handler_name string, original_handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		// // --- Yksinkertainen request-dump (ei JSON-käsittelyä) --- Huom! Säästä tämä kommentti myöhempää käyttöä varten! ---
		// log.Printf("== Request Dump == method: %s, url: %s, headers: %v",
		// 	r.Method,
		// 	r.URL.String(),
		// 	r.Header,
		// )

		// --- Session ja käyttäjätarkistus ---
		store := sessions.GetStore()
		session, err := store.Get(r, "session")
		if err != nil {
			log.Printf("[WithAccessControl][%s] session haku epäonnistui: %v", handler_name, err)
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		user_id_val, ok := session.Values["user_id"]
		if !ok {
			log.Printf("[WithAccessControl][%s] anonyymi käyttäjä -> uudelleenohjaus login-sivulle", handler_name)
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		user_id, ok2 := user_id_val.(int)
		if !ok2 {
			log.Printf("[WithAccessControl][%s] user_id ei ole int -> ei oikeuksia", handler_name)
			http.Error(w, "403 - Forbidden", http.StatusForbidden)
			return
		}

		// 1) Usean taulun pyyntö ?tables=...
		tables_param := r.URL.Query().Get("tables")
		if tables_param != "" {
			table_list := strings.Split(tables_param, ",")
			for i := range table_list {
				table_list[i] = strings.TrimSpace(table_list[i])
			}
			for _, tbl := range table_list {
				if !userHasTablePermission(user_id, handler_name, tbl) {
					log.Printf("[WithAccessControl][%s] käyttäjällä id=%d ei tauluoikeutta: %s",
						handler_name, user_id, tbl)
					http.Error(w, "403 - Forbidden (multiple tables)", http.StatusForbidden)
					return
				}
			}
		} else {
			// 2) Yhden taulun pyyntö ?table=...
			table_name := r.URL.Query().Get("table")
			if table_name != "" {
				if !userHasTablePermission(user_id, handler_name, table_name) {
					log.Printf("[WithAccessControl][%s] käyttäjällä id=%d ei tauluoikeutta: %s",
						handler_name, user_id, table_name)
					http.Error(w, "403 - Forbidden (single table)", http.StatusForbidden)
					return
				}
			}
		}

		// 3) Function-level -oikeus
		query_str := `
			SELECT 1
			FROM auth_group_table_func_rights gf
			JOIN functions f ON gf.function_id = f.id
			JOIN auth_user_group_memberships ug ON gf.auth_user_group_id = ug.group_id
			WHERE f.name = $1
			  AND ug.user_id = $2
			LIMIT 1
		`
		var dummy int
		err_query := backend.Db.QueryRow(query_str, handler_name, user_id).Scan(&dummy)
		if err_query == sql.ErrNoRows {
			log.Printf("[WithAccessControl][%s] käyttäjällä id=%d ei function-oikeutta", handler_name, user_id)
			http.Error(w, "403 - Forbidden (function-level)", http.StatusForbidden)
			return
		} else if err_query != nil {
			log.Printf("[WithAccessControl][%s] tietokantavirhe: %v", handler_name, err_query)
			http.Error(w, "500 - DB error", http.StatusInternalServerError)
			return
		}

		// Kaikki ok -> suoritetaan varsinainen handler
		original_handler(w, r)
	}
}

// userHasTablePermission tarkistaa, onko userID:llä tauluoikeus
// pyydettyyn tauluun & funktioon. Yksinkertainen esimerkki:
func userHasTablePermission(user_id int, function_name, table_name string) bool {
	if table_name == "" {
		return true
	}
	query := `
		SELECT 1
		FROM auth_group_table_func_rights gf
		JOIN functions f ON gf.function_id = f.id
		JOIN auth_user_group_memberships ug ON gf.auth_user_group_id = ug.group_id
		WHERE f.name = $1
		  AND ug.user_id = $2
		  AND gf.target_table_name = $3
		LIMIT 1
	`
	var dummy int
	err := backend.Db.QueryRow(query, function_name, user_id, table_name).Scan(&dummy)
	if err == sql.ErrNoRows {
		return false
	} else if err != nil {
		log.Printf("DB virhe userHasTablePermission: %v", err)
		return false
	}
	return true
}
