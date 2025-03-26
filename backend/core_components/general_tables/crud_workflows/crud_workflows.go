// crud_workflows/crud_workflows.go
package crud_workflows

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"easelect/backend/core_components/general_tables/gt_2_column_crud"
	"easelect/backend/core_components/general_tables/gt_2_column_crud/gt_2_column_create"
	"easelect/backend/core_components/general_tables/gt_2_column_crud/gt_2_column_delete"
	"easelect/backend/core_components/general_tables/gt_3_table_crud/gt_3_table_create"
	backend "easelect/backend/core_components"
	"easelect/backend/core_components/security"
)

// ---------------------------------------------------
// Tässä yksi esimerkki CreateTableHandler, joka jää ennalleen:

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

func isAllowedDataType(colType string) bool {
	c := strings.ToUpper(strings.TrimSpace(colType))

	allowedTypePrefixes := []string{
		"SERIAL",
		"INTEGER",
		"VARCHAR",
		"TEXT",
		"BOOLEAN",
		"DATE",
		"TIMESTAMP",
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

	tableName, err := security.SanitizeIdentifier(req.TableName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if len(req.Columns) == 0 {
		http.Error(w, "vähintään yksi sarake on pakollinen", http.StatusBadRequest)
		return
	}

	sanitizedColumns := make(map[string]string)
	for colName, colType := range req.Columns {
		sColName, err := security.SanitizeIdentifier(colName)
		if err != nil {
			http.Error(w, fmt.Sprintf("virheellinen sarakenimi: %s", colName), http.StatusBadRequest)
			return
		}
		if !isAllowedDataType(colType) {
			http.Error(w, fmt.Sprintf("sarake '%s' käyttää kiellettyä tietotyyppiä '%s'", colName, colType), http.StatusBadRequest)
			return
		}
		sanitizedColumns[sColName] = colType
	}

	var sanitizedForeignKeys []gt_3_table_create.ForeignKeyDefinition
	for _, fk := range req.ForeignKeys {
		sRefCol, err := security.SanitizeIdentifier(fk.ReferencingColumn)
		if err != nil {
			http.Error(w, fmt.Sprintf("virheellinen vierasavaimen referoiva sarake: %s", fk.ReferencingColumn), http.StatusBadRequest)
			return
		}
		sRefTable, err := security.SanitizeIdentifier(fk.ReferencedTable)
		if err != nil {
			http.Error(w, fmt.Sprintf("virheellinen viitattava taulu: %s", fk.ReferencedTable), http.StatusBadRequest)
			return
		}
		sRefColumn, err := security.SanitizeIdentifier(fk.ReferencedColumn)
		if err != nil {
			http.Error(w, fmt.Sprintf("virheellinen viitattava sarake: %s", fk.ReferencedColumn), http.StatusBadRequest)
			return
		}

		sanitizedForeignKeys = append(sanitizedForeignKeys, gt_3_table_create.ForeignKeyDefinition{
			ReferencingColumn: sRefCol,
			ReferencedTable:   sRefTable,
			ReferencedColumn:  sRefColumn,
		})
	}

	err = gt_3_table_create.CreateTableInDatabase(backend.Db, tableName, sanitizedColumns, sanitizedForeignKeys)
	if err != nil {
		http.Error(w, fmt.Errorf("virhe taulun luomisessa: %w", err).Error(), http.StatusInternalServerError)
		return
	}

	// Päivitetään OID-arvot
	err = UpdateOidsAndTableNamesWithBridge()
	if err != nil {
		http.Error(w, fmt.Sprintf("virhe päivitettäessä OID-arvoja ja taulujen nimiä: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Write([]byte("Taulu luotu onnistuneesti"))
}

// ---------------------------------------------------
// Bridge-funktiot AddNewColumnsWithBridge, RemoveColumnsWithBridge, UpdateColumnsWithBridge
// on jossain toisessa tiedostossa (tai samassa). Esimerkki jo aiemmin.

// Esimerkkifunktiot Remove-/AddNewColumnsWithBridge:
func RemoveColumnsWithBridge(
	tx *sql.Tx,
	sanitized_table_name string,
	removed_columns []string,
) error {
	return gt_2_column_delete.RemoveColumns(tx, sanitized_table_name, removed_columns)
}

func AddNewColumnsWithBridge(
	tx *sql.Tx,
	sanitized_table_name string,
	added_columns []gt_2_column_crud.ModifiedCol,
) error {
	return gt_2_column_create.AddNewColumns(tx, sanitized_table_name, added_columns)
}

// ---------------------------------------------------
// ModifyColumnsHandler - pysyy pitkälti samana, mutta kutsuu
// update-bridgeä (UpdateColumnsWithBridge) suoran UpdateColumns-kutsun sijaan.

type ModifyColumnsRequest struct {
	TableName    string                         `json:"table_name"`
	ModifiedCols []gt_2_column_crud.ModifiedCol `json:"modified_columns"`
	AddedCols    []gt_2_column_crud.ModifiedCol `json:"added_columns"`
	RemovedCols  []string                       `json:"removed_columns"`
}

func ModifyColumnsHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("ModifyColumnsHandler started")
	if r.Method != http.MethodPost {
		http.Error(w, "vain POST sallittu", http.StatusMethodNotAllowed)
		return
	}

	var req ModifyColumnsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("\033[31mvirhe datan dekoodauksessa: %s\033[0m\n", err.Error())
		http.Error(w, "virheellinen data", http.StatusBadRequest)
		return
	}

	fmt.Printf("Vastaanotettu pyyntö: TableName=%s\n", req.TableName)
	fmt.Printf("ModifiedCols: %#v\n", req.ModifiedCols)
	fmt.Printf("AddedCols: %#v\n", req.AddedCols)
	fmt.Printf("RemovedCols: %#v\n", req.RemovedCols)

	if req.TableName == "" {
		http.Error(w, "taulun nimi puuttuu", http.StatusBadRequest)
		return
	}

	sanitizedTableName, err := security.SanitizeIdentifier(req.TableName)
	if err != nil {
		fmt.Printf("\033[31mvirhe taulun nimen validoinnissa: %s\033[0m\n", err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tx, err := backend.Db.Begin()
	if err != nil {
		fmt.Printf("\033[31mvirhe transaktion aloittamisessa: %s\033[0m\n", err.Error())
		http.Error(w, fmt.Sprintf("virhe transaktion aloittamisessa: %v", err), http.StatusInternalServerError)
		return
	}
	defer func() {
		if err != nil {
			fmt.Printf("\033[31mvirhe tapahtui, rollbackataan: %v\033[0m\n", err)
			_ = tx.Rollback()
		} else {
			cerr := tx.Commit()
			if cerr != nil {
				log.Printf("\033[31mvirhe transaktion commitissa: %s\033[0m\n", cerr.Error())
				http.Error(w, "virhe tallennettaessa muutoksia", http.StatusInternalServerError)
			} else {
				fmt.Println("Transaktio commitattu onnistuneesti")
			}
		}
	}()

	// 1) Poistetut sarakkeet
	if removeErr := RemoveColumnsWithBridge(
		tx, sanitizedTableName, req.RemovedCols,
	); removeErr != nil {
		err = removeErr
		return
	}

	// 2) Muokatut sarakkeet (nyt bridge-funktion kautta)
	if updateErr := UpdateColumnsWithBridge(
		tx, sanitizedTableName, req.ModifiedCols,
	); updateErr != nil {
		err = updateErr
		return
	}

	// 3) Lisätyt sarakkeet
	if addErr := AddNewColumnsWithBridge(
		tx, sanitizedTableName, req.AddedCols,
	); addErr != nil {
		err = addErr
		return
	}

	// 4) Päivitetään OID-arvot & nimilinkit
	fmt.Println("Päivitetään OID:t ja taulujen nimet bridging-funktiolla.")
	if oidErr := UpdateOidsAndTableNamesWithBridge(); oidErr != nil {
		err = oidErr
		http.Error(w,
			fmt.Sprintf("virhe päivitettäessä OID-arvoja: Taulu %s: %v", sanitizedTableName, oidErr),
			http.StatusInternalServerError)
		return
	}

	fmt.Println("Muutokset tallennettu onnistuneesti.")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Muutokset tallennettu onnistuneesti"})
}
