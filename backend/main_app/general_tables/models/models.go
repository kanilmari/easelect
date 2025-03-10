// models.go
package models

import "database/sql"

type Table struct {
	ID        int    `json:"id"`
	TableName string `json:"table_name"`
}

type GroupedTables struct {
	Content []Table `json:"Sisältö,omitempty"`
	Ref     []Table `json:"Aputaulut,omitempty"`
	Child   []Table `json:"Alitaulut,omitempty"`
	System  []Table `json:"Asetukset,omitempty"`
	Auth    []Table `json:"Käyttöoikeudet,omitempty"`
	Dev     []Table `json:"Kehitys,omitempty"`
}

type ColumnInfo struct {
	ColumnUid     int
	ColumnName    string
	DataType      string
	CoNumber      int
	IsNullable    string
	IsIdentity    string
	ColumnDefault sql.NullString
	CardElement   string
	// showKeyOnCard bool
}

// col.AllowFormInsertionOnSource = allowFormInsertionOnSource
// col.InputMethodOnSource = inputMethodOnSource.String

type AddRowColumnInfo struct {
	ColumnName           string `json:"column_name"`
	DataType             string `json:"data_type"`
	IsNullable           string `json:"is_nullable"`
	ColumnDefault        string `json:"column_default"`
	IsIdentity           string `json:"is_identity"`
	GenerationExpression string `json:"generation_expression"`
	ForeignTableSchema   string `json:"foreign_table_schema,omitempty"`
	ForeignTableName     string `json:"foreign_table_name,omitempty"`
	ForeignColumnName    string `json:"foreign_column_name,omitempty"`
	UdtName              string `json:"udt_name"`
	// Poistettu: AllowFormInsertionOnSource sql.NullBool `json:"allow_form_insertion_on_source"`
	// InputMethodOnSource string `json:"input_method_on_source"`
}
