package openai

import (
	"context"
	"easelect/backend"
	"encoding/json"
	"fmt"
	"io"
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

// Rakenteet
type MasterActionJSON struct {
	MostProbableAction string `json:"most_suitable_consultant"`
}
type CodeEditorJSON struct {
	PathToFilename  string `json:"path_to_filename"`
	FullFileContent string `json:"full_file_content"`
	EmbeddingQuery  string `json:"embedding_query"`
}

// ---------------------------------------------------
// SSE-lähetysapu
// ---------------------------------------------------

// Lähettää yhden SSE-chunkin valitulla eventNamella
func sendSSEChunk(sendSSE func(string, string), eventName, chunk string) {
	if chunk == "" {
		return
	}
	// Huom: escape_for_sse on jokin teillä aiemmin määritelty funktio
	sendSSE(eventName, escape_for_sse(chunk))
}

// call_openai_stream_chunked: striimaa chunkit heti SSE:ksi
func call_openai_stream_chunked(
	ctx context.Context,
	client *openai.Client,
	systemMessage string,
	history []openai.ChatCompletionMessage,
	userMessage string,
	modelName string,
	eventName string, // esim. "chunk_main" tai "chunk_summary"
	sendSSE func(string, string),
) (string, error) {

	if modelName == "" {
		modelName = "gpt-3.5-turbo"
	}

	var messages []openai.ChatCompletionMessage
	messages = append(messages,
		openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleSystem,
			Content: systemMessage,
		},
	)
	messages = append(messages, history...)
	messages = append(messages,
		openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleUser,
			Content: userMessage,
		},
	)

	req := openai.ChatCompletionRequest{
		Model:    modelName,
		Messages: messages,
		Stream:   true,
	}

	stream, err := client.CreateChatCompletionStream(ctx, req)
	if err != nil {
		return "", fmt.Errorf("error creating chat stream: %w", err)
	}
	defer stream.Close()

	var fullAnswer strings.Builder
	for {
		resp, err := stream.Recv()
		if err != nil {
			if err == io.EOF {
				break
			}
			return "", fmt.Errorf("stream read error: %w", err)
		}
		if len(resp.Choices) == 0 {
			continue
		}
		chunk := resp.Choices[0].Delta.Content
		if chunk == "" {
			continue
		}
		// Lähetetään chunk SSE:nä selaimelle
		sendSSEChunk(sendSSE, eventName, chunk)
		// Kootaan myös lopullista vastausta
		fullAnswer.WriteString(chunk)
	}

	return fullAnswer.String(), nil
}

// ---------------------------------------------------
// 1) Handler-funktio, joka alustaa SSE:n + kutsuu handleCoderAction
// ---------------------------------------------------
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
			unmarshalErr := json.Unmarshal([]byte(decoded), &conversationHistory)
			if unmarshalErr != nil {
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

	log.Printf("[OpenAICodeEditorStreamHandler] userMessage=%s, conversationHistoryLength=%d", userMessage, len(conversationHistory))

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

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	if err := handleCoderAction(ctx, userMessage, conversationHistory, sendSSE); err != nil {
		log.Printf("handleCoderAction error: %v", err)
		sendSSE("error", escape_for_sse(err.Error()))
	}
}

// ---------------------------------------------------
// 2) Varsinainen logiikka: handleCoderAction
// ---------------------------------------------------
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

	// Lue environment-viestit
	masterAgentSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
	if masterAgentSystemMsg == "" {
		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
	}
	textChatSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
	if textChatSystemMsg == "" {
		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
	}
	embedSearchSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
	if embedSearchSystemMsg == "" {
		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
	}
	fileCreationSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_FILE")
	if fileCreationSystemMsg == "" {
		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_FILE")
	}
	summarySystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_SUMMARY")
	if summarySystemMsg == "" {
		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_SUMMARY")
	}

	log.Printf("[handleCoderAction] userMessage=%q", userMessage)
	log.Printf("[handleCoderAction] conversationHistory length=%d", len(conversationHistory))
	for i, msg := range conversationHistory {
		log.Printf(" - history[%d]: role=%s, len(content)=%d", i, msg.Role, len(msg.Content))
	}

	// 1) Master-agent (lyhyt JSON)
	// Käytetään "once"-funktiota, jotta voimme helposti parsia JSON:in
	masterAnswer, err := call_openai_stream_once(
		ctx,
		client,
		masterAgentSystemMsg,
		conversationHistory,
		userMessage,
		os.Getenv("OPENAI_API_MODEL"),
	)
	if err != nil {
		return fmt.Errorf("call to Master-agent failed: %w", err)
	}
	var masterAction MasterActionJSON
	if err := json.Unmarshal([]byte(masterAnswer), &masterAction); err != nil {
		log.Printf("MasterAgent JSON parse error: %v", err)
		masterAction.MostProbableAction = "communicator"
	}
	log.Printf("[MASTER] Decided action: %s", masterAction.MostProbableAction)

	// Ilmoitetaan käyttäjälle
	sendSSE("chunk", escape_for_sse(fmt.Sprintf("Main agent suggests: %s \n", masterAction.MostProbableAction)))
	time.Sleep(250 * time.Millisecond)

	// 2) switch/case
	switch masterAction.MostProbableAction {

	// --------------------------------------------------------------------
	//  "search_builder"
	// --------------------------------------------------------------------
	case "search_builder":
		// Päävastaus
		mainAnswer, err := call_openai_stream_chunked(
			ctx,
			client,
			embedSearchSystemMsg,
			conversationHistory,
			userMessage,
			os.Getenv("OPENAI_API_MODEL"),
			"chunk_main", // SSE-event
			sendSSE,
		)
		if err != nil {
			sendSSE("done", "")
			return fmt.Errorf("search_builder chunked failed: %w", err)
		}

		// Koetetaan parsia JSON
		var codeResp CodeEditorJSON
		if jerr := json.Unmarshal([]byte(mainAnswer), &codeResp); jerr == nil && codeResp.EmbeddingQuery != "" {
			log.Printf("[search_builder] embedding_query=%q", codeResp.EmbeddingQuery)
			results, err := do_semantic_search_in_file_structure(ctx, codeResp.EmbeddingQuery)
			if err != nil {
				sendSSE("done", "")
				return fmt.Errorf("semantic search failed: %w", err)
			}
			var sb strings.Builder
			sb.WriteString("**Top matching files**:\n\n")
			for i, r := range results {
				sb.WriteString(fmt.Sprintf("**Match %d**:\n", i+1))
				sb.WriteString("```javascript\n")
				sb.WriteString(r)
				sb.WriteString("\n```\n\n")
			}
			// Lähetetään striiminä chunk_main
			sendSSEChunk(sendSSE, "chunk_main", sb.String())

			// Päivitetään conversationHistory
			newAssist := openai.ChatCompletionMessage{
				Role:    openai.ChatMessageRoleAssistant,
				Content: sb.String(),
			}
			conversationHistory = append(conversationHistory, newAssist)
		}

		// Yhteenveto
		summaryAnswer, errSummary := call_openai_stream_chunked(
			ctx,
			client,
			textChatSystemMsg,
			conversationHistory,
			summarySystemMsg,
			os.Getenv("OPENAI_API_MODEL"),
			"chunk_summary",
			sendSSE,
		)
		if errSummary != nil {
			sendSSE("done", mainAnswer)
			return fmt.Errorf("summary call failed: %w", errSummary)
		}

		// Lopuksi done
		sendSSE("done", mainAnswer+"\n\n"+summaryAnswer)
		return nil

	// --------------------------------------------------------------------
	// "file_creator"
	// --------------------------------------------------------------------
	case "file_creator":
		// Päävastaus
		mainAnswer, err := call_openai_stream_chunked(
			ctx,
			client,
			fileCreationSystemMsg,
			conversationHistory,
			userMessage,
			os.Getenv("OPENAI_API_MODEL"),
			"chunk_main",
			sendSSE,
		)
		if err != nil {
			sendSSE("done", "")
			return fmt.Errorf("fileCreator chunked failed: %w", err)
		}

		var codeResp CodeEditorJSON
		if jerr := json.Unmarshal([]byte(mainAnswer), &codeResp); jerr == nil && codeResp.PathToFilename != "" {
			dirName := filepath.Dir(codeResp.PathToFilename)
			if err := os.MkdirAll(dirName, 0755); err != nil {
				sendSSE("done", mainAnswer)
				return fmt.Errorf("could not create directory: %w", err)
			}
			if writeErr := os.WriteFile(codeResp.PathToFilename, []byte(codeResp.FullFileContent), 0644); writeErr != nil {
				sendSSE("done", mainAnswer)
				return fmt.Errorf("error writing file: %w", writeErr)
			}
			sendSSEChunk(sendSSE, "chunk_main", "File written OK.\n")
		}

		summaryAnswer, errSummary := call_openai_stream_chunked(
			ctx,
			client,
			textChatSystemMsg,
			conversationHistory,
			summarySystemMsg,
			os.Getenv("OPENAI_API_MODEL"),
			"chunk_summary",
			sendSSE,
		)
		if errSummary != nil {
			sendSSE("done", mainAnswer)
			return fmt.Errorf("summary call failed: %w", errSummary)
		}

		sendSSE("done", mainAnswer+"\n\n"+summaryAnswer)
		return nil

	// --------------------------------------------------------------------
	// "communicator" (tekstichat)
	// --------------------------------------------------------------------
	default:
		log.Printf("[handleCoderAction] calling textChat agent (communicator)")

		// Pääviesti
		mainAnswer, err := call_openai_stream_chunked(
			ctx,
			client,
			textChatSystemMsg,
			conversationHistory,
			userMessage,
			os.Getenv("OPENAI_API_MODEL"),
			"chunk_main",
			sendSSE,
		)
		if err != nil {
			sendSSE("done", "")
			return fmt.Errorf("communicator chunked failed: %w", err)
		}

		// Esimerkin vuoksi annamme tälläkin kerralla pienen tiivistelmän
		summaryAnswer, errSummary := call_openai_stream_chunked(
			ctx,
			client,
			textChatSystemMsg,
			conversationHistory,
			summarySystemMsg,
			os.Getenv("OPENAI_API_MODEL"),
			"chunk_summary",
			sendSSE,
		)
		if errSummary != nil {
			sendSSE("done", mainAnswer)
			return fmt.Errorf("summary call failed: %w", errSummary)
		}

		// SSE-lähetys: done
		sendSSE("done", mainAnswer+"\n\n"+summaryAnswer)
		return nil
	}
}

// ---------------------------------------------------
// call_openai_stream_once
//   - Käytetään edelleen Master-agentin JSON-parsea varten
//
// ---------------------------------------------------
func call_openai_stream_once(
	ctx context.Context,
	client *openai.Client,
	system_message string,
	history []openai.ChatCompletionMessage,
	user_message string,
	model_name string,
) (string, error) {

	if model_name == "" {
		model_name = "gpt-3.5-turbo"
	}

	log.Printf("[call_openai_stream_once] model=%s, sysMsgLen=%d, histLen=%d, userMsgLen=%d",
		model_name, len(system_message), len(history), len(user_message))

	var local_messages []openai.ChatCompletionMessage
	local_messages = append(local_messages,
		openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleSystem,
			Content: system_message,
		},
	)
	local_messages = append(local_messages, history...)
	local_messages = append(local_messages,
		openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleUser,
			Content: user_message,
		},
	)

	stream_req := openai.ChatCompletionRequest{
		Model:    model_name,
		Messages: local_messages,
		Stream:   true,
	}

	stream, err := client.CreateChatCompletionStream(ctx, stream_req)
	if err != nil {
		return "", fmt.Errorf("error creating chat stream: %w", err)
	}
	defer stream.Close()

	var full_answer strings.Builder
	for {
		resp, err := stream.Recv()
		if err != nil {
			if err == io.EOF {
				break
			}
			return "", fmt.Errorf("stream read error: %w", err)
		}
		if len(resp.Choices) == 0 {
			continue
		}
		chunk := resp.Choices[0].Delta.Content
		if chunk == "" {
			continue
		}
		full_answer.WriteString(chunk)
	}
	answer := strings.TrimSpace(full_answer.String())

	log.Printf("[call_openai_stream_once] received answer len=%d", len(answer))
	return answer, nil
}

// ---------------------------------------------------
// do_semantic_search_in_file_structure
//   - Esimerkki semanttisen haun toteutuksesta
//
// ---------------------------------------------------
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

	// 1) Luodaan embedding
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

	// 2) Haetaan top 2 (esimerkissä 2)
	query := `
SELECT name, parent_folder
FROM file_structure
ORDER BY openai_embedding <-> $1
LIMIT 2
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

	log.Printf("[do_semantic_search_in_file_structure] top results read: %d items", len(results))
	return results, nil
}

// package openai

// import (
// 	"context"
// 	"easelect/backend"
// 	"encoding/json"
// 	"fmt"
// 	"io"
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

// // Rakenteet
// type MasterActionJSON struct {
// 	MostProbableAction string `json:"most_suitable_consultant"`
// }
// type CodeEditorJSON struct {
// 	PathToFilename  string `json:"path_to_filename"`
// 	FullFileContent string `json:"full_file_content"`
// 	EmbeddingQuery  string `json:"embedding_query"`
// }

// // ---------------------------------------------------
// // SSE-lähetysapu
// // ---------------------------------------------------

// // Lähettää yhden SSE-chunkin valitulla eventNamella
// func sendSSEChunk(sendSSE func(string, string), eventName, chunk string) {
// 	if chunk == "" {
// 		return
// 	}
// 	// Huom: escape_for_sse on jokin teillä aiemmin määritelty funktio
// 	sendSSE(eventName, escape_for_sse(chunk))
// }

// // call_openai_stream_chunked: striimaa chunkit heti SSE:ksi
// func call_openai_stream_chunked(
// 	ctx context.Context,
// 	client *openai.Client,
// 	systemMessage string,
// 	history []openai.ChatCompletionMessage,
// 	userMessage string,
// 	modelName string,
// 	eventName string, // esim. "chunk_main" tai "chunk_summary"
// 	sendSSE func(string, string),
// ) (string, error) {

// 	if modelName == "" {
// 		modelName = "gpt-3.5-turbo"
// 	}

// 	var messages []openai.ChatCompletionMessage
// 	messages = append(messages,
// 		openai.ChatCompletionMessage{
// 			Role:    openai.ChatMessageRoleSystem,
// 			Content: systemMessage,
// 		},
// 	)
// 	messages = append(messages, history...)
// 	messages = append(messages,
// 		openai.ChatCompletionMessage{
// 			Role:    openai.ChatMessageRoleUser,
// 			Content: userMessage,
// 		},
// 	)

// 	req := openai.ChatCompletionRequest{
// 		Model:    modelName,
// 		Messages: messages,
// 		Stream:   true,
// 	}

// 	stream, err := client.CreateChatCompletionStream(ctx, req)
// 	if err != nil {
// 		return "", fmt.Errorf("error creating chat stream: %w", err)
// 	}
// 	defer stream.Close()

// 	var fullAnswer strings.Builder
// 	for {
// 		resp, err := stream.Recv()
// 		if err != nil {
// 			if err == io.EOF {
// 				break
// 			}
// 			return "", fmt.Errorf("stream read error: %w", err)
// 		}
// 		if len(resp.Choices) == 0 {
// 			continue
// 		}
// 		chunk := resp.Choices[0].Delta.Content
// 		if chunk == "" {
// 			continue
// 		}
// 		// Lähetetään chunk SSE:nä selaimelle
// 		sendSSEChunk(sendSSE, eventName, chunk)
// 		// Kootaan myös lopullista vastausta
// 		fullAnswer.WriteString(chunk)
// 	}

// 	return fullAnswer.String(), nil
// }

// // ---------------------------------------------------
// // 1) Handler-funktio, joka alustaa SSE:n + kutsuu handleCoderAction
// // ---------------------------------------------------
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
// 			unmarshalErr := json.Unmarshal([]byte(decoded), &conversationHistory)
// 			if unmarshalErr != nil {
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

// 	log.Printf("[OpenAICodeEditorStreamHandler] userMessage=%s, conversationHistoryLength=%d", userMessage, len(conversationHistory))

// 	w.Header().Set("Content-Type", "text/event-stream")
// 	w.Header().Set("Cache-Control", "no-cache")
// 	w.Header().Set("Connection", "keep-alive")

// 	flusher, ok := w.(http.Flusher)
// 	if !ok {
// 		http.Error(w, "server does not support streaming", http.StatusInternalServerError)
// 		return
// 	}

// 	sendSSE := func(eventName, data string) {
// 		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventName, data)
// 		flusher.Flush()
// 	}

// 	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
// 	defer cancel()

// 	if err := handleCoderAction(ctx, userMessage, conversationHistory, sendSSE); err != nil {
// 		log.Printf("handleCoderAction error: %v", err)
// 		sendSSE("error", escape_for_sse(err.Error()))
// 	}
// }

// // ---------------------------------------------------
// // 2) Varsinainen logiikka: handleCoderAction
// // ---------------------------------------------------
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

// 	// Lue environment-viestit
// 	masterAgentSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
// 	if masterAgentSystemMsg == "" {
// 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
// 	}
// 	textChatSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
// 	if textChatSystemMsg == "" {
// 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
// 	}
// 	embedSearchSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
// 	if embedSearchSystemMsg == "" {
// 		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
// 	}
// 	fileCreationSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_FILE")
// 	if fileCreationSystemMsg == "" {
// 		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_FILE")
// 	}

// 	log.Printf("[handleCoderAction] userMessage=%q", userMessage)
// 	log.Printf("[handleCoderAction] conversationHistory length=%d", len(conversationHistory))
// 	for i, msg := range conversationHistory {
// 		log.Printf(" - history[%d]: role=%s, len(content)=%d", i, msg.Role, len(msg.Content))
// 	}

// 	// 1) Master-agent (lyhyt JSON)
// 	// Käytetään "once"-funktiota, jotta voimme helposti parsia JSON:in
// 	masterAnswer, err := call_openai_stream_once(
// 		ctx,
// 		client,
// 		masterAgentSystemMsg,
// 		conversationHistory,
// 		userMessage,
// 		os.Getenv("OPENAI_API_MODEL"),
// 	)
// 	if err != nil {
// 		return fmt.Errorf("call to Master-agent failed: %w", err)
// 	}
// 	var masterAction MasterActionJSON
// 	if err := json.Unmarshal([]byte(masterAnswer), &masterAction); err != nil {
// 		log.Printf("MasterAgent JSON parse error: %v", err)
// 		masterAction.MostProbableAction = "communicator"
// 	}
// 	log.Printf("[MASTER] Decided action: %s", masterAction.MostProbableAction)

// 	// Ilmoitetaan käyttäjälle
// 	sendSSE("chunk", escape_for_sse(fmt.Sprintf("Main agent suggests: %s \n", masterAction.MostProbableAction)))
// 	time.Sleep(250 * time.Millisecond)

// 	// 2) switch/case
// 	switch masterAction.MostProbableAction {

// 	// --------------------------------------------------------------------
// 	//  "search_builder"
// 	// --------------------------------------------------------------------
// 	case "search_builder":
// 		// Päävastaus
// 		mainAnswer, err := call_openai_stream_chunked(
// 			ctx,
// 			client,
// 			embedSearchSystemMsg,
// 			conversationHistory,
// 			userMessage,
// 			os.Getenv("OPENAI_API_MODEL"),
// 			"chunk_main", // SSE-event
// 			sendSSE,
// 		)
// 		if err != nil {
// 			sendSSE("done", "")
// 			return fmt.Errorf("search_builder chunked failed: %w", err)
// 		}

// 		// Koetetaan parsia JSON
// 		var codeResp CodeEditorJSON
// 		if jerr := json.Unmarshal([]byte(mainAnswer), &codeResp); jerr == nil && codeResp.EmbeddingQuery != "" {
// 			log.Printf("[search_builder] embedding_query=%q", codeResp.EmbeddingQuery)
// 			results, err := do_semantic_search_in_file_structure(ctx, codeResp.EmbeddingQuery)
// 			if err != nil {
// 				sendSSE("done", "")
// 				return fmt.Errorf("semantic search failed: %w", err)
// 			}
// 			var sb strings.Builder
// 			sb.WriteString("**Top matching files**:\n\n")
// 			for i, r := range results {
// 				sb.WriteString(fmt.Sprintf("**Match %d**:\n", i+1))
// 				sb.WriteString("```javascript\n")
// 				sb.WriteString(r)
// 				sb.WriteString("\n```\n\n")
// 			}
// 			// Lähetetään striiminä chunk_main
// 			sendSSEChunk(sendSSE, "chunk_main", sb.String())

// 			// Päivitetään conversationHistory
// 			newAssist := openai.ChatCompletionMessage{
// 				Role:    openai.ChatMessageRoleAssistant,
// 				Content: sb.String(),
// 			}
// 			conversationHistory = append(conversationHistory, newAssist)
// 		}

// 		// Yhteenveto
// 		summaryRequest := "Käyttäjä suoritti search_builder-toiminnon. Anna lyhyt yhteenveto toiminnasta."
// 		summaryAnswer, errSummary := call_openai_stream_chunked(
// 			ctx,
// 			client,
// 			textChatSystemMsg,
// 			conversationHistory,
// 			summaryRequest,
// 			os.Getenv("OPENAI_API_MODEL"),
// 			"chunk_summary",
// 			sendSSE,
// 		)
// 		if errSummary != nil {
// 			sendSSE("done", mainAnswer)
// 			return fmt.Errorf("summary call failed: %w", errSummary)
// 		}

// 		// Lopuksi done
// 		sendSSE("done", mainAnswer+"\n\n"+summaryAnswer)
// 		return nil

// 	// --------------------------------------------------------------------
// 	// "file_creator"
// 	// --------------------------------------------------------------------
// 	case "file_creator":
// 		// Päävastaus
// 		mainAnswer, err := call_openai_stream_chunked(
// 			ctx,
// 			client,
// 			fileCreationSystemMsg,
// 			conversationHistory,
// 			userMessage,
// 			os.Getenv("OPENAI_API_MODEL"),
// 			"chunk_main",
// 			sendSSE,
// 		)
// 		if err != nil {
// 			sendSSE("done", "")
// 			return fmt.Errorf("fileCreator chunked failed: %w", err)
// 		}

// 		var codeResp CodeEditorJSON
// 		if jerr := json.Unmarshal([]byte(mainAnswer), &codeResp); jerr == nil && codeResp.PathToFilename != "" {
// 			dirName := filepath.Dir(codeResp.PathToFilename)
// 			if err := os.MkdirAll(dirName, 0755); err != nil {
// 				sendSSE("done", mainAnswer)
// 				return fmt.Errorf("could not create directory: %w", err)
// 			}
// 			if writeErr := os.WriteFile(codeResp.PathToFilename, []byte(codeResp.FullFileContent), 0644); writeErr != nil {
// 				sendSSE("done", mainAnswer)
// 				return fmt.Errorf("error writing file: %w", writeErr)
// 			}
// 			sendSSEChunk(sendSSE, "chunk_main", "File written OK.\n")
// 		}

// 		// Yhteenveto
// 		summaryRequest := "Käyttäjä suoritti file_creator-toiminnon. Anna lyhyt yhteenveto ja seuraavat askeleet."
// 		summaryAnswer, errSummary := call_openai_stream_chunked(
// 			ctx,
// 			client,
// 			textChatSystemMsg,
// 			conversationHistory,
// 			summaryRequest,
// 			os.Getenv("OPENAI_API_MODEL"),
// 			"chunk_summary",
// 			sendSSE,
// 		)
// 		if errSummary != nil {
// 			sendSSE("done", mainAnswer)
// 			return fmt.Errorf("summary call failed: %w", errSummary)
// 		}

// 		sendSSE("done", mainAnswer+"\n\n"+summaryAnswer)
// 		return nil

// 	// --------------------------------------------------------------------
// 	// "communicator" (tekstichat)
// 	// --------------------------------------------------------------------
// 	default:
// 		log.Printf("[handleCoderAction] calling textChat agent (communicator)")

// 		// Pääviesti
// 		mainAnswer, err := call_openai_stream_chunked(
// 			ctx,
// 			client,
// 			textChatSystemMsg,
// 			conversationHistory,
// 			userMessage,
// 			os.Getenv("OPENAI_API_MODEL"),
// 			"chunk_main",
// 			sendSSE,
// 		)
// 		if err != nil {
// 			sendSSE("done", "")
// 			return fmt.Errorf("communicator chunked failed: %w", err)
// 		}

// 		// Esimerkin vuoksi annamme tälläkin kerralla pienen tiivistelmän
// 		summaryRequest := "Anna tiivis yhteenveto äskeisestä keskustelusta."
// 		summaryAnswer, errSummary := call_openai_stream_chunked(
// 			ctx,
// 			client,
// 			textChatSystemMsg,
// 			conversationHistory,
// 			summaryRequest,
// 			os.Getenv("OPENAI_API_MODEL"),
// 			"chunk_summary",
// 			sendSSE,
// 		)
// 		if errSummary != nil {
// 			sendSSE("done", mainAnswer)
// 			return fmt.Errorf("summary call failed: %w", errSummary)
// 		}

// 		// SSE-lähetys: done
// 		sendSSE("done", mainAnswer+"\n\n"+summaryAnswer)
// 		return nil
// 	}
// }

// // ---------------------------------------------------
// // call_openai_stream_once
// //   - Käytetään edelleen Master-agentin JSON-parsea varten
// //
// // ---------------------------------------------------
// func call_openai_stream_once(
// 	ctx context.Context,
// 	client *openai.Client,
// 	system_message string,
// 	history []openai.ChatCompletionMessage,
// 	user_message string,
// 	model_name string,
// ) (string, error) {

// 	if model_name == "" {
// 		model_name = "gpt-3.5-turbo"
// 	}

// 	log.Printf("[call_openai_stream_once] model=%s, sysMsgLen=%d, histLen=%d, userMsgLen=%d",
// 		model_name, len(system_message), len(history), len(user_message))

// 	var local_messages []openai.ChatCompletionMessage
// 	local_messages = append(local_messages,
// 		openai.ChatCompletionMessage{
// 			Role:    openai.ChatMessageRoleSystem,
// 			Content: system_message,
// 		},
// 	)
// 	local_messages = append(local_messages, history...)
// 	local_messages = append(local_messages,
// 		openai.ChatCompletionMessage{
// 			Role:    openai.ChatMessageRoleUser,
// 			Content: user_message,
// 		},
// 	)

// 	stream_req := openai.ChatCompletionRequest{
// 		Model:    model_name,
// 		Messages: local_messages,
// 		Stream:   true,
// 	}

// 	stream, err := client.CreateChatCompletionStream(ctx, stream_req)
// 	if err != nil {
// 		return "", fmt.Errorf("error creating chat stream: %w", err)
// 	}
// 	defer stream.Close()

// 	var full_answer strings.Builder
// 	for {
// 		resp, err := stream.Recv()
// 		if err != nil {
// 			if err == io.EOF {
// 				break
// 			}
// 			return "", fmt.Errorf("stream read error: %w", err)
// 		}
// 		if len(resp.Choices) == 0 {
// 			continue
// 		}
// 		chunk := resp.Choices[0].Delta.Content
// 		if chunk == "" {
// 			continue
// 		}
// 		full_answer.WriteString(chunk)
// 	}
// 	answer := strings.TrimSpace(full_answer.String())

// 	log.Printf("[call_openai_stream_once] received answer len=%d", len(answer))
// 	return answer, nil
// }

// // ---------------------------------------------------
// // do_semantic_search_in_file_structure
// //   - Esimerkki semanttisen haun toteutuksesta
// //
// // ---------------------------------------------------
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

// 	// 1) Luodaan embedding
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

// 	// 2) Haetaan top 2 (esimerkissä 2)
// 	query := `
// SELECT name, parent_folder
// FROM file_structure
// ORDER BY openai_embedding <-> $1
// LIMIT 2
// `
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

// 	log.Printf("[do_semantic_search_in_file_structure] top results read: %d items", len(results))
// 	return results, nil
// }

// // package openai

// // import (
// // 	"context"
// // 	"easelect/backend"
// // 	"encoding/json"
// // 	"fmt"
// // 	"io"
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

// // // Rakenteet
// // type MasterActionJSON struct {
// // 	MostProbableAction string `json:"most_suitable_consultant"`
// // }
// // type CodeEditorJSON struct {
// // 	PathToFilename  string `json:"path_to_filename"`
// // 	FullFileContent string `json:"full_file_content"`
// // 	EmbeddingQuery  string `json:"embedding_query"`
// // }

// // // 1) Handler-funktio, joka alustaa SSE:n ja kutsuu handleCoderAction
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
// // 			unmarshalErr := json.Unmarshal([]byte(decoded), &conversationHistory)
// // 			if unmarshalErr != nil {
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

// // 	// Lisätty lokitus: userMessage + conversationHistory
// // 	log.Printf("[OpenAICodeEditorStreamHandler] userMessage=%s, conversationHistoryLength=%d", userMessage, len(conversationHistory))

// // 	w.Header().Set("Content-Type", "text/event-stream")
// // 	w.Header().Set("Cache-Control", "no-cache")
// // 	w.Header().Set("Connection", "keep-alive")

// // 	flusher, ok := w.(http.Flusher)
// // 	if !ok {
// // 		http.Error(w, "server does not support streaming", http.StatusInternalServerError)
// // 		return
// // 	}
// // 	sendSSE := func(eventName, data string) {
// // 		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventName, data)
// // 		flusher.Flush()
// // 	}

// // 	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
// // 	defer cancel()

// // 	// Kutsutaan toista funktiota, joka hoitaa varsinainen OpenAI-logiikan
// // 	if err := handleCoderAction(ctx, userMessage, conversationHistory, sendSSE); err != nil {
// // 		log.Printf("handleCoderAction error: %v", err)
// // 		sendSSE("error", escape_for_sse(err.Error()))
// // 	}
// // }

// // // 2) Varsinainen logiikka, jaamme tämän irti SSE-handlerista
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

// // 	// Lue environment-viestit (system-viestit)
// // 	masterAgentSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
// // 	if masterAgentSystemMsg == "" {
// // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
// // 	}
// // 	textChatSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
// // 	if textChatSystemMsg == "" {
// // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
// // 	}
// // 	embedSearchSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
// // 	if embedSearchSystemMsg == "" {
// // 		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
// // 	}
// // 	fileCreationSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_FILE")
// // 	if fileCreationSystemMsg == "" {
// // 		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_FILE")
// // 	}

// // 	log.Printf("[handleCoderAction] userMessage=%q", userMessage)
// // 	log.Printf("[handleCoderAction] conversationHistory length: %d", len(conversationHistory))
// // 	for i, msg := range conversationHistory {
// // 		log.Printf(" - history[%d]: role=%s, len(content)=%d", i, msg.Role, len(msg.Content))
// // 	}

// // 	// 1) Master-agent
// // 	masterAnswer, err := call_openai_stream_once(
// // 		ctx,
// // 		client,
// // 		masterAgentSystemMsg,
// // 		conversationHistory,
// // 		userMessage,
// // 		os.Getenv("OPENAI_API_MODEL"),
// // 	)
// // 	if err != nil {
// // 		return fmt.Errorf("call to Master-agent failed: %w", err)
// // 	}
// // 	var masterAction MasterActionJSON
// // 	if err := json.Unmarshal([]byte(masterAnswer), &masterAction); err != nil {
// // 		log.Printf("MasterAgent JSON parse error: %v", err)
// // 		masterAction.MostProbableAction = "communicator"
// // 	}
// // 	log.Printf("[MASTER] Decided action: %s", masterAction.MostProbableAction)
// // 	sendSSE("chunk", escape_for_sse(fmt.Sprintf("Main agent suggests: %s \n", masterAction.MostProbableAction)))
// // 	//odotetaan n ms
// // 	time.Sleep(250 * time.Millisecond)

// // 	// 2) switch/case looginen haarautuminen
// // 	switch masterAction.MostProbableAction {
// // 	case "search_builder":
// // 		log.Printf("[handleCoderAction] calling embedSearch agent")
// // 		searchAnswer, err := call_openai_stream_once(
// // 			ctx,
// // 			client,
// // 			embedSearchSystemMsg,
// // 			conversationHistory,
// // 			userMessage,
// // 			os.Getenv("OPENAI_API_MODEL"),
// // 		)
// // 		if err != nil {
// // 			sendSSE("done", "")
// // 			return fmt.Errorf("search_builder failed: %w", err)
// // 		}

// // 		var codeResp CodeEditorJSON
// // 		if err := json.Unmarshal([]byte(searchAnswer), &codeResp); err != nil {
// // 			sendSSE("done", "")
// // 			return fmt.Errorf("embedSearch JSON parse error: %w", err)
// // 		}
// // 		if codeResp.EmbeddingQuery != "" {
// // 			log.Printf("[handleCoderAction/search_builder] embedding_query: %q", codeResp.EmbeddingQuery)
// // 			results, err := do_semantic_search_in_file_structure(ctx, codeResp.EmbeddingQuery)
// // 			if err != nil {
// // 				sendSSE("done", "")
// // 				return fmt.Errorf("semantic search failed: %w", err)
// // 			}

// // 			var sb strings.Builder
// // 			sb.WriteString("**Top matching files**:\n\n")
// // 			for i, r := range results {
// // 				sb.WriteString(fmt.Sprintf("**Match %d**:\n", i+1))
// // 				sb.WriteString("```javascript\n")
// // 				sb.WriteString(r)
// // 				sb.WriteString("\n```\n\n")
// // 			}
// // 			sendSSE("chunk", escape_for_sse(sb.String()))
// // 			//odotetaan n ms
// // 			time.Sleep(250 * time.Millisecond)

// // 			newAssistantMsg := openai.ChatCompletionMessage{
// // 				Role:    openai.ChatMessageRoleAssistant,
// // 				Content: sb.String(),
// // 			}
// // 			conversationHistory = append(conversationHistory, newAssistantMsg)
// // 			_ = conversationHistory
// // 		}

// // 		// Pyydetään lyhyt yhteenveto
// // 		summaryMsg, errSum := call_openai_stream_once(
// // 			ctx,
// // 			client,
// // 			textChatSystemMsg,
// // 			conversationHistory,
// // 			"Käyttäjä suoritti search_builder-toiminnon. Anna lyhyt yhteenveto tehdyistä hakuvaiheista ja seuraavista askelista.",
// // 			os.Getenv("OPENAI_API_MODEL"),
// // 		)
// // 		if errSum != nil {
// // 			sendSSE("done", searchAnswer)
// // 			return fmt.Errorf("summary call failed: %w", errSum)
// // 		}
// // 		sendSSE("chunk", escape_for_sse(summaryMsg))
// // 		//odotetaan n ms
// // 		time.Sleep(250 * time.Millisecond)

// // 		sendSSE("done", searchAnswer)
// // 		return nil

// // 	case "file_creator":
// // 		log.Printf("[handleCoderAction] calling fileCreation agent")
// // 		fileAnswer, err := call_openai_stream_once(
// // 			ctx,
// // 			client,
// // 			fileCreationSystemMsg,
// // 			conversationHistory,
// // 			userMessage,
// // 			os.Getenv("OPENAI_API_MODEL"),
// // 		)
// // 		if err != nil {
// // 			sendSSE("done", "")
// // 			return fmt.Errorf("fileCreation-agent failed: %w", err)
// // 		}

// // 		var codeResp CodeEditorJSON
// // 		if err := json.Unmarshal([]byte(fileAnswer), &codeResp); err != nil {
// // 			sendSSE("done", "")
// // 			return fmt.Errorf("fileCreation parse error: %w", err)
// // 		}
// // 		if codeResp.PathToFilename != "" {
// // 			dirName := filepath.Dir(codeResp.PathToFilename)
// // 			if err := os.MkdirAll(dirName, 0755); err != nil {
// // 				sendSSE("done", fileAnswer)
// // 				return fmt.Errorf("could not create directory: %w", err)
// // 			}
// // 			log.Printf("[file_creator] writing file: %s", codeResp.PathToFilename)
// // 			if err := os.WriteFile(codeResp.PathToFilename, []byte(codeResp.FullFileContent), 0644); err != nil {
// // 				sendSSE("done", fileAnswer)
// // 				return fmt.Errorf("error writing file: %w", err)
// // 			}
// // 			sendSSE("chunk", escape_for_sse("File written OK."))
// // 			//odotetaan n ms
// // 			time.Sleep(250 * time.Millisecond)
// // 		}

// // 		// Pyydetään lyhyt yhteenveto
// // 		summaryMsg, errSum := call_openai_stream_once(
// // 			ctx,
// // 			client,
// // 			textChatSystemMsg,
// // 			conversationHistory,
// // 			"Käyttäjä suoritti file_creator-toiminnon. Anna lyhyt yhteenveto tiedoston luonnista ja seuraavista askelista.",
// // 			os.Getenv("OPENAI_API_MODEL"),
// // 		)
// // 		if errSum != nil {
// // 			sendSSE("done", fileAnswer)
// // 			return fmt.Errorf("summary call failed: %w", errSum)
// // 		}
// // 		sendSSE("chunk", escape_for_sse(summaryMsg))
// // 		//odotetaan n ms
// // 		time.Sleep(250 * time.Millisecond)

// // 		sendSSE("done", fileAnswer)
// // 		return nil

// // 	default:
// // 		// communicator (tekstichat) – ei yhteenvetokutsua
// // 		log.Printf("[handleCoderAction] calling textChat agent (communicator)")
// // 		chatAnswer, err := call_openai_stream_once(
// // 			ctx,
// // 			client,
// // 			textChatSystemMsg,
// // 			conversationHistory,
// // 			userMessage,
// // 			os.Getenv("OPENAI_API_MODEL"),
// // 		)
// // 		if err != nil {
// // 			sendSSE("done", "")
// // 			return fmt.Errorf("textChat-agent failed: %w", err)
// // 		}
// // 		sendSSE("chunk", escape_for_sse(chatAnswer))
// // 		//odotetaan n ms
// // 		time.Sleep(250 * time.Millisecond)

// // 		// Ei yhteenvetopyyntöä communicatorille
// // 		sendSSE("done", chatAnswer)
// // 		return nil
// // 	}
// // }

// // func call_openai_stream_once(
// // 	ctx context.Context,
// // 	client *openai.Client,
// // 	system_message string,
// // 	history []openai.ChatCompletionMessage,
// // 	user_message string,
// // 	model_name string,
// // ) (string, error) {

// // 	if model_name == "" {
// // 		model_name = "gpt-3.5-turbo"
// // 	}

// // 	// Lisätty lokitus: avaintiedot
// // 	log.Printf("[call_openai_stream_once] model=%s, systemMessageLen=%d, historyLen=%d, userMessageLen=%d",
// // 		model_name, len(system_message), len(history), len(user_message))

// // 	var local_messages []openai.ChatCompletionMessage
// // 	local_messages = append(local_messages,
// // 		openai.ChatCompletionMessage{
// // 			Role:    openai.ChatMessageRoleSystem,
// // 			Content: system_message,
// // 		},
// // 	)
// // 	local_messages = append(local_messages, history...)
// // 	local_messages = append(local_messages,
// // 		openai.ChatCompletionMessage{
// // 			Role:    openai.ChatMessageRoleUser,
// // 			Content: user_message,
// // 		},
// // 	)

// // 	stream_req := openai.ChatCompletionRequest{
// // 		Model:    model_name,
// // 		Messages: local_messages,
// // 		Stream:   true,
// // 	}

// // 	stream, err := client.CreateChatCompletionStream(ctx, stream_req)
// // 	if err != nil {
// // 		return "", fmt.Errorf("error creating chat stream: %w", err)
// // 	}
// // 	defer stream.Close()

// // 	var full_answer strings.Builder
// // 	for {
// // 		resp, err := stream.Recv()
// // 		if err != nil {
// // 			if err == io.EOF {
// // 				break
// // 			}
// // 			return "", fmt.Errorf("stream read error: %w", err)
// // 		}
// // 		if len(resp.Choices) == 0 {
// // 			continue
// // 		}
// // 		chunk := resp.Choices[0].Delta.Content
// // 		if chunk == "" {
// // 			continue
// // 		}
// // 		full_answer.WriteString(chunk)
// // 	}
// // 	answer := strings.TrimSpace(full_answer.String())

// // 	log.Printf("[call_openai_stream_once] received answer len=%d", len(answer))
// // 	return answer, nil
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

// // 	// 1) Luodaan embedding
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

// // 	// 2) Haetaan top 5
// // 	query := `
// // SELECT name, parent_folder
// // FROM file_structure
// // ORDER BY openai_embedding <-> $1
// // LIMIT 2
// // `
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

// // 	log.Printf("[do_semantic_search_in_file_structure] top 5 results with content read: %d items", len(results))
// // 	return results, nil
// // }

// // // package openai

// // // import (
// // // 	"context"
// // // 	"easelect/backend"
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

// // // // Rakenteet
// // // type MasterActionJSON struct {
// // // 	MostProbableAction string `json:"most_suitable_consultant"`
// // // }
// // // type CodeEditorJSON struct {
// // // 	PathToFilename  string `json:"path_to_filename"`
// // // 	FullFileContent string `json:"full_file_content"`
// // // 	EmbeddingQuery  string `json:"embedding_query"`
// // // }

// // // // 1) Handler-funktio, joka alustaa SSE:n ja kutsuu handleCoderAction
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

// // // 	// Lisätty lokitus: userMessage + conversationHistory
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

// // // 	// Kutsutaan toista funktiota, joka hoitaa varsinainen OpenAI-logiikan
// // // 	if err := handleCoderAction(ctx, userMessage, conversationHistory, sendSSE); err != nil {
// // // 		log.Printf("handleCoderAction error: %v", err)
// // // 		sendSSE("error", escape_for_sse(err.Error()))
// // // 	}
// // // }

// // // // 2) Varsinainen logiikka, jaamme tämän irti SSE-handlerista
// // // func handleCoderAction(
// // // 	ctx context.Context,
// // // 	userMessage string,
// // // 	conversationHistory []openai.ChatCompletionMessage,
// // // 	sendSSE func(string, string),
// // // ) error {

// // // 	openaiKey := os.Getenv("OPENAI_API_KEY")
// // // 	if openaiKey == "" {
// // // 		return fmt.Errorf("missing OPENAI_API_KEY")
// // // 	}
// // // 	client := openai.NewClient(openaiKey)

// // // 	// Lue environment-viestit (system-viestit)
// // // 	masterAgentSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
// // // 	if masterAgentSystemMsg == "" {
// // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
// // // 	}
// // // 	textChatSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
// // // 	if textChatSystemMsg == "" {
// // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
// // // 	}
// // // 	embedSearchSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
// // // 	if embedSearchSystemMsg == "" {
// // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
// // // 	}
// // // 	fileCreationSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_FILE")
// // // 	if fileCreationSystemMsg == "" {
// // // 		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_FILE")
// // // 	}
// // // 	fileReadSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_READ")
// // // 	if fileReadSystemMsg == "" {
// // // 		return fmt.Errorf("missing_OPENAI_CODER_SYSTEM_MESSAGE_READ")
// // // 	}

// // // 	log.Printf("[handleCoderAction] userMessage=%q", userMessage)
// // // 	log.Printf("[handleCoderAction] conversationHistory length: %d", len(conversationHistory))
// // // 	for i, msg := range conversationHistory {
// // // 		log.Printf(" - history[%d]: role=%s, len(content)=%d", i, msg.Role, len(msg.Content))
// // // 	}

// // // 	// 1) Master-agent
// // // 	masterAnswer, err := call_openai_stream_once(
// // // 		ctx,
// // // 		client,
// // // 		masterAgentSystemMsg,
// // // 		conversationHistory,
// // // 		userMessage,
// // // 		os.Getenv("OPENAI_API_MODEL"),
// // // 	)
// // // 	if err != nil {
// // // 		return fmt.Errorf("call to Master-agent failed: %w", err)
// // // 	}
// // // 	var masterAction MasterActionJSON
// // // 	if err := json.Unmarshal([]byte(masterAnswer), &masterAction); err != nil {
// // // 		log.Printf("MasterAgent JSON parse error: %v", err)
// // // 		masterAction.MostProbableAction = "communicator"
// // // 	}
// // // 	log.Printf("[MASTER] Decided action: %s", masterAction.MostProbableAction)
// // // 	sendSSE("chunk", escape_for_sse(fmt.Sprintf("Main agent suggests: %s \n", masterAction.MostProbableAction)))
// // // 	//odotetaan n ms
// // // 	time.Sleep(250 * time.Millisecond)

// // // 	// 2) switch/case looginen haarautuminen
// // // 	switch masterAction.MostProbableAction {
// // // 	case "search_builder":
// // // 		// Kutsutaan embedSearch-agentia
// // // 		log.Printf("[handleCoderAction] calling embedSearch agent")
// // // 		searchAnswer, err := call_openai_stream_once(
// // // 			ctx,
// // // 			client,
// // // 			embedSearchSystemMsg,
// // // 			conversationHistory,
// // // 			userMessage,
// // // 			os.Getenv("OPENAI_API_MODEL"),
// // // 		)
// // // 		if err != nil {
// // // 			sendSSE("done", "")
// // // 			return fmt.Errorf("search_builder failed: %w", err)
// // // 		}

// // // 		var codeResp CodeEditorJSON
// // // 		if err := json.Unmarshal([]byte(searchAnswer), &codeResp); err != nil {
// // // 			sendSSE("done", "")
// // // 			return fmt.Errorf("embedSearch JSON parse error: %w", err)
// // // 		}
// // // 		if codeResp.EmbeddingQuery != "" {
// // // 			log.Printf("[handleCoderAction/search_builder] embedding_query: %q", codeResp.EmbeddingQuery)
// // // 			results, err := do_semantic_search_in_file_structure(ctx, codeResp.EmbeddingQuery)
// // // 			if err != nil {
// // // 				sendSSE("done", "")
// // // 				return fmt.Errorf("semantic search failed: %w", err)
// // // 			}
// // // 			// Muodostetaan selkeä viesti, jossa tiedostot sisällytetään code-lohkoina
// // // 			var sb strings.Builder
// // // 			sb.WriteString("**Top matching files**:\n\n")
// // // 			for i, r := range results {
// // // 				sb.WriteString(fmt.Sprintf("**Match %d**:\n", i+1))
// // // 				sb.WriteString("```javascript\n")
// // // 				sb.WriteString(r)
// // // 				sb.WriteString("\n```\n\n")
// // // 			}

// // // 			// Lähetetään SSE-chunk, jotta käyttäjä näkee tiedostot
// // // 			sendSSE("chunk", escape_for_sse(sb.String()))
// // // 			time.Sleep(250 * time.Millisecond)

// // // 			// Lisätään sama viesti conversationHistoryyn assistant-roolina
// // // 			newAssistantMsg := openai.ChatCompletionMessage{
// // // 				Role:    openai.ChatMessageRoleAssistant,
// // // 				Content: sb.String(),
// // // 			}
// // // 			conversationHistory = append(conversationHistory, newAssistantMsg)
// // // 			// Käytetään conversationHistory-arvoa, jottei SA4006-varoitusta tule
// // // 			_ = conversationHistory
// // // 		}
// // // 		// Lopetetaan SSE
// // // 		sendSSE("done", searchAnswer)
// // // 		return nil

// // // 	case "file_creator":
// // // 		log.Printf("[handleCoderAction] calling fileCreation agent")
// // // 		fileAnswer, err := call_openai_stream_once(
// // // 			ctx,
// // // 			client,
// // // 			fileCreationSystemMsg,
// // // 			conversationHistory,
// // // 			userMessage,
// // // 			os.Getenv("OPENAI_API_MODEL"),
// // // 		)
// // // 		if err != nil {
// // // 			sendSSE("done", "")
// // // 			return fmt.Errorf("fileCreation-agent failed: %w", err)
// // // 		}

// // // 		var codeResp CodeEditorJSON
// // // 		if err := json.Unmarshal([]byte(fileAnswer), &codeResp); err != nil {
// // // 			sendSSE("done", "")
// // // 			return fmt.Errorf("fileCreation parse error: %w", err)
// // // 		}
// // // 		if codeResp.PathToFilename != "" {
// // // 			dirName := filepath.Dir(codeResp.PathToFilename)
// // // 			if err := os.MkdirAll(dirName, 0755); err != nil {
// // // 				sendSSE("done", fileAnswer)
// // // 				return fmt.Errorf("could not create directory: %w", err)
// // // 			}
// // // 			log.Printf("[file_creator] writing file: %s", codeResp.PathToFilename)
// // // 			if err := os.WriteFile(codeResp.PathToFilename, []byte(codeResp.FullFileContent), 0644); err != nil {
// // // 				sendSSE("done", fileAnswer)
// // // 				return fmt.Errorf("error writing file: %w", err)
// // // 			}
// // // 			sendSSE("chunk", escape_for_sse("File written OK."))
// // // 			time.Sleep(250 * time.Millisecond)

// // // 			// Jos haluat viedä lisätietoa conversationHistoryyn,
// // // 			// esim. "we created a new file", tee se tässä. Ei pakollinen.
// // // 			/*
// // // 			   newAssistantMsg := openai.ChatCompletionMessage{
// // // 			   	Role:    openai.ChatMessageRoleAssistant,
// // // 			   	Content: fmt.Sprintf("Created new file: %s", codeResp.PathToFilename),
// // // 			   }
// // // 			   conversationHistory = append(conversationHistory, newAssistantMsg)
// // // 			   _ = conversationHistory
// // // 			*/
// // // 		}
// // // 		sendSSE("done", fileAnswer)
// // // 		return nil

// // // 	case "file_read":
// // // 		log.Printf("[handleCoderAction] calling fileRead agent")
// // // 		fileReadAnswer, err := call_openai_stream_once(
// // // 			ctx,
// // // 			client,
// // // 			fileReadSystemMsg,
// // // 			conversationHistory,
// // // 			userMessage,
// // // 			os.Getenv("OPENAI_API_MODEL"),
// // // 		)
// // // 		if err != nil {
// // // 			sendSSE("done", "")
// // // 			return fmt.Errorf("fileRead-agent failed: %w", err)
// // // 		}

// // // 		var codeResp CodeEditorJSON
// // // 		if err := json.Unmarshal([]byte(fileReadAnswer), &codeResp); err != nil {
// // // 			sendSSE("done", "")
// // // 			return fmt.Errorf("fileRead parse error: %w", err)
// // // 		}
// // // 		if codeResp.PathToFilename != "" {
// // // 			log.Printf("[file_read] reading file: %s", codeResp.PathToFilename)
// // // 			content, err := os.ReadFile(codeResp.PathToFilename)
// // // 			if err != nil {
// // // 				sendSSE("done", fileReadAnswer)
// // // 				return fmt.Errorf("error reading file: %w", err)
// // // 			}
// // // 			codeResp.FullFileContent = string(content)

// // // 			sendSSE("chunk", escape_for_sse(fmt.Sprintf("File content of %s:\n%s",
// // // 				codeResp.PathToFilename,
// // // 				codeResp.FullFileContent)))
// // // 			time.Sleep(250 * time.Millisecond)

// // // 			newAssistantMsg := openai.ChatCompletionMessage{
// // // 				Role: openai.ChatMessageRoleAssistant,
// // // 				Content: fmt.Sprintf(
// // // 					"File content for reference (%s):\n```javascript\n%s\n```",
// // // 					codeResp.PathToFilename,
// // // 					codeResp.FullFileContent,
// // // 				),
// // // 			}
// // // 			conversationHistory = append(conversationHistory, newAssistantMsg)
// // // 			// Käytetään conversationHistory
// // // 			_ = conversationHistory

// // // 			// Kutsutaan vielä textChat-agenttia
// // // 			secondaryAnswer, err2 := call_openai_stream_once(
// // // 				ctx,
// // // 				client,
// // // 				textChatSystemMsg,
// // // 				conversationHistory,
// // // 				"Ok, now you have the file content. "+userMessage,
// // // 				os.Getenv("OPENAI_API_MODEL"),
// // // 			)
// // // 			if err2 != nil {
// // // 				sendSSE("done", fileReadAnswer)
// // // 				return fmt.Errorf("secondary call with file content failed: %w", err2)
// // // 			}
// // // 			sendSSE("chunk", escape_for_sse(secondaryAnswer))
// // // 			time.Sleep(250 * time.Millisecond)
// // // 			sendSSE("done", secondaryAnswer)
// // // 			return nil
// // // 		}
// // // 		sendSSE("done", fileReadAnswer)
// // // 		return nil

// // // 	default:
// // // 		// communicator (tekstichat)
// // // 		log.Printf("[handleCoderAction] calling textChat agent (communicator)")
// // // 		chatAnswer, err := call_openai_stream_once(
// // // 			ctx,
// // // 			client,
// // // 			textChatSystemMsg,
// // // 			conversationHistory,
// // // 			userMessage,
// // // 			os.Getenv("OPENAI_API_MODEL"),
// // // 		)
// // // 		if err != nil {
// // // 			sendSSE("done", "")
// // // 			return fmt.Errorf("textChat-agent failed: %w", err)
// // // 		}
// // // 		sendSSE("chunk", escape_for_sse(chatAnswer))
// // // 		time.Sleep(250 * time.Millisecond)
// // // 		sendSSE("done", chatAnswer)
// // // 		return nil
// // // 	}
// // // }

// // // func call_openai_stream_once(
// // // 	ctx context.Context,
// // // 	client *openai.Client,
// // // 	system_message string,
// // // 	history []openai.ChatCompletionMessage,
// // // 	user_message string,
// // // 	model_name string,
// // // ) (string, error) {

// // // 	if model_name == "" {
// // // 		model_name = "gpt-3.5-turbo"
// // // 	}

// // // 	// Lisätty lokitus: avaintiedot
// // // 	log.Printf("[call_openai_stream_once] model=%s, systemMessageLen=%d, historyLen=%d, userMessageLen=%d",
// // // 		model_name, len(system_message), len(history), len(user_message))

// // // 	var local_messages []openai.ChatCompletionMessage
// // // 	local_messages = append(local_messages,
// // // 		openai.ChatCompletionMessage{
// // // 			Role:    openai.ChatMessageRoleSystem,
// // // 			Content: system_message,
// // // 		},
// // // 	)
// // // 	local_messages = append(local_messages, history...)
// // // 	local_messages = append(local_messages,
// // // 		openai.ChatCompletionMessage{
// // // 			Role:    openai.ChatMessageRoleUser,
// // // 			Content: user_message,
// // // 		},
// // // 	)

// // // 	stream_req := openai.ChatCompletionRequest{
// // // 		Model:    model_name,
// // // 		Messages: local_messages,
// // // 		Stream:   true,
// // // 	}

// // // 	stream, err := client.CreateChatCompletionStream(ctx, stream_req)
// // // 	if err != nil {
// // // 		return "", fmt.Errorf("error creating chat stream: %w", err)
// // // 	}
// // // 	defer stream.Close()

// // // 	var full_answer strings.Builder
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
// // // 		full_answer.WriteString(chunk)
// // // 	}
// // // 	answer := strings.TrimSpace(full_answer.String())

// // // 	log.Printf("[call_openai_stream_once] received answer len=%d", len(answer))
// // // 	return answer, nil
// // // }

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
// // // SELECT name, parent_folder
// // // FROM file_structure
// // // ORDER BY openai_embedding <-> $1
// // // LIMIT 2
// // // `
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

// // // 	log.Printf("[do_semantic_search_in_file_structure] top 5 results with content read: %d items", len(results))
// // // 	return results, nil
// // // }

// // // // // openai_coder_handler.go

// // // // // Go:
// // // // package openai

// // // // import (
// // // // 	"context"
// // // // 	"easelect/backend"
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

// // // // // 1) Handler-funktio, joka alustaa SSE:n ja kutsuu handleCoderAction
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

// // // // 	// Lisätty lokitus: userMessage + conversationHistory
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

// // // // 	// Kutsutaan toista funktiota, joka hoitaa varsinainen OpenAI-logiikan
// // // // 	if err := handleCoderAction(ctx, userMessage, conversationHistory, sendSSE); err != nil {
// // // // 		log.Printf("handleCoderAction error: %v", err)
// // // // 		sendSSE("error", escape_for_sse(err.Error()))
// // // // 	}
// // // // }

// // // // // 2) Varsinainen logiikka, jaamme tämän irti SSE-handlerista
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

// // // // 	// Lue environment-viestit (system-viestit)
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
// // // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
// // // // 	}
// // // // 	fileCreationSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_FILE")
// // // // 	if fileCreationSystemMsg == "" {
// // // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_FILE")
// // // // 	}
// // // // 	fileReadSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_READ")
// // // // 	if fileReadSystemMsg == "" {
// // // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_READ")
// // // // 	}

// // // // 	log.Printf("[handleCoderAction] userMessage=%q", userMessage)
// // // // 	log.Printf("[handleCoderAction] conversationHistory length: %d", len(conversationHistory))
// // // // 	for i, msg := range conversationHistory {
// // // // 		log.Printf(" - history[%d]: role=%s, len(content)=%d", i, msg.Role, len(msg.Content))
// // // // 	}

// // // // 	// 1) Master-agent
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
// // // // 	sendSSE("chunk", escape_for_sse(fmt.Sprintf("Main agent suggests: %s \n", masterAction.MostProbableAction)))
// // // // 	//odotetaan n ms
// // // // 	time.Sleep(250 * time.Millisecond)

// // // // 	// 2) switch/case looginen haarautuminen
// // // // 	switch masterAction.MostProbableAction {
// // // // 	case "search_builder":
// // // // 		// Kutsutaan embedSearch-agentia
// // // // 		log.Printf("[handleCoderAction] calling embedSearch agent")
// // // // 		searchAnswer, err := call_openai_stream_once(
// // // // 			ctx,
// // // // 			client,
// // // // 			embedSearchSystemMsg,
// // // // 			conversationHistory,
// // // // 			userMessage,
// // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // 		)
// // // // 		if err != nil {
// // // // 			sendSSE("done", "")
// // // // 			return fmt.Errorf("search_builder failed: %w", err)
// // // // 		}

// // // // 		var codeResp CodeEditorJSON
// // // // 		if err := json.Unmarshal([]byte(searchAnswer), &codeResp); err != nil {
// // // // 			sendSSE("done", "")
// // // // 			return fmt.Errorf("embedSearch JSON parse error: %w", err)
// // // // 		}
// // // // 		if codeResp.EmbeddingQuery != "" {
// // // // 			log.Printf("[handleCoderAction/search_builder] embedding_query: %q", codeResp.EmbeddingQuery)
// // // // 			results, err := do_semantic_search_in_file_structure(ctx, codeResp.EmbeddingQuery)
// // // // 			if err != nil {
// // // // 				sendSSE("done", "")
// // // // 				return fmt.Errorf("semantic search failed: %w", err)
// // // // 			}
// // // // 			responseLine := fmt.Sprintf("Top 5 matching files:\n%v", strings.Join(results, "\n"))
// // // // 			sendSSE("chunk", escape_for_sse(responseLine))
// // // // 			//odotetaan n ms
// // // // 			time.Sleep(250 * time.Millisecond)
// // // // 		}
// // // // 		sendSSE("done", searchAnswer)
// // // // 		return nil

// // // // 	case "file_creator":
// // // // 		log.Printf("[handleCoderAction] calling fileCreation agent")
// // // // 		fileAnswer, err := call_openai_stream_once(
// // // // 			ctx,
// // // // 			client,
// // // // 			fileCreationSystemMsg,
// // // // 			conversationHistory,
// // // // 			userMessage,
// // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // 		)
// // // // 		if err != nil {
// // // // 			sendSSE("done", "")
// // // // 			return fmt.Errorf("fileCreation-agent failed: %w", err)
// // // // 		}

// // // // 		var codeResp CodeEditorJSON
// // // // 		if err := json.Unmarshal([]byte(fileAnswer), &codeResp); err != nil {
// // // // 			sendSSE("done", "")
// // // // 			return fmt.Errorf("fileCreation parse error: %w", err)
// // // // 		}
// // // // 		if codeResp.PathToFilename != "" {
// // // // 			dirName := filepath.Dir(codeResp.PathToFilename)
// // // // 			if err := os.MkdirAll(dirName, 0755); err != nil {
// // // // 				sendSSE("done", fileAnswer)
// // // // 				return fmt.Errorf("could not create directory: %w", err)
// // // // 			}
// // // // 			log.Printf("[file_creator] writing file: %s", codeResp.PathToFilename)
// // // // 			if err := os.WriteFile(codeResp.PathToFilename, []byte(codeResp.FullFileContent), 0644); err != nil {
// // // // 				sendSSE("done", fileAnswer)
// // // // 				return fmt.Errorf("error writing file: %w", err)
// // // // 			}
// // // // 			sendSSE("chunk", escape_for_sse("File written OK."))
// // // // 			//odotetaan n ms
// // // // 			time.Sleep(250 * time.Millisecond)
// // // // 		}
// // // // 		sendSSE("done", fileAnswer)
// // // // 		return nil

// // // // 	case "file_read":
// // // // 		log.Printf("[handleCoderAction] calling fileRead agent")
// // // // 		fileReadAnswer, err := call_openai_stream_once(
// // // // 			ctx,
// // // // 			client,
// // // // 			fileReadSystemMsg,
// // // // 			conversationHistory,
// // // // 			userMessage,
// // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // 		)
// // // // 		if err != nil {
// // // // 			sendSSE("done", "")
// // // // 			return fmt.Errorf("fileRead-agent failed: %w", err)
// // // // 		}

// // // // 		var codeResp CodeEditorJSON
// // // // 		if err := json.Unmarshal([]byte(fileReadAnswer), &codeResp); err != nil {
// // // // 			sendSSE("done", "")
// // // // 			return fmt.Errorf("fileRead parse error: %w", err)
// // // // 		}
// // // // 		if codeResp.PathToFilename != "" {
// // // // 			log.Printf("[file_read] reading file: %s", codeResp.PathToFilename)
// // // // 			content, err := os.ReadFile(codeResp.PathToFilename)
// // // // 			if err != nil {
// // // // 				sendSSE("done", fileReadAnswer)
// // // // 				return fmt.Errorf("error reading file: %w", err)
// // // // 			}
// // // // 			codeResp.FullFileContent = string(content)

// // // // 			sendSSE("chunk", escape_for_sse(fmt.Sprintf("File content of %s:\n%s",
// // // // 				codeResp.PathToFilename,
// // // // 				codeResp.FullFileContent)))
// // // // 			//odotetaan n ms
// // // // 			time.Sleep(250 * time.Millisecond)

// // // // 			newAssistantMsg := openai.ChatCompletionMessage{
// // // // 				Role:    openai.ChatMessageRoleAssistant,
// // // // 				Content: fmt.Sprintf("File content for reference (%s):\n%s", codeResp.PathToFilename, codeResp.FullFileContent),
// // // // 			}
// // // // 			conversationHistory = append(conversationHistory, newAssistantMsg)

// // // // 			// Kutsutaan toista agenttia (textChat) uudelleen, nyt tiedoston sisältö on historiassa
// // // // 			secondaryAnswer, err2 := call_openai_stream_once(
// // // // 				ctx,
// // // // 				client,
// // // // 				textChatSystemMsg,
// // // // 				conversationHistory,
// // // // 				"Ok, now you have the file content. "+userMessage,
// // // // 				os.Getenv("OPENAI_API_MODEL"),
// // // // 			)
// // // // 			if err2 != nil {
// // // // 				sendSSE("done", fileReadAnswer)
// // // // 				return fmt.Errorf("secondary call with file content failed: %w", err2)
// // // // 			}

// // // // 			sendSSE("chunk", escape_for_sse(secondaryAnswer))
// // // // 			//odotetaan n ms
// // // // 			time.Sleep(250 * time.Millisecond)
// // // // 			sendSSE("done", secondaryAnswer)
// // // // 			return nil
// // // // 		}
// // // // 		// Jos path puuttui
// // // // 		sendSSE("done", fileReadAnswer)
// // // // 		return nil

// // // // 	default:
// // // // 		// communicator (tekstichat)
// // // // 		log.Printf("[handleCoderAction] calling textChat agent (communicator)")
// // // // 		chatAnswer, err := call_openai_stream_once(
// // // // 			ctx,
// // // // 			client,
// // // // 			textChatSystemMsg,
// // // // 			conversationHistory,
// // // // 			userMessage,
// // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // 		)
// // // // 		if err != nil {
// // // // 			sendSSE("done", "")
// // // // 			return fmt.Errorf("textChat-agent failed: %w", err)
// // // // 		}
// // // // 		sendSSE("chunk", escape_for_sse(chatAnswer))
// // // // 		//odotetaan n ms
// // // // 		time.Sleep(250 * time.Millisecond)
// // // // 		sendSSE("done", chatAnswer)
// // // // 		return nil
// // // // 	}
// // // // }

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

// // // // 	// Lisätty lokitus: avaintiedot
// // // // 	log.Printf("[call_openai_stream_once] model=%s, systemMessageLen=%d, historyLen=%d, userMessageLen=%d",
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

// // // // 	// Poistetaan mahdolliset ``` -merkit
// // // // 	answer = strings.TrimPrefix(answer, "```json")
// // // // 	answer = strings.TrimSuffix(answer, "```")
// // // // 	answer = strings.TrimPrefix(answer, "```")
// // // // 	answer = strings.TrimSuffix(answer, "```")

// // // // 	log.Printf("[call_openai_stream_once] received answer len=%d", len(answer))
// // // // 	return answer, nil
// // // // }

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

// // // // 	// 2) Haetaan top 5
// // // // 	query := `
// // // // SELECT name, parent_folder
// // // // FROM file_structure
// // // // ORDER BY openai_embedding <-> $1
// // // // LIMIT 2
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
// // // // 			"parent_folder: %s\\nfile_name: %s\\nfull_path: %s\\ncontent:\\n%s",
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

// // // // 	log.Printf("[do_semantic_search_in_file_structure] top 5 results with content read: %d items", len(results))
// // // // 	return results, nil
// // // // }

// // // // // package openai

// // // // // import (
// // // // // 	"context"
// // // // // 	"easelect/backend"
// // // // // 	"encoding/json"
// // // // // 	"fmt"
// // // // // 	"io"
// // // // // 	"log"
// // // // // 	"net/http"
// // // // // 	"net/url"
// // // // // 	"os"
// // // // // 	"path/filepath"
// // // // // 	"strings"
// // // // // 	"time"

// // // // // 	pgvector "github.com/pgvector/pgvector-go"
// // // // // 	"github.com/sashabaranov/go-openai"
// // // // // )

// // // // // // Rakenteet
// // // // // type MasterActionJSON struct {
// // // // // 	MostProbableAction string `json:"most_suitable_consultant"`
// // // // // }
// // // // // type CodeEditorJSON struct {
// // // // // 	PathToFilename  string `json:"path_to_filename"`
// // // // // 	FullFileContent string `json:"full_file_content"`
// // // // // 	EmbeddingQuery  string `json:"embedding_query"`
// // // // // }

// // // // // // 1) Handler-funktio, joka alustaa SSE:n ja kutsuu handleCoderAction
// // // // // func OpenAICodeEditorStreamHandler(w http.ResponseWriter, r *http.Request) {
// // // // // 	if r.Method != http.MethodGet {
// // // // // 		http.Error(w, "only GET method allowed for SSE", http.StatusMethodNotAllowed)
// // // // // 		return
// // // // // 	}

// // // // // 	userMessage := r.URL.Query().Get("user_message")
// // // // // 	encodedConversation := r.URL.Query().Get("conversation")

// // // // // 	var conversationHistory []openai.ChatCompletionMessage
// // // // // 	if encodedConversation != "" {
// // // // // 		decoded, err := url.QueryUnescape(encodedConversation)
// // // // // 		if err == nil {
// // // // // 			_ = json.Unmarshal([]byte(decoded), &conversationHistory)
// // // // // 		}
// // // // // 	}

// // // // // 	w.Header().Set("Content-Type", "text/event-stream")
// // // // // 	w.Header().Set("Cache-Control", "no-cache")
// // // // // 	w.Header().Set("Connection", "keep-alive")

// // // // // 	flusher, ok := w.(http.Flusher)
// // // // // 	if !ok {
// // // // // 		http.Error(w, "server does not support streaming", http.StatusInternalServerError)
// // // // // 		return
// // // // // 	}
// // // // // 	sendSSE := func(eventName, data string) {
// // // // // 		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventName, data)
// // // // // 		flusher.Flush()
// // // // // 	}

// // // // // 	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
// // // // // 	defer cancel()

// // // // // 	// Kutsutaan toista funktiota, joka hoitaa varsinainen OpenAI-logiikan
// // // // // 	if err := handleCoderAction(ctx, userMessage, conversationHistory, sendSSE); err != nil {
// // // // // 		log.Printf("handleCoderAction error: %v", err)
// // // // // 		sendSSE("error", escape_for_sse(err.Error()))
// // // // // 	}
// // // // // }

// // // // // // 2) Varsinainen logiikka, jaamme tämän irti SSE-handlerista
// // // // // func handleCoderAction(
// // // // // 	ctx context.Context,
// // // // // 	userMessage string,
// // // // // 	conversationHistory []openai.ChatCompletionMessage,
// // // // // 	sendSSE func(string, string),
// // // // // ) error {

// // // // // 	openaiKey := os.Getenv("OPENAI_API_KEY")
// // // // // 	if openaiKey == "" {
// // // // // 		return fmt.Errorf("missing OPENAI_API_KEY")
// // // // // 	}
// // // // // 	client := openai.NewClient(openaiKey)

// // // // // 	// Lue environment-viestit (system-viestit)
// // // // // 	masterAgentSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
// // // // // 	if masterAgentSystemMsg == "" {
// // // // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
// // // // // 	}
// // // // // 	textChatSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
// // // // // 	if textChatSystemMsg == "" {
// // // // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
// // // // // 	}
// // // // // 	embedSearchSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
// // // // // 	if embedSearchSystemMsg == "" {
// // // // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
// // // // // 	}
// // // // // 	fileCreationSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_FILE")
// // // // // 	if fileCreationSystemMsg == "" {
// // // // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_FILE")
// // // // // 	}
// // // // // 	fileReadSystemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_READ")
// // // // // 	if fileReadSystemMsg == "" {
// // // // // 		return fmt.Errorf("missing OPENAI_CODER_SYSTEM_MESSAGE_READ")
// // // // // 	}

// // // // // 	log.Printf("handleCoderAction: user_message=%q", userMessage)
// // // // // 	log.Printf("conversationHistory length: %d", len(conversationHistory))
// // // // // 	for i, msg := range conversationHistory {
// // // // // 		log.Printf(" - history[%d]: role=%s, len(content)=%d", i, msg.Role, len(msg.Content))
// // // // // 	}

// // // // // 	// 1) Master-agent
// // // // // 	masterAnswer, err := call_openai_stream_once(
// // // // // 		ctx,
// // // // // 		client,
// // // // // 		masterAgentSystemMsg,
// // // // // 		conversationHistory,
// // // // // 		userMessage,
// // // // // 		os.Getenv("OPENAI_API_MODEL"),
// // // // // 	)
// // // // // 	if err != nil {
// // // // // 		return fmt.Errorf("call to Master-agent failed: %w", err)
// // // // // 	}
// // // // // 	var masterAction MasterActionJSON
// // // // // 	if err := json.Unmarshal([]byte(masterAnswer), &masterAction); err != nil {
// // // // // 		log.Printf("MasterAgent JSON parse error: %v", err)
// // // // // 		masterAction.MostProbableAction = "communicator"
// // // // // 	}
// // // // // 	log.Printf("[MASTER] Decided action: %s", masterAction.MostProbableAction)
// // // // // 	sendSSE("chunk", escape_for_sse(fmt.Sprintf("Main agent suggests: %s \n", masterAction.MostProbableAction)))
// // // // // 	time.Sleep(250 * time.Millisecond)

// // // // // 	// 2) switch/case looginen haarautuminen
// // // // // 	switch masterAction.MostProbableAction {
// // // // // 	case "search_builder":
// // // // // 		// Kutsutaan embedSearch-agentia
// // // // // 		searchAnswer, err := call_openai_stream_once(
// // // // // 			ctx,
// // // // // 			client,
// // // // // 			embedSearchSystemMsg,
// // // // // 			conversationHistory,
// // // // // 			userMessage,
// // // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // // 		)
// // // // // 		if err != nil {
// // // // // 			sendSSE("done", "")
// // // // // 			return fmt.Errorf("search_builder failed: %w", err)
// // // // // 		}

// // // // // 		var codeResp CodeEditorJSON
// // // // // 		if err := json.Unmarshal([]byte(searchAnswer), &codeResp); err != nil {
// // // // // 			sendSSE("done", "")
// // // // // 			return fmt.Errorf("embedSearch JSON parse error: %w", err)
// // // // // 		}
// // // // // 		if codeResp.EmbeddingQuery != "" {
// // // // // 			log.Printf("Detected embedding_query: %q", codeResp.EmbeddingQuery)
// // // // // 			results, err := do_semantic_search_in_file_structure(ctx, codeResp.EmbeddingQuery)
// // // // // 			if err != nil {
// // // // // 				sendSSE("done", "")
// // // // // 				return fmt.Errorf("semantic search failed: %w", err)
// // // // // 			}
// // // // // 			responseLine := fmt.Sprintf("Top 5 matching files:\n%v", strings.Join(results, "\n"))
// // // // // 			sendSSE("chunk", escape_for_sse(responseLine))
// // // // // 			time.Sleep(250 * time.Millisecond)
// // // // // 		}
// // // // // 		sendSSE("done", searchAnswer)
// // // // // 		return nil

// // // // // 	case "file_creator":
// // // // // 		// Kutsutaan fileCreation-agentia
// // // // // 		fileAnswer, err := call_openai_stream_once(
// // // // // 			ctx,
// // // // // 			client,
// // // // // 			fileCreationSystemMsg,
// // // // // 			conversationHistory,
// // // // // 			userMessage,
// // // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // // 		)
// // // // // 		if err != nil {
// // // // // 			sendSSE("done", "")
// // // // // 			return fmt.Errorf("fileCreation-agent failed: %w", err)
// // // // // 		}

// // // // // 		var codeResp CodeEditorJSON
// // // // // 		if err := json.Unmarshal([]byte(fileAnswer), &codeResp); err != nil {
// // // // // 			sendSSE("done", "")
// // // // // 			return fmt.Errorf("fileCreation parse error: %w", err)
// // // // // 		}
// // // // // 		if codeResp.PathToFilename != "" {
// // // // // 			dirName := filepath.Dir(codeResp.PathToFilename)
// // // // // 			if err := os.MkdirAll(dirName, 0755); err != nil {
// // // // // 				sendSSE("done", fileAnswer)
// // // // // 				return fmt.Errorf("could not create directory: %w", err)
// // // // // 			}
// // // // // 			log.Printf("Writing file: %s", codeResp.PathToFilename)
// // // // // 			if err := os.WriteFile(codeResp.PathToFilename, []byte(codeResp.FullFileContent), 0644); err != nil {
// // // // // 				sendSSE("done", fileAnswer)
// // // // // 				return fmt.Errorf("error writing file: %w", err)
// // // // // 			}
// // // // // 			sendSSE("chunk", escape_for_sse("File written OK."))
// // // // // 			time.Sleep(250 * time.Millisecond)
// // // // // 		}
// // // // // 		sendSSE("done", fileAnswer)
// // // // // 		return nil

// // // // // 	case "file_read":
// // // // // 		// Kutsutaan fileRead-agenttia
// // // // // 		fileReadAnswer, err := call_openai_stream_once(
// // // // // 			ctx,
// // // // // 			client,
// // // // // 			fileReadSystemMsg,
// // // // // 			conversationHistory,
// // // // // 			userMessage,
// // // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // // 		)
// // // // // 		if err != nil {
// // // // // 			sendSSE("done", "")
// // // // // 			return fmt.Errorf("fileRead-agent failed: %w", err)
// // // // // 		}

// // // // // 		var codeResp CodeEditorJSON
// // // // // 		if err := json.Unmarshal([]byte(fileReadAnswer), &codeResp); err != nil {
// // // // // 			sendSSE("done", "")
// // // // // 			return fmt.Errorf("fileRead parse error: %w", err)
// // // // // 		}
// // // // // 		if codeResp.PathToFilename != "" {
// // // // // 			log.Printf("Reading file: %s", codeResp.PathToFilename)
// // // // // 			content, err := os.ReadFile(codeResp.PathToFilename)
// // // // // 			if err != nil {
// // // // // 				sendSSE("done", fileReadAnswer)
// // // // // 				return fmt.Errorf("error reading file: %w", err)
// // // // // 			}
// // // // // 			codeResp.FullFileContent = string(content)

// // // // // 			// Lähetetään content selaimelle (vain näkyviin)
// // // // // 			sendSSE("chunk", escape_for_sse(fmt.Sprintf("File content of %s:\n%s",
// // // // // 				codeResp.PathToFilename,
// // // // // 				codeResp.FullFileContent)))
// // // // // 			time.Sleep(250 * time.Millisecond)

// // // // // 			// ***** Lisätään tiedosto AI:n kontekstiin (assistant-viesti) *****
// // // // // 			newAssistantMsg := openai.ChatCompletionMessage{
// // // // // 				Role:    openai.ChatMessageRoleAssistant,
// // // // // 				Content: fmt.Sprintf("File content for reference (%s):\n%s", codeResp.PathToFilename, codeResp.FullFileContent),
// // // // // 			}
// // // // // 			conversationHistory = append(conversationHistory, newAssistantMsg)

// // // // // 			// Kutsutaan toista agenttia (textChat) uudelleen, nyt tiedoston sisältö on historiassa
// // // // // 			secondaryAnswer, err2 := call_openai_stream_once(
// // // // // 				ctx,
// // // // // 				client,
// // // // // 				textChatSystemMsg,
// // // // // 				conversationHistory,
// // // // // 				"Ok, now you have the file content. "+userMessage,
// // // // // 				os.Getenv("OPENAI_API_MODEL"),
// // // // // 			)
// // // // // 			if err2 != nil {
// // // // // 				sendSSE("done", fileReadAnswer)
// // // // // 				return fmt.Errorf("secondary call with file content failed: %w", err2)
// // // // // 			}

// // // // // 			// Palautetaan lopullinen vastaus SSE:nä
// // // // // 			sendSSE("chunk", escape_for_sse(secondaryAnswer))
// // // // // 			time.Sleep(250 * time.Millisecond)
// // // // // 			sendSSE("done", secondaryAnswer)
// // // // // 			return nil
// // // // // 		}
// // // // // 		// Jos path puuttui
// // // // // 		sendSSE("done", fileReadAnswer)
// // // // // 		return nil

// // // // // 	default:
// // // // // 		// communicator (tekstichat)
// // // // // 		chatAnswer, err := call_openai_stream_once(
// // // // // 			ctx,
// // // // // 			client,
// // // // // 			textChatSystemMsg,
// // // // // 			conversationHistory,
// // // // // 			userMessage,
// // // // // 			os.Getenv("OPENAI_API_MODEL"),
// // // // // 		)
// // // // // 		if err != nil {
// // // // // 			sendSSE("done", "")
// // // // // 			return fmt.Errorf("textChat-agent failed: %w", err)
// // // // // 		}
// // // // // 		sendSSE("chunk", escape_for_sse(chatAnswer))
// // // // // 		time.Sleep(250 * time.Millisecond)
// // // // // 		sendSSE("done", chatAnswer)
// // // // // 		return nil
// // // // // 	}
// // // // // }

// // // // // // call_openai_stream_once on sama kuin ennen
// // // // // func call_openai_stream_once(
// // // // // 	ctx context.Context,
// // // // // 	client *openai.Client,
// // // // // 	system_message string,
// // // // // 	history []openai.ChatCompletionMessage,
// // // // // 	user_message string,
// // // // // 	model_name string,
// // // // // ) (string, error) {

// // // // // 	if model_name == "" {
// // // // // 		model_name = "gpt-3.5-turbo"
// // // // // 	}

// // // // // 	var local_messages []openai.ChatCompletionMessage
// // // // // 	local_messages = append(local_messages,
// // // // // 		openai.ChatCompletionMessage{
// // // // // 			Role:    openai.ChatMessageRoleSystem,
// // // // // 			Content: system_message,
// // // // // 		},
// // // // // 	)
// // // // // 	local_messages = append(local_messages, history...)
// // // // // 	local_messages = append(local_messages,
// // // // // 		openai.ChatCompletionMessage{
// // // // // 			Role:    openai.ChatMessageRoleUser,
// // // // // 			Content: user_message,
// // // // // 		},
// // // // // 	)

// // // // // 	stream_req := openai.ChatCompletionRequest{
// // // // // 		Model:    model_name,
// // // // // 		Messages: local_messages,
// // // // // 		Stream:   true,
// // // // // 	}

// // // // // 	stream, err := client.CreateChatCompletionStream(ctx, stream_req)
// // // // // 	if err != nil {
// // // // // 		return "", fmt.Errorf("error creating chat stream: %w", err)
// // // // // 	}
// // // // // 	defer stream.Close()

// // // // // 	var full_answer strings.Builder
// // // // // 	for {
// // // // // 		resp, err := stream.Recv()
// // // // // 		if err != nil {
// // // // // 			if err == io.EOF {
// // // // // 				break
// // // // // 			}
// // // // // 			return "", fmt.Errorf("stream read error: %w", err)
// // // // // 		}
// // // // // 		if len(resp.Choices) == 0 {
// // // // // 			continue
// // // // // 		}
// // // // // 		chunk := resp.Choices[0].Delta.Content
// // // // // 		if chunk == "" {
// // // // // 			continue
// // // // // 		}
// // // // // 		full_answer.WriteString(chunk)
// // // // // 	}
// // // // // 	answer := strings.TrimSpace(full_answer.String())

// // // // // 	// Poistetaan mahdolliset ``` -merkit
// // // // // 	answer = strings.TrimPrefix(answer, "```json")
// // // // // 	answer = strings.TrimSuffix(answer, "```")
// // // // // 	answer = strings.TrimPrefix(answer, "```")
// // // // // 	answer = strings.TrimSuffix(answer, "```")

// // // // // 	return answer, nil
// // // // // }

// // // // // // do_semantic_search_in_file_structure kuten ennen
// // // // // func do_semantic_search_in_file_structure(ctx context.Context, user_query string) ([]string, error) {
// // // // // 	db := backend.Db

// // // // // 	openai_key := os.Getenv("OPENAI_API_KEY")
// // // // // 	if openai_key == "" {
// // // // // 		return nil, fmt.Errorf("missing OPENAI_API_KEY")
// // // // // 	}
// // // // // 	embedding_model := os.Getenv("OPENAI_EMBEDDING_MODEL")
// // // // // 	if embedding_model == "" {
// // // // // 		embedding_model = "text-embedding-ada-002"
// // // // // 	}

// // // // // 	client := openai.NewClient(openai_key)

// // // // // 	// 1) Luodaan embedding
// // // // // 	embed_req := openai.EmbeddingRequest{
// // // // // 		Model: openai.EmbeddingModel(embedding_model),
// // // // // 		Input: []string{user_query},
// // // // // 	}
// // // // // 	embed_resp, err := client.CreateEmbeddings(ctx, embed_req)
// // // // // 	if err != nil {
// // // // // 		return nil, fmt.Errorf("createEmbeddings error: %w", err)
// // // // // 	}
// // // // // 	if len(embed_resp.Data) == 0 {
// // // // // 		return nil, fmt.Errorf("createEmbeddings returned no data")
// // // // // 	}

// // // // // 	embedding := embed_resp.Data[0].Embedding
// // // // // 	vector_val := pgvector.NewVector(embedding)

// // // // // 	// 2) Haetaan top 5
// // // // // 	query := `
// // // // // SELECT name, parent_folder
// // // // // FROM file_structure
// // // // // ORDER BY openai_embedding <-> $1
// // // // // LIMIT 5
// // // // // `
// // // // // 	rows, err := db.QueryContext(ctx, query, vector_val)
// // // // // 	if err != nil {
// // // // // 		return nil, fmt.Errorf("semantic search query error: %w", err)
// // // // // 	}
// // // // // 	defer rows.Close()

// // // // // 	var results []string
// // // // // 	for rows.Next() {
// // // // // 		var file_name, parent_folder string
// // // // // 		if err := rows.Scan(&file_name, &parent_folder); err != nil {
// // // // // 			return nil, fmt.Errorf("scan error: %w", err)
// // // // // 		}
// // // // // 		full_path := file_name
// // // // // 		if parent_folder != "" {
// // // // // 			full_path = parent_folder + "\\" + file_name
// // // // // 		}
// // // // // 		content_bytes, read_err := os.ReadFile(full_path)
// // // // // 		if read_err != nil {
// // // // // 			log.Printf("could not read file %s: %v", full_path, read_err)
// // // // // 			content_bytes = []byte("Could not read file from disk: " + read_err.Error())
// // // // // 		}
// // // // // 		result_string := fmt.Sprintf(
// // // // // 			"parent_folder: %s\\nfile_name: %s\\nfull_path: %s\\ncontent:\\n%s",
// // // // // 			parent_folder,
// // // // // 			file_name,
// // // // // 			full_path,
// // // // // 			string(content_bytes),
// // // // // 		)
// // // // // 		results = append(results, result_string)
// // // // // 	}
// // // // // 	if rows.Err() != nil {
// // // // // 		return nil, rows.Err()
// // // // // 	}

// // // // // 	log.Printf("[DEBUG] semantic top 5 results with content read: %d items", len(results))
// // // // // 	return results, nil
// // // // // }
