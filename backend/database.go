// database.go
package backend

import (
	"database/sql"

	_ "github.com/lib/pq"
)

// Db on paketin tasolla oleva muuttuja
var Db *sql.DB

// InitDB alustaa tietokantayhteyden
func InitDB() error {
	var err error
	connStr := "host=localhost port=5432 user=postgres password=my_passwd dbname=rapsa sslmode=disable"
	// connStr := "host=localhost port=5432 user=postgre_user password=ENYCcEBGiwDV6DY3ePaZ9WHRA8RrM0vfgyp2TOff92NHYpYrWfYr3ff92NHNq7C dbname=rapsa sslmode=disable"
	Db, err = sql.Open("postgres", connStr)
	if err != nil {
		return err
	}

	// Testaa yhteys
	err = Db.Ping()
	if err != nil {
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
