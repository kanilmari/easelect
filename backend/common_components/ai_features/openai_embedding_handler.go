package openai

import (
	"context"
	"database/sql"
	backend "easelect/backend/core_components"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	pgvector "github.com/pgvector/pgvector-go"
	"github.com/sashabaranov/go-openai"
)

// OpenAIEmbeddingStreamHandler lukee kaikki sarakkeet jokaiselta riviltä,
// kokoaa vain tekstisarakkeet (VARCHAR/TEXT) yhdeksi tekstilauseeksi ja generoi
// embeddingin openai_embedding-sarakkeeseen (lisää sarakkeen jos sitä ei ole).
func OpenaiEmbeddingStreamHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "only GET method allowed for SSE", http.StatusMethodNotAllowed)
		return
	}

	tableName := r.URL.Query().Get("table_name")
	if tableName == "" {
		http.Error(w, "missing table_name query param", http.StatusBadRequest)
		return
	}

	openaiKey := os.Getenv("OPENAI_API_KEY")
	if openaiKey == "" {
		http.Error(w, "missing OPENAI_API_KEY", http.StatusInternalServerError)
		return
	}

	embeddingModel := os.Getenv("OPENAI_EMBEDDING_MODEL")
	if embeddingModel == "" {
		embeddingModel = "text-embedding-ada-002"
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "server does not support streaming", http.StatusInternalServerError)
		return
	}

	sendSSE := func(eventName, data string) {
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventName, data)
		flusher.Flush()
	}

	db := backend.Db

	// Tarkistetaan, onko openai_embedding-saraketta jo olemassa.
	colCheckQuery := `
		SELECT column_name
		FROM information_schema.columns
		WHERE table_name = $1
		  AND column_name = 'openai_embedding'
	`
	var existingColumn string
	err := db.QueryRow(colCheckQuery, tableName).Scan(&existingColumn)
	if err == sql.ErrNoRows {
		// Luodaan sarake, jos ei löydy
		alterQuery := fmt.Sprintf("ALTER TABLE %s ADD COLUMN openai_embedding vector", tableName)
		if _, alterErr := db.Exec(alterQuery); alterErr != nil {
			log.Printf("error adding openai_embedding column: %v", alterErr)
			sendSSE("error", escape_for_sse(fmt.Sprintf("could not add openai_embedding column: %v", alterErr)))
			return
		}
	} else if err != nil {
		log.Printf("error checking openai_embedding column: %v", err)
		sendSSE("error", escape_for_sse(fmt.Sprintf("column check error: %v", err)))
		return
	}

	// Haetaan kaikki sarakkeet jotka ovat tekstityyppiä (VARCHAR/TEXT).
	textColumnsQuery := `
		SELECT column_name
		FROM information_schema.columns
		WHERE table_name = $1
		  AND data_type IN ('text', 'character varying')
		ORDER BY ordinal_position
	`
	rowsCols, err := db.Query(textColumnsQuery, tableName)
	if err != nil {
		log.Printf("error fetching text columns: %v", err)
		sendSSE("error", escape_for_sse(fmt.Sprintf("error fetching text columns: %v", err)))
		return
	}
	defer rowsCols.Close()

	textColumnsSet := make(map[string]bool)
	for rowsCols.Next() {
		var colName string
		if scanErr := rowsCols.Scan(&colName); scanErr != nil {
			log.Printf("scan error: %v", scanErr)
			sendSSE("error", escape_for_sse(fmt.Sprintf("text columns scan error: %v", scanErr)))
			return
		}
		textColumnsSet[colName] = true
	}
	if rowsCols.Err() != nil {
		log.Printf("rowsCols iteration error: %v", rowsCols.Err())
		sendSSE("error", escape_for_sse(fmt.Sprintf("rowsCols iteration error: %v", rowsCols.Err())))
		return
	}

	// Haetaan kaikki sarakkeet (koska tarvitaan myös id).
	selectQuery := fmt.Sprintf(`SELECT * FROM %s`, tableName)
	rows, err := db.Query(selectQuery)
	if err != nil {
		log.Printf("error selecting rows: %v", err)
		sendSSE("error", escape_for_sse(fmt.Sprintf("select error: %v", err)))
		return
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		log.Printf("error fetching columns: %v", err)
		sendSSE("error", escape_for_sse(fmt.Sprintf("error fetching columns: %v", err)))
		return
	}

	// Etsitään 'id'-sarake
	idColIndex := -1
	for i, colName := range columns {
		if strings.EqualFold(colName, "id") {
			idColIndex = i
			break
		}
	}
	if idColIndex == -1 {
		sendSSE("error", escape_for_sse("no 'id' column found in table"))
		return
	}

	client := openai.NewClient(openaiKey)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	var totalRows int
	var embeddedCount int

	numCols := len(columns)

	for rows.Next() {
		totalRows++
		values := make([]interface{}, numCols)
		ptrs := make([]interface{}, numCols)
		for i := 0; i < numCols; i++ {
			ptrs[i] = &values[i]
		}

		if err := rows.Scan(ptrs...); err != nil {
			log.Printf("scan error: %v", err)
			sendSSE("error", escape_for_sse(fmt.Sprintf("scan error row=%d: %v", totalRows, err)))
			continue
		}

		rowIDVal := values[idColIndex]
		var rowID int
		switch v := rowIDVal.(type) {
		case int64:
			rowID = int(v)
		case int32:
			rowID = int(v)
		case int:
			rowID = v
		default:
			sendSSE("error", escape_for_sse(fmt.Sprintf("row has non-int id: %v", rowIDVal)))
			continue
		}

		// Rakennetaan tekstilause vain tekstitietotyypeistä
		rowText := buildRowText(columns, values, textColumnsSet)
		log.Printf("[DEBUG] row id=%v: rowText length=%d", rowIDVal, len(rowText))
		if len(rowText) < 500 {
			log.Printf("[DEBUG] rowText content = %q", rowText)
		}

		if strings.TrimSpace(rowText) == "" {
			sendSSE("progress", escape_for_sse(fmt.Sprintf("row id=%d empty text, skipped", rowID)))
			continue
		}

		embedReq := openai.EmbeddingRequest{
			Model: openai.EmbeddingModel(embeddingModel),
			Input: []string{rowText},
		}
		embedResp, err := client.CreateEmbeddings(ctx, embedReq)
		if err != nil {
			log.Printf("embedding error (id=%d): %v", rowID, err)
			sendSSE("error", escape_for_sse(fmt.Sprintf("row=%d: %v", rowID, err)))
			continue
		}
		if len(embedResp.Data) == 0 {
			log.Printf("no embedding data returned for row %d", rowID)
			sendSSE("error", escape_for_sse(fmt.Sprintf("no embedding data row=%d", rowID)))
			continue
		}

		embeddingVec := embedResp.Data[0].Embedding
		if err := storeEmbeddingInDB(db, tableName, rowID, embeddingVec); err != nil {
			log.Printf("store embedding error (id=%d): %v", rowID, err)
			sendSSE("error", escape_for_sse(fmt.Sprintf("row=%d: %v", rowID, err)))
			continue
		}

		embeddedCount++
		sendSSE("progress", escape_for_sse(fmt.Sprintf("embedded row id=%d", rowID)))
	}
	if err := rows.Err(); err != nil && err != io.EOF {
		log.Printf("rows iteration error: %v", err)
		sendSSE("error", escape_for_sse(fmt.Sprintf("rows error: %v", err)))
	}

	sendSSE("done", escape_for_sse(fmt.Sprintf("embedding finished. total=%d, embedded=%d", totalRows, embeddedCount)))
}

// buildRowText luo yksinkertaisen tekstin vain niistä sarakkeista, jotka löytyvät textColumnsSet:stä.
// Ohitetaan myös openai_embedding-sarake varmuuden vuoksi.
func buildRowText(columns []string, values []interface{}, textColumnsSet map[string]bool) string {
	var sb strings.Builder
	for i, colName := range columns {
		// Ei käsitellä openai_embedding -saraketta
		if strings.EqualFold(colName, "openai_embedding") {
			continue
		}
		// Otetaan mukaan vain tekstipohjaiset sarakkeet
		if !textColumnsSet[colName] {
			continue
		}

		val := values[i]
		var valStr string
		if val == nil {
			valStr = "NULL"
		} else {
			fullStr := fmt.Sprintf("%v", val)
			if len(fullStr) > 2000 {
				fullStr = fullStr[:2000] + "...(truncated)"
			}
			valStr = fullStr
		}

		if sb.Len() > 0 {
			sb.WriteString(", ")
		}
		sb.WriteString(colName)
		sb.WriteString(" is ")
		sb.WriteString(valStr)
	}
	return sb.String()
}

func storeEmbeddingInDB(db *sql.DB, tableName string, rowID int, embedding []float32) error {
	vectorVal := pgvector.NewVector(embedding)
	sqlStr := fmt.Sprintf("UPDATE %s SET openai_embedding = $1 WHERE id = $2", tableName)
	_, err := db.Exec(sqlStr, vectorVal, rowID)
	if err != nil {
		return fmt.Errorf("update error: %w", err)
	}
	return nil
}
