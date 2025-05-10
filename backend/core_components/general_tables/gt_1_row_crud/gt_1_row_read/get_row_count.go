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

/* -----------------------------------------------------------------
 *  Tuetut paikkatietotyypit – laajenna tarvittaessa
 * ----------------------------------------------------------------*/
var geoUDTNames = []string{"geometry", "geography", "point"}

/* -----------------------------------------------------------------
 *  JSON-vastausrakenne
 * ----------------------------------------------------------------*/
type tableMetaResponse struct {
	RowCount    int      `json:"row_count"`
	HasGeo      bool     `json:"has_geo"`
	GeomColumns []string `json:"geom_columns"`
	GeomSources []string `json:"geom_sources"`
}

/* -----------------------------------------------------------------
 *  /api/get-row-count?table=taulun_nimi
 * ----------------------------------------------------------------*/
func GetRowCountHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "missing table parameter", http.StatusBadRequest)
		return
	}

	/* ---------- 1. Sessio & rooli ---------- */
	userID, err := e_sessions.GetUserIDFromSession(r)
	if err != nil || userID <= 0 {
		http.Error(w, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
		return
	}
	session, sessErr := e_sessions.GetStore().Get(r, "session")
	if sessErr != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", sessErr.Error())
		http.Error(w, "virhe session haussa", http.StatusInternalServerError)
		return
	}
	userRole, _ := session.Values["user_role"].(string)
	if userRole == "" {
		userRole = "guest"
	}

	roleDb := map[string]*sql.DB{
		"admin": backend.DbAdmin,
		"basic": backend.DbBasic,
		"guest": backend.DbGuest,
	}
	currentDb, ok := roleDb[userRole]
	if !ok {
		currentDb = roleDb["guest"]
	}

	/* ---------- 2. Rivimäärä ---------- */
	rowCount, err := getRowCount(currentDb, tableName, userRole)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "error counting rows", http.StatusInternalServerError)
		return
	}

	/* ---------- 3. Paikkatietostatukset ---------- */
	geomCols, err := getGeometryColumns(currentDb, tableName)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "error fetching geo columns", http.StatusInternalServerError)
		return
	}
	geomSrcs, err := getGeometrySourceTables(currentDb, tableName)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "error fetching geo sources", http.StatusInternalServerError)
		return
	}
	hasGeo := len(geomCols) > 0 || len(geomSrcs) > 0

	/* ---------- 4. JSON-vastaus ---------- */
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(tableMetaResponse{
		RowCount:    rowCount,
		HasGeo:      hasGeo,
		GeomColumns: geomCols,
		GeomSources: geomSrcs,
	})
}

/* -----------------------------------------------------------------
 *  Rivimäärän haku
 * ----------------------------------------------------------------*/
func getRowCount(db *sql.DB, tableName, userRole string) (int, error) {
	safe := pq.QuoteIdentifier(tableName)

	mustTrueCols, err := getMustBeTrueColumns(db, tableName)
	if err != nil {
		return 0, fmt.Errorf("error fetching must_be_true columns: %w", err)
	}

	where := ""
	if userRole != "admin" && len(mustTrueCols) > 0 {
		var cond []string
		for _, col := range mustTrueCols {
			cond = append(cond,
				fmt.Sprintf("%s.%s = TRUE", safe, pq.QuoteIdentifier(col)))
		}
		where = " WHERE " + strings.Join(cond, " AND ")
	}

	query := fmt.Sprintf("SELECT COUNT(*) FROM %s%s", safe, where)

	var cnt int
	if err := db.QueryRow(query).Scan(&cnt); err != nil {
		return 0, fmt.Errorf("error counting rows: %w", err)
	}
	return cnt, nil
}

/* -----------------------------------------------------------------
 *  1) Suorat geo-sarakkeet
 * ----------------------------------------------------------------*/
func getGeometryColumns(db *sql.DB, tableName string) ([]string, error) {
	const q = `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1
          AND udt_name = ANY($2)`
	rows, err := db.Query(q, tableName, pq.Array(geoUDTNames))
	if err != nil {
		return nil, fmt.Errorf("querying geo columns: %w", err)
	}
	defer rows.Close()

	var cols []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, fmt.Errorf("scanning geo column: %w", err)
		}
		cols = append(cols, c)
	}
	return cols, nil
}

/* -----------------------------------------------------------------
 *  2) FK-viittaukset tauluista, joilla on geo-sarakkeita
 *     → Jos jokin geo-taulu viittaa tähän tauluun, merkitään se
 *       lokaatiotauluksi (hasGeo = true)
 * ----------------------------------------------------------------*/
func getGeometrySourceTables(db *sql.DB, tableName string) ([]string, error) {
	const q = `
        SELECT DISTINCT tc.table_name
        FROM information_schema.table_constraints        tc
        JOIN information_schema.key_column_usage         kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage  ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name   = $1          -- 🔸 viittauskohde = nykyinen taulu
          AND EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = tc.table_name
                AND udt_name   = ANY($2)     -- 🔸 viittaavalla taululla geo-sarake
          );`
	rows, err := db.Query(q, tableName, pq.Array(geoUDTNames))
	if err != nil {
		return nil, fmt.Errorf("querying referencing geo tables: %w", err)
	}
	defer rows.Close()

	var srcs []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, fmt.Errorf("scanning referencing geo table: %w", err)
		}
		srcs = append(srcs, s)
	}
	return srcs, nil
}

// // file: getRowCount.go
// package gt_1_row_read

// import (
// 	"database/sql"
// 	"encoding/json"
// 	"fmt"
// 	"log"
// 	"net/http"
// 	"strings"

// 	"github.com/lib/pq"

// 	backend "easelect/backend/core_components"
// 	e_sessions "easelect/backend/core_components/sessions"
// )

// /* -----------------------------------------------------------------
//  *  Yleinen vastausrakenne – lisätty has_geo + listat
//  * ----------------------------------------------------------------*/
// type tableMetaResponse struct {
// 	RowCount    int      `json:"row_count"`
// 	HasGeo      bool     `json:"has_geo"`
// 	GeomColumns []string `json:"geom_columns"`
// 	GeomSources []string `json:"geom_sources"`
// }

// /* -----------------------------------------------------------------
//  *  /api/get-row-count?table=nimitaulu
//  * ----------------------------------------------------------------*/
// func GetRowCountHandlerWrapper(responseWriter http.ResponseWriter, request *http.Request) {
// 	tableName := request.URL.Query().Get("table")
// 	if tableName == "" {
// 		http.Error(responseWriter, "missing table parameter", http.StatusBadRequest)
// 		return
// 	}

// 	/* ---------- 1. Sessio- & roolitarkistukset ---------- */
// 	userID, err := e_sessions.GetUserIDFromSession(request)
// 	if err != nil || userID <= 0 {
// 		http.Error(responseWriter, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
// 		return
// 	}
// 	session, sessErr := e_sessions.GetStore().Get(request, "session")
// 	if sessErr != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", sessErr.Error())
// 		http.Error(responseWriter, "virhe session haussa", http.StatusInternalServerError)
// 		return
// 	}
// 	userRole, _ := session.Values["user_role"].(string)
// 	if userRole == "" {
// 		userRole = "guest"
// 	}

// 	roleDbMapping := map[string]*sql.DB{
// 		"admin": backend.DbAdmin,
// 		"basic": backend.DbBasic,
// 		"guest": backend.DbGuest,
// 	}
// 	currentDb, found := roleDbMapping[userRole]
// 	if !found {
// 		currentDb = roleDbMapping["guest"]
// 	}

// 	/* ---------- 2. Rivimäärä ---------- */
// 	rowCountValue, err := getRowCount(currentDb, tableName, userRole)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(responseWriter, "error counting rows", http.StatusInternalServerError)
// 		return
// 	}

// 	/* ---------- 3. Paikkatietostatukset ---------- */
// 	geomColumns, err := getGeometryColumns(currentDb, tableName)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(responseWriter, "error fetching geometry columns", http.StatusInternalServerError)
// 		return
// 	}
// 	geomSources, err := getGeometrySourceTables(currentDb, tableName)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(responseWriter, "error fetching geometry sources", http.StatusInternalServerError)
// 		return
// 	}
// 	hasGeo := len(geomColumns) > 0 || len(geomSources) > 0

// 	/* ---------- 4. JSON-vastaus ---------- */
// 	responseWriter.Header().Set("Content-Type", "application/json; charset=utf-8")
// 	json.NewEncoder(responseWriter).Encode(tableMetaResponse{
// 		RowCount:    rowCountValue,
// 		HasGeo:      hasGeo,
// 		GeomColumns: geomColumns,
// 		GeomSources: geomSources,
// 	})
// }

// /* -----------------------------------------------------------------
//  *  Rivimäärän haku – ennallaan
//  * ----------------------------------------------------------------*/
// func getRowCount(db *sql.DB, tableName, userRole string) (int, error) {
// 	safeTableName := pq.QuoteIdentifier(tableName)

// 	mustTrueCols, err := getMustBeTrueColumns(db, tableName)
// 	if err != nil {
// 		return 0, fmt.Errorf("error fetching must_be_true columns: %w", err)
// 	}

// 	whereClause := ""
// 	if userRole != "admin" && len(mustTrueCols) > 0 {
// 		var conditions []string
// 		for _, col := range mustTrueCols {
// 			conditions = append(conditions,
// 				fmt.Sprintf("%s.%s = TRUE", safeTableName, pq.QuoteIdentifier(col)))
// 		}
// 		whereClause = " WHERE " + strings.Join(conditions, " AND ")
// 	}

// 	queryStr := fmt.Sprintf("SELECT COUNT(*) FROM %s%s", safeTableName, whereClause)

// 	var rowCountValue int
// 	if err := db.QueryRow(queryStr).Scan(&rowCountValue); err != nil {
// 		return 0, fmt.Errorf("error counting rows: %w", err)
// 	}
// 	return rowCountValue, nil
// }

// /* -----------------------------------------------------------------
//  *  Suorat geometry-sarakkeet
//  * ----------------------------------------------------------------*/
// func getGeometryColumns(db *sql.DB, tableName string) ([]string, error) {
// 	const geomColsQuery = `
//         SELECT column_name
//         FROM information_schema.columns
//         WHERE table_name = $1
//           AND udt_name = 'geometry'`
// 	rows, err := db.Query(geomColsQuery, tableName)
// 	if err != nil {
// 		return nil, fmt.Errorf("querying geometry columns: %w", err)
// 	}
// 	defer rows.Close()

// 	var columns []string
// 	for rows.Next() {
// 		var col string
// 		if scanErr := rows.Scan(&col); scanErr != nil {
// 			return nil, fmt.Errorf("scanning geometry column name: %w", scanErr)
// 		}
// 		columns = append(columns, col)
// 	}
// 	return columns, nil
// }

// /* -----------------------------------------------------------------
//  *  Ulkoiset FK-viittaukset tauluihin, joissa geometry
//  * ----------------------------------------------------------------*/
// func getGeometrySourceTables(db *sql.DB, tableName string) ([]string, error) {
// 	const geomSourcesQuery = `
//         SELECT DISTINCT ccu.table_name
//         FROM information_schema.table_constraints tc
//         JOIN information_schema.key_column_usage kcu
//           ON tc.constraint_name = kcu.constraint_name
//         JOIN information_schema.constraint_column_usage ccu
//           ON ccu.constraint_name = tc.constraint_name
//         WHERE tc.table_name = $1
//           AND tc.constraint_type = 'FOREIGN KEY'
//           AND EXISTS (
//               SELECT 1
//               FROM information_schema.columns
//               WHERE table_name = ccu.table_name
//                 AND udt_name = 'geometry'
//           )`
// 	rows, err := db.Query(geomSourcesQuery, tableName)
// 	if err != nil {
// 		return nil, fmt.Errorf("querying geometry source tables: %w", err)
// 	}
// 	defer rows.Close()

// 	var sources []string
// 	for rows.Next() {
// 		var src string
// 		if scanErr := rows.Scan(&src); scanErr != nil {
// 			return nil, fmt.Errorf("scanning geometry source table: %w", scanErr)
// 		}
// 		sources = append(sources, src)
// 	}
// 	return sources, nil
// }

// // // file: getRowCount.go
// // package gt_1_row_read

// // import (
// // 	"database/sql"
// // 	"encoding/json"
// // 	"fmt"
// // 	"log"
// // 	"net/http"
// // 	"strings"

// // 	"github.com/lib/pq"

// // 	backend "easelect/backend/core_components"
// // 	e_sessions "easelect/backend/core_components/sessions"
// // )

// // // GetRowCountHandlerWrapper palauttaa annetun taulun rivimäärän JSON-muodossa
// // // huomioiden must_be_true-sarakkeet. Reitti on /api/get-row-count?table=NIMI
// // func GetRowCountHandlerWrapper(response_writer http.ResponseWriter, request *http.Request) {
// // 	tableName := request.URL.Query().Get("table")
// // 	if tableName == "" {
// // 		http.Error(response_writer, "missing table parameter", http.StatusBadRequest)
// // 		return
// // 	}

// // 	// Hae user_id ja user_role sessiosta
// // 	userID, err := e_sessions.GetUserIDFromSession(request)
// // 	if err != nil || userID <= 0 {
// // 		http.Error(response_writer, "Unauthorized: tarvitset kirjautumisen", http.StatusUnauthorized)
// // 		return
// // 	}
// // 	session, sessErr := e_sessions.GetStore().Get(request, "session")
// // 	if sessErr != nil {
// // 		log.Printf("\033[31mvirhe: %s\033[0m\n", sessErr.Error())
// // 		http.Error(response_writer, "virhe session haussa", http.StatusInternalServerError)
// // 		return
// // 	}
// // 	userRole, _ := session.Values["user_role"].(string)
// // 	if userRole == "" {
// // 		userRole = "guest"
// // 	}

// // 	// Valitse oikea tietokantayhteys roolin perusteella
// // 	roleDbMapping := map[string]*sql.DB{
// // 		"admin": backend.DbAdmin,
// // 		"basic": backend.DbBasic,
// // 		"guest": backend.DbGuest,
// // 	}
// // 	currentDb, found := roleDbMapping[userRole]
// // 	if !found {
// // 		currentDb = roleDbMapping["guest"]
// // 	}

// // 	// Lasketaan rivimäärä
// // 	rowCountValue, err := getRowCount(currentDb, tableName, userRole)
// // 	if err != nil {
// // 		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(response_writer, "error counting rows", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	response_writer.Header().Set("Content-Type", "application/json; charset=utf-8")
// // 	json.NewEncoder(response_writer).Encode(map[string]interface{}{
// // 		"row_count": rowCountValue,
// // 	})
// // }

// // // getRowCount laskee rivimäärän taulusta tableName.
// // // Mikäli rooli ei ole admin, lisätään must_be_true-sarakkeiden suodatus.
// // func getRowCount(db *sql.DB, tableName, userRole string) (int, error) {
// // 	safeTableName := pq.QuoteIdentifier(tableName)

// // 	// 1. Haetaan must_be_true -sarakkeet
// // 	mustTrueCols, err := getMustBeTrueColumns(db, tableName)
// // 	if err != nil {
// // 		return 0, fmt.Errorf("error fetching must_be_true columns: %w", err)
// // 	}

// // 	// 2. Kootaan mahdollinen WHERE-lause vain jos rooli != admin
// // 	whereClause := ""
// // 	if userRole != "admin" && len(mustTrueCols) > 0 {
// // 		var conditions []string
// // 		for _, col := range mustTrueCols {
// // 			conditions = append(conditions, fmt.Sprintf("%s.%s = TRUE", safeTableName, pq.QuoteIdentifier(col)))
// // 		}
// // 		whereClause = " WHERE " + strings.Join(conditions, " AND ")
// // 	}

// // 	// 3. Suoritetaan COUNT
// // 	queryStr := fmt.Sprintf("SELECT COUNT(*) FROM %s%s", safeTableName, whereClause)

// // 	var rowCountValue int
// // 	err = db.QueryRow(queryStr).Scan(&rowCountValue)
// // 	if err != nil {
// // 		return 0, fmt.Errorf("error counting rows: %w", err)
// // 	}

// // 	return rowCountValue, nil
// // }
