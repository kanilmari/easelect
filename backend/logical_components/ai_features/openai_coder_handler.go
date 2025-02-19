// openai_coder_editor.go
package openai

import (
	"context"
	backend "easelect/backend/main_app"
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
func OpenAICodeEditorStreamHandler(w http.ResponseWriter, r *http.Request) {
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
				log.Printf("[OpenAICodeEditorStreamHandler] conversationHistory parsed, length=%d", len(conversationHistory))
			}
		} else {
			log.Printf("url.QueryUnescape error: %v", err)
		}
	} else {
		log.Printf("[OpenAICodeEditorStreamHandler] no conversation param provided")
	}

	log.Printf("[OpenAICodeEditorStreamHandler] userMessage=%s, conversationHistoryLength=%d",
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

// // openai_coder_editor.go
// package openai

// import (
// 	"context"
// 	"easelect/backend/main_app"
// 	"encoding/json"
// 	"fmt"
// 	"log"
// 	"net/http"
// 	"net/url"
// 	"os"
// 	"path/filepath"
// 	"strings"
// 	"time"

// 	pgvector "github.com/pgvector/pgvector-go"
// 	"github.com/sashabaranov/go-openai"
// )

// type AICoderJSON struct {
// 	Action          string `json:"action"`
// 	EmbeddingQuery  string `json:"embedding_query"`
// 	PathToFilename  string `json:"path_to_filename"`
// 	FullFileContent string `json:"full_file_content"`
// }

// // --------------------------------------------------------------------
// // Ei striimata chunkkeja suoraan SSE:hen
// // --------------------------------------------------------------------
// func call_openai_no_stream(
// 	ctx context.Context,
// 	client *openai.Client,
// 	systemMessage string,
// 	history []openai.ChatCompletionMessage,
// 	userMessage string,
// 	modelName string,
// ) (string, error) {
// 	if modelName == "" {
// 		modelName = "gpt-3.5-turbo"
// 	}

// 	var messages []openai.ChatCompletionMessage
// 	messages = append(messages, openai.ChatCompletionMessage{
// 		Role:    openai.ChatMessageRoleSystem,
// 		Content: systemMessage,
// 	})
// 	messages = append(messages, history...)
// 	messages = append(messages, openai.ChatCompletionMessage{
// 		Role:    openai.ChatMessageRoleUser,
// 		Content: userMessage,
// 	})

// 	req := openai.ChatCompletionRequest{
// 		Model:    modelName,
// 		Messages: messages,
// 	}

// 	resp, err := client.CreateChatCompletion(ctx, req)
// 	if err != nil {
// 		return "", fmt.Errorf("error creating chat completion: %w", err)
// 	}
// 	if len(resp.Choices) == 0 {
// 		return "", fmt.Errorf("no choices in response")
// 	}
// 	return resp.Choices[0].Message.Content, nil
// }

// // --------------------------------------------------------------------
// // SSE-avuksi
// // --------------------------------------------------------------------
// func escape_for_code_sse(s string) string {
// 	s = strings.ReplaceAll(s, "\r", "")
// 	return s
// }
// func sendSSEChunk(sendSSE func(string, string), eventName, chunk string) {
// 	if chunk == "" {
// 		return
// 	}
// 	safeChunk := escape_for_code_sse(chunk)
// 	sendSSE(eventName, safeChunk)
// }

// // --------------------------------------------------------------------
// // Handler
// // --------------------------------------------------------------------
// func OpenAICodeEditorStreamHandler(w http.ResponseWriter, r *http.Request) {
// 	if r.Method != http.MethodGet {
// 		http.Error(w, "only GET method allowed for SSE", http.StatusMethodNotAllowed)
// 		return
// 	}

// 	userMessage := r.URL.Query().Get("user_message")
// 	encodedConversation := r.URL.Query().Get("conversation")

// 	var conversationHistory []openai.ChatCompletionMessage
// 	if encodedConversation != "" {
// 		decoded, err := url.QueryUnescape(encodedConversation)
// 		if err == nil {
// 			if unmarshalErr := json.Unmarshal([]byte(decoded), &conversationHistory); unmarshalErr != nil {
// 				log.Printf("error unmarshaling conversationHistory: %v", unmarshalErr)
// 			} else {
// 				log.Printf("[OpenAICodeEditorStreamHandler] conversationHistory parsed, length=%d", len(conversationHistory))
// 			}
// 		} else {
// 			log.Printf("url.QueryUnescape error: %v", err)
// 		}
// 	} else {
// 		log.Printf("[OpenAICodeEditorStreamHandler] no conversation param provided")
// 	}

// 	log.Printf("[OpenAICodeEditorStreamHandler] userMessage=%s, conversationHistoryLength=%d",
// 		userMessage, len(conversationHistory))

// 	w.Header().Set("Content-Type", "text/event-stream")
// 	w.Header().Set("Cache-Control", "no-cache")
// 	w.Header().Set("Connection", "keep-alive")

// 	flusher, ok := w.(http.Flusher)
// 	if !ok {
// 		http.Error(w, "server does not support streaming", http.StatusInternalServerError)
// 		return
// 	}

// 	// SSE-funktio: jakaa moniriviset data:t
// 	sendSSE := func(eventName, data string) {
// 		lines := strings.Split(data, "\n")
// 		fmt.Fprintf(w, "event: %s\n", eventName)
// 		for _, line := range lines {
// 			fmt.Fprintf(w, "data: %s\n", line)
// 		}
// 		fmt.Fprint(w, "\n")
// 		flusher.Flush()
// 	}

// 	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
// 	defer cancel()

// 	if err := handleCoderAction(ctx, userMessage, conversationHistory, sendSSE); err != nil {
// 		log.Printf("handleCoderAction error: %v", err)
// 		sendSSE("error", escape_for_code_sse(err.Error()))
// 	}
// }

// // --------------------------------------------------------------------
// // Varsinainen logiikka
// // --------------------------------------------------------------------
// func handleCoderAction(
// 	ctx context.Context,
// 	userMessage string,
// 	conversationHistory []openai.ChatCompletionMessage,
// 	sendSSE func(string, string),
// ) error {
// 	openaiKey := os.Getenv("OPENAI_API_KEY")
// 	if openaiKey == "" {
// 		return fmt.Errorf("missing OPENAI_API_KEY")
// 	}
// 	client := openai.NewClient(openaiKey)

// 	aiCoderMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_AICODER")
// 	if aiCoderMsg == "" {
// 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_AICODER")
// 	}
// 	summaryMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_SUMMARY")
// 	if summaryMsg == "" {
// 		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_SUMMARY")
// 	}

// 	log.Printf("[handleCoderAction] userMessage=%q, conversationHistory length=%d",
// 		userMessage, len(conversationHistory))

// 	// (A) Pyydetään OpenAI:lta "päävastaus"
// 	mainAnswer, err := call_openai_no_stream(
// 		ctx,
// 		client,
// 		aiCoderMsg,
// 		conversationHistory,
// 		userMessage,
// 		os.Getenv("OPENAI_API_MODEL"),
// 	)
// 	if err != nil {
// 		sendSSE("done", "")
// 		return fmt.Errorf("ai coder chat non-stream call failed: %w", err)
// 	}

// 	// (B) Poistetaan code-fencet JSON:in ympäriltä
// 	cleaned := removeJsonFence(mainAnswer)

// 	// (C) Yritetään parse JSON
// 	var coderResp AICoderJSON
// 	if errJSON := json.Unmarshal([]byte(cleaned), &coderResp); errJSON != nil {
// 		log.Printf("[handleCoderAction] parse error => default to text, err=%v", errJSON)
// 		coderResp.Action = "text"
// 	}

// 	switch coderResp.Action {

// 	case "search":
// 		// Kuten aiemmin: generoi hakutulokset + summary
// 		results, errSearch := do_semantic_search_in_file_structure(ctx, coderResp.EmbeddingQuery)
// 		if errSearch != nil {
// 			sendSSE("done", mainAnswer)
// 			return fmt.Errorf("semantic search failed: %w", errSearch)
// 		}

// 		var sb strings.Builder
// 		sb.WriteString("**Top matching files**:\n\n")
// 		for i, r := range results {
// 			sb.WriteString(fmt.Sprintf("**Match %d**:\n", i+1))
// 			sb.WriteString(r)
// 			sb.WriteString("\n\n")
// 		}
// 		finalStr := sb.String()

// 		sendSSEChunk(sendSSE, "chunk_main", finalStr)
// 		sendSSE("done_main", finalStr)

// 		// Halutaan summary => liitetään hakutulos conversationHistoryyn
// 		conversationHistory = append(conversationHistory,
// 			openai.ChatCompletionMessage{
// 				Role:    openai.ChatMessageRoleAssistant,
// 				Content: finalStr,
// 			},
// 		)

// 		// Kutsutaan summary
// 		summaryAnswer, errSummary := call_openai_no_stream(
// 			ctx, client, summaryMsg, conversationHistory,
// 			"Please provide a short summary of the search results.",
// 			os.Getenv("OPENAI_API_MODEL"),
// 		)
// 		if errSummary != nil {
// 			sendSSE("done", finalStr)
// 			return fmt.Errorf("summary call failed: %w", errSummary)
// 		}

// 		sendSSEChunk(sendSSE, "chunk_summary", summaryAnswer)
// 		sendSSE("done", "")
// 		return nil

// 	case "file":
// 		// Luodaan tai päivitetään tiedosto
// 		dirName := filepath.Dir(coderResp.PathToFilename)
// 		if err := os.MkdirAll(dirName, 0755); err != nil {
// 			sendSSE("done", mainAnswer)
// 			return fmt.Errorf("could not create directory: %w", err)
// 		}
// 		if errWrite := os.WriteFile(coderResp.PathToFilename, []byte(coderResp.FullFileContent), 0644); errWrite != nil {
// 			sendSSE("done", mainAnswer)
// 			return fmt.Errorf("error writing file: %w", errWrite)
// 		}
// 		sendSSEChunk(sendSSE, "chunk_main", "File written OK.\n")

// 		// Halutaanko vielä summary? Jos et halua, voit lopettaa suoraan:
// 		sendSSE("done", "")
// 		return nil

// 	default:
// 		// "text" => Pelkkä teksti suoraan SSE:hen, ILMAN summarya
// 		sendSSEChunk(sendSSE, "chunk_main", mainAnswer)
// 		// Jos et halua summarya, lopetetaan:
// 		sendSSE("done", "")
// 		return nil
// 	}
// }

// // Poistaa ```json ja ``` -rivien jäänteet
// func removeJsonFence(s string) string {
// 	s = strings.ReplaceAll(s, "```json", "")
// 	s = strings.ReplaceAll(s, "```", "")
// 	return strings.TrimSpace(s)
// }

// // do_semantic_search_in_file_structure ennallaan...
// func do_semantic_search_in_file_structure(ctx context.Context, user_query string) ([]string, error) {
// 	db := backend.Db

// 	openai_key := os.Getenv("OPENAI_API_KEY")
// 	if openai_key == "" {
// 		return nil, fmt.Errorf("missing OPENAI_API_KEY")
// 	}
// 	embedding_model := os.Getenv("OPENAI_EMBEDDING_MODEL")
// 	if embedding_model == "" {
// 		embedding_model = "text-embedding-ada-002"
// 	}

// 	client := openai.NewClient(openai_key)

// 	embed_req := openai.EmbeddingRequest{
// 		Model: openai.EmbeddingModel(embedding_model),
// 		Input: []string{user_query},
// 	}
// 	embed_resp, err := client.CreateEmbeddings(ctx, embed_req)
// 	if err != nil {
// 		return nil, fmt.Errorf("createEmbeddings error: %w", err)
// 	}
// 	if len(embed_resp.Data) == 0 {
// 		return nil, fmt.Errorf("createEmbeddings returned no data")
// 	}

// 	embedding := embed_resp.Data[0].Embedding
// 	vector_val := pgvector.NewVector(embedding)

// 	query := `
//         SELECT name, parent_folder
//         FROM file_structure
//         ORDER BY openai_embedding <-> $1
//         LIMIT 2
//     `
// 	rows, err := db.QueryContext(ctx, query, vector_val)
// 	if err != nil {
// 		return nil, fmt.Errorf("semantic search query error: %w", err)
// 	}
// 	defer rows.Close()

// 	var results []string
// 	for rows.Next() {
// 		var file_name, parent_folder string
// 		if err := rows.Scan(&file_name, &parent_folder); err != nil {
// 			return nil, fmt.Errorf("scan error: %w", err)
// 		}
// 		full_path := file_name
// 		if parent_folder != "" {
// 			full_path = parent_folder + "\\" + file_name
// 		}
// 		content_bytes, read_err := os.ReadFile(full_path)
// 		if read_err != nil {
// 			log.Printf("could not read file %s: %v", full_path, read_err)
// 			content_bytes = []byte("Could not read file from disk: " + read_err.Error())
// 		}
// 		result_string := fmt.Sprintf(
// 			"parent_folder: %s\nfile_name: %s\nfull_path: %s\ncontent:\n%s",
// 			parent_folder,
// 			file_name,
// 			full_path,
// 			string(content_bytes),
// 		)
// 		results = append(results, result_string)
// 	}
// 	if rows.Err() != nil {
// 		return nil, rows.Err()
// 	}

// 	log.Printf("[do_semantic_search_in_file_structure] top results read: %d", len(results))
// 	return results, nil
// }

// // // openai_coder_editor.go
// // package openai

// // import (
// // 	"context"
// // 	"easelect/backend/main_app"
// // 	"encoding/json"
// // 	"fmt"
// // 	"log"
// // 	"net/http"
// // 	"net/url"
// // 	"os"
// // 	"path/filepath"
// // 	"strings"
// // 	"time"

// // 	pgvector "github.com/pgvector/pgvector-go"
// // 	"github.com/sashabaranov/go-openai"
// // )

// // type AICoderJSON struct {
// // 	Action          string `json:"action"`
// // 	EmbeddingQuery  string `json:"embedding_query"`
// // 	PathToFilename  string `json:"path_to_filename"`
// // 	FullFileContent string `json:"full_file_content"`
// // }

// // // --------------------------------------------------------------------
// // //  1. Muutettu: EI striimaa chunkkeja suoraan SSE:hen
// // //     Kerää vain fullAnswer
// // //
// // // --------------------------------------------------------------------
// // func call_openai_no_stream(
// // 	ctx context.Context,
// // 	client *openai.Client,
// // 	systemMessage string,
// // 	history []openai.ChatCompletionMessage,
// // 	userMessage string,
// // 	modelName string,
// // ) (string, error) {
// // 	if modelName == "" {
// // 		modelName = "gpt-3.5-turbo"
// // 	}

// // 	var messages []openai.ChatCompletionMessage
// // 	messages = append(messages,
// // 		openai.ChatCompletionMessage{
// // 			Role:    openai.ChatMessageRoleSystem,
// // 			Content: systemMessage,
// // 		},
// // 	)
// // 	messages = append(messages, history...)
// // 	messages = append(messages,
// // 		openai.ChatCompletionMessage{
// // 			Role:    openai.ChatMessageRoleUser,
// // 			Content: userMessage,
// // 		},
// // 	)

// // 	req := openai.ChatCompletionRequest{
// // 		Model:    modelName,
// // 		Messages: messages,
// // 	}

// // 	resp, err := client.CreateChatCompletion(ctx, req)
// // 	if err != nil {
// // 		return "", fmt.Errorf("error creating chat completion: %w", err)
// // 	}
// // 	if len(resp.Choices) == 0 {
// // 		return "", fmt.Errorf("no choices in response")
// // 	}
// // 	return resp.Choices[0].Message.Content, nil
// // }

// // // --------------------------------------------------------------------
// // // SSE-avuksi
// // // --------------------------------------------------------------------
// // func escape_for_code_sse(s string) string {
// // 	// Poistetaan pelkät \r-merkit
// // 	s = strings.ReplaceAll(s, "\r", "")
// // 	// Huom. ei korvata \n => haluamme säilyttää moniriviset data-lähetykset
// // 	return s
// // }

// // // Yksi rivi SSE:hen per "\n"-rivi
// // func sendSSEChunk(sendSSE func(string, string), eventName, chunk string) {
// // 	if chunk == "" {
// // 		return
// // 	}
// // 	safeChunk := escape_for_code_sse(chunk)
// // 	sendSSE(eventName, safeChunk)
// // }

// // // --------------------------------------------------------------------
// // // 2) Handler
// // // --------------------------------------------------------------------
// // func OpenAICodeEditorStreamHandler(w http.ResponseWriter, r *http.Request) {
// // 	if r.Method != http.MethodGet {
// // 		http.Error(w, "only GET method allowed for SSE", http.StatusMethodNotAllowed)
// // 		return
// // 	}

// // 	userMessage := r.URL.Query().Get("user_message")
// // 	encodedConversation := r.URL.Query().Get("conversation")

// // 	var conversationHistory []openai.ChatCompletionMessage
// // 	if encodedConversation != "" {
// // 		decoded, err := url.QueryUnescape(encodedConversation)
// // 		if err == nil {
// // 			if unmarshalErr := json.Unmarshal([]byte(decoded), &conversationHistory); unmarshalErr != nil {
// // 				log.Printf("error unmarshaling conversationHistory: %v", unmarshalErr)
// // 			} else {
// // 				log.Printf("[OpenAICodeEditorStreamHandler] conversationHistory parsed, length=%d", len(conversationHistory))
// // 			}
// // 		} else {
// // 			log.Printf("url.QueryUnescape error: %v", err)
// // 		}
// // 	} else {
// // 		log.Printf("[OpenAICodeEditorStreamHandler] no conversation param provided")
// // 	}

// // 	log.Printf("[OpenAICodeEditorStreamHandler] userMessage=%s, conversationHistoryLength=%d", userMessage, len(conversationHistory))

// // 	w.Header().Set("Content-Type", "text/event-stream")
// // 	w.Header().Set("Cache-Control", "no-cache")
// // 	w.Header().Set("Connection", "keep-alive")

// // 	flusher, ok := w.(http.Flusher)
// // 	if !ok {
// // 		http.Error(w, "server does not support streaming", http.StatusInternalServerError)
// // 		return
// // 	}

// // 	// Uusi sendSSE, joka lähettää monirivisen datan SSE-standardin mukaisesti
// // 	sendSSE := func(eventName, data string) {
// // 		// Pilkotaan monirivinen data rivi kerrallaan
// // 		lines := strings.Split(data, "\n")

// // 		// SSE-otsikko
// // 		fmt.Fprintf(w, "event: %s\n", eventName)

// // 		// Jokainen rivi "data: <sisältö>"
// // 		for _, line := range lines {
// // 			fmt.Fprintf(w, "data: %s\n", line)
// // 		}

// // 		// Tyhjä rivi lopettaa SSE-tapahtuman
// // 		fmt.Fprintf(w, "\n")
// // 		flusher.Flush()
// // 	}

// // 	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
// // 	defer cancel()

// // 	if err := handleCoderAction(ctx, userMessage, conversationHistory, sendSSE); err != nil {
// // 		log.Printf("handleCoderAction error: %v", err)
// // 		sendSSE("error", escape_for_code_sse(err.Error()))
// // 	}
// // }

// // // --------------------------------------------------------------------
// // // 3) Varsinainen logiikka
// // // --------------------------------------------------------------------
// // func handleCoderAction(
// // 	ctx context.Context,
// // 	userMessage string,
// // 	conversationHistory []openai.ChatCompletionMessage,
// // 	sendSSE func(string, string),
// // ) error {
// // 	openaiKey := os.Getenv("OPENAI_API_KEY")
// // 	if openaiKey == "" {
// // 		return fmt.Errorf("missing OPENAI_API_KEY")
// // 	}
// // 	client := openai.NewClient(openaiKey)

// // 	aiCoderMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_AICODER")
// // 	if aiCoderMsg == "" {
// // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_AICODER")
// // 	}
// // 	summaryMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_SUMMARY")
// // 	if summaryMsg == "" {
// // 		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_SUMMARY")
// // 	}

// // 	log.Printf("[handleCoderAction] userMessage=%q, conversationHistory length=%d", userMessage, len(conversationHistory))

// // 	// (A) Kysytään OpenAI:lta (ei striimata chunkkeja):
// // 	mainAnswer, err := call_openai_no_stream(
// // 		ctx,
// // 		client,
// // 		aiCoderMsg,
// // 		conversationHistory,
// // 		userMessage,
// // 		os.Getenv("OPENAI_API_MODEL"),
// // 	)
// // 	if err != nil {
// // 		sendSSE("done", "")
// // 		return fmt.Errorf("ai coder chat non-stream call failed: %w", err)
// // 	}

// // 	// (B) Poistetaan code-fencet JSON:in ympäriltä
// // 	cleaned := removeJsonFence(mainAnswer)

// // 	// (C) Yritetään parse JSON:
// // 	var coderResp AICoderJSON
// // 	if errJSON := json.Unmarshal([]byte(cleaned), &coderResp); errJSON != nil {
// // 		log.Printf("[handleCoderAction] parse error => default to text, err=%v", errJSON)
// // 		coderResp.Action = "text"
// // 	}

// // 	switch coderResp.Action {
// // 	case "search":
// // 		log.Printf("[handleCoderAction] => do_semantic_search_in_file_structure: %s", coderResp.EmbeddingQuery)
// // 		results, errSearch := do_semantic_search_in_file_structure(ctx, coderResp.EmbeddingQuery)
// // 		if errSearch != nil {
// // 			sendSSE("done", mainAnswer)
// // 			return fmt.Errorf("semantic search failed: %w", errSearch)
// // 		}
// // 		// Rakennetaan SSE-lähetys
// // 		var sb strings.Builder
// // 		sb.WriteString("**Top matching files**:\n\n")
// // 		for i, r := range results {
// // 			sb.WriteString(fmt.Sprintf("**Match %d**:\n", i+1))
// // 			sb.WriteString(r)
// // 			sb.WriteString("\n\n")
// // 		}
// // 		finalStr := sb.String()
// // 		// Lähetetään chunk_main + done_main, jotta frontendi parseaa details-rakenteet
// // 		sendSSEChunk(sendSSE, "chunk_main", finalStr)
// // 		sendSSE("done_main", finalStr)
// // 		sendSSE("done", "")
// // 		return nil // Palataan heti, ei summaryä

// // 	case "file":
// // 		log.Printf("[handleCoderAction] => create or update file: %s", coderResp.PathToFilename)
// // 		dirName := filepath.Dir(coderResp.PathToFilename)
// // 		if err := os.MkdirAll(dirName, 0755); err != nil {
// // 			sendSSE("done", mainAnswer)
// // 			return fmt.Errorf("could not create directory: %w", err)
// // 		}
// // 		if errWrite := os.WriteFile(coderResp.PathToFilename, []byte(coderResp.FullFileContent), 0644); errWrite != nil {
// // 			sendSSE("done", mainAnswer)
// // 			return fmt.Errorf("error writing file: %w", errWrite)
// // 		}
// // 		sendSSEChunk(sendSSE, "chunk_main", "File written OK.\n")

// // 	default:
// // 		// Pelkkä tekstivastaus => SSE-lähetetään se userille
// // 		sendSSEChunk(sendSSE, "chunk_main", mainAnswer)
// // 	}

// // 	// (D) Lisätään mainAnswer conversaatioon
// // 	conversationHistory = append(conversationHistory, openai.ChatCompletionMessage{
// // 		Role:    openai.ChatMessageRoleAssistant,
// // 		Content: mainAnswer,
// // 	})

// // 	// (E) Tiivistelmä
// // 	summaryAnswer, errSummary := call_openai_no_stream(
// // 		ctx,
// // 		client,
// // 		summaryMsg,
// // 		conversationHistory,
// // 		"Please provide a short summary",
// // 		os.Getenv("OPENAI_API_MODEL"),
// // 	)
// // 	if errSummary != nil {
// // 		sendSSE("done", mainAnswer)
// // 		return fmt.Errorf("summary call failed: %w", errSummary)
// // 	}

// // 	sendSSEChunk(sendSSE, "chunk_summary", summaryAnswer)
// // 	sendSSE("done", "")
// // 	return nil
// // }

// // // Pieni apufunktio: poistaa ```json ja ``` -rivien jäänteet
// // func removeJsonFence(s string) string {
// // 	s = strings.ReplaceAll(s, "```json", "")
// // 	s = strings.ReplaceAll(s, "```", "")
// // 	return strings.TrimSpace(s)
// // }

// // func do_semantic_search_in_file_structure(ctx context.Context, user_query string) ([]string, error) {
// // 	db := backend.Db

// // 	openai_key := os.Getenv("OPENAI_API_KEY")
// // 	if openai_key == "" {
// // 		return nil, fmt.Errorf("missing OPENAI_API_KEY")
// // 	}
// // 	embedding_model := os.Getenv("OPENAI_EMBEDDING_MODEL")
// // 	if embedding_model == "" {
// // 		embedding_model = "text-embedding-ada-002"
// // 	}

// // 	client := openai.NewClient(openai_key)

// // 	embed_req := openai.EmbeddingRequest{
// // 		Model: openai.EmbeddingModel(embedding_model),
// // 		Input: []string{user_query},
// // 	}
// // 	embed_resp, err := client.CreateEmbeddings(ctx, embed_req)
// // 	if err != nil {
// // 		return nil, fmt.Errorf("createEmbeddings error: %w", err)
// // 	}
// // 	if len(embed_resp.Data) == 0 {
// // 		return nil, fmt.Errorf("createEmbeddings returned no data")
// // 	}

// // 	embedding := embed_resp.Data[0].Embedding
// // 	vector_val := pgvector.NewVector(embedding)

// // 	query := `
// // 		SELECT name, parent_folder
// // 		FROM file_structure
// // 		ORDER BY openai_embedding <-> $1
// // 		LIMIT 2
// // 	`
// // 	rows, err := db.QueryContext(ctx, query, vector_val)
// // 	if err != nil {
// // 		return nil, fmt.Errorf("semantic search query error: %w", err)
// // 	}
// // 	defer rows.Close()

// // 	var results []string
// // 	for rows.Next() {
// // 		var file_name, parent_folder string
// // 		if err := rows.Scan(&file_name, &parent_folder); err != nil {
// // 			return nil, fmt.Errorf("scan error: %w", err)
// // 		}
// // 		full_path := file_name
// // 		if parent_folder != "" {
// // 			full_path = parent_folder + "\\" + file_name
// // 		}
// // 		content_bytes, read_err := os.ReadFile(full_path)
// // 		if read_err != nil {
// // 			log.Printf("could not read file %s: %v", full_path, read_err)
// // 			content_bytes = []byte("Could not read file from disk: " + read_err.Error())
// // 		}
// // 		result_string := fmt.Sprintf(
// // 			"parent_folder: %s\nfile_name: %s\nfull_path: %s\ncontent:\n%s",
// // 			parent_folder,
// // 			file_name,
// // 			full_path,
// // 			string(content_bytes),
// // 		)
// // 		results = append(results, result_string)
// // 	}
// // 	if rows.Err() != nil {
// // 		return nil, rows.Err()
// // 	}

// // 	log.Printf("[do_semantic_search_in_file_structure] top results read: %d", len(results))
// // 	return results, nil
// // }

// // // // openai_coder_handler.go

// // // package openai

// // // import (
// // // 	"context"
// // // 	"easelect/backend/main_app"
// // // 	"encoding/json"
// // // 	"fmt"
// // // 	"io"
// // // 	"log"
// // // 	"net/http"
// // // 	"net/url"
// // // 	"os"
// // // 	"path/filepath"
// // // 	"strings"
// // // 	"time"

// // // 	pgvector "github.com/pgvector/pgvector-go"
// // // 	"github.com/sashabaranov/go-openai"
// // // )

// // // // AICoderJSON edustaa vastauksen "action"-tyyppejä
// // // // 1) "text" (pelkkä tekstikeskustelu),
// // // // 2) "search" (embedding_query),
// // // // 3) "file" (tiedoston luonti/muokkaus).
// // // type AICoderJSON struct {
// // // 	Action          string `json:"action"`
// // // 	EmbeddingQuery  string `json:"embedding_query"`
// // // 	PathToFilename  string `json:"path_to_filename"`
// // // 	FullFileContent string `json:"full_file_content"`
// // // }

// // // // ---------------------------------------------------
// // // // SSE-lähetysapu
// // // // ---------------------------------------------------

// // // // Lähettää yhden SSE-chunkin valitulla eventNamella
// // // func sendSSEChunk(sendSSE func(string, string), eventName, chunk string) {
// // // 	if chunk == "" {
// // // 		return
// // // 	}
// // // 	sendSSE(eventName, escape_for_sse(chunk)) // escape_for_sse on aiemmin teillä käytetty funktio
// // // }

// // // // call_openai_stream_chunked: striimaa chunkit heti SSE:ksi
// // // func call_openai_stream_chunked(
// // // 	ctx context.Context,
// // // 	client *openai.Client,
// // // 	systemMessage string,
// // // 	history []openai.ChatCompletionMessage,
// // // 	userMessage string,
// // // 	modelName string,
// // // 	eventName string,
// // // 	sendSSE func(string, string),
// // // ) (string, error) {

// // // 	if modelName == "" {
// // // 		modelName = "gpt-3.5-turbo"
// // // 	}

// // // 	var messages []openai.ChatCompletionMessage
// // // 	messages = append(messages,
// // // 		openai.ChatCompletionMessage{
// // // 			Role:    openai.ChatMessageRoleSystem,
// // // 			Content: systemMessage,
// // // 		},
// // // 	)
// // // 	messages = append(messages, history...)
// // // 	messages = append(messages,
// // // 		openai.ChatCompletionMessage{
// // // 			Role:    openai.ChatMessageRoleUser,
// // // 			Content: userMessage,
// // // 		},
// // // 	)

// // // 	req := openai.ChatCompletionRequest{
// // // 		Model:    modelName,
// // // 		Messages: messages,
// // // 		Stream:   true,
// // // 	}

// // // 	stream, err := client.CreateChatCompletionStream(ctx, req)
// // // 	if err != nil {
// // // 		return "", fmt.Errorf("error creating chat stream: %w", err)
// // // 	}
// // // 	defer stream.Close()

// // // 	var fullAnswer strings.Builder
// // // 	for {
// // // 		resp, err := stream.Recv()
// // // 		if err != nil {
// // // 			if err == io.EOF {
// // // 				break
// // // 			}
// // // 			return "", fmt.Errorf("stream read error: %w", err)
// // // 		}
// // // 		if len(resp.Choices) == 0 {
// // // 			continue
// // // 		}
// // // 		chunk := resp.Choices[0].Delta.Content
// // // 		if chunk == "" {
// // // 			continue
// // // 		}
// // // 		// Lähetetään chunk SSE:nä
// // // 		sendSSEChunk(sendSSE, eventName, chunk)
// // // 		// Kootaan myös lopullista vastausta
// // // 		fullAnswer.WriteString(chunk)
// // // 	}

// // // 	return fullAnswer.String(), nil
// // // }

// // // // ---------------------------------------------------
// // // // 1) Handler-funktio, joka alustaa SSE:n + kutsuu handleCoderAction
// // // // ---------------------------------------------------
// // // func OpenAICodeEditorStreamHandler(w http.ResponseWriter, r *http.Request) {
// // // 	if r.Method != http.MethodGet {
// // // 		http.Error(w, "only GET method allowed for SSE", http.StatusMethodNotAllowed)
// // // 		return
// // // 	}

// // // 	userMessage := r.URL.Query().Get("user_message")
// // // 	encodedConversation := r.URL.Query().Get("conversation")

// // // 	var conversationHistory []openai.ChatCompletionMessage
// // // 	if encodedConversation != "" {
// // // 		decoded, err := url.QueryUnescape(encodedConversation)
// // // 		if err == nil {
// // // 			unmarshalErr := json.Unmarshal([]byte(decoded), &conversationHistory)
// // // 			if unmarshalErr != nil {
// // // 				log.Printf("error unmarshaling conversationHistory: %v", unmarshalErr)
// // // 			} else {
// // // 				log.Printf("[OpenAICodeEditorStreamHandler] conversationHistory parsed, length=%d", len(conversationHistory))
// // // 			}
// // // 		} else {
// // // 			log.Printf("url.QueryUnescape error: %v", err)
// // // 		}
// // // 	} else {
// // // 		log.Printf("[OpenAICodeEditorStreamHandler] no conversation param provided")
// // // 	}

// // // 	log.Printf("[OpenAICodeEditorStreamHandler] userMessage=%s, conversationHistoryLength=%d", userMessage, len(conversationHistory))

// // // 	w.Header().Set("Content-Type", "text/event-stream")
// // // 	w.Header().Set("Cache-Control", "no-cache")
// // // 	w.Header().Set("Connection", "keep-alive")

// // // 	flusher, ok := w.(http.Flusher)
// // // 	if !ok {
// // // 		http.Error(w, "server does not support streaming", http.StatusInternalServerError)
// // // 		return
// // // 	}

// // // 	sendSSE := func(eventName, data string) {
// // // 		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventName, data)
// // // 		flusher.Flush()
// // // 	}

// // // 	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
// // // 	defer cancel()

// // // 	if err := handleCoderAction(ctx, userMessage, conversationHistory, sendSSE); err != nil {
// // // 		log.Printf("handleCoderAction error: %v", err)
// // // 		sendSSE("error", escape_for_sse(err.Error()))
// // // 	}
// // // }

// // // // ---------------------------------------------------
// // // // 2) Varsinainen logiikka: handleCoderAction
// // // // ---------------------------------------------------
// // // func handleCoderAction(
// // // 	ctx context.Context,
// // // 	user_message string,
// // // 	conversation_history []openai.ChatCompletionMessage,
// // // 	sendSSE func(string, string),
// // // ) error {

// // // 	openai_key := os.Getenv("OPENAI_API_KEY")
// // // 	if openai_key == "" {
// // // 		return fmt.Errorf("missing OPENAI_API_KEY")
// // // 	}
// // // 	client := openai.NewClient(openai_key)

// // // 	ai_coder_chat_system_message := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_AICODER")
// // // 	if ai_coder_chat_system_message == "" {
// // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_AICODER")
// // // 	}
// // // 	summary_system_message := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_SUMMARY")
// // // 	if summary_system_message == "" {
// // // 		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_SUMMARY")
// // // 	}

// // // 	log.Printf("[handleCoderAction] userMessage=%q, conversationHistory length=%d", user_message, len(conversation_history))

// // // 	main_answer, err := call_openai_stream_chunked(
// // // 		ctx,
// // // 		client,
// // // 		ai_coder_chat_system_message,
// // // 		conversation_history,
// // // 		user_message,
// // // 		os.Getenv("OPENAI_API_MODEL"),
// // // 		"chunk_main",
// // // 		sendSSE,
// // // 	)
// // // 	if err != nil {
// // // 		sendSSE("done", "")
// // // 		return fmt.Errorf("ai coder chat chunked call failed: %w", err)
// // // 	}

// // // 	var coder_response AICoderJSON
// // // 	if json_err := json.Unmarshal([]byte(main_answer), &coder_response); json_err != nil {
// // // 		log.Printf("[handleCoderAction] JSON parse error => default to 'text': %v", json_err)
// // // 		coder_response.Action = "text"
// // // 	}

// // // 	switch coder_response.Action {
// // // 	case "search":
// // // 		// 1. Haetaan top-osumat
// // // 		log.Printf("[handleCoderAction] action=search => embedding_query=%s", coder_response.EmbeddingQuery)
// // // 		results, sem_err := do_semantic_search_in_file_structure(ctx, coder_response.EmbeddingQuery)
// // // 		if sem_err != nil {
// // // 			sendSSE("done", main_answer)
// // // 			return fmt.Errorf("semantic search failed: %w", sem_err)
// // // 		}

// // // 		// 2. Rakennetaan plain-teksti, jota frontti pystyy parsimaaan
// // // 		var sb strings.Builder
// // // 		sb.WriteString("**Top matching files**:\n\n")
// // // 		for i, r := range results {
// // // 			sb.WriteString(fmt.Sprintf("**Match %d**:\n", i+1))
// // // 			sb.WriteString(r)
// // // 			sb.WriteString("\n\n")
// // // 		}

// // // 		// 3. Lähetetään striiminä chunk + done
// // // 		sendSSEChunk(sendSSE, "chunk_main", sb.String())
// // // 		sendSSE("done", "") // done-event, ei haluta summaryynkään kierrättää JSONia
// // // 		// return nil

// // // 	case "file":
// // // 		log.Printf("[handleCoderAction] action=file => path=%s", coder_response.PathToFilename)
// // // 		directory_name := filepath.Dir(coder_response.PathToFilename)
// // // 		if err := os.MkdirAll(directory_name, 0755); err != nil {
// // // 			sendSSE("done", main_answer)
// // // 			return fmt.Errorf("could not create directory: %w", err)
// // // 		}
// // // 		if write_err := os.WriteFile(coder_response.PathToFilename, []byte(coder_response.FullFileContent), 0644); write_err != nil {
// // // 			sendSSE("done", main_answer)
// // // 			return fmt.Errorf("error writing file: %w", write_err)
// // // 		}
// // // 		sendSSEChunk(sendSSE, "chunk_main", "File written OK.\n")

// // // 	default:
// // // 		log.Printf("[handleCoderAction] action=text or unknown => plain text only")
// // // 	}

// // // 	conversation_history = append(conversation_history,
// // // 		openai.ChatCompletionMessage{
// // // 			Role:    openai.ChatMessageRoleAssistant,
// // // 			Content: main_answer,
// // // 		},
// // // 	)

// // // 	summary_answer, summary_err := call_openai_stream_chunked(
// // // 		ctx,
// // // 		client,
// // // 		summary_system_message,
// // // 		conversation_history,
// // // 		"Please provide a short summary",
// // // 		os.Getenv("OPENAI_API_MODEL"),
// // // 		"chunk_summary",
// // // 		sendSSE,
// // // 	)
// // // 	if summary_err != nil {
// // // 		sendSSE("done", main_answer)
// // // 		return fmt.Errorf("summary call failed: %w", summary_err)
// // // 	}

// // // 	sendSSE("done", main_answer+"\n\n"+summary_answer)
// // // 	return nil
// // // }

// // // // ---------------------------------------------------
// // // // do_semantic_search_in_file_structure
// // // //   - Esimerkki semanttisen haun toteutuksesta
// // // //
// // // // ---------------------------------------------------
// // // func do_semantic_search_in_file_structure(ctx context.Context, user_query string) ([]string, error) {
// // // 	db := backend.Db

// // // 	openai_key := os.Getenv("OPENAI_API_KEY")
// // // 	if openai_key == "" {
// // // 		return nil, fmt.Errorf("missing OPENAI_API_KEY")
// // // 	}
// // // 	embedding_model := os.Getenv("OPENAI_EMBEDDING_MODEL")
// // // 	if embedding_model == "" {
// // // 		embedding_model = "text-embedding-ada-002"
// // // 	}

// // // 	client := openai.NewClient(openai_key)

// // // 	// 1) Luodaan embedding
// // // 	embed_req := openai.EmbeddingRequest{
// // // 		Model: openai.EmbeddingModel(embedding_model),
// // // 		Input: []string{user_query},
// // // 	}
// // // 	embed_resp, err := client.CreateEmbeddings(ctx, embed_req)
// // // 	if err != nil {
// // // 		return nil, fmt.Errorf("createEmbeddings error: %w", err)
// // // 	}
// // // 	if len(embed_resp.Data) == 0 {
// // // 		return nil, fmt.Errorf("createEmbeddings returned no data")
// // // 	}

// // // 	embedding := embed_resp.Data[0].Embedding
// // // 	vector_val := pgvector.NewVector(embedding)

// // // 	// 2) Haetaan top 5
// // // 	query := `
// // // 		SELECT name, parent_folder
// // // 		FROM file_structure
// // // 		ORDER BY openai_embedding <-> $1
// // // 		LIMIT 5
// // // 	`
// // // 	rows, err := db.QueryContext(ctx, query, vector_val)
// // // 	if err != nil {
// // // 		return nil, fmt.Errorf("semantic search query error: %w", err)
// // // 	}
// // // 	defer rows.Close()

// // // 	var results []string
// // // 	for rows.Next() {
// // // 		var file_name, parent_folder string
// // // 		if err := rows.Scan(&file_name, &parent_folder); err != nil {
// // // 			return nil, fmt.Errorf("scan error: %w", err)
// // // 		}
// // // 		full_path := file_name
// // // 		if parent_folder != "" {
// // // 			full_path = parent_folder + "\\" + file_name
// // // 		}
// // // 		content_bytes, read_err := os.ReadFile(full_path)
// // // 		if read_err != nil {
// // // 			log.Printf("could not read file %s: %v", full_path, read_err)
// // // 			content_bytes = []byte("Could not read file from disk: " + read_err.Error())
// // // 		}
// // // 		result_string := fmt.Sprintf(
// // // 			"parent_folder: %s\nfile_name: %s\nfull_path: %s\ncontent:\n%s",
// // // 			parent_folder,
// // // 			file_name,
// // // 			full_path,
// // // 			string(content_bytes),
// // // 		)
// // // 		results = append(results, result_string)
// // // 	}
// // // 	if rows.Err() != nil {
// // // 		return nil, rows.Err()
// // // 	}

// // // 	log.Printf("[do_semantic_search_in_file_structure] top results read: %d items", len(results))
// // // 	return results, nil
// // // }

// // // // package openai

// // // // import (
// // // // 	"context"
// // // // 	"easelect/backend/main_app"
// // // // 	"encoding/json"
// // // // 	"fmt"
// // // // 	"io"
// // // // 	"log"
// // // // 	"net/http"
// // // // 	"net/url"
// // // // 	"os"
// // // // 	"path/filepath"
// // // // 	"strings"
// // // // 	"time"

// // // // 	pgvector "github.com/pgvector/pgvector-go"
// // // // 	"github.com/sashabaranov/go-openai"
// // // // )

// // // // // Rakenteet
// // // // type MasterActionJSON struct {
// // // // 	MostProbableAction string `json:"most_suitable_consultant"`
// // // // }
// // // // type CodeEditorJSON struct {
// // // // 	PathToFilename  string `json:"path_to_filename"`
// // // // 	FullFileContent string `json:"full_file_content"`
// // // // 	EmbeddingQuery  string `json:"embedding_query"`
// // // // }

// // // // // ---------------------------------------------------
// // // // // SSE-lähetysapu
// // // // // ---------------------------------------------------

// // // // // Lähettää yhden SSE-chunkin valitulla eventNamella
// // // // func sendSSEChunk(sendSSE func(string, string), eventName, chunk string) {
// // // // 	if chunk == "" {
// // // // 		return
// // // // 	}
// // // // 	// Huom: escape_for_sse on jokin teillä aiemmin määritelty funktio
// // // // 	sendSSE(eventName, escape_for_sse(chunk))
// // // // }

// // // // // call_openai_stream_chunked: striimaa chunkit heti SSE:ksi
// // // // func call_openai_stream_chunked(
// // // // 	ctx context.Context,
// // // // 	client *openai.Client,
// // // // 	systemMessage string,
// // // // 	history []openai.ChatCompletionMessage,
// // // // 	userMessage string,
// // // // 	modelName string,
// // // // 	eventName string, // esim. "chunk_main" tai "chunk_summary"
// // // // 	sendSSE func(string, string),
// // // // ) (string, error) {

// // // // 	if modelName == "" {
// // // // 		modelName = "gpt-3.5-turbo"
// // // // 	}

// // // // 	var messages []openai.ChatCompletionMessage
// // // // 	messages = append(messages,
// // // // 		openai.ChatCompletionMessage{
// // // // 			Role:    openai.ChatMessageRoleSystem,
// // // // 			Content: systemMessage,
// // // // 		},
// // // // 	)
// // // // 	messages = append(messages, history...)
// // // // 	messages = append(messages,
// // // // 		openai.ChatCompletionMessage{
// // // // 			Role:    openai.ChatMessageRoleUser,
// // // // 			Content: userMessage,
// // // // 		},
// // // // 	)

// // // // 	req := openai.ChatCompletionRequest{
// // // // 		Model:    modelName,
// // // // 		Messages: messages,
// // // // 		Stream:   true,
// // // // 	}

// // // // 	stream, err := client.CreateChatCompletionStream(ctx, req)
// // // // 	if err != nil {
// // // // 		return "", fmt.Errorf("error creating chat stream: %w", err)
// // // // 	}
// // // // 	defer stream.Close()

// // // // 	var fullAnswer strings.Builder
// // // // 	for {
// // // // 		resp, err := stream.Recv()
// // // // 		if err != nil {
// // // // 			if err == io.EOF {
// // // // 				break
// // // // 			}
// // // // 			return "", fmt.Errorf("stream read error: %w", err)
// // // // 		}
// // // // 		if len(resp.Choices) == 0 {
// // // // 			continue
// // // // 		}
// // // // 		chunk := resp.Choices[0].Delta.Content
// // // // 		if chunk == "" {
// // // // 			continue
// // // // 		}
// // // // 		// Lähetetään chunk SSE:nä selaimelle
// // // // 		sendSSEChunk(sendSSE, eventName, chunk)
// // // // 		// Kootaan myös lopullista vastausta
// // // // 		fullAnswer.WriteString(chunk)
// // // // 	}

// // // // 	return fullAnswer.String(), nil
// // // // }

// // // // // ---------------------------------------------------
// // // // // 1) Handler-funktio, joka alustaa SSE:n + kutsuu handleCoderAction
// // // // // ---------------------------------------------------
// // // // func OpenAICodeEditorStreamHandler(w http.ResponseWriter, r *http.Request) {
// // // // 	if r.Method != http.MethodGet {
// // // // 		http.Error(w, "only GET method allowed for SSE", http.StatusMethodNotAllowed)
// // // // 		return
// // // // 	}

// // // // 	userMessage := r.URL.Query().Get("user_message")
// // // // 	encodedConversation := r.URL.Query().Get("conversation")

// // // // 	var conversationHistory []openai.ChatCompletionMessage
// // // // 	if encodedConversation != "" {
// // // // 		decoded, err := url.QueryUnescape(encodedConversation)
// // // // 		if err == nil {
// // // // 			unmarshalErr := json.Unmarshal([]byte(decoded), &conversationHistory)
// // // // 			if unmarshalErr != nil {
// // // // 				log.Printf("error unmarshaling conversationHistory: %v", unmarshalErr)
// // // // 			} else {
// // // // 				log.Printf("[OpenAICodeEditorStreamHandler] conversationHistory parsed, length=%d", len(conversationHistory))
// // // // 			}
// // // // 		} else {
// // // // 			log.Printf("url.QueryUnescape error: %v", err)
// // // // 		}
// // // // 	} else {
// // // // 		log.Printf("[OpenAICodeEditorStreamHandler] no conversation param provided")
// // // // 	}

// // // // 	log.Printf("[OpenAICodeEditorStreamHandler] userMessage=%s, conversationHistoryLength=%d", userMessage, len(conversationHistory))

// // // // 	w.Header().Set("Content-Type", "text/event-stream")
// // // // 	w.Header().Set("Cache-Control", "no-cache")
// // // // 	w.Header().Set("Connection", "keep-alive")

// // // // 	flusher, ok := w.(http.Flusher)
// // // // 	if !ok {
// // // // 		http.Error(w, "server does not support streaming", http.StatusInternalServerError)
// // // // 		return
// // // // 	}

// // // // 	sendSSE := func(eventName, data string) {
// // // // 		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventName, data)
// // // // 		flusher.Flush()
// // // // 	}

// // // // 	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
// // // // 	defer cancel()

// // // // 	if err := handleCoderAction(ctx, userMessage, conversationHistory, sendSSE); err != nil {
// // // // 		log.Printf("handleCoderAction error: %v", err)
// // // // 		sendSSE("error", escape_for_sse(err.Error()))
// // // // 	}
// // // // }

// // // // // ---------------------------------------------------
// // // // // 2) Varsinainen logiikka: handleCoderAction
// // // // // ---------------------------------------------------
// // // // func handleCoderAction(
// // // // 	ctx context.Context,
// // // // 	userMessage string,
// // // // 	conversationHistory []openai.ChatCompletionMessage,
// // // // 	sendSSE func(string, string),
// // // // ) error {

// // // // 	openaiKey := os.Getenv("OPENAI_API_KEY")
// // // // 	if openaiKey == "" {
// // // // 		return fmt.Errorf("missing OPENAI_API_KEY")
// // // // 	}
// // // // 	client := openai.NewClient(openaiKey)

// // // // 	// Lue environment-viestit
// // // // 	masterAgentSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
// // // // 	if masterAgentSystemMsg == "" {
// // // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
// // // // 	}
// // // // 	textChatSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
// // // // 	if textChatSystemMsg == "" {
// // // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
// // // // 	}
// // // // 	embedSearchSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
// // // // 	if embedSearchSystemMsg == "" {
// // // // 		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
// // // // 	}
// // // // 	fileCreationSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_FILE")
// // // // 	if fileCreationSystemMsg == "" {
// // // // 		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_FILE")
// // // // 	}
// // // // 	summarySystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_SUMMARY")
// // // // 	if summarySystemMsg == "" {
// // // // 		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_SUMMARY")
// // // // 	}

// // // // 	log.Printf("[handleCoderAction] userMessage=%q", userMessage)
// // // // 	log.Printf("[handleCoderAction] conversationHistory length=%d", len(conversationHistory))
// // // // 	for i, msg := range conversationHistory {
// // // // 		log.Printf(" - history[%d]: role=%s, len(content)=%d", i, msg.Role, len(msg.Content))
// // // // 	}

// // // // 	// 1) Master-agent (lyhyt JSON)
// // // // 	// Käytetään "once"-funktiota, jotta voimme helposti parsia JSON:in
// // // // 	masterAnswer, err := call_openai_stream_once(
// // // // 		ctx,
// // // // 		client,
// // // // 		masterAgentSystemMsg,
// // // // 		conversationHistory,
// // // // 		userMessage,
// // // // 		os.Getenv("OPENAI_API_MODEL"),
// // // // 	)
// // // // 	if err != nil {
// // // // 		return fmt.Errorf("call to Master-agent failed: %w", err)
// // // // 	}
// // // // 	var masterAction MasterActionJSON
// // // // 	if err := json.Unmarshal([]byte(masterAnswer), &masterAction); err != nil {
// // // // 		log.Printf("MasterAgent JSON parse error: %v", err)
// // // // 		masterAction.MostProbableAction = "communicator"
// // // // 	}
// // // // 	log.Printf("[MASTER] Decided action: %s", masterAction.MostProbableAction)

// // // // 	// Ilmoitetaan käyttäjälle
// // // // 	sendSSE("chunk", escape_for_sse(fmt.Sprintf("Main agent suggests: %s \n", masterAction.MostProbableAction)))
// // // // 	time.Sleep(250 * time.Millisecond)

// // // // 	// 2) switch/case
// // // // 	switch masterAction.MostProbableAction {

// // // // 	// --------------------------------------------------------------------
// // // // 	//  "search_builder"
// // // // 	// --------------------------------------------------------------------
// // // // 	case "search_builder":
// // // // 		// Päävastaus
// // // // 		mainAnswer, err := call_openai_stream_chunked(
// // // // 			ctx,
// // // // 			client,
// // // // 			embedSearchSystemMsg,
// // // // 			conversationHistory,
// // // // 			userMessage,
// // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // 			"chunk_main", // SSE-event
// // // // 			sendSSE,
// // // // 		)
// // // // 		if err != nil {
// // // // 			sendSSE("done", "")
// // // // 			return fmt.Errorf("search_builder chunked failed: %w", err)
// // // // 		}

// // // // 		// Koetetaan parsia JSON
// // // // 		var codeResp CodeEditorJSON
// // // // 		if jerr := json.Unmarshal([]byte(mainAnswer), &codeResp); jerr == nil && codeResp.EmbeddingQuery != "" {
// // // // 			log.Printf("[search_builder] embedding_query=%q", codeResp.EmbeddingQuery)
// // // // 			results, err := do_semantic_search_in_file_structure(ctx, codeResp.EmbeddingQuery)
// // // // 			if err != nil {
// // // // 				sendSSE("done", "")
// // // // 				return fmt.Errorf("semantic search failed: %w", err)
// // // // 			}
// // // // 			var sb strings.Builder
// // // // 			sb.WriteString("**Top matching files**:\n\n")
// // // // 			for i, r := range results {
// // // // 				sb.WriteString(fmt.Sprintf("**Match %d**:\n", i+1))
// // // // 				sb.WriteString("```javascript\n")
// // // // 				sb.WriteString(r)
// // // // 				sb.WriteString("\n```\n\n")
// // // // 			}
// // // // 			// Lähetetään striiminä chunk_main
// // // // 			sendSSEChunk(sendSSE, "chunk_main", sb.String())

// // // // 			// Päivitetään conversationHistory
// // // // 			newAssist := openai.ChatCompletionMessage{
// // // // 				Role:    openai.ChatMessageRoleAssistant,
// // // // 				Content: sb.String(),
// // // // 			}
// // // // 			conversationHistory = append(conversationHistory, newAssist)
// // // // 		}

// // // // 		// Yhteenveto
// // // // 		summaryAnswer, errSummary := call_openai_stream_chunked(
// // // // 			ctx,
// // // // 			client,
// // // // 			textChatSystemMsg,
// // // // 			conversationHistory,
// // // // 			summarySystemMsg,
// // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // 			"chunk_summary",
// // // // 			sendSSE,
// // // // 		)
// // // // 		if errSummary != nil {
// // // // 			sendSSE("done", mainAnswer)
// // // // 			return fmt.Errorf("summary call failed: %w", errSummary)
// // // // 		}

// // // // 		// Lopuksi done
// // // // 		sendSSE("done", mainAnswer+"\n\n"+summaryAnswer)
// // // // 		return nil

// // // // 	// --------------------------------------------------------------------
// // // // 	// "file_creator"
// // // // 	// --------------------------------------------------------------------
// // // // 	case "file_creator":
// // // // 		// Päävastaus
// // // // 		mainAnswer, err := call_openai_stream_chunked(
// // // // 			ctx,
// // // // 			client,
// // // // 			fileCreationSystemMsg,
// // // // 			conversationHistory,
// // // // 			userMessage,
// // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // 			"chunk_main",
// // // // 			sendSSE,
// // // // 		)
// // // // 		if err != nil {
// // // // 			sendSSE("done", "")
// // // // 			return fmt.Errorf("fileCreator chunked failed: %w", err)
// // // // 		}

// // // // 		var codeResp CodeEditorJSON
// // // // 		if jerr := json.Unmarshal([]byte(mainAnswer), &codeResp); jerr == nil && codeResp.PathToFilename != "" {
// // // // 			dirName := filepath.Dir(codeResp.PathToFilename)
// // // // 			if err := os.MkdirAll(dirName, 0755); err != nil {
// // // // 				sendSSE("done", mainAnswer)
// // // // 				return fmt.Errorf("could not create directory: %w", err)
// // // // 			}
// // // // 			if writeErr := os.WriteFile(codeResp.PathToFilename, []byte(codeResp.FullFileContent), 0644); writeErr != nil {
// // // // 				sendSSE("done", mainAnswer)
// // // // 				return fmt.Errorf("error writing file: %w", writeErr)
// // // // 			}
// // // // 			sendSSEChunk(sendSSE, "chunk_main", "File written OK.\n")
// // // // 		}

// // // // 		summaryAnswer, errSummary := call_openai_stream_chunked(
// // // // 			ctx,
// // // // 			client,
// // // // 			textChatSystemMsg,
// // // // 			conversationHistory,
// // // // 			summarySystemMsg,
// // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // 			"chunk_summary",
// // // // 			sendSSE,
// // // // 		)
// // // // 		if errSummary != nil {
// // // // 			sendSSE("done", mainAnswer)
// // // // 			return fmt.Errorf("summary call failed: %w", errSummary)
// // // // 		}

// // // // 		sendSSE("done", mainAnswer+"\n\n"+summaryAnswer)
// // // // 		return nil

// // // // 	// --------------------------------------------------------------------
// // // // 	// "communicator" (tekstichat)
// // // // 	// --------------------------------------------------------------------
// // // // 	default:
// // // // 		log.Printf("[handleCoderAction] calling textChat agent (communicator)")

// // // // 		// Pääviesti
// // // // 		mainAnswer, err := call_openai_stream_chunked(
// // // // 			ctx,
// // // // 			client,
// // // // 			textChatSystemMsg,
// // // // 			conversationHistory,
// // // // 			userMessage,
// // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // 			"chunk_main",
// // // // 			sendSSE,
// // // // 		)
// // // // 		if err != nil {
// // // // 			sendSSE("done", "")
// // // // 			return fmt.Errorf("communicator chunked failed: %w", err)
// // // // 		}

// // // // 		// Esimerkin vuoksi annamme tälläkin kerralla pienen tiivistelmän
// // // // 		summaryAnswer, errSummary := call_openai_stream_chunked(
// // // // 			ctx,
// // // // 			client,
// // // // 			textChatSystemMsg,
// // // // 			conversationHistory,
// // // // 			summarySystemMsg,
// // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // 			"chunk_summary",
// // // // 			sendSSE,
// // // // 		)
// // // // 		if errSummary != nil {
// // // // 			sendSSE("done", mainAnswer)
// // // // 			return fmt.Errorf("summary call failed: %w", errSummary)
// // // // 		}

// // // // 		// SSE-lähetys: done
// // // // 		sendSSE("done", mainAnswer+"\n\n"+summaryAnswer)
// // // // 		return nil
// // // // 	}
// // // // }

// // // // // ---------------------------------------------------
// // // // // call_openai_stream_once
// // // // //   - Käytetään edelleen Master-agentin JSON-parsea varten
// // // // //
// // // // // ---------------------------------------------------
// // // // func call_openai_stream_once(
// // // // 	ctx context.Context,
// // // // 	client *openai.Client,
// // // // 	system_message string,
// // // // 	history []openai.ChatCompletionMessage,
// // // // 	user_message string,
// // // // 	model_name string,
// // // // ) (string, error) {

// // // // 	if model_name == "" {
// // // // 		model_name = "gpt-3.5-turbo"
// // // // 	}

// // // // 	log.Printf("[call_openai_stream_once] model=%s, sysMsgLen=%d, histLen=%d, userMsgLen=%d",
// // // // 		model_name, len(system_message), len(history), len(user_message))

// // // // 	var local_messages []openai.ChatCompletionMessage
// // // // 	local_messages = append(local_messages,
// // // // 		openai.ChatCompletionMessage{
// // // // 			Role:    openai.ChatMessageRoleSystem,
// // // // 			Content: system_message,
// // // // 		},
// // // // 	)
// // // // 	local_messages = append(local_messages, history...)
// // // // 	local_messages = append(local_messages,
// // // // 		openai.ChatCompletionMessage{
// // // // 			Role:    openai.ChatMessageRoleUser,
// // // // 			Content: user_message,
// // // // 		},
// // // // 	)

// // // // 	stream_req := openai.ChatCompletionRequest{
// // // // 		Model:    model_name,
// // // // 		Messages: local_messages,
// // // // 		Stream:   true,
// // // // 	}

// // // // 	stream, err := client.CreateChatCompletionStream(ctx, stream_req)
// // // // 	if err != nil {
// // // // 		return "", fmt.Errorf("error creating chat stream: %w", err)
// // // // 	}
// // // // 	defer stream.Close()

// // // // 	var full_answer strings.Builder
// // // // 	for {
// // // // 		resp, err := stream.Recv()
// // // // 		if err != nil {
// // // // 			if err == io.EOF {
// // // // 				break
// // // // 			}
// // // // 			return "", fmt.Errorf("stream read error: %w", err)
// // // // 		}
// // // // 		if len(resp.Choices) == 0 {
// // // // 			continue
// // // // 		}
// // // // 		chunk := resp.Choices[0].Delta.Content
// // // // 		if chunk == "" {
// // // // 			continue
// // // // 		}
// // // // 		full_answer.WriteString(chunk)
// // // // 	}
// // // // 	answer := strings.TrimSpace(full_answer.String())

// // // // 	log.Printf("[call_openai_stream_once] received answer len=%d", len(answer))
// // // // 	return answer, nil
// // // // }

// // // // // ---------------------------------------------------
// // // // // do_semantic_search_in_file_structure
// // // // //   - Esimerkki semanttisen haun toteutuksesta
// // // // //
// // // // // ---------------------------------------------------
// // // // func do_semantic_search_in_file_structure(ctx context.Context, user_query string) ([]string, error) {
// // // // 	db := backend.Db

// // // // 	openai_key := os.Getenv("OPENAI_API_KEY")
// // // // 	if openai_key == "" {
// // // // 		return nil, fmt.Errorf("missing OPENAI_API_KEY")
// // // // 	}
// // // // 	embedding_model := os.Getenv("OPENAI_EMBEDDING_MODEL")
// // // // 	if embedding_model == "" {
// // // // 		embedding_model = "text-embedding-ada-002"
// // // // 	}

// // // // 	client := openai.NewClient(openai_key)

// // // // 	// 1) Luodaan embedding
// // // // 	embed_req := openai.EmbeddingRequest{
// // // // 		Model: openai.EmbeddingModel(embedding_model),
// // // // 		Input: []string{user_query},
// // // // 	}
// // // // 	embed_resp, err := client.CreateEmbeddings(ctx, embed_req)
// // // // 	if err != nil {
// // // // 		return nil, fmt.Errorf("createEmbeddings error: %w", err)
// // // // 	}
// // // // 	if len(embed_resp.Data) == 0 {
// // // // 		return nil, fmt.Errorf("createEmbeddings returned no data")
// // // // 	}

// // // // 	embedding := embed_resp.Data[0].Embedding
// // // // 	vector_val := pgvector.NewVector(embedding)

// // // // 	// 2) Haetaan top 2 (esimerkissä 2)
// // // // 	query := `
// // // // SELECT name, parent_folder
// // // // FROM file_structure
// // // // ORDER BY openai_embedding <-> $1
// // // // LIMIT 5
// // // // `
// // // // 	rows, err := db.QueryContext(ctx, query, vector_val)
// // // // 	if err != nil {
// // // // 		return nil, fmt.Errorf("semantic search query error: %w", err)
// // // // 	}
// // // // 	defer rows.Close()

// // // // 	var results []string
// // // // 	for rows.Next() {
// // // // 		var file_name, parent_folder string
// // // // 		if err := rows.Scan(&file_name, &parent_folder); err != nil {
// // // // 			return nil, fmt.Errorf("scan error: %w", err)
// // // // 		}
// // // // 		full_path := file_name
// // // // 		if parent_folder != "" {
// // // // 			full_path = parent_folder + "\\" + file_name
// // // // 		}
// // // // 		content_bytes, read_err := os.ReadFile(full_path)
// // // // 		if read_err != nil {
// // // // 			log.Printf("could not read file %s: %v", full_path, read_err)
// // // // 			content_bytes = []byte("Could not read file from disk: " + read_err.Error())
// // // // 		}
// // // // 		result_string := fmt.Sprintf(
// // // // 			"parent_folder: %s\nfile_name: %s\nfull_path: %s\ncontent:\n%s",
// // // // 			parent_folder,
// // // // 			file_name,
// // // // 			full_path,
// // // // 			string(content_bytes),
// // // // 		)
// // // // 		results = append(results, result_string)
// // // // 	}
// // // // 	if rows.Err() != nil {
// // // // 		return nil, rows.Err()
// // // // 	}

// // // // 	log.Printf("[do_semantic_search_in_file_structure] top results read: %d items", len(results))
// // // // 	return results, nil
// // // // }
