// parse_advanced_search.go

package gt_1_row_read

import (
	"regexp"
	"strings"
)

// parseSearchString vastaanottaa yhden hakumerkkijonon, esim.:
//
//	`!="foo bar" baz`   tai   `baz !="foo bar"`
//
// ja löytää sieltä:
//   - excludeWords = ["foo","bar"]
//   - includeWords = ["baz"]
//
// Käyttää regexiä, joka etsii sekä:
//  1. != "jotain välilyönneillä"
//  2. yksittäisiä sanoja (ilman !=)
func parseSearchString(input string) (excludeWords []string, includeWords []string) {
	// Etsi muodot:
	//   != "([^"]+)"  => ryhmä1 = exclude-ketju
	//   (\S+)         => ryhmä2 = yksittäinen "include"-sana
	//
	// Huom. Jos haluat tukea useampia != "..." -lohkoja,
	// tämä regex löytää ne kaikki, järjestyksessä.
	re := regexp.MustCompile(`!=\s*"([^"]+)"|(\S+)`)

	matches := re.FindAllStringSubmatch(input, -1)
	for _, match := range matches {
		excludePart := match[1] // ryhmä1
		includePart := match[2] // ryhmä2

		if excludePart != "" {
			// Pilkotaan välilyönneistä
			words := strings.Fields(excludePart)
			excludeWords = append(excludeWords, words...)
		} else if includePart != "" {
			// Normaali sana
			includeWords = append(includeWords, includePart)
		}
	}

	return excludeWords, includeWords
}
