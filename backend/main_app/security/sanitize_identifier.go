package security

import (
	"fmt"
	"regexp"
)

func SanitizeIdentifier(identifier string) (string, error) {
	re := regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)
	if re.MatchString(identifier) {
		return identifier, nil
	}
	return "", fmt.Errorf("virheellinen tunniste: %s", identifier)
}
