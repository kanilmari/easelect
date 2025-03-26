// saveUserGroupRight.go
package backend

import (
    "encoding/json"
    "log"
    "net/http"
)

func SaveUserGroupRight(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Vain POST-pyynnöt sallitaan", http.StatusMethodNotAllowed)
        return
    }

    var data struct {
        UserGroupID int `json:"usergroup_id"`
        RightID     int `json:"right_id"`
        TableUID    int `json:"table_uid"`
    }

    if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
        log.Printf("Virhe datan lukemisessa: %v", err)
        http.Error(w, "Virhe datan lukemisessa", http.StatusBadRequest)
        return
    }

    // Tallenna data tietokantaan, käytä ON CONFLICT DO NOTHING välttääksesi virheet
    query := `
        INSERT INTO auth_user_group_rights (group_id, right_id, table_uid)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
    `
    log.Printf("UserGroupID: %d, RightID: %d, TableUID: %d", data.UserGroupID, data.RightID, data.TableUID)

    _, err := Db.Exec(query, data.UserGroupID, data.RightID, data.TableUID)
    if err != nil {
        log.Printf("Virhe tallennettaessa oikeutta: %v", err)
        http.Error(w, "Virhe tallennettaessa oikeutta", http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{
        "message": "Oikeus tallennettu onnistuneesti",
    })
}
