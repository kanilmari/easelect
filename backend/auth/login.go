// login.go
package auth

import (
	"log"
	"net/http"
	"path/filepath"

	"easelect/backend"

	"github.com/gorilla/sessions"
	"golang.org/x/crypto/bcrypt"
)

// Huom: store ja frontend_dir on package-level -muuttujia auth-paketissa.
var store *sessions.CookieStore
var frontend_dir string

// InitAuth alustaa paketin laajuudella käytettävät muuttujat.
// Tämän kutsut "main.go":sta ennen reittien rekisteröintiä.
func InitAuth(
	session_store *sessions.CookieStore,
	fe_dir string,
) {
	store = session_store
	frontend_dir = fe_dir
}

// LoginHandler käsittelee /login-pyynnöt
func LoginHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("loginHandler called")
	// log.Println("frontend_dir:", frontend_dir) // Tarkistetaan, että se ei ole tyhjä

	if r.Method == http.MethodGet {
		// Palvellaan login.html
		http.ServeFile(w, r, filepath.Join(frontend_dir, "login.html"))
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

		log.Printf("received login data: username=%s", username)

		// Haetaan käyttäjä tietokannasta
		var user_id int
		var hashed_password string
		err = backend.Db.QueryRow(`
            SELECT id, password 
            FROM auth_users 
            WHERE username = $1 AND disabled = false
        `, username).Scan(&user_id, &hashed_password)
		if err != nil {
			log.Printf("käyttäjän haku epäonnistui: %v", err)
			http.Error(w, "virheellinen käyttäjätunnus tai salasana", http.StatusUnauthorized)
			return
		}

		// Tarkastetaan salasana (bcrypt-vertailu)
		err = bcrypt.CompareHashAndPassword([]byte(hashed_password), []byte(password))
		if err != nil {
			log.Printf("salasanan vertailu epäonnistui: %v", err)
			http.Error(w, "virheellinen käyttäjätunnus tai salasana", http.StatusUnauthorized)
			return
		}

		// Kirjautuminen onnistui, luodaan sessio
		session, err := store.Get(r, "session")
		if err != nil {
			log.Printf("session luonti epäonnistui: %v", err)
			http.Error(w, "session luonti epäonnistui", http.StatusInternalServerError)
			return
		}
		session.Values["authenticated"] = true
		session.Values["user_id"] = user_id

		// Tallennetaan sessio
		err = saveSession(w, r, session)
		if err != nil {
			log.Printf("session tallennus epäonnistui: %v", err)
			http.Error(w, "session tallennus epäonnistui", http.StatusInternalServerError)
			return
		}
		log.Println("kirjautuminen onnistui, ohjataan etusivulle")

		// Esimerkissä ohjataan index.html:ään
		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
	}
}

// LogoutHandler käsittelee /logout-pyynnöt
func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("logoutHandler called")
	session, err := store.Get(r, "session")
	if err != nil {
		log.Printf("session haku epäonnistui: %v", err)
		http.Error(w, "session haku epäonnistui", http.StatusInternalServerError)
		return
	}
	session.Values["authenticated"] = false
	session.Options.MaxAge = -1 // Poistetaan sessioeväste

	err = saveSession(w, r, session)
	if err != nil {
		log.Printf("session tallennus epäonnistui: %v", err)
		http.Error(w, "session tallennus epäonnistui", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/login", http.StatusSeeOther)
}

// saveSession voi olla myös auth-paketin sisäinen apufunktio
func saveSession(
	w http.ResponseWriter,
	r *http.Request,
	session *sessions.Session,
) error {
	opts := *session.Options
	session.Options.Secure = isRequestSecure(r) // Halutessasi turvattuun yhteyteen
	err := session.Save(r, w)
	session.Options = &opts
	return err
}

// isRequestSecure tarkistaa onko TLS tai X-Forwarded-Proto: https
func isRequestSecure(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	if proto := r.Header.Get("X-Forwarded-Proto"); proto == "https" {
		return true
	}
	return false
}
