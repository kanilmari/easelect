package openai

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"easelect/backend"

	"github.com/sashabaranov/go-openai"
)

type ChatStreamRequest struct {
	TableName   string
	UserMessage string
}

// OpenAIChatStreamHandler ...
func OpenAIChatStreamHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "only GET method allowed for SSE", http.StatusMethodNotAllowed)
		return
	}

	table_name := r.URL.Query().Get("table_name")
	user_message := r.URL.Query().Get("user_message")

	// ---------- Ota vastaan conversation JSON-param ----------
	encoded_conversation := r.URL.Query().Get("conversation")
	var conversation_history []openai.ChatCompletionMessage
	if encoded_conversation != "" {
		decoded, err := url.QueryUnescape(encoded_conversation)
		if err != nil {
			log.Printf("conversation decode error: %v", err)
		} else {
			err = json.Unmarshal([]byte(decoded), &conversation_history)
			if err != nil {
				log.Printf("conversation unmarshal error: %v", err)
			}
		}
	}
	// ---------------------------------------------------------

	req := ChatStreamRequest{
		TableName:   table_name,
		UserMessage: user_message,
	}

	openai_key := os.Getenv("OPENAI_API_KEY")
	if openai_key == "" {
		http.Error(w, "missing OPENAI_API_KEY", http.StatusInternalServerError)
		return
	}

	table_info, err := fetch_extended_table_description(backend.Db, req.TableName)
	if err != nil {
		log.Printf("virhe taulutietojen haussa: %v", err)
		table_info = "Could not retrieve extended table info."
	}

	// Haetaan system-viesti ympäristömuuttujasta (tai fallback).
	system_prompt_template := os.Getenv("OPENAI_TABLE_STREAM_PROMPT")
	if system_prompt_template == "" {
		// Vanha oletus, jos ei asetettu .env:issä
		system_prompt_template = `You are a specialized SQL assistant for table "%s".

Table structure and constraints:
%s

Defaults for SELECT querys:
- SELECT * (select all columns)
- ILIKE for VARCHAR and TEXT columns
- Wildcards %% with ILIKE
- ORDER BY id DESC

Return only valid JSON format with exactly two keys below in the given order. Return only valid JSON without any explanations or comments.:
{ "valid_sql": "SELECT / INSERT / UPDATE / ALTER ...", "friendly_explanation": "..." }
If you are missing data, leave them empty.
`
	}

	system_content := fmt.Sprintf(system_prompt_template, req.TableName, table_info)

	// Kootaan lopullinen messages-slice
	messages := []openai.ChatCompletionMessage{
		{Role: openai.ChatMessageRoleSystem, Content: system_content},
	}
	messages = append(messages, conversation_history...)
	messages = append(messages, openai.ChatCompletionMessage{
		Role:    openai.ChatMessageRoleUser,
		Content: req.UserMessage,
	})

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "server does not support streaming", http.StatusInternalServerError)
		return
	}
	send_sse := func(eventName, data string) {
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventName, data)
		flusher.Flush()
	}

	// Mallin nimi ympäristömuuttujasta (tai fallback).
	model_name := os.Getenv("OPENAI_API_MODEL")
	if model_name == "" {
		model_name = "gpt-3.5-turbo"
	}

	client := openai.NewClient(openai_key)
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	stream_req := openai.ChatCompletionRequest{
		Model:    model_name,
		Messages: messages,
		Stream:   true,
	}

	stream, err := client.CreateChatCompletionStream(ctx, stream_req)
	if err != nil {
		err_msg := fmt.Sprintf("createChatCompletionStream error: %v", err)
		log.Println(err_msg)
		send_sse("error", escape_for_sse(err_msg))
		return
	}
	defer stream.Close()

	var full_answer strings.Builder

	var pure_sql_builder strings.Builder
	var have_pure_sql bool
	var inside_pure_sql bool
	var pure_sql_quote_terminator rune = '"'

	for {
		resp, err := stream.Recv()
		if err != nil {
			if err == io.EOF {
				break
			}
			err_msg := fmt.Sprintf("stream read error: %v", err)
			log.Println(err_msg)
			send_sse("error", escape_for_sse(err_msg))
			return
		}
		if len(resp.Choices) == 0 {
			continue
		}
		chunk := resp.Choices[0].Delta.Content
		if chunk == "" {
			continue
		}

		send_sse("chunk", escape_for_sse(chunk))
		full_answer.WriteString(chunk)

		// Parsitaan chunk (etsi "valid_sql": "...")
		for _, c := range chunk {
			if !inside_pure_sql {
				pure_sql_builder.WriteRune(c)
				pivot := pure_sql_builder.String()
				if strings.Contains(pivot, `"valid_sql": "`) {
					inside_pure_sql = true
					pure_sql_builder.Reset()
				} else if len(pivot) > 2000 {
					pure_sql_builder.Reset()
				}
			} else {
				if c == pure_sql_quote_terminator {
					inside_pure_sql = false
					have_pure_sql = true
					found_sql := pure_sql_builder.String()

					log.Printf("[STREAM] valid_sql extracted: %s", found_sql)
					go run_sql_immediately(found_sql, send_sse)

					pure_sql_builder.Reset()
				} else {
					pure_sql_builder.WriteRune(c)
				}
			}
		}
	}

	final_text := strings.TrimSpace(full_answer.String())

	// Poista mahdolliset markdown-aitaukset
	final_text = strings.TrimPrefix(final_text, "```json")
	final_text = strings.TrimPrefix(final_text, "```")
	final_text = strings.TrimSuffix(final_text, "```json")
	final_text = strings.TrimSuffix(final_text, "```")

	if have_pure_sql {
		log.Printf("Final stream ended. valid_sql was found.")
	} else {
		log.Printf("Final stream ended. valid_sql was never found.")
	}

	send_sse("done", escape_for_sse(final_text))
}

// run_sql_immediately suorittaa SELECT-, INSERT-, UPDATE-, DELETE-, ALTER-, ym. -lauseet lennosta
func run_sql_immediately(sql_str string, send_sse func(eventName, data string)) {
	sql_up := strings.ToUpper(strings.TrimSpace(sql_str))

	db := backend.Db

	// SELECT
	if strings.HasPrefix(sql_up, "SELECT") {
		rows, err := db.Query(sql_str)
		if err != nil {
			err_msg := fmt.Sprintf("error running immediate SELECT: %v", err)
			log.Println(err_msg)
			send_sse("error", escape_for_sse(err_msg))
			return
		}
		defer rows.Close()

		cols, err := rows.Columns()
		if err != nil {
			err_msg := fmt.Sprintf("error reading columns: %v", err)
			log.Println(err_msg)
			send_sse("error", escape_for_sse(err_msg))
			return
		}

		var all_data []map[string]interface{}
		for rows.Next() {
			vals := make([]interface{}, len(cols))
			ptrs := make([]interface{}, len(cols))
			for i := range cols {
				ptrs[i] = &vals[i]
			}
			if err := rows.Scan(ptrs...); err != nil {
				err_msg := fmt.Sprintf("error scanning row: %v", err)
				log.Println(err_msg)
				send_sse("error", escape_for_sse(err_msg))
				return
			}
			row_map := make(map[string]interface{})
			for i, c := range cols {
				row_map[c] = vals[i]
			}
			all_data = append(all_data, row_map)
		}

		type immediate_result struct {
			Columns []string                 `json:"columns"`
			Rows    []map[string]interface{} `json:"rows"`
		}
		out := immediate_result{
			Columns: cols,
			Rows:    all_data,
		}
		json_bytes, err := json.Marshal(out)
		if err != nil {
			err_msg := fmt.Sprintf("error marshaling immediate result: %v", err)
			log.Println(err_msg)
			send_sse("error", escape_for_sse(err_msg))
			return
		}

		send_sse("sql_result", escape_for_sse(string(json_bytes)))
		return
	}

	// INSERT, UPDATE, DELETE, ALTER, ym.
	res, err := db.Exec(sql_str)
	if err != nil {
		err_msg := fmt.Sprintf("error running immediate exec: %v", err)
		log.Println(err_msg)
		send_sse("error", escape_for_sse(err_msg))
		return
	}

	rows_affected, err := res.RowsAffected()
	if err != nil {
		err_msg := fmt.Sprintf("error getting rowsAffected: %v", err)
		log.Println(err_msg)
		send_sse("error", escape_for_sse(err_msg))
		return
	}

	// Palautetaan SSE "sql_result" JSONilla, joka kertoo affected-rivit
	type exec_result struct {
		RowsAffected int64 `json:"rows_affected"`
	}
	out := exec_result{
		RowsAffected: rows_affected,
	}
	json_bytes, err := json.Marshal(out)
	if err != nil {
		err_msg := fmt.Sprintf("error marshaling exec result: %v", err)
		log.Println(err_msg)
		send_sse("error", escape_for_sse(err_msg))
		return
	}

	send_sse("sql_result", escape_for_sse(string(json_bytes)))
}

func escape_for_sse(s string) string {
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", "\\n")
	return s
}

// fetch_extended_table_description hakee saraketiedot sekä PK/UNIQUE/FOREIGN KEY -tiedot.
// Lisäksi se selvittää, mitkä muut taulut viittaavat tähän tauluun (foreign keys).
// Nyt lisätty myös vierastaulujen täydet saraketiedot.
func fetch_extended_table_description(db *sql.DB, table_name string) (string, error) {
	if table_name == "" {
		return "", nil
	}

	// 1) Päätaulun sarakkeet
	col_rows, err := db.Query(`
		SELECT column_name, data_type, is_nullable
		FROM information_schema.columns
		WHERE table_name = $1
		ORDER BY ordinal_position
	`, table_name)
	if err != nil {
		return "", fmt.Errorf("error fetching columns: %w", err)
	}
	defer col_rows.Close()

	var col_info strings.Builder
	col_info.WriteString("Columns:\n")
	found_any_cols := false
	for col_rows.Next() {
		found_any_cols = true
		var colName, dataType, isNullable string
		if err := col_rows.Scan(&colName, &dataType, &isNullable); err != nil {
			return "", err
		}
		col_info.WriteString(fmt.Sprintf("  - %s %s (nullable: %s)\n", colName, dataType, isNullable))
	}
	if err := col_rows.Err(); err != nil {
		return "", err
	}
	if !found_any_cols {
		col_info.WriteString("  (No columns or table not found)\n")
	}

	// 2) PK ja UNIQUE
	pk_uniques, err := fetch_pk_and_uniques(db, table_name)
	if err != nil {
		log.Printf("error fetching PK/UNIQUE: %v", err)
	}
	var pk_unique_info strings.Builder
	if pk_uniques != "" {
		pk_unique_info.WriteString("Primary/Unique constraints:\n")
		pk_unique_info.WriteString(pk_uniques)
	} else {
		pk_unique_info.WriteString("Primary/Unique constraints: (none)\n")
	}

	// 3) Foreign keys tästä taulusta toisiin tauluihin
	fk_details, fk_tables, err := fetch_foreign_keys_and_tables(db, table_name)
	if err != nil {
		log.Printf("error fetching foreign keys: %v", err)
	}
	var fk_info strings.Builder
	if fk_details != "" {
		fk_info.WriteString("Foreign key references (this table -> other tables):\n")
		fk_info.WriteString(fk_details)
	} else {
		fk_info.WriteString("No foreign keys referencing other tables.\n")
	}

	// 4) Mitkä taulut viittaavat tähän tauluun
	ref_by_details, ref_tables, err := fetch_referenced_by_and_tables(db, table_name)
	if err != nil {
		log.Printf("error fetching referencing tables: %v", err)
	}
	var ref_by_info strings.Builder
	if ref_by_details != "" {
		ref_by_info.WriteString("Referenced by (other tables -> this table):\n")
		ref_by_info.WriteString(ref_by_details)
	} else {
		ref_by_info.WriteString("No other tables referencing this table.\n")
	}

	// Kootaan listaus vierastauluista
	all_related_tables := make(map[string]struct{})
	for _, t := range fk_tables {
		if t != table_name {
			all_related_tables[t] = struct{}{}
		}
	}
	for _, t := range ref_tables {
		if t != table_name {
			all_related_tables[t] = struct{}{}
		}
	}

	var related_info strings.Builder
	if len(all_related_tables) > 0 {
		related_info.WriteString("\nAdditional table structures (foreign or referencing):\n")
		for t := range all_related_tables {
			cols, err := fetch_columns_string_for_table(db, t)
			if err != nil {
				log.Printf("error fetching columns for related table %s: %v", t, err)
				related_info.WriteString(fmt.Sprintf("- %s: could not retrieve columns\n", t))
				continue
			}
			related_info.WriteString(fmt.Sprintf("- Table %s:\n", t))
			related_info.WriteString(cols)
		}
	} else {
		related_info.WriteString("\n(No additional related tables)\n")
	}

	var sb strings.Builder
	sb.WriteString(col_info.String())
	sb.WriteString("\n")
	sb.WriteString(pk_unique_info.String())
	sb.WriteString("\n")
	sb.WriteString(fk_info.String())
	sb.WriteString("\n")
	sb.WriteString(ref_by_info.String())
	sb.WriteString(related_info.String())

	return sb.String(), nil
}

// fetch_pk_and_uniques hakee sarakkeet, joissa on PRIMARY KEY tai UNIQUE -rajoitus
func fetch_pk_and_uniques(db *sql.DB, table_name string) (string, error) {
	query := `
SELECT kcu.column_name, tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_name = kcu.table_name
WHERE tc.table_name = $1
  AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE')
ORDER BY kcu.ordinal_position;
`
	rows, err := db.Query(query, table_name)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var sb strings.Builder
	for rows.Next() {
		var colName, cType string
		if err := rows.Scan(&colName, &cType); err != nil {
			return "", err
		}
		sb.WriteString(fmt.Sprintf("  - %s: %s\n", colName, cType))
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	return sb.String(), nil
}

// fetch_foreign_keys_and_tables hakee taulun foreign key -sarakkeet ja palauttaa
// myös listan tauluista, joihin tämä taulu viittaa.
func fetch_foreign_keys_and_tables(db *sql.DB, table_name string) (string, []string, error) {
	query := `
SELECT
    tc.constraint_name,
    kcu.column_name AS fk_column,
    ccu.table_name AS referenced_table,
    ccu.column_name AS referenced_column
FROM
    information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_name = kcu.table_name
    JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
WHERE
    tc.table_name = $1
    AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY
    kcu.ordinal_position
`
	rows, err := db.Query(query, table_name)
	if err != nil {
		return "", nil, err
	}
	defer rows.Close()

	var sb strings.Builder
	var tables []string
	found := false
	for rows.Next() {
		found = true
		var constraintName, fkCol, refTable, refCol string
		if err := rows.Scan(&constraintName, &fkCol, &refTable, &refCol); err != nil {
			return "", nil, err
		}
		sb.WriteString(fmt.Sprintf("  - %s -> %s(%s) [constraint: %s]\n", fkCol, refTable, refCol, constraintName))
		tables = append(tables, refTable)
	}
	if err := rows.Err(); err != nil {
		return "", nil, err
	}
	if !found {
		return "", nil, nil
	}
	return sb.String(), tables, nil
}

// fetch_referenced_by_and_tables hakee listan tauluista, joissa on foreign key -viittaus "tähän" tauluun
func fetch_referenced_by_and_tables(db *sql.DB, table_name string) (string, []string, error) {
	query := `
SELECT
    tc.table_name AS referencing_table,
    kcu.column_name AS referencing_column,
    ccu.column_name AS target_col,
    tc.constraint_name
FROM
    information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_name = kcu.table_name
    JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
WHERE
    tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = $1
ORDER BY
    tc.table_name, kcu.ordinal_position
`
	rows, err := db.Query(query, table_name)
	if err != nil {
		return "", nil, err
	}
	defer rows.Close()

	var sb strings.Builder
	var tables []string
	found := false
	for rows.Next() {
		found = true
		var referencingTable, referencingColumn, targetCol, constraintName string
		if err := rows.Scan(&referencingTable, &referencingColumn, &targetCol, &constraintName); err != nil {
			return "", nil, err
		}
		sb.WriteString(fmt.Sprintf("  - %s.%s -> this_table.%s [constraint: %s]\n",
			referencingTable, referencingColumn, targetCol, constraintName))
		tables = append(tables, referencingTable)
	}
	if err := rows.Err(); err != nil {
		return "", nil, err
	}
	if !found {
		return "", nil, nil
	}
	return sb.String(), tables, nil
}

// fetch_columns_string_for_table hakee pelkät saraketiedot annetusta taulusta
func fetch_columns_string_for_table(db *sql.DB, table_name string) (string, error) {
	rows, err := db.Query(`
		SELECT column_name, data_type, is_nullable
		FROM information_schema.columns
		WHERE table_name = $1
		ORDER BY ordinal_position
	`, table_name)
	if err != nil {
		return "", fmt.Errorf("error fetching columns for table %s: %w", table_name, err)
	}
	defer rows.Close()

	var sb strings.Builder
	found_any := false
	for rows.Next() {
		found_any = true
		var colName, dataType, isNullable string
		if err := rows.Scan(&colName, &dataType, &isNullable); err != nil {
			return "", fmt.Errorf("error scanning column for table %s: %w", table_name, err)
		}
		sb.WriteString(fmt.Sprintf("    - %s %s (nullable: %s)\n", colName, dataType, isNullable))
	}
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("error with rows for table %s: %w", table_name, err)
	}
	if !found_any {
		sb.WriteString("    (No columns or table not found)\n")
	}
	return sb.String(), nil
}
