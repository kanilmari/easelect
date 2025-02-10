// openai_coder_handler.go

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

type MasterActionJSON struct {
	MostProbableAction string `json:"most_suitable_consultant"`
}

// CodeEditorJSON helps us identify what the AI wants to do.
// Esimerkiksi tiedoston luonti:
//
//	{"path_to_filename": "text.txt", "full_file_content": "abc"}
//
// tai semanttinen haku:
//
//	{"embedding_query": "some natural language text ..."}
type CodeEditorJSON struct {
	PathToFilename  string `json:"path_to_filename"`
	FullFileContent string `json:"full_file_content"`
	EmbeddingQuery  string `json:"embedding_query"`
}

func OpenAICodeEditorStreamHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "only GET method allowed for SSE", http.StatusMethodNotAllowed)
		return
	}

	user_message := r.URL.Query().Get("user_message")
	encoded_conversation := r.URL.Query().Get("conversation")

	var conversation_history []openai.ChatCompletionMessage
	if encoded_conversation != "" {
		decoded, err := url.QueryUnescape(encoded_conversation)
		if err == nil {
			_ = json.Unmarshal([]byte(decoded), &conversation_history)
		}
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

	openai_key := os.Getenv("OPENAI_API_KEY")
	if openai_key == "" {
		http.Error(w, "missing OPENAI_API_KEY", http.StatusInternalServerError)
		return
	}

	// System messages for different agents
	master_agent_system_msg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_MASTER")
	if master_agent_system_msg == "" {
		http.Error(w, "missing OPENAI_CODER_SYSTEM_MESSAGE_MASTER environment variable", http.StatusInternalServerError)
		return
	}

	text_chat_system_msg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_TEXT")
	if text_chat_system_msg == "" {
		http.Error(w, "missing OPENAI_CODER_SYSTEM_MESSAGE_TEXT environment variable", http.StatusInternalServerError)
		return
	}

	embed_search_system_msg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_EMBED")
	if embed_search_system_msg == "" {
		http.Error(w, "missing OPENAI_CODER_SYSTEM_MESSAGE_EMBED environment variable", http.StatusInternalServerError)
		return
	}

	file_creation_system_msg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_FILE")
	if file_creation_system_msg == "" {
		http.Error(w, "missing OPENAI_CODER_SYSTEM_MESSAGE_FILE environment variable", http.StatusInternalServerError)
		return
	}

	// Uusi järjestelmäviesti tiedoston lukemiseen
	file_read_system_msg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE_READ")
	if file_read_system_msg == "" {
		http.Error(w, "missing OPENAI_CODER_SYSTEM_MESSAGE_READ environment variable", http.StatusInternalServerError)
		return
	}

	// Logging
	log.Printf("OpenAICodeEditorStreamHandler called. user_message = %q", user_message)
	log.Printf("conversation_history length: %d", len(conversation_history))
	for idx, msg := range conversation_history {
		log.Printf("  conversation_history[%d].role = %s, length of content = %d chars",
			idx, msg.Role, len(msg.Content))
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	client := openai.NewClient(openai_key)

	// 1. Kutsutaan ensin Master-agentia, jotta saadaan selville käyttäjän intentio
	master_answer, err := callOpenAIStreamOnce(
		ctx,
		client,
		master_agent_system_msg,
		conversation_history,
		user_message,
		os.Getenv("OPENAI_API_MODEL"),
	)
	if err != nil {
		errMsg := fmt.Errorf("call to Master-agent failed: %v", err)
		log.Println(errMsg)
		sendSSE("error", escapeForSSE(errMsg.Error()))
		return
	}

	// Parse the MasterAgent's JSON
	var masterAction MasterActionJSON
	jsonErr := json.Unmarshal([]byte(master_answer), &masterAction)
	if jsonErr != nil {
		log.Printf("MasterAgent JSON parse error: %v", jsonErr)
		// fallback to communicator if we cannot parse
		masterAction.MostProbableAction = "communicator"
	}

	log.Printf("[MASTER] Decided action: %s", masterAction.MostProbableAction)
	sendSSE("chunk", escapeForSSE(fmt.Sprintf("Main agent suggests: %s \n", masterAction.MostProbableAction)))
	// odotetaan n ms
	time.Sleep(250 * time.Millisecond)

	switch masterAction.MostProbableAction {
	case "search_builder":
		// 2. Kutsutaan embedSearch-agentia
		search_answer, err := callOpenAIStreamOnce(
			ctx,
			client,
			embed_search_system_msg,
			conversation_history,
			user_message,
			os.Getenv("OPENAI_API_MODEL"),
		)
		if err != nil {
			errMsg := fmt.Errorf("search_builder failed: %v", err)
			log.Println(errMsg)
			sendSSE("error", escapeForSSE(errMsg.Error()))
			sendSSE("done", "")
			return
		}

		// Parse the returned JSON: {"embedding_query":"..."}
		var codeResp CodeEditorJSON
		err = json.Unmarshal([]byte(search_answer), &codeResp)
		if err != nil {
			log.Printf("embedSearch JSON parse error: %v", err)
			sendSSE("chunk", escapeForSSE(fmt.Sprintf("Embed parse error: %v", err)))
			sendSSE("done", "")
			return
		}

		if codeResp.EmbeddingQuery != "" {
			log.Printf("Detected embedding_query: %q", codeResp.EmbeddingQuery)
			results, err := doSemanticSearchInFileStructure(ctx, codeResp.EmbeddingQuery)
			if err != nil {
				log.Printf("error in doSemanticSearchInFileStructure: %v", err)
				// odotetaan n ms
				time.Sleep(250 * time.Millisecond)
				sendSSE("error", escapeForSSE(fmt.Sprintf("semantic search failed: %v", err)))
				sendSSE("done", "")
				return
			}

			responseLine := fmt.Sprintf("Top 5 matching files:\n%v", strings.Join(results, "\n"))
			sendSSE("chunk", escapeForSSE(responseLine))
			// odotetaan n ms
			time.Sleep(250 * time.Millisecond)
		}
		sendSSE("done", search_answer)
		return

	case "file_creator":
		// 3. Kutsutaan fileCreation-agentia
		file_answer, err := callOpenAIStreamOnce(
			ctx,
			client,
			file_creation_system_msg,
			conversation_history,
			user_message,
			os.Getenv("OPENAI_API_MODEL"),
		)
		if err != nil {
			errMsg := fmt.Errorf("fileCreation-agent failed: %v", err)
			log.Println(errMsg)
			sendSSE("error", escapeForSSE(errMsg.Error()))
			sendSSE("done", "")
			return
		}

		var codeResp CodeEditorJSON
		err = json.Unmarshal([]byte(file_answer), &codeResp)
		if err != nil {
			log.Printf("fileCreation parse error: %v", err)
			sendSSE("chunk", escapeForSSE(fmt.Sprintf("File creation parse error: %v", err)))
			sendSSE("done", "")
			return
		}

		// Jos agentti palautti kelvollisen polun, kirjoitetaan tiedosto
		if codeResp.PathToFilename != "" {
			log.Printf("Detected path_to_filename: %s", codeResp.PathToFilename)
			dirName := filepath.Dir(codeResp.PathToFilename)
			if err := os.MkdirAll(dirName, 0755); err != nil {
				log.Printf("could not create directory: %v", err)
				sendSSE("error", escapeForSSE(fmt.Sprintf("could not create directory: %v", err)))
				sendSSE("done", file_answer)
				return
			}
			log.Printf("Writing file: %s", codeResp.PathToFilename)
			err = os.WriteFile(codeResp.PathToFilename, []byte(codeResp.FullFileContent), 0644)
			if err != nil {
				log.Printf("error writing file: %v", err)
				sendSSE("error", escapeForSSE(fmt.Sprintf("error writing file: %v", err)))
				sendSSE("done", file_answer)
				return
			}
			log.Printf("File written OK.")
			sendSSE("chunk", escapeForSSE("File written OK."))
			// odotetaan n ms
			time.Sleep(250 * time.Millisecond)
		}
		sendSSE("done", file_answer)
		return

	case "file_read":
		// Uusi haarautuminen: Luetaan pyydetty tiedosto ja lähetetään sen sisältö
		file_read_answer, err := callOpenAIStreamOnce(
			ctx,
			client,
			file_read_system_msg,
			conversation_history,
			user_message,
			os.Getenv("OPENAI_API_MODEL"),
		)
		if err != nil {
			errMsg := fmt.Errorf("fileRead-agent failed: %v", err)
			log.Println(errMsg)
			sendSSE("error", escapeForSSE(errMsg.Error()))
			sendSSE("done", "")
			return
		}

		var codeResp CodeEditorJSON
		err = json.Unmarshal([]byte(file_read_answer), &codeResp)
		if err != nil {
			log.Printf("fileRead parse error: %v", err)
			sendSSE("chunk", escapeForSSE(fmt.Sprintf("File read parse error: %v", err)))
			sendSSE("done", "")
			return
		}

		if codeResp.PathToFilename != "" {
			log.Printf("Reading file: %s", codeResp.PathToFilename)
			content, err := os.ReadFile(codeResp.PathToFilename)
			if err != nil {
				log.Printf("error reading file: %v", err)
				sendSSE("error", escapeForSSE(fmt.Sprintf("Error reading file: %v", err)))
				sendSSE("done", file_read_answer)
				return
			}
			codeResp.FullFileContent = string(content)
			sendSSE("chunk", escapeForSSE(fmt.Sprintf("File content of %s:\n%s", codeResp.PathToFilename, codeResp.FullFileContent)))
			// odotetaan n ms
			time.Sleep(250 * time.Millisecond)
		}
		sendSSE("done", file_read_answer)
		return

	default:
		// 4. Oletuksena: communicator
		chat_answer, err := callOpenAIStreamOnce(
			ctx,
			client,
			text_chat_system_msg,
			conversation_history,
			user_message,
			os.Getenv("OPENAI_API_MODEL"),
		)
		if err != nil {
			errMsg := fmt.Errorf("textChat-agent failed: %v", err)
			log.Println(errMsg)
			sendSSE("error", escapeForSSE(errMsg.Error()))
			sendSSE("done", "")
			return
		}

		// Palautetaan plain text -vastaus
		sendSSE("chunk", escapeForSSE(chat_answer))
		// odotetaan n ms
		time.Sleep(250 * time.Millisecond)
		sendSSE("done", chat_answer)
	}
}

// callOpenAIStreamOnce suorittaa yhden ChatCompletion-kutsun streamauksella
// ja palauttaa kerätyn vastauksen merkkijonona.
func callOpenAIStreamOnce(
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

	// Koostetaan viestit
	var localMessages []openai.ChatCompletionMessage
	localMessages = append(localMessages,
		openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleSystem,
			Content: systemMessage,
		},
	)
	localMessages = append(localMessages, history...)
	localMessages = append(localMessages,
		openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleUser,
			Content: userMessage,
		},
	)

	streamReq := openai.ChatCompletionRequest{
		Model:    modelName,
		Messages: localMessages,
		Stream:   true,
	}

	stream, err := client.CreateChatCompletionStream(ctx, streamReq)
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

	// Poistetaan mahdolliset JSON–koodauksen merkinnät
	answer = strings.TrimPrefix(answer, "```json")
	answer = strings.TrimSuffix(answer, "```")
	answer = strings.TrimPrefix(answer, "```")
	answer = strings.TrimSuffix(answer, "```")

	return answer, nil
}

func escapeForSSE(s string) string {
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", "\\n")
	return s
}

// doSemanticSearchInFileStructure suorittaa semanttisen haun "file_structure" -taulussa,
// käyttämällä "openai_embedding" -saraketta vektorietäisyyksien mukaan.
//
// Palauttaa enintään 5 parasta tulosta. Nyt otamme myös parent_folder -kentän
// ja luemme tiedoston sisällön levyltä, jos mahdollista.
func doSemanticSearchInFileStructure(ctx context.Context, userQuery string) ([]string, error) {
	db := backend.Db

	openaiKey := os.Getenv("OPENAI_API_KEY")
	if openaiKey == "" {
		return nil, fmt.Errorf("missing OPENAI_API_KEY")
	}
	embeddingModel := os.Getenv("OPENAI_EMBEDDING_MODEL")
	if embeddingModel == "" {
		embeddingModel = "text-embedding-ada-002"
	}

	client := openai.NewClient(openaiKey)

	// 1) Luodaan embedding käyttäjän kyselylle
	embedReq := openai.EmbeddingRequest{
		Model: openai.EmbeddingModel(embeddingModel),
		Input: []string{userQuery},
	}
	embedResp, err := client.CreateEmbeddings(ctx, embedReq)
	if err != nil {
		return nil, fmt.Errorf("createEmbeddings error: %w", err)
	}
	if len(embedResp.Data) == 0 {
		return nil, fmt.Errorf("createEmbeddings returned no data")
	}

	embedding := embedResp.Data[0].Embedding
	vectorVal := pgvector.NewVector(embedding)

	// 2) Haetaan top 5 tulosta, myös parent_folder
	query := `
SELECT name, parent_folder 
FROM file_structure
ORDER BY openai_embedding <-> $1
LIMIT 5
`
	rows, err := db.QueryContext(ctx, query, vectorVal)
	if err != nil {
		return nil, fmt.Errorf("semantic search query error: %w", err)
	}
	defer rows.Close()

	var results []string
	for rows.Next() {
		var fileName, parentFolder string
		if err := rows.Scan(&fileName, &parentFolder); err != nil {
			return nil, fmt.Errorf("scan error: %w", err)
		}
		// Rakennetaan polku muodossa parentFolder\fileName,
		// jos parentFolder ei ole tyhjä. Muuten käytetään pelkkää fileNamea.
		fullPath := fileName
		if parentFolder != "" {
			fullPath = parentFolder + "\\" + fileName
		}

		// Luetaan sisältö levyltä (jos löytyy).
		contentBytes, readErr := os.ReadFile(fullPath)
		if readErr != nil {
			log.Printf("could not read file %s: %v", fullPath, readErr)
			// Emme estä jatkoa, vaan vain mainitsemme ettei voitu lukea:
			contentBytes = []byte("Could not read file from disk: " + readErr.Error())
		}

		// Muodostetaan selkeä kooste palautusarvoihin
		resultString := fmt.Sprintf(
			"parent_folder: %s\\nfile_name: %s\\nfull_path: %s\\ncontent:\\n%s",
			parentFolder,
			fileName,
			fullPath,
			string(contentBytes),
		)
		results = append(results, resultString)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	log.Printf("[DEBUG] semantic top 5 results with content read: %d items", len(results))
	return results, nil
}
