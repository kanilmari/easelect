// modified_col.go
package gt_2_column_crud

type ModifiedCol struct {
	OriginalName string `json:"original_name"`
	NewName      string `json:"new_name"`
	DataType     string `json:"data_type"`
	Length       *int   `json:"length,omitempty"`
}
