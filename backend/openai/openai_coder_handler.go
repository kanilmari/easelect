// openai_code_editor_stream_handler.go (tai haluamassasi tiedostossa)

package openai

import (
	"context"
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

	"github.com/sashabaranov/go-openai"
)

type CodeEditorJSON struct {
	Filename    string `json:"filename"`
	Filecontent string `json:"filecontent"`
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

	// Luetaan .env-tiedostosta “AI_SYSTEM_MESSAGE”:
	systemMsg := os.Getenv("OPENAI_CODER_SYSTEM_MESSAGE")
	if systemMsg == "" {
		// fallback, jos ei asetettu
		systemMsg = `You are a code generation assistant. Return EXACTLY one JSON {...}.`
	}

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
		errMsg := fmt.Sprintf("createChatCompletionStream error: %v", err)
		log.Println(errMsg)
		sendSSE("error", escapeForSSE(errMsg))
		return
	}
	defer stream.Close()

	var full_answer strings.Builder
	for {
		resp, err := stream.Recv()
		if err != nil {
			if err == io.EOF {
				break
			}
			errMsg := fmt.Sprintf("stream read error: %v", err)
			log.Println(errMsg)
			sendSSE("error", escapeForSSE(errMsg))
			return
		}
		if len(resp.Choices) == 0 {
			continue
		}
		chunk := resp.Choices[0].Delta.Content
		if chunk == "" {
			continue
		}
		sendSSE("chunk", escapeForSSE(chunk)) // Näytetään chunk frontendiin
		full_answer.WriteString(chunk)
	}

	final_text := strings.TrimSpace(full_answer.String())
	// Poistetaan mahdolliset ```-aitaukset
	final_text = strings.TrimPrefix(final_text, "```json")
	final_text = strings.TrimSuffix(final_text, "```")
	final_text = strings.TrimPrefix(final_text, "```")
	final_text = strings.TrimSuffix(final_text, "```")

	// SSE-loppu
	sendSSE("done", escapeForSSE(final_text))

	// Yritetään parsea JSON:iksi, jos halutaan tallentaa
	var codeResp CodeEditorJSON
	err = json.Unmarshal([]byte(final_text), &codeResp)
	if err != nil {
		log.Printf("error unmarshaling codeResp: %v", err)
		return
	}

	if codeResp.Filename == "" {
		log.Printf("[WARNING] no filename from assistant.")
		return
	}

	// Luo puuttuvat kansiot
	dirName := filepath.Dir(codeResp.Filename)
	if err := os.MkdirAll(dirName, 0755); err != nil {
		log.Printf("could not create directory: %v", err)
		return
	}

	log.Printf("Writing file: %s", codeResp.Filename)
	err = os.WriteFile(codeResp.Filename, []byte(codeResp.Filecontent), 0644)
	if err != nil {
		log.Printf("error writing file: %v", err)
		return
	}
	log.Printf("File written OK.")
}

func escapeForSSE(s string) string {
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", "\\n")
	return s
}
