// referencing_tables.go
package gt_1_row_create

// import (
// 	"encoding/json"
// 	"fmt"
// 	"net/http"

// 	backend "easelect/backend/main_app"
// )

// // ReferencingTable edustaa lapsitaulun tietoja
// type ReferencingTable struct {
// 	ReferencingTableName  string `json:"referencing_table_name"`
// 	ReferencingColumnName string `json:"referencing_column_name"`
// 	ReferencedColumnName  string `json:"referenced_column_name"`
// 	ReferencedTableName   string `json:"referenced_table_name"`
// }

// // GetReferencingTablesHandlerWrapper hakee annettua taulua
// // viittaavat taulut dynaamisesti.
// func GetReferencingTablesHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// 	tableName := r.URL.Query().Get("table")
// 	if tableName == "" {
// 		http.Error(w, "missing 'table' query parameter", http.StatusBadRequest)
// 		return
// 	}
// 	if err := GetReferencingTablesHandler(w, tableName); err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe haettaessa viittaavia tauluja", http.StatusInternalServerError)
// 	}
// }

// func GetReferencingTablesHandler(w http.ResponseWriter, mainTableName string) error {
// 	query := `
// 	SELECT
// 		tc.table_name as referencing_table_name,
// 		kcu.column_name as referencing_column_name,
// 		ccu.column_name as referenced_column_name,
// 		ccu.table_name as referenced_table_name
// 	FROM
// 		information_schema.table_constraints tc
// 		JOIN information_schema.key_column_usage kcu
// 			ON tc.constraint_name = kcu.constraint_name
// 			AND tc.table_schema = kcu.table_schema
// 		JOIN information_schema.constraint_column_usage ccu
// 			ON ccu.constraint_name = tc.constraint_name
// 			AND ccu.table_schema = tc.table_schema
// 	WHERE
// 		tc.constraint_type = 'FOREIGN KEY'
// 		AND ccu.table_name = $1
// 	ORDER BY tc.table_name;
// 	`

// 	rows, err := backend.Db.Query(query, mainTableName)
// 	if err != nil {
// 		return err
// 	}
// 	defer rows.Close()

// 	var results []ReferencingTable
// 	for rows.Next() {
// 		var rt ReferencingTable
// 		if err := rows.Scan(
// 			&rt.ReferencingTableName,
// 			&rt.ReferencingColumnName,
// 			&rt.ReferencedColumnName,
// 			&rt.ReferencedTableName,
// 		); err != nil {
// 			return err
// 		}
// 		results = append(results, rt)
// 	}
// 	w.Header().Set("Content-Type", "application/json")
// 	if err := json.NewEncoder(w).Encode(results); err != nil {
// 		return err
// 	}
// 	return nil
// }

// // combined_references.go
// package gt_1_row_create

// import (
// 	"encoding/json"
// 	"fmt"
// 	"net/http"
// 	"strings"

// 	backend "easelect/backend/main_app"
// )

// // 1->m -rakenne
// type ReferencingTable struct {
// 	ReferencingTableName  string `json:"referencing_table_name"`
// 	ReferencingColumnName string `json:"referencing_column_name"`
// 	ReferencedColumnName  string `json:"referenced_column_name"`
// 	ReferencedTableName   string `json:"referenced_table_name"`
// }

// // monesta-moneen -rakenne
// type ManyToManyInfo struct {
// 	LinkTableName                string `json:"link_table_name"`
// 	MainTableFkColumn            string `json:"main_table_fk_column"`
// 	ReferencedColumnInMainTable  string `json:"referenced_column_in_main_table"`
// 	ThirdTableName               string `json:"third_table_name"`
// 	ThirdTableFkColumn           string `json:"third_table_fk_column"`
// 	ReferencedColumnInThirdTable string `json:"referenced_column_in_third_table"`
// }

// // Lopullinen vastaus, jossa 1->m -suhteet ja m->m -liitokset
// type AllReferencesResponse struct {
// 	Direct     []ReferencingTable `json:"direct"`
// 	ManyToMany []ManyToManyInfo   `json:"many_to_many"`
// }

// /*
// GetAllReferencesHandlerWrapper:

//   - Etsii suorat 1->m -viittaustaulut service_catalog-tauluun,
//     poissulkien linkkitaulut (m->m).
//   - Etsii monesta-moneen -linkkitaulut, jotka viittaavat
//     sekä service_catalog-tauluun että johonkin muuhun tauluun.
//   - Palauttaa molemmat listat yhtenä JSON-rakenteena.
// */
// func GetAllReferencesHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// 	// Jos haluat dynaamisen taulun, hae parametristä:
// 	//  mainTable := r.URL.Query().Get("table")
// 	//  jos se on tyhjä => palauta virhe
// 	// Tässä esimerkissä kovakoodataan "service_catalog"
// 	mainTable := "service_catalog"

// 	// 1) Hae suorat 1->m -referenssit
// 	directRefs, err := getDirectReferences(mainTable)
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe 1->m -viittausten haussa", http.StatusInternalServerError)
// 		return
// 	}

// 	// 2) Hae monesta-moneen -liitokset
// 	mmRefs, err := getManyToManyReferences(mainTable)
// 	if err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe monesta-moneen -liitosten haussa", http.StatusInternalServerError)
// 		return
// 	}

// 	result := AllReferencesResponse{
// 		Direct:     directRefs,
// 		ManyToMany: mmRefs,
// 	}

// 	w.Header().Set("Content-Type", "application/json")
// 	if err := json.NewEncoder(w).Encode(result); err != nil {
// 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// 		http.Error(w, "virhe JSON-enkoodauksessa", http.StatusInternalServerError)
// 		return
// 	}
// }

// // getDirectReferences hakee *vain* taulut, joilla on foreign key service_catalog-tauluun,
// // mutta ei foreign keytä muualle => aito 1->m, ei linkkitaulu
// func getDirectReferences(mainTable string) ([]ReferencingTable, error) {
// 	query := `
//         SELECT
//             tc.table_name AS referencing_table_name,
//             kcu.column_name AS referencing_column_name,
//             ccu.column_name AS referenced_column_name,
//             ccu.table_name AS referenced_table_name
//         FROM information_schema.table_constraints tc
//         JOIN information_schema.key_column_usage kcu
//             ON tc.constraint_name = kcu.constraint_name
//             AND tc.table_schema = kcu.table_schema
//         JOIN information_schema.constraint_column_usage ccu
//             ON ccu.constraint_name = tc.constraint_name
//             AND ccu.table_schema = tc.table_schema
//         WHERE
//             tc.constraint_type = 'FOREIGN KEY'
//             AND ccu.table_name = $1
//             -- Poissuljetaan ne taulut, joilla on FKey myös johonkin muuhun tauluun
//             AND NOT EXISTS (
//                 SELECT 1
//                 FROM information_schema.table_constraints tc2
//                 JOIN information_schema.constraint_column_usage ccu2
//                     ON tc2.constraint_name = ccu2.constraint_name
//                     AND tc2.table_schema = ccu.table_schema
//                 WHERE
//                     tc2.table_name = tc.table_name
//                     AND tc2.constraint_type = 'FOREIGN KEY'
//                     AND ccu2.table_name <> $1
//             )
//         ORDER BY
//             tc.table_name
//     `

// 	rows, err := backend.Db.Query(query, mainTable)
// 	if err != nil {
// 		return nil, err
// 	}
// 	defer rows.Close()

// 	var results []ReferencingTable
// 	for rows.Next() {
// 		var rt ReferencingTable
// 		err := rows.Scan(
// 			&rt.ReferencingTableName,
// 			&rt.ReferencingColumnName,
// 			&rt.ReferencedColumnName,
// 			&rt.ReferencedTableName,
// 		)
// 		if err != nil {
// 			return nil, err
// 		}
// 		results = append(results, rt)
// 	}
// 	return results, rows.Err()
// }

// // getManyToManyReferences hakee taulut, jotka viittaavat mainTableen
// // JA toiseen tauluun => monesta-moneen -linkkitaulut
// func getManyToManyReferences(mainTable string) ([]ManyToManyInfo, error) {
// 	query := `
//         WITH both_fks AS (
//             SELECT
//                 c1.conrelid::regclass      AS referencing_table,
//                 c1.conname                 AS constraint_to_main,
//                 c1.confrelid::regclass     AS main_table,
//                 c2.conname                 AS constraint_to_other,
//                 c2.confrelid::regclass     AS other_table
//             FROM pg_constraint c1
//             JOIN pg_constraint c2
//                 ON c1.conrelid = c2.conrelid
//             WHERE
//                 c1.contype = 'f'
//                 AND c2.contype = 'f'
//                 AND c1.confrelid = $1::regclass
//                 AND c2.confrelid <> $1::regclass
//         )
//         SELECT
//             referencing_table::text,
//             constraint_to_main,
//             main_table::text,
//             constraint_to_other,
//             other_table::text
//         FROM both_fks
//     `

// 	rows, err := backend.Db.Query(query, mainTable)
// 	if err != nil {
// 		return nil, err
// 	}
// 	defer rows.Close()

// 	var results []ManyToManyInfo
// 	for rows.Next() {
// 		var linkTable, conName1, refTable1, conName2, refTable2 string
// 		if err := rows.Scan(&linkTable, &conName1, &refTable1, &conName2, &refTable2); err != nil {
// 			return nil, err
// 		}

// 		// Etsi linkkitaulun foreign key -sarakkeet (sekä mainTableen että "kolmanteen" tauluun)
// 		fk1, err := getFkColumnDetails(linkTable, conName1)
// 		if err != nil {
// 			return nil, err
// 		}
// 		fk2, err := getFkColumnDetails(linkTable, conName2)
// 		if err != nil {
// 			return nil, err
// 		}

// 		info := ManyToManyInfo{
// 			LinkTableName:                linkTable,
// 			MainTableFkColumn:            fk1.fkColumnName,
// 			ReferencedColumnInMainTable:  fk1.refColumnName,
// 			ThirdTableName:               refTable2,
// 			ThirdTableFkColumn:           fk2.fkColumnName,
// 			ReferencedColumnInThirdTable: fk2.refColumnName,
// 		}
// 		results = append(results, info)
// 	}
// 	return results, rows.Err()
// }

// // getFkColumnDetails hakee constraintista tiedot: linkTable-sarake -> referoitu sarake
// type fkColumnDetail struct {
// 	fkColumnName  string
// 	refColumnName string
// }

// func getFkColumnDetails(linkTable string, constraintName string) (fkColumnDetail, error) {
// 	// 1. Erottele linkTable muodosta "public.service_keyword_relations"
// 	schemaName, tableName := splitSchemaAndTable(linkTable)

// 	// 2. Käytä parametreja kyselyssä
// 	query := `
// 		SELECT
// 			kcu.column_name as fk_column,
// 			ccu.column_name as referenced_column
// 		FROM information_schema.table_constraints tc
// 		JOIN information_schema.key_column_usage kcu
// 			ON tc.constraint_name = kcu.constraint_name
// 			AND tc.table_schema = kcu.table_schema
// 		JOIN information_schema.constraint_column_usage ccu
// 			ON ccu.constraint_name = tc.constraint_name
// 			AND ccu.table_schema = tc.table_schema
// 		WHERE
// 			tc.table_schema = $1
// 			AND tc.table_name = $2
// 			AND tc.constraint_name = $3
// 	`

// 	var res fkColumnDetail
// 	err := backend.Db.QueryRow(query, schemaName, tableName, constraintName).Scan(&res.fkColumnName, &res.refColumnName)
// 	if err != nil {
// 		return fkColumnDetail{}, err
// 	}
// 	return res, nil
// }

// func splitSchemaAndTable(fullName string) (string, string) {
// 	// jos "public.something", pilkotaan pisteen kohdalta
// 	// jos ei löydy pistettä, käytetään "public" oletuksena
// 	parts := strings.Split(fullName, ".")
// 	if len(parts) == 2 {
// 		return parts[0], parts[1]
// 	}
// 	// fallback
// 	return "public", fullName
// }

// // // Jos haluat, ota "contains" ja muut apufunktiot samaan tiedostoon, tai erilliseen helpers.go
// // func contains(slice []string, item string) bool {
// // 	item = strings.ToLower(item)
// // 	for _, s := range slice {
// // 		if strings.ToLower(s) == item {
// // 			return true
// // 		}
// // 	}
// // 	return false
// // }

// // // referencing_tables.go
// // package gt_1_row_create

// // import (
// // 	"encoding/json"
// // 	"fmt"
// // 	"net/http"

// // 	backend "easelect/backend/main_app"
// // )

// // type ReferencingTable struct {
// // 	ReferencingTableName  string `json:"referencing_table_name"`
// // 	ReferencingColumnName string `json:"referencing_column_name"`
// // 	ReferencedColumnName  string `json:"referenced_column_name"`
// // 	ReferencedTableName   string `json:"referenced_table_name"`
// // }

// // /*
// // GetReferencingTablesHandlerWrapper hakee annettua taulua
// // viittaavat taulut (1->m). Poissuljetaan ne taulut, jotka
// // viittaavat myös johonkin muuhun tauluun – eli M2M-linkkitaulut.
// // */
// // func GetReferencingTablesHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// // 	tableName := r.URL.Query().Get("table")
// // 	if tableName == "" {
// // 		http.Error(w, "missing 'table' query parameter", http.StatusBadRequest)
// // 		return
// // 	}
// // 	if err := GetReferencingTablesHandler(w, tableName); err != nil {
// // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // 		http.Error(w, "virhe haettaessa 1-m -viittaavia tauluja", http.StatusInternalServerError)
// // 	}
// // }

// // func GetReferencingTablesHandler(w http.ResponseWriter, mainTableName string) error {
// // 	/*
// // 	   Rajataan kyselyyn vain ne taulut, joilla on FOREIGN KEY mainTableNameen
// // 	   JA joilla EI ole toista FOREIGN KEY:tä, joka viittaisi eri tauluun
// // 	   (eli skipataan linkkitaulut, jotka ovat m2m).
// // 	*/
// // 	query := `
// // 		SELECT
// // 			tc.table_name as referencing_table_name,
// // 			kcu.column_name as referencing_column_name,
// // 			ccu.column_name as referenced_column_name,
// // 			ccu.table_name as referenced_table_name
// // 		FROM information_schema.table_constraints tc
// // 		JOIN information_schema.key_column_usage kcu
// // 			ON tc.constraint_name = kcu.constraint_name
// // 			AND tc.table_schema = kcu.table_schema
// // 		JOIN information_schema.constraint_column_usage ccu
// // 			ON ccu.constraint_name = tc.constraint_name
// // 			AND ccu.table_schema = tc.table_schema
// // 		WHERE
// // 			tc.constraint_type = 'FOREIGN KEY'
// // 			AND ccu.table_name = $1
// // 			-- Poissuljetaan ne, jotka viittaavat myös muihin tauluihin
// // 			AND NOT EXISTS (
// // 				SELECT 1
// // 				FROM information_schema.table_constraints tc2
// // 				JOIN information_schema.constraint_column_usage ccu2
// // 					ON tc2.constraint_name = ccu2.constraint_name
// // 					AND tc2.table_schema = ccu.table_schema
// // 				WHERE
// // 					tc2.table_name = tc.table_name
// // 					AND tc2.constraint_type = 'FOREIGN KEY'
// // 					AND ccu2.table_name <> $1
// // 			)
// // 		ORDER BY tc.table_name
// // 	`

// // 	rows, err := backend.Db.Query(query, mainTableName)
// // 	if err != nil {
// // 		return err
// // 	}
// // 	defer rows.Close()

// // 	var results []ReferencingTable
// // 	for rows.Next() {
// // 		var rt ReferencingTable
// // 		if err := rows.Scan(
// // 			&rt.ReferencingTableName,
// // 			&rt.ReferencingColumnName,
// // 			&rt.ReferencedColumnName,
// // 			&rt.ReferencedTableName,
// // 		); err != nil {
// // 			return err
// // 		}
// // 		results = append(results, rt)
// // 	}

// // 	w.Header().Set("Content-Type", "application/json")
// // 	if err := json.NewEncoder(w).Encode(results); err != nil {
// // 		return err
// // 	}
// // 	return nil
// // }

// // // // referencing_tables.go
// // // package gt_1_row_create

// // // import (
// // // 	"encoding/json"
// // // 	"fmt"
// // // 	"net/http"

// // // 	backend "easelect/backend/main_app"
// // // )

// // // // ReferencingTable edustaa lapsitaulun tietoja
// // // type ReferencingTable struct {
// // // 	ReferencingTableName  string `json:"referencing_table_name"`
// // // 	ReferencingColumnName string `json:"referencing_column_name"`
// // // 	ReferencedColumnName  string `json:"referenced_column_name"`
// // // 	ReferencedTableName   string `json:"referenced_table_name"`
// // // }

// // // // GetReferencingTablesHandlerWrapper hakee annettua taulua
// // // // viittaavat taulut dynaamisesti.
// // // func GetReferencingTablesHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// // // 	tableName := r.URL.Query().Get("table")
// // // 	if tableName == "" {
// // // 		http.Error(w, "missing 'table' query parameter", http.StatusBadRequest)
// // // 		return
// // // 	}
// // // 	if err := GetReferencingTablesHandler(w, tableName); err != nil {
// // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // 		http.Error(w, "virhe haettaessa viittaavia tauluja", http.StatusInternalServerError)
// // // 	}
// // // }

// // // func GetReferencingTablesHandler(w http.ResponseWriter, mainTableName string) error {
// // // 	query := `
// // // 	SELECT
// // // 		tc.table_name as referencing_table_name,
// // // 		kcu.column_name as referencing_column_name,
// // // 		ccu.column_name as referenced_column_name,
// // // 		ccu.table_name as referenced_table_name
// // // 	FROM
// // // 		information_schema.table_constraints tc
// // // 		JOIN information_schema.key_column_usage kcu
// // // 			ON tc.constraint_name = kcu.constraint_name
// // // 			AND tc.table_schema = kcu.table_schema
// // // 		JOIN information_schema.constraint_column_usage ccu
// // // 			ON ccu.constraint_name = tc.constraint_name
// // // 			AND ccu.table_schema = tc.table_schema
// // // 	WHERE
// // // 		tc.constraint_type = 'FOREIGN KEY'
// // // 		AND ccu.table_name = $1
// // // 	ORDER BY tc.table_name;
// // // 	`

// // // 	rows, err := backend.Db.Query(query, mainTableName)
// // // 	if err != nil {
// // // 		return err
// // // 	}
// // // 	defer rows.Close()

// // // 	var results []ReferencingTable
// // // 	for rows.Next() {
// // // 		var rt ReferencingTable
// // // 		if err := rows.Scan(
// // // 			&rt.ReferencingTableName,
// // // 			&rt.ReferencingColumnName,
// // // 			&rt.ReferencedColumnName,
// // // 			&rt.ReferencedTableName,
// // // 		); err != nil {
// // // 			return err
// // // 		}
// // // 		results = append(results, rt)
// // // 	}
// // // 	w.Header().Set("Content-Type", "application/json")
// // // 	if err := json.NewEncoder(w).Encode(results); err != nil {
// // // 		return err
// // // 	}
// // // 	return nil
// // // }

// // // // // referencing_tables.go
// // // // package gt_1_row_create

// // // // import (
// // // // 	"encoding/json"
// // // // 	"fmt"
// // // // 	"net/http"

// // // // 	backend "easelect/backend/main_app"
// // // // )

// // // // /*
// // // // GetReferencingTablesHandlerWrapper hakee annettua taulua
// // // // viittaavat taulut dynaamisesti. Palauttaa myös sen,
// // // // mikä sarake lapsitaulussa viittaa mihinkin sarakkeeseen
// // // // päätuolussa.
// // // // */
// // // // func GetReferencingTablesHandlerWrapper(w http.ResponseWriter, r *http.Request) {
// // // // 	tableName := r.URL.Query().Get("table")
// // // // 	if tableName == "" {
// // // // 		http.Error(w, "missing 'table' query parameter", http.StatusBadRequest)
// // // // 		return
// // // // 	}
// // // // 	if err := GetReferencingTablesHandler(w, tableName); err != nil {
// // // // 		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
// // // // 		http.Error(w, "virhe haettaessa viittaavia tauluja", http.StatusInternalServerError)
// // // // 	}
// // // // }

// // // // type ReferencingTable struct {
// // // // 	ReferencingTableName  string `json:"referencing_table_name"`
// // // // 	ReferencingColumnName string `json:"referencing_column_name"`
// // // // 	ReferencedColumnName  string `json:"referenced_column_name"`
// // // // 	ReferencedTableName   string `json:"referenced_table_name"`
// // // // }

// // // // func GetReferencingTablesHandler(w http.ResponseWriter, mainTableName string) error {
// // // // 	/*
// // // // 	   Hae tietokannasta kaikki constraintit, joissa confrelid = mainTableName (ts. lapsitaulu viittaa mainTableNameen).
// // // // 	   Palauta lapsitaulu + lapsen sarake + päärivi-sarake
// // // // 	*/
// // // // 	query := `
// // // // 	SELECT
// // // // 		tc.table_name as referencing_table_name,
// // // // 		kcu.column_name as referencing_column_name,
// // // // 		ccu.column_name as referenced_column_name,
// // // // 		ccu.table_name as referenced_table_name
// // // // 	FROM
// // // // 		information_schema.table_constraints tc
// // // // 		JOIN information_schema.key_column_usage kcu
// // // // 			ON tc.constraint_name = kcu.constraint_name
// // // // 			AND tc.table_schema = kcu.table_schema
// // // // 		JOIN information_schema.constraint_column_usage ccu
// // // // 			ON ccu.constraint_name = tc.constraint_name
// // // // 			AND ccu.table_schema = tc.table_schema
// // // // 	WHERE
// // // // 		tc.constraint_type = 'FOREIGN KEY'
// // // // 		AND ccu.table_name = $1
// // // // 	ORDER BY tc.table_name;
// // // // 	`

// // // // 	rows, err := backend.Db.Query(query, mainTableName)
// // // // 	if err != nil {
// // // // 		return err
// // // // 	}
// // // // 	defer rows.Close()

// // // // 	var results []ReferencingTable
// // // // 	for rows.Next() {
// // // // 		var rt ReferencingTable
// // // // 		if err := rows.Scan(
// // // // 			&rt.ReferencingTableName,
// // // // 			&rt.ReferencingColumnName,
// // // // 			&rt.ReferencedColumnName,
// // // // 			&rt.ReferencedTableName,
// // // // 		); err != nil {
// // // // 			return err
// // // // 		}
// // // // 		results = append(results, rt)
// // // // 	}
// // // // 	w.Header().Set("Content-Type", "application/json")
// // // // 	if err := json.NewEncoder(w).Encode(results); err != nil {
// // // // 		return err
// // // // 	}
// // // // 	return nil
// // // // }
