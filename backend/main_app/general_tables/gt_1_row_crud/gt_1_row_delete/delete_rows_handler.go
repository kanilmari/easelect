package gt_1_row_delete

import "net/http"

// tablesHandler.go tai deleteRowsHandler.go, sama paketti gt_crud

func DeleteRowsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	tableName := r.URL.Query().Get("table")
	if tableName == "" {
		http.Error(w, "table-parametri puuttuu", http.StatusBadRequest)
		return
	}
	DeleteRowsHandler(w, r, tableName)
}
