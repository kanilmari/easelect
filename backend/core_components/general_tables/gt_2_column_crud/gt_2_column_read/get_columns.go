// get_columns.go
package gt_2_column_read

import (
	backend "easelect/backend/core_components"
	"easelect/backend/core_components/general_tables/models"
	"fmt"
)

// Päivitetty GetColumnsMapForTable-funktio
func GetColumnsMapForTable(tableName string) (map[int]models.ColumnInfo, error) {
	// Hae table_uid system_db_tables-taulusta
	var tableUID int
	err := backend.Db.QueryRow(`
        SELECT table_uid
        FROM system_db_tables
        WHERE table_name = $1
    `, tableName).Scan(&tableUID)
	if err != nil {
		return nil, fmt.Errorf("get_columns: error fetching table_uid for table %s: %v", tableName, err)
	}

	// Hae saraketiedot liittymällä system_column_details ja information_schema.columns
	query := `
        SELECT cd.column_uid,
               cd.column_name,
               c.data_type,
               cd.co_number,
               c.is_nullable,
               c.is_identity,
               c.column_default,
               COALESCE(cd.card_element, '') AS card_element
        FROM system_column_details cd
        JOIN information_schema.columns c
          ON c.table_name = $1 AND c.column_name = cd.column_name
        WHERE cd.table_uid = $2
        ORDER BY cd.co_number
    `
	rows, err := backend.Db.Query(query, tableName, tableUID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columnsMap := make(map[int]models.ColumnInfo)
	for rows.Next() {
		var colInfo models.ColumnInfo
		if err := rows.Scan(
			&colInfo.ColumnUid,
			&colInfo.ColumnName,
			&colInfo.DataType,
			&colInfo.CoNumber,
			&colInfo.IsNullable,
			&colInfo.IsIdentity,
			&colInfo.ColumnDefault,
			&colInfo.CardElement,
		); err != nil {
			return nil, err
		}
		columnsMap[colInfo.ColumnUid] = colInfo
	}
	return columnsMap, nil
}

// GetColumnsForTable hakee taulun sarakkeiden nimet
func GetColumnsForTable(tableName string) ([]string, error) {
	query := `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
    `
	rows, err := backend.Db.Query(query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []string
	for rows.Next() {
		var columnName string
		if err := rows.Scan(&columnName); err != nil {
			return nil, err
		}
		columns = append(columns, columnName)
	}
	return columns, nil
}

func GetColumnIDsForTableUID(tableUID int) ([]int, error) {
	query := `
        SELECT column_uid
        FROM system_column_details
        WHERE table_uid = $1
        ORDER BY co_number
    `
	rows, err := backend.Db.Query(query, tableUID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columnIDs []int
	for rows.Next() {
		var columnID int
		if err := rows.Scan(&columnID); err != nil {
			return nil, err
		}
		columnIDs = append(columnIDs, columnID)
	}
	return columnIDs, nil
}
