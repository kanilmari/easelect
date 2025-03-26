// csp_middleware.go
package middlewares

import "net/http"

func WithCSP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		// Haluttu Content-Security-Policy
		// Huom: jos haluat sallia cdn.jsdelivr.net ja poistaa "unsafe-inline",
		// laita ne yhteen riviin. Tällöin 'frame-ancestors' toimii oikein.
		w.Header().Set("Content-Security-Policy", `
            default-src 'self';
            object-src 'none';
            script-src 'self';
            style-src 'self';
            connect-src 'self';
            img-src 'self';
            font-src 'self';
            base-uri 'self';
            form-action 'self';
            frame-ancestors 'self';
        `)

		next.ServeHTTP(w, r)
	})
}
