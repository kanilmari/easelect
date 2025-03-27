// login.go
package auth

import (
	"database/sql"
	backend "easelect/backend/core_components"
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
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
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

	// CSRF-token haetaan sessiosta tai luodaan, jos puuttuu
	csrfToken, ok := session.Values["csrf_token"].(string)
	if !ok || csrfToken == "" {
		csrfToken = uuid.NewString()
		session.Values["csrf_token"] = csrfToken

		// Tallennetaan session uudet arvot
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
	err = backend.DbRestricted.QueryRow(`
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

// func handleLoginPost(w http.ResponseWriter, r *http.Request) {
// 	err := r.ParseForm()
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: lomakkeen parsinta epäonnistui: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Virhe lomakkeen käsittelyssä.")
// 		return
// 	}

// 	username := r.FormValue("username")
// 	password := r.FormValue("password")

// 	// 1) Haetaan userID public.auth_users -taulusta
// 	var userID int
// 	err = backend.Db.QueryRow(`
//         SELECT id
//           FROM auth_users
//          WHERE username = $1
//            AND disabled = false
//     `, username).Scan(&userID)

// 	if err == sql.ErrNoRows {
// 		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
// 		return
// 	} else if err != nil {
// 		log.Printf("\033[31mvirhe: db virhe käyttäjän haussa: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Tapahtui virhe. Yritä uudelleen.")
// 		return
// 	}

// 	// 2) Haetaan hashattu salasana restricted.user_data -taulusta
// 	var hashedPassword string
// 	err = backend.DbRestricted.QueryRow(`
//         SELECT password
//           FROM restricted.user_data
//          WHERE id = $1
//     `, userID).Scan(&hashedPassword)

// 	if err == sql.ErrNoRows {
// 		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
// 		return
// 	} else if err != nil {
// 		log.Printf("\033[31mvirhe: rajatun db:n virhe salasanan haussa: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Tapahtui virhe. Yritä uudelleen.")
// 		return
// 	}

// 	// 3) Verrataan annettua salasanaa tallennettuun bcrypt-hashiin
// 	err = bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
// 	if err != nil {
// 		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
// 		return
// 	}

// 	// 4) Luodaan session ja asetetaan evästeet
// 	session, err := store.Get(r, "session")
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: session get epäonnistui: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Istuntovirhe. Yritä uudelleen.")
// 		return
// 	}
// 	session.Values["authenticated"] = true
// 	session.Values["user_id"] = userID

// 	// device_id-käsittely
// 	deviceCookie, err := r.Cookie("device_id")
// 	var deviceID string
// 	if err != nil || deviceCookie.Value == "" {
// 		deviceID = uuid.NewString()
// 	} else {
// 		deviceID = deviceCookie.Value
// 	}
// 	session.Values["device_id"] = deviceID

// 	// Sormenjälki (fingerprint) on nyt pakollinen
// 	fingerprint := r.FormValue("fingerprint")
// 	if fingerprint == "" {
// 		log.Println("käyttäjä ei lähettänyt fingerprint-arvoa. lopetetaan kirjautuminen.")
// 		showLoginForm(w, r, "Kirjautuminen vaatii sormenjäljen.")
// 		return
// 	}

// 	log.Printf("lomakkeen fingerprint: %s", fingerprint)
// 	session.Values["fingerprint_hash"] = fingerprint

// 	http.SetCookie(w, &http.Cookie{
// 		Name:     "fingerprint",
// 		Value:    fingerprint,
// 		Path:     "/",
// 		HttpOnly: false,
// 		Expires:  time.Now().Add(7 * 24 * time.Hour),
// 	})

// 	http.SetCookie(w, &http.Cookie{
// 		Name:     "device_id",
// 		Value:    deviceID,
// 		Path:     "/",
// 		HttpOnly: false,
// 		Expires:  time.Now().Add(7 * 24 * time.Hour),
// 	})

// 	err = saveSession(w, r, session)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: session tallennus epäonnistui: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Istuntovirhe. Yritä uudelleen.")
// 		return
// 	}

// 	log.Printf("käyttäjä '%s' (id=%d) kirjautui sisään onnistuneesti", username, userID)
// 	http.Redirect(w, r, "/", http.StatusSeeOther)
// }

// func handleLoginPost(w http.ResponseWriter, r *http.Request) {
// 	err := r.ParseForm()
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: lomakkeen parsinta epäonnistui: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Virhe lomakkeen käsittelyssä.")
// 		return
// 	}

// 	username := r.FormValue("username")
// 	password := r.FormValue("password")

// 	// 1) Haetaan userID public.auth_users -taulusta
// 	var userID int
// 	err = backend.Db.QueryRow(`
//         SELECT id
//           FROM auth_users
//          WHERE username = $1
//            AND disabled = false
//     `, username).Scan(&userID)

// 	if err == sql.ErrNoRows {
// 		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
// 		return
// 	} else if err != nil {
// 		log.Printf("\033[31mvirhe: db virhe käyttäjän haussa: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Tapahtui virhe. Yritä uudelleen.")
// 		return
// 	}

// 	// 2) Haetaan hashattu salasana restricted.user_data -taulusta
// 	var hashedPassword string
// 	err = backend.DbRestricted.QueryRow(`
//         SELECT password
//           FROM restricted.user_data
//          WHERE id = $1
//     `, userID).Scan(&hashedPassword)

// 	if err == sql.ErrNoRows {
// 		// Käyttäjällä ei ole merkintää restricted-taulussa?
// 		// Ilmoitetaan vain "väärä salasana", jotta ei paljasteta liikaa
// 		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
// 		return
// 	} else if err != nil {
// 		log.Printf("\033[31mvirhe: rajatun db:n virhe salasanan haussa: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Tapahtui virhe. Yritä uudelleen.")
// 		return
// 	}

// 	// 3) Verrataan annettua salasanaa tallennettuun bcrypt-hashiin
// 	err = bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
// 	if err != nil {
// 		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
// 		return
// 	}

// 	// 4) Luodaan session ja asetetaan evästeet
// 	session, err := store.Get(r, "session")
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: session get epäonnistui: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Istuntovirhe. Yritä uudelleen.")
// 		return
// 	}
// 	session.Values["authenticated"] = true
// 	session.Values["user_id"] = userID

// 	// device_id-käsittely
// 	deviceCookie, err := r.Cookie("device_id")
// 	var deviceID string
// 	if err != nil || deviceCookie.Value == "" {
// 		deviceID = uuid.NewString()
// 	} else {
// 		deviceID = deviceCookie.Value
// 	}
// 	session.Values["device_id"] = deviceID

// 	// Sormenjälki (fingerprint)
// 	fingerprint := r.FormValue("fingerprint")
// 	if fingerprint != "" {
// 		log.Printf("lomakkeen fingerprint: %s", fingerprint)
// 		session.Values["fingerprint_hash"] = fingerprint

// 		http.SetCookie(w, &http.Cookie{
// 			Name:     "fingerprint",
// 			Value:    fingerprint,
// 			Path:     "/",
// 			HttpOnly: false,
// 			Expires:  time.Now().Add(7 * 24 * time.Hour),
// 		})
// 	} else {
// 		log.Println("käyttäjä ei lähettänyt fingerprint-arvoa. ei tallenneta sormenjälkeä sessioon.")
// 	}

// 	http.SetCookie(w, &http.Cookie{
// 		Name:     "device_id",
// 		Value:    deviceID,
// 		Path:     "/",
// 		HttpOnly: false,
// 		Expires:  time.Now().Add(7 * 24 * time.Hour),
// 	})

// 	err = saveSession(w, r, session)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: session tallennus epäonnistui: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Istuntovirhe. Yritä uudelleen.")
// 		return
// 	}

// 	log.Printf("käyttäjä '%s' (id=%d) kirjautui sisään onnistuneesti", username, userID)
// 	http.Redirect(w, r, "/", http.StatusSeeOther)
// }

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("logoutHandler called")
	session, err := store.Get(r, "session")
	if err != nil {
		log.Printf("session haku epäonnistui: %v", err)
		http.Error(w, "session haku epäonnistui", http.StatusInternalServerError)
		return
	}
	session.Values["authenticated"] = false
	session.Options.MaxAge = -1

	err = saveSession(w, r, session)
	if err != nil {
		log.Printf("session tallennus epäonnistui: %v", err)
		http.Error(w, "session tallennus epäonnistui", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:   "device_id",
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})

	http.Redirect(w, r, "/login", http.StatusSeeOther)
}

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
// 	"database/sql"
// 	backend "easelect/backend/core_components"
// 	"html/template"
// 	"log"
// 	"net/http"
// 	"path/filepath"
// 	"time"

// 	"github.com/google/uuid"
// 	"github.com/gorilla/sessions"
// 	"golang.org/x/crypto/bcrypt"
// )

// // Alustetaan muuttujat, joihin tallennetaan session ja polku frontendiin
// var (
// 	store        *sessions.CookieStore
// 	frontend_dir string
// )

// // InitAuth kutsutaan main.go:ssa, jossa välitetään CookieStore ja polku
// // esim. "C:\\GitHub\\easelect\\frontend" Windowsissa.
// func InitAuth(session_store *sessions.CookieStore, fe_dir string) {
// 	store = session_store
// 	frontend_dir = fe_dir
// }

// // LoginHandler käsittelee /login GET- ja POST-pyynnöt
// func LoginHandler(w http.ResponseWriter, r *http.Request) {
// 	switch r.Method {
// 	case http.MethodGet:
// 		// Jos käyttäjä on jo kirjautunut, uudelleenohjaus etusivulle
// 		session, _ := store.Get(r, "session")
// 		if session != nil && session.Values["user_id"] != nil {
// 			http.Redirect(w, r, "/", http.StatusSeeOther)
// 			return
// 		}
// 		// Muutoin näytetään login-sivu templaattina
// 		showLoginForm(w, r, "")

// 	case http.MethodPost:
// 		// Käsitellään lomake (username+password)
// 		handleLoginPost(w, r)

// 	default:
// 		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
// 	}
// }

// // showLoginForm hakee templaten ja renderöi sen
// // errorMsg voidaan välittää virheilmoitukseksi (väärä tunnus tms.)
// func showLoginForm(w http.ResponseWriter, r *http.Request, errorMsg string) {
// 	_ = r
// 	templatePath := filepath.Join(frontend_dir, "templates", "login.html")

// 	tmpl, err := template.ParseFiles(templatePath)
// 	if err != nil {
// 		log.Printf("Virhe login-templaatin latauksessa: %v", err)
// 		http.Error(w, "Internal server error", http.StatusInternalServerError)
// 		return
// 	}

// 	// Data, jota voidaan näyttää templatessa (esim. virheilmoitus)
// 	data := struct {
// 		ErrorMsg string
// 	}{
// 		ErrorMsg: errorMsg,
// 	}

// 	err = tmpl.Execute(w, data)
// 	if err != nil {
// 		log.Printf("Virhe login-templaatin suorittamisessa: %v", err)
// 		http.Error(w, "Internal server error", http.StatusInternalServerError)
// 		return
// 	}
// }

// // handleLoginPost käsittelee POST-lomakkeen: tarkistaa tunnuksen+salasanan, luo session, ohjaa etusivulle
// func handleLoginPost(w http.ResponseWriter, r *http.Request) {
// 	err := r.ParseForm()
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: lomakkeen parsinta epäonnistui: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Virhe lomakkeen käsittelyssä.")
// 		return
// 	}

// 	username := r.FormValue("username")
// 	password := r.FormValue("password")

// 	var userID int
// 	var hashedPassword string
// 	err = backend.Db.QueryRow(`
//         SELECT id, password
//         FROM auth_users
//         WHERE username = $1
//           AND disabled = false
//         `, username).Scan(&userID, &hashedPassword)

// 	if err == sql.ErrNoRows {
// 		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
// 		return
// 	} else if err != nil {
// 		log.Printf("\033[31mvirhe: db virhe käyttäjän haussa: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Tapahtui virhe. Yritä uudelleen.")
// 		return
// 	}

// 	err = bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
// 	if err != nil {
// 		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
// 		return
// 	}

// 	session, err := store.Get(r, "session")
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: session get epäonnistui: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Istuntovirhe. Yritä uudelleen.")
// 		return
// 	}

// 	session.Values["authenticated"] = true
// 	session.Values["user_id"] = userID

// 	// device_id-käsittely
// 	deviceCookie, err := r.Cookie("device_id")
// 	var deviceID string
// 	if err != nil || deviceCookie.Value == "" {
// 		deviceID = uuid.NewString()
// 	} else {
// 		deviceID = deviceCookie.Value
// 	}
// 	session.Values["device_id"] = deviceID

// 	// *** Luetaan fingerprint-lomakeparametri ***
// 	fingerprint := r.FormValue("fingerprint")
// 	if fingerprint != "" {
// 		log.Printf("lomakkeen fingerprint: %s", fingerprint)

// 		session.Values["fingerprint_hash"] = fingerprint

// 		// Tallennetaan sama arvo evästeeseen
// 		http.SetCookie(w, &http.Cookie{
// 			Name:     "fingerprint",
// 			Value:    fingerprint,
// 			Path:     "/",
// 			HttpOnly: false,
// 			Expires:  time.Now().Add(7 * 24 * time.Hour),
// 		})
// 	} else {
// 		log.Println("käyttäjä ei lähettänyt fingerprint-arvoa. ei tallenneta sormenjälkeä sessioon.")
// 	}

// 	http.SetCookie(w, &http.Cookie{
// 		Name:     "device_id",
// 		Value:    deviceID,
// 		Path:     "/",
// 		HttpOnly: false,
// 		Expires:  time.Now().Add(7 * 24 * time.Hour),
// 	})

// 	err = saveSession(w, r, session)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: session tallennus epäonnistui: %s\033[0m\n", err.Error())
// 		showLoginForm(w, r, "Istuntovirhe. Yritä uudelleen.")
// 		return
// 	}

// 	log.Printf("käyttäjä '%s' (id=%d) kirjautui sisään onnistuneesti", username, userID)
// 	http.Redirect(w, r, "/", http.StatusSeeOther)
// }

// // LogoutHandler poistaa session ja device_id-evästeen
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

// 	// Poistetaan device_id-eväste (MaxAge = -1)
// 	http.SetCookie(w, &http.Cookie{
// 		Name:   "device_id",
// 		Value:  "",
// 		Path:   "/",
// 		MaxAge: -1,
// 	})

// 	http.Redirect(w, r, "/login", http.StatusSeeOther)
// }

// // saveSession tallentaa session
// // isRequestSecure tarkistaa, onko HTTPS tai X-Forwarded-Proto = https
// func saveSession(w http.ResponseWriter, r *http.Request, session *sessions.Session) error {
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
