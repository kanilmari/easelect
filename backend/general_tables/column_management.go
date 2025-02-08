// column_management.go
package general_tables

import (
	"easelect/backend"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
)

type ModifyColumnsRequest struct {
	TableName    string        `json:"table_name"`
	ModifiedCols []ModifiedCol `json:"modified_columns"`
	AddedCols    []ModifiedCol `json:"added_columns"`
	RemovedCols  []string      `json:"removed_columns"`
}

type ModifiedCol struct {
	OriginalName string `json:"original_name"`
	NewName      string `json:"new_name"`
	DataType     string `json:"data_type"`
	Length       *int   `json:"length,omitempty"`
}

func ModifyColumnsHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("ModifyColumnsHandler started")
	if r.Method != http.MethodPost {
		http.Error(w, "vain POST sallittu", http.StatusMethodNotAllowed)
		return
	}

	var req ModifyColumnsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("virhe datan dekoodauksessa: %v", err)
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

	sanitizedTableName, err := sanitizeIdentifier(req.TableName)
	if err != nil {
		fmt.Println("Virhe taulun nimen validoinnissa:", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tx, err := backend.Db.Begin()
	if err != nil {
		fmt.Println("Transaktion aloittaminen epäonnistui:", err)
		http.Error(w, fmt.Sprintf("virhe transaktion aloittamisessa: %v", err), http.StatusInternalServerError)
		return
	}
	defer func() {
		if err != nil {
			fmt.Println("Virhe tapahtui, rollbackataan:", err)
			tx.Rollback()
		} else {
			cerr := tx.Commit()
			if cerr != nil {
				log.Printf("virhe transaktion commitissa: %v", cerr)
				http.Error(w, "virhe tallennettaessa muutoksia", http.StatusInternalServerError)
			} else {
				fmt.Println("Transaktio commitattu onnistuneesti")
			}
		}
	}()

	// Poistetaan sarakkeet
	fmt.Println("Poistetaan sarakkeita (jos on):", req.RemovedCols)
	for _, col := range req.RemovedCols {
		sCol, err2 := sanitizeIdentifier(col)
		if err2 != nil {
			http.Error(w, err2.Error(), http.StatusBadRequest)
			return
		}
		dropStmt := fmt.Sprintf("ALTER TABLE %s DROP COLUMN %s", sanitizedTableName, sCol)
		fmt.Println("Suoritetaan:", dropStmt)
		_, err2 = tx.Exec(dropStmt)
		if err2 != nil {
			fmt.Println("Virhe poistettaessa saraketta:", err2)
			err = err2
			return
		}
	}

	// Muokataan olemassa olevia sarakkeita
	fmt.Println("Muokataan sarakkeita (jos on):", req.ModifiedCols)
	for _, mcol := range req.ModifiedCols {
		fmt.Println("Käsitellään muokkaus:", mcol)
		sOrigName, err2 := sanitizeIdentifier(mcol.OriginalName)
		if err2 != nil {
			http.Error(w, err2.Error(), http.StatusBadRequest)
			return
		}

		sNewName, err2 := sanitizeIdentifier(mcol.NewName)
		if err2 != nil {
			http.Error(w, err2.Error(), http.StatusBadRequest)
			return
		}

		if sOrigName != sNewName {
			renameStmt := fmt.Sprintf("ALTER TABLE %s RENAME COLUMN %s TO %s", sanitizedTableName, sOrigName, sNewName)
			fmt.Println("Uudelleennimetään sarake:", renameStmt)
			_, err2 = tx.Exec(renameStmt)
			if err2 != nil {
				fmt.Println("Virhe uudelleennimetessä saraketta:", err2)
				err = err2
				return
			}
		}

		newType := strings.ToUpper(mcol.DataType)
		if newType == "VARCHAR" && mcol.Length != nil {
			newType = fmt.Sprintf("VARCHAR(%d)", *mcol.Length)
		}
		alterTypeStmt := fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s TYPE %s", sanitizedTableName, sNewName, newType)
		fmt.Println("Muokataan sarakkeen tyyppiä:", alterTypeStmt)
		_, err2 = tx.Exec(alterTypeStmt)
		if err2 != nil {
			fmt.Println("Virhe muutettaessa sarakkeen tyyppiä:", err2)
			err = err2
			return
		}
	}

	// Lisätään uudet sarakkeet
	fmt.Println("Lisätään uusia sarakkeita (jos on):", req.AddedCols)
	for _, acol := range req.AddedCols {
		fmt.Println("Lisätään sarake:", acol)
		sNewName, err2 := sanitizeIdentifier(acol.NewName)
		if err2 != nil {
			http.Error(w, err2.Error(), http.StatusBadRequest)
			return
		}

		newType := strings.ToUpper(acol.DataType)
		if newType == "VARCHAR" && acol.Length != nil {
			newType = fmt.Sprintf("VARCHAR(%d)", *acol.Length)
		}

		addStmt := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", sanitizedTableName, sNewName, newType)
		fmt.Println("Suoritetaan:", addStmt)
		_, err2 = tx.Exec(addStmt)
		if err2 != nil {
			fmt.Println("Virhe lisättäessä uutta saraketta:", err2)
			err = err2
			return
		}
	}

	fmt.Println("Päivitetään OID:t ja taulujen nimet.")
	err = UpdateOidsAndTableNames()
	if err != nil {
		fmt.Println("Virhe päivitettäessä OID-arvoja:", err)
		http.Error(w, fmt.Sprintf("virhe päivitettäessä OID-arvoja ja taulujen nimiä: Taulu %s: %v", sanitizedTableName, err), http.StatusInternalServerError)
		return
	}

	fmt.Println("Muutokset tallennettu onnistuneesti.")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Muutokset tallennettu onnistuneesti"})
}

type DropTableRequest struct {
	TableName string `json:"table_name"`
}

func DropTableHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "vain POST sallittu", http.StatusMethodNotAllowed)
		return
	}

	var req DropTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Errorf("virheellinen data: %w", err).Error(), http.StatusBadRequest)
		return
	}

	if req.TableName == "" {
		http.Error(w, "taulun nimi puuttuu", http.StatusBadRequest)
		return
	}

	sanitizedTableName, err := sanitizeIdentifier(req.TableName)
	if err != nil {
		http.Error(w, fmt.Errorf("virhe taulun nimen validoinnissa: %w", err).Error(), http.StatusBadRequest)
		return
	}

	dropStmt := fmt.Sprintf("DROP TABLE %s CASCADE", sanitizedTableName)
	_, err = backend.Db.Exec(dropStmt)
	if err != nil {
		http.Error(w, fmt.Errorf("virhe taulun poistossa: %w", err).Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": fmt.Sprintf("Taulu %s poistettu", sanitizedTableName)})
}
