// database.go
package backend

import (
	"database/sql"
	"fmt"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

// Db on paketin tasolla oleva muuttuja
var Db *sql.DB

// InitDB alustaa tietokantayhteyden käyttäen .env:stä haettuja ympäristömuuttujia
func InitDB() error {
	// Ladataan .env-tiedosto
	env_err := godotenv.Load()
	if env_err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", env_err.Error())
		return env_err
	}

	db_host := os.Getenv("DB_HOST")
	db_port := os.Getenv("DB_PORT")
	db_user := os.Getenv("DB_USER")
	db_password := os.Getenv("DB_PASSWORD")
	db_name := os.Getenv("DB_NAME")

	conn_str := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		db_host,
		db_port,
		db_user,
		db_password,
		db_name,
	)

	var err error
	Db, err = sql.Open("postgres", conn_str)
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return err
	}

	// Testataan yhteys
	err = Db.Ping()
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return err
	}
	return nil
}

// CloseDB sulkee tietokantayhteyden
func CloseDB() {
	if Db != nil {
		Db.Close()
	}
}
