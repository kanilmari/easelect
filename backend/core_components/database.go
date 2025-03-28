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
	Db = DbGuest

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

// // database.go
// package backend

// import (
// 	"database/sql"
// 	"fmt"
// 	"os"

// 	"github.com/joho/godotenv"
// 	_ "github.com/lib/pq"
// )

// var (
// 	// Db = pääyhteys koko sovellukselle (kaikki oikeudet), admin-mode käyttää yksinomaan tätä
// 	DbAdmin *sql.DB

// 	// DbReaderOnly = AI:n read-only -yhteys
// 	DbReaderOnly *sql.DB

// 	// DbRestricted = rajattu yhteys restricted.user_data -tauluun
// 	DbConfidential *sql.DB

// 	// Jos admin mode on poissa päältä, käytetään tätä yhteyttä peruskäyttäjille:
// 	DbBasic *sql.DB

// 	// Jos admin mode ja basic mode on poissa päältä, käytetään tätä yhteyttä vierailijoille:
// 	DbGuest *sql.DB
// )

// func InitDB() error {
// 	if err := godotenv.Load(); err != nil {
// 		fmt.Printf("\033[31mvirhe .env-latauksessa: %s\033[0m\n", err.Error())
// 		// Ei välttämättä lopeteta, jos halutaan tukea myös
// 		// tilannetta ilman .env-tiedostoa.
// 	}

// 	dbHost := os.Getenv("DB_HOST")
// 	dbPort := os.Getenv("DB_PORT")
// 	dbName := os.Getenv("DB_NAME")

// 	// Rakennetaan “taulukko” (slice) tietokantayhteyksistä,
// 	// jotta voimme avata jokaisen luupissa:
// 	type DbConnectionInfo struct {
// 		roleDescription   string
// 		dbUserEnv         string
// 		dbPasswordEnv     string
// 		dbPointer         **sql.DB
// 		specialPrivileges bool // Onko kyseessä korvaamaton tunnus, eli onko roolilla oikeuksia, joita millään muulla roolilla ei ole
// 	}

// 	dbConnectionList := []DbConnectionInfo{
// 		{
// 			roleDescription:   "Access to public",
// 			dbUserEnv:         os.Getenv("DB_ADMIN_USER"),
// 			dbPasswordEnv:     os.Getenv("DB_ADMIN_PASSWORD"),
// 			dbPointer:         &DbAdmin,
// 			specialPrivileges: true,
// 		},
// 		{
// 			roleDescription:   "Read-only access to public, great for AI SQL queries",
// 			dbUserEnv:         os.Getenv("DB_READONLY_USER"),
// 			dbPasswordEnv:     os.Getenv("DB_READONLY_PASSWORD"),
// 			dbPointer:         &DbReaderOnly,
// 			specialPrivileges: false,
// 		},
// 		{
// 			roleDescription:   "Access only to confidential data",
// 			dbUserEnv:         os.Getenv("DB_CONFIDENTIAL_USER"),
// 			dbPasswordEnv:     os.Getenv("DB_CONFIDENTIAL_PASSWORD"),
// 			dbPointer:         &DbConfidential,
// 			specialPrivileges: true,
// 		},
// 		{
// 			roleDescription:   "Basic user can't see if they have been muted, etc.",
// 			dbUserEnv:         os.Getenv("DB_BASIC_USER"),
// 			dbPasswordEnv:     os.Getenv("DB_BASIC_PASSWORD"),
// 			dbPointer:         &DbBasic,
// 			specialPrivileges: false,
// 		},
// 		{
// 			roleDescription:   "Guest user can't see users, etc.",
// 			dbUserEnv:         os.Getenv("DB_GUEST_USER"),
// 			dbPasswordEnv:     os.Getenv("DB_GUEST_PASSWORD"),
// 			dbPointer:         &DbGuest,
// 			specialPrivileges: false,
// 		},
// 	}

// 	for _, conn := range dbConnectionList {
// 		connectionString := fmt.Sprintf(
// 			"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
// 			dbHost, dbPort, conn.dbUserEnv, conn.dbPasswordEnv, dbName,
// 		)

// 		dbInstance, err := sql.Open("postgres", connectionString)
// 		if err != nil {
// 			fmt.Printf("\033[31mvirhe %s avauksessa: %s\033[0m\n",
// 				conn.roleDescription, err.Error())
// 			return err
// 		}

// 		if err := dbInstance.Ping(); err != nil {
// 			fmt.Printf("\033[31mvirhe '%s' yhteydessä: %s\033[0m\n",
// 				conn.roleDescription, err.Error())
// 			return err
// 		}

// 		// Asetetaan osoitettu globaali *sql.DB tämän yhteyden instanssiin
// 		*conn.dbPointer = dbInstance

// 		// // Voidaan samalla logittaa, onko yhteydellä “erityisoikeuksia”
// 		// fmt.Printf("Rooli: %s, specialPrivileges: %v\n",
// 		// 	conn.roleDescription, conn.specialPrivileges)
// 	}

// 	fmt.Println("Tietokantayhteydet avattu onnistuneesti.")
// 	return nil
// }

// func CloseDB() {
// 	if DbAdmin != nil {
// 		DbAdmin.Close()
// 	}
// 	if DbReaderOnly != nil {
// 		DbReaderOnly.Close()
// 	}
// 	if DbConfidential != nil {
// 		DbConfidential.Close()
// 	}
// 	if DbBasic != nil {
// 		DbBasic.Close()
// 	}
// 	if DbGuest != nil {
// 		DbGuest.Close()
// 	}
// }

// // // database.go
// // package backend

// // import (
// // 	"database/sql"
// // 	"fmt"
// // 	"os"

// // 	"github.com/joho/godotenv"
// // 	_ "github.com/lib/pq"
// // )

// // var (
// // 	// Db = pääyhteys koko sovellukselle (kaikki oikeudet)
// // 	Db *sql.DB

// // 	// DbReaderOnly = AI:n read-only -yhteys
// // 	DbReaderOnly *sql.DB

// // 	// DbRestricted = rajattu yhteys restricted.user_data -tauluun
// // 	DbRestricted *sql.DB
// // )

// // func InitDB() error {
// // 	if err := godotenv.Load(); err != nil {
// // 		fmt.Println("Virhe .env-latauksessa:", err)
// // 		// Ei välttämättä lopeteta, jos halutaan tukea myös
// // 		// tilannetta ilman .env-tiedostoa.
// // 	}

// // 	// Luetaan tarvittavat environment-muuttujat
// // 	dbHost := os.Getenv("DB_HOST")
// // 	dbPort := os.Getenv("DB_PORT")

// // 	dbUser := os.Getenv("DB_USER") // Pääkäyttäjä
// // 	dbPassword := os.Getenv("DB_PASSWORD")

// // 	dbROUser := os.Getenv("DB_READONLY_USER")
// // 	dbROPass := os.Getenv("DB_READONLY_PASSWORD")

// // 	// Rajattu käyttäjä restricted-skeemaan
// // 	dbRestrictedUser := os.Getenv("DB_RESTRICTED_USER")
// // 	dbRestrictedPass := os.Getenv("DB_RESTRICTED_PASSWORD")

// // 	dbName := os.Getenv("DB_NAME")

// // 	// 1) Pääyhteyden connect-string
// // 	connMain := fmt.Sprintf(
// // 		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
// // 		dbHost, dbPort, dbUser, dbPassword, dbName,
// // 	)

// // 	// 2) Read-only-käyttäjän connect-string
// // 	connReadOnly := fmt.Sprintf(
// // 		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
// // 		dbHost, dbPort, dbROUser, dbROPass, dbName,
// // 	)

// // 	// 3) Rajatun käyttäjän connect-string
// // 	connRestricted := fmt.Sprintf(
// // 		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
// // 		dbHost, dbPort, dbRestrictedUser, dbRestrictedPass, dbName,
// // 	)

// // 	var err error

// // 	// Avataan pääyhteys
// // 	Db, err = sql.Open("postgres", connMain)
// // 	if err != nil {
// // 		return fmt.Errorf("virhe pääyhteyden avauksessa: %v", err)
// // 	}
// // 	if err := Db.Ping(); err != nil {
// // 		return fmt.Errorf("ping-virhe pääyhteydelle: %v", err)
// // 	}

// // 	// Avataan read-only-yhteys
// // 	DbReaderOnly, err = sql.Open("postgres", connReadOnly)
// // 	if err != nil {
// // 		return fmt.Errorf("virhe read-only-yhteyden avauksessa: %v", err)
// // 	}
// // 	if err := DbReaderOnly.Ping(); err != nil {
// // 		return fmt.Errorf("ping-virhe read-only-yhteydelle: %v", err)
// // 	}

// // 	// Avataan rajatun käyttäjän yhteys restricted-tauluihin
// // 	DbRestricted, err = sql.Open("postgres", connRestricted)
// // 	if err != nil {
// // 		return fmt.Errorf("virhe rajatun yhteyden avauksessa: %v", err)
// // 	}
// // 	if err := DbRestricted.Ping(); err != nil {
// // 		return fmt.Errorf("ping-virhe rajatulle yhteydelle: %v", err)
// // 	}

// // 	fmt.Println("Tietokantayhteydet avattu onnistuneesti.")
// // 	return nil
// // }

// // func CloseDB() {
// // 	if Db != nil {
// // 		Db.Close()
// // 	}
// // 	if DbReaderOnly != nil {
// // 		DbReaderOnly.Close()
// // 	}
// // 	if DbRestricted != nil {
// // 		DbRestricted.Close()
// // 	}
// // }

// // // // database.go
// // // package backend

// // // import (
// // // 	"database/sql"
// // // 	"fmt"
// // // 	"os"

// // // 	"github.com/joho/godotenv"
// // // 	_ "github.com/lib/pq"
// // // )

// // // var (
// // // 	// Db = pääyhteys koko sovellukselle (kaikki oikeudet)
// // // 	Db *sql.DB

// // // 	// DbReaderOnly = AI:n read-only -yhteys
// // // 	DbReaderOnly *sql.DB
// // // )

// // // func InitDB() error {
// // // 	// Ladataan .env
// // // 	if err := godotenv.Load(); err != nil {
// // // 		fmt.Println("Virhe .env-latauksessa:", err)
// // // 		// Ei välttämättä palauteta erroria, jos haluaa tukea myös
// // // 		// tilannetta ilman .env-tiedostoa. Makuasia.
// // // 	}

// // // 	// Luetaan tarvittavat environment-muuttujat
// // // 	dbHost := os.Getenv("DB_HOST")
// // // 	dbPort := os.Getenv("DB_PORT")

// // // 	dbUser := os.Getenv("DB_USER")
// // // 	dbPassword := os.Getenv("DB_PASSWORD")

// // // 	dbROUser := os.Getenv("DB_READONLY_USER")
// // // 	dbROPass := os.Getenv("DB_READONLY_PASSWORD")

// // // 	dbName := os.Getenv("DB_NAME")

// // // 	// 1) Pääkäyttäjän connect-string
// // // 	connMain := fmt.Sprintf(
// // // 		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
// // // 		dbHost, dbPort, dbUser, dbPassword, dbName,
// // // 	)

// // // 	// 2) Read-only-käyttäjän connect-string
// // // 	connReadOnly := fmt.Sprintf(
// // // 		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
// // // 		dbHost, dbPort, dbROUser, dbROPass, dbName,
// // // 	)

// // // 	// Avataan pääyhteys
// // // 	var err error
// // // 	Db, err = sql.Open("postgres", connMain)
// // // 	if err != nil {
// // // 		return fmt.Errorf("virhe pääyhteyden avauksessa: %v", err)
// // // 	}
// // // 	// Testataan
// // // 	if err := Db.Ping(); err != nil {
// // // 		return fmt.Errorf("ping-virhe pääyhteydelle: %v", err)
// // // 	}

// // // 	// Avataan read-only-yhteys
// // // 	DbReaderOnly, err = sql.Open("postgres", connReadOnly)
// // // 	if err != nil {
// // // 		return fmt.Errorf("virhe read-only-yhteyden avauksessa: %v", err)
// // // 	}
// // // 	if err := DbReaderOnly.Ping(); err != nil {
// // // 		return fmt.Errorf("ping-virhe read-only-yhteydelle: %v", err)
// // // 	}

// // // 	fmt.Println("Tietokantayhteydet avattu onnistuneesti.")
// // // 	return nil
// // // }

// // // func CloseDB() {
// // // 	if Db != nil {
// // // 		Db.Close()
// // // 	}
// // // 	if DbReaderOnly != nil {
// // // 		DbReaderOnly.Close()
// // // 	}
// // // }
