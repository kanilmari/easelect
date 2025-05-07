// login.go
package auth

import (
	"database/sql"
	backend "easelect/backend/core_components"
	"easelect/backend/core_components/middlewares"
	"fmt"
	"html/template"
	"log"
	"net"
	"net/http"
	"path/filepath"
	"strings"
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
	log.Println("showLoginForm() käynnistyi 🪪")

	// --- Sessio & sessio-cookie ---
	session, err := store.Get(r, "session")
	if err != nil {
		fmt.Printf("\033[31mvirhe: session haku epäonnistui: %s\033[0m\n", err.Error())
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if _, errCookie := r.Cookie("session"); errCookie == nil {
		log.Println("sessio-cookie löytyi 🍪")
	} else {
		log.Println("sessio-cookieta ei löytynyt – luodaan uusi 🔄")
	}

	// --- CSRF-token ---
	csrfToken, ok := session.Values["csrf_token"].(string)
	if !ok || csrfToken == "" {
		csrfToken = uuid.NewString()
		session.Values["csrf_token"] = csrfToken
		log.Printf("luotu uusi csrf-token: %s 🔐", csrfToken)

		log.Println("yritetään tallentaa sessio (csrf-token)…")
		if err = saveSession(w, r, session); err != nil {
			fmt.Printf("\033[31mvirhe: session tallennus epäonnistui csrf-tokenin luomisen jälkeen: %s\033[0m\n", err.Error())
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		log.Println("session tallennus OK ✅")
	} else {
		log.Printf("olemassa oleva csrf-token: %s", csrfToken)
	}

	// --- Templaatin renderöinti ---
	templatePath := filepath.Join(frontend_dir, "templates", "login.html")
	tmpl, err := template.ParseFiles(templatePath)
	if err != nil {
		fmt.Printf("\033[31mvirhe: login-templaatin lataus epäonnistui: %s\033[0m\n", err.Error())
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

	if err = tmpl.Execute(w, data); err != nil {
		fmt.Printf("\033[31mvirhe: login-templaatin suorittaminen epäonnistui: %s\033[0m\n", err.Error())
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	log.Println("login-templaatti renderöity onnistuneesti 🖼️")
}

// --------------------------------------------------------------------
// APU: kaikkien POST-kenttien lokitus + honeypot-tarkistus
// --------------------------------------------------------------------
func logPostFormValues(
	r *http.Request,
	honeypotFieldNames ...string,
) (honeypotFilled bool) {

	honeypotSet := map[string]struct{}{}
	for _, name := range honeypotFieldNames {
		honeypotSet[name] = struct{}{}
	}

	for fieldName, values := range r.PostForm {
		isPassword := fieldName == "salkkusana"

		for _, value := range values {
			if isPassword {
				log.Printf("lomakekenttä %s = [SALAISUUS]", fieldName)
			} else {
				log.Printf("lomakekenttä %s = %q", fieldName, value)
			}

			if _, ok := honeypotSet[fieldName]; ok && value != "" {
				honeypotFilled = true
			}
		}
	}
	return
}

// --------------------------------------------------------------------
// APU: IP-osoitteen poiminta
// --------------------------------------------------------------------
func getClientIP(r *http.Request) string {
	// Yritetään ensin välityspalvelimen headerit
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		return strings.Split(ip, ",")[0]
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	// Lopuksi suora RemoteAddr
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr // fallback
	}
	return host
}

// --------------------------------------------------------------------
// APU: domainin haku IP:stä (reverse DNS)
// --------------------------------------------------------------------
func lookupHostname(ip string) string {
	names, err := net.LookupAddr(ip)
	if err != nil || len(names) == 0 {
		return ""
	}
	// Poistetaan mahdollinen loppupiste
	return strings.TrimSuffix(names[0], ".")
}

// -----------------------------------------------------------
// KORJATTU FUNKTIO: handleLoginPost
// -----------------------------------------------------------
func handleLoginPost(w http.ResponseWriter, r *http.Request) {
	log.Println("handleLoginPost() käynnistyi 📥")

	// --- Lomakkeen parsinta ---
	if err := r.ParseForm(); err != nil {
		fmt.Printf("\033[31mvirhe: lomakkeen parsinta epäonnistui: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Virhe lomakkeen käsittelyssä.")
		return
	}
	log.Println("lomake parsittu ✅")

	// --- POST-parametrit & honeypotit ---
	honeypotFilled := logPostFormValues(
		r,
		"nickname",
		"email_confirm",
	)
	if honeypotFilled {
		log.Println("⚠️  honeypot-kenttä täytetty – mahdollinen botti")
	}

	// --- IP & domain ---
	clientIP := getClientIP(r)
	clientDomain := lookupHostname(clientIP)
	if clientDomain != "" {
		log.Printf("kirjautumisyritys IP=%s, domain=%s 🌐", clientIP, clientDomain)
	} else {
		log.Printf("kirjautumisyritys IP=%s (domain ei löytynyt) 🌐", clientIP)
	}

	// --- CSRF-tarkistus ---
	session, err := store.Get(r, "session")
	if err != nil {
		fmt.Printf("\033[31mvirhe: session get epäonnistui: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Istuntovirhe. Yritä uudelleen.")
		return
	}

	postedToken := r.FormValue("csrf_token")
	sessionToken, _ := session.Values["csrf_token"].(string)
	if postedToken == "" || sessionToken == "" || postedToken != sessionToken {
		log.Println("csrf-tarkistus epäonnistui 🔒")
		showLoginForm(w, r, "Virheellinen CSRF-token. Yritä uudelleen.")
		return
	}
	log.Println("csrf-tarkistus OK ✅")

	// --- Käyttäjätunnus & salasana ---
	username := r.FormValue("username")
	password := r.FormValue("password")
	log.Printf("kirjautumisyritys: käyttäjä=%s", username)

	var userID int
	err = backend.Db.QueryRow(`
        SELECT id
          FROM auth_users
         WHERE username = $1
           AND enabled = true
    `, username).Scan(&userID)
	switch {
	case err == sql.ErrNoRows:
		log.Printf("käyttäjää ei löydy tai ei ole käytössä: %s", username)
		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
		return
	case err != nil:
		fmt.Printf("\033[31mvirhe: db-virhe käyttäjän haussa: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Tapahtui virhe. Yritä uudelleen.")
		return
	}

	var hashedPassword string
	err = backend.DbConfidential.QueryRow(`
        SELECT password
          FROM restricted.user_data
         WHERE id = $1
    `, userID).Scan(&hashedPassword)
	switch {
	case err == sql.ErrNoRows:
		log.Printf("hashedPassword ei löydy id:llä %d", userID)
		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
		return
	case err != nil:
		fmt.Printf("\033[31mvirhe: db-virhe salasanan haussa: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Tapahtui virhe. Yritä uudelleen.")
		return
	}

	if err = bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password)); err != nil {
		log.Println("bcrypt: väärä salasana ❌")
		showLoginForm(w, r, "Väärä käyttäjätunnus tai salasana.")
		return
	}
	log.Println("salasanavahvistus OK 🔑")

	// --- Sessioarvot ---
	session.Values["authenticated"] = true
	session.Values["user_id"] = userID
	session.Values["username"] = username

	// --- device_id-cookie ---
	deviceCookie, err := r.Cookie("device_id")
	var deviceID string
	if err != nil || deviceCookie.Value == "" {
		deviceID = uuid.NewString()
		log.Println("luotu uusi deviceID:", deviceID)
	} else {
		deviceID = deviceCookie.Value
		log.Println("olemassa oleva deviceID:", deviceID)
	}
	session.Values["device_id"] = deviceID

	// --- Fingerprint (pakollinen) ---
	fingerprint := r.FormValue("fingerprint")
	if fingerprint == "" {
		log.Println("fingerprint puuttuu – kirjautuminen keskeytetty 🔒")
		showLoginForm(w, r, "Kirjautuminen vaatii sormenjäljen.")
		return
	}
	session.Values["fingerprint_hash"] = fingerprint
	log.Println("fingerprint vastaanotettu ✅")

	// --- Evästeiden asetus ---
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
	log.Println("evästeet asetettu fingerprintille ja device_id:lle 🍪")

	// --- Session tallennus ---
	log.Println("yritetään tallentaa sessio…")
	if err = saveSession(w, r, session); err != nil {
		fmt.Printf("\033[31mvirhe: session tallennus epäonnistui: %s\033[0m\n", err.Error())
		showLoginForm(w, r, "Istuntovirhe. Yritä uudelleen.")
		return
	}
	log.Println("session tallennettu OK ✅")

	// --- Yhteenveto ---
	log.Printf("turvamekanismit toimivat: csrf ✔︎ sessio-cookie ✔︎ session tallennus ✔︎ fingerprint ✔︎ device_id ✔︎")
	log.Printf("käyttäjä '%s' (id=%d) kirjautui sisään onnistuneesti 🎉", username, userID)

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
