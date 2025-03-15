// notification_triggers.go
package gt_triggers

import (
	backend "easelect/backend/core_components"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/lib/pq"
)

// GetTriggersHandler lukee kaikki herätteet (GET /api/system_triggers/list)
func GetTriggersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "metodi ei ole sallittu", http.StatusMethodNotAllowed)
		return
	}

	triggers, err := fetchAllTriggers()
	if err != nil {
		log.Printf("virhe herätteitä haettaessa: %v", err)
		http.Error(w, "virhe herätteitä haettaessa", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(triggers); err != nil {
		log.Printf("virhe vastauksen enkoodauksessa: %v", err)
		http.Error(w, "virhe vastauksen enkoodauksessa", http.StatusInternalServerError)
	}
}

// CreateTriggerHandler luo uuden herätteen (POST /api/system_triggers/create)
func CreateTriggerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "metodi ei ole sallittu", http.StatusMethodNotAllowed)
		return
	}

	trigger, err := decodeTriggerRequest(r)
	if err != nil {
		log.Printf("virhe datan dekoodauksessa: %v", err)
		http.Error(w, "virheellinen data", http.StatusBadRequest)
		return
	}

	if err := insertTriggerIntoDB(trigger); err != nil {
		log.Printf("virhe herätettä tallennettaessa: %v", err)
		http.Error(w, "virhe herätettä tallennettaessa", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Heräte luotu onnistuneesti",
	})
}

// Trigger on struct, jolla vastaanotetaan JSON-dataa (source_table, condition, jne.)
type Trigger struct {
	SourceTable  string `json:"source_table"`
	Condition    string `json:"condition"`
	TargetTable  string `json:"target_table"`
	ActionValues string `json:"action_values"`
}

// decodeTriggerRequest lukee HTTP-pyynnön rungosta JSONin ja palauttaa Trigger-olion
func decodeTriggerRequest(r *http.Request) (*Trigger, error) {
	var trigger Trigger
	if err := json.NewDecoder(r.Body).Decode(&trigger); err != nil {
		return nil, err
	}
	return &trigger, nil
}

// insertTriggerIntoDB tallettaa uuden herätteen system_triggers -tauluun
func insertTriggerIntoDB(trigger *Trigger) error {
	query := `
        INSERT INTO system_triggers (source_table, condition, target_table, action_values)
        VALUES ($1, $2, $3, $4)
    `
	_, err := backend.Db.Exec(query, trigger.SourceTable, trigger.Condition, trigger.TargetTable, trigger.ActionValues)
	return err
}

// fetchAllTriggers lukee kaikki system_triggers -taulun rivit
func fetchAllTriggers() ([]map[string]interface{}, error) {
	query := `
        SELECT id, source_table, condition, target_table, action_values
        FROM system_triggers
    `
	rows, err := backend.Db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var triggers []map[string]interface{}
	for rows.Next() {
		var id int
		var sourceTable, condition, targetTable, actionValues string

		if err := rows.Scan(&id, &sourceTable, &condition, &targetTable, &actionValues); err != nil {
			return nil, err
		}

		trigger := map[string]interface{}{
			"id":            id,
			"source_table":  sourceTable,
			"condition":     condition,
			"target_table":  targetTable,
			"action_values": actionValues,
		}

		triggers = append(triggers, trigger)
	}
	return triggers, nil
}

// ---------------------------------------------------------------------
// Seuraavat funktiot liittyvät herätteiden suorittamiseen. Näitä kutsutaan,
// kun tauluun on lisätty uusi rivi, ja halutaan tarkistaa, aktivoituuko jokin heräte
// ---------------------------------------------------------------------

// ExecuteTriggers käy läpi system_triggers -taulusta ne herätteet,
// jotka on määritelty ko. taululle (tableName), ja suorittaa ne jos ehto täyttyy
func ExecuteTriggers(tableName string, newRow map[string]interface{}) error {
	log.Printf("Suoritetaan herätteitä taululle: %s", tableName)

	triggers, err := fetchTriggersForTable(tableName)
	if err != nil {
		return err
	}

	log.Printf("Löydettiin %d herätettä taululle %s", len(triggers), tableName)

	for _, trigger := range triggers {
		log.Printf("Käsitellään herätettä ID: %d, Ehto: %s", trigger.ID, trigger.Condition)
		conditionMet, err := evaluateCondition(trigger.Condition, newRow)
		if err != nil {
			log.Printf("virhe ehtoa arvioitaessa herätteelle %d: %v", trigger.ID, err)
			continue
		}

		log.Printf("Ehto täyttyy: %t herätteelle ID: %d", conditionMet, trigger.ID)

		if conditionMet {
			err = executeAction(trigger.TargetTable, trigger.ActionValues, newRow)
			if err != nil {
				log.Printf("virhe toimintoa suoritettaessa herätteelle %d: %v", trigger.ID, err)
				continue
			}
			log.Printf("Toiminto suoritettu onnistuneesti herätteelle ID: %d", trigger.ID)
		}
	}
	return nil
}

// DBTrigger on rakenteena sama kuin system_triggers-taulun rivit (paitsi ID).
type DBTrigger struct {
	ID           int
	Condition    string
	TargetTable  string
	ActionValues string
}

// fetchTriggersForTable hakee system_triggers-taulusta tietyssä taulussa "lähdetauluna" olevat herätteet
func fetchTriggersForTable(tableName string) ([]DBTrigger, error) {
	query := `
        SELECT id, condition, target_table, action_values
        FROM system_triggers
        WHERE source_table = $1
    `
	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var triggers []DBTrigger
	for rows.Next() {
		var trigger DBTrigger
		if err := rows.Scan(&trigger.ID, &trigger.Condition, &trigger.TargetTable, &trigger.ActionValues); err != nil {
			return nil, err
		}
		triggers = append(triggers, trigger)
	}
	return triggers, nil
}

// evaluateCondition pilkkoo "mycolumn = 'foo'" -tyylisen ehdon ja vertailee newRow:n arvoon
func evaluateCondition(conditionStr string, row map[string]interface{}) (bool, error) {
	var creationSpec string
	err := backend.Db.QueryRow("SHOW trigger_session_var").Scan(&creationSpec)
	if err == nil && creationSpec == "trigger" {
		// Jos sessiomuuttuja on "trigger", estetään uudelleenkäynnistys
		return false, nil
	}

	column, operator, valueStr, err := parseCondition(conditionStr)
	if err != nil {
		return false, err
	}

	rowValue, exists := row[column]
	if !exists {
		return false, fmt.Errorf("sarake %s ei löydy rivistä", column)
	}

	// Poistetaan mahdolliset lainausmerkit valueStr:stä
	valueStr = strings.Trim(valueStr, "'")

	switch operator {
	case "=", "!=", "ILIKE", "NOT ILIKE":
		return compareStringValues(rowValue, valueStr, operator)
	case ">", "<", ">=", "<=":
		return compareNumericValues(rowValue, valueStr, operator)
	default:
		return false, fmt.Errorf("tuntematon operaattori %s", operator)
	}
}

// parseCondition pilkkoo esim. "colname = 'foo bar'" -> (colname, =, 'foo bar')
func parseCondition(conditionStr string) (column, operator, valueStr string, err error) {
	parts := strings.Fields(conditionStr)
	if len(parts) < 3 {
		err = fmt.Errorf("virheellinen ehto: %s", conditionStr)
		return
	}
	column = parts[0]
	operator = parts[1]
	valueStr = strings.Join(parts[2:], " ")
	return
}

// compareStringValues vertailee merkkijonomuotoisia arvoja (esim. =, !=, ILIKE, NOT ILIKE)
func compareStringValues(rowValue interface{}, valueStr, operator string) (bool, error) {
	rowValueStr := fmt.Sprintf("%v", rowValue)
	switch operator {
	case "=":
		return rowValueStr == valueStr, nil
	case "!=":
		return rowValueStr != valueStr, nil
	case "ILIKE":
		// toteutetaan "case-insensitive" -vertailu
		return strings.EqualFold(rowValueStr, valueStr), nil
	case "NOT ILIKE":
		return !strings.EqualFold(rowValueStr, valueStr), nil
	default:
		return false, fmt.Errorf("tuntematon operaattori %s", operator)
	}
}

// compareNumericValues vertailee numeerisia arvoja (esim. >, <, >=, <=)
func compareNumericValues(rowValue interface{}, valueStr, operator string) (bool, error) {
	rowValueFloat, err := toFloat64(rowValue)
	if err != nil {
		return false, err
	}
	conditionValueFloat, err := strconv.ParseFloat(valueStr, 64)
	if err != nil {
		return false, err
	}
	switch operator {
	case ">":
		return rowValueFloat > conditionValueFloat, nil
	case "<":
		return rowValueFloat < conditionValueFloat, nil
	case ">=":
		return rowValueFloat >= conditionValueFloat, nil
	case "<=":
		return rowValueFloat <= conditionValueFloat, nil
	default:
		return false, fmt.Errorf("tuntematon operaattori %s", operator)
	}
}

// toFloat64 auttaa muuntamaan rivin arvon float64-tyyppiin
func toFloat64(value interface{}) (float64, error) {
	switch v := value.(type) {
	case float64:
		return v, nil
	case float32:
		return float64(v), nil
	case int:
		return float64(v), nil
	case int64:
		return float64(v), nil
	case int32:
		return float64(v), nil
	case json.Number:
		return v.Float64()
	case string:
		return strconv.ParseFloat(v, 64)
	default:
		return 0, fmt.Errorf("arvoa %v ei voi muuntaa float64-tyyppiin", value)
	}
}

// executeAction rakentaa INSERT-lauseen ja tallettaa actionValues:n targetTableen
func executeAction(targetTable, actionValuesStr string, sourceRow map[string]interface{}) error {
	actionValues, err := parseActionValues(actionValuesStr, sourceRow)
	if err != nil {
		return err
	}

	tx, err := backend.Db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Varmuuden vuoksi tarkistetaan, onko trigger_session_var jo "trigger"
	var creationSpec string
	err = backend.Db.QueryRow("SHOW myapp.trigger_session_var").Scan(&creationSpec)
	if err == nil && creationSpec == "trigger" {
		// Jos jo "trigger", estetään moninkertainen laukeaminen
		return err
	}

	columns, placeholders, values := buildInsertParameters(actionValues)
	insertQuery := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		pq.QuoteIdentifier(targetTable),
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "))

	_, execErr := tx.Exec(insertQuery, values...)
	if execErr != nil {
		return execErr
	}
	return tx.Commit()
}

// parseActionValues käy action_values -JSONin läpi ja korvaa {{colName}} -viittaukset newRow:n arvoihin
func parseActionValues(actionValuesStr string, sourceRow map[string]interface{}) (map[string]interface{}, error) {
	var actionValues map[string]interface{}
	err := json.Unmarshal([]byte(actionValuesStr), &actionValues)
	if err != nil {
		return nil, err
	}

	for key, val := range actionValues {
		if strVal, ok := val.(string); ok {
			if strings.HasPrefix(strVal, "{{") && strings.HasSuffix(strVal, "}}") {
				columnName := strings.TrimSuffix(strings.TrimPrefix(strVal, "{{"), "}}")
				if sourceVal, exists := sourceRow[columnName]; exists {
					actionValues[key] = sourceVal
				} else {
					return nil, fmt.Errorf("sarake %s ei löydy lähderivistä", columnName)
				}
			}
		}
	}
	return actionValues, nil
}

// buildInsertParameters luo listat sarakkeista, placeholdereista ($1, $2, ...) ja arvoista
func buildInsertParameters(actionValues map[string]interface{}) ([]string, []string, []interface{}) {
	var columns []string
	var placeholders []string
	var values []interface{}

	i := 1
	for col, val := range actionValues {
		columns = append(columns, pq.QuoteIdentifier(col))
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		values = append(values, val)
		i++
	}
	return columns, placeholders, values
}
