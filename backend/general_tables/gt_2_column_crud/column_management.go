// // column_management.go
package gt_2_column_crud

// import (
// 	"easelect/backend/general_tables/gt_2_column_crud/gt_2_column_create"
// 	"easelect/backend/general_tables/gt_2_column_crud/gt_2_column_delete"
// 	"easelect/backend/general_tables/gt_2_column_crud/gt_2_column_update"
// 	"easelect/backend/general_tables/gt_3_table_crud/gt_3_table_update"
// 	backend "easelect/backend/main_app"
// 	"easelect/backend/main_app/security"
// 	"encoding/json"
// 	"fmt"
// 	"log"
// 	"net/http"
// )

// type ModifyColumnsRequest struct {
// 	TableName    string        `json:"table_name"`
// 	ModifiedCols []ModifiedCol `json:"modified_columns"`
// 	AddedCols    []ModifiedCol `json:"added_columns"`
// 	RemovedCols  []string      `json:"removed_columns"`
// }

// type ModifiedCol struct {
// 	OriginalName string `json:"original_name"`
// 	NewName      string `json:"new_name"`
// 	DataType     string `json:"data_type"`
// 	Length       *int   `json:"length,omitempty"`
// }

// func ModifyColumnsHandler(w http.ResponseWriter, r *http.Request) {
// 	fmt.Println("ModifyColumnsHandler started")
// 	if r.Method != http.MethodPost {
// 		http.Error(w, "vain POST sallittu", http.StatusMethodNotAllowed)
// 		return
// 	}

// 	var req ModifyColumnsRequest
// 	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
// 		log.Printf("virhe datan dekoodauksessa: %v", err)
// 		http.Error(w, "virheellinen data", http.StatusBadRequest)
// 		return
// 	}

// 	fmt.Printf("Vastaanotettu pyyntö: TableName=%s\n", req.TableName)
// 	fmt.Printf("ModifiedCols: %#v\n", req.ModifiedCols)
// 	fmt.Printf("AddedCols: %#v\n", req.AddedCols)
// 	fmt.Printf("RemovedCols: %#v\n", req.RemovedCols)

// 	if req.TableName == "" {
// 		http.Error(w, "taulun nimi puuttuu", http.StatusBadRequest)
// 		return
// 	}

// 	sanitizedTableName, err := security.SanitizeIdentifier(req.TableName)
// 	if err != nil {
// 		fmt.Println("Virhe taulun nimen validoinnissa:", err)
// 		http.Error(w, err.Error(), http.StatusBadRequest)
// 		return
// 	}

// 	tx, err := backend.Db.Begin()
// 	if err != nil {
// 		fmt.Println("Transaktion aloittaminen epäonnistui:", err)
// 		http.Error(w, fmt.Sprintf("virhe transaktion aloittamisessa: %v", err), http.StatusInternalServerError)
// 		return
// 	}
// 	defer func() {
// 		if err != nil {
// 			fmt.Println("Virhe tapahtui, rollbackataan:", err)
// 			tx.Rollback()
// 		} else {
// 			cerr := tx.Commit()
// 			if cerr != nil {
// 				log.Printf("virhe transaktion commitissa: %v", cerr)
// 				http.Error(w, "virhe tallennettaessa muutoksia", http.StatusInternalServerError)
// 			} else {
// 				fmt.Println("Transaktio commitattu onnistuneesti")
// 			}
// 		}
// 	}()

// 	// Poisto
// 	if removeErr := gt_2_column_delete.RemoveColumns(tx, sanitizedTableName, req.RemovedCols); removeErr != nil {
// 		err = removeErr
// 		return
// 	}

// 	// Muokkaus
// 	if updateErr := gt_2_column_update.UpdateColumns(tx, sanitizedTableName, req.ModifiedCols); updateErr != nil {
// 		err = updateErr
// 		return
// 	}

// 	// Luonti
// 	if addErr := gt_2_column_create.AddNewColumns(tx, sanitizedTableName, req.AddedCols); addErr != nil {
// 		err = addErr
// 		return
// 	}

// 	// OID ja taulunimet
// 	fmt.Println("Päivitetään OID:t ja taulujen nimet.")
// 	err = gt_3_table_update.UpdateOidsAndTableNames()
// 	if err != nil {
// 		fmt.Println("Virhe päivitettäessä OID-arvoja:", err)
// 		http.Error(w, fmt.Sprintf("virhe päivitettäessä OID-arvoja ja taulujen nimiä: Taulu %s: %v", sanitizedTableName, err), http.StatusInternalServerError)
// 		return
// 	}

// 	fmt.Println("Muutokset tallennettu onnistuneesti.")
// 	w.Header().Set("Content-Type", "application/json")
// 	json.NewEncoder(w).Encode(map[string]string{"message": "Muutokset tallennettu onnistuneesti"})
// }
