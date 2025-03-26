// column_create.go
package gt_2_column_create

import (
	"database/sql"
	"easelect/backend/core_components/general_tables/gt_2_column_crud" // esim. täältä saa ModifiedCol
	security "easelect/backend/core_components/security"
	"fmt"
	"strings"
)

func AddNewColumns(tx *sql.Tx, sanitizedTableName string, addedCols []gt_2_column_crud.ModifiedCol) error {
	fmt.Println("Lisätään uusia sarakkeita (jos on):", addedCols)
	for _, acol := range addedCols {
		fmt.Println("Lisätään sarake:", acol)
		sNewName, err2 := security.SanitizeIdentifier(acol.NewName)
		if err2 != nil {
			return err2
		}

		newType := strings.ToUpper(acol.DataType)
		if newType == "VARCHAR" && acol.Length != nil {
			newType = fmt.Sprintf("VARCHAR(%d)", *acol.Length)
		}

		addStmt := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s",
			sanitizedTableName, sNewName, newType)

		fmt.Println("Suoritetaan:", addStmt)
		_, err2 = tx.Exec(addStmt)
		if err2 != nil {
			fmt.Println("Virhe lisättäessä uutta saraketta:", err2)
			return err2
		}
	}
	return nil
}
