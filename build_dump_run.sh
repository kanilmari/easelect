#!/usr/bin/env bash
# build_dump_run.sh
# Rakennetaan easelect, dumpataan kanta ja ajetaan sovellus.
# – Luo aina ./db_backups-kansioon kaksi erillistä varmistusta:
#     1) easelect-YYYY-MM-DD.sql        (pelkkä tietokanta)
#     2) roles-YYYY-MM-DD.sql           (kaikki Postgres-roolit + oikeudet)
# – Parametri  `no_pg_dump`  ohittaa molemmat varmistukset.
# – Käyttää ympäristömuuttujia PGUSER, PGPASSWORD, PGHOST, PGPORT.
#   (Oletukset: postgres / my_passwd / localhost / 5432)

set -euo pipefail   # virhe katkaisee skriptin

# --- Perusmuuttujat -----------------------------------------------------------
current_date=$(date +%F)             # esim. 2025-04-25
database_name="easelect"

export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-my_passwd}"
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"

backup_directory="./db_backups"
data_backup="easelect-${current_date}.sql"
roles_backup="roles-${current_date}.sql"

mkdir -p "$backup_directory"
data_path="${backup_directory}/${data_backup}"
roles_path="${backup_directory}/${roles_backup}"

# --- Komentoriviparametrien käsittely -----------------------------------------
skip_pg_dump=false
if [[ "${1:-}" == "no_pg_dump" ]]; then
  skip_pg_dump=true
  echo "⏩  Parametri 'no_pg_dump' – varmistukset ohitetaan."
elif [[ $# -gt 0 ]]; then
  echo "Virhe: tuntematon parametri '$1' (sallitut: no_pg_dump)" >&2
  exit 1
fi

# --- 1) (Valinnaiset) pg_dump & pg_dumpall ------------------------------------
if ! $skip_pg_dump; then
  echo "📦  Luodaan tietokantadumppi   → $data_path"
  pg_dump  -Fc -f "$data_path" "$database_name" \
           --no-owner
  echo "✔️  Tietokantadumppi valmis."

  echo "🔑  Luodaan roolidumppi        → $roles_path"
  # Roolidumppi vaatii superuser-oikeudet
  pg_dumpall --roles-only --clean --if-exists -f "$roles_path"
  echo "✔️  Roolidumppi valmis."
fi

# --- 2) Tulostetaan tietokannan koko ------------------------------------------
echo -n "ℹ️  Tietokannan koko: "
psql -qAt -d "$database_name" \
     -c "SELECT pg_size_pretty(pg_database_size('$database_name'));" \
     | tr -d '\n'
echo

# --- 3) Lopetetaan aiempi easelect (jos käynnissä) ----------------------------
if pid=$(pgrep -f '^./easelect' || true); then
  echo "🔄  Suljetaan aiempi easelect (pid=$pid)..."
  kill "$pid" && sleep 1
fi

# --- 4) Käännetään ja ajetaan sovellus ----------------------------------------
echo "⚙️  go build ..."
go build

echo "🚀  Käynnistetään ./easelect"
# systemctl restart easelect.service
# ./easelect
./easelect

# #!/usr/bin/env bash

# # build_and_run.sh
# # Rakennetaan easelect ja ajetaan se.
# # Jos easelect on jo käynnissä, suljetaan se ennen ajamista.

# # Lopetetaan skripti virheeseen, jos jokin komento palauttaa != 0.
# set -e

# # 1) Tarkistetaan, onko easelect-prosessi jo käynnissä
# pid=$(pgrep -f '^./easelect' || true)
# if [ "$pid" ]; then
#     echo "Löytyi käynnissä oleva 'easelect'-prosessi pid=$pid, lopetetaan se."
#     kill "$pid"
#     # Odotetaan prosessin loppumista sekunnin verran
#     # (Lisää lokitusta halutessasi.)
#     sleep 1
# fi

# # 2) Käännetään easelect
# echo "Käännetään Go-easelect..."
# go build

# # 3) Ajetaan tuloksena syntynyt binääri
# echo "Ajetaan ./easelect"
# ./easelect
