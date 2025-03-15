package e_sessions

import (
	"github.com/gorilla/sessions"
)

// Store on globaali sessiostore, jota muut paketit (esim. middlewares) tarvitsevat
var Store *sessions.CookieStore

// InitSessionStore alustaa sessiostoren ja asettaa sen asetukset
func InitSessionStore() {
	// Luo store vain, jos se puuttuu
	if Store == nil {
		Store = sessions.NewCookieStore([]byte("super-secret-key"))
	}
	// Asetukset:
	Store.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 7, // 7 päivää
		HttpOnly: true,
		Secure:   true, // true, jos https
		// SameSite: http.SameSiteLaxMode (esim.)
	}
}

// GetStore palauttaa osoittimen sessiostoreen
func GetStore() *sessions.CookieStore {
	return Store
}
