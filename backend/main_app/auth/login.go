// login.go
package auth

import (
	"database/sql"
	backend "easelect/backend/main_app"
	"html/template"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/sessions"
	"golang.org/x/crypto/bcrypt"
)

// Alustetaan muuttujat, joihin tallennetaan session ja polku frontendiin
var (
	store        *sessions.CookieStore
	frontend_dir string
)

// InitAuth kutsutaan main.go:ssa, jossa välitetään CookieStore ja polku
// esim. "C:\\GitHub\\easelect\\frontend" Windowsissa.
func InitAuth(session_store *sessions.CookieStore, fe_dir string) {
	store = session_store
	frontend_dir = fe_dir
}

// LoginHandler käsittelee /login GET- ja POST-pyynnöt
func LoginHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// Jos käyttäjä on jo kirjautunut, uudelleenohjaus etusivulle
		session, _ := store.Get(r, "session")
		if session != nil && session.Values["user_id"] != nil {
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		// Muutoin näytetään login-sivu templaattina
		showLoginForm(w, r, "")

	case http.MethodPost:
		// Käsitellään lomake (username+password)
		handleLoginPost(w, r)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// showLoginForm hakee templaten ja renderöi sen
// errorMsg voidaan välittää virheilmoitukseksi (väärä tunnus tms.)
func showLoginForm(w http.ResponseWriter, r *http.Request, errorMsg string) {
	_ = r
	templatePath := filepath.Join(frontend_dir, "templates", "login.html")

	tmpl, err := template.ParseFiles(templatePath)
	if err != nil {
		log.Printf("Virhe login-templaatin latauksessa: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Data, jota voidaan näyttää templatessa (esim. virheilmoitus)
	data := struct {
		ErrorMsg string
	}{
		ErrorMsg: errorMsg,
	}

	err = tmpl.Execute(w, data)
	if err != nil {
		log.Printf("Virhe login-templaatin suorittamisessa: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}

// handleLoginPost käsittelee POST-lomakkeen: tarkistaa tunnuksen+salasanan, luo session, ohjaa etusivulle
func handleLoginPost(w http.ResponseWriter, r *http.Request) {
	err := r.ParseForm()
	if err != nil {
		log.Printf("\033[31mvirhe: lomakkeen parsinta epäonnistui: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Virhe lomakkeen käsittelyssä.")
		return
	}

	username := r.FormValue("username")
	password := r.FormValue("password")

	var userID int
	var hashedPassword string
	err = backend.Db.QueryRow(`
        SELECT id, password
        FROM auth_users
        WHERE username = $1
          AND disabled = false
        `, username).Scan(&userID, &hashedPassword)

	if err == sql.ErrNoRows {
		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
		return
	} else if err != nil {
		log.Printf("\033[31mvirhe: db virhe käyttäjän haussa: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Tapahtui virhe. Yritä uudelleen.")
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
	if err != nil {
		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
		return
	}

	session, err := store.Get(r, "session")
	if err != nil {
		log.Printf("\033[31mvirhe: session get epäonnistui: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Istuntovirhe. Yritä uudelleen.")
		return
	}

	session.Values["authenticated"] = true
	session.Values["user_id"] = userID

	// device_id-käsittely
	deviceCookie, err := r.Cookie("device_id")
	var deviceID string
	if err != nil || deviceCookie.Value == "" {
		deviceID = uuid.NewString()
	} else {
		deviceID = deviceCookie.Value
	}
	session.Values["device_id"] = deviceID

	// *** Luetaan fingerprint-lomakeparametri ***
	fingerprint := r.FormValue("fingerprint")
	if fingerprint != "" {
		log.Printf("lomakkeen fingerprint: %s", fingerprint)

		session.Values["fingerprint_hash"] = fingerprint

		// Tallennetaan sama arvo evästeeseen
		http.SetCookie(w, &http.Cookie{
			Name:     "fingerprint",
			Value:    fingerprint,
			Path:     "/",
			HttpOnly: false,
			Expires:  time.Now().Add(7 * 24 * time.Hour),
		})
	} else {
		log.Println("käyttäjä ei lähettänyt fingerprint-arvoa. ei tallenneta sormenjälkeä sessioon.")
	}

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

// LogoutHandler poistaa session ja device_id-evästeen
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

	// Poistetaan device_id-eväste (MaxAge = -1)
	http.SetCookie(w, &http.Cookie{
		Name:   "device_id",
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})

	http.Redirect(w, r, "/login", http.StatusSeeOther)
}

// saveSession tallentaa session
// isRequestSecure tarkistaa, onko HTTPS tai X-Forwarded-Proto = https
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

// // login.go
// package auth

// import (
// 	"log"
// 	"net/http"
// 	"path/filepath"
// 	"time"

// 	"github.com/google/uuid" // go get github.com/google/uuid
// 	"golang.org/x/crypto/bcrypt"

// 	"easelect/backend/main_app"

// 	"github.com/gorilla/sessions"
// )

// var store *sessions.CookieStore
// var frontend_dir string

// func InitAuth(
// 	session_store *sessions.CookieStore,
// 	fe_dir string,
// ) {
// 	store = session_store
// 	frontend_dir = fe_dir
// }

// func LoginHandler(w http.ResponseWriter, r *http.Request) {
// 	log.Println("loginHandler called")

// 	session, err := store.Get(r, "session")
// 	if err != nil {
// 		log.Printf("session haku epäonnistui: %v", err)
// 		// näytetään silti login-sivu (tai ohjataan virheen mukaan)
// 	}

// 	// Jos GET-pyyntö ja käyttäjä on jo kirjautunut -> ohjaa etusivulle
// 	if r.Method == http.MethodGet {
// 		if session != nil && session.Values["user_id"] != nil {
// 			http.Redirect(w, r, "/", http.StatusSeeOther)
// 			return
// 		}
// 		// muutoin palvellaan login-sivu
// 		http.ServeFile(w, r, filepath.Join(frontend_dir, "login.html"))
// 		return
// 	}

// 	if r.Method == http.MethodPost {
// 		err := r.ParseForm()
// 		if err != nil {
// 			log.Printf("lomakkeen käsittely epäonnistui: %v", err)
// 			http.Error(w, "lomakkeen käsittely epäonnistui", http.StatusBadRequest)
// 			return
// 		}

// 		username := r.FormValue("username")
// 		password := r.FormValue("password")

// 		log.Printf("received login data: username=%s", username)

// 		// Haetaan käyttäjä tietokannasta
// 		var user_id int
// 		var hashed_password string
// 		err = backend.Db.QueryRow(`
//             SELECT id, password
//             FROM auth_users
//             WHERE username = $1 AND disabled = false
//         `, username).Scan(&user_id, &hashed_password)
// 		if err != nil {
// 			log.Printf("käyttäjän haku epäonnistui: %v", err)
// 			http.Error(w, "virheellinen käyttäjätunnus tai salasana", http.StatusUnauthorized)
// 			return
// 		}

// 		// Tarkastetaan salasana (bcrypt-vertailu)
// 		err = bcrypt.CompareHashAndPassword([]byte(hashed_password), []byte(password))
// 		if err != nil {
// 			log.Printf("salasanan vertailu epäonnistui: %v", err)
// 			http.Error(w, "virheellinen käyttäjätunnus tai salasana", http.StatusUnauthorized)
// 			return
// 		}

// 		// Kirjautuminen onnistui, ladataan (tai luodaan) sessio uudestaan
// 		session, err := store.Get(r, "session")
// 		if err != nil {
// 			log.Printf("session luonti epäonnistui: %v", err)
// 			http.Error(w, "session luonti epäonnistui", http.StatusInternalServerError)
// 			return
// 		}
// 		session.Values["authenticated"] = true
// 		session.Values["user_id"] = user_id

// 		// Tarkistetaan, onko meillä jo device_id-evästettä
// 		deviceCookie, err := r.Cookie("device_id")
// 		var device_id string
// 		if err != nil || deviceCookie.Value == "" {
// 			// Luodaan uusi
// 			device_id = uuid.NewString()
// 		} else {
// 			// Käytetään olemassa olevaa
// 			device_id = deviceCookie.Value
// 		}

// 		// Tallennetaan device_id myös sessioniin
// 		session.Values["device_id"] = device_id

// 		// Asetetaan device_id-eväste
// 		http.SetCookie(w, &http.Cookie{
// 			Name:     "device_id",
// 			Value:    device_id,
// 			Path:     "/",
// 			HttpOnly: false, // Jos haluat lukea sen myös JS:llä
// 			Expires:  time.Now().Add(7 * 24 * time.Hour),
// 			// Secure:   true,  // vain HTTPS:lle
// 			// SameSite: http.SameSiteLaxMode,
// 		})

// 		// Tallennetaan sessio
// 		err = saveSession(w, r, session)
// 		if err != nil {
// 			log.Printf("session tallennus epäonnistui: %v", err)
// 			http.Error(w, "session tallennus epäonnistui", http.StatusInternalServerError)
// 			return
// 		}
// 		log.Println("kirjautuminen onnistui, ohjataan etusivulle")

// 		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
// 	}
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
// 	session.Options.MaxAge = -1 // Poistetaan sessioeväste

// 	err = saveSession(w, r, session)
// 	if err != nil {
// 		log.Printf("session tallennus epäonnistui: %v", err)
// 		http.Error(w, "session tallennus epäonnistui", http.StatusInternalServerError)
// 		return
// 	}

// 	// Poistetaan device_id-eväste asettamalla MaxAge = -1
// 	http.SetCookie(w, &http.Cookie{
// 		Name:   "device_id",
// 		Value:  "",
// 		Path:   "/",
// 		MaxAge: -1,
// 	})

// 	http.Redirect(w, r, "/login", http.StatusSeeOther)
// }

// // Sama saveSession kuin ennen
// func saveSession(
// 	w http.ResponseWriter,
// 	r *http.Request,
// 	session *sessions.Session,
// ) error {
// 	opts := *session.Options
// 	session.Options.Secure = isRequestSecure(r)
// 	err := session.Save(r, w)
// 	session.Options = &opts
// 	return err
// }

// func isRequestSecure(r *http.Request) bool {
// 	if r.TLS != nil {
// 		return true
// 	}
// 	if proto := r.Header.Get("X-Forwarded-Proto"); proto == "https" {
// 		return true
// 	}
// 	return false
// }
