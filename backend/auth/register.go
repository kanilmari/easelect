// register.go
package auth

import (
	"log"
	"net/http"
	"path/filepath"

	"rapsa/backend"

	"golang.org/x/crypto/bcrypt"
)

func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("registerHandler called")
	if r.Method == http.MethodGet {
		http.ServeFile(w, r, filepath.Join(frontend_dir, "register.html"))
		return
	}
	if r.Method == http.MethodPost {
		err := r.ParseForm()
		if err != nil {
			log.Printf("lomakkeen käsittely epäonnistui: %v", err)
			http.Error(w, "lomakkeen käsittely epäonnistui", http.StatusBadRequest)
			return
		}
		username := r.FormValue("username")
		password := r.FormValue("password")
		email := r.FormValue("email")
		full_name := r.FormValue("full_name")

		log.Printf(
			"received registration data: username=%s, email=%s, full_name=%s",
			username,
			email,
			full_name,
		)

		// Hashataan salasana
		hashed_password, err := bcrypt.GenerateFromPassword(
			[]byte(password),
			bcrypt.DefaultCost,
		)
		if err != nil {
			log.Printf("salasanan hashays epäonnistui: %v", err)
			http.Error(w, "salasanan hashays epäonnistui", http.StatusInternalServerError)
			return
		}

		// Tallennetaan käyttäjä tietokantaan
		_, err = backend.Db.Exec(`
            INSERT INTO auth_users (
                username, 
                password, 
                email, 
                full_name, 
                created, 
                updated, 
                disabled, 
                privileged
            )
            VALUES ($1, $2, $3, $4, NOW(), NOW(), false, false)
        `, username, string(hashed_password), email, full_name)
		if err != nil {
			log.Printf("rekisteröinti epäonnistui: %v", err)
			http.Error(w, "rekisteröinti epäonnistui", http.StatusInternalServerError)
			return
		}

		log.Println("rekisteröinti onnistui, ohjataan kirjautumissivulle")
		http.Redirect(w, r, "/login", http.StatusSeeOther)
	}
}
