#!/usr/bin/env bash
# file: restore_easelect.sh
#
# ▸ Noutaa uusimman roles-*.sql- ja easelect-*.{sql,backup,dump}-tiedoston
#   hakemistosta $HOME/easelect/db_backups (tai 1. parametri).
# ▸ Pudottaa vanhan kannan, palauttaa roolit (sallii duplikaatit),
#   luo tyhjän kannan ja palauttaa datan kolmessa vaiheessa.
# ▸ Lopuksi asentaa PostGIS- ja pgvector-laajennukset (versio-tarkistus),
#   lisää postgis-skeeman search_pathiin ja kirjoittaa lokin restore.log-tiedostoon.
# ---------------------------------------------------------------------------

set -euo pipefail

# ---------- käyttäjän parametrit -------------------------------------------
backup_dir="${1:-$HOME/easelect/db_backups}"
db_name="${2:-easelect}"
pg_user="postgres"

log()   { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
abort() { echo "❌  $*"; exit 1; }

cd "$backup_dir"

role_dump=$(ls -1t roles-*.sql      2>/dev/null | head -n1 || true)
data_dump=$(ls -1t "${db_name}"-*.* 2>/dev/null | head -n1 || true)
[[ -f $role_dump ]] || abort "role-dump puuttuu"
[[ -f $data_dump ]] || abort "data-dump puuttuu"

log "roolitiedosto : $(basename "$role_dump")"
log "datadumppi    : $(basename "$data_dump")"

# ---------- 0) pudota vanha kanta -------------------------------------------
sudo -u "$pg_user" dropdb --if-exists "$db_name"

# ---------- 1) roolit (salli 'already exists') ------------------------------
log "roolien palautus (duplikaatit sallitaan)…"
sudo -u "$pg_user" psql -v ON_ERROR_STOP=0 -f "$role_dump" postgres

# ---------- 2) luo tyhjä kanta ----------------------------------------------
sudo -u "$pg_user" createdb --encoding=UTF8 --template=template0 "$db_name"

# ---------- 3) pg_restore ---------------------------------------------------
restore_log="${backup_dir}/restore.log"

log "pre-data (skeema) – pysähdytään ensimmäiseen virheeseen"
sudo -u "$pg_user" pg_restore \
  --section=pre-data --exit-on-error --verbose \
  --no-owner --dbname="$db_name" "$data_dump" \
  2>&1 | tee  "$restore_log"

log "data-osa rinnakkain ($(nproc) säiettä)…"
sudo -u "$pg_user" pg_restore \
  --section=data --jobs="$(nproc)" --verbose \
  --no-owner --dbname="$db_name" "$data_dump" \
  2>&1 | tee -a "$restore_log"

log "post-data (indeksit, mat-view-refreshit)…"
sudo -u "$pg_user" pg_restore \
  --section=post-data --exit-on-error --verbose \
  --no-owner --dbname="$db_name" "$data_dump" \
  2>&1 | tee -a "$restore_log"

# ---------- 4) laajennukset palautuksen jälkeen -----------------------------
log "laajennusten tarkistus…"

required_pgvector="0.7"

current_ver=$(sudo -u "$pg_user" \
  psql -Atqc "SELECT extversion FROM pg_extension WHERE extname = 'vector';" \
  "$db_name" || echo "")

if [[ -z $current_ver ]]; then
  log "pgvector puuttuu – luodaan…"
  sudo -u "$pg_user" psql -d "$db_name" -c "CREATE EXTENSION vector;"
  current_ver=$(sudo -u "$pg_user" \
    psql -Atqc "SELECT extversion FROM pg_extension WHERE extname = 'vector';" \
    "$db_name")
fi

vercomp () { printf '%s\n%s\n' "$1" "$2" | sort -V | head -n1; }

if [[ "$(vercomp "$required_pgvector" "$current_ver")" != "$required_pgvector" ]]; then
  log "pgvector-versio $current_ver → päivitetään…"
  sudo -u "$pg_user" psql -d "$db_name" -c "ALTER EXTENSION vector UPDATE;"
else
  log "pgvector $current_ver OK"
fi

# PostGIS (skeemaan 'postgis')
sudo -u "$pg_user" psql -d "$db_name" \
  -c "CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA postgis;"

# ⭢ UUSI: lisätään postgis search_pathiin, jos ei siellä vielä ole
sudo -u "$pg_user" psql -d "$db_name" <<'SQL'
DO
$$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_db_role_setting
    WHERE setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND setrole = 0  -- <== database‐level
      AND setconfig @> ARRAY['search_path']
  ) OR position('postgis' in current_setting('search_path')) = 0 THEN
    EXECUTE format('ALTER DATABASE %I SET search_path = public, postgis', current_database());
  END IF;
END
$$;
SQL

# ---------- 5) pikacheck -----------------------------------------------------
log "PostGIS versio:"
sudo -u "$pg_user" psql -d "$db_name" -c "SELECT postgis.postgis_full_version();"

log "🎉 palautus valmis – tarkista virheet tarvittaessa → ${restore_log}"


# #!/usr/bin/env bash
# # file: restore_easelect.sh
# #
# # Palauttaa easelect-tietokannan uusimmista varmuuskopioista.
# # - Valitsee automaattisesti hakemiston tuoreimmat roles-*.sql- ja easelect-*.sql-tiedostot.
# # - Vaatii, että ajaja voi suorittaa `sudo -u postgres …` (yleensä root-oikeudet).
# #
# # Käyttö:
# #   sudo ./restore_easelect.sh [/polku/varmuuskopioihin] [kantanimi]
# #
# # Esimerkit:
# #   sudo ./restore_easelect.sh                 # käyttää ~/easelect/db_backups & "easelect"
# #   sudo ./restore_easelect.sh /tmp/backups qa_easelect
# #
# # Scripti pysähtyy ensimmäiseen virheeseen (set -euo pipefail).

# set -euo pipefail

# # --- Parametrit ja oletukset --------------------------------------------------

# varmuuskopiohakemisto="${1:-$HOME/easelect/db_backups}"
# palautettavan_kannan_nimi="${2:-easelect}"
# postgres_superkayttaja="postgres"

# # --- Etsi tuoreimmat dumpit ---------------------------------------------------

# cd "$varmuuskopiohakemisto"

# uusin_roolitiedosto="$(ls -1t roles-*.sql  | head -n1)"
# uusin_dumptiedosto="$(ls -1t easelect-*.sql | head -n1)"

# if [[ -z "$uusin_roolitiedosto" || -z "$uusin_dumptiedosto" ]]; then
#   echo "Ei löytynyt tarvittavia rooli-/dump-tiedostoja hakemistosta: $varmuuskopiohakemisto" >&2
#   exit 1
# fi

# echo "Käytetään roolitiedostoa: $uusin_roolitiedosto"
# echo "Käytetään dump-tiedostoa : $uusin_dumptiedosto"
# echo

# # --- 1. Palauta roolit --------------------------------------------------------

# echo "📁 Palautetaan roolit…"
# sudo -u "$postgres_superkayttaja" psql -f "$uusin_roolitiedosto" postgres
# echo "✅ Roolit palautettu."
# echo

# # --- 2. Pudota & luo kohdekanta ----------------------------------------------

# echo "🗑️  Poistetaan vanha kanta (jos on)…"
# sudo -u "$postgres_superkayttaja" dropdb --if-exists "$palautettavan_kannan_nimi"

# echo "🆕 Luodaan tyhjä kanta…"
# sudo -u "$postgres_superkayttaja" createdb -O "$postgres_superkayttaja" "$palautettavan_kannan_nimi"
# echo "✅ Kanta luotu."
# echo

# # --- 3. Palauta custom-muotoinen dump -----------------------------------------

# echo "🚚 Tuodaan data (pg_restore)…"
# sudo -u "$postgres_superkayttaja" pg_restore \
#   --verbose \
#   --dbname="$palautettavan_kannan_nimi" \
#   --no-owner \
#   "$uusin_dumptiedosto"
# echo "✅ Data palautettu."
# echo

# # --- 4. Varmista lopputulos ---------------------------------------------------

# echo "🔍 Tarkistetaan taulut…"
# sudo -u "$postgres_superkayttaja" psql -d "$palautettavan_kannan_nimi" -c "\dt"
# echo
# echo "🎉 Palautus valmis!"
