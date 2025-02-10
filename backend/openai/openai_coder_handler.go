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

// CodeEditorJSON on rakenne, jonka avulla tunnistamme,
// mitä AI haluaa tehdä. Se voi olla tiedoston generointi:
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

	// Haetaan system-viesti
	systemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE")
	if systemMsg == "" {
		systemMsg = `You are a code generation assistant. Return EXACTLY one JSON {...}.`
	}

	// LOKITUSTA
	log.Printf("OpenAICodeEditorStreamHandler called. user_message = %q", user_message)
	log.Printf("conversation_history length: %d", len(conversation_history))
	for idx, msg := range conversation_history {
		log.Printf("  conversation_history[%d].role = %s, length of content = %d chars",
			idx, msg.Role, len(msg.Content))
	}

	// Kootaan viestit OpenAI:lle
	messages := []openai.ChatCompletionMessage{
		{Role: openai.ChatMessageRoleSystem, Content: systemMsg},
	}
	messages = append(messages, conversation_history...)
	messages = append(messages, openai.ChatCompletionMessage{
		Role:    openai.ChatMessageRoleUser,
		Content: user_message,
	})

	model_name := os.Getenv("OPENAI_API_MODEL")
	if model_name == "" {
		model_name = "gpt-3.5-turbo"
	}

	client := openai.NewClient(openai_key)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	streamReq := openai.ChatCompletionRequest{
		Model:    model_name,
		Messages: messages,
		Stream:   true,
	}

	stream, err := client.CreateChatCompletionStream(ctx, streamReq)
	if err != nil {
		errMsg := fmt.Errorf("createChatCompletionStream error: %v", err)
		log.Println(errMsg)
		sendSSE("error", escapeForSSE(errMsg.Error()))
		return
	}
	defer stream.Close()

	var full_answer strings.Builder

	// Luetaan OpenAI:n striimi
	for {
		resp, err := stream.Recv()
		if err != nil {
			if err == io.EOF {
				break
			}
			errMsg := fmt.Errorf("stream read error: %v", err)
			log.Println(errMsg)
			sendSSE("error", escapeForSSE(errMsg.Error()))
			return
		}
		if len(resp.Choices) == 0 {
			continue
		}
		chunk := resp.Choices[0].Delta.Content
		if chunk == "" {
			continue
		}
		sendSSE("chunk", escapeForSSE(chunk))
		full_answer.WriteString(chunk)
	}

	final_text := strings.TrimSpace(full_answer.String())
	final_text = strings.TrimPrefix(final_text, "```json")
	final_text = strings.TrimSuffix(final_text, "```")
	final_text = strings.TrimPrefix(final_text, "```")
	final_text = strings.TrimSuffix(final_text, "```")

	var codeResp CodeEditorJSON
	err = json.Unmarshal([]byte(final_text), &codeResp)
	if err != nil {
		log.Printf("error unmarshaling codeResp: %v", err)
		// jatketaan silti...
	}

	// 1) Jos JSON sisältää "embedding_query", suoritetaan semanttinen haku
	if codeResp.EmbeddingQuery != "" {
		log.Printf("Detected embedding_query: %q", codeResp.EmbeddingQuery)
		results, err := doSemanticSearchInFileStructure(ctx, codeResp.EmbeddingQuery)
		if err != nil {
			log.Printf("error in doSemanticSearchInFileStructure: %v", err)
			//odotetaan n ms
			time.Sleep(250 * time.Millisecond)
			sendSSE("error", escapeForSSE(fmt.Sprintf("semantic search failed: %v", err)))
			// lopussa done
			sendSSE("done", escapeForSSE(final_text))
			return
		}

		// Palautetaan lyhyesti top 5 frontendiin
		responseLine := fmt.Sprintf("Top 5 matching files:\n%v", strings.Join(results, "\n"))
		sendSSE("chunk", escapeForSSE(responseLine))
		//odotetaan n ms
		time.Sleep(250 * time.Millisecond)

		// *********************
		// UUSI VAIHE: haluamme syöttää tulokset AI:lle (uusi ChatCompletion-kutsu)
		// *********************

		// 1. Laitetaan vanha historian rungon talteen
		newConversation := []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemMsg},
		}
		newConversation = append(newConversation, conversation_history...)

		// 2. Lisätään aluksi se sama user_message, jotta AI:lle pysyy konteksti
		newConversation = append(newConversation, openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleUser,
			Content: user_message,
		})

		// 3. Tässä “server”-viesti laitetaan esim. “assistant”-roolin viestinä
		//    jotta AI “näkee” tulokset. Voit halutessasi kokeilla role = "system".
		searchResultsMessage := openai.ChatCompletionMessage{
			Role: openai.ChatMessageRoleAssistant,
			Content: fmt.Sprintf(
				"Here are the top 5 matched files from semantic search:\n%s",
				strings.Join(results, "\n"),
			),
		}
		newConversation = append(newConversation, searchResultsMessage)

		// 4. Nyt haluamme ehkä loppukäyttäjän “lopullisen” kysymyksen perään,
		//    tai annamme AI:lle vapaata jatkoa. Esimerkiksi:
		promptForAI := openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleUser,
			Content: "Using these file names, can you refine your previous suggestion?",
		}
		newConversation = append(newConversation, promptForAI)

		// 5. Nyt teemme toisen OpenAI-kutsun
		secondReq := openai.ChatCompletionRequest{
			Model:    model_name,
			Messages: newConversation,
			Stream:   true,
		}

		secondStream, err := client.CreateChatCompletionStream(ctx, secondReq)
		if err != nil {
			errMsg := fmt.Errorf("second stream error: %v", err)
			log.Println(errMsg)
			sendSSE("error", escapeForSSE(errMsg.Error()))
			sendSSE("done", escapeForSSE(final_text))
			return
		}
		defer secondStream.Close()

		// Luetaan AI:n jatkovastaus
		var secondAnswer strings.Builder
		for {
			secondResp, err := secondStream.Recv()
			if err != nil {
				if err == io.EOF {
					break
				}
				errMsg := fmt.Errorf("second stream read error: %v", err)
				log.Println(errMsg)
				sendSSE("error", escapeForSSE(errMsg.Error()))
				break
			}
			if len(secondResp.Choices) == 0 {
				continue
			}
			chunk := secondResp.Choices[0].Delta.Content
			if chunk == "" {
				continue
			}
			sendSSE("chunk", escapeForSSE(chunk)) // SSE-lähetys
			secondAnswer.WriteString(chunk)
		}

		// lopetetaan
		//odotetaan n ms
		time.Sleep(250 * time.Millisecond)
		sendSSE("done", escapeForSSE(secondAnswer.String()))
		return
	}

	// 2) PathToFilename -> tee tiedosto, palautetaan done
	if codeResp.PathToFilename != "" {
		log.Printf("Detected path_to_filename: %s", codeResp.PathToFilename)
		dirName := filepath.Dir(codeResp.PathToFilename)
		if err := os.MkdirAll(dirName, 0755); err != nil {
			log.Printf("could not create directory: %v", err)
			sendSSE("error", escapeForSSE(fmt.Sprintf("could not create directory: %v", err)))
			sendSSE("done", escapeForSSE(final_text))
			return
		}
		log.Printf("Writing file: %s", codeResp.PathToFilename)
		err = os.WriteFile(codeResp.PathToFilename, []byte(codeResp.FullFileContent), 0644)
		if err != nil {
			log.Printf("error writing file: %v", err)
			sendSSE("error", escapeForSSE(fmt.Sprintf("error writing file: %v", err)))
			sendSSE("done", escapeForSSE(final_text))
			return
		}
		log.Printf("File written OK.")
		sendSSE("chunk", "File written OK.")

		//odotetaan n ms
		time.Sleep(250 * time.Millisecond)
		sendSSE("done", escapeForSSE(final_text))
		return
	}

	// Kumpikaan kenttä ei ollut mukana
	log.Printf("[WARNING] no embedding_query or path_to_filename found in JSON.")
	sendSSE("done", escapeForSSE(final_text))
}

// doSemanticSearchInFileStructure pysyy samana...

func escapeForSSE(s string) string {
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", "\\n")
	return s
}

// doSemanticSearchInFileStructure tekee vektorihaun tauluun "file_structure",
// sarakkeeseen "openai_embedding". Palauttaa enintään 5 riviä (name-kentän),
// lajiteltuna paremmuusjärjestykseen.
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
	// 1) Luodaan embedding userQuery:lle
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

	// 2) Haetaan top 5
	query := `SELECT name FROM file_structure ORDER BY openai_embedding <-> $1 LIMIT 5`
	rows, err := db.QueryContext(ctx, query, vectorVal)
	if err != nil {
		return nil, fmt.Errorf("semantic search query error: %w", err)
	}
	defer rows.Close()

	var results []string
	for rows.Next() {
		var fileName string
		if err := rows.Scan(&fileName); err != nil {
			return nil, fmt.Errorf("scan error: %w", err)
		}
		results = append(results, fileName)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	log.Printf("[DEBUG] semanttisen haun top 5: %v", results)
	return results, nil
}

// // openai_coder_handler.go

// package openai

// import (
// 	"context"
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

// 	"easelect/backend"

// 	pgvector "github.com/pgvector/pgvector-go"
// 	"github.com/sashabaranov/go-openai"
// )

// // CodeEditorJSON on rakenne, jonka avulla tunnistamme,
// // mitä AI haluaa tehdä. Se voi olla tiedoston generointi:
// //
// //	{"path_to_filename": "text.txt", "full_file_content": "abc"}
// //
// // tai semanttinen haku:
// //
// //	{"embedding_query": "some natural language text ..."}
// type CodeEditorJSON struct {
// 	PathToFilename  string `json:"path_to_filename"`
// 	FullFileContent string `json:"full_file_content"`
// 	EmbeddingQuery  string `json:"embedding_query"`
// }

// // OpenAICodeEditorStreamHandler kuuntelee SSE-pyyntöä ja lähettää
// // keskusteluhistorian + uuden viestin OpenAI:lle striiminä.
// // Jokainen OpenAI:n chunk lähetetään heti SSE "chunk" -eventillä.
// // Lopuksi yritämme parsea tekoälyn vastauksen JSONiksi:
// //   - Jos "embedding_query" on mukana, suoritetaan semanttinen haku
// //     ja lähetetään tulokset SSE "chunk" -eventtinä.
// //   - Jos "path_to_filename" on mukana, kirjoitetaan tiedosto.
// //
// // Vasta aivan lopuksi lähetetään "done" -eventti, jolloin frontend
// // voi lopettaa SSE-yhteyden.
// func OpenAICodeEditorStreamHandler(w http.ResponseWriter, r *http.Request) {
// 	if r.Method != http.MethodGet {
// 		http.Error(w, "only GET method allowed for SSE", http.StatusMethodNotAllowed)
// 		return
// 	}

// 	user_message := r.URL.Query().Get("user_message")
// 	encoded_conversation := r.URL.Query().Get("conversation")

// 	var conversation_history []openai.ChatCompletionMessage
// 	if encoded_conversation != "" {
// 		decoded, err := url.QueryUnescape(encoded_conversation)
// 		if err == nil {
// 			_ = json.Unmarshal([]byte(decoded), &conversation_history)
// 		}
// 	}

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

// 	openai_key := os.Getenv("OPENAI_API_KEY")
// 	if openai_key == "" {
// 		http.Error(w, "missing OPENAI_API_KEY", http.StatusInternalServerError)
// 		return
// 	}

// 	// Luetaan .env-tiedostosta AI_SYSTEM_MESSAGE (jos asetettu)
// 	systemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE")
// 	if systemMsg == "" {
// 		// fallback, jos ei asetettu
// 		systemMsg = `You are a code generation assistant. Return EXACTLY one JSON {...}.`
// 	}

// 	// ---- LOKITUSTA historian osalta ----
// 	log.Printf("OpenAICodeEditorStreamHandler called. user_message = %q", user_message)
// 	log.Printf("conversation_history length: %d", len(conversation_history))
// 	for idx, msg := range conversation_history {
// 		log.Printf("  conversation_history[%d].role = %s, length of content = %d chars",
// 			idx, msg.Role, len(msg.Content))
// 	}

// 	// Rakennetaan viestilista OpenAI:lle
// 	messages := []openai.ChatCompletionMessage{
// 		{Role: openai.ChatMessageRoleSystem, Content: systemMsg},
// 	}
// 	messages = append(messages, conversation_history...)
// 	messages = append(messages, openai.ChatCompletionMessage{
// 		Role:    openai.ChatMessageRoleUser,
// 		Content: user_message,
// 	})

// 	log.Printf("Total messages to send to OpenAI: %d", len(messages))

// 	model_name := os.Getenv("OPENAI_API_MODEL")
// 	if model_name == "" {
// 		model_name = "gpt-3.5-turbo"
// 	}

// 	client := openai.NewClient(openai_key)
// 	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
// 	defer cancel()

// 	streamReq := openai.ChatCompletionRequest{
// 		Model:    model_name,
// 		Messages: messages,
// 		Stream:   true,
// 	}

// 	stream, err := client.CreateChatCompletionStream(ctx, streamReq)
// 	if err != nil {
// 		errMsg := fmt.Errorf("createChatCompletionStream error: %v", err)
// 		log.Println(errMsg)
// 		sendSSE("error", escapeForSSE(errMsg.Error()))
// 		return
// 	}
// 	defer stream.Close()

// 	var full_answer strings.Builder

// 	// Luetaan OpenAI:n striimi chunk kerrallaan
// 	for {
// 		resp, err := stream.Recv()
// 		if err != nil {
// 			if err == io.EOF {
// 				break
// 			}
// 			errMsg := fmt.Errorf("stream read error: %v", err)
// 			log.Println(errMsg)
// 			sendSSE("error", escapeForSSE(errMsg.Error()))
// 			return
// 		}
// 		if len(resp.Choices) == 0 {
// 			continue
// 		}
// 		chunk := resp.Choices[0].Delta.Content
// 		if chunk == "" {
// 			continue
// 		}

// 		// Lähetetään chunk frontendiin SSE:nä
// 		sendSSE("chunk", escapeForSSE(chunk))
// 		full_answer.WriteString(chunk)
// 	}

// 	// Nyt meillä on AI:n koko vastaus full_answerissa,
// 	// mutta emme vielä lähetä "done"-eventtiä.
// 	final_text := strings.TrimSpace(full_answer.String())
// 	// Poistetaan mahdolliset ```-aidat
// 	final_text = strings.TrimPrefix(final_text, "```json")
// 	final_text = strings.TrimSuffix(final_text, "```")
// 	final_text = strings.TrimPrefix(final_text, "```")
// 	final_text = strings.TrimSuffix(final_text, "```")

// 	// Koetetaan parsea JSON
// 	var codeResp CodeEditorJSON
// 	err = json.Unmarshal([]byte(final_text), &codeResp)
// 	if err != nil {
// 		log.Printf("error unmarshaling codeResp: %v", err)
// 		// Emme tee "return" – haluamme silti lähettää done-eventin lopuksi.
// 	}

// 	// 1) Jos JSON sisältää "embedding_query", suoritetaan semanttinen haku
// 	if codeResp.EmbeddingQuery != "" {
// 		log.Printf("Detected embedding_query: %q", codeResp.EmbeddingQuery)
// 		results, err := doSemanticSearchInFileStructure(ctx, codeResp.EmbeddingQuery)
// 		if err != nil {
// 			log.Printf("error in doSemanticSearchInFileStructure: %v", err)
// 			//odotetaan n ms
// 			time.Sleep(250 * time.Millisecond)
// 			sendSSE("error", escapeForSSE(fmt.Sprintf("semantic search failed: %v", err)))
// 		} else {
// 			responseLine := fmt.Sprintf("Top 5 matching files:\n%v", strings.Join(results, "\n"))
// 			sendSSE("chunk", escapeForSSE(responseLine))
// 		}
// 		//odotetaan n ms
// 		time.Sleep(250 * time.Millisecond)
// 		// Lopuksi lähetämme "done", jossa on AI:n koko lopullinen teksti.
// 		sendSSE("done", escapeForSSE(final_text))
// 		return
// 	}

// 	// 2) Muutoin, jos JSON sisältää path_to_filename, luodaan tiedosto
// 	if codeResp.PathToFilename != "" {
// 		log.Printf("Detected path_to_filename: %s", codeResp.PathToFilename)
// 		dirName := filepath.Dir(codeResp.PathToFilename)
// 		if err := os.MkdirAll(dirName, 0755); err != nil {
// 			log.Printf("could not create directory: %v", err)
// 			sendSSE("error", escapeForSSE(fmt.Sprintf("could not create directory: %v", err)))
// 			// Silti lopuksi done
// 			sendSSE("done", escapeForSSE(final_text))
// 			return
// 		}
// 		log.Printf("Writing file: %s", codeResp.PathToFilename)
// 		err = os.WriteFile(codeResp.PathToFilename, []byte(codeResp.FullFileContent), 0644)
// 		if err != nil {
// 			log.Printf("error writing file: %v", err)
// 			sendSSE("error", escapeForSSE(fmt.Sprintf("error writing file: %v", err)))
// 			sendSSE("done", escapeForSSE(final_text))
// 			return
// 		}
// 		log.Printf("File written OK.")
// 		// Halutessasi voit lähettää SSE-chunkin "File written OK."
// 		sendSSE("chunk", "File written OK.")

// 		//odotetaan n ms
// 		time.Sleep(250 * time.Millisecond)
// 		sendSSE("done", escapeForSSE(final_text))
// 		return
// 	}

// 	// Jos kumpikaan kenttä ei ollut mukana JSONissa:
// 	log.Printf("[WARNING] no embedding_query or path_to_filename found in JSON.")
// 	// Silti lopuksi "done" AI:n koko vastaustekstillä
// 	sendSSE("done", escapeForSSE(final_text))
// }

// // doSemanticSearchInFileStructure tekee vektorihaun tauluun "file_structure",
// // sarakkeeseen "openai_embedding". Palauttaa enintään 5 riviä (name-kentän),
// // lajiteltuna paremmuusjärjestykseen.
// func doSemanticSearchInFileStructure(ctx context.Context, userQuery string) ([]string, error) {
// 	db := backend.Db

// 	openaiKey := os.Getenv("OPENAI_API_KEY")
// 	if openaiKey == "" {
// 		return nil, fmt.Errorf("missing OPENAI_API_KEY")
// 	}
// 	embeddingModel := os.Getenv("OPENAI_EMBEDDING_MODEL")
// 	if embeddingModel == "" {
// 		embeddingModel = "text-embedding-ada-002"
// 	}

// 	client := openai.NewClient(openaiKey)
// 	// 1) Luodaan embedding userQuery:lle
// 	embedReq := openai.EmbeddingRequest{
// 		Model: openai.EmbeddingModel(embeddingModel),
// 		Input: []string{userQuery},
// 	}
// 	embedResp, err := client.CreateEmbeddings(ctx, embedReq)
// 	if err != nil {
// 		return nil, fmt.Errorf("createEmbeddings error: %w", err)
// 	}
// 	if len(embedResp.Data) == 0 {
// 		return nil, fmt.Errorf("createEmbeddings returned no data")
// 	}

// 	embedding := embedResp.Data[0].Embedding
// 	vectorVal := pgvector.NewVector(embedding)

// 	// 2) Haetaan top 5
// 	query := `SELECT name FROM file_structure ORDER BY openai_embedding <-> $1 LIMIT 5`
// 	rows, err := db.QueryContext(ctx, query, vectorVal)
// 	if err != nil {
// 		return nil, fmt.Errorf("semantic search query error: %w", err)
// 	}
// 	defer rows.Close()

// 	var results []string
// 	for rows.Next() {
// 		var fileName string
// 		if err := rows.Scan(&fileName); err != nil {
// 			return nil, fmt.Errorf("scan error: %w", err)
// 		}
// 		results = append(results, fileName)
// 	}
// 	if rows.Err() != nil {
// 		return nil, rows.Err()
// 	}

// 	log.Printf("[DEBUG] semanttisen haun top 5: %v", results)
// 	return results, nil
// }

// // escapeForSSE korvaa rivinvaihdot SSE-yhteensopivilla merkeillä,
// // jotta chunkit voidaan näyttää front-endissä oikein.
// func escapeForSSE(s string) string {
// 	s = strings.ReplaceAll(s, "\r", "")
// 	s = strings.ReplaceAll(s, "\n", "\\n")
// 	return s
// }
