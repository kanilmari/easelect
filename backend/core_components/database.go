// database.go
package backend

import (
	"database/sql"
	"fmt"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

var (
	// Db = "pääyhteys" joka tässä esimerkissä halutaan osoittaa samaan kuin DbGuest
	Db             *sql.DB
	DbAdmin        *sql.DB
	DbReaderOnly   *sql.DB
	DbConfidential *sql.DB
	DbBasic        *sql.DB
	DbGuest        *sql.DB
)

func InitDB() error {
	if err := godotenv.Load(); err != nil {
		fmt.Printf("\033[31mvirhe .env-latauksessa: %s\033[0m\n", err.Error())
		// Ei välttämättä lopeteta, jos halutaan tukea myös
		// tilannetta ilman .env-tiedostoa.
	}

	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")
	dbName := os.Getenv("DB_NAME")

	type DbConnectionInfo struct {
		roleDescription   string
		dbUserEnv         string
		dbPasswordEnv     string
		dbPointer         **sql.DB
		specialPrivileges bool
	}

	dbConnectionList := []DbConnectionInfo{
		{
			roleDescription:   "Access to public",
			dbUserEnv:         os.Getenv("DB_ADMIN_USER"),
			dbPasswordEnv:     os.Getenv("DB_ADMIN_PASSWORD"),
			dbPointer:         &DbAdmin,
			specialPrivileges: true,
		},
		{
			roleDescription:   "Read-only access to public, great for AI SQL queries",
			dbUserEnv:         os.Getenv("DB_READONLY_USER"),
			dbPasswordEnv:     os.Getenv("DB_READONLY_PASSWORD"),
			dbPointer:         &DbReaderOnly,
			specialPrivileges: false,
		},
		{
			roleDescription:   "Access only to confidential data",
			dbUserEnv:         os.Getenv("DB_CONFIDENTIAL_USER"),
			dbPasswordEnv:     os.Getenv("DB_CONFIDENTIAL_PASSWORD"),
			dbPointer:         &DbConfidential,
			specialPrivileges: true,
		},
		{
			roleDescription:   "Basic user can't see if they have been muted, etc.",
			dbUserEnv:         os.Getenv("DB_BASIC_USER"),
			dbPasswordEnv:     os.Getenv("DB_BASIC_PASSWORD"),
			dbPointer:         &DbBasic,
			specialPrivileges: false,
		},
		{
			roleDescription:   "Guest user can't see users, etc.",
			dbUserEnv:         os.Getenv("DB_GUEST_USER"),
			dbPasswordEnv:     os.Getenv("DB_GUEST_PASSWORD"),
			dbPointer:         &DbGuest,
			specialPrivileges: false,
		},
	}

	for _, conn := range dbConnectionList {
		connectionString := fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
			dbHost, dbPort, conn.dbUserEnv, conn.dbPasswordEnv, dbName,
		)

		dbInstance, err := sql.Open("postgres", connectionString)
		if err != nil {
			fmt.Printf("\033[31mvirhe %s avauksessa: %s\033[0m\n",
				conn.roleDescription, err.Error())
			return err
		}

		if err := dbInstance.Ping(); err != nil {
			fmt.Printf("\033[31mvirhe '%s' yhteydessä: %s\033[0m\n",
				conn.roleDescription, err.Error())
			return err
		}

		*conn.dbPointer = dbInstance
	}

	// Sovelluksen käynnistyessä otetaan käyttöön DbGuest
	Db = DbAdmin

	fmt.Println("Tietokantayhteydet avattu onnistuneesti.")
	return nil
}

func CloseDB() {
	if DbAdmin != nil {
		DbAdmin.Close()
	}
	if DbReaderOnly != nil {
		DbReaderOnly.Close()
	}
	if DbConfidential != nil {
		DbConfidential.Close()
	}
	if DbBasic != nil {
		DbBasic.Close()
	}
	if DbGuest != nil {
		DbGuest.Close()
	}
}
