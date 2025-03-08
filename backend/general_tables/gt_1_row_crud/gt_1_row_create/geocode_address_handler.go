// geocode_address_handler.go
package gt_1_row_create

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
)

type GeocodeRequest struct {
	Address string `json:"address"`
}

// Palaute yksittäiselle osoite-ehdotukselle
type GeocodeSuggestion struct {
	Title       string  `json:"title"`
	Label       string  `json:"label"`
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
	CountryCode string  `json:"countryCode"`
	CountryName string  `json:"countryName"`
	State       string  `json:"state"`
	County      string  `json:"county"`
	City        string  `json:"city"`
	District    string  `json:"district"`
	Street      string  `json:"street"`
	HouseNumber string  `json:"houseNumber"`
	PostalCode  string  `json:"postalCode"`
}

func GeocodeAddressHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
		return
	}

	var req GeocodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Cannot read request body", http.StatusBadRequest)
		return
	}

	baseURL := "https://geocode.search.hereapi.com/v1/geocode"
	queryParams := url.Values{}
	queryParams.Set("q", req.Address)
	queryParams.Set("apiKey", os.Getenv("HERE_API_KEY")) // luetaan ympäristömuuttujasta

	fullURL := fmt.Sprintf("%s?%s", baseURL, queryParams.Encode())
	resp, err := http.Get(fullURL)
	if err != nil {
		log.Printf("\033[31mvirhe: HERE geocoding request failed: %v\033[0m\n", err)
		http.Error(w, "Geocoding failed", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		log.Printf("\033[31mvirhe: HERE geocoding not OK: %d, body: %s\033[0m\n",
			resp.StatusCode, string(bodyBytes))
		http.Error(w, "Geocoding request failed", http.StatusBadGateway)
		return
	}

	// HEREn paluu: { "items": [ { "title":"...", "id":"...", "position": {...}, "address": {...} }, ... ] }
	var jsonResp struct {
		Items []struct {
			Title   string `json:"title"`
			Address struct {
				Label       string `json:"label"`
				CountryCode string `json:"countryCode"`
				CountryName string `json:"countryName"`
				State       string `json:"state"`
				County      string `json:"county"`
				City        string `json:"city"`
				District    string `json:"district"`
				Street      string `json:"street"`
				HouseNumber string `json:"houseNumber"`
				PostalCode  string `json:"postalCode"`
			} `json:"address"`
			Position struct {
				Lat float64 `json:"lat"`
				Lng float64 `json:"lng"`
			} `json:"position"`
		} `json:"items"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&jsonResp); err != nil {
		log.Printf("\033[31mvirhe: Decode error: %v\033[0m\n", err)
		http.Error(w, "Fail decoding geocoding response", http.StatusInternalServerError)
		return
	}

	if len(jsonResp.Items) == 0 {
		http.Error(w, "No geocoding results", http.StatusNotFound)
		return
	}

	// Otetaan enintään 5 tulosta
	maxItems := 5
	if len(jsonResp.Items) < 5 {
		maxItems = len(jsonResp.Items)
	}

	var results []GeocodeSuggestion
	for i := 0; i < maxItems; i++ {
		item := jsonResp.Items[i]
		suggestion := GeocodeSuggestion{
			Title:       item.Title,
			Label:       item.Address.Label,
			Lat:         item.Position.Lat,
			Lon:         item.Position.Lng,
			CountryCode: item.Address.CountryCode,
			CountryName: item.Address.CountryName,
			State:       item.Address.State,
			County:      item.Address.County,
			City:        item.Address.City,
			District:    item.Address.District,
			Street:      item.Address.Street,
			HouseNumber: item.Address.HouseNumber,
			PostalCode:  item.Address.PostalCode,
		}
		results = append(results, suggestion)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(results); err != nil {
		log.Printf("\033[31mvirhe: Encoding response failed: %v\033[0m\n", err)
		http.Error(w, "Could not encode geocoding results", http.StatusInternalServerError)
		return
	}
}

// // geocode_address_handler.go
// package gt_1_row_create

// import (
// 	"encoding/json"
// 	"fmt"
// 	"io/ioutil"
// 	"log"
// 	"net/http"
// 	"net/url"
// 	"os"
// )

// type GeocodeRequest struct {
// 	Address string `json:"address"`
// }

// // Palaute yksittäiselle osoite-ehdotukselle
// type GeocodeSuggestion struct {
// 	Title       string  `json:"title"`
// 	Label       string  `json:"label"`
// 	Lat         float64 `json:"lat"`
// 	Lon         float64 `json:"lon"`
// 	CountryCode string  `json:"countryCode"`
// 	CountryName string  `json:"countryName"`
// 	State       string  `json:"state"`
// 	County      string  `json:"county"`
// 	City        string  `json:"city"`
// 	District    string  `json:"district"`
// 	Street      string  `json:"street"`
// 	HouseNumber string  `json:"houseNumber"`
// 	PostalCode  string  `json:"postalCode"`
// }

// func GeocodeAddressHandler(w http.ResponseWriter, r *http.Request) {
// 	if r.Method != http.MethodPost {
// 		http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
// 		return
// 	}

// 	var req GeocodeRequest
// 	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
// 		http.Error(w, "Cannot read request body", http.StatusBadRequest)
// 		return
// 	}

// 	baseURL := "https://geocode.search.hereapi.com/v1/geocode"
// 	queryParams := url.Values{}
// 	queryParams.Set("q", req.Address)
// 	// old queryParams.Set("apiKey", "PD6J_ULOKRH2sqZesp7j9lhRXBn85oyfQI-XSiY2oV4")
// 	// fetch api key from os env environment variable := os.Getenv("HERE_API_KEY")
// 	queryParams.Set("apiKey", os.Getenv("HERE_API_KEY"))

// 	fullURL := fmt.Sprintf("%s?%s", baseURL, queryParams.Encode())
// 	resp, err := http.Get(fullURL)
// 	if err != nil {
// 		log.Printf("\033[31mvirhe: HERE geocoding request failed: %v\033[0m\n", err)
// 		http.Error(w, "Geocoding failed", http.StatusInternalServerError)
// 		return
// 	}
// 	defer resp.Body.Close()

// 	if resp.StatusCode != http.StatusOK {
// 		bodyBytes, _ := ioutil.ReadAll(resp.Body)
// 		log.Printf("\033[31mvirhe: HERE geocoding not OK: %d, body: %s\033[0m\n",
// 			resp.StatusCode, string(bodyBytes))
// 		http.Error(w, "Geocoding request failed", http.StatusBadGateway)
// 		return
// 	}

// 	// HEREn paluu: { "items": [ { "title":"...", "id":"...", "position": {...}, "address": {...} }, ... ] }
// 	var jsonResp struct {
// 		Items []struct {
// 			Title   string `json:"title"`
// 			Address struct {
// 				Label       string `json:"label"`
// 				CountryCode string `json:"countryCode"`
// 				CountryName string `json:"countryName"`
// 				State       string `json:"state"`
// 				County      string `json:"county"`
// 				City        string `json:"city"`
// 				District    string `json:"district"`
// 				Street      string `json:"street"`
// 				HouseNumber string `json:"houseNumber"`
// 				PostalCode  string `json:"postalCode"`
// 			} `json:"address"`
// 			Position struct {
// 				Lat float64 `json:"lat"`
// 				Lng float64 `json:"lng"`
// 			} `json:"position"`
// 		} `json:"items"`
// 	}

// 	if err := json.NewDecoder(resp.Body).Decode(&jsonResp); err != nil {
// 		log.Printf("\033[31mvirhe: Decode error: %v\033[0m\n", err)
// 		http.Error(w, "Fail decoding geocoding response", http.StatusInternalServerError)
// 		return
// 	}

// 	if len(jsonResp.Items) == 0 {
// 		http.Error(w, "No geocoding results", http.StatusNotFound)
// 		return
// 	}

// 	// Otetaan enintään 5 kappaletta
// 	maxItems := 5
// 	if len(jsonResp.Items) < 5 {
// 		maxItems = len(jsonResp.Items)
// 	}

// 	var results []GeocodeSuggestion
// 	for i := 0; i < maxItems; i++ {
// 		item := jsonResp.Items[i]
// 		suggestion := GeocodeSuggestion{
// 			Title:       item.Title,
// 			Label:       item.Address.Label,
// 			Lat:         item.Position.Lat,
// 			Lon:         item.Position.Lng,
// 			CountryCode: item.Address.CountryCode,
// 			CountryName: item.Address.CountryName,
// 			State:       item.Address.State,
// 			County:      item.Address.County,
// 			City:        item.Address.City,
// 			District:    item.Address.District,
// 			Street:      item.Address.Street,
// 			HouseNumber: item.Address.HouseNumber,
// 			PostalCode:  item.Address.PostalCode,
// 		}
// 		results = append(results, suggestion)
// 	}

// 	w.Header().Set("Content-Type", "application/json")
// 	if err := json.NewEncoder(w).Encode(results); err != nil {
// 		log.Printf("\033[31mvirhe: Encoding response failed: %v\033[0m\n", err)
// 		http.Error(w, "Could not encode geocoding results", http.StatusInternalServerError)
// 		return
// 	}
// }
