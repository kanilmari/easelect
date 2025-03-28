package lang

import (
	backend "easelect/backend/core_components"
	"encoding/json"
	"fmt"
	"net/http"
)

// GetTranslationsHandler hakee esim. käännökset system_lang_keys -taulusta
func GetTranslationsHandler(w http.ResponseWriter, r *http.Request) {
	chosenLang := r.URL.Query().Get("lang")
	if chosenLang == "" {
		chosenLang = "en"
	}

	queryStr := fmt.Sprintf("SELECT lang_key, %s FROM system_lang_keys", chosenLang)
	rows, err := backend.Db.Query(queryStr)
	if err != nil {
		http.Error(w, fmt.Sprintf("\033[31mvirhe: %s\033[0m", err.Error()), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	translationMap := make(map[string]string)
	for rows.Next() {
		var key, val string
		if err := rows.Scan(&key, &val); err != nil {
			http.Error(w, fmt.Sprintf("\033[31mvirhe: %s\033[0m", err.Error()), http.StatusInternalServerError)
			return
		}
		translationMap[key] = val
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(translationMap); err != nil {
		http.Error(w, fmt.Sprintf("\033[31mvirhe: %s\033[0m", err.Error()), http.StatusInternalServerError)
		return
	}
}
