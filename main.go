// main.go
package main

import (
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"

	"easelect/backend"
	"easelect/backend/auth"
	"easelect/backend/general_tables"
	"easelect/backend/router"
	"easelect/backend/sessions"
)

func main() {
	// 1) Ladataan .env
	if err := godotenv.Load(); err != nil {
		log.Printf("Ei .env-tiedostoa: %v", err)
	}

	// 2) Alustetaan sessiot (CookieStore, asetukset)
	sessions.InitSessionStore()

	// 3) Alustetaan tietokanta
	err := backend.InitDB()
	if err != nil {
		log.Fatalf("DB-yhteys epäonnistui: %v", err)
	}
	defer backend.CloseDB()

	// 4) Päivitetään esim. OID-arvot
	err = general_tables.UpdateOidsAndTableNames()
	if err != nil {
		log.Fatalf("OID-päivitysvirhe: %v", err)
	}

	// 5) Selvitetään frontendiin polku
	exePath, err := os.Executable()
	if err != nil {
		log.Fatalf("Executable-polun haku epäonnistui: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	frontendDir := filepath.Join(exeDir, "frontend")
	// log.Printf("[INFO] Frontend-hakemisto: %s", frontendDir)

	mediaPath := filepath.Join(exeDir, "media")
	http.Handle("/media/", http.StripPrefix("/media/", http.FileServer(http.Dir(mediaPath))))

	// --- TÄRKEÄ KUTSU auth.InitAuth ---
	auth.InitAuth(sessions.GetStore(), frontendDir)

	// 6) Rekisteröidään reitit + polku staattisiin tiedostoihin
	router.RegisterRoutes(frontendDir)

	// 7) Viedään reitit varsinaisesti http.HandleFunc -kutsuihin
	//    ja päivitetään *functions*-taulu (jos sinulla on “functions” -logiikka)
	err = router.RegisterAllRoutesAndUpdateFunctions(backend.Db)
	if err != nil {
		log.Printf("virhe rekisteröidessä reittejä/päivittäessä funktioita: %v", err)
	}

	// 8) Synkronoidaan: merkitään ne funktiot, joita ei käytetä, disabled = true
	err = router.SyncFunctions(backend.Db)
	if err != nil {
		log.Printf("virhe synkronoitaessa funktioita: %v", err)
	}

	// 9) Käynnistetään palvelin
	log.Println("[INFO] Server running on port 8082...")

	osType := os.Getenv("OS_TYPE")
	if osType == "windows" {
		if err := http.ListenAndServe("0.0.0.0:8082", nil); err != nil {
			log.Fatalf("Palvelinvirhe: %v", err)
		}
	} else if osType == "linux" {
		listener, err := net.Listen("tcp4", "0.0.0.0:8082")
		if err != nil {
			log.Fatalf("Kuunteluvirhe: %v", err)
		}
		if err := http.Serve(listener, nil); err != nil {
			log.Fatalf("Palvelinvirhe: %v", err)
		}
	} else {
		log.Fatalf("Tuntematon OS_TYPE: %s", osType)
	}
}
