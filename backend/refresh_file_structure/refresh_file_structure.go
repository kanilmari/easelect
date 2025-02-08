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
	"strings"
	"time"

	"easelect/backend"

	pgvector "github.com/pgvector/pgvector-go"
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

// RefreshFileStructureHandler on HTTP-reitti, joka skannaa base_path-hakemiston
// rekursiivisesti ja päivittää file_structure-taulun (lisää / poistaa rivejä).
// Samalla lasketaan tiedostojen MD5-summa ja talletetaan sarakkeeseen md5.
// Uusille tai muuttuneille tiedostoille haetaan lisäksi OpenAI-embeddings openai_embedding-sarakkeeseen.
// Lopuksi tulostetaan summaavat lokiviestit tapahtumista.

// func RefreshFileStructureHandler(w http.ResponseWriter, r *http.Request) {
// 	log.Printf("RefreshFileStructureHandler kutsuttu, metodi: %s", r.Method)

// 	if r.Method != http.MethodPost && r.Method != http.MethodGet {
// 		http.Error(w, "vain POST tai GET tuettu", http.StatusMethodNotAllowed)
// 		return
// 	}

// 	// 1) Luodaan (tai päivitetään) taulun rakenne tarvittaessa
// 	log.Println("Luodaan/päivitetään file_structure-taulun rakenne tarvittaessa..")
// 	err := create_file_structure_table_if_not_exists()
// 	if err != nil {
// 		log.Printf("virhe taulun luonnissa: %v", err)
// 		http.Error(w, "virhe taulun luonnissa", http.StatusInternalServerError)
// 		return
// 	}
// 	log.Println("Taulun luonti/päivitys suoritettu.")

// 	// 2) Haetaan nykyinen tilanne (lista tietueita)
// 	log.Println("Haetaan nykyinen tilanne file_structure-taulusta..")
// 	existing_items, err := get_current_file_structure()
// 	if err != nil {
// 		log.Printf("virhe haettaessa vanhoja rivejä: %v", err)
// 		http.Error(w, "virhe vanhojen rivejen luvussa", http.StatusInternalServerError)
// 		return
// 	}
// 	log.Printf("Nykyisiä rivejä yhteensä: %d", len(existing_items))

// 	// Ylläpidetään listoja lokeja varten:
// 	var skipped_files []string
// 	var new_files []string
// 	var changed_files []string
// 	var removed_files []string

// 	// Tallennetaan karttaan (combined_key) kaikki ne, jotka skannauksessa säilyvät
// 	updated_items := make(map[string]bool)

// 	// Määritellään sallitut tiedostopäätteet
// 	allowed_extensions := map[string]bool{
// 		".go":   true,
// 		".js":   true,
// 		".html": true,
// 		".css":  true,
// 		".json": true,
// 		".ps1":  true,
// 		".py":   true,
// 	}

// 	// 3) Kävellään base_path-hakemisto ja käsitellään tiedostot
// 	log.Printf("Aloitetaan hakemistorakenteen läpikäynti polusta: %s", base_path)
// 	walk_err := filepath.Walk(base_path, func(current_path string, info os.FileInfo, err error) error {
// 		if err != nil {
// 			log.Printf("virhe polkua '%s' käveltäessä: %v", current_path, err)
// 			// odotetaan n ms
// 			return nil
// 		}

// 		// Jos kansion tai tiedoston nimi alkaa pisteellä, ohitetaan se (esim. ".git").
// 		if strings.HasPrefix(info.Name(), ".") {
// 			// Lisätään skipattujen listalle vain tiedostonimenä (kansiot ohitetaan isDirin puolella)
// 			if !info.IsDir() {
// 				skipped_files = append(skipped_files, info.Name())
// 			}
// 			if info.IsDir() {
// 				return filepath.SkipDir
// 			}
// 			return nil
// 		}

// 		// Hylätään kansiot nimeltä "old" tai "öld"
// 		if info.IsDir() {
// 			lower_name := strings.ToLower(info.Name())
// 			if lower_name == "old" || lower_name == "öld" {
// 				// Lisätään skipattuihin myös tämä kansio
// 				skipped_files = append(skipped_files, info.Name())
// 				return filepath.SkipDir
// 			}
// 		}

// 		// Tämä koodi ohittaa kansiot (ei talleta niitä).
// 		if info.IsDir() {
// 			return nil
// 		}

// 		// Selvitetään tiedostopääte
// 		extension := strings.ToLower(filepath.Ext(info.Name()))

// 		// Jos pääte ei ole sallittujen listalla, skipataan tallennus
// 		if !allowed_extensions[extension] {
// 			skipped_files = append(skipped_files, info.Name())
// 			return nil
// 		}

// 		// Lasketaan tiedoston MD5-summa
// 		md5sum, hash_err := compute_md5(current_path)
// 		if hash_err != nil {
// 			log.Printf("virhe laskettaessa md5-tarkistetta '%s': %v", current_path, hash_err)
// 			// odotetaan n ms
// 			return nil
// 		}

// 		// Selvitetään polkuun liittyviä tietoja
// 		relative_path, rel_err := filepath.Rel(base_path, current_path)
// 		if rel_err != nil {
// 			relative_path = info.Name() // fallback
// 		}
// 		parent_folder := filepath.Dir(relative_path)
// 		name := info.Name()
// 		size := info.Size()
// 		is_directory := false
// 		mime_type := ""

// 		// Tarkistetaan, onko tiedosto uusi vai muuttunut
// 		old_md5, old_err := get_existing_md5(parent_folder, name)
// 		var is_new_file bool
// 		var is_changed_file bool

// 		if old_err == sql.ErrNoRows {
// 			is_new_file = true
// 		} else if old_err != nil {
// 			log.Printf("virhe tarkistettaessa vanhaa md5: %v", old_err)
// 			// Jatketaan silti
// 		} else {
// 			// Tiedosto on ennestään kannassa, verrataan MD5
// 			if old_md5 != md5sum {
// 				is_changed_file = true
// 			}
// 		}

// 		var embedding_vector pgvector.Vector
// 		var embedding_err error

// 		// Jos tiedosto on uusi tai muuttunut, haetaan OpenAI-embeddings
// 		if is_new_file || is_changed_file {
// 			file_content_str, read_err := read_file_content_as_string(current_path)
// 			if read_err != nil {
// 				log.Printf("virhe luettaessa tiedostoa '%s' embeddingiä varten: %v", current_path, read_err)
// 				// Jätetään embedding hakematta, mutta jatketaan
// 			} else {
// 				embedding_vector, embedding_err = fetch_embedding_from_openai(file_content_str)
// 				if embedding_err != nil {
// 					log.Printf("virhe embeddingin haussa '%s': %v", current_path, embedding_err)
// 				}
// 			}
// 		}

// 		// Tallennetaan rivi (upsert), välitetään embedding, vaikka se olisi tyhjä
// 		insert_err := insert_or_update_file_row(
// 			parent_folder,
// 			name,
// 			extension,
// 			size,
// 			mime_type,
// 			is_directory,
// 			md5sum,
// 			embedding_vector, // voi olla nollavektori, jos hakemisessa oli ongelma
// 		)
// 		if insert_err != nil {
// 			log.Printf("virhe tallennettaessa '%s': %v", current_path, insert_err)
// 		} else {
// 			if is_new_file {
// 				new_files = append(new_files, parent_folder+"/"+name)
// 			} else if is_changed_file {
// 				changed_files = append(changed_files, parent_folder+"/"+name)
// 			}
// 		}

// 		combined_key := parent_folder + "/" + name
// 		updated_items[combined_key] = true

// 		return nil
// 	})

// 	if walk_err != nil {
// 		log.Printf("virhe hakemistorakennetta kävellessä: %v", walk_err)
// 		http.Error(w, "virhe hakemistorakennetta kävellessä", http.StatusInternalServerError)
// 		return
// 	}

// 	// 4) Poistetaan tietokannasta ne, joita ei enää löydy
// 	for _, old_item := range existing_items {
// 		combined_key := old_item.parent_folder + "/" + old_item.name
// 		if !updated_items[combined_key] {
// 			removed_files = append(removed_files, combined_key)
// 			del_err := remove_file_row(old_item.id)
// 			if del_err != nil {
// 				log.Printf("virhe poistettaessa '%s/%s': %v",
// 					old_item.parent_folder, old_item.name, del_err)
// 			}
// 		}
// 	}

// 	// Lopuksi tulostetaan yhteenvetoloki
// 	if len(removed_files) > 0 {
// 		log.Printf("poistetut tiedostot: %d kpl: %s", len(removed_files), strings.Join(removed_files, ", "))
// 	} else {
// 		log.Println("poistetut tiedostot: 0 kpl")
// 	}
// 	if len(new_files) > 0 {
// 		log.Printf("uudet tiedostot: %d kpl: %s", len(new_files), strings.Join(new_files, ", "))
// 	} else {
// 		log.Println("uudet tiedostot: 0 kpl")
// 	}
// 	if len(changed_files) > 0 {
// 		log.Printf("muuttuneet tiedostot: %d kpl: %s", len(changed_files), strings.Join(changed_files, ", "))
// 	} else {
// 		log.Println("muuttuneet tiedostot: 0 kpl")
// 	}
// 	if len(skipped_files) > 0 {
// 		log.Printf("skipatut tiedostot: %d kpl: %s", len(skipped_files), strings.Join(skipped_files, ", "))
// 	} else {
// 		log.Println("skipatut tiedostot: 0 kpl")
// 	}

// 	log.Println("Hakemistorakenteen päivitys valmis.")
// 	w.WriteHeader(http.StatusOK)
// 	w.Write([]byte("Hakemistorakenteen päivitys onnistui"))
// }

// === OSA 1: Handlerin alku, metoditarkistus ja taulun varmistus ===

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

	// === OSA 2: Haetaan nykyinen tilanne, alustetaan listat ja sallitut tiedostopäätteet ===

	log.Println("Haetaan nykyinen tilanne file_structure-taulusta..")
	existing_items, err := get_current_file_structure()
	if err != nil {
		log.Printf("virhe haettaessa vanhoja rivejä: %v", err)
		http.Error(w, "virhe vanhojen rivejen luvussa", http.StatusInternalServerError)
		return
	}
	log.Printf("Nykyisiä rivejä yhteensä: %d", len(existing_items))

	var skipped_files []string
	var new_files []string
	var changed_files []string
	var removed_files []string

	updated_items := make(map[string]bool)

	allowed_extensions := map[string]bool{
		".go":   true,
		".js":   true,
		".html": true,
		".css":  true,
		".json": true,
		".ps1":  true,
		".py":   true,
	}

	// Määritellään embedding-rajoitus
	embedding_count := 0
	const embedding_max = 10

	// === OSA 3: Kävellään hakemisto ja käsitellään tiedostot ===

	log.Printf("Aloitetaan hakemistorakenteen läpikäynti polusta: %s", base_path)
	walk_err := filepath.Walk(base_path, func(current_path string, info os.FileInfo, err error) error {
		if err != nil {
			log.Printf("virhe polkua '%s' käveltäessä: %v", current_path, err)
			// odotetaan n ms
			return nil
		}

		// Jos kansion tai tiedoston nimi alkaa pisteellä, ohitetaan se (esim. ".git").
		if strings.HasPrefix(info.Name(), ".") {
			if !info.IsDir() {
				skipped_files = append(skipped_files, info.Name())
			}
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// Hylätään kansiot nimeltä "old" tai "öld"
		if info.IsDir() {
			lower_name := strings.ToLower(info.Name())
			if lower_name == "old" || lower_name == "öld" {
				skipped_files = append(skipped_files, info.Name())
				return filepath.SkipDir
			}
			return nil
		}

		// Vain tiedostoja käsitellään jatkossa
		if info.IsDir() {
			return nil
		}

		// Sallittu tiedostopääte?
		extension := strings.ToLower(filepath.Ext(info.Name()))
		if !allowed_extensions[extension] {
			skipped_files = append(skipped_files, info.Name())
			return nil
		}

		// Lasketaan MD5-summa
		md5sum, hash_err := compute_md5(current_path)
		if hash_err != nil {
			log.Printf("virhe laskettaessa md5-tarkistetta '%s': %v", current_path, hash_err)
			// odotetaan n ms
			return nil
		}

		// Selvitetään polkuun liittyviä tietoja
		relative_path, rel_err := filepath.Rel(base_path, current_path)
		if rel_err != nil {
			relative_path = info.Name() // fallback
		}
		parent_folder := filepath.Dir(relative_path)
		name := info.Name()
		size := info.Size()
		is_directory := false
		mime_type := ""

		// Tarkistetaan, onko tiedosto uusi vai muuttunut
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

		// Suoritetaan embeddaus vain jos tiedosto on uusi tai muuttunut
		// ja embedding_count < embedding_max
		var embedding_vector pgvector.Vector
		var embedding_err error

		if (is_new_file || is_changed_file) && embedding_count < embedding_max {
			file_content_str, read_err := read_file_content_as_string(current_path)
			if read_err != nil {
				log.Printf("virhe luettaessa tiedostoa '%s' embeddingiä varten: %v", current_path, read_err)
			} else {
				embedding_vector, embedding_err = fetch_embedding_from_openai(file_content_str)
				if embedding_err != nil {
					log.Printf("virhe embeddingin haussa '%s': %v", current_path, embedding_err)
				}
				embedding_count++
			}
		}

		// Tallennetaan rivi (upsert)
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
			if is_new_file {
				new_files = append(new_files, parent_folder+"/"+name)
			} else if is_changed_file {
				changed_files = append(changed_files, parent_folder+"/"+name)
			}
		}

		combined_key := parent_folder + "/" + name
		updated_items[combined_key] = true
		return nil
	})

	if walk_err != nil {
		log.Printf("virhe hakemistorakennetta kävellessä: %v", walk_err)
		http.Error(w, "virhe hakemistorakennetta kävellessä", http.StatusInternalServerError)
		return
	}

	// === OSA 4: Poistetaan tietokannasta puuttuvat, tulostetaan yhteenveto ja vastataan ===

	// Poistetaan ne rivit kannasta, jotka eivät olleet mukana päivityksessä
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
// ja palauttaa sen pgvector.Vector -muodossa.
func fetch_embedding_from_openai(file_content string) (pgvector.Vector, error) {
	openai_key := os.Getenv("OPENAI_API_KEY")
	if openai_key == "" {
		return pgvector.Vector{}, logError("missing OPENAI_API_KEY")
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
		return pgvector.Vector{}, logError("openai embedding error: %v", err)
	}
	if len(resp.Data) == 0 {
		return pgvector.Vector{}, logError("empty embedding response")
	}

	embedding_data := resp.Data[0].Embedding
	return pgvector.NewVector(embedding_data), nil
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

	// Lisätään openai_embedding -sarake pgvector-tyyppisenä (1536) mikäli sitä ei ole
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
// Mukaan otetaan myös openai_embedding (pgvector).
func insert_or_update_file_row(
	parent_folder, name, extension string,
	size int64,
	mime_type string,
	is_directory bool,
	md5sum string,
	openai_embedding pgvector.Vector,
) error {

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
			openai_embedding = EXCLUDED.openai_embedding,
			updated = NOW()
	`,
		parent_folder,
		name,
		extension,
		size,
		mime_type,
		is_directory,
		md5sum,
		openai_embedding,
	)
	if err != nil {
		log.Printf("virhe INSERT/UPDATE suorituksessa: %v", err)
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

// // refresh_file_structure.go
// package refresh_file_structure

// import (
// 	"crypto/md5"
// 	"database/sql"
// 	"encoding/hex"
// 	"io"
// 	"log"
// 	"net/http"
// 	"os"
// 	"path/filepath"
// 	"strings"

// 	"easelect/backend"
// )

// var base_path string

// func init() {
// 	working_directory, err := os.Getwd()
// 	if err != nil {
// 		log.Fatal("virhe haettaessa työskentelykansiota: ", err)
// 	}
// 	base_path = working_directory
// 	log.Printf("base_path asetettu: %s", base_path)
// }

// // file_item edustaa file_structure-taulun tietuetta
// type file_item struct {
// 	id            int
// 	parent_folder string
// 	name          string
// }

// // RefreshFileStructureHandler on HTTP-reitti, joka skannaa base_path-hakemiston
// // rekursiivisesti ja päivittää file_structure-taulun (lisää / poistaa rivejä).
// // Samalla lasketaan tiedostojen MD5-summa ja talletetaan sarakkeeseen md5.
// // Lokitetaan, jos tiedosto on uusi tai sisällöltään muuttunut (md5 muuttuu).
// func RefreshFileStructureHandler(w http.ResponseWriter, r *http.Request) {
// 	log.Printf("RefreshFileStructureHandler kutsuttu, metodi: %s", r.Method)

// 	if r.Method != http.MethodPost && r.Method != http.MethodGet {
// 		http.Error(w, "vain POST tai GET tuettu", http.StatusMethodNotAllowed)
// 		return
// 	}

// 	// 1) Luodaan (tai päivitetään) taulun rakenne tarvittaessa
// 	log.Println("Luodaan/päivitetään file_structure-taulun rakenne tarvittaessa.")
// 	err := create_file_structure_table_if_not_exists()
// 	if err != nil {
// 		log.Printf("virhe taulun luonnissa: %v", err)
// 		http.Error(w, "virhe taulun luonnissa", http.StatusInternalServerError)
// 		return
// 	}
// 	log.Println("Taulun luonti/päivitys suoritettu.")

// 	// 2) Haetaan nykyinen tilanne (lista tietueita)
// 	log.Println("Haetaan nykyinen tilanne file_structure-taulusta.")
// 	existing_items, err := get_current_file_structure()
// 	if err != nil {
// 		log.Printf("virhe haettaessa vanhoja rivejä: %v", err)
// 		http.Error(w, "virhe vanhojen rivejen luvussa", http.StatusInternalServerError)
// 		return
// 	}
// 	log.Printf("Nykyisiä rivejä yhteensä: %d", len(existing_items))

// 	// Tallennetaan karttaan kaikki ne, jotka löytyivät skannauksesta
// 	updated_items := make(map[string]bool)

// 	// Määritellään sallitut tiedostopäätteet
// 	allowed_extensions := map[string]bool{
// 		".go":   true,
// 		".js":   true,
// 		".html": true,
// 		".css":  true,
// 		".json": true,
// 		".ps1":  true,
// 		".py":   true,
// 	}

// 	// 3) Kävellään base_path-hakemisto ja lisätään/päivitetään rivit
// 	log.Printf("Aloitetaan hakemistorakenteen läpikäynti polusta: %s", base_path)
// 	walk_err := filepath.Walk(base_path, func(current_path string, info os.FileInfo, err error) error {
// 		if err != nil {
// 			log.Printf("virhe polkua '%s' käveltäessä: %v", current_path, err)
// 			// odotetaan n ms
// 			return nil
// 		}

// 		// Jos kansion tai tiedoston nimi alkaa pisteellä, ohitetaan se (esim. ".git").
// 		if strings.HasPrefix(info.Name(), ".") {
// 			// log.Printf("skippaus: tiedosto/kansio '%s' alkaa pisteellä, ohitetaan", info.Name())
// 			if info.IsDir() {
// 				return filepath.SkipDir
// 			}
// 			return nil
// 		}

// 		// Hylätään kansiot nimeltä "old" tai "öld"
// 		if info.IsDir() {
// 			lower_name := strings.ToLower(info.Name())
// 			if lower_name == "old" || lower_name == "öld" {
// 				log.Printf("skippaus: kansio '%s' hylättiin", current_path)
// 				return filepath.SkipDir
// 			}
// 		}

// 		// Tämä koodi ohittaa kansiot (ei talleta niitä).
// 		if info.IsDir() {
// 			return nil
// 		}

// 		// Selvitetään tiedostopääte
// 		extension := strings.ToLower(filepath.Ext(info.Name()))

// 		// Jos pääte ei ole sallittujen listalla, skipataan tallennus
// 		if !allowed_extensions[extension] {
// 			log.Printf("skippaus: tiedoston '%s' pääte ei ole sallituissa (%s)", info.Name(), extension)
// 			return nil
// 		}

// 		// Lasketaan tiedoston MD5-summa
// 		md5sum, hash_err := compute_md5(current_path)
// 		if hash_err != nil {
// 			log.Printf("virhe laskettaessa md5-tarkistetta '%s': %v", current_path, hash_err)
// 			// Voit halutessa palata errorin, mutta ohitetaan tässä vain.
// 			return nil
// 		}

// 		// Selvitetään polkuun liittyviä tietoja
// 		relative_path, rel_err := filepath.Rel(base_path, current_path)
// 		if rel_err != nil {
// 			relative_path = info.Name() // fallback
// 		}
// 		parent_folder := filepath.Dir(relative_path)
// 		name := info.Name()
// 		size := info.Size()
// 		is_directory := false
// 		mime_type := ""

// 		// Tarkistetaan, onko tiedosto uusi vai onko sisältö muuttunut (verrataan MD5)
// 		old_md5, old_err := get_existing_md5(parent_folder, name)
// 		if old_err == sql.ErrNoRows {
// 			log.Printf("uusi tiedosto: %s/%s (md5=%s)", parent_folder, name, md5sum)
// 		} else if old_err != nil {
// 			// Jos virhe on muu kuin sql.ErrNoRows, logitetaan se,
// 			// mutta yritetään silti jatkaa upsertilla.
// 			log.Printf("virhe tarkistettaessa vanhaa md5: %v", old_err)
// 		} else {
// 			if old_md5 != md5sum {
// 				log.Printf("tiedosto muuttunut: %s/%s. vanha md5: %s -> uusi md5: %s", parent_folder, name, old_md5, md5sum)
// 			}
// 		}

// 		// Tallennetaan rivi (upsert)
// 		insert_err := insert_or_update_file_row(parent_folder, name, extension, size, mime_type, is_directory, md5sum)
// 		if insert_err != nil {
// 			log.Printf("virhe tallennettaessa '%s': %v", current_path, insert_err)
// 		}

// 		combined_key := parent_folder + "/" + name
// 		updated_items[combined_key] = true

// 		return nil
// 	})

// 	if walk_err != nil {
// 		log.Printf("virhe hakemistorakennetta kävellessä: %v", walk_err)
// 		http.Error(w, "virhe hakemistorakennetta kävellessä", http.StatusInternalServerError)
// 		return
// 	}

// 	// 4) Poistetaan tietokannasta ne, joita ei enää löydy
// 	for _, old_item := range existing_items {
// 		combined_key := old_item.parent_folder + "/" + old_item.name
// 		if !updated_items[combined_key] {
// 			// log.Printf("poistetaan tietue: id=%d, parent_folder='%s', name='%s'",
// 			// 	old_item.id, old_item.parent_folder, old_item.name)
// 			del_err := remove_file_row(old_item.id)
// 			if del_err != nil {
// 				log.Printf("virhe poistettaessa '%s/%s': %v",
// 					old_item.parent_folder, old_item.name, del_err)
// 			}
// 		}
// 	}

// 	log.Println("Hakemistorakenteen päivitys valmis.")
// 	w.WriteHeader(http.StatusOK)
// 	w.Write([]byte("Hakemistorakenteen päivitys onnistui"))
// }

// // compute_md5 lukee koko tiedoston ja laskee sen MD5-hajautusarvon (heksamerkkijonona).
// func compute_md5(file_path string) (string, error) {
// 	file, err := os.Open(file_path)
// 	if err != nil {
// 		return "", err
// 	}
// 	defer file.Close()

// 	hasher := md5.New()
// 	_, copy_err := io.Copy(hasher, file)
// 	if copy_err != nil {
// 		return "", copy_err
// 	}

// 	return hex.EncodeToString(hasher.Sum(nil)), nil
// }

// // get_existing_md5 hakee kannasta olemassa olevan md5-summan, jos rivi on jo siellä.
// func get_existing_md5(parent_folder, name string) (string, error) {
// 	var old_md5 string
// 	row := backend.Db.QueryRow(`
// 		SELECT md5
// 		FROM file_structure
// 		WHERE parent_folder = $1
// 		  AND name = $2
// 		LIMIT 1
// 	`, parent_folder, name)

// 	err := row.Scan(&old_md5)
// 	return old_md5, err // voi olla sql.ErrNoRows, jos ei löydy
// }

// // create_file_structure_table_if_not_exists luo taulun uudet sarakkeet haluttuun rakenteeseen.
// func create_file_structure_table_if_not_exists() error {
// 	log.Println("Luodaan/varmistetaan file_structure-taulun olemassaolo.")
// 	_, err := backend.Db.Exec(`
// 		CREATE TABLE IF NOT EXISTS file_structure (
// 			id SERIAL PRIMARY KEY,
// 			created TIMESTAMP NOT NULL DEFAULT NOW(),
// 			updated TIMESTAMP NOT NULL DEFAULT NOW(),
// 			parent_folder TEXT NOT NULL,
// 			extension TEXT,
// 			size BIGINT,
// 			mime_type TEXT,
// 			is_directory BOOLEAN NOT NULL DEFAULT false,
// 			name TEXT NOT NULL,
// 			md5 TEXT,
// 			UNIQUE (parent_folder, name)
// 		)
// 	`)
// 	if err != nil {
// 		log.Printf("virhe CREATE TABLE -lauseessa: %v", err)
// 	} else {
// 		log.Println("Taulu file_structure on kunnossa (luotu tai oli jo olemassa).")
// 	}
// 	return err
// }

// // get_current_file_structure hakee tietokannasta sen hetkiset rivit.
// func get_current_file_structure() ([]file_item, error) {
// 	log.Println("Haetaan rivit file_structure-taulusta.")
// 	rows, err := backend.Db.Query(`
// 		SELECT id, parent_folder, name
// 		FROM file_structure
// 	`)
// 	if err != nil {
// 		log.Printf("virhe SELECT-lauseessa: %v", err)
// 		return nil, err
// 	}
// 	defer rows.Close()

// 	var results []file_item
// 	var row_count int
// 	for rows.Next() {
// 		var fi file_item
// 		scan_err := rows.Scan(&fi.id, &fi.parent_folder, &fi.name)
// 		if scan_err != nil {
// 			log.Printf("virhe rivin lukemisessa: %v", scan_err)
// 			return nil, scan_err
// 		}
// 		row_count++
// 		results = append(results, fi)
// 	}
// 	log.Printf("Yhteensä %d riviä haettu file_structure-taulusta", row_count)

// 	if err := rows.Err(); err != nil {
// 		log.Printf("rivien lukemisen lopussa tuli virhe: %v", err)
// 		return nil, err
// 	}
// 	return results, nil
// }

// // insert_or_update_file_row päivittää tai lisää rivin file_structure-tauluun (md5 mukaanlukien).
// func insert_or_update_file_row(parent_folder, name, extension string, size int64, mime_type string, is_directory bool, md5sum string) error {
// 	_, err := backend.Db.Exec(`
// 		INSERT INTO file_structure (
// 			parent_folder,
// 			name,
// 			extension,
// 			size,
// 			mime_type,
// 			is_directory,
// 			md5,
// 			updated
// 		)
// 		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
// 		ON CONFLICT (parent_folder, name)
// 		DO UPDATE SET
// 			extension = EXCLUDED.extension,
// 			size = EXCLUDED.size,
// 			mime_type = EXCLUDED.mime_type,
// 			is_directory = EXCLUDED.is_directory,
// 			md5 = EXCLUDED.md5,
// 			updated = NOW()
// 	`,
// 		parent_folder,
// 		name,
// 		extension,
// 		size,
// 		mime_type,
// 		is_directory,
// 		md5sum,
// 	)
// 	if err != nil {
// 		log.Printf("virhe INSERT/UPDATE suorituksessa: %v", err)
// 	}
// 	return err
// }

// // remove_file_row poistaa rivin sen id:n perusteella
// func remove_file_row(item_id int) error {
// 	// log.Printf("DELETE id=%d file_structure-taulusta", item_id)
// 	_, err := backend.Db.Exec(`DELETE FROM file_structure WHERE id = $1`, item_id)
// 	if err != nil {
// 		log.Printf("virhe DELETE-lauseessa id=%d: %v", item_id, err)
// 	}
// 	return err
// }
