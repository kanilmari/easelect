package devtools

import (
	e_sessions "easelect/backend/core_components/sessions"
	"encoding/json"
	"fmt"
	"net/http"
)

func SessionHandler(w http.ResponseWriter, r *http.Request) {
	session, err := e_sessions.Store.Get(r, "session")
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Muutetaan session.Values (map[interface{}]interface{}) -> map[string]interface{}
	convertedData := convertMapInterfaceKeysToString(session.Values)

	// tulostetaan palvelimen logiin
	// fmt.Printf("\033[32mSession data: %v\033[0m\n", convertedData)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(convertedData); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
	}
}

// convertMapInterfaceKeysToString muuntaa rekursiivisesti kaikki map[interface{}]interface{} -tyypit map[string]interface{} -tyypeiksi.
// Näin JSON-koodaus onnistuu ilman virheilmoitusta.
func convertMapInterfaceKeysToString(data interface{}) interface{} {
	switch arvot := data.(type) {
	case map[interface{}]interface{}:
		uusiMap := make(map[string]interface{})
		for avain, arvo := range arvot {
			avainStr, ok := avain.(string)
			if !ok {
				avainStr = fmt.Sprintf("%v", avain)
			}
			uusiMap[avainStr] = convertMapInterfaceKeysToString(arvo)
		}
		return uusiMap

	case []interface{}:
		// Jos talletetaan taulukoita, käsitellään myös ne rekursiivisesti
		for i, v := range arvot {
			arvot[i] = convertMapInterfaceKeysToString(v)
		}
		return arvot

	default:
		// Kaikki muu, esim. perusdatatyypit, jätetään ennalleen
		return arvot
	}
}
