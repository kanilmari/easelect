// referenced_table_data.go
package gt_1_row_create

import (
	backend "easelect/backend/core_components"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/lib/pq"
)

func GetReferencedTableData(w http.ResponseWriter, r *http.Request) {
	// Hae viitatun taulun nimi ja skeeman nimi URL-parametreista
	foreignTableName := r.URL.Query().Get("table")
	foreignSchemaName := r.URL.Query().Get("schema")
	if foreignTableName == "" {
		http.Error(w, "Viitattu taulu puuttuu", http.StatusBadRequest)
		return
	}
	if foreignSchemaName == "" {
		foreignSchemaName = "public"
	}

	// Hae viitatun taulun primary key -sarakkeet
	pkColumns, err := getPrimaryKeyColumns(foreignSchemaName, foreignTableName)
	if err != nil || len(pkColumns) == 0 {
		log.Printf("Virhe haettaessa primary key -sarakkeita taulusta %s: %v", foreignTableName, err)
		http.Error(w, "Virhe haettaessa primary key -sarakkeita", http.StatusInternalServerError)
		return
	}

	// Hae viitatun taulun sopiva näyttösarake (esim. ensimmäinen tekstityyppinen sarake)
	displayColumn, err := getDisplayColumn(foreignSchemaName, foreignTableName)
	if err != nil {
		log.Printf("Virhe haettaessa näyttösaraketta taulusta %s: %v", foreignTableName, err)
		http.Error(w, "Virhe haettaessa näyttösaraketta", http.StatusInternalServerError)
		return
	}

	// Luo SQL-kysely primary key -sarakkeiden ja näyttösarakkeen hakemiseksi
	selectColumns := append(pkColumns, displayColumn)
	query := fmt.Sprintf("SELECT %s FROM %s.%s", strings.Join(quoteIdentifiers(selectColumns), ", "), pq.QuoteIdentifier(foreignSchemaName), pq.QuoteIdentifier(foreignTableName))

	rows, err := backend.Db.Query(query)
	if err != nil {
		log.Printf("Virhe haettaessa dataa taulusta %s: %v", foreignTableName, err)
		http.Error(w, "Virhe haettaessa dataa viitatusta taulusta", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var options []map[string]interface{}
	for rows.Next() {
		// Luo slice skannattaville arvoille
		values := make([]interface{}, len(selectColumns))
		valuePtrs := make([]interface{}, len(selectColumns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			log.Printf("Virhe skannattaessa dataa taulusta %s: %v", foreignTableName, err)
			http.Error(w, "Virhe datan käsittelyssä", http.StatusInternalServerError)
			return
		}

		// Rakennetaan option-objekti
		option := make(map[string]interface{})
		// Lisää primary key -arvot
		for i, col := range pkColumns {
			option[col] = values[i]
		}
		// Lisää näyttösarake
		option["display"] = values[len(pkColumns)]

		options = append(options, option)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(options)
}

func getPrimaryKeyColumns(schemaName, tableName string) ([]string, error) {
	query := `
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = $1 AND tc.table_schema = $2 AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position;
    `
	rows, err := backend.Db.Query(query, tableName, schemaName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pkColumns []string
	for rows.Next() {
		var columnName string
		if err := rows.Scan(&columnName); err != nil {
			return nil, err
		}
		pkColumns = append(pkColumns, columnName)
	}
	return pkColumns, nil
}

func getDisplayColumn(schemaName, tableName string) (string, error) {
	query := `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2 AND data_type IN ('character varying', 'text')
        ORDER BY ordinal_position
        LIMIT 1;
    `
	var columnName string
	err := backend.Db.QueryRow(query, schemaName, tableName).Scan(&columnName)
	if err != nil {
		return "", err
	}
	return columnName, nil
}

func quoteIdentifiers(identifiers []string) []string {
	quoted := make([]string, len(identifiers))
	for i, id := range identifiers {
		quoted[i] = pq.QuoteIdentifier(id)
	}
	return quoted
}
