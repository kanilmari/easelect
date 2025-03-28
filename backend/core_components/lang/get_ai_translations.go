package lang

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	backend "easelect/backend/core_components"

	"github.com/sashabaranov/go-openai"
)

// GenerateTranslationsRequest on POST-pyynnön data
type GenerateTranslationsRequest struct {
	MissingKeys    []string `json:"missing_keys"`
	ChosenLanguage string   `json:"chosen_language"`
	// Voit toki halutessasi yhä vastaanottaa chosenLanguage-parametrin,
	// jos käytät sitä frontissa muuhun logiikkaan.
}

// AiTranslationItem on AI:n palauttama yksittäinen käännösolio:
// [
//
//	{
//	  "lang_key": "foo",
//	  "en": "Some English text",
//	  "fi": "Jotain suomeksi"
//	},
//	...
//
// ]
type AiTranslationItem struct {
	LangKey string `json:"lang_key"`
	En      string `json:"en,omitempty"`
	Fi      string `json:"fi,omitempty"`
}

// GenerateTranslationsHandler kutsuu AI:ta puuttuville avaimille, tallentaa
// sekä englannin- että suomenkieliset käännökset ja palauttaa ne frontille.
func GenerateTranslationsHandler(w http.ResponseWriter, r *http.Request) {
	var requestData GenerateTranslationsRequest
	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		http.Error(w, fmt.Sprintf("\033[31mvirhe: %s\033[0m", err.Error()), http.StatusBadRequest)
		return
	}

	if len(requestData.MissingKeys) == 0 {
		// Ei puuttuvia avaimia => palauta tyhjä JSON
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]AiTranslationItem{})
		return
	}

	systemMessage := os.Getenv("AI_TRANSLATOR_SYSTEM_MESSAGE")
	openAiKey := os.Getenv("OPENAI_API_KEY")
	openAiModel := os.Getenv("OPENAI_API_MODEL")
	if systemMessage == "" || openAiKey == "" || openAiModel == "" {
		http.Error(w, "\033[31mvirhe: AI-määritykset puuttuvat .env:stä\033[0m", http.StatusInternalServerError)
		return
	}

	// Haetaan käännökset AI:sta (molemmille kielille)
	items, err := getAllTranslationsFromAI(
		r.Context(),
		systemMessage,
		openAiKey,
		openAiModel,
		requestData.MissingKeys,
	)
	if err != nil {
		http.Error(w, fmt.Sprintf("\033[31mvirhe: %s\033[0m", err.Error()), http.StatusInternalServerError)
		return
	}

	// Tallennetaan AI:n palauttamat kentät (en, fi) kantaan
	// ja kerätään sama data taulukkoon, jotta frontti saa sen heti
	for _, item := range items {
		if err := saveMultiLangTranslationToDatabase(item); err != nil {
			http.Error(w, fmt.Sprintf("\033[31mvirhe: %s\033[0m", err.Error()), http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	// Palautetaan taulukko samassa muodossa, esim.
	// [ { "lang_key": "...", "en": "...", "fi": "..."}, ... ]
	if err := json.NewEncoder(w).Encode(items); err != nil {
		http.Error(w, fmt.Sprintf("\033[31mvirhe: %s\033[0m", err.Error()), http.StatusInternalServerError)
	}
}

// getAllTranslationsFromAI kutsuu OpenAI:ta ja pyytää aina
// sekä englanninkieliset että suomenkieliset käännökset.
func getAllTranslationsFromAI(
	ctx context.Context,
	systemMessage, openAiKey, openAiModel string,
	missingKeys []string,
) ([]AiTranslationItem, error) {

	client := openai.NewClient(openAiKey)

	// Muodostetaan ChatCompletion-viestit
	msgs := []openai.ChatCompletionMessage{
		{
			Role:    openai.ChatMessageRoleSystem,
			Content: systemMessage,
		},
		{
			Role: openai.ChatMessageRoleUser,
			Content: fmt.Sprintf(`Translate these keys into both English ("en") and Finnish ("fi"). 
Return ONLY valid JSON array of objects. 
Each object has: "lang_key", "en", "fi". 
Use this structure example:

[
  {
    "lang_key": "some_key",
    "en": "English text",
    "fi": "Suomenkielinen teksti"
  }
]

Here are the keys: %v`, missingKeys),
		},
	}

	resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model:    openAiModel,
		Messages: msgs,
	})
	if err != nil {
		return nil, err
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no AI choices returned")
	}

	rawText := resp.Choices[0].Message.Content
	// Parsitaan AI:n vastaus suoraan []AiTranslationItem -tauluksi
	var items []AiTranslationItem
	if err := json.Unmarshal([]byte(rawText), &items); err != nil {
		return nil, fmt.Errorf("json unmarshal error: %w\n(ai response: %s)", err, rawText)
	}

	return items, nil
}

// saveMultiLangTranslationToDatabase tallentaa molemmat kielet samaan riviin
// system_lang_keys -tauluun. ON CONFLICT ei ylikirjoita olemassa
// olevia arvoja, vaan päivittää vain ne kolumnit, joissa ei entuudestaan ole
// tietoa (null tai tyhjä merkkijono).
func saveMultiLangTranslationToDatabase(item AiTranslationItem) error {
	query := `
        INSERT INTO system_lang_keys (lang_key, en, fi)
        VALUES ($1, $2, $3)
        ON CONFLICT (lang_key) DO UPDATE 
          SET en = CASE
                      WHEN system_lang_keys.en IS NULL OR system_lang_keys.en = '' 
                      THEN EXCLUDED.en
                      ELSE system_lang_keys.en
                    END,
              fi = CASE
                      WHEN system_lang_keys.fi IS NULL OR system_lang_keys.fi = '' 
                      THEN EXCLUDED.fi
                      ELSE system_lang_keys.fi
                    END
    `
	_, err := backend.Db.Exec(query, item.LangKey, item.En, item.Fi)
	return err
}

// package lang

// import (
// 	"context"
// 	"encoding/json"
// 	"fmt"
// 	"net/http"
// 	"os"

// 	backend "easelect/backend/core_components"

// 	"github.com/sashabaranov/go-openai" // Esimerkki OpenAI-kirjastosta
// )

// // GenerateTranslationsRequest on POST-pyynnön data, joka sisältää puuttuvat avaimet
// type GenerateTranslationsRequest struct {
// 	MissingKeys    []string `json:"missing_keys"`
// 	ChosenLanguage string   `json:"chosen_language"`
// }

// // GenerateTranslationsHandler kutsuu AI:ta puuttuville käännösavaimille
// // ja tallentaa tulokset tietokantaan.
// func GenerateTranslationsHandler(w http.ResponseWriter, r *http.Request) {
// 	var requestData GenerateTranslationsRequest
// 	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
// 		http.Error(w, fmt.Sprintf("\033[31mvirhe: %s\033[0m", err.Error()), http.StatusBadRequest)
// 		return
// 	}

// 	if len(requestData.MissingKeys) == 0 {
// 		w.Header().Set("Content-Type", "application/json")
// 		json.NewEncoder(w).Encode(map[string]string{})
// 		return
// 	}

// 	systemMessage := os.Getenv("AI_TRANSLATOR_SYSTEM_MESSAGE")
// 	openAiKey := os.Getenv("OPENAI_API_KEY")
// 	openAiModel := os.Getenv("OPENAI_API_MODEL")
// 	if systemMessage == "" || openAiKey == "" || openAiModel == "" {
// 		http.Error(w, "\033[31mvirhe: AI-määritykset puuttuvat .env:stä\033[0m", http.StatusInternalServerError)
// 		return
// 	}

// 	// Välitetään r.Context() eteenpäin
// 	aiTranslations, err := getAITranslations(
// 		r.Context(),
// 		systemMessage,
// 		openAiKey,
// 		openAiModel,
// 		requestData.MissingKeys,
// 		requestData.ChosenLanguage,
// 	)
// 	if err != nil {
// 		http.Error(w, fmt.Sprintf("\033[31mvirhe: %s\033[0m", err.Error()), http.StatusInternalServerError)
// 		return
// 	}

// 	resultMap := make(map[string]string)
// 	for langKey, translation := range aiTranslations {
// 		err := saveTranslationToDatabase(langKey, requestData.ChosenLanguage, translation)
// 		if err != nil {
// 			http.Error(w, fmt.Sprintf("\033[31mvirhe: %s\033[0m", err.Error()), http.StatusInternalServerError)
// 			return
// 		}
// 		resultMap[langKey] = translation
// 	}

// 	w.Header().Set("Content-Type", "application/json")
// 	if err := json.NewEncoder(w).Encode(resultMap); err != nil {
// 		http.Error(w, fmt.Sprintf("\033[31mvirhe: %s\033[0m", err.Error()), http.StatusInternalServerError)
// 	}
// }

// // getAITranslations kutsuu OpenAI:n ChatCompletionia ja palauttaa käännökset map-muodossa.
// // Huomaa ctx-parametri, jonka avulla hyödynnät pyynnön kontekstia (r.Context()).
// func getAITranslations(
// 	ctx context.Context,
// 	systemMessage, openAiKey, openAiModel string,
// 	missingKeys []string,
// 	chosenLang string,
// ) (map[string]string, error) {

// 	c := openai.NewClient(openAiKey)

// 	msgs := []openai.ChatCompletionMessage{
// 		{
// 			Role:    openai.ChatMessageRoleSystem,
// 			Content: systemMessage,
// 		},
// 		{
// 			Role:    openai.ChatMessageRoleUser,
// 			Content: fmt.Sprintf("Translate these keys to %s. Keys:\n%v", chosenLang, missingKeys),
// 		},
// 	}

// 	req := openai.ChatCompletionRequest{
// 		Model:    openAiModel,
// 		Messages: msgs,
// 	}

// 	// Käytetään ctx:ää suoraan tässä
// 	resp, err := c.CreateChatCompletion(ctx, req)
// 	if err != nil {
// 		return nil, err
// 	}

// 	aiTranslations := make(map[string]string)
// 	if len(resp.Choices) > 0 {
// 		rawText := resp.Choices[0].Message.Content
// 		err = json.Unmarshal([]byte(rawText), &aiTranslations)
// 		if err != nil {
// 			return nil, err
// 		}
// 	}

// 	return aiTranslations, nil
// }

// // saveTranslationToDatabase tallentaa (tai päivittää) avaimen käännöksen
// // system_lang_keys -tauluun. Toteutus yksinkertaisena esimerkkinä.
// func saveTranslationToDatabase(langKey, chosenLang, translation string) error {
// 	// esim. PostgreSQL upsert (ON CONFLICT)
// 	query := fmt.Sprintf(`
//         INSERT INTO system_lang_keys (lang_key, %s)
//         VALUES ($1, $2)
//         ON CONFLICT (lang_key) DO UPDATE SET %s = EXCLUDED.%s
//     `, chosenLang, chosenLang, chosenLang)

// 	_, err := backend.Db.Exec(query, langKey, translation)
// 	if err != nil {
// 		return err
// 	}
// 	return nil
// }
