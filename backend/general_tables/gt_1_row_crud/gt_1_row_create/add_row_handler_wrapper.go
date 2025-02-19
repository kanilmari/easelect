// add_row_handler_wrapper.go

package gt_1_row_create

import "net/http"

func AddRowHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	// Tästä näkee selvästi, että rivinlisäystä varten
	// tarvitaan "table"-parametri query-stringissä.
	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "Missing 'table' query parameter", http.StatusBadRequest)
		return
	}

	// Käytämme samaa AddRowHandleria kuin aiemmin,
	// mutta emme tarvitse TablesHandleria enää:
	AddRowHandler(w, r, tableName)
}
