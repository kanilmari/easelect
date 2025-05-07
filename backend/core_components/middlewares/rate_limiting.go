// rate_limiting.go
package middlewares

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// säilömme aikaleimoja pyyntöhetkistä: map[ "handlerName|ip" ] = []time.Time
var (
	functionRequests = make(map[string][]time.Time)
	functionReqMu    sync.Mutex
)

// WithFunctionRateLimiting hakee funktiolta rate_limit_amount, rate_limit_minutes
// ja estää pyynnön, jos raja ylittyy. Käyttää (IP + funktioNimi)-avainta.
func WithFunctionRateLimiting(db *sql.DB, funcName string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		// Haetaan tietokannasta rajoitukset:
		var (
			rateLimitAmount  int
			rateLimitMinutes int
		)

		err := db.QueryRow(`
			SELECT rate_limit_amount, rate_limit_minutes
			FROM functions
			WHERE name = $1
			LIMIT 1
		`, funcName).Scan(&rateLimitAmount, &rateLimitMinutes)
		if err != nil {
			// Jos ei riviä (sql.ErrNoRows) tai virhe => ohitetaan rate-limitti
			if err.Error() != "sql: no rows in result set" {
				// Lokitetaan mahdollinen virhe
				log.Printf("\033[31mvirhe: rate-limitin haku funktiolle='%s': %v\033[0m\n", funcName, err)
			}
			next.ServeHTTP(w, r)
			return
		}

		// Jos taulussa on nolla-arvoja, ohitetaan rajoitus
		if rateLimitAmount <= 0 || rateLimitMinutes <= 0 {
			next.ServeHTTP(w, r)
			return
		}

		// Selvitetään kutsujan IP
		clientIP := r.RemoteAddr
		// Jos haluat siistiä portin pois, esim:
		// ipOnly, _, _ := net.SplitHostPort(r.RemoteAddr)
		// clientIP = ipOnly

		key := fmt.Sprintf("%s|%s", funcName, clientIP)

		now := time.Now()
		limitDuration := time.Duration(rateLimitMinutes) * time.Minute

		// Suojataan map-lukeminen/lisääminen mutexilla
		functionReqMu.Lock()

		times := functionRequests[key]
		// Siivotaan vanhat kutsut pois
		cutoff := now.Add(-limitDuration)
		var filtered []time.Time
		for _, t := range times {
			if t.After(cutoff) {
				filtered = append(filtered, t)
			}
		}
		times = filtered

		// Lisätään tämänhetkinen pyyntö
		times = append(times, now)
		functionRequests[key] = times

		// Tarkistetaan määrä
		currentCount := len(times)
		functionReqMu.Unlock()

		if currentCount > rateLimitAmount {
			// Tulostetaan punaisella, mutta ei pysäytetä koodia kehitysvaiheessa
			log.Printf("\033[31mvirhe: rate limit ylittyi funktiolle='%s' ip='%s'\033[0m\n", funcName, clientIP)
			// Kehitysvaiheessa jätämme nämä pois:
			// http.Error(w, "429 - Too Many Requests", http.StatusTooManyRequests)
			// return
		}

		next.ServeHTTP(w, r)
	}
}
