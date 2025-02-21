package gt_1_row_read

import (
	"regexp"
	"strings"
)

// TokenType kuvaa, mitä lajia hakusana on.
type TokenType int

const (
	TokenAll     TokenType = iota // "*", "%" => Hae kaikki
	TokenAnd                      // AND
	TokenOr                       // OR
	TokenInclude                  // Normaali hakusana (ILIKE)
	TokenExclude                  // != => Kielletty hakusana (NOT ILIKE)
)

// Token kuvaa yksittäistä hakutermiä.
type Token struct {
	Type  TokenType
	Value string
}

// parseAdvancedSearch pilkkoo syötemerkkijonon token-listaksi.
// Se tunnistaa:
//   - AND / OR (case-insensitive)
//   - !=
//   - "([^"]*)" ja '([^']*)' (myös tyhjät, koska * sallii 0 merkkiä)
//   - (\S+) => muut sanat
//
// Esimerkkejä:
//
//	foo AND "bar baz" != qux
//	-> [Include("foo"), And, Include("bar baz"), Exclude("qux")]
//
//	k*rhu -> Include("k*rhu") -> myöhemmin buildConditionForTokens vaiheessa
//	  korvataan * => % => "k%rhu"
func parseAdvancedSearch(input string) []Token {
	input = strings.TrimSpace(input)

	// Jos syöte on pelkkä "*" tai "%", tulkitaan = "hae kaikki"
	if input == "*" || input == "%" {
		return []Token{{Type: TokenAll, Value: input}}
	}

	// Regex etsii järjestyksessä:
	//  1) (AND|OR)  (case-insensitive)
	//  2) !=
	//  3) "([^"]*)"   => kaksoshinnat, sallitaan myös tyhjä
	//  4) '([^']*)'   => yksöishinnat, sallitaan myös tyhjä
	//  5) (\S+)       => muut sanat
	re := regexp.MustCompile(`(?i)(AND|OR)|(!=)|"([^"]*)"|'([^']*)'|(\S+)`)
	matches := re.FindAllStringSubmatch(input, -1)

	var tokens []Token
	var nextExclude bool

	for _, m := range matches {
		andOrPart := m[1] // AND/OR
		excludeOp := m[2] // !=
		doubleQ := m[3]   // "foo" (voi olla "")
		singleQ := m[4]   // 'foo' (voi olla "")
		plainText := m[5] // muu sana

		// 1) AND / OR
		if strings.EqualFold(andOrPart, "AND") {
			tokens = append(tokens, Token{Type: TokenAnd, Value: "AND"})
			continue
		}
		if strings.EqualFold(andOrPart, "OR") {
			tokens = append(tokens, Token{Type: TokenOr, Value: "OR"})
			continue
		}

		// 2) != => seuraava sana menee TokenExclude-tilaan
		if excludeOp == "!=" {
			nextExclude = true
			continue
		}

		// 3) Hae sisältö quotes
		var content string
		if doubleQ != "" || doubleQ == "" {
			content = doubleQ
		}
		if singleQ != "" || singleQ == "" {
			// Käytännössä vain toinen näistä on kerrallaan täynnä
			if singleQ != "" {
				content = singleQ
			}
		}
		// Jos kumpikaan edellä ei osunut, otetaan plainText
		if content == "" && doubleQ == "" && singleQ == "" {
			content = plainText
		}

		// 4) Jos haluat käsitellä "*"-merkkiä sisäisenä wildcardina,
		//    mutta VAIN silloin, kun content ei ole täsmälleen "*" => TokenAll.
		//    Emme tee tätä heti, koska TokenAll-tapaus hoidettiin jo alussa,
		//    kun input == "*" / "%".
		//    Myös jos user kirjoitti "k*rhu", niin nyt content on "k*rhu".

		// Käsitellään Exclude vs Include
		if nextExclude {
			// Jos haluat jakaa "k*rhu s*b" useammaksi exclude-tokeniksi, laita strings.Fields
			parts := strings.Fields(content)
			if len(parts) == 0 {
				// !="": ei ole merkkejä
				tokens = append(tokens, Token{Type: TokenExclude, Value: ""})
			} else {
				for _, p := range parts {
					tokens = append(tokens, Token{Type: TokenExclude, Value: p})
				}
			}
			nextExclude = false
		} else {
			parts := strings.Fields(content)
			if len(parts) == 0 {
				tokens = append(tokens, Token{Type: TokenInclude, Value: ""})
			} else {
				for _, p := range parts {
					tokens = append(tokens, Token{Type: TokenInclude, Value: p})
				}
			}
		}
	}

	return tokens
}

// // parse_advanced_search.go

// package gt_1_row_read

// import (
// 	"regexp"
// 	"strings"
// )

// // parseSearchString vastaanottaa yhden hakumerkkijonon, esim.:
// //
// //	`!="foo bar" baz`   tai   `baz !="foo bar"`
// //
// // ja löytää sieltä:
// //   - excludeWords = ["foo","bar"]
// //   - includeWords = ["baz"]
// //
// // Käyttää regexiä, joka etsii sekä:
// //  1. != "jotain välilyönneillä"
// //  2. yksittäisiä sanoja (ilman !=)
// func parseSearchString(input string) (excludeWords []string, includeWords []string) {
// 	// Etsi muodot:
// 	//   != "([^"]+)"  => ryhmä1 = exclude-ketju
// 	//   (\S+)         => ryhmä2 = yksittäinen "include"-sana
// 	//
// 	// Huom. Jos haluat tukea useampia != "..." -lohkoja,
// 	// tämä regex löytää ne kaikki, järjestyksessä.
// 	re := regexp.MustCompile(`!=\s*"([^"]+)"|(\S+)`)

// 	matches := re.FindAllStringSubmatch(input, -1)
// 	for _, match := range matches {
// 		excludePart := match[1] // ryhmä1
// 		includePart := match[2] // ryhmä2

// 		if excludePart != "" {
// 			// Pilkotaan välilyönneistä
// 			words := strings.Fields(excludePart)
// 			excludeWords = append(excludeWords, words...)
// 		} else if includePart != "" {
// 			// Normaali sana
// 			includeWords = append(includeWords, includePart)
// 		}
// 	}

// 	return excludeWords, includeWords
// }
