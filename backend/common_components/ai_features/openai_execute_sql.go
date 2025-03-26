package openai

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// Huom: Tarvitsemme tässä db_connection-olion tietokantayhteyttä varten.
// Pyydä minulta tarkentavia ohjeita, mikäli tämä on sinun koodissasi eri tavalla toteutettu.
//
// Käyttö: router.HandleFunc("/api/execute_gpt_sql", ExecuteGPTSQLHandler(db_connection))
// tai jos käytät muxia: router.Handle("/api/execute_gpt_sql", ExecuteGPTSQLHandler(db_connection))
//
// JS-frontend hakee POST-tyyliin:
// fetch('/api/execute_gpt_sql', { method: 'POST', body: '{"query":"..."}' ... })

type GPTSQLRequest struct {
	Query string `json:"query"`
}

type GPTSQLResponse struct {
	RowsAffected int64           `json:"rows_affected"`
	Columns      []string        `json:"columns"`
	Rows         [][]interface{} `json:"rows"`
}

// ExecuteGPTSQLHandler palauttaa http.HandlerFunc, joka käsittelee /api/execute_gpt_sql -päätepistettä
func ExecuteGPTSQLHandler(db_connection *sql.DB) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		// Sallitaan vain POST
		if request.Method != http.MethodPost {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			fmt.Fprintf(writer, "Vain POST-metodi on sallittu tälle reitille.\n")
			return
		}

		// Luetaan body -> GPTSQLRequest
		var gpt_sql_request GPTSQLRequest
		err := json.NewDecoder(request.Body).Decode(&gpt_sql_request)
		if err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error()) // Konsoliin punaisella
			http.Error(writer, "virhe: pyynnön JSON-dataa ei voitu jäsentää:\n\n"+err.Error(), http.StatusBadRequest)
			return
		}

		query_string := strings.TrimSpace(gpt_sql_request.Query)
		if query_string == "" {
			http.Error(writer, "virhe: SQL-kysely puuttuu", http.StatusBadRequest)
			return
		}

		// Rakennetaan vastaus
		gpt_sql_response := GPTSQLResponse{
			RowsAffected: 0,
			Columns:      []string{},
			Rows:         [][]interface{}{},
		}

		ctx := context.Background()
		upper_query := strings.ToUpper(query_string)

		// Katsotaan onko SELECT vai jokin muu
		if strings.HasPrefix(upper_query, "SELECT") {
			// SELECT -> käytetään db.Query
			rows, err := db_connection.QueryContext(ctx, query_string)
			if err != nil {
				fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
				http.Error(writer, "sql:n suoritus epäonnistui:\n\n"+err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()

			column_names, err := rows.Columns()
			if err != nil {
				fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
				http.Error(writer, "virhe sarakkeiden luvussa:\n\n"+err.Error(), http.StatusInternalServerError)
				return
			}

			gpt_sql_response.Columns = column_names

			for rows.Next() {
				// Valmistellaan skannaus "interface{}" sliceen
				column_values := make([]interface{}, len(column_names))
				column_value_pointers := make([]interface{}, len(column_names))
				for i := range column_values {
					column_value_pointers[i] = &column_values[i]
				}

				err := rows.Scan(column_value_pointers...)
				if err != nil {
					fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
					http.Error(writer, "virhe rivien skannauksessa:\n\n"+err.Error(), http.StatusInternalServerError)
					return
				}
				gpt_sql_response.Rows = append(gpt_sql_response.Rows, column_values)
			}
			if err = rows.Err(); err != nil {
				fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
				http.Error(writer, "virhe rivien lopussa:\n\n"+err.Error(), http.StatusInternalServerError)
				return
			}

		} else {
			// INSERT, UPDATE, DELETE, tms. -> käytetään db.Exec
			result, err := db_connection.ExecContext(ctx, query_string)
			if err != nil {
				fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
				http.Error(writer, "sql:n suoritus epäonnistui:\n\n"+err.Error(), http.StatusInternalServerError)
				return
			}

			rows_affected, err := result.RowsAffected()
			if err != nil {
				// Ei ole välttämättä kriittinen, mutta logitetaan punaisella
				fmt.Printf("\033[31mvirhe: rows affected: %s\033[0m\n", err.Error())
				// silti jatketaan
			} else {
				gpt_sql_response.RowsAffected = rows_affected
			}
		}

		// Palautetaan JSON
		writer.Header().Set("Content-Type", "application/json; charset=utf-8")
		json_encoder := json.NewEncoder(writer)
		json_encoder.SetEscapeHTML(false)
		err = json_encoder.Encode(gpt_sql_response)
		if err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			// Tässä kohtaa on liian myöhäistä kirjoittaa virhettä uudelleen otsakkeisiin,
			// joten teemme vain pienen printin konsoliin.
		}
	}
}
