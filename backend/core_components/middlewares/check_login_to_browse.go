// system_config.go
package middlewares

import (
	backend "easelect/backend/core_components"
)

// CheckLoginToBrowse hakee system_config -taulusta avaimen 'login_to_browse'
func CheckLoginToBrowse() (bool, error) {
	var loginToBrowse bool
	err := backend.Db.QueryRow(`
		SELECT boolean_value
		FROM system_config
		WHERE key = 'login_to_browse'
	`).Scan(&loginToBrowse)
	if err != nil {
		return false, err
	}
	return loginToBrowse, nil
}
