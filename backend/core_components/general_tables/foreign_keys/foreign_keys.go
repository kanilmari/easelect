// foreign_keys.go
package foreign_keys

import (
	backend "easelect/backend/core_components"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/lib/pq"
)

func AddForeignKeyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var requestData struct {
		ReferencingTable  string `json:"referencing_table"`
		ReferencingColumn string `json:"referencing_column"`
		ReferencedTable   string `json:"referenced_table"`
		ReferencedColumn  string `json:"referenced_column"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		log.Printf("Error decoding data: %v", err)
		http.Error(w, "Invalid data", http.StatusBadRequest)
		return
	}

	// Validate inputs
	if requestData.ReferencingTable == "" || requestData.ReferencingColumn == "" ||
		requestData.ReferencedTable == "" || requestData.ReferencedColumn == "" {
		http.Error(w, "All fields are required", http.StatusBadRequest)
		return
	}

	// Optional: Validate that the tables and columns exist
	if !tableExists(requestData.ReferencingTable) || !tableExists(requestData.ReferencedTable) {
		http.Error(w, "One of the specified tables does not exist", http.StatusBadRequest)
		return
	}

	if !columnExists(requestData.ReferencingTable, requestData.ReferencingColumn) ||
		!columnExists(requestData.ReferencedTable, requestData.ReferencedColumn) {
		http.Error(w, "One of the specified columns does not exist", http.StatusBadRequest)
		return
	}

	// Construct the ALTER TABLE ADD CONSTRAINT command
	// Generate a unique constraint name
	constraintName := fmt.Sprintf("fk_%s_%s", requestData.ReferencingTable, requestData.ReferencingColumn)

	// Build the ALTER TABLE statement
	alterTableStmt := fmt.Sprintf(
		"ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s)",
		pq.QuoteIdentifier(requestData.ReferencingTable),
		pq.QuoteIdentifier(constraintName),
		pq.QuoteIdentifier(requestData.ReferencingColumn),
		pq.QuoteIdentifier(requestData.ReferencedTable),
		pq.QuoteIdentifier(requestData.ReferencedColumn),
	)

	// Execute the statement
	_, err := backend.Db.Exec(alterTableStmt)
	if err != nil {
		log.Printf("Error adding foreign key: %v", err)
		http.Error(w, fmt.Sprintf("Error adding foreign key: %v", err), http.StatusInternalServerError)
		return
	}

	// Return success message
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Foreign key added successfully",
	})
}
func tableExists(tableName string) bool {
	var exists bool
	query := `
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
        )
    `
	err := backend.Db.QueryRow(query, tableName).Scan(&exists)
	if err != nil {
		log.Printf("Error checking if table exists: %v", err)
		return false
	}
	return exists
}

func columnExists(tableName, columnName string) bool {
	var exists bool
	query := `
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
        )
    `
	err := backend.Db.QueryRow(query, tableName, columnName).Scan(&exists)
	if err != nil {
		log.Printf("Error checking if column exists: %v", err)
		return false
	}
	return exists
}

func GetTableNamesHandler(w http.ResponseWriter, r *http.Request) {
	query := `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
    `
	rows, err := backend.Db.Query(query)
	if err != nil {
		log.Printf("Error fetching table names: %v", err)
		http.Error(w, "Error fetching table names", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tableNames []string
	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err != nil {
			log.Printf("Error scanning table name: %v", err)
			http.Error(w, "Error fetching table names", http.StatusInternalServerError)
			return
		}
		tableNames = append(tableNames, tableName)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tableNames)
}

func GetForeignKeys(w http.ResponseWriter, r *http.Request) {
	query := `
        SELECT
            tc.constraint_name,
            tc.table_name AS referencing_table,
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
            tc.constraint_type = 'FOREIGN KEY';
    `

	rows, err := backend.Db.Query(query)
	if err != nil {
		log.Printf("Error fetching foreign keys: %v", err)
		http.Error(w, "Error fetching foreign keys", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Build data
	columns := []string{"referencing_table", "referencing_column", "referenced_table", "referenced_column"}
	var results []map[string]interface{}

	for rows.Next() {
		var constraintName, referencingTable, referencingColumn, referencedTable, referencedColumn string
		if err := rows.Scan(&constraintName, &referencingTable, &referencingColumn, &referencedTable, &referencedColumn); err != nil {
			log.Printf("Error processing foreign keys: %v", err)
			http.Error(w, "Error processing foreign keys", http.StatusInternalServerError)
			return
		}
		row := map[string]interface{}{
			"constraint_name":    constraintName,
			"referencing_table":  referencingTable,
			"referencing_column": referencingColumn,
			"referenced_table":   referencedTable,
			"referenced_column":  referencedColumn,
		}
		results = append(results, row)
	}

	// Return response
	response := map[string]interface{}{
		"columns": columns,
		"data":    results,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func DeleteForeignKeyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Metodi ei ole sallittu", http.StatusMethodNotAllowed)
		return
	}

	var requestData struct {
		ConstraintName   string `json:"constraint_name"`
		ReferencingTable string `json:"referencing_table"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		log.Printf("Virhe datan dekoodauksessa: %v", err)
		http.Error(w, "Virheellinen data", http.StatusBadRequest)
		return
	}

	// Validate inputs
	if requestData.ConstraintName == "" || requestData.ReferencingTable == "" {
		http.Error(w, "Vierasavaimen nimi ja taulu ovat pakollisia", http.StatusBadRequest)
		return
	}

	// Build the ALTER TABLE DROP CONSTRAINT statement
	dropConstraintStmt := fmt.Sprintf(
		"ALTER TABLE %s DROP CONSTRAINT %s",
		pq.QuoteIdentifier(requestData.ReferencingTable),
		pq.QuoteIdentifier(requestData.ConstraintName),
	)

	// Execute the statement
	_, err := backend.Db.Exec(dropConstraintStmt)
	if err != nil {
		log.Printf("Virhe vierasavaimen poistamisessa: %v", err)
		http.Error(w, fmt.Sprintf("Virhe vierasavaimen poistamisessa: %v", err), http.StatusInternalServerError)
		return
	}

	// Return success message
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Vierasavain poistettu onnistuneesti",
	})
}
