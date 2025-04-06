// utils.go
package utils

import (
	backend "easelect/backend/core_components"
	"fmt"
	"log"
	"strings"
)

type ForeignKey struct {
	ReferencingColumn string
	ReferencedTable   string
	ReferencedColumn  string
	NameColumn        string
}

func GetForeignKeysForTable(tableName string) (map[string]ForeignKey, error) {
	foreignKeyQuery := `
        SELECT
            kcu.column_name AS referencing_column,
            ccu.table_name AS referenced_table,
            ccu.column_name AS referenced_column
        FROM
            information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.constraint_schema = kcu.constraint_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.constraint_schema = tc.constraint_schema
        WHERE
            tc.constraint_type = 'FOREIGN KEY' AND
            tc.table_name = $1;
    `

	fkRows, err := backend.Db.Query(foreignKeyQuery, tableName)
	if err != nil {
		return nil, err
	}
	defer fkRows.Close()

	foreignKeys := make(map[string]ForeignKey)

	for fkRows.Next() {
		var referencingColumn, referencedTable, referencedColumn string
		if err := fkRows.Scan(&referencingColumn, &referencedTable, &referencedColumn); err != nil {
			return nil, err
		}

		// Haetaan viitatun taulun nimisarakkeen nimi
		nameColumn, err := getReferencedTableNameColumn(referencedTable)
		if err != nil {
			log.Printf("Virhe nimisarakkeen haussa taululle %s: %v", referencedTable, err)
			// Jatketaan ilman nimeä
			nameColumn = ""
		}

		foreignKeys[referencingColumn] = ForeignKey{
			ReferencingColumn: referencingColumn,
			ReferencedTable:   referencedTable,
			ReferencedColumn:  referencedColumn,
			NameColumn:        nameColumn,
		}
	}

	return foreignKeys, nil
}

func getReferencedTableNameColumn(tableName string) (string, error) {
	// Taulukohtaiset poikkeukset
	tableSpecificNameColumns := map[string]string{
		"functions":        "name",
		"auth_user_groups": "name",
		"system_db_tables": "table_name",
		// Lisää muita tarvittaessa
	}

	if nameCol, ok := tableSpecificNameColumns[tableName]; ok {
		return nameCol, nil
	}

	query := `
        SELECT column_name FROM information_schema.columns
        WHERE table_name = $1 AND data_type IN ('character varying', 'text')
    `
	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var possibleNameColumns []string
	for rows.Next() {
		var columnName string
		if err := rows.Scan(&columnName); err != nil {
			return "", err
		}
		possibleNameColumns = append(possibleNameColumns, columnName)
	}

	// Vanha tapa: Etsitään sarake, jonka nimi sisältää avainsanoja
	nameIndicators := []string{"name", "title", "username", "header"}

	for _, indicator := range nameIndicators {
		for _, col := range possibleNameColumns {
			if strings.Contains(strings.ToLower(col), indicator) {
				return col, nil
			}
		}
	}

	// Palautetaan ensimmäinen tekstityyppinen sarake, jos sopivaa ei löytynyt
	if len(possibleNameColumns) > 0 {
		return possibleNameColumns[0], nil
	}

	return "", fmt.Errorf("ei löydy sopivaa nimisaraketta taulusta %s", tableName)
}
