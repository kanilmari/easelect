// deleteRow.go

package gt_1_row_delete

import (
	backend "easelect/backend/core_components"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/lib/pq"
)

func DeleteRowsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "table-parametri puuttuu", http.StatusBadRequest)
		return
	}
	DeleteRowsHandler(w, r, tableName)
}

func DeleteRowsHandler(w http.ResponseWriter, r *http.Request, table_name string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Metodi ei ole sallittu", http.StatusMethodNotAllowed)
		return
	}

	var request_data struct {
		IDs []int `json:"ids"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request_data); err != nil {
		log.Printf("Virhe datan dekoodauksessa: %v", err)
		http.Error(w, "Virheellinen data", http.StatusBadRequest)
		return
	}

	if len(request_data.IDs) == 0 {
		http.Error(w, "Ei rivejä poistettavaksi", http.StatusBadRequest)
		return
	}

	// Jos poistetaan rivejä system_db_tables-taulusta, tarkoitetaan, että halutaan
	// poistaa kokonaiset taulut tietokannasta niiden nimien perusteella.
	if table_name == "system_db_tables" {
		tx, err := backend.Db.Begin()
		if err != nil {
			log.Printf("virhe transaktion avaamisessa: %v", err)
			http.Error(w, "Virhe transaktion avaamisessa", http.StatusInternalServerError)
			return
		}

		defer func() {
			if p := recover(); p != nil {
				_ = tx.Rollback()
				log.Printf("Paniikki transaktiossa: %v", p)
				http.Error(w, "Virhe transaktiossa", http.StatusInternalServerError)
			}
		}()

		for _, one_id := range request_data.IDs {
			var found_table_name string

			// Haetaan poistettavan taulun nimi
			err = tx.QueryRow("SELECT table_name FROM system_db_tables WHERE id = $1", one_id).Scan(&found_table_name)
			if err != nil {
				_ = tx.Rollback()
				log.Printf("virhe taulun nimen hakemisessa: %v", err)
				http.Error(w, "Virhe taulun nimen hakemisessa", http.StatusInternalServerError)
				return
			}

			drop_query := fmt.Sprintf("DROP TABLE IF EXISTS %s CASCADE", pq.QuoteIdentifier(found_table_name))
			_, err = tx.Exec(drop_query)
			if err != nil {
				_ = tx.Rollback()
				log.Printf("virhe taulun poistossa (%s): %v", found_table_name, err)
				http.Error(w, "Virhe taulun poistossa", http.StatusInternalServerError)
				return
			}

			// Poistetaan rivi system_db_tables-taulusta
			_, err = tx.Exec("DELETE FROM system_db_tables WHERE id = $1", one_id)
			if err != nil {
				_ = tx.Rollback()
				log.Printf("virhe rivin poistossa system_db_tables-taulusta: %v", err)
				http.Error(w, "Virhe rivin poistossa", http.StatusInternalServerError)
				return
			}
		}

		err = tx.Commit()
		if err != nil {
			log.Printf("virhe transaktion commitissa: %v", err)
			http.Error(w, "Virhe transaktion commitissa", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Valitut taulut poistettiin onnistuneesti",
		})
		return
	}

	// Jos taulu ei ole system_db_tables, toimitaan kuten aiemmin.
	id_placeholders := []string{}
	args := []interface{}{}
	for i, one_id := range request_data.IDs {
		id_placeholders = append(id_placeholders, fmt.Sprintf("$%d", i+1))
		args = append(args, one_id)
	}

	query := fmt.Sprintf(
		"DELETE FROM %s WHERE id IN (%s)",
		pq.QuoteIdentifier(table_name),
		strings.Join(id_placeholders, ", "),
	)

	_, err := backend.Db.Exec(query, args...)
	if err != nil {
		log.Printf("Virhe rivien poistossa taulusta %s: %v", table_name, err)
		http.Error(w, "Virhe rivien poistossa", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Rivit poistettu onnistuneesti",
	})
}
