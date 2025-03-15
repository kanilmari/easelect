package backend

import (
	"database/sql"
	"fmt"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

var (
	// Db = pääyhteys koko sovellukselle (kaikki oikeudet)
	Db *sql.DB

	// DbReaderOnly = AI:n read-only -yhteys
	DbReaderOnly *sql.DB
)

func InitDB() error {
	// Ladataan .env
	if err := godotenv.Load(); err != nil {
		fmt.Println("Virhe .env-latauksessa:", err)
		// Ei välttämättä palauteta erroria, jos haluaa tukea myös
		// tilannetta ilman .env-tiedostoa. Makuasia.
	}

	// Luetaan tarvittavat environment-muuttujat
	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")

	dbUser := os.Getenv("DB_USER")
	dbPassword := os.Getenv("DB_PASSWORD")

	dbROUser := os.Getenv("DB_READONLY_USER")
	dbROPass := os.Getenv("DB_READONLY_PASSWORD")

	dbName := os.Getenv("DB_NAME")

	// 1) Pääkäyttäjän connect-string
	connMain := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName,
	)

	// 2) Read-only-käyttäjän connect-string
	connReadOnly := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbROUser, dbROPass, dbName,
	)

	// Avataan pääyhteys
	var err error
	Db, err = sql.Open("postgres", connMain)
	if err != nil {
		return fmt.Errorf("virhe pääyhteyden avauksessa: %v", err)
	}
	// Testataan
	if err := Db.Ping(); err != nil {
		return fmt.Errorf("ping-virhe pääyhteydelle: %v", err)
	}

	// Avataan read-only-yhteys
	DbReaderOnly, err = sql.Open("postgres", connReadOnly)
	if err != nil {
		return fmt.Errorf("virhe read-only-yhteyden avauksessa: %v", err)
	}
	if err := DbReaderOnly.Ping(); err != nil {
		return fmt.Errorf("ping-virhe read-only-yhteydelle: %v", err)
	}

	fmt.Println("Tietokantayhteydet avattu onnistuneesti.")
	return nil
}

func CloseDB() {
	if Db != nil {
		Db.Close()
	}
	if DbReaderOnly != nil {
		DbReaderOnly.Close()
	}
}
