package e_sessions

import (
	"fmt"
	"net/http"
)

// getUserIDFromSession lukee user_id:n Gorilla-sessiosta.
func GetUserIDFromSession(r *http.Request) (int, error) {
	store := GetStore()
	session, err := store.Get(r, "session")
	if err != nil {
		return 0, fmt.Errorf("session get failed: %w", err)
	}
	val, ok := session.Values["user_id"]
	if !ok {
		return 0, fmt.Errorf("user_id puuttuu sessiosta")
	}
	userID, ok2 := val.(int)
	if !ok2 {
		return 0, fmt.Errorf("user_id ei ole int")
	}
	return userID, nil
}
