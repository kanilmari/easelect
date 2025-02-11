// login.go
package auth

import (
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/google/uuid" // go get github.com/google/uuid
	"golang.org/x/crypto/bcrypt"

	"easelect/backend"

	"github.com/gorilla/sessions"
)

var store *sessions.CookieStore
var frontend_dir string

func InitAuth(
	session_store *sessions.CookieStore,
	fe_dir string,
) {
	store = session_store
	frontend_dir = fe_dir
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("loginHandler called")

	session, err := store.Get(r, "session")
	if err != nil {
		log.Printf("session haku epäonnistui: %v", err)
		// näytetään silti login-sivu (tai ohjataan virheen mukaan)
	}

	// Jos GET-pyyntö ja käyttäjä on jo kirjautunut -> ohjaa etusivulle
	if r.Method == http.MethodGet {
		if session != nil && session.Values["user_id"] != nil {
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		// muutoin palvellaan login-sivu
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

		// Kirjautuminen onnistui, ladataan (tai luodaan) sessio uudestaan
		session, err := store.Get(r, "session")
		if err != nil {
			log.Printf("session luonti epäonnistui: %v", err)
			http.Error(w, "session luonti epäonnistui", http.StatusInternalServerError)
			return
		}
		session.Values["authenticated"] = true
		session.Values["user_id"] = user_id

		// Tarkistetaan, onko meillä jo device_id-evästettä
		deviceCookie, err := r.Cookie("device_id")
		var device_id string
		if err != nil || deviceCookie.Value == "" {
			// Luodaan uusi
			device_id = uuid.NewString()
		} else {
			// Käytetään olemassa olevaa
			device_id = deviceCookie.Value
		}

		// Tallennetaan device_id myös sessioniin
		session.Values["device_id"] = device_id

		// Asetetaan device_id-eväste
		http.SetCookie(w, &http.Cookie{
			Name:     "device_id",
			Value:    device_id,
			Path:     "/",
			HttpOnly: false, // Jos haluat lukea sen myös JS:llä
			Expires:  time.Now().Add(7 * 24 * time.Hour),
			// Secure:   true,  // vain HTTPS:lle
			// SameSite: http.SameSiteLaxMode,
		})

		// Tallennetaan sessio
		err = saveSession(w, r, session)
		if err != nil {
			log.Printf("session tallennus epäonnistui: %v", err)
			http.Error(w, "session tallennus epäonnistui", http.StatusInternalServerError)
			return
		}
		log.Println("kirjautuminen onnistui, ohjataan etusivulle")

		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
	}
}

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

	// Poistetaan device_id-eväste asettamalla MaxAge = -1
	http.SetCookie(w, &http.Cookie{
		Name:   "device_id",
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})

	http.Redirect(w, r, "/login", http.StatusSeeOther)
}

// Sama saveSession kuin ennen
func saveSession(
	w http.ResponseWriter,
	r *http.Request,
	session *sessions.Session,
) error {
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

// 	"easelect/backend"

// 	"github.com/gorilla/sessions"
// 	"golang.org/x/crypto/bcrypt"
// )

// // Huom: store ja frontend_dir on package-level -muuttujia auth-paketissa.
// var store *sessions.CookieStore
// var frontend_dir string

// // InitAuth alustaa paketin laajuudella käytettävät muuttujat.
// // Tämän kutsut "main.go":sta ennen reittien rekisteröintiä.
// func InitAuth(
// 	session_store *sessions.CookieStore,
// 	fe_dir string,
// ) {
// 	store = session_store
// 	frontend_dir = fe_dir
// }

// // LoginHandler käsittelee /login-pyynnöt
// func LoginHandler(w http.ResponseWriter, r *http.Request) {
// 	log.Println("loginHandler called")

// 	session, err := store.Get(r, "session")
// 	if err != nil {
// 		log.Printf("session haku epäonnistui: %v", err)
// 		// näytetään silti login-sivu, tai ohjataan virheen mukaan
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

// 		// Kirjautuminen onnistui, luodaan sessio
// 		session, err := store.Get(r, "session")
// 		if err != nil {
// 			log.Printf("session luonti epäonnistui: %v", err)
// 			http.Error(w, "session luonti epäonnistui", http.StatusInternalServerError)
// 			return
// 		}
// 		session.Values["authenticated"] = true
// 		session.Values["user_id"] = user_id

// 		// Tallennetaan sessio
// 		err = saveSession(w, r, session)
// 		if err != nil {
// 			log.Printf("session tallennus epäonnistui: %v", err)
// 			http.Error(w, "session tallennus epäonnistui", http.StatusInternalServerError)
// 			return
// 		}
// 		log.Println("kirjautuminen onnistui, ohjataan etusivulle")

// 		// Esimerkissä ohjataan index.html:ään
// 		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
// 	}
// }

// // LogoutHandler käsittelee /logout-pyynnöt
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
// 	http.Redirect(w, r, "/login", http.StatusSeeOther)
// }

// // saveSession voi olla myös auth-paketin sisäinen apufunktio
// func saveSession(
// 	w http.ResponseWriter,
// 	r *http.Request,
// 	session *sessions.Session,
// ) error {
// 	opts := *session.Options
// 	session.Options.Secure = isRequestSecure(r) // Halutessasi turvattuun yhteyteen
// 	err := session.Save(r, w)
// 	session.Options = &opts
// 	return err
// }

// // isRequestSecure tarkistaa onko TLS tai X-Forwarded-Proto: https
// func isRequestSecure(r *http.Request) bool {
// 	if r.TLS != nil {
// 		return true
// 	}
// 	if proto := r.Header.Get("X-Forwarded-Proto"); proto == "https" {
// 		return true
// 	}
// 	return false
// }
