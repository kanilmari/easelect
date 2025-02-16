// router.go
package router

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"easelect/backend"
	"easelect/backend/auth"
	"easelect/backend/general_tables"
	"easelect/backend/general_tables/gt_crud"
	"easelect/backend/general_tables/gt_crud/gt_create"
	"easelect/backend/general_tables/gt_crud/gt_delete"
	"easelect/backend/general_tables/gt_crud/gt_read"
	"easelect/backend/general_tables/gt_crud/gt_update"
	"easelect/backend/general_tables/table_folders"
	gt_triggers "easelect/backend/general_tables/triggers"
	openai "easelect/backend/logical_components/ai_features"
	"easelect/backend/logical_components/vanilla_tree"
	"easelect/backend/middlewares"
	"easelect/backend/refresh_file_structure"
	e_sessions "easelect/backend/sessions"
)

// localFrontendDir on polku staattisiin tiedostoihin (esim. "./frontend")
var localFrontendDir string

var localMediaDir string

// RouteDefinition edustaa yksittäistä reittiä
type RouteDefinition struct {
	UrlPattern  string
	HandlerFunc http.HandlerFunc
	HandlerName string
}

// routeDefinitions kerää reitit muistiin
var routeDefinitions []RouteDefinition

// registeredFunctions pitää kirjaa funktioista, joita on lopulta rekisteröity
var registeredFunctions = make(map[string]bool)

func tablesHandler(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, filepath.Join(localFrontendDir, "index.html"))
}

// RegisterRoutes tallentaa reittien määritykset.
func RegisterRoutes(frontendDir string, mediaPath string) {
	localFrontendDir = frontendDir

	// Otetaan mediaPath talteen
	localMediaDir = mediaPath

	// Rekisteröidään uusi "ServeMedia" -reitti
	functionRegisterHandler("/media/", ServeMedia, "router.ServeMedia")
	// Talletetaan frontendiä varten
	localFrontendDir = frontendDir

	// Käytetään erillistä functionRegisterHandler-kutsua faviconille
	functionRegisterHandler("/favicon.ico", faviconHandler, "router.faviconHandler")

	functionRegisterHandler("/tables/", tablesHandler, "router.tablesHandler")

	// --- LISÄYS: Uusi reitti /frontend/ ---
	functionRegisterHandler("/frontend/", handleFrontend, "router.handleFrontend") // <-- LISÄYS

	// --- Julkiset reitit ---
	functionRegisterHandler("/", rootHandler, "router.rootHandler")
	functionRegisterHandler("/login", auth.LoginHandler, "auth.LoginHandler")
	functionRegisterHandler("/logout", auth.LogoutHandler, "auth.LogoutHandler")
	functionRegisterHandler("/register_ndYOyXV0INOK3F", auth.RegisterHandler, "auth.RegisterHandler")
	functionRegisterHandler("/api/update-folder", table_folders.HandleUpdateFolder, "table_folders.HandleUpdateFolder")

	// --- Access-kontrolloidut reitit ---
	functionRegisterHandler("/api/tables", general_tables.GetGroupedTables, "general_tables.GetGroupedTables")
	functionRegisterHandler("/api/table-columns/", gt_crud.GetTableColumnsHandler, "gt_crud.GetTableColumnsHandler")
	functionRegisterHandler("/api/table-names", general_tables.GetTableNamesHandler, "general_tables.GetTableNamesHandler")
	functionRegisterHandler("/api/tree_data", vanilla_tree.GetTreeDataHandler, "tree_data.GetTreeDataHandler")
	functionRegisterHandler("/api/system_triggers/list", gt_triggers.GetTriggersHandler, "gt_triggers.GetTriggersHandler")
	functionRegisterHandler("/api/system_triggers/create", gt_triggers.CreateTriggerHandler, "gt_triggers.CreateTriggerHandler")
	functionRegisterHandler("/api/table_permissions", general_tables.PermissionsHandler, "general_tables.PermissionsHandler")
	functionRegisterHandler("/api/modify-columns", general_tables.ModifyColumnsHandler, "general_tables.ModifyColumnsHandler")

	// --- OpenAI chat endpoint (päivitetty) ---
	// functionRegisterHandler("/openai_chat_sql_handler", openai.OpenAIChatSQLHandler, "openai.OpenAIChatSQLHandler")
	// functionRegisterHandler("/api/execute_gpt_sql", openai.ExecuteGPTSQLHandler, "openai.ExecuteGPTSQLHandler")

	// CRUD
	functionRegisterHandler("/api/get-row-count", gt_read.GetRowCountHandlerWrapper, "gt_read.GetRowCountHandlerWrapper")

	// SSE-stream reitti
	functionRegisterHandler("/openai_chat_stream_handler", openai.OpenAIChatStreamHandler, "openai.OpenAIChatStreamHandler")
	functionRegisterHandler("/openai_code_editor_stream_handler", openai.OpenAICodeEditorStreamHandler, "openai.OpenAICodeEditorStreamHandler")
	functionRegisterHandler("/openai_embedding_stream_handler", openai.OpenAIEmbeddingStreamHandler, "openai.OpenAIEmbeddingStreamHandler")
	functionRegisterHandler("/api/get-results-vector", gt_read.GetResultsVector, "gt_read.GetResultsVector")

	functionRegisterHandler("/api/refresh_file_structure", refresh_file_structure.RefreshFileStructureHandler, "refresh_file_structure.RefreshFileStructureHandler")

	functionRegisterHandler("/api/add-row", gt_create.AddRowHandlerWrapper, "gt_create.AddRowHandlerWrapper")
	functionRegisterHandler("/api/get-results", gt_read.GetResultsHandlerWrapper, "gt_read.GetResultsHandlerWrapper")
	functionRegisterHandler("/api/fetch-dynamic-children", gt_read.GetDynamicChildItemsHandler, "gt_read.GetChildItemsHandler")
	functionRegisterHandler("/api/update-row", gt_update.UpdateRowHandlerWrapper, "gt_update.UpdateRowHandlerWrapper")
	functionRegisterHandler("/api/delete-rows", gt_delete.DeleteRowsHandlerWrapper, "gt_delete.DeleteRowsHandlerWrapper")
	functionRegisterHandler("/api/get-columns", gt_create.GetAddRowColumnsHandlerWrapper, "gt_create.GetAddRowColumnsHandlerWrapper")

	// Foreign key -reitit
	functionRegisterHandler("/add_foreign_key", general_tables.AddForeignKeyHandler, "general_tables.AddForeignKeyHandler")
	functionRegisterHandler("/referenced-data", gt_create.GetReferencedTableData, "gt_create.GetReferencedTableData")
	functionRegisterHandler("/foreign_keys", general_tables.GetForeignKeys, "general_tables.GetForeignKeys")
	functionRegisterHandler("/delete_foreign_key", general_tables.DeleteForeignKeyHandler, "general_tables.DeleteForeignKeyHandler")

	// Muita
	functionRegisterHandler("/tables/system_db_tables/update_column_order", general_tables.UpdateColumnOrderHandler, "general_tables.UpdateColumnOrderHandler")
	functionRegisterHandler("/save-usergroup-right", backend.SaveUserGroupRight, "backend.SaveUserGroupRight")
	functionRegisterHandler("/create_table", general_tables.CreateTableHandler, "general_tables.CreateTableHandler")
	functionRegisterHandler("/update-oids", general_tables.HandleUpdateOidsAndTableNames, "general_tables.HandleUpdateOidsAndTableNames")
	functionRegisterHandler("/api/table-default-sort-column/", general_tables.GetTableDefaultSortColumnHandler, "general_tables.GetTableDefaultSortColumnHandler")
	functionRegisterHandler("/api/drop-table", general_tables.DropTableHandler, "general_tables.DropTableHandler")
	functionRegisterHandler("/api/translations", vanilla_tree.GetTranslationsHandler, "tree_data.GetTranslationsHandler")
}

// faviconHandler palvelee tiedoston "/favicon.ico"
func faviconHandler(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, filepath.Join(localFrontendDir, "favicon.ico"))
}

// ServeMedia palvelee /media/ -pyynnöt, mutta kulkee middlewaresin kautta
func ServeMedia(w http.ResponseWriter, r *http.Request) {
	// Otetaan tiedoston polku pyyntöosoitteesta
	relativePath := strings.TrimPrefix(r.URL.Path, "/media/")
	if relativePath == "" {
		http.Error(w, "tiedostonnimi puuttuu", http.StatusBadRequest)
		return
	}

	fullPath := filepath.Join(localMediaDir, relativePath)

	if strings.Contains(relativePath, "..") {
		log.Printf("ServeMedia: hylätään polku (sisälsi '..'): %s", relativePath)
		http.Error(w, "403 - Forbidden", http.StatusForbidden)
		return
	}

	http.ServeFile(w, r, fullPath)
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	// Jos pyyntö on favicon, palvellaan se heti
	if r.URL.Path == "/favicon.ico" {
		http.ServeFile(w, r, filepath.Join(localFrontendDir, "favicon.ico"))
		return
	}

	// Salli suoraan JS, CSS, PNG, yms. ilman kirjautumista
	if strings.HasSuffix(r.URL.Path, ".js") ||
		strings.HasSuffix(r.URL.Path, ".css") ||
		strings.HasSuffix(r.URL.Path, ".png") ||
		strings.HasSuffix(r.URL.Path, ".jpg") {
		fs := http.FileServer(http.Dir(localFrontendDir))
		fs.ServeHTTP(w, r)
		return
	}

	// Muut pyynnöt tarkistetaan, onko kirjautunut
	store := e_sessions.GetStore()
	session, err := store.Get(r, "session")
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	_, ok := session.Values["user_id"]
	if !ok {
		// Jos ei kirjautunut -> login
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// Kirjautunut -> jos pyyntö on "/", palvellaan index.html
	if r.URL.Path == "/" {
		http.ServeFile(w, r, filepath.Join(localFrontendDir, "index.html"))
		return
	}

	// Muut polut -> staattiset tiedostot
	fs := http.FileServer(http.Dir(localFrontendDir))
	fs.ServeHTTP(w, r)
}

// --- LISÄYS: handleFrontend-funktio, joka palvelee /frontend/... -polut
func handleFrontend(w http.ResponseWriter, r *http.Request) {
	// Varmistetaan, ettei pyydetty /frontend/-juurta suoraan
	if r.URL.Path == "/frontend/" {
		http.Error(w, "missing file name", http.StatusNotFound)
		return
	}
	// Palvelen tiedostot poistamalla "/frontend/"-prefiksin
	strip := http.StripPrefix("/frontend/", http.FileServer(http.Dir(localFrontendDir)))
	strip.ServeHTTP(w, r)
}

// functionRegisterHandler lisää reittitietueen muistiin (EI tee http.HandleFunc vielä)
func functionRegisterHandler(urlPattern string, handlerFunc http.HandlerFunc, handlerName string) {
	routeDefinitions = append(routeDefinitions, RouteDefinition{
		UrlPattern:  urlPattern,
		HandlerFunc: handlerFunc,
		HandlerName: handlerName,
	})
}

// RegisterAllRoutesAndUpdateFunctions tekee varsinaiset http.HandleFunc-kytkennät
func RegisterAllRoutesAndUpdateFunctions(db *sql.DB) error {
	// Reitit, jotka eivät vaadi kirjautumista EIKÄ oikeustarkistusta
	noAccessControlNeeded := map[string]bool{
		"router.faviconHandler": true,
		"router.rootHandler":    true,
		"auth.LoginHandler":     true,
		// --- LISÄYS: handleFrontend sallitaan aina, jotta .js/.css jne. toimivat ---
		"router.handleFrontend": true, // <-- LISÄYS
	}

	// Reitit, jotka vaativat kirjautumisen,
	// mutta EI function/table-level -tarkistusta
	loginOnlyNeeded := map[string]bool{
		"auth.RegisterHandler":                               true,
		"router.ServeMedia":                                  true,
		"auth.LogoutHandler":                                 true,
		"tree_data.GetTreeDataHandler":                       true,
		"tree_data.GetTranslationsHandler":                   true,
		"table_folders.HandleUpdateFolder":                   true,
		"openai.ExecuteGPTSQLHandler":                        true,
		"openai.OpenAICodeEditorStreamHandler":               true,
		"openai.OpenAIChatStreamHandler":                     true,
		"openai.OpenAIEmbeddingStreamHandler":                true,
		"gt_read.GetResultsVector":                           true,
		"refresh_file_structure.RefreshFileStructureHandler": true,
		"gt_read.GetDynamicChildItemsHandler":                true,
		"router.tablesHandler":                               true,
	}

	for _, rd := range routeDefinitions {
		var finalHandler http.HandlerFunc

		switch {
		case noAccessControlNeeded[rd.HandlerName]:
			// Pelkkä lokitus
			finalHandler = middlewares.WithUserLogging(rd.HandlerFunc)

		case loginOnlyNeeded[rd.HandlerName]:
			// Käyttäjän pitää olla kirjautuneena,
			// haluamme myös sormenjälkitarkistuksen
			finalHandler = middlewares.WithUserLogging(
				middlewares.WithLoginCheck(
					middlewares.WithFingerprintCheck(
						middlewares.WithDeviceIDCheck(rd.HandlerFunc),
					),
				),
			)

		default:
			// Täysi AccessControl + laitetarkistus + sormenjälkitarkistukset + lokitus
			finalHandler = middlewares.WithUserLogging(
				middlewares.WithAccessControl(
					rd.HandlerName,
					middlewares.WithFingerprintCheck(
						middlewares.WithDeviceIDCheck(rd.HandlerFunc),
					),
				),
			)
		}

		http.HandleFunc(rd.UrlPattern, finalHandler)
		registeredFunctions[rd.HandlerName] = true
	}

	// Päivitetään *functions*-taulu
	for handlerName := range registeredFunctions {
		packageName := getPackageNameFromHandler(handlerName)

		generalTableRelated := false
		if packageName == "general_tables" || strings.HasPrefix(packageName, "gt") {
			generalTableRelated = true
		}

		_, err := db.Exec(`
            INSERT INTO functions (name, "package", disabled, general_table_related)
            VALUES ($1, $2, false, $3)
            ON CONFLICT (name)
            DO UPDATE 
                SET disabled = false,
                    "package" = EXCLUDED."package",
                    general_table_related = EXCLUDED.general_table_related
        `, handlerName, packageName, generalTableRelated)
		if err != nil {
			log.Printf("virhe tallennettaessa funktiota %s: %v", handlerName, err)
		}
	}

	return nil
}

// SyncFunctions merkitsee disabled=true niille funktioille, joita ei käytetty
func SyncFunctions(db *sql.DB) error {
	rows, err := db.Query(`SELECT name FROM functions WHERE disabled = false`)
	if err != nil {
		return fmt.Errorf("virhe luettaessa functions-taulua: %w", err)
	}
	defer rows.Close()

	var dbFuncs []string
	for rows.Next() {
		var fname string
		if err := rows.Scan(&fname); err != nil {
			return err
		}
		dbFuncs = append(dbFuncs, fname)
	}

	for _, dbf := range dbFuncs {
		if !registeredFunctions[dbf] {
			_, err := db.Exec(`UPDATE functions SET disabled = true WHERE name = $1`, dbf)
			if err != nil {
				log.Printf("virhe merkittäessä funktiota %s disabled=true: %v", dbf, err)
			} else {
				log.Printf("funktio %s merkitty disabled=true", dbf)
			}
		}
	}

	return nil
}

// Pilkotaan esim. "tree_data.GetTreeDataHandler" -> "tree_data"
func getPackageNameFromHandler(handlerName string) string {
	parts := strings.Split(handlerName, ".")
	if len(parts) > 1 {
		return parts[0]
	}
	return "default"
}

// // router.go
// package router

// import (
// 	"database/sql"
// 	"fmt"
// 	"log"
// 	"net/http"
// 	"path/filepath"
// 	"strings"

// 	"easelect/backend"
// 	"easelect/backend/auth"
// 	"easelect/backend/general_tables"
// 	"easelect/backend/general_tables/gt_crud"
// 	"easelect/backend/general_tables/gt_crud/gt_create"
// 	"easelect/backend/general_tables/gt_crud/gt_delete"
// 	"easelect/backend/general_tables/gt_crud/gt_read"
// 	"easelect/backend/general_tables/gt_crud/gt_update"
// 	"easelect/backend/general_tables/table_folders"
// 	gt_triggers "easelect/backend/general_tables/triggers"
// 	"easelect/backend/middlewares"
// 	"easelect/backend/openai"
// 	"easelect/backend/refresh_file_structure"
// 	e_sessions "easelect/backend/sessions"
// 	"easelect/backend/vanilla_tree"
// )

// // localFrontendDir on polku staattisiin tiedostoihin (esim. "./frontend")
// var localFrontendDir string

// var localMediaDir string

// // RouteDefinition edustaa yksittäistä reittiä
// type RouteDefinition struct {
// 	UrlPattern  string
// 	HandlerFunc http.HandlerFunc
// 	HandlerName string
// }

// // routeDefinitions kerää reitit muistiin
// var routeDefinitions []RouteDefinition

// // registeredFunctions pitää kirjaa funktioista, joita on lopulta rekisteröity
// var registeredFunctions = make(map[string]bool)

// func tablesHandler(w http.ResponseWriter, r *http.Request) {
// 	http.ServeFile(w, r, filepath.Join(localFrontendDir, "index.html"))
// }

// // RegisterRoutes tallentaa reittien määritykset.
// func RegisterRoutes(frontendDir string, mediaPath string) {
// 	localFrontendDir = frontendDir

// 	// Otetaan mediaPath talteen
// 	localMediaDir = mediaPath

// 	// Rekisteröidään uusi "ServeMedia" -reitti
// 	functionRegisterHandler("/media/", ServeMedia, "router.ServeMedia")
// 	// Talletetaan frontendiä varten
// 	localFrontendDir = frontendDir

// 	// Käytetään erillistä functionRegisterHandler-kutsua faviconille
// 	functionRegisterHandler("/favicon.ico", faviconHandler, "router.faviconHandler")

// 	functionRegisterHandler("/tables/", tablesHandler, "router.tablesHandler")

// 	// --- Julkiset reitit ---
// 	functionRegisterHandler("/", rootHandler, "router.rootHandler")
// 	functionRegisterHandler("/login", auth.LoginHandler, "auth.LoginHandler")
// 	functionRegisterHandler("/logout", auth.LogoutHandler, "auth.LogoutHandler")
// 	functionRegisterHandler("/register_ndYOyXV0INOK3F", auth.RegisterHandler, "auth.RegisterHandler")
// 	functionRegisterHandler("/api/update-folder", table_folders.HandleUpdateFolder, "table_folders.HandleUpdateFolder")

// 	// --- Access-kontrolloidut reitit ---
// 	functionRegisterHandler("/api/tables", general_tables.GetGroupedTables, "general_tables.GetGroupedTables")
// 	functionRegisterHandler("/api/table-columns/", gt_crud.GetTableColumnsHandler, "gt_crud.GetTableColumnsHandler")
// 	functionRegisterHandler("/api/table-names", general_tables.GetTableNamesHandler, "general_tables.GetTableNamesHandler")
// 	functionRegisterHandler("/api/tree_data", vanilla_tree.GetTreeDataHandler, "tree_data.GetTreeDataHandler")
// 	functionRegisterHandler("/api/system_triggers/list", gt_triggers.GetTriggersHandler, "gt_triggers.GetTriggersHandler")
// 	functionRegisterHandler("/api/system_triggers/create", gt_triggers.CreateTriggerHandler, "gt_triggers.CreateTriggerHandler")
// 	functionRegisterHandler("/api/table_permissions", general_tables.PermissionsHandler, "general_tables.PermissionsHandler")
// 	functionRegisterHandler("/api/modify-columns", general_tables.ModifyColumnsHandler, "general_tables.ModifyColumnsHandler")

// 	// --- OpenAI chat endpoint (päivitetty) ---
// 	// functionRegisterHandler("/openai_chat_sql_handler", openai.OpenAIChatSQLHandler, "openai.OpenAIChatSQLHandler")
// 	// functionRegisterHandler("/api/execute_gpt_sql", openai.ExecuteGPTSQLHandler, "openai.ExecuteGPTSQLHandler")

// 	// CRUD
// 	functionRegisterHandler("/api/get-row-count", gt_read.GetRowCountHandlerWrapper, "gt_read.GetRowCountHandlerWrapper")

// 	// SSE-stream reitti
// 	functionRegisterHandler("/openai_chat_stream_handler", openai.OpenAIChatStreamHandler, "openai.OpenAIChatStreamHandler")
// 	functionRegisterHandler("/openai_code_editor_stream_handler", openai.OpenAICodeEditorStreamHandler, "openai.OpenAICodeEditorStreamHandler")
// 	functionRegisterHandler("/openai_embedding_stream_handler", openai.OpenAIEmbeddingStreamHandler, "openai.OpenAIEmbeddingStreamHandler")
// 	functionRegisterHandler("/api/get-results-vector", gt_read.GetResultsVector, "gt_read.GetResultsVector")

// 	functionRegisterHandler("/api/refresh_file_structure", refresh_file_structure.RefreshFileStructureHandler, "refresh_file_structure.RefreshFileStructureHandler")

// 	functionRegisterHandler("/api/add-row", gt_create.AddRowHandlerWrapper, "gt_create.AddRowHandlerWrapper")
// 	functionRegisterHandler("/api/get-results", gt_read.GetResultsHandlerWrapper, "gt_read.GetResultsHandlerWrapper")
// 	functionRegisterHandler("/api/fetch-dynamic-children", gt_read.GetDynamicChildItemsHandler, "gt_read.GetChildItemsHandler")
// 	functionRegisterHandler("/api/update-row", gt_update.UpdateRowHandlerWrapper, "gt_update.UpdateRowHandlerWrapper")
// 	functionRegisterHandler("/api/delete-rows", gt_delete.DeleteRowsHandlerWrapper, "gt_delete.DeleteRowsHandlerWrapper")
// 	functionRegisterHandler("/api/get-columns", gt_create.GetAddRowColumnsHandlerWrapper, "gt_create.GetAddRowColumnsHandlerWrapper")

// 	// Foreign key -reitit
// 	functionRegisterHandler("/add_foreign_key", general_tables.AddForeignKeyHandler, "general_tables.AddForeignKeyHandler")
// 	functionRegisterHandler("/referenced-data", gt_create.GetReferencedTableData, "gt_create.GetReferencedTableData")
// 	functionRegisterHandler("/foreign_keys", general_tables.GetForeignKeys, "general_tables.GetForeignKeys")
// 	functionRegisterHandler("/delete_foreign_key", general_tables.DeleteForeignKeyHandler, "general_tables.DeleteForeignKeyHandler")

// 	// Muita
// 	functionRegisterHandler("/tables/system_db_tables/update_column_order", general_tables.UpdateColumnOrderHandler, "general_tables.UpdateColumnOrderHandler")
// 	functionRegisterHandler("/save-usergroup-right", backend.SaveUserGroupRight, "backend.SaveUserGroupRight")
// 	functionRegisterHandler("/create_table", general_tables.CreateTableHandler, "general_tables.CreateTableHandler")
// 	functionRegisterHandler("/update-oids", general_tables.HandleUpdateOidsAndTableNames, "general_tables.HandleUpdateOidsAndTableNames")
// 	functionRegisterHandler("/api/table-default-sort-column/", general_tables.GetTableDefaultSortColumnHandler, "general_tables.GetTableDefaultSortColumnHandler")
// 	functionRegisterHandler("/api/drop-table", general_tables.DropTableHandler, "general_tables.DropTableHandler")
// 	functionRegisterHandler("/api/translations", vanilla_tree.GetTranslationsHandler, "tree_data.GetTranslationsHandler")
// }

// // faviconHandler palvelee tiedoston "/favicon.ico"
// // Tämän reitin "handlerName" lisätään noAccessControlNeeded-listaan,
// // jotta se ei vaadi sisäänkirjautumista.
// func faviconHandler(w http.ResponseWriter, r *http.Request) {
// 	http.ServeFile(w, r, filepath.Join(localFrontendDir, "favicon.ico"))
// }

// // ServeMedia palvelee /media/ -pyynnöt, mutta kulkee middlewaresin kautta
// func ServeMedia(w http.ResponseWriter, r *http.Request) {
// 	// Otetaan tiedoston polku pyyntöosoitteesta
// 	relativePath := strings.TrimPrefix(r.URL.Path, "/media/")
// 	if relativePath == "" {
// 		http.Error(w, "tiedostonnimi puuttuu", http.StatusBadRequest)
// 		return
// 	}

// 	fullPath := filepath.Join(localMediaDir, relativePath)

// 	// Halutessasi voit lisätä turvatarkistuksia, esim. estää polun ".." -> polkuhyppy
// 	if strings.Contains(relativePath, "..") {
// 		log.Printf("ServeMedia: hylätään polku (sisälsi '..'): %s", relativePath)
// 		http.Error(w, "403 - Forbidden", http.StatusForbidden)
// 		return
// 	}

// 	// Tarjoillaan tiedosto
// 	http.ServeFile(w, r, fullPath)
// }

// func rootHandler(w http.ResponseWriter, r *http.Request) {
// 	// Jos pyyntö on favicon, palvellaan se heti
// 	if r.URL.Path == "/favicon.ico" {
// 		http.ServeFile(w, r, filepath.Join(localFrontendDir, "favicon.ico"))
// 		return
// 	}

// 	// Salli suoraan JS, CSS, PNG, yms. ilman kirjautumista
// 	if strings.HasSuffix(r.URL.Path, ".js") ||
// 		strings.HasSuffix(r.URL.Path, ".css") ||
// 		strings.HasSuffix(r.URL.Path, ".png") ||
// 		strings.HasSuffix(r.URL.Path, ".jpg") {
// 		fs := http.FileServer(http.Dir(localFrontendDir))
// 		fs.ServeHTTP(w, r)
// 		return
// 	}

// 	// Muut pyynnöt tarkistetaan, onko kirjautunut
// 	store := e_sessions.GetStore()
// 	session, err := store.Get(r, "session")
// 	if err != nil {
// 		http.Redirect(w, r, "/login", http.StatusSeeOther)
// 		return
// 	}

// 	_, ok := session.Values["user_id"]
// 	if !ok {
// 		// Jos ei kirjautunut -> login
// 		http.Redirect(w, r, "/login", http.StatusSeeOther)
// 		return
// 	}

// 	// Kirjautunut -> jos pyyntö on "/", palvellaan index.html
// 	if r.URL.Path == "/" {
// 		http.ServeFile(w, r, filepath.Join(localFrontendDir, "index.html"))
// 		return
// 	}

// 	// Muut polut -> staattiset tiedostot
// 	fs := http.FileServer(http.Dir(localFrontendDir))
// 	fs.ServeHTTP(w, r)
// }

// // functionRegisterHandler lisää reittitietueen muistiin (EI tee http.HandleFunc vielä)
// func functionRegisterHandler(urlPattern string, handlerFunc http.HandlerFunc, handlerName string) {
// 	routeDefinitions = append(routeDefinitions, RouteDefinition{
// 		UrlPattern:  urlPattern,
// 		HandlerFunc: handlerFunc,
// 		HandlerName: handlerName,
// 	})
// }

// // RegisterAllRoutesAndUpdateFunctions tekee varsinaiset http.HandleFunc-kytkennät
// // ja päivittää functions-taulun
// func RegisterAllRoutesAndUpdateFunctions(db *sql.DB) error {
// 	// Reitit, jotka eivät vaadi kirjautumista EIKÄ oikeustarkistusta
// 	noAccessControlNeeded := map[string]bool{
// 		"router.faviconHandler": true,
// 		"router.rootHandler":    true,
// 		"auth.LoginHandler":     true,
// 	}

// 	// Reitit, jotka vaativat kirjautumisen,
// 	// mutta EI function/table-level -tarkistusta
// 	loginOnlyNeeded := map[string]bool{
// 		"auth.RegisterHandler":                               true,
// 		"router.ServeMedia":                                  true,
// 		"auth.LogoutHandler":                                 true,
// 		"tree_data.GetTreeDataHandler":                       true,
// 		"tree_data.GetTranslationsHandler":                   true,
// 		"table_folders.HandleUpdateFolder":                   true,
// 		"openai.ExecuteGPTSQLHandler":                        true,
// 		"openai.OpenAICodeEditorStreamHandler":               true,
// 		"openai.OpenAIChatStreamHandler":                     true,
// 		"openai.OpenAIEmbeddingStreamHandler":                true,
// 		"gt_read.GetResultsVector":                           true,
// 		"refresh_file_structure.RefreshFileStructureHandler": true,
// 		"gt_read.GetDynamicChildItemsHandler":                true,
// 		"router.tablesHandler":                               true,
// 	}

// 	for _, rd := range routeDefinitions {
// 		var finalHandler http.HandlerFunc

// 		switch {
// 		case noAccessControlNeeded[rd.HandlerName]:
// 			// Pelkkä lokitus
// 			finalHandler = middlewares.WithUserLogging(rd.HandlerFunc)

// 		case loginOnlyNeeded[rd.HandlerName]:
// 			// Käyttäjän pitää olla kirjautuneena,
// 			// haluamme myös sormenjälkitarkistuksen
// 			finalHandler = middlewares.WithUserLogging(
// 				middlewares.WithLoginCheck(
// 					middlewares.WithFingerprintCheck(
// 						middlewares.WithDeviceIDCheck(rd.HandlerFunc),
// 					),
// 				),
// 			)

// 		default:
// 			// Täysi AccessControl + laitetarkistus + sormenjälkitarkistus + lokitus
// 			finalHandler = middlewares.WithUserLogging(
// 				middlewares.WithAccessControl(
// 					rd.HandlerName,
// 					middlewares.WithFingerprintCheck(
// 						middlewares.WithDeviceIDCheck(rd.HandlerFunc),
// 					),
// 				),
// 			)
// 		}

// 		http.HandleFunc(rd.UrlPattern, finalHandler)
// 		registeredFunctions[rd.HandlerName] = true
// 	}

// 	// Päivitetään *functions*-taulu
// 	for handlerName := range registeredFunctions {
// 		packageName := getPackageNameFromHandler(handlerName)

// 		// Tarkistetaan onko paketin nimen alussa "gt" (kuten gt_crud) TAI onko se "general_tables"
// 		generalTableRelated := false
// 		if packageName == "general_tables" || strings.HasPrefix(packageName, "gt") {
// 			generalTableRelated = true
// 		}

// 		_, err := db.Exec(`
//             INSERT INTO functions (name, "package", disabled, general_table_related)
//             VALUES ($1, $2, false, $3)
//             ON CONFLICT (name)
//             DO UPDATE
//                 SET disabled = false,
//                     "package" = EXCLUDED."package",
//                     general_table_related = EXCLUDED.general_table_related
//         `, handlerName, packageName, generalTableRelated)
// 		if err != nil {
// 			log.Printf("virhe tallennettaessa funktiota %s: %v", handlerName, err)
// 		}
// 	}

// 	return nil
// }

// // SyncFunctions merkitsee disabled=true niille funktioille, joita ei käytetty
// func SyncFunctions(db *sql.DB) error {
// 	rows, err := db.Query(`SELECT name FROM functions WHERE disabled = false`)
// 	if err != nil {
// 		return fmt.Errorf("virhe luettaessa functions-taulua: %w", err)
// 	}
// 	defer rows.Close()

// 	var dbFuncs []string
// 	for rows.Next() {
// 		var fname string
// 		if err := rows.Scan(&fname); err != nil {
// 			return err
// 		}
// 		dbFuncs = append(dbFuncs, fname)
// 	}

// 	for _, dbf := range dbFuncs {
// 		if !registeredFunctions[dbf] {
// 			// Merkitään pois käytöstä
// 			_, err := db.Exec(`UPDATE functions SET disabled = true WHERE name = $1`, dbf)
// 			if err != nil {
// 				log.Printf("virhe merkittäessä funktiota %s disabled=true: %v", dbf, err)
// 			} else {
// 				log.Printf("funktio %s merkitty disabled=true", dbf)
// 			}
// 		}
// 	}

// 	return nil
// }

// // Pilkotaan esim. "tree_data.GetTreeDataHandler" -> "tree_data"
// func getPackageNameFromHandler(handlerName string) string {
// 	parts := strings.Split(handlerName, ".")
// 	if len(parts) > 1 {
// 		return parts[0]
// 	}
// 	return "default"
// }
