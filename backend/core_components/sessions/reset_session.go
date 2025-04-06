// reset_session.go
package e_sessions

import (
	"fmt"
	"net/http"
	"time"
)

func ResetSessionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		// virheilmoitus (Go: punaisella, pienellä alkukirjaimella)
		errMsg := "ei-tuettu metodi, salli vain POST"
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", errMsg)
		http.Error(w, errMsg, http.StatusMethodNotAllowed)
		return
	}

	// Tyhjennetään session-eväste
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   true, // jos HTTPS, usein suositeltavaa
		// Domain: "oma-domain.fi", // määrittele tarvittaessa sama domain kuin alun perin
	})

	// Halutessasi voit palauttaa JSON-tyylisen vastauksen
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"message":"session cookie cleared"}`))
}
