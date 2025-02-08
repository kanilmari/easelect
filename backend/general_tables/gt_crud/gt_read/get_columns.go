// get_columns.go
package gt_read

import (
	"easelect/backend"
	"easelect/backend/general_tables/models"
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
		return nil, fmt.Errorf("error fetching table_uid for table %s: %v", tableName, err)
	}

	// Hae saraketiedot liittymällä system_column_details ja information_schema.columns
	query := `
        SELECT cd.column_uid,
               cd.column_name,
               c.data_type,
               cd.attnum,
               c.is_nullable,
               c.is_identity,
               c.column_default,
               COALESCE(cd.card_element, '') AS card_element
        FROM system_column_details cd
        JOIN information_schema.columns c
          ON c.table_name = $1 AND c.column_name = cd.column_name
        WHERE cd.table_uid = $2
        ORDER BY cd.attnum
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
			&colInfo.Attnum,
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
