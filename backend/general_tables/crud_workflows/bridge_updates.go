// crud_workflows/bridge_updates.go
package crud_workflows

import (
	"database/sql"

	"easelect/backend/general_tables/gt_2_column_crud"
	"easelect/backend/general_tables/gt_2_column_crud/gt_2_column_read"
	"easelect/backend/general_tables/gt_2_column_crud/gt_2_column_update"
	"easelect/backend/general_tables/gt_3_table_crud/gt_3_table_create"
	"easelect/backend/general_tables/gt_3_table_crud/gt_3_table_delete"
	"easelect/backend/general_tables/gt_3_table_crud/gt_3_table_update"
	backend "easelect/backend/main_app"
	"easelect/backend/main_app/security"
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
		func() error {
			// Oikea callback UpdateColumnsForExistingTablesWithBridge
			return UpdateColumnsForExistingTablesWithBridge()
		},
	)
}

// UpdateColumnsForExistingTablesWithBridge on bridge-funktio, joka kutsuu
// gt_3_table_update.UpdateColumnsForExistingTables(...) ja siirtää callback-funktiot parametrina.
func UpdateColumnsForExistingTablesWithBridge() error {
	return gt_3_table_update.UpdateColumnsForExistingTables(
		backend.Db,
		gt_2_column_read.GetColumnIDsForTableUID,
		gt_3_table_update.UpdateColDisplayOrder,
	)
}

// UpdateColumnOrderWithBridge
// Sanitizes tableName ja kutsuu gt_3_table_update.UpdateColumnOrder
func UpdateColumnOrderWithBridge(
	tableName string,
	newOrder []int,
) error {
	// Voidaan halutessa validoida tableName täällä:
	sName, err := security.SanitizeIdentifier(tableName)
	if err != nil {
		return err
	}

	return gt_3_table_update.UpdateColumnOrder(
		backend.Db,
		sName,
		newOrder,
	)
}
