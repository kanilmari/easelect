// add_row_columns.go
// gt_1_row_create.go

package gt_1_row_create

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	backend "easelect/backend/main_app"
	"easelect/backend/main_app/general_tables/models"
)

// GetAddRowColumnsHandlerWrapper on HTTP-rajapintafunktio, joka hakee lisättävän rivin saraketiedot.
// Se ottaa vastaan "table"-parametrin, jonka avulla ohjataan varsinaiseen käsittelijään.
func GetAddRowColumnsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "Missing table parameter", http.StatusBadRequest)
		return
	}
	GetAddRowColumnsHandler(w, r, tableName)
}

// GetAddRowColumnsHandler hakee sarakkeiden tiedot tietylle taululle (tableName).
// HUOM: Poistettu system_column_details -taulun input_specs -tarkistukset ja niihin liittyvät JOIN:it.
// Samalla varmistetaan, ettei input_specs-saraketta edes haeta tietokannasta.
func GetAddRowColumnsHandler(w http.ResponseWriter, r *http.Request, tableName string) {
	schemaName := "public" // Mikäli skeeman nimi on eri, voit hakea sen toisaalta.

	columns, err := getAddRowColumnsWithTypes(tableName, schemaName)
	if err != nil {
		log.Printf("Virhe sarakkeiden haussa taululle %s: %v", tableName, err)
		http.Error(w, "Virhe sarakkeiden haussa", http.StatusInternalServerError)
		return
	}

	// Poissuljettavat sarakkeet
	excludeColumns := map[string]bool{
		"id":      true,
		"created": true,
		"updated": true,
		// Lisää muita tarvittaessa
	}

	// Luodaan lista, johon pakataan vain halutut saraketiedot
	var columnsForFrontend []models.AddRowColumnInfo
	for _, col := range columns {
		// Alla suodatetaan pois mm. identity-sarakkeet ja ne, joilla on column_default
		if excludeColumns[strings.ToLower(col.ColumnName)] {
			continue
		}
		if strings.ToUpper(col.IsIdentity) == "YES" || col.ColumnDefault != "" {
			continue
		}
		columnsForFrontend = append(columnsForFrontend, col)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(columnsForFrontend); err != nil {
		log.Printf("Virhe vastauksen enkoodauksessa: %v", err)
		http.Error(w, "Virhe vastauksen enkoodauksessa", http.StatusInternalServerError)
	}
}

// getAddRowColumnsWithTypes hakee saraketiedot tietokannan information_schema.columns -näkymästä.
// Poistettu viittaukset system_column_details -tauluun sekä input_specs-sarakkeeseen.
func getAddRowColumnsWithTypes(tableName, schemaName string) ([]models.AddRowColumnInfo, error) {
	query := `
        SELECT
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default,
            c.is_identity,
            c.generation_expression,
            fk_info.foreign_table_schema,
            fk_info.foreign_table_name,
            fk_info.foreign_column_name,
            c.udt_name
        FROM information_schema.columns c
        JOIN system_db_tables sdt
            ON sdt.table_name = c.table_name
        LEFT JOIN (
            SELECT
                kcu.column_name,
                ccu.table_schema AS foreign_table_schema,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE
                tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_name = $1
        ) AS fk_info
            ON c.column_name = fk_info.column_name
        WHERE
            c.table_schema = $2
            AND c.table_name = $1
        ORDER BY
            c.ordinal_position;
    `

	rows, err := backend.Db.Query(query, tableName, schemaName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []models.AddRowColumnInfo

	for rows.Next() {
		var col models.AddRowColumnInfo
		var columnDefault sql.NullString
		var generationExpression sql.NullString
		var foreignTableSchema sql.NullString
		var foreignTableName sql.NullString
		var foreignColumnName sql.NullString
		var udtName string

		if err := rows.Scan(
			&col.ColumnName,
			&col.DataType,
			&col.IsNullable,
			&columnDefault,
			&col.IsIdentity,
			&generationExpression,
			&foreignTableSchema,
			&foreignTableName,
			&foreignColumnName,
			&udtName,
		); err != nil {
			return nil, err
		}

		col.ColumnDefault = columnDefault.String
		col.GenerationExpression = generationExpression.String
		col.ForeignTableSchema = foreignTableSchema.String
		col.ForeignTableName = foreignTableName.String
		col.ForeignColumnName = foreignColumnName.String
		col.UdtName = udtName

		// Jos data_type == "USER-DEFINED" ja udt_name == "geometry", tulkitaan data_type = "geometry"
		if strings.ToLower(col.DataType) == "user-defined" && strings.ToLower(col.UdtName) == "geometry" {
			col.DataType = "geometry"
		}

		columns = append(columns, col)
	}

	return columns, nil
}

func GetAddRowColumnsOrdered(tableName string) ([]models.ColumnInfo, error) {
	// Huom: käytetään esimerkin vuoksi suoraan "SELECT ... ORDER BY co_number"
	query := `
        SELECT
            scd.column_uid,
            scd.column_name,
            scd.co_number
        FROM system_column_details scd
        JOIN system_db_tables sdt ON sdt.table_uid = scd.table_uid
        WHERE sdt.table_name = $1
        ORDER BY scd.co_number
    `

	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return nil, fmt.Errorf("error querying columns by co_number: %v", err)
	}
	defer rows.Close()

	var columns []models.ColumnInfo
	for rows.Next() {
		var col models.ColumnInfo
		err := rows.Scan(&col.ColumnUid, &col.ColumnName, &col.CoNumber)
		if err != nil {
			return nil, fmt.Errorf("error scanning column info: %v", err)
		}
		columns = append(columns, col)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %v", err)
	}

	return columns, nil
}

// // add_row_columns.go 2025-03-09--14-12
// package gt_1_row_create

// import (
// 	"database/sql"
// 	"encoding/json"
// 	"fmt"
// 	"log"
// 	"net/http"
// 	"strings"

// 	backend "easelect/backend/main_app"
// 	"easelect/backend/main_app/general_tables/models"
// )

// func GetAddRowColumnsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// 	tableName := r.URL.Query().Get("table")
// 	if tableName == "" {
// 		http.Error(w, "Missing table parameter", http.StatusBadRequest)
// 		return
// 	}
// 	GetAddRowColumnsHandler(w, r, tableName)
// }

// func GetAddRowColumnsHandler(w http.ResponseWriter, r *http.Request, tableName string) {
// 	schemaName := "public" // Voidaan tarvittaessa hakea skeeman nimi

// 	columns, err := getAddRowColumnsWithTypes(tableName, schemaName)
// 	if err != nil {
// 		log.Printf("Virhe sarakkeiden haussa taululle %s: %v", tableName, err)
// 		http.Error(w, "Virhe sarakkeiden haussa", http.StatusInternalServerError)
// 		return
// 	}

// 	// Poissuljettavat sarakkeet
// 	excludeColumns := map[string]bool{
// 		"id":      true,
// 		"created": true,
// 		"updated": true,
// 		// Lisää muita tarvittaessa
// 	}

// 	// Valmistele data frontendille
// 	var columnsForFrontend []models.AddRowColumnInfo
// 	for _, col := range columns {
// 		if excludeColumns[strings.ToLower(col.ColumnName)] || strings.ToUpper(col.IsIdentity) == "YES" || col.ColumnDefault != "" {
// 			continue
// 		}
// 		columnsForFrontend = append(columnsForFrontend, col)
// 	}

// 	w.Header().Set("Content-Type", "application/json")
// 	if err := json.NewEncoder(w).Encode(columnsForFrontend); err != nil {
// 		log.Printf("Virhe vastauksen enkoodauksessa: %v", err)
// 		http.Error(w, "Virhe vastauksen enkoodauksessa", http.StatusInternalServerError)
// 	}
// }

// func getAddRowColumnsWithTypes(tableName string, schemaName string) ([]models.AddRowColumnInfo, error) {
// 	query := `
//         SELECT
//             c.column_name,
//             c.data_type,
//             c.is_nullable,
//             c.column_default,
//             c.is_identity,
//             c.generation_expression,
//             fk_info.foreign_table_schema,
//             fk_info.foreign_table_name,
//             fk_info.foreign_column_name,
//             c.udt_name,
//             scd.input_specs
//         FROM information_schema.columns c
//         /* 1) JOINataan system_db_tables, jotta saamme table_uid:in  */
//         JOIN system_db_tables sdt
//           ON sdt.table_name = c.table_name
//           /* Voit halutessasi varmistaa, että sdt.table_schema = c.table_schema */
//           /* jos sinulla on schema-sarake system_db_tables:
//              AND sdt.table_schema = c.table_schema
//           */

//         /* 2) LEFT JOIN system_column_details siten, että table_uid matchaa
//            ja column_name on sama */
//         LEFT JOIN system_column_details scd
//           ON scd.table_uid = sdt.table_uid
//          AND scd.column_name = c.column_name

//         /* 3) Liitetään foreign key -tiedot pienellä ali-taululla */
//         LEFT JOIN (
//             SELECT
//                 kcu.column_name,
//                 ccu.table_schema AS foreign_table_schema,
//                 ccu.table_name AS foreign_table_name,
//                 ccu.column_name AS foreign_column_name
//             FROM
//                 information_schema.table_constraints AS tc
//             JOIN information_schema.key_column_usage AS kcu
//                 ON tc.constraint_name = kcu.constraint_name
//             JOIN information_schema.constraint_column_usage AS ccu
//                 ON ccu.constraint_name = tc.constraint_name
//             WHERE
//                 tc.constraint_type = 'FOREIGN KEY'
//                 /* Skeeman tarkistus, jos haluat */
//                 /* AND tc.table_schema = $2 */
//                 AND tc.table_name = $1
//         ) AS fk_info
//             ON c.column_name = fk_info.column_name
//            AND c.table_schema = fk_info.foreign_table_schema  -- tai miten haluat matkata

//         WHERE
//             c.table_schema = $2
//             AND c.table_name = $1
//         ORDER BY
//             c.ordinal_position;
//     `

// 	rows, err := backend.Db.Query(query, tableName, schemaName)
// 	if err != nil {
// 		return nil, err
// 	}
// 	defer rows.Close()

// 	var columns []models.AddRowColumnInfo

// 	for rows.Next() {
// 		var col models.AddRowColumnInfo
// 		var columnDefault sql.NullString
// 		var generationExpression sql.NullString
// 		var foreignTableSchema sql.NullString
// 		var foreignTableName sql.NullString
// 		var foreignColumnName sql.NullString
// 		var udtName string
// 		var inputSpecs sql.NullString

// 		if err := rows.Scan(
// 			&col.ColumnName,
// 			&col.DataType,
// 			&col.IsNullable,
// 			&columnDefault,
// 			&col.IsIdentity,
// 			&generationExpression,
// 			&foreignTableSchema,
// 			&foreignTableName,
// 			&foreignColumnName,
// 			&udtName,
// 			&inputSpecs,
// 		); err != nil {
// 			return nil, err
// 		}

// 		col.ColumnDefault = columnDefault.String
// 		col.GenerationExpression = generationExpression.String
// 		col.ForeignTableSchema = foreignTableSchema.String
// 		col.ForeignTableName = foreignTableName.String
// 		col.ForeignColumnName = foreignColumnName.String
// 		col.UdtName = udtName
// 		col.InputSpecs = inputSpecs.String // <-- scd-taulun sarake

// 		// Jos data_type == "USER-DEFINED" ja udt_name == "geometry", muutetaan col.DataType = "geometry"
// 		if strings.ToLower(col.DataType) == "user-defined" && strings.ToLower(col.UdtName) == "geometry" {
// 			col.DataType = "geometry"
// 		}

// 		columns = append(columns, col)
// 	}

// 	return columns, nil
// }

// func GetAddRowColumnsOrdered(tableName string) ([]models.ColumnInfo, error) {
// 	// Huom: käytetään esimerkin vuoksi suoraan "SELECT ... ORDER BY co_number"
// 	query := `
//         SELECT
//             scd.column_uid,
//             scd.column_name,
//             scd.co_number
//         FROM system_column_details scd
//         JOIN system_db_tables sdt ON sdt.table_uid = scd.table_uid
//         WHERE sdt.table_name = $1
//         ORDER BY scd.co_number
//     `

// 	rows, err := backend.Db.Query(query, tableName)
// 	if err != nil {
// 		return nil, fmt.Errorf("error querying columns by co_number: %v", err)
// 	}
// 	defer rows.Close()

// 	var columns []models.ColumnInfo
// 	for rows.Next() {
// 		var col models.ColumnInfo
// 		err := rows.Scan(&col.ColumnUid, &col.ColumnName, &col.CoNumber)
// 		if err != nil {
// 			return nil, fmt.Errorf("error scanning column info: %v", err)
// 		}
// 		columns = append(columns, col)
// 	}

// 	if err = rows.Err(); err != nil {
// 		return nil, fmt.Errorf("row iteration error: %v", err)
// 	}

// 	return columns, nil
// }
