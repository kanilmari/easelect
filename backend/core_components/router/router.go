// router.go
package router

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	openai "easelect/backend/common_components/ai_features"
	"easelect/backend/common_components/refresh_file_structure"
	"easelect/backend/common_components/vanilla_tree"
	backend "easelect/backend/core_components"
	"easelect/backend/core_components/auth"
	devtools "easelect/backend/core_components/dev_tools"
	"easelect/backend/core_components/general_tables"
	"easelect/backend/core_components/general_tables/crud_workflows"
	"easelect/backend/core_components/general_tables/foreign_keys"
	"easelect/backend/core_components/general_tables/gt_1_row_crud/gt_1_row_create"
	"easelect/backend/core_components/general_tables/gt_1_row_crud/gt_1_row_delete"
	"easelect/backend/core_components/general_tables/gt_1_row_crud/gt_1_row_read"
	"easelect/backend/core_components/general_tables/gt_1_row_crud/gt_1_row_update"
	gt_2_column_crud "easelect/backend/core_components/general_tables/gt_2_column_crud"
	"easelect/backend/core_components/general_tables/gt_3_table_crud/gt_3_table_delete"
	"easelect/backend/core_components/general_tables/gt_3_table_crud/gt_3_table_read"
	"easelect/backend/core_components/general_tables/table_folders"
	gt_triggers "easelect/backend/core_components/general_tables/triggers"
	lang "easelect/backend/core_components/lang"
	"easelect/backend/core_components/middlewares"
	e_sessions "easelect/backend/core_components/sessions"

	"github.com/google/uuid"
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
	log.Printf("tablesHandler: käyttäjä pyysi URL: %s", r.URL.String())
	http.ServeFile(w, r, filepath.Join(localFrontendDir, "index.html"))
}

// RegisterRoutes tallentaa reittien määritykset
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
	functionRegisterHandler("/api/reset-session", e_sessions.ResetSessionHandler, "e_sessions.ResetSessionHandler")
	functionRegisterHandler("/api/auth-modes", auth.GetAuthModesHandler, "auth.GetAuthModesHandler")
	functionRegisterHandler("/register_ndYOyXV0INOK3F", auth.RegisterHandler, "auth.RegisterHandler")
	functionRegisterHandler("/api/update-folder", table_folders.HandleUpdateFolder, "table_folders.HandleUpdateFolder")

	// --- DevTools-reitit ---
	functionRegisterHandler("/api/sessioninfo", devtools.SessionHandler, "devtools.SessionHandler")

	// --- Access-kontrolloidut reitit ---
	// general_tables -kutsut aakkosjärjestyksessä
	functionRegisterHandler("/add_foreign_key", foreign_keys.AddForeignKeyHandler, "foreign_keys.AddForeignKeyHandler")
	functionRegisterHandler("/api/table-names", foreign_keys.GetTableNamesHandler, "foreign_keys.GetTableNamesHandler")
	functionRegisterHandler("/api/table_permissions", general_tables.PermissionsHandler, "general_tables.PermissionsHandler")
	functionRegisterHandler("/api/tables", general_tables.GetGroupedTables, "general_tables.GetGroupedTables")
	functionRegisterHandler("/delete_foreign_key", foreign_keys.DeleteForeignKeyHandler, "foreign_keys.DeleteForeignKeyHandler")
	functionRegisterHandler("/foreign_keys", foreign_keys.GetForeignKeys, "foreign_keys.GetForeignKeys")
	functionRegisterHandler("/update-oids", general_tables.HandleUpdateOidsAndTableNames, "general_tables.HandleUpdateOidsAndTableNames")

	// järjestetään reitit, joita add_row.js kutsuu:
	// --------------------------------------------------------------
	// router.go: Reitit (JS add_row.js)...
	functionRegisterHandler("/api/get-columns", gt_1_row_create.GetAddRowColumnsHandlerWrapper, "gt_1_row_create.GetAddRowColumnsHandlerWrapper")
	functionRegisterHandler("/api/get-1m-relations", gt_1_row_create.GetOneToManyRelationsHandlerWrapper, "gt_1_row_create.GetOneToManyRelationsHandlerWrapper")
	functionRegisterHandler("/api/get-many-to-many", gt_1_row_create.GetManyToManyTablesHandlerWrapper, "gt_1_row_create.GetManyToManyTablesHandlerWrapper")
	functionRegisterHandler("/referenced-data", gt_1_row_create.GetReferencedTableData, "gt_1_row_create.GetReferencedTableData")
	functionRegisterHandler("/api/add-row-multipart", gt_1_row_create.AddRowMultipartHandlerWrapper, "gt_1_row_create.AddRowMultipartHandlerWrapper")
	//get-add-row-metadata
	functionRegisterHandler("/api/get-add-row-metadata", gt_1_row_create.GetAddRowMetadataHandlerWrapper, "gt_1_row_create.GetAddRowMetadataHandlerWrapper")

	functionRegisterHandler("/api/geocode-address", gt_1_row_create.GeocodeAddressHandler, "gt_1_row_create.GeocodeAddressHandler")
	// --------------------------------------------------------------

	// gt_-funktiot aakkosjärjestyksessä (muu sisältö)
	functionRegisterHandler("/api/delete-rows", gt_1_row_delete.DeleteRowsHandlerWrapper, "gt_1_row_delete.DeleteRowsHandlerWrapper")
	functionRegisterHandler("/api/drop-table", gt_3_table_delete.DropTableHandler, "gt_3_table_delete.DropTableHandler")
	functionRegisterHandler("/api/fetch-dynamic-children", gt_1_row_read.GetDynamicChildItemsHandler, "gt_1_row_read.GetDynamicChildItemsHandler")
	functionRegisterHandler("/api/get-metadata", gt_3_table_read.GetTableViewHandlerWrapper, "gt_3_table_read.GetTableViewHandlerWrapper")
	functionRegisterHandler("/api/get-results", gt_1_row_read.GetResultsHandlerWrapper, "gt_1_row_read.GetResultsHandlerWrapper")
	functionRegisterHandler("/api/get-results-vector", gt_1_row_read.GetResultsVector, "gt_1_row_read.GetResultsVector")
	functionRegisterHandler("/api/get-row-count", gt_1_row_read.GetRowCountHandlerWrapper, "gt_1_row_read.GetRowCountHandlerWrapper")
	functionRegisterHandler("/api/system_triggers/create", gt_triggers.CreateTriggerHandler, "gt_triggers.CreateTriggerHandler")
	functionRegisterHandler("/api/system_triggers/list", gt_triggers.GetTriggersHandler, "gt_triggers.GetTriggersHandler")
	functionRegisterHandler("/api/table-columns/", gt_2_column_crud.GetTableColumnsHandler, "gt_2_column_crud.GetTableColumnsHandler")
	functionRegisterHandler("/api/update-row", gt_1_row_update.UpdateRowHandlerWrapper, "gt_1_row_update.UpdateRowHandlerWrapper")

	// Muut reitit aakkosjärjestyksessä
	functionRegisterHandler("/api/modify-columns", crud_workflows.ModifyColumnsHandler, "crud_workflows.ModifyColumnsHandler")
	functionRegisterHandler("/api/refresh_file_structure", refresh_file_structure.RefreshFileStructureHandler, "refresh_file_structure.RefreshFileStructureHandler")
	functionRegisterHandler("/api/translations", lang.GetTranslationsHandler, "lang.GetTranslationsHandler")
	functionRegisterHandler("/api/generateTranslations", lang.GenerateTranslationsHandler, "lang.GenerateTranslationsHandler")
	functionRegisterHandler("/api/tree_data", vanilla_tree.GetTreeDataHandler, "vanilla_tree.GetTreeDataHandler")
	functionRegisterHandler("/create_table", crud_workflows.CreateTableHandler, "crud_workflows.CreateTableHandler")
	functionRegisterHandler("/openai_chat_stream_handler", openai.OpenaiChatStreamHandler, "openai.OpenaiChatStreamHandler")
	functionRegisterHandler("/openai_code_editor_stream_handler", openai.OpenaiCodeEditorStreamHandler, "openai.OpenaiCodeEditorStreamHandler")
	functionRegisterHandler("/openai_embedding_stream_handler", openai.OpenaiEmbeddingStreamHandler, "openai.OpenaiEmbeddingStreamHandler")
	functionRegisterHandler("/save-usergroup-right", backend.SaveUserGroupRight, "backend.SaveUserGroupRight")
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
	// Jos pyyntö on favicon, palvellaan se suoraan
	if r.URL.Path == "/favicon.ico" {
		http.ServeFile(w, r, filepath.Join(localFrontendDir, "favicon.ico"))
		return
	}

	// Salli suoraan JS, CSS, PNG, JPG, ... ilman kirjautumista
	if strings.HasSuffix(r.URL.Path, ".js") ||
		strings.HasSuffix(r.URL.Path, ".css") ||
		strings.HasSuffix(r.URL.Path, ".png") ||
		strings.HasSuffix(r.URL.Path, ".jpg") {
		fs := http.FileServer(http.Dir(localFrontendDir))
		fs.ServeHTTP(w, r)
		return
	}

	// Tarkistetaan asetuksista
	loginToBrowse, err := middlewares.CheckLoginToBrowse()
	if err != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", err.Error())
		// oletuksena pakotetaan kirjautuminen
		loginToBrowse = true
	}

	// Haetaan sessio
	store := e_sessions.GetStore()
	session, sessErr := store.Get(r, "session")
	if sessErr != nil {
		fmt.Printf("\033[31mvirhe: %s\033[0m\n", sessErr.Error())
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	_, onkoKayttaja := session.Values["user_id"]
	if !onkoKayttaja {
		// ei user_id:tä
		if loginToBrowse {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		} else {
			session.Values["user_id"] = 1
		}
	}

	_, castOk := session.Values["user_id"].(int)
	if !castOk {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// Device_id ja fingerprint varmistetaan,
	// jos login_to_browse on false (ja ollaan siis 'guest'-tilassa).
	// Muussa tapauksessa nämä kannattaa hoitaa omassa middleware-funktiossa, jos haluat.
	if !loginToBrowse {
		// Varmista device_id
		cDev, cDevErr := r.Cookie("device_id")
		var deviceID string
		if cDevErr != nil || cDev.Value == "" {
			deviceID = uuid.NewString()
		} else {
			deviceID = cDev.Value
		}
		session.Values["device_id"] = deviceID

		http.SetCookie(w, &http.Cookie{
			Name:     "device_id",
			Value:    deviceID,
			Path:     "/",
			HttpOnly: false,
			Expires:  time.Now().Add(7 * 24 * time.Hour),
		})

		// Varmista fingerprint
		cF, cFErr := r.Cookie("fingerprint")
		var fingerprint string
		if cFErr != nil || cF.Value == "" {
			fingerprint = uuid.NewString()
		} else {
			fingerprint = cF.Value
		}
		session.Values["fingerprint_hash"] = fingerprint

		http.SetCookie(w, &http.Cookie{
			Name:     "fingerprint",
			Value:    fingerprint,
			Path:     "/",
			HttpOnly: false,
			Expires:  time.Now().Add(7 * 24 * time.Hour),
		})

		if errSave := session.Save(r, w); errSave != nil {
			log.Printf("\033[31mvirhe: session tallennus epäonnistui: %s\033[0m\n", errSave.Error())
		}
	}

	// Palvellaan index.html, jos polku on "/"
	if r.URL.Path == "/" {
		http.ServeFile(w, r, filepath.Join(localFrontendDir, "index.html"))
		return
	}

	// Muille poluille staattinen tiedostopalvelu
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

func RegisterAllRoutesAndUpdateFunctions(db *sql.DB) error {
	// Reitit, jotka eivät vaadi kirjautumista EIKÄ oikeustarkistusta
	noAccessControlNeeded := map[string]bool{
		"router.faviconHandler":          true,
		"router.rootHandler":             true,
		"auth.LoginHandler":              true,
		"router.handleFrontend":          true,
		"auth.LogoutHandler":             true,
		"e_sessions.ResetSessionHandler": true,
		"lang.GetTranslationsHandler":    true,
		"devtools.SessionHandler":        true,
	}

	// Reitit, jotka vaativat kirjautumisen,
	// mutta EI function/table-level -tarkistusta
	loginOnlyNeeded := map[string]bool{
		"auth.RegisterHandler": true,
	}

	for _, rd := range routeDefinitions {
		var finalHandler http.HandlerFunc

		switch {
		case noAccessControlNeeded[rd.HandlerName]:
			finalHandler = middlewares.WithUserLogging(rd.HandlerFunc)

		case loginOnlyNeeded[rd.HandlerName]:
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

		// --- LISÄTÄÄN TÄHÄN RATE LIMITING:
		finalHandler = middlewares.WithFunctionRateLimiting(db, rd.HandlerName, finalHandler)

		http.HandleFunc(rd.UrlPattern, finalHandler)
		registeredFunctions[rd.HandlerName] = true
	}

	// Päivitetään *functions*-taulu
	for handlerName := range registeredFunctions {
		packageName := getPackageNameFromHandler(handlerName)

		generalTableRelated := false
		// if packageName == "general_tables" || strings.HasPrefix(packageName, "gt") {
		if strings.HasPrefix(packageName, "gt") {
			generalTableRelated = true
		}

		_, err := db.Exec(`
            INSERT INTO functions (name, "package", disabled, specific_table_related)
            VALUES ($1, $2, false, $3)
            ON CONFLICT (name)
            DO UPDATE 
                SET disabled = false,
                    "package" = EXCLUDED."package",
                    specific_table_related = EXCLUDED.specific_table_related
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
