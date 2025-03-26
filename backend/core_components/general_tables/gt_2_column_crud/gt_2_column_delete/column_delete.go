// column_delete.go
package gt_2_column_delete

import (
	"database/sql"
	"easelect/backend/core_components/security"
	"fmt"
)

func RemoveColumns(tx *sql.Tx, sanitizedTableName string, removedCols []string) error {
	fmt.Println("Poistetaan sarakkeita (jos on):", removedCols)
	for _, col := range removedCols {
		sCol, err2 := security.SanitizeIdentifier(col)
		if err2 != nil {
			return err2
		}
		dropStmt := fmt.Sprintf("ALTER TABLE %s DROP COLUMN %s", sanitizedTableName, sCol)
		fmt.Println("Suoritetaan:", dropStmt)
		_, err2 = tx.Exec(dropStmt)
		if err2 != nil {
			fmt.Println("Virhe poistettaessa saraketta:", err2)
			return err2
		}
	}
	return nil
}
