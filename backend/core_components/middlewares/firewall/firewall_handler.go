// firewall.go
package firewall

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ───────────────────────────────────────────────────
//
//	IP-apu: Cloudflare + Nginx oikea osoite   🆕
//
// ───────────────────────────────────────────────────
//
//	Järjestys:
//	  1)  CF-Connecting-IP   (Cloudflare lisää aina, 1-osoitteinen)
//	  2)  X-Real-IP          (Nginx real_ip_header)
//	  3)  X-Forwarded-For    (ensimmäinen pilkkueroteltu)
//	  4)  r.RemoteAddr       (fallback – 127.0.0.1 reverse-proxyssä)
func getClientIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// ───────────────────────────────────────────────────
//
//	Rate-limit erikoismetodeille (muut kuin GET/POST/HEAD)
//
// ───────────────────────────────────────────────────
const (
	rateLimitWindow       = 168 * 2 * time.Hour // aikaikkuna
	rateLimitMaxPerWindow = 1                   // erikoispyyntöä / aikaikkuna / IP
)

type rlEntry struct {
	count       int
	windowStart time.Time
}

var specialMethodRL = struct {
	sync.Mutex
	m map[string]*rlEntry
}{m: make(map[string]*rlEntry)}

func incrementSpecial(ip string) bool {
	specialMethodRL.Lock()
	defer specialMethodRL.Unlock()

	now := time.Now()
	entry, exists := specialMethodRL.m[ip]

	if !exists || now.Sub(entry.windowStart) >= rateLimitWindow {
		// uusi ikkunan alku
		specialMethodRL.m[ip] = &rlEntry{count: 1, windowStart: now}
		return true
	}

	if entry.count >= rateLimitMaxPerWindow {
		entry.count++ // kirjataan silti
		return false
	}

	entry.count++
	return true
}

// ───────────────────────────────────────────────────
//
//	FirewallHandler – pääkäsittelijä
//
// ───────────────────────────────────────────────────
func FirewallHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		// ► Poimitaan oikea IP välityspalvelin-otsikoista
		remoteIP := getClientIP(r)

		// Käänteinen DNS (vain lokitukseen)
		reverseDNS := "ei-löytynyt"
		if names, err := net.LookupAddr(remoteIP); err == nil && len(names) > 0 {
			reverseDNS = strings.TrimSuffix(names[0], ".")
		}

		// 1) Rate-limit placeholder
		// 2) Geo IP placeholder

		// 3) Header-kokoraja
		maxHeaderSize := 8192
		total := 0
		for k, vs := range r.Header {
			total += len(k)
			for _, v := range vs {
				total += len(v)
			}
		}
		if total > maxHeaderSize {
			fmt.Printf("\033[31mvirhe: ylisuuri header (%d tavua) - ip: %s (%s)\033[0m\n",
				total, remoteIP, reverseDNS)
			http.Error(w, "413 - Payload Too Large (headers)", http.StatusRequestEntityTooLarge)
			return
		}

		// 4) Body-kokoraja
		maxBody := int64(10 << 20) // 10 MB
		r.Body = http.MaxBytesReader(w, r.Body, maxBody)
		if r.ContentLength > maxBody {
			fmt.Printf("\033[31mvirhe: ylisuuri body (ContentLength=%d) - ip: %s (%s)\033[0m\n",
				r.ContentLength, remoteIP, reverseDNS)
			http.Error(w, "413 - Payload Too Large (body)", http.StatusRequestEntityTooLarge)
			return
		}

		// 5) Sallitaan vain GET, POST ja HEAD
		if r.Method != http.MethodGet &&
			r.Method != http.MethodPost &&
			r.Method != http.MethodHead {

			// a) Rate-limit erikoismetodeille
			if !incrementSpecial(remoteIP) {
				fmt.Printf("\033[31mvirhe: %s metodi rate-limit ylitetty - ip: %s (%s)\033[0m\n",
					r.Method, remoteIP, reverseDNS)
				http.Error(w, "429 - Too Many Requests (special methods)", http.StatusTooManyRequests)
				return
			}

			// b) Blokataan itse metodi
			fmt.Printf("\033[31mvirhe: %s metodi estetty firewallissa - ip: %s (%s)\033[0m\n",
				r.Method, remoteIP, reverseDNS)
			http.Error(w, "403 - Forbidden (Only GET/POST/HEAD allowed)", http.StatusForbidden)
			return
		}

		// Kaikki OK → seuraava handler
		next.ServeHTTP(w, r)
	})
}

// // Korjauskehotus rate limitin muuttamiseen ilman:
// - uudelleen buildausta
// - prosessin uudelleenkäynnistystä
// - tietokantaa
// - konfiguraatiotiedostoa
// - Redistä

// // nimiehdotus: ratelimit_config.go
// package firewall

// import (
// 	"net/http"
// 	"strconv"
// 	"sync/atomic"
// 	"time"
// )

// // rateLimitConfig tallennetaan atomisesti
// type rateLimitConfig struct {
// 	Window time.Duration
// 	Max    int
// }

// var currentRL atomic.Value

// func init() {
// 	// oletus: 3 erikoispyyntöä / 24 h
// 	currentRL.Store(&rateLimitConfig{Window: 24 * time.Hour, Max: 3})
// }

// // GetRateLimit palauttaa tämänhetkisen konfiguraation
// func GetRateLimit() *rateLimitConfig {
// 	return currentRL.Load().(*rateLimitConfig)
// }

// // UpdateRateLimit päivittää konfiguraation atomisesti
// func UpdateRateLimit(win time.Duration, max int) {
// 	currentRL.Store(&rateLimitConfig{Window: win, Max: max})
// }

// // Admin-endpoint (/admin/ratelimit?win=3600&max=5)
// func RateLimitAdmin(w http.ResponseWriter, r *http.Request) {
// 	winSec, err1 := strconv.Atoi(r.URL.Query().Get("win"))
// 	max, err2 := strconv.Atoi(r.URL.Query().Get("max"))
// 	if err1 != nil || err2 != nil || winSec <= 0 || max <= 0 {
// 		http.Error(w, "400 – virheelliset parametrit", http.StatusBadRequest)
// 		return
// 	}
// 	UpdateRateLimit(time.Duration(winSec)*time.Second, max)
// 	w.WriteHeader(http.StatusNoContent)
// }

// // // Lisää firewalliin:
// func incrementSpecial(ip string) bool {
//     cfg := GetRateLimit() // ☚ dynaaminen
//     specialMethodRL.Lock()
//     defer specialMethodRL.Unlock()

//     now := time.Now()
//     entry, ok := specialMethodRL.m[ip]
//     if !ok || now.Sub(entry.windowStart) >= cfg.Window {
//         specialMethodRL.m[ip] = &rlEntry{count: 1, windowStart: now}
//         return true
//     }
//     if entry.count >= cfg.Max {
//         entry.count++
//         return false
//     }
//     entry.count++
//     return true
// }

// // Käyttö:
// // # 5 erikois-HTTP-metodia tunnissa
// // curl -X POST "https://your-vps/admin/ratelimit?win=3600&max=5" -u admin:salasana
