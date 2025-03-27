package firewall

import (
	"fmt"
	"net/http"
)

// FirewallHandler on palomuurikäsittelijä, joka suorittaa
// erilaisia tarkistuksia, kuten rate limitingin, geo IP -tarkistukset,
// otsakkeiden koon (header size) tarkistukset sekä DELETE-metodien
// blockaamisen, jne.
func FirewallHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		// 1) Rate limiting (placeholder)
		// 2) Geo IP -tarkistus (placeholder)

		// 3) Header-size -tarkistus
		var maxHeaderSize = 8192
		var totalHeaderSize int
		for headerKey, headerValues := range r.Header {
			totalHeaderSize += len(headerKey)
			for _, value := range headerValues {
				totalHeaderSize += len(value)
			}
		}
		if totalHeaderSize > maxHeaderSize {
			fmt.Printf("\033[31mvirhe: ylisuuri header (%d tavua)\033[0m\n", totalHeaderSize)
			http.Error(w, "413 - Payload Too Large (headers)", http.StatusRequestEntityTooLarge)
			return
		}

		// 4) Bodyn kokorajoitus
		maxBodySize := int64(10 << 20) // esim. 10MB
		r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
		if r.ContentLength > maxBodySize {
			fmt.Printf("\033[31mvirhe: ylisuuri body (ContentLength=%d)\033[0m\n", r.ContentLength)
			http.Error(w, "413 - Payload Too Large (body)", http.StatusRequestEntityTooLarge)
			return
		}

		// 5) Sallitaan vain GET ja POST
		if r.Method != http.MethodGet && r.Method != http.MethodPost {
			fmt.Printf("\033[31mvirhe: %s metodi estetty firewallissa\033[0m\n", r.Method)
			http.Error(w, "403 - Forbidden (Only GET/POST allowed)", http.StatusForbidden)
			return
		}

		// Jos päästiin tänne, mitään ei blokattu:
		next.ServeHTTP(w, r)
	})
}
