// main.go
package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"

	backend "easelect/backend/core_components"
	"easelect/backend/core_components/auth"
	"easelect/backend/core_components/general_tables"
	"easelect/backend/core_components/general_tables/crud_workflows"
	"easelect/backend/core_components/general_tables/foreign_keys"
	"easelect/backend/core_components/middlewares"
	"easelect/backend/core_components/router"

	e_sessions "easelect/backend/core_components/sessions"

	"github.com/joho/godotenv"
)

func main() {
	// 1) Ladataan .env
	if err := godotenv.Load(); err != nil {
		log.Printf("Ei .env-tiedostoa: %v", err)
	}

	// 2) Alustetaan sessiot (CookieStore, asetukset)
	e_sessions.InitSessionStore()

	// 3) Alustetaan tietokanta
	err := backend.InitDB()
	if err != nil {
		log.Fatalf("DB-yhteys epäonnistui: %v", err)
	}
	defer backend.CloseDB()

	// 4) Päivitetään esim. OID-arvot
	err = crud_workflows.UpdateOidsAndTableNamesWithBridge()
	if err != nil {
		log.Fatalf("OID-päivitysvirhe: %v", err)
	}

	// Tässä kohtaa voimme kutsua CheckFKReferences,
	// kun tietokanta on jo alustettu:
	err = foreign_keys.SyncOneToManyFKConstraints(backend.Db)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
	}

	err = foreign_keys.SyncManyToManyFKConstraints(backend.Db)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
	}

	// 5) Selvitetään frontendiin polku
	exePath, err := os.Executable()
	if err != nil {
		log.Fatalf("Executable-polun haku epäonnistui: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	frontendDir := filepath.Join(exeDir, "frontend")

	// HUOM! Poistettu suora http.Handle("/media/", ...) -kutsu
	mediaPath := filepath.Join(exeDir, "media")

	// --- TÄRKEÄ KUTSU auth.InitAuth ---
	auth.InitAuth(e_sessions.GetStore(), frontendDir)

	// 6) Rekisteröidään reitit
	router.RegisterRoutes(frontendDir, mediaPath)

	// 7) Viedään reitit varsinaisesti http.HandleFunc -kutsuihin
	err = router.RegisterAllRoutesAndUpdateFunctions(backend.Db)
	if err != nil {
		log.Printf("virhe rekisteröidessä reittejä/päivittäessä funktioita: %v", err)
	}

	// 8) Synkronoidaan funktiot
	err = router.SyncFunctions(backend.Db)
	if err != nil {
		log.Printf("virhe synkronoitaessa funktioita: %v", err)
	}

	err = general_tables.Remove_non_existent_table_rights(backend.Db)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
	}
	// 9) Käynnistetään palvelin
	wrappedHandler := middlewares.WithCSP(http.DefaultServeMux)

	log.Println("[INFO] Server running on port 8082...")

	osType := os.Getenv("OS_TYPE")
	if osType == "windows" {
		if err := http.ListenAndServe("0.0.0.0:8082", wrappedHandler); err != nil {
			log.Fatalf("Palvelinvirhe: %v", err)
		}
	} else if osType == "linux" {
		listener, err := net.Listen("tcp4", "0.0.0.0:8082")
		if err != nil {
			log.Fatalf("Kuunteluvirhe: %v", err)
		}
		if err := http.Serve(listener, wrappedHandler); err != nil {
			log.Fatalf("Palvelinvirhe: %v", err)
		}
	} else {
		log.Fatalf("Tuntematon OS_TYPE: %s", osType)
	}
}
