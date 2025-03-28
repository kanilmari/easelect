// register.go
package auth

import (
	backend "easelect/backend/core_components"
	"log"
	"net/http"
	"path/filepath"

	"golang.org/x/crypto/bcrypt"
)

func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("registerHandler called")
	if r.Method == http.MethodGet {
		http.ServeFile(w, r, filepath.Join(frontend_dir, "templates", "register.html"))
		return
	}

	if r.Method == http.MethodPost {
		err := r.ParseForm()
		if err != nil {
			log.Printf("\033[31mvirhe: lomakkeen käsittely epäonnistui: %s\033[0m\n", err.Error())
			http.Error(w, "lomakkeen käsittely epäonnistui", http.StatusBadRequest)
			return
		}
		username := r.FormValue("username")
		password := r.FormValue("password")
		email := r.FormValue("email")
		full_name := r.FormValue("full_name")

		log.Printf("received registration data: username=%s, email=%s, full_name=%s",
			username, email, full_name)

		hashed_password, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("\033[31mvirhe: salasanan hashays epäonnistui: %s\033[0m\n", err.Error())
			http.Error(w, "salasanan hashays epäonnistui", http.StatusInternalServerError)
			return
		}

		// 1) Lisätään rivi auth_users-tauluun (pääkäyttäjällä)
		var newUserID int
		err = backend.Db.QueryRow(`
            INSERT INTO auth_users (
                username,
                full_name,
                created,
                updated,
                disabled,
                privileged
            )
            VALUES ($1, $2, NOW(), NOW(), false, false)
            RETURNING id
        `, username, full_name).Scan(&newUserID)
		if err != nil {
			log.Printf("\033[31mvirhe: käyttäjän lisääminen epäonnistui: %s\033[0m\n", err.Error())
			http.Error(w, "rekisteröinti epäonnistui (vaihe 1)", http.StatusInternalServerError)
			return
		}

		// 2) Lisätään salasanatieto restricted.user_data-tauluun (rajatulla yhteydellä)
		_, err = backend.DbConfidential.Exec(`
            INSERT INTO restricted.user_data (id, password, email)
            VALUES ($1, $2, $3)
        `, newUserID, string(hashed_password), email)
		if err != nil {
			log.Printf("\033[31mvirhe: restricted-tauluun lisääminen epäonnistui: %s\033[0m\n", err.Error())
			http.Error(w, "rekisteröinti epäonnistui (vaihe 2)", http.StatusInternalServerError)
			return
		}

		// 3) Lisätään käyttäjä oletuksena "users"-ryhmään
		var usersGroupID int
		err = backend.Db.QueryRow(`
			SELECT id FROM auth_user_groups
			WHERE name = $1
		`, "Users").Scan(&usersGroupID)
		if err != nil {
			log.Printf("\033[31mvirhe: 'users'-ryhmää ei löytynyt: %s\033[0m\n", err.Error())
			http.Error(w, "rekisteröinti epäonnistui (vaihe 3)", http.StatusInternalServerError)
			return
		}

		_, err = backend.Db.Exec(`
			INSERT INTO auth_user_group_memberships (user_id, group_id, created, updated)
			VALUES ($1, $2, NOW(), NOW())
		`, newUserID, usersGroupID)
		if err != nil {
			log.Printf("\033[31mvirhe: ryhmään liittäminen epäonnistui: %s\033[0m\n", err.Error())
			http.Error(w, "rekisteröinti epäonnistui (vaihe 3)", http.StatusInternalServerError)
			return
		}

		log.Println("rekisteröinti onnistui, ohjataan kirjautumissivulle")
		http.Redirect(w, r, "/login", http.StatusSeeOther)
	}
}

// // register.go
// package auth

// import (
// 	backend "easelect/backend/core_components"
// 	"log"
// 	"net/http"
// 	"path/filepath"

// 	"golang.org/x/crypto/bcrypt"
// )

// func RegisterHandler(w http.ResponseWriter, r *http.Request) {
// 	log.Println("registerHandler called")
// 	if r.Method == http.MethodGet {
// 		http.ServeFile(w, r, filepath.Join(frontend_dir, "templates", "register.html"))
// 		return
// 	}

// 	if r.Method == http.MethodPost {
// 		err := r.ParseForm()
// 		if err != nil {
// 			log.Printf("\033[31mvirhe: lomakkeen käsittely epäonnistui: %s\033[0m\n", err.Error())
// 			http.Error(w, "lomakkeen käsittely epäonnistui", http.StatusBadRequest)
// 			return
// 		}
// 		username := r.FormValue("username")
// 		password := r.FormValue("password")
// 		email := r.FormValue("email")
// 		full_name := r.FormValue("full_name")

// 		log.Printf("received registration data: username=%s, email=%s, full_name=%s",
// 			username, email, full_name)

// 		hashed_password, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
// 		if err != nil {
// 			log.Printf("\033[31mvirhe: salasanan hashays epäonnistui: %s\033[0m\n", err.Error())
// 			http.Error(w, "salasanan hashays epäonnistui", http.StatusInternalServerError)
// 			return
// 		}

// 		// 1) Lisätään rivi auth_users-tauluun (pääkäyttäjällä)
// 		var newUserID int
// 		err = backend.Db.QueryRow(`
//             INSERT INTO auth_users (
//                 username,
//                 full_name,
//                 created,
//                 updated,
//                 disabled,
//                 privileged
//             )
//             VALUES ($1, $2, NOW(), NOW(), false, false)
//             RETURNING id
//         `, username, full_name).Scan(&newUserID)
// 		if err != nil {
// 			log.Printf("\033[31mvirhe: käyttäjän lisääminen epäonnistui: %s\033[0m\n", err.Error())
// 			http.Error(w, "rekisteröinti epäonnistui (vaihe 1)", http.StatusInternalServerError)
// 			return
// 		}

// 		// 2) Lisätään salasanatieto restricted.user_data-tauluun (rajatulla yhteydellä)
// 		_, err = backend.DbRestricted.Exec(`
//             INSERT INTO restricted.user_data (id, password, email)
//             VALUES ($1, $2, $3)
//         `, newUserID, string(hashed_password), email)
// 		if err != nil {
// 			// Jos tämä epäonnistuu, meillä on jo rivi auth_users:issa,
// 			// mutta ei vastaavaa restricted.user_data:ssa – tilanne on epäsynkassa.
// 			// Voit halutessasi siivota auth_users-rivin pois tai käsitellä virheen toisin.
// 			log.Printf("\033[31mvirhe: restricted-tauluun lisääminen epäonnistui: %s\033[0m\n", err.Error())
// 			http.Error(w, "rekisteröinti epäonnistui (vaihe 2)", http.StatusInternalServerError)
// 			return
// 		}

// 		log.Println("rekisteröinti onnistui, ohjataan kirjautumissivulle")
// 		http.Redirect(w, r, "/login", http.StatusSeeOther)
// 	}
// }

// // // register.go
// // package auth

// // import (
// // 	backend "easelect/backend/core_components"
// // 	"log"
// // 	"net/http"
// // 	"path/filepath"

// // 	"golang.org/x/crypto/bcrypt"
// // )

// // func RegisterHandler(w http.ResponseWriter, r *http.Request) {
// // 	log.Println("registerHandler called")
// // 	if r.Method == http.MethodGet {
// // 		http.ServeFile(w, r, filepath.Join(frontend_dir, "templates", "register.html"))
// // 		return
// // 	}
// // 	if r.Method == http.MethodPost {
// // 		err := r.ParseForm()
// // 		if err != nil {
// // 			log.Printf("lomakkeen käsittely epäonnistui: %v", err)
// // 			http.Error(w, "lomakkeen käsittely epäonnistui", http.StatusBadRequest)
// // 			return
// // 		}
// // 		username := r.FormValue("username")
// // 		password := r.FormValue("password")
// // 		email := r.FormValue("email")
// // 		full_name := r.FormValue("full_name")

// // 		log.Printf(
// // 			"received registration data: username=%s, email=%s, full_name=%s",
// // 			username,
// // 			email,
// // 			full_name,
// // 		)

// // 		// Hashataan salasana
// // 		hashed_password, err := bcrypt.GenerateFromPassword(
// // 			[]byte(password),
// // 			bcrypt.DefaultCost,
// // 		)
// // 		if err != nil {
// // 			log.Printf("salasanan hashays epäonnistui: %v", err)
// // 			http.Error(w, "salasanan hashays epäonnistui", http.StatusInternalServerError)
// // 			return
// // 		}

// // 		// Tallennetaan käyttäjä tietokantaan
// // 		_, err = backend.Db.Exec(`
// //             INSERT INTO auth_users (
// //                 username,
// //                 password,
// //                 email,
// //                 full_name,
// //                 created,
// //                 updated,
// //                 disabled,
// //                 privileged
// //             )
// //             VALUES ($1, $2, $3, $4, NOW(), NOW(), false, false)
// //         `, username, string(hashed_password), email, full_name)
// // 		if err != nil {
// // 			log.Printf("rekisteröinti epäonnistui: %v", err)
// // 			http.Error(w, "rekisteröinti epäonnistui", http.StatusInternalServerError)
// // 			return
// // 		}

// // 		log.Println("rekisteröinti onnistui, ohjataan kirjautumissivulle")
// // 		http.Redirect(w, r, "/login", http.StatusSeeOther)
// // 	}
// // }
