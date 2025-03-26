// crud_workflows/bridge_updates.go
package crud_workflows

import (
	"database/sql"

	backend "easelect/backend/core_components"
	"easelect/backend/core_components/general_tables/gt_2_column_crud"
	"easelect/backend/core_components/general_tables/gt_2_column_crud/gt_2_column_update"
	"easelect/backend/core_components/general_tables/gt_3_table_crud/gt_3_table_create"
	"easelect/backend/core_components/general_tables/gt_3_table_crud/gt_3_table_delete"
	"easelect/backend/core_components/general_tables/gt_3_table_crud/gt_3_table_update"
	"easelect/backend/core_components/security"
)

// UpdateColumnsWithBridge kutsuu gt_2_column_update -paketin UpdateColumns-funktiota
func UpdateColumnsWithBridge(
	tx *sql.Tx,
	sanitizedTableName string,
	modifiedCols []gt_2_column_crud.ModifiedCol,
) error {
	return gt_2_column_update.UpdateColumns(
		tx,
		sanitizedTableName,
		modifiedCols,
		security.SanitizeIdentifier,
	)
}

// UpdateOidsAndTableNamesWithBridge kutsuu gt_3_table_update.UpdateOidsAndTableNames(...)
// ja välittää callbackit poistettujen taulujen, uusien taulujen sekä
// olemassaolevien sarakkeiden päivityksen hoitamiseksi.
func UpdateOidsAndTableNamesWithBridge() error {
	return gt_3_table_update.UpdateOidsAndTableNames(
		backend.Db,
		gt_3_table_delete.DeleteRemovedTables, // Poistetut taulut
		gt_3_table_create.InsertNewTables,     // Uudet taulut
	)
}
