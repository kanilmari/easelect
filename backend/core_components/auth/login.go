// login.go
package auth

import (
	"database/sql"
	backend "easelect/backend/core_components"
	"easelect/backend/core_components/middlewares"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/sessions"
	"golang.org/x/crypto/bcrypt"
)

var (
	store        *sessions.CookieStore
	frontend_dir string
)

func InitAuth(session_store *sessions.CookieStore, fe_dir string) {
	store = session_store
	frontend_dir = fe_dir
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		session, _ := store.Get(r, "session")
		if session != nil && session.Values["user_id"] != nil {
			// Jos user_id on jokin muu kuin 1, ohjataan etusivulle
			if uid, ok := session.Values["user_id"].(int); ok && uid != 1 {
				http.Redirect(w, r, "/", http.StatusSeeOther)
				return
			}
		}
		showLoginForm(w, r, "")

	case http.MethodPost:
		handleLoginPost(w, r)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func showLoginForm(w http.ResponseWriter, r *http.Request, errorMsg string) {
	session, err := store.Get(r, "session")
	if err != nil {
		log.Printf("\033[31mvirhe: session haku epäonnistui: %s\033[0m\n", err.Error())
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// CSRF-token
	csrfToken, ok := session.Values["csrf_token"].(string)
	if !ok || csrfToken == "" {
		csrfToken = uuid.NewString()
		session.Values["csrf_token"] = csrfToken

		err = saveSession(w, r, session)
		if err != nil {
			log.Printf("\033[31mvirhe: session tallennus epäonnistui csrf-tokenin luomisen jälkeen: %s\033[0m\n", err.Error())
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	templatePath := filepath.Join(frontend_dir, "templates", "login.html")

	tmpl, err := template.ParseFiles(templatePath)
	if err != nil {
		log.Printf("\033[31mvirhe: login-templaatin lataus epäonnistui: %s\033[0m\n", err.Error())
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	data := struct {
		ErrorMsg  string
		CSRFToken string
	}{
		ErrorMsg:  errorMsg,
		CSRFToken: csrfToken,
	}

	err = tmpl.Execute(w, data)
	if err != nil {
		log.Printf("\033[31mvirhe: login-templaatin suorittaminen epäonnistui: %s\033[0m\n", err.Error())
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

// Käsitellään POST-lähetys. Lisätty CSRF-tarkistus.
func handleLoginPost(w http.ResponseWriter, r *http.Request) {
	err := r.ParseForm()
	if err != nil {
		log.Printf("\033[31mvirhe: lomakkeen parsinta epäonnistui: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Virhe lomakkeen käsittelyssä.")
		return
	}

	// --- CSRF-tarkistus ---
	session, err := store.Get(r, "session")
	if err != nil {
		log.Printf("\033[31mvirhe: session get epäonnistui: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Istuntovirhe. Yritä uudelleen.")
		return
	}
	postedToken := r.FormValue("csrf_token")
	sessionToken, _ := session.Values["csrf_token"].(string)
	if postedToken == "" || sessionToken == "" || postedToken != sessionToken {
		showLoginForm(w, r, "Virheellinen CSRF-token. Yritä uudelleen.")
		return
	}

	// --- Käyttäjätunnus & salasana ---
	username := r.FormValue("username")
	password := r.FormValue("password")

	var userID int
	err = backend.Db.QueryRow(`
        SELECT id
          FROM auth_users
         WHERE username = $1
           AND disabled = false
    `, username).Scan(&userID)

	if err == sql.ErrNoRows {
		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
		return
	} else if err != nil {
		log.Printf("\033[31mvirhe: db virhe käyttäjän haussa: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Tapahtui virhe. Yritä uudelleen.")
		return
	}

	var hashedPassword string
	err = backend.DbConfidential.QueryRow(`
        SELECT password
          FROM restricted.user_data
         WHERE id = $1
    `, userID).Scan(&hashedPassword)
	if err == sql.ErrNoRows {
		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
		return
	} else if err != nil {
		log.Printf("\033[31mvirhe: rajatun db:n virhe salasanan haussa: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Tapahtui virhe. Yritä uudelleen.")
		return
	}

	// Bcrypt-tarkistus
	err = bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
	if err != nil {
		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
		return
	}

	// Tästä eteenpäin kirjautuminen onnistui.
	session.Values["authenticated"] = true
	session.Values["user_id"] = userID

	// Uusi rivi: tallennetaan myös käyttäjänimi sessioon
	session.Values["username"] = username

	// device_id-käsittely
	deviceCookie, err := r.Cookie("device_id")
	var deviceID string
	if err != nil || deviceCookie.Value == "" {
		deviceID = uuid.NewString()
	} else {
		deviceID = deviceCookie.Value
	}
	session.Values["device_id"] = deviceID

	// Sormenjälki (fingerprint) on pakollinen
	fingerprint := r.FormValue("fingerprint")
	if fingerprint == "" {
		log.Println("käyttäjä ei lähettänyt fingerprint-arvoa. lopetetaan kirjautuminen.")
		showLoginForm(w, r, "Kirjautuminen vaatii sormenjäljen.")
		return
	}
	log.Printf("lomakkeen fingerprint: %s", fingerprint)
	session.Values["fingerprint_hash"] = fingerprint

	http.SetCookie(w, &http.Cookie{
		Name:     "fingerprint",
		Value:    fingerprint,
		Path:     "/",
		HttpOnly: false,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
	})

	http.SetCookie(w, &http.Cookie{
		Name:     "device_id",
		Value:    deviceID,
		Path:     "/",
		HttpOnly: false,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
	})

	err = saveSession(w, r, session)
	if err != nil {
		log.Printf("\033[31mvirhe: session tallennus epäonnistui: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Istuntovirhe. Yritä uudelleen.")
		return
	}

	log.Printf("käyttäjä '%s' (id=%d) kirjautui sisään onnistuneesti", username, userID)
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("logoutHandler called")

	session, err := store.Get(r, "session")
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "session haku epäonnistui", http.StatusInternalServerError)
		return
	}

	// 1) Mitätöidään session
	session.Options.MaxAge = -1 // Vanhentaa evästeen ja tuhoaa session
	err = saveSession(w, r, session)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "session tallennus epäonnistui", http.StatusInternalServerError)
		return
	}

	// 2) Poistetaan device_id -eväste
	http.SetCookie(w, &http.Cookie{
		Name:   "device_id",
		Value:  "",
		Path:   "/",
		MaxAge: -1, // poistaminen
	})

	// 3) Poistetaan fingerprint-eväste
	http.SetCookie(w, &http.Cookie{
		Name:   "fingerprint",
		Value:  "",
		Path:   "/",
		MaxAge: -1, // poistaminen
	})

	// 4) Tarkistetaan loginToBrowse
	loginToBrowse, confErr := middlewares.CheckLoginToBrowse()
	if confErr != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", confErr.Error())
		loginToBrowse = true
	}

	// 5) Ohjataan sivulle
	if loginToBrowse {
		// Jos login to browse on pakollinen, ohjataan aina /login
		http.Redirect(w, r, "/login", http.StatusSeeOther)
	} else {
		// Muuten voi siirtyä takaisin etusivulle (root)
		http.Redirect(w, r, "/", http.StatusSeeOther)
	}
}

// func LogoutHandler(w http.ResponseWriter, r *http.Request) {
// 	log.Println("logoutHandler called")

// 	session, err := store.Get(r, "session")
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "session haku epäonnistui", http.StatusInternalServerError)
// 		return
// 	}

// 	// Tyhjennetään istunnosta tärkeät tiedot
// 	session.Values["authenticated"] = false
// 	session.Values["user_id"] = 1
// 	session.Values["user_role"] = "guest"
// 	session.Values["username"] = "guest"

// 	// // poistetaan myös username
// 	// delete(session.Values, "username")

// 	err = saveSession(w, r, session)
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "session tallennus epäonnistui", http.StatusInternalServerError)
// 		return
// 	}

// 	loginToBrowse, confErr := middlewares.CheckLoginToBrowse()
// 	if confErr != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", confErr.Error())
// 		loginToBrowse = true
// 	}

// 	if loginToBrowse {
// 		http.SetCookie(w, &http.Cookie{
// 			Name:   "device_id",
// 			Value:  "",
// 			Path:   "/",
// 			MaxAge: -1,
// 		})
// 		http.Redirect(w, r, "/login", http.StatusSeeOther)
// 	} else {
// 		http.Redirect(w, r, "/", http.StatusSeeOther)
// 	}
// }

// func LogoutHandler(w http.ResponseWriter, r *http.Request) {
// 	log.Println("logoutHandler called")
// 	session, err := store.Get(r, "session")
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: session haku epäonnistui: %s\033[0m\n", err.Error())
// 		http.Error(w, "session haku epäonnistui", http.StatusInternalServerError)
// 		return
// 	}

// 	// Asetetaan sessio 'guest'-tilaan
// 	session.Values["authenticated"] = false
// 	session.Values["user_id"] = 1
// 	session.Values["user_role"] = "guest"

// 	// Jos haluat poistaa device_id:n, pyyhit sen halutessasi näin:
// 	// session.Values["device_id"] = ""

// 	err = saveSession(w, r, session)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: session tallennus epäonnistui: %s\033[0m\n", err.Error())
// 		http.Error(w, "session tallennus epäonnistui", http.StatusInternalServerError)
// 		return
// 	}

// 	// Tarvittaessa tyhjennä device_id-cookien selainpuolelta
// 	http.SetCookie(w, &http.Cookie{
// 		Name:   "device_id",
// 		Value:  "",
// 		Path:   "/",
// 		MaxAge: -1,
// 	})

// 	http.Redirect(w, r, "/login", http.StatusSeeOther)
// }

// func LogoutHandler(w http.ResponseWriter, r *http.Request) {
// 	log.Println("logoutHandler called")
// 	session, err := store.Get(r, "session")
// 	if err != nil {
// 		log.Printf("session haku epäonnistui: %v", err)
// 		http.Error(w, "session haku epäonnistui", http.StatusInternalServerError)
// 		return
// 	}
// 	session.Values["authenticated"] = false
// 	session.Options.MaxAge = -1

// 	err = saveSession(w, r, session)
// 	if err != nil {
// 		log.Printf("session tallennus epäonnistui: %v", err)
// 		http.Error(w, "session tallennus epäonnistui", http.StatusInternalServerError)
// 		return
// 	}

// 	http.SetCookie(w, &http.Cookie{
// 		Name:   "device_id",
// 		Value:  "",
// 		Path:   "/",
// 		MaxAge: -1,
// 	})

// 	http.Redirect(w, r, "/login", http.StatusSeeOther)
// }

func saveSession(w http.ResponseWriter, r *http.Request, session *sessions.Session) error {
	opts := *session.Options
	session.Options.Secure = isRequestSecure(r)
	err := session.Save(r, w)
	session.Options = &opts
	return err
}

func isRequestSecure(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	if proto := r.Header.Get("X-Forwarded-Proto"); proto == "https" {
		return true
	}
	return false
}
