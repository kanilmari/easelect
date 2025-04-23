// get_intelligent_results.go
package gt_1_row_read

import (
	"context"
	"database/sql"
	backend "easelect/backend/core_components"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/lib/pq"
	"github.com/sashabaranov/go-openai"
)

/* -----------------------------------------------------------
 *  Apurakenteet ja -kartat
 * --------------------------------------------------------- */

// aiSearchResponse kuvaa AI:n palauttaman JSON-objektin.
type aiSearchResponse struct {
	Language                      string `json:"language"`
	SearchTextRefersToLocation    bool   `json:"search_text_refers_to_location"`
	GPSLocation                   string `json:"gps_location"` // "lat, lon"
	TranslationToShortDescription string `json:"translation_to_short_description"`
	OK                            bool   `json:"ok"`
	SortBy                        string `json:"sort_by"`
	TraditionalSearchQuery        string `json:"traditional_search_query"`
}

// serviceDistance edustaa löytynyttä palvelua ja sen etäisyyttä metreissä.
type serviceDistance struct {
	ServiceName    string
	DistanceMeters float64
}

// locationTableMapping määrittää, mikä aputaulun nimi vastaa mitäkin päätaulua.
var locationTableMapping = map[string]string{
	"service_catalog": "service_locations",
}

/* -----------------------------------------------------------
 *  1) HTTP-wrapper – pelkkä delegointi päätefunktioon
 * --------------------------------------------------------- */
func GetIntelligentResultsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "only GET accepted", http.StatusMethodNotAllowed)
		return
	}

	if err := queryIntelligentResults(w, r); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

/* -----------------------------------------------------------
 *  2) Päätefunktio – promptti → OpenAI → vastauksen käsittely
 * --------------------------------------------------------- */
// get_intelligent_results.go  (korjattu queryIntelligentResults)
func queryIntelligentResults(w http.ResponseWriter, r *http.Request) error {
	tableName := r.URL.Query().Get("table")
	userQuery := r.URL.Query().Get("query")
	if tableName == "" || userQuery == "" {
		return fmt.Errorf("table or query parameter missing")
	}

	/* ---------- 1) Promptin haku ---------- */
	var promptTemplate string
	err := backend.Db.QueryRow(`
		SELECT instruction_prompt
		FROM ai_chatbot_instructions
		WHERE title = 'ai_searchbar_prompt'
		LIMIT 1
	`).Scan(&promptTemplate)
	if err != nil {
		if err == sql.ErrNoRows {
			promptTemplate = "You are a helpful assistant. Answer clearly."
		} else {
			return fmt.Errorf("cannot fetch prompt: %w", err)
		}
	}
	systemContent := fmt.Sprintf(promptTemplate, tableName)

	/* ---------- 2) OpenAI-kutsu ---------- */
	openaiKey := os.Getenv("OPENAI_API_KEY")
	if openaiKey == "" {
		return fmt.Errorf("OPENAI_API_KEY missing")
	}
	modelName := os.Getenv("OPENAI_API_MODEL")
	if modelName == "" {
		modelName = "gpt-4o"
	}

	client := openai.NewClient(openaiKey)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: modelName,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemContent},
			{Role: openai.ChatMessageRoleUser, Content: userQuery},
		},
	})
	if err != nil {
		return fmt.Errorf("openai call failed: %w", err)
	}
	if len(resp.Choices) == 0 {
		return fmt.Errorf("openai returned zero choices")
	}
	raw := resp.Choices[0].Message.Content

	// Näytä raakateksti sellaisenaan:
	fmt.Printf("\033[35m--- AI raw (%s) ---\n%s\n---\033[0m\n", tableName, raw)

	/* ---------- 3) JSON → rakenne ---------- */
	var aiResp aiSearchResponse
	if err := json.Unmarshal([]byte(raw), &aiResp); err != nil {
		fmt.Printf("\033[31mvirhe: json unmarshal failed: %s\033[0m\n", err.Error())
		// jatketaan ilman sijaintilogiikkaa
	} else {
		pretty, _ := json.MarshalIndent(aiResp, "", "  ")
		fmt.Printf("\033[36mAI-vastaus (%s):\n%s\033[0m\n", tableName, pretty)
	}

	/* ---------- 4) Sijaintilogiikka ---------- */
	if aiResp.SearchTextRefersToLocation {
		lat, lon, perr := parseLatLonPair(aiResp.GPSLocation)
		if perr != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", perr.Error())
		} else if locTable, ok := locationTableMapping[tableName]; ok {
			services, sErr := fetchNearestServices(backend.Db, tableName, locTable, lat, lon)
			if sErr != nil {
				fmt.Printf("\033[31mvirhe: %s\033[0m\n", sErr.Error())
			} else {
				fmt.Printf("Lähimmät palvelut (%.5f, %.5f):\n", lat, lon)
				for i, s := range services {
					fmt.Printf("  %d) %s – %.0f m\n", i+1, s.ServiceName, s.DistanceMeters)
				}
			}
		}
	}

	w.WriteHeader(http.StatusNoContent)
	return nil
}

/* -----------------------------------------------------------
 *  Apufunktiot
 * --------------------------------------------------------- */

// parseLatLonPair muuntaa "lat, lon" → float64-arvoihin.
func parseLatLonPair(gps string) (lat, lon float64, err error) {
	parts := strings.Split(strings.TrimSpace(gps), ",")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid gps_location format: %s", gps)
	}
	lat, err = strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	if err != nil {
		return 0, 0, fmt.Errorf("invalid latitude: %w", err)
	}
	lon, err = strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if err != nil {
		return 0, 0, fmt.Errorf("invalid longitude: %w", err)
	}
	return lat, lon, nil
}

// fetchNearestServices hakee 10 lähintä palvelua PostGIS-kyselyllä.
// get_intelligent_results.go  (korjattu fetchNearestServices)
func fetchNearestServices(db *sql.DB, mainTable, locationTable string, lat, lon float64) ([]serviceDistance, error) {
	const limitResults = 10

	query := fmt.Sprintf(`
		SELECT
			%s.header,
			ST_Distance(
				ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
				%s.position::geography
			) AS distance_m
		FROM %s
		JOIN %s ON %s.service_id = %s.id
		WHERE %s.position IS NOT NULL
		ORDER BY distance_m ASC
		LIMIT %d
	`, pq.QuoteIdentifier(mainTable), pq.QuoteIdentifier(locationTable),
		pq.QuoteIdentifier(mainTable),
		pq.QuoteIdentifier(locationTable),
		pq.QuoteIdentifier(locationTable),
		pq.QuoteIdentifier(mainTable),
		pq.QuoteIdentifier(locationTable),
		limitResults)

	rows, err := db.Query(query, lon, lat) // HUOM! long, lat
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []serviceDistance
	for rows.Next() {
		var (
			name string
			dist sql.NullFloat64
		)
		if err := rows.Scan(&name, &dist); err != nil {
			return nil, err
		}
		if !dist.Valid {
			continue // ohita rivit, joilla ei etäisyyttä
		}
		results = append(results, serviceDistance{
			ServiceName:    name,
			DistanceMeters: dist.Float64,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}
