// get_results_handler_wrapper.go
package gt_read

import (
	"log"
	"net/http"
)

// get_results_handler_wrapper.go
func GetResultsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	table_name := r.URL.Query().Get("table")
	if table_name == "" {
		http.Error(w, "missing 'table' query parameter", http.StatusBadRequest)
		return
	}

	// Käytetään olemassaolevaa GetResults-funktiota,
	// joka osaa lukee (mahdollisesti uudestaan) table-parametrin
	// suoraan requestista.
	// Jos haluat välittää table_namen suoraan, muokkaa GetResults
	// ottamaan parametrin vastaan, samaan tyyliin kuin AddRowHandler.
	log.Printf("calling GetResults for table %s", table_name)
	GetResults(w, r)
}
