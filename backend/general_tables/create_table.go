// create_table.go
package general_tables

import (
	"easelect/backend"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

type CreateTableRequest struct {
	TableName   string            `json:"table_name"`
	Columns     map[string]string `json:"columns"`
	ForeignKeys []ForeignKeyDef   `json:"foreign_keys"`
}

type ForeignKeyDef struct {
	ReferencingColumn string `json:"referencing_column"`
	ReferencedTable   string `json:"referenced_table"`
	ReferencedColumn  string `json:"referenced_column"`
}

func sanitizeIdentifier(identifier string) (string, error) {
	re := regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)
	if re.MatchString(identifier) {
		return identifier, nil
	}
	return "", fmt.Errorf("virheellinen tunniste: %s", identifier)
}

// isAllowedDataType tarkistaa, että sarake on jollakin sallitulla prefiksillä.
// Tämänkaltainen toteutus tunnistaa mm. "VARCHAR(255)" alkavan "VARCHAR" jne.
func isAllowedDataType(colType string) bool {
	// Tehdään isot kirjaimet vertailua varten,
	// ja poistetaan mahdolliset alkutai loppuvälit
	c := strings.ToUpper(strings.TrimSpace(colType))

	allowedTypePrefixes := []string{
		"SERIAL",
		"INTEGER",
		"VARCHAR",
		"TEXT",
		"BOOLEAN",
		"DATE",
		"TIMESTAMP", // kattaa mm. "TIMESTAMP NOT NULL...", "TIMESTAMP WITH...", jne.
		"TIMESTAMPTZ",
		"JSONB",
	}

	for _, prefix := range allowedTypePrefixes {
		if strings.HasPrefix(c, prefix) {
			return true
		}
	}
	return false
}

func CreateTableHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "vain POST-metodi on sallittu", http.StatusMethodNotAllowed)
		return
	}

	var req CreateTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Errorf("virheellinen syöte: %w", err).Error(), http.StatusBadRequest)
		return
	}

	// Validoi taulun nimi
	tableName, err := sanitizeIdentifier(req.TableName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if len(req.Columns) == 0 {
		http.Error(w, "vähintään yksi sarake on pakollinen", http.StatusBadRequest)
		return
	}

	var queryBuilder strings.Builder
	queryBuilder.WriteString(fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (", tableName))

	columnsCount := 0
	var updatedFound bool

	// Käydään läpi sarakkeet
	for colName, colType := range req.Columns {
		sanitizedColName, err := sanitizeIdentifier(colName)
		if err != nil {
			http.Error(w, fmt.Sprintf("virheellinen sarakenimi: %s", colName), http.StatusBadRequest)
			return
		}

		// Tarkistetaan, että tyyppi on sallitulla listalla
		if !isAllowedDataType(colType) {
			http.Error(w, fmt.Sprintf("sarake '%s' käyttää kiellettyä tietotyyppiä '%s'", colName, colType), http.StatusBadRequest)
			return
		}

		colTypeUpper := strings.ToUpper(colType)

		// Katsotaan, onko kolumni nimeltään updated
		// (käytetään triggeriä vain, jos se on olemassa)
		if strings.EqualFold(sanitizedColName, "updated") {
			updatedFound = true
		}

		// Jos sarake on nimeltään "id" ja "SERIAL", merkitään se PRIMARY KEY:ksi
		if strings.EqualFold(sanitizedColName, "id") && strings.HasPrefix(colTypeUpper, "SERIAL") {
			queryBuilder.WriteString(fmt.Sprintf("%s %s PRIMARY KEY", sanitizedColName, colTypeUpper))
		} else {
			// Muussa tapauksessa sarake normaalisti
			queryBuilder.WriteString(fmt.Sprintf("%s %s", sanitizedColName, colTypeUpper))
		}

		columnsCount++
		if columnsCount < len(req.Columns) {
			queryBuilder.WriteString(", ")
		}
	}

	// Lisätään vierasavaimet
	for _, fk := range req.ForeignKeys {
		sanitizedRefCol, err := sanitizeIdentifier(fk.ReferencingColumn)
		if err != nil {
			http.Error(w, fmt.Sprintf("virheellinen vierasavaimen referoiva sarake: %s", fk.ReferencingColumn), http.StatusBadRequest)
			return
		}

		sanitizedRefTable, err := sanitizeIdentifier(fk.ReferencedTable)
		if err != nil {
			http.Error(w, fmt.Sprintf("virheellinen viitattava taulu: %s", fk.ReferencedTable), http.StatusBadRequest)
			return
		}

		sanitizedRefColumn, err := sanitizeIdentifier(fk.ReferencedColumn)
		if err != nil {
			http.Error(w, fmt.Sprintf("virheellinen viitattava sarake: %s", fk.ReferencedColumn), http.StatusBadRequest)
			return
		}

		constraintName := fmt.Sprintf("fk_%s_%s", tableName, sanitizedRefCol)
		queryBuilder.WriteString(fmt.Sprintf(", CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s)",
			constraintName, sanitizedRefCol, sanitizedRefTable, sanitizedRefColumn))
	}

	queryBuilder.WriteString(");")
	createTableQuery := queryBuilder.String()

	_, err = backend.Db.Exec(createTableQuery)
	if err != nil {
		http.Error(w, fmt.Errorf("virhe taulun luomisessa: %w", err).Error(), http.StatusInternalServerError)
		return
	}

	// Jos 'updated'-saraketta on mukana, luodaan trigger + funktio sen päivittämiseen
	if updatedFound {
		triggerFunc := fmt.Sprintf(`
            CREATE OR REPLACE FUNCTION set_%s_updated_timestamp()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `, tableName)

		_, err = backend.Db.Exec(triggerFunc)
		if err != nil {
			http.Error(w, fmt.Errorf("virhe trigger-funktion luomisessa: %w", err).Error(), http.StatusInternalServerError)
			return
		}

		triggerStmt := fmt.Sprintf(`
            CREATE TRIGGER update_%s_timestamp
            BEFORE UPDATE ON %s
            FOR EACH ROW
            EXECUTE PROCEDURE set_%s_updated_timestamp();
        `, tableName, tableName, tableName)

		_, err = backend.Db.Exec(triggerStmt)
		if err != nil {
			http.Error(w, fmt.Errorf("virhe triggerin luomisessa: %w", err).Error(), http.StatusInternalServerError)
			return
		}
	}

	// Jos teillä on tarve päivittää OIDit ym., kutsu omaa funktiotanne:
	err = UpdateOidsAndTableNames()
	if err != nil {
		http.Error(w, fmt.Sprintf("virhe päivitettäessä OID-arvoja ja taulujen nimiä: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Write([]byte("Taulu luotu onnistuneesti"))
}
