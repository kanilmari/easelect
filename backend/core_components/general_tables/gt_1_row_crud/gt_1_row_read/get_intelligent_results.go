// get_intelligent_results.go
package gt_1_row_read

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	backend "easelect/backend/core_components"
	"easelect/backend/core_components/general_tables/gt_2_column_crud/gt_2_column_read"
	e_sessions "easelect/backend/core_components/sessions"

	"github.com/lib/pq"
	pgvector "github.com/pgvector/pgvector-go"
	"github.com/sashabaranov/go-openai"
)

/* ===========================================================
 *  Apurakenteet ja vakiot
 * =========================================================*/

type aiSearchResponse struct {
	Language                      string `json:"l"` // abbreviation of the key like the rest of the entries below
	SearchTextRefersToLocation    bool   `json:"strtl"`
	GPSLocation                   string `json:"gl"` // "lat, lon"
	TranslationToShortDescription string `json:"ttsd"`
	OK                            bool   `json:"ok"`
	SortBy                        string `json:"sb"`
	TraditionalSearchQuery        string `json:"tsq"`
	Neighborhood                  string `json:"nh"`
	PostalCode                    string `json:"pc"`
	Street                        string `json:"st"`
}

type rowSemanticScore struct {
	RowName       string
	DistanceScore float64
}

type rowTextRank struct {
	RowName string
	Rank    float64
}

var locationTableMapping = map[string]string{
	"service_catalog": "service_locations",
}

/* ===========================================================
 *  HTTP-kääre
 * =========================================================*/

func GetIntelligentResultsHandlerWrapper(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "only GET accepted", http.StatusMethodNotAllowed)
		return
	}

	// 🔄 UUSI: jos stream‑parametri, käytä virtaavaa vastausta
	if r.URL.Query().Get("stream") == "1" {
		if err := queryIntelligentResultsStream(w, r); err != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
			http.Error(w, "internal error", http.StatusInternalServerError)
		}
		return
	}

	// Vanha, blokkaava versio (muuttumaton)
	if err := queryIntelligentResults(w, r); err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

/* ===========================================================
 *  UUSI FUNKTIO: virtaava vastaus kahdessa erässä ✅
 * =========================================================*/
func queryIntelligentResultsStream(w http.ResponseWriter, r *http.Request) error {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return fmt.Errorf("streaming unsupported by server")
	}

	//------------------------------------------------
	// 1. Nopea täyden tekstin haku (koodi lainattu queryIntelligentResults‑funktiosta)
	//------------------------------------------------
	tableName := r.URL.Query().Get("table")
	userQuery := r.URL.Query().Get("query")
	if tableName == "" || userQuery == "" {
		return fmt.Errorf("table or query parameter missing")
	}

	textHits, err := fetchFullTextRows(backend.Db, tableName, userQuery)
	if err != nil {
		return fmt.Errorf("full‑text search failed: %w", err)
	}
	var order []string
	for _, h := range textHits {
		order = append(order, h.RowName)
	}
	textRows, textCols, err := fetchRowsInOrder(backend.Db, tableName, order)
	if err != nil {
		return fmt.Errorf("fetchRowsInOrder(text): %w", err)
	}
	types, err := getColumnDataTypesWithFK(tableName, backend.Db)
	if err != nil {
		return fmt.Errorf("getColumnDataTypesWithFK: %w", err)
	}

	//------------------------------------------------
	// 2. Lähetä ensimmäinen paketti (stage="text")
	//------------------------------------------------
	w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	first := map[string]interface{}{
		"stage":   "text",
		"columns": textCols,
		"data":    textRows,
		"types":   types,
	}
	if err := json.NewEncoder(w).Encode(first); err != nil {
		return err
	}
	flusher.Flush()

	//------------------------------------------------
	// 3. AI‑rikastus (raskas osuus)
	//------------------------------------------------
	aiPacket, err := buildAiResult(r, tableName, userQuery, types)
	if err != nil {
		return err
	}
	aiPacket["stage"] = "ai"

	if err := json.NewEncoder(w).Encode(aiPacket); err != nil {
		return err
	}
	flusher.Flush()
	return nil
}

/* ===========================================================
 *  FUNKTIO: buildAiResult ✅
 *  (käyttää valmista queryIntelligentResults‑logiikkaa sisäisesti
 *   eikä duplicoi massiivista koodia — näin pidämme yhden lähteen totuudelle)
 * =========================================================*/
func buildAiResult(r *http.Request, tableName, userQuery string, columnDataTypes map[string]interface{}) (map[string]interface{}, error) {
	// Tehdään kopio pyynnöstä, jotta alkuperäiseen ei kajota
	clone := r.Clone(r.Context())
	q := clone.URL.Query()
	q.Set("table", tableName)
	q.Set("query", userQuery)
	// varmuuden vuoksi poistetaan mahdollinen stream‑parametri
	q.Del("stream")
	clone.URL.RawQuery = q.Encode()

	// Käytetään httptest‑recorderia kaappaamaan JSON‑vastaus
	rec := httptest.NewRecorder()
	if err := queryIntelligentResults(rec, clone); err != nil {
		return nil, err
	}

	// Parsitaan runko mapiksi
	var parsed map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		return nil, fmt.Errorf("cannot parse internal JSON: %w", err)
	}

	// Varmistetaan, että columnDataTypes menee mukana (voi olla jo siellä)
	if _, ok := parsed["types"]; !ok {
		parsed["types"] = columnDataTypes
	}
	return parsed, nil
}

/* ===========================================================
 *  Päätefunktio – älykäs haku
 *  - debug-tulostus kytkettävissä paikallisella booleanilla
 *  - näyttää semDist, GPS-km, ts_rank (jos saatavilla),
 *    käyttäjän hakutekstin ja AI-palautteen JSON-raakana
 * =========================================================*/
func queryIntelligentResults(w http.ResponseWriter, r *http.Request) error {
	/* 🐞  debug-tulostus päälle/pois tästä */
	const debugLogging = true
	const semanticThreshold = 0.70

	//------------------------------------------------
	// 1. Input ja sessiorooli
	//------------------------------------------------
	tableName := r.URL.Query().Get("table")
	userQuery := r.URL.Query().Get("query")
	if tableName == "" || userQuery == "" {
		return fmt.Errorf("table or query parameter missing")
	}

	session, _ := e_sessions.GetStore().Get(r, "session")
	userRole, _ := session.Values["user_role"].(string)
	if userRole == "" {
		userRole = "guest"
	}
	roleDb := map[string]*sql.DB{
		"admin": backend.DbAdmin,
		"basic": backend.DbBasic,
		"guest": backend.DbGuest,
	}
	currentDb := roleDb[userRole]

	//------------------------------------------------
	// 2. OpenAI-kutsu hakupromptille
	//------------------------------------------------
	var promptTemplate string
	err := backend.Db.QueryRow(`
		SELECT instruction_prompt
		FROM ai_chatbot_instructions
		WHERE title = 'ai_searchbar_prompt'
		LIMIT 1`).Scan(&promptTemplate)
	if err == sql.ErrNoRows {
		promptTemplate = "You are a helpful assistant. Answer clearly."
	} else if err != nil {
		return fmt.Errorf("cannot fetch prompt: %w", err)
	}
	systemContent := fmt.Sprintf(promptTemplate, tableName)

	openaiKey := os.Getenv("OPENAI_API_KEY")
	if openaiKey == "" {
		return fmt.Errorf("OPENAI_API_KEY missing")
	}
	modelName := os.Getenv("OPENAI_API_MODEL")
	if modelName == "" {
		modelName = "gpt-4o"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	client := openai.NewClient(openaiKey)

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

	var aiResp aiSearchResponse
	raw := resp.Choices[0].Message.Content
	if err := json.Unmarshal([]byte(raw), &aiResp); err != nil {
		fmt.Printf("\033[31mvirhe: json unmarshal failed: %s\033[0m\n", err.Error())
	}

	if debugLogging {
		fmt.Println("🔍 User query:", userQuery)
		fmt.Println("🤖 AI JSON  :", raw)
	}

	//------------------------------------------------
	// 3. Semanttinen ja tarkka sanahaku
	//------------------------------------------------
	type candidate struct {
		RowName  string
		SemDist  float64
		HasSem   bool
		ExactHit bool
		Rank     float64
		GpsKm    float64
	}
	candidates := make(map[string]*candidate)

	/* A) Semanttinen ---------------------------------------------------*/
	desc := strings.TrimSpace(aiResp.TranslationToShortDescription)
	if desc == "" {
		desc = userQuery
	}
	if desc != "" {
		vectorVal, vErr := generateVectorParam(desc)
		if vErr != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", vErr.Error())
		} else {
			similar, sErr := fetchSimilarRows(backend.Db, tableName, vectorVal)
			if sErr != nil {
				fmt.Printf("\033[31mvirhe: %s\033[0m\n", sErr.Error())
			} else {
				for _, s := range similar {
					c := candidates[s.RowName]
					if c == nil {
						c = &candidate{RowName: s.RowName}
						candidates[s.RowName] = c
					}
					c.SemDist = s.DistanceScore
					c.HasSem = true
				}
			}
		}
	}

	/* B) Täysi teksti --------------------------------------------------*/
	tsQuery := strings.TrimSpace(aiResp.TraditionalSearchQuery)
	if tsQuery == "" {
		tsQuery = userQuery
	}
	if tsQuery != "" {
		textHits, tErr := fetchFullTextRows(backend.Db, tableName, tsQuery)
		if tErr != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", tErr.Error())
		} else {
			for _, h := range textHits {
				c := candidates[h.RowName]
				if c == nil {
					c = &candidate{RowName: h.RowName}
					candidates[h.RowName] = c
				}
				c.ExactHit = true
				c.Rank = h.Rank
			}
		}
	}

	if len(candidates) == 0 {
		return writeEmptyResultJSON(w)
	}

	//------------------------------------------------
	// 4. GPS-etäisyydet (joukkokysely)
	//------------------------------------------------
	lat, lon := 0.0, 0.0
	gpsRaw := strings.TrimSpace(aiResp.GPSLocation)
	if gpsRaw == "" {
		gpsRaw = r.URL.Query().Get("gps")
	}
	hasGps := false
	if gpsRaw != "" {
		llat, llon, perr := parseLatLonPair(gpsRaw)
		if perr != nil {
			fmt.Printf("\033[31mvirhe: %s\033[0m\n", perr.Error())
		} else {
			lat, lon = llat, llon
			hasGps = true
		}
	}
	if hasGps {
		if locTable, ok := locationTableMapping[tableName]; ok {
			names := make([]string, 0, len(candidates))
			for n := range candidates {
				names = append(names, n)
			}
			distMap, derr := fetchDistancesForRows(backend.Db, tableName, locTable, lat, lon, names)
			if derr != nil {
				fmt.Printf("\033[31mvirhe: %s\033[0m\n", derr.Error())
			} else {
				for n, d := range distMap {
					if c := candidates[n]; c != nil {
						c.GpsKm = d
					}
				}
			}
		}
	}
	for _, c := range candidates {
		if c.GpsKm == 0 {
			c.GpsKm = math.MaxFloat64
		}
	}

	//------------------------------------------------
	// 5. Ryhmittely & järjestys  (ei enää ExactHit-priorisointia)
	//------------------------------------------------
	var near, far []*candidate
	for n, c := range candidates {
		if !c.HasSem || c.SemDist > semanticThreshold {
			far = append(far, &candidate{
				RowName:  n,
				SemDist:  c.SemDist,
				HasSem:   c.HasSem,
				ExactHit: c.ExactHit,
				Rank:     c.Rank,
				GpsKm:    c.GpsKm,
			})
			continue
		}
		c.RowName = n
		near = append(near, c)
	}

	// Järjestetään molemmat listat GPS-etäisyyden perusteella
	sortCandidates := func(list []*candidate) {
		sort.Slice(list, func(i, j int) bool {
			return list[i].GpsKm < list[j].GpsKm
		})
	}
	sortCandidates(near)
	sortCandidates(far)

	//------------------------------------------------
	// 5b. Debug-tulostus (rivin nimi ensimmäisenä)
	//------------------------------------------------
	if debugLogging {
		printList := func(title string, list []*candidate) {
			if len(list) == 0 {
				return
			}
			fmt.Println(title)
			for i, c := range list {
				kmStr := "∞ km"
				if c.GpsKm != math.MaxFloat64 {
					kmStr = fmt.Sprintf("%.2f km", c.GpsKm)
				}
				parts := []string{
					kmStr,
					fmt.Sprintf("sem %.4f", c.SemDist),
				}
				if c.ExactHit {
					parts = append(parts, fmt.Sprintf("rank %.4f", c.Rank))
				}
				// 🔎 ensimmäisenä rivin nimi
				fmt.Printf("  %d) %s | %s\n",
					i+1,
					c.RowName,
					strings.Join(parts, " | "))
			}
		}
		printList("📍 Lähellä (≤0.70):", near)
		printList("🚩 Kauempana (>0.70):", far)
	}

	//------------------------------------------------
	// 6. Rivit kannasta oikeaan järjestykseen
	//------------------------------------------------
	rowOrder := make([]string, 0, len(near)+len(far))
	for _, c := range near {
		rowOrder = append(rowOrder, c.RowName)
	}
	for _, c := range far {
		rowOrder = append(rowOrder, c.RowName)
	}

	_, _ = gt_2_column_read.GetColumnsMapForTable(tableName)

	columnDataTypes, err := getColumnDataTypesWithFK(tableName, currentDb)
	if err != nil {
		return fmt.Errorf("getColumnDataTypesWithFK: %w", err)
	}

	rowsJSON, resultColumns, err := fetchRowsInOrder(currentDb, tableName, rowOrder)
	if err != nil {
		return fmt.Errorf("fetchRowsInOrder: %w", err)
	}

	//------------------------------------------------
	// 7. results_per_load
	//------------------------------------------------
	var resultsPerLoadStr string
	err = currentDb.QueryRow(`
		SELECT int_value FROM system_config WHERE key = 'results_load_amount'`).Scan(&resultsPerLoadStr)
	if err != nil {
		return fmt.Errorf("config fetch error: %w", err)
	}
	resultsPerLoad, _ := strconv.Atoi(resultsPerLoadStr)

	//------------------------------------------------
	// 8. JSON-vastaus
	//------------------------------------------------
	respJSON := map[string]interface{}{
		"columns":        resultColumns,
		"data":           rowsJSON,
		"types":          columnDataTypes,
		"resultsPerLoad": resultsPerLoad,
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	return json.NewEncoder(w).Encode(respJSON)
}

/* ===========================================================
 *  UUSI apuri – etäisyydet annetulle listalle
 * =========================================================*/

func fetchDistancesForRows(db *sql.DB, mainTable, locationTable string, lat, lon float64, headers []string) (map[string]float64, error) {
	if len(headers) == 0 {
		return nil, nil
	}
	query := fmt.Sprintf(`
		WITH wanted AS (
			SELECT unnest($3::text[]) AS header
		)
		SELECT mt.header,
		       ST_Distance(
			       ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
			       loc.position::geography
		       ) AS dist_m
		FROM wanted
		JOIN %s mt  ON mt.header = wanted.header
		JOIN %s loc ON loc.service_id = mt.id
		WHERE loc.position IS NOT NULL`,
		pq.QuoteIdentifier(mainTable),
		pq.QuoteIdentifier(locationTable),
	)

	rows, err := db.Query(query, lon, lat, pq.Array(headers)) // huom! lon, lat
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	distances := make(map[string]float64)
	for rows.Next() {
		var name string
		var d sql.NullFloat64
		if err := rows.Scan(&name, &d); err != nil {
			return nil, err
		}
		if d.Valid {
			distances[name] = d.Float64 / 1000.0 // ↪︎ km
		}
	}
	return distances, rows.Err()
}

/* ===========================================================
 *  JSON-apuri tyhjille tuloksille
 * =========================================================*/

func writeEmptyResultJSON(w http.ResponseWriter) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	empty := map[string]interface{}{
		"columns":        []string{},
		"data":           []map[string]interface{}{},
		"types":          map[string]interface{}{},
		"resultsPerLoad": 0,
	}
	return json.NewEncoder(w).Encode(empty)
}

/* ===========================================================
 *  Rivien haku annetussa järjestyksessä
 * =========================================================*/

func fetchRowsInOrder(db *sql.DB, table string, headers []string) ([]map[string]interface{}, []string, error) {
	if len(headers) == 0 {
		return nil, nil, nil
	}
	query := fmt.Sprintf(`
		WITH wanted AS (
			SELECT unnest($1::text[]) AS header,
			       generate_series(1, array_length($1::text[],1)) AS pos
		)
		SELECT %s.* 
		FROM wanted
		JOIN %s ON %s.header = wanted.header
		ORDER BY wanted.pos`,
		pq.QuoteIdentifier(table),
		pq.QuoteIdentifier(table),
		pq.QuoteIdentifier(table),
	)
	rows, err := db.Query(query, pq.Array(headers))
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, nil, err
	}

	var data []map[string]interface{}
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, nil, err
		}
		rowObj := make(map[string]interface{})
		for i, c := range cols {
			switch v := vals[i].(type) {
			case time.Time:
				rowObj[c] = v.Format("2006-01-02 15:04:05")
			case []byte:
				rowObj[c] = string(v)
			default:
				rowObj[c] = v
			}
		}
		data = append(data, rowObj)
	}
	return data, cols, rows.Err()
}

/* ===========================================================
 *  Muuttumattomat apurit (buildOrPrefixTsQuery …)
 * =========================================================*/

// buildOrPrefixTsQuery muuntaa esim.
//
//	"kahvila kaninkolo" → "kahvila:* | kaninkolo:*"
func buildOrPrefixTsQuery(input string) string {
	words := strings.Fields(strings.ToLower(input))
	if len(words) == 0 {
		return ""
	}
	for i, w := range words {
		words[i] = w + ":*"
	}
	return strings.Join(words, " | ")
}

// fetchFullTextRows hakee 10 parasta täyden tekstin osumaa
// käyttäen SIMPLE-konfiguraatiota ja search_vector_simple-saraketta.
func fetchFullTextRows(db *sql.DB, mainTable, searchString string) ([]rowTextRank, error) {
	const limitResults = 10

	tsQuery := buildOrPrefixTsQuery(searchString)
	if tsQuery == "" {
		return nil, nil
	}

	query := fmt.Sprintf(`
		WITH q AS (
			SELECT to_tsquery('simple', $1) AS query
		)
		SELECT %[1]s.header,
		       ts_rank(%[1]s.search_vector_simple, q.query) AS rank
		FROM %[1]s, q
		WHERE %[1]s.search_vector_simple @@ q.query
		ORDER BY rank DESC
		LIMIT %[2]d`,
		pq.QuoteIdentifier(mainTable),
		limitResults,
	)

	rows, err := db.Query(query, tsQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []rowTextRank
	for rows.Next() {
		var rowName string
		var rankValue sql.NullFloat64
		if err := rows.Scan(&rowName, &rankValue); err != nil {
			return nil, err
		}
		if rankValue.Valid {
			results = append(results, rowTextRank{rowName, rankValue.Float64})
		}
	}
	return results, rows.Err()
}

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

// fetchSimilarRows hakee 10 merkitykseltään lähintä palvelua.
func fetchSimilarRows(db *sql.DB, mainTable string, queryVector pgvector.Vector) ([]rowSemanticScore, error) {
	const limitResults = 10
	query := fmt.Sprintf(`
		SELECT %s.header,
		       %s.openai_embedding <-> $1 AS distance_score
		FROM %s
		WHERE %s.openai_embedding IS NOT NULL
		ORDER BY distance_score ASC
		LIMIT %d`,
		pq.QuoteIdentifier(mainTable),
		pq.QuoteIdentifier(mainTable),
		pq.QuoteIdentifier(mainTable),
		pq.QuoteIdentifier(mainTable),
		limitResults,
	)

	rows, err := db.Query(query, queryVector)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []rowSemanticScore
	for rows.Next() {
		var n string
		var d sql.NullFloat64
		if err := rows.Scan(&n, &d); err != nil {
			return nil, err
		}
		if d.Valid {
			results = append(results, rowSemanticScore{n, d.Float64})
		}
	}
	return results, rows.Err()
}
