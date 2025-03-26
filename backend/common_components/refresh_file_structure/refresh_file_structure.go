// refresh_file_structure.go
package refresh_file_structure

import (
	"context"
	"crypto/md5"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	backend "easelect/backend/core_components"

	pgvectorgo "github.com/pgvector/pgvector-go"
	"github.com/sashabaranov/go-openai"
)

var base_path string

// Aloitusfunktio, joka asettaa työskentelykansion
func init() {
	working_directory, err := os.Getwd()
	if err != nil {
		log.Fatal("virhe haettaessa työskentelykansiota: ", err)
	}
	base_path = working_directory
	log.Printf("base_path asetettu: %s", base_path)
}

// file_item edustaa file_structure-taulun tietuetta
type file_item struct {
	id            int
	parent_folder string
	name          string
}

func RefreshFileStructureHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("RefreshFileStructureHandler kutsuttu, metodi: %s", r.Method)

	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		http.Error(w, "vain POST tai GET tuettu", http.StatusMethodNotAllowed)
		return
	}

	log.Println("Luodaan/päivitetään file_structure-taulun rakenne tarvittaessa..")
	err := create_file_structure_table_if_not_exists()
	if err != nil {
		log.Printf("virhe taulun luonnissa: %v", err)
		http.Error(w, "virhe taulun luonnissa", http.StatusInternalServerError)
		return
	}
	log.Println("Taulun luonti/päivitys suoritettu.")

	log.Println("Haetaan nykyinen tilanne file_structure-taulusta..")
	existing_items, err := get_current_file_structure()
	if err != nil {
		log.Printf("virhe haettaessa vanhoja rivejä: %v", err)
		http.Error(w, "virhe vanhojen rivejen luvussa", http.StatusInternalServerError)
		return
	}
	log.Printf("Nykyisiä rivejä yhteensä: %d", len(existing_items))

	new_files, changed_files, skipped_files, updated_items, walk_err := walk_and_refresh_file_structure(base_path)
	if walk_err != nil {
		log.Printf("virhe hakemistorakennetta kävellessä: %v", walk_err)
		http.Error(w, "virhe hakemistorakennetta kävellessä", http.StatusInternalServerError)
		return
	}

	// Poistetaan ne rivit tietokannasta, joita ei päivitetty
	var removed_files []string
	for _, old_item := range existing_items {
		combined_key := old_item.parent_folder + "/" + old_item.name
		if !updated_items[combined_key] {
			removed_files = append(removed_files, combined_key)
			del_err := remove_file_row(old_item.id)
			if del_err != nil {
				log.Printf("virhe poistettaessa '%s/%s': %v",
					old_item.parent_folder, old_item.name, del_err)
			}
		}
	}

	// Yhteenvetoloki
	if len(removed_files) > 0 {
		log.Printf("poistetut tiedostot: %d kpl: %s", len(removed_files), strings.Join(removed_files, ", "))
	} else {
		log.Println("poistetut tiedostot: 0 kpl")
	}
	if len(new_files) > 0 {
		log.Printf("uudet tiedostot: %d kpl: %s", len(new_files), strings.Join(new_files, ", "))
	} else {
		log.Println("uudet tiedostot: 0 kpl")
	}
	if len(changed_files) > 0 {
		log.Printf("muuttuneet tiedostot: %d kpl: %s", len(changed_files), strings.Join(changed_files, ", "))
	} else {
		log.Println("muuttuneet tiedostot: 0 kpl")
	}
	if len(skipped_files) > 0 {
		log.Printf("skipatut tiedostot: %d kpl: %s", len(skipped_files), strings.Join(skipped_files, ", "))
	} else {
		log.Println("skipatut tiedostot: 0 kpl")
	}

	log.Println("Hakemistorakenteen päivitys valmis.")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Hakemistorakenteen päivitys onnistui"))
}

func walk_and_refresh_file_structure(base_path string) (
	new_files []string,
	changed_files []string,
	skipped_files []string,
	updated_items map[string]bool,
	walk_err error,
) {
	log.Printf("Aloitetaan hakemistorakenteen läpikäynti polusta: %s", base_path)

	updated_items = make(map[string]bool)

	embedding_count := 0
	const embedding_max = 999

	allowed_extensions := map[string]bool{
		".go":   true,
		".js":   true,
		".html": true,
		".css":  true,
		".json": true,
		".ps1":  true,
		".py":   true,
	}

	var skipAllErr = errors.New("max file limit reached")

	walk_err = filepath.Walk(base_path, func(current_path string, info os.FileInfo, err error) error {
		if err != nil {
			log.Printf("virhe polkua '%s' käveltäessä: %v", current_path, err)
			// odotetaan
			return nil
		}
		if embedding_count >= embedding_max {
			log.Printf("embedding-lukumäärärajoitus %d saavutettu, lopetetaan kävely", embedding_max)
			return skipAllErr
		}

		// Skippaus: kansiot, jotka alkavat pisteellä, sekä tietyt nimet
		if info.IsDir() {
			if strings.HasPrefix(info.Name(), ".") {
				skipped_files = append(skipped_files, info.Name())
				return filepath.SkipDir
			}
			dir_lower := strings.ToLower(info.Name())
			if dir_lower == "old" || dir_lower == "öld" || dir_lower == "others" ||
				dir_lower == "node_modules" || dir_lower == "media" {
				skipped_files = append(skipped_files, info.Name())
				return filepath.SkipDir
			}

			// Sallitaan vain juuritason kansio, 'frontend' ja 'backend'
			if current_path != base_path {
				rel, rel_err := filepath.Rel(base_path, current_path)
				if rel_err == nil {
					parts := strings.Split(rel, string(os.PathSeparator))
					if len(parts) > 0 {
						top := parts[0]
						if top != "frontend" && top != "backend" {
							skipped_files = append(skipped_files, info.Name())
							return filepath.SkipDir
						}
					}
				}
			}
			// Jos ehto läpäistään, jatketaan tämän kansion alikansioihin
			return nil
		}

		// Käsitellään vain tiedostoja
		extension := strings.ToLower(filepath.Ext(info.Name()))
		if !allowed_extensions[extension] {
			skipped_files = append(skipped_files, info.Name())
			return nil
		}

		md5sum, hash_err := compute_md5(current_path)
		if hash_err != nil {
			log.Printf("virhe laskettaessa md5-tarkistetta '%s': %v", current_path, hash_err)
			// odotetaan
			return nil
		}

		relative_path, rel_err := filepath.Rel(base_path, current_path)
		if rel_err != nil {
			relative_path = info.Name()
		}
		parent_folder := filepath.Dir(relative_path)
		name := info.Name()
		size := info.Size()
		is_directory := false
		mime_type := ""

		old_md5, old_err := get_existing_md5(parent_folder, name)
		var is_new_file bool
		var is_changed_file bool
		if old_err == sql.ErrNoRows {
			is_new_file = true
		} else if old_err != nil {
			log.Printf("virhe tarkistettaessa vanhaa md5: %v", old_err)
		} else {
			if old_md5 != md5sum {
				is_changed_file = true
			}
		}

		var embedding_vector pgvectorgo.Vector
		if (is_new_file || is_changed_file) && embedding_count < embedding_max {
			file_content_str, read_err := read_file_content_as_string(current_path)
			if read_err != nil {
				log.Printf("virhe luettaessa tiedostoa '%s' embeddingiä varten: %v", current_path, read_err)
			} else {
				ev, embedding_err := fetch_embedding_from_openai(file_content_str)
				if embedding_err != nil {
					log.Printf("virhe embeddingin haussa '%s': %v", current_path, embedding_err)
				} else {
					embedding_vector = ev
				}
				embedding_count++
			}
		}

		insert_err := insert_or_update_file_row(
			parent_folder,
			name,
			extension,
			size,
			mime_type,
			is_directory,
			md5sum,
			embedding_vector,
		)
		if insert_err != nil {
			log.Printf("virhe tallennettaessa '%s': %v", current_path, insert_err)
		} else {
			combined_key := parent_folder + "/" + name
			if is_new_file {
				new_files = append(new_files, combined_key)
			} else if is_changed_file {
				changed_files = append(changed_files, combined_key)
			}
			updated_items[combined_key] = true
		}

		return nil
	})

	// Jos kävely loppui rajoituksen täytyttyä, se ei ole virhe
	if walk_err == skipAllErr {
		log.Printf("Tiedostorajoitus %d täynnä, kävely päätettiin kesken", embedding_max)
		walk_err = nil
	}

	return new_files, changed_files, skipped_files, updated_items, walk_err
}

// compute_md5 lukee koko tiedoston ja laskee sen MD5-hajautusarvon (heksamerkkijonona).
func compute_md5(file_path string) (string, error) {
	file, err := os.Open(file_path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hasher := md5.New()
	_, copy_err := io.Copy(hasher, file)
	if copy_err != nil {
		return "", copy_err
	}

	return hex.EncodeToString(hasher.Sum(nil)), nil
}

// read_file_content_as_string lukee koko tiedoston merkkijonoksi.
// Voit halutessasi rajata pituutta, jos tiedostot ovat hyvin suuria.
func read_file_content_as_string(file_path string) (string, error) {
	data, err := ioutil.ReadFile(file_path)
	if err != nil {
		return "", err
	}
	// Voit halutessasi rajoittaa pituuden, esim:
	// 	if len(data) > 20000 {
	// 		data = data[:20000]
	// 	}
	return string(data), nil
}

// fetch_embedding_from_openai hakee annetulle tekstisisällölle embeddings
// ja palauttaa sen pgvectorgo.Vector -muodossa.
func fetch_embedding_from_openai(file_content string) (pgvectorgo.Vector, error) {
	openai_key := os.Getenv("OPENAI_API_KEY")
	if openai_key == "" {
		return pgvectorgo.Vector{}, logError("missing OPENAI_API_KEY")
	}
	embedding_model := os.Getenv("OPENAI_EMBEDDING_MODEL")
	if embedding_model == "" {
		embedding_model = "text-embedding-ada-002"
	}

	client := openai.NewClient(openai_key)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := openai.EmbeddingRequest{
		Model: openai.EmbeddingModel(embedding_model),
		Input: []string{file_content},
	}

	resp, err := client.CreateEmbeddings(ctx, req)
	if err != nil {
		return pgvectorgo.Vector{}, logError("openai embedding error: %v", err)
	}
	if len(resp.Data) == 0 {
		return pgvectorgo.Vector{}, logError("empty embedding response")
	}

	embedding_data := resp.Data[0].Embedding
	return pgvectorgo.NewVector(embedding_data), nil
}

// get_existing_md5 hakee kannasta olemassa olevan md5-summan, jos rivi on jo siellä.
func get_existing_md5(parent_folder, name string) (string, error) {
	var old_md5 string
	row := backend.Db.QueryRow(`
		SELECT md5
		FROM file_structure
		WHERE parent_folder = $1
		  AND name = $2
		LIMIT 1
	`, parent_folder, name)

	err := row.Scan(&old_md5)
	return old_md5, err // voi olla sql.ErrNoRows, jos ei löydy
}

// create_file_structure_table_if_not_exists luo taulun ja mahdolliset uudet sarakkeet haluttuun rakenteeseen.
func create_file_structure_table_if_not_exists() error {
	log.Println("Luodaan/varmistetaan file_structure-taulun olemassaolo..")

	_, err := backend.Db.Exec(`
		CREATE TABLE IF NOT EXISTS file_structure (
			id SERIAL PRIMARY KEY,
			created TIMESTAMP NOT NULL DEFAULT NOW(),
			updated TIMESTAMP NOT NULL DEFAULT NOW(),
			parent_folder TEXT NOT NULL,
			extension TEXT,
			size BIGINT,
			mime_type TEXT,
			is_directory BOOLEAN NOT NULL DEFAULT false,
			name TEXT NOT NULL,
			md5 TEXT,
			UNIQUE (parent_folder, name)
		)
	`)
	if err != nil {
		log.Printf("virhe CREATE TABLE -lauseessa: %v", err)
		return err
	}

	// Lisätään openai_embedding -sarake pgvectorgo-tyyppisenä (1536) mikäli sitä ei ole
	_, err = backend.Db.Exec(`
		ALTER TABLE file_structure
		ADD COLUMN IF NOT EXISTS openai_embedding vector(1536)
	`)
	if err != nil {
		log.Printf("virhe ALTER TABLE -lauseessa openai_embedding-sarakkeen luomiseksi: %v", err)
	} else {
		log.Println("openai_embedding-sarake on kunnossa (luotu tai oli jo olemassa).")
	}

	log.Println("Taulu file_structure on kunnossa (luotu tai oli jo olemassa).")
	return err
}

// get_current_file_structure hakee tietokannasta sen hetkiset rivit.
func get_current_file_structure() ([]file_item, error) {
	log.Println("Haetaan rivit file_structure-taulusta..")
	rows, err := backend.Db.Query(`
		SELECT id, parent_folder, name
		FROM file_structure
	`)
	if err != nil {
		log.Printf("virhe SELECT-lauseessa: %v", err)
		return nil, err
	}
	defer rows.Close()

	var results []file_item
	var row_count int
	for rows.Next() {
		var fi file_item
		scan_err := rows.Scan(&fi.id, &fi.parent_folder, &fi.name)
		if scan_err != nil {
			log.Printf("virhe rivin lukemisessa: %v", scan_err)
			return nil, scan_err
		}
		row_count++
		results = append(results, fi)
	}
	log.Printf("Yhteensä %d riviä haettu file_structure-taulusta", row_count)

	if err := rows.Err(); err != nil {
		log.Printf("rivien lukemisen lopussa tuli virhe: %v", err)
		return nil, err
	}
	return results, nil
}

// insert_or_update_file_row päivittää tai lisää rivin file_structure-tauluun (md5 mukaanlukien).
// Mukaan otetaan myös openai_embedding (pgvectorgo).
// insert_or_update_file_row päivittää tai lisää rivin file_structure-tauluun.
// Jos openai_embedding on tyhjä (nolla-arvo), käytämme SQL:lle nil-parametria.
// Näin COALESCE pitää kannassa jo olevan embeddingin (jos sellainen on).
func insert_or_update_file_row(
	parent_folder, name, extension string,
	size int64,
	mime_type string,
	is_directory bool,
	md5sum string,
	openai_embedding pgvectorgo.Vector,
) error {
	// Jos Vector on zero value, laitetaan SQL-paramiksi nil,
	// jolloin COALESCE(...) säilyttää entisen arvon.
	var openai_embedding_arg interface{}
	if reflect.ValueOf(openai_embedding).IsZero() {
		log.Printf("ei uutta embeddingiä tiedostolle '%s/%s'", parent_folder, name)
		openai_embedding_arg = nil
	} else {
		log.Printf("uusi embedding luotu tiedostolle '%s/%s'", parent_folder, name)
		openai_embedding_arg = openai_embedding
	}

	_, err := backend.Db.Exec(`
        INSERT INTO file_structure (
            parent_folder,
            name,
            extension,
            size,
            mime_type,
            is_directory,
            md5,
            updated,
            openai_embedding
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
        ON CONFLICT (parent_folder, name)
        DO UPDATE SET
            extension = EXCLUDED.extension,
            size = EXCLUDED.size,
            mime_type = EXCLUDED.mime_type,
            is_directory = EXCLUDED.is_directory,
            md5 = EXCLUDED.md5,
            openai_embedding = COALESCE(EXCLUDED.openai_embedding, file_structure.openai_embedding),
            updated = NOW()
    `,
		parent_folder,
		name,
		extension,
		size,
		mime_type,
		is_directory,
		md5sum,
		openai_embedding_arg, // voi olla pgvector.Vector tai nil
	)
	if err != nil {
		log.Printf("virhe tallennettaessa '%s/%s': %v", parent_folder, name, err)
	}
	return err
}

// remove_file_row poistaa rivin sen id:n perusteella
func remove_file_row(item_id int) error {
	_, err := backend.Db.Exec(`DELETE FROM file_structure WHERE id = $1`, item_id)
	if err != nil {
		log.Printf("virhe DELETE-lauseessa id=%d: %v", item_id, err)
	}
	return err
}

// logError tulostaa ja palauttaa virhe-olion.
func logError(format string, args ...interface{}) error {
	msg := tidyFmt(format, args...)
	log.Println(msg)
	return errors.New(msg)
}

// tidyFmt on yksinkertainen funktio, joka muokkaa merkkijonoa halutusti:
// 1) fmt.Sprintf(format, args...)
// 2) korvaa \r, \n, \t, tuplavälit jne.
// 3) trimmaa lopuksi reunat pois
func tidyFmt(format string, args ...interface{}) string {
	s := fmt.Sprintf(format, args...)    // ensin normaali printf-tyylinen formatointi
	s = strings.ReplaceAll(s, "\r", "")  // poista CR
	s = strings.ReplaceAll(s, "\n", " ") // korvaa LF-vaihdot välilyönnillä
	s = strings.ReplaceAll(s, "\t", " ") // korvaa tabit
	for strings.Contains(s, "  ") {      // korvaa tuplavälit yksittäisiksi
		s = strings.ReplaceAll(s, "  ", " ")
	}
	return strings.TrimSpace(s)
}
