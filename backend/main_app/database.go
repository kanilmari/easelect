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

// // database.go
// package backend

// import (
// 	"database/sql"
// 	"fmt"
// 	"os"

// 	"github.com/joho/godotenv"
// 	_ "github.com/lib/pq"
// )

// // Db on paketin tasolla oleva muuttuja
// var Db *sql.DB

// // InitDB alustaa tietokantayhteyden käyttäen .env:stä haettuja ympäristömuuttujia
// func InitDB() error {
// 	// Ladataan .env-tiedosto
// 	env_err := godotenv.Load()
// 	if env_err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", env_err.Error())
// 		return env_err
// 	}

// 	db_host := os.Getenv("DB_HOST")
// 	db_port := os.Getenv("DB_PORT")
// 	db_user := os.Getenv("DB_USER")
// 	db_password := os.Getenv("DB_PASSWORD")
// 	db_name := os.Getenv("DB_NAME")

// 	conn_str := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
// 		db_host,
// 		db_port,
// 		db_user,
// 		db_password,
// 		db_name,
// 	)

// 	var err error
// 	Db, err = sql.Open("postgres", conn_str)
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		return err
// 	}

// 	// Testataan yhteys
// 	err = Db.Ping()
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		return err
// 	}
// 	return nil
// }

// // CloseDB sulkee tietokantayhteyden
// func CloseDB() {
// 	if Db != nil {
// 		Db.Close()
// 	}
// }
