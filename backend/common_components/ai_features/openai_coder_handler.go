// openai_coder_editor.go
package openai

import (
	"context"
	backend "easelect/backend/core_components"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	pgvector "github.com/pgvector/pgvector-go"
	"github.com/sashabaranov/go-openai"
)

type AICoderJSON struct {
	Action          string `json:"action"`
	EmbeddingQuery  string `json:"embedding_query"`
	PathToFilename  string `json:"path_to_filename"`
	FullFileContent string `json:"full_file_content"`
}

// --------------------------------------------------------------------
// Ei striimata chunkkeja suoraan SSE:hen
// --------------------------------------------------------------------
func call_openai_no_stream(
	ctx context.Context,
	client *openai.Client,
	systemMessage string,
	history []openai.ChatCompletionMessage,
	userMessage string,
	modelName string,
) (string, error) {
	if modelName == "" {
		modelName = "gpt-3.5-turbo"
	}

	var messages []openai.ChatCompletionMessage
	messages = append(messages, openai.ChatCompletionMessage{
		Role:    openai.ChatMessageRoleSystem,
		Content: systemMessage,
	})
	messages = append(messages, history...)
	messages = append(messages, openai.ChatCompletionMessage{
		Role:    openai.ChatMessageRoleUser,
		Content: userMessage,
	})

	req := openai.ChatCompletionRequest{
		Model:    modelName,
		Messages: messages,
	}

	resp, err := client.CreateChatCompletion(ctx, req)
	if err != nil {
		return "", fmt.Errorf("error creating chat completion: %w", err)
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}
	return resp.Choices[0].Message.Content, nil
}

// --------------------------------------------------------------------
// SSE-avuksi
// --------------------------------------------------------------------
func escape_for_code_sse(s string) string {
	s = strings.ReplaceAll(s, "\r", "")
	return s
}
func sendSSEChunk(sendSSE func(string, string), eventName, chunk string) {
	if chunk == "" {
		return
	}
	safeChunk := escape_for_code_sse(chunk)
	sendSSE(eventName, safeChunk)
}

// --------------------------------------------------------------------
// Handler
// --------------------------------------------------------------------
func OpenaiCodeEditorStreamHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "only GET method allowed for SSE", http.StatusMethodNotAllowed)
		return
	}

	userMessage := r.URL.Query().Get("user_message")
	encodedConversation := r.URL.Query().Get("conversation")

	var conversationHistory []openai.ChatCompletionMessage
	if encodedConversation != "" {
		decoded, err := url.QueryUnescape(encodedConversation)
		if err == nil {
			if unmarshalErr := json.Unmarshal([]byte(decoded), &conversationHistory); unmarshalErr != nil {
				log.Printf("error unmarshaling conversationHistory: %v", unmarshalErr)
			} else {
				log.Printf("[OpenaiCodeEditorStreamHandler] conversationHistory parsed, length=%d", len(conversationHistory))
			}
		} else {
			log.Printf("url.QueryUnescape error: %v", err)
		}
	} else {
		log.Printf("[OpenaiCodeEditorStreamHandler] no conversation param provided")
	}

	log.Printf("[OpenaiCodeEditorStreamHandler] userMessage=%s, conversationHistoryLength=%d",
		userMessage, len(conversationHistory))

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "server does not support streaming", http.StatusInternalServerError)
		return
	}

	// SSE-funktio: jakaa moniriviset data:t
	sendSSE := func(eventName, data string) {
		lines := strings.Split(data, "\n")
		fmt.Fprintf(w, "event: %s\n", eventName)
		for _, line := range lines {
			fmt.Fprintf(w, "data: %s\n", line)
		}
		fmt.Fprint(w, "\n")
		flusher.Flush()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	if err := handleCoderAction(ctx, userMessage, conversationHistory, sendSSE); err != nil {
		log.Printf("handleCoderAction error: %v", err)
		sendSSE("error", escape_for_code_sse(err.Error()))
	}
}

// --------------------------------------------------------------------
// Varsinainen logiikka
// --------------------------------------------------------------------
func handleCoderAction(
	ctx context.Context,
	userMessage string,
	conversationHistory []openai.ChatCompletionMessage,
	sendSSE func(string, string),
) error {
	openaiKey := os.Getenv("OPENAI_API_KEY")
	if openaiKey == "" {
		return fmt.Errorf("missing OPENAI_API_KEY")
	}
	client := openai.NewClient(openaiKey)

	aiCoderMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_AICODER")
	if aiCoderMsg == "" {
		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_AICODER")
	}
	summaryMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_SUMMARY")
	if summaryMsg == "" {
		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_SUMMARY")
	}

	log.Printf("[handleCoderAction] userMessage=%q, conversationHistory length=%d",
		userMessage, len(conversationHistory))

	// (A) Pyydetään OpenAI:lta "päävastaus"
	mainAnswer, err := call_openai_no_stream(
		ctx,
		client,
		aiCoderMsg,
		conversationHistory,
		userMessage,
		os.Getenv("OPENAI_API_MODEL"),
	)
	if err != nil {
		sendSSE("done", "")
		return fmt.Errorf("ai coder chat non-stream call failed: %w", err)
	}

	// (B) Poistetaan code-fencet JSON:in ympäriltä
	cleaned := removeJsonFence(mainAnswer)

	// (C) Yritetään parse JSON
	var coderResp AICoderJSON
	if errJSON := json.Unmarshal([]byte(cleaned), &coderResp); errJSON != nil {
		log.Printf("[handleCoderAction] parse error => default to text, err=%v", errJSON)
		coderResp.Action = "text"
	}

	switch coderResp.Action {

	case "search":
		// Kuten aiemmin: generoi hakutulokset + summary
		results, errSearch := do_semantic_search_in_file_structure(ctx, coderResp.EmbeddingQuery)
		if errSearch != nil {
			sendSSE("done", mainAnswer)
			return fmt.Errorf("semantic search failed: %w", errSearch)
		}

		var sb strings.Builder
		sb.WriteString("**Top matching files**:\n\n")
		for i, r := range results {
			sb.WriteString(fmt.Sprintf("**Match %d**:\n", i+1))
			sb.WriteString(r)
			sb.WriteString("\n\n")
		}
		finalStr := sb.String()

		sendSSEChunk(sendSSE, "chunk_main", finalStr)
		sendSSE("done_main", finalStr)

		// Halutaan summary => liitetään hakutulos conversationHistoryyn
		conversationHistory = append(conversationHistory,
			openai.ChatCompletionMessage{
				Role:    openai.ChatMessageRoleAssistant,
				Content: finalStr,
			},
		)

		// Kutsutaan summary
		summaryAnswer, errSummary := call_openai_no_stream(
			ctx, client, summaryMsg, conversationHistory,
			"Please provide a short summary of the search results.",
			os.Getenv("OPENAI_API_MODEL"),
		)
		if errSummary != nil {
			sendSSE("done", finalStr)
			return fmt.Errorf("summary call failed: %w", errSummary)
		}

		sendSSEChunk(sendSSE, "chunk_summary", summaryAnswer)
		sendSSE("done", "")
		return nil

	case "file":
		// Luodaan tai päivitetään tiedosto
		dirName := filepath.Dir(coderResp.PathToFilename)
		if err := os.MkdirAll(dirName, 0755); err != nil {
			sendSSE("done", mainAnswer)
			return fmt.Errorf("could not create directory: %w", err)
		}
		if errWrite := os.WriteFile(coderResp.PathToFilename, []byte(coderResp.FullFileContent), 0644); errWrite != nil {
			sendSSE("done", mainAnswer)
			return fmt.Errorf("error writing file: %w", errWrite)
		}
		sendSSEChunk(sendSSE, "chunk_main", "File written OK.\n")

		// Halutaanko vielä summary? Jos et halua, voit lopettaa suoraan:
		sendSSE("done", "")
		return nil

	default:
		// "text" => Pelkkä teksti suoraan SSE:hen, ILMAN summarya
		sendSSEChunk(sendSSE, "chunk_main", mainAnswer)
		// Jos et halua summarya, lopetetaan:
		sendSSE("done", "")
		return nil
	}
}

// Poistaa ```json ja ``` -rivien jäänteet
func removeJsonFence(s string) string {
	s = strings.ReplaceAll(s, "```json", "")
	s = strings.ReplaceAll(s, "```", "")
	return strings.TrimSpace(s)
}

// do_semantic_search_in_file_structure ennallaan...
func do_semantic_search_in_file_structure(ctx context.Context, user_query string) ([]string, error) {
	db := backend.Db

	openai_key := os.Getenv("OPENAI_API_KEY")
	if openai_key == "" {
		return nil, fmt.Errorf("missing OPENAI_API_KEY")
	}
	embedding_model := os.Getenv("OPENAI_EMBEDDING_MODEL")
	if embedding_model == "" {
		embedding_model = "text-embedding-ada-002"
	}

	client := openai.NewClient(openai_key)

	embed_req := openai.EmbeddingRequest{
		Model: openai.EmbeddingModel(embedding_model),
		Input: []string{user_query},
	}
	embed_resp, err := client.CreateEmbeddings(ctx, embed_req)
	if err != nil {
		return nil, fmt.Errorf("createEmbeddings error: %w", err)
	}
	if len(embed_resp.Data) == 0 {
		return nil, fmt.Errorf("createEmbeddings returned no data")
	}

	embedding := embed_resp.Data[0].Embedding
	vector_val := pgvector.NewVector(embedding)

	query := `
        SELECT name, parent_folder
        FROM file_structure
        ORDER BY openai_embedding <-> $1
        LIMIT 5
    `
	rows, err := db.QueryContext(ctx, query, vector_val)
	if err != nil {
		return nil, fmt.Errorf("semantic search query error: %w", err)
	}
	defer rows.Close()

	var results []string
	for rows.Next() {
		var file_name, parent_folder string
		if err := rows.Scan(&file_name, &parent_folder); err != nil {
			return nil, fmt.Errorf("scan error: %w", err)
		}
		full_path := file_name
		if parent_folder != "" {
			full_path = parent_folder + "\\" + file_name
		}
		content_bytes, read_err := os.ReadFile(full_path)
		if read_err != nil {
			log.Printf("could not read file %s: %v", full_path, read_err)
			content_bytes = []byte("Could not read file from disk: " + read_err.Error())
		}
		result_string := fmt.Sprintf(
			"parent_folder: %s\nfile_name: %s\nfull_path: %s\ncontent:\n%s",
			parent_folder,
			file_name,
			full_path,
			string(content_bytes),
		)
		results = append(results, result_string)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	log.Printf("[do_semantic_search_in_file_structure] top results read: %d", len(results))
	return results, nil
}
