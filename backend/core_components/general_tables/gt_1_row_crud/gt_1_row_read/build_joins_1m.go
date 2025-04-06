// file: build_joins_1m.go
package gt_1_row_read

import (
	"database/sql"
	"fmt"
	"log"
	"strings"

	"github.com/lib/pq"

	"easelect/backend/core_components/general_tables/models"
	"easelect/backend/core_components/general_tables/utils"
)

// OneMRelation edustaa riviä foreign_key_relations_1_m -taulussa.
// Mukaan vain oleellisimmat sarakkeet demo-mielessä.
type OneMRelation struct {
	SourceTableName    string
	SourceColumnName   string
	TargetTableName    string
	TargetColumnName   string
	CachedNameColInSrc string
	NameColInTgt       string
	// ... mahdolliset muut kentät ...
}

// buildJoinsWith1MRelations on laajennettu versio buildJoins-funktiosta,
// joka tarkistaa, onko vierasavaimelle määritelty "välimuistettu nimi"
// foreign_key_relations_1_m -taulussa. Jos on, skipataan JOIN ja
// valitaan pelkkä cached_sarake. Muussa tapauksessa tehdään normaali JOIN.
func buildJoinsWith1MRelations(
	db *sql.DB,
	tableName string,
	columnsMap map[int]models.ColumnInfo,
	columnUids []int,
) (string, string, map[string]string, error) {

	// Haetaan foreign_key_relations_1_m -rivit koskien tableName-lähdetaulua.
	fkRelations, err := fetchForeignKeyRelations(db, tableName)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return "", "", nil, err
	}

	// Haetaan varsinainen foreignKeys-tieto (esim. fk.NameColumn).
	foreignKeys, err := utils.GetForeignKeysForTable(tableName)
	if err != nil {
		log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		return "", "", nil, err
	}

	selectColumns := ""
	joinClauses := ""
	aliasCount := make(map[string]int)
	columnExpressions := make(map[string]string)

	for _, colUid := range columnUids {
		colInfo, exists := columnsMap[colUid]
		if !exists {
			return "", "", nil, fmt.Errorf(
				"saraketta column_uid %d ei löydy taulusta %s",
				colUid, tableName,
			)
		}
		colName := colInfo.ColumnName

		// Tarkistetaan, onko colName foreignKeys-listassa:
		if fk, ok := foreignKeys[colName]; ok && fk.NameColumn != "" {

			// Katsotaan, onko meillä foreign_key_relations_1_m -tietuetta tälle sarakkeelle
			rel, foundRel := fkRelations[colName]
			if foundRel && rel.CachedNameColInSrc != "" {
				//----------------------------------------------------------------
				// Jos on annettu cached-sarake, käytetään sitä
				//----------------------------------------------------------------
				cachedCol := rel.CachedNameColInSrc
				generatedNameCol := colName + "_name" // Esim. user_id_name

				selectColumns += fmt.Sprintf("%s.%s AS %s, %s.%s AS %s, ",
					pq.QuoteIdentifier(tableName),
					pq.QuoteIdentifier(colName),
					pq.QuoteIdentifier(colName),
					pq.QuoteIdentifier(tableName),
					pq.QuoteIdentifier(cachedCol),
					pq.QuoteIdentifier(generatedNameCol),
				)
				columnExpressions[generatedNameCol] = fmt.Sprintf(
					"%s.%s",
					pq.QuoteIdentifier(tableName),
					pq.QuoteIdentifier(cachedCol),
				)

			} else {
				//----------------------------------------------------------------
				// Jos ei ole cached-saraketta, tehdään normaali LEFT JOIN
				//----------------------------------------------------------------
				aliasCount[colName]++
				alias := fmt.Sprintf("%s_alias%d", colName, aliasCount[colName])

				generatedColumnName := colName + "_name"
				if strings.HasSuffix(colName, "_id") {
					generatedColumnName = strings.TrimSuffix(colName, "_id") + "_name (ln)"
				} else if strings.HasSuffix(colName, "_uid") {
					generatedColumnName = strings.TrimSuffix(colName, "_uid") + "_name (ln)"
				}

				fullyQualifiedColumnName := fmt.Sprintf(
					"%s.%s",
					pq.QuoteIdentifier(alias),
					pq.QuoteIdentifier(fk.NameColumn),
				)
				columnExpressions[generatedColumnName] = fullyQualifiedColumnName

				selectColumns += fmt.Sprintf("%s.%s AS %s, %s.%s AS \"%s\", ",
					pq.QuoteIdentifier(tableName),
					pq.QuoteIdentifier(colName),
					pq.QuoteIdentifier(colName),
					pq.QuoteIdentifier(alias),
					pq.QuoteIdentifier(fk.NameColumn),
					generatedColumnName,
				)

				joinClauses += fmt.Sprintf("LEFT JOIN %s AS %s ON %s.%s = %s.%s ",
					pq.QuoteIdentifier(fk.ReferencedTable),
					pq.QuoteIdentifier(alias),
					pq.QuoteIdentifier(tableName),
					pq.QuoteIdentifier(colName),
					pq.QuoteIdentifier(alias),
					pq.QuoteIdentifier(fk.ReferencedColumn),
				)
			}

		} else {
			//----------------------------------------------------------------
			// Ei vierasavain tai nimisaraketta => valitaan sellaisenaan
			//----------------------------------------------------------------
			selectColumns += fmt.Sprintf("%s.%s AS %s, ",
				pq.QuoteIdentifier(tableName),
				pq.QuoteIdentifier(colName),
				pq.QuoteIdentifier(colName))
			columnExpressions[colName] = fmt.Sprintf("%s.%s",
				pq.QuoteIdentifier(tableName),
				pq.QuoteIdentifier(colName))
		}
	}

	selectColumns = strings.TrimRight(selectColumns, ", ")
	return selectColumns, joinClauses, columnExpressions, nil
}

// fetchForeignKeyRelations hakee foreign_key_relations_1_m -taulusta rivit,
// jotka koskevat annettua lähdetaulua (source_table_name).
func fetchForeignKeyRelations(db *sql.DB, sourceTable string) (map[string]OneMRelation, error) {
	query := `
		SELECT
			source_table_name,
			source_column_name,
			target_table_name,
			target_column_name,
			COALESCE(cached_name_col_in_src, '') as cached_name_col_in_src,
			COALESCE(name_col_in_tgt, '') as name_col_in_tgt
		FROM foreign_key_relations_1_m
		WHERE source_table_name = $1
	`
	rows, err := db.Query(query, sourceTable)
	if err != nil {
		return nil, fmt.Errorf("fetchForeignKeyRelations: %v", err)
	}
	defer rows.Close()

	result := make(map[string]OneMRelation)
	for rows.Next() {
		var r OneMRelation
		err := rows.Scan(
			&r.SourceTableName,
			&r.SourceColumnName,
			&r.TargetTableName,
			&r.TargetColumnName,
			&r.CachedNameColInSrc,
			&r.NameColInTgt,
		)
		if err != nil {
			log.Printf("\033[31mvirhe: %s\033[0m\n", err.Error()) //odotetaan
			continue
		}
		// Käytetään mapin avaimena source_column_name
		result[r.SourceColumnName] = r
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return result, nil
}
