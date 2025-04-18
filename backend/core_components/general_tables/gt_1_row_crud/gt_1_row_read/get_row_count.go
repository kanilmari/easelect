// file: getRowCount.go
package gt_1_row_read

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/lib/pq"

	backend "easelect/backend/core_components"
	e_sessions "easelect/backend/core_components/sessions"
)

// GetRowCountHandlerWrapper palauttaa annetun taulun rivimäärän JSON-muodossa
// huomioiden must_be_true-sarakkeet. Reitti on /api/get-row-count?table=NIMI
func GetRowCountHandlerWrapper(response_writer http.ResponseWriter, request *http.Request) {
	tableName := request.URL.Query().Get("table")
	if tableName == "" {
		http.Error(response_writer, "missing table parameter", http.StatusBadRequest)
		return
	}

	// Hae user_id ja user_role sessiosta
	userID, err := e_sessions.GetUserIDFromSession(request)
	if err != nil || userID <= 0 {
		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
		return
	}
	session, sessErr := e_sessions.GetStore().Get(request, "session")
	if sessErr != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", sessErr.Error())
		http.Error(response_writer, "virhe session haussa", http.StatusInternalServerError)
		return
	}
	userRole, _ := session.Values["user_role"].(string)
	if userRole == "" {
		userRole = "guest"
	}

	// Valitse oikea tietokantayhteys roolin perusteella
	roleDbMapping := map[string]*sql.DB{
		"admin": backend.DbAdmin,
		"basic": backend.DbBasic,
		"guest": backend.DbGuest,
	}
	currentDb, found := roleDbMapping[userRole]
	if !found {
		currentDb = roleDbMapping["guest"]
	}

	// Lasketaan rivimäärä
	rowCountValue, err := getRowCount(currentDb, tableName, userRole)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(response_writer, "error counting rows", http.StatusInternalServerError)
		return
	}

	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(response_writer).Encode(map[string]interface{}{
		"row_count": rowCountValue,
	})
}

// getRowCount laskee rivimäärän taulusta tableName.
// Mikäli rooli ei ole admin, lisätään must_be_true-sarakkeiden suodatus.
func getRowCount(db *sql.DB, tableName, userRole string) (int, error) {
	safeTableName := pq.QuoteIdentifier(tableName)

	// 1. Haetaan must_be_true -sarakkeet
	mustTrueCols, err := getMustBeTrueColumns(db, tableName)
	if err != nil {
		return 0, fmt.Errorf("error fetching must_be_true columns: %w", err)
	}

	// 2. Kootaan mahdollinen WHERE-lause vain jos rooli != admin
	whereClause := ""
	if userRole != "admin" && len(mustTrueCols) > 0 {
		var conditions []string
		for _, col := range mustTrueCols {
			conditions = append(conditions, fmt.Sprintf("%s.%s = TRUE", safeTableName, pq.QuoteIdentifier(col)))
		}
		whereClause = " WHERE " + strings.Join(conditions, " AND ")
	}

	// 3. Suoritetaan COUNT
	queryStr := fmt.Sprintf("SELECT COUNT(*) FROM %s%s", safeTableName, whereClause)

	var rowCountValue int
	err = db.QueryRow(queryStr).Scan(&rowCountValue)
	if err != nil {
		return 0, fmt.Errorf("error counting rows: %w", err)
	}

	return rowCountValue, nil
}

// package gt_1_row_read

// import (
// 	backend "easelect/backend/core_components"
// 	"encoding/json"
// 	"fmt"
// 	"log"
// 	"net/http"

// 	"github.com/lib/pq"
// )

// // GetRowCountHandlerWrapper palauttaa annetun taulun rivimäärän JSON-muodossa.
// // Reitti on /api/get-row-count?table=NIMI
// func GetRowCountHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// 	table_name := r.URL.Query().Get("table")
// 	if table_name == "" {
// 		http.Error(w, "missing table parameter", http.StatusBadRequest)
// 		return
// 	}

// 	row_count_value, err := get_row_count(table_name)
// 	if err != nil {
// 		log.Printf("error getting row count for table %s: %v", table_name, err)
// 		http.Error(w, "error counting rows", http.StatusInternalServerError)
// 		return
// 	}

// 	w.Header().Set("Content-Type", "application/json; charset=utf-8")
// 	json.NewEncoder(w).Encode(map[string]interface{}{
// 		"row_count": row_count_value,
// 	})
// }

// // get_row_count lukee rivimäärän taulusta table_name.
// func get_row_count(table_name string) (int, error) {
// 	// Käytä pq.QuoteIdentifier suojaamaan taulun nimeä
// 	safe_table_name := pq.QuoteIdentifier(table_name)
// 	query_str := fmt.Sprintf("SELECT COUNT(*) FROM %s", safe_table_name)

// 	var row_count_value int
// 	err := backend.Db.QueryRow(query_str).Scan(&row_count_value)
// 	if err != nil {
// 		return 0, fmt.Errorf("error counting rows: %w", err)
// 	}
// 	return row_count_value, nil
// }
