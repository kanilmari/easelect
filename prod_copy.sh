#!/bin/bash
# file: prod_copy.sh
#
# Kopioi easelect-binaarin, frontend- ja media-kansiot sekä (-s)
# tuoreimmat dumpit + restore_easelect.sh etäpalvelimelle rsyncillä – 
# ja säätää **oikeudet valmiiksi** heti kopiovaiheessa.
#
# Liput
#   -s, --sql       Kopioi myös uusimmat dumpit + restore_easelect.sh
#   -d, --delete    Poista etäpäältä tiedostot, joita ei enää löydy paikallisesti
#
# ---------------------------------------------------------------

set -euo pipefail

# --- Etäpalvelimen tiedot ----------------------------------------------------
REMOTE_USER="administrator"
REMOTE_HOST="81.88.23.109"
PROJECT_ROOT="/home/administrator/easelect"

# --- Oletusasetukset ---------------------------------------------------------
COPY_SQL=false
DELETE_EXTRAS=false

# --- Parametrien käsittely ---------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--sql)    COPY_SQL=true  ;;
    -d|--delete) DELETE_EXTRAS=true ;;
    *)  echo "Tuntematon parametri: $1"; exit 1 ;;
  esac
  shift
done

# --- Yhteinen SSH- ja rsync-komento ------------------------------------------
SSH_CMD="ssh -i ~/.ssh/easelect_key -o BatchMode=yes -o IdentitiesOnly=yes"
RSYNC_BASE=(-av --progress -e "$SSH_CMD")
$DELETE_EXTRAS && RSYNC_BASE+=(--delete)

# --- Apufunktio: rsync & chmod yhdellä rivillä -------------------------------
rsync_and_chmod() {
  local src="$1" dest="$2" chmod_spec="$3"
  rsync "${RSYNC_BASE[@]}" --chmod="$chmod_spec" "$src" \
        "${REMOTE_USER}@${REMOTE_HOST}:${dest}"
}

# --- Luo kohdepuun juuri -----------------------------------------------------
$SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${PROJECT_ROOT}"

# --- 1) easelect-binaari (755) ----------------------------------------------
echo "🟢 Kopioidaan easelect-binaari…"
rsync_and_chmod ./easelect "${PROJECT_ROOT}/easelect" "D755,F755"

# --- 2) .env (600) -----------------------------------------------------------
if [[ -f ".env" ]]; then
  echo "🟢 Kopioidaan .env…"
  rsync_and_chmod ./.env "${PROJECT_ROOT}/.env" "F600"
else
  echo "⚠️  .env ei löytynyt – ohitetaan."
fi

# --- 3) frontend (dir 755, tiedostot 644) ------------------------------------
echo "🟢 Kopioidaan frontend…"
rsync_and_chmod ./frontend/ "${PROJECT_ROOT}/frontend/" "D755,F644"

# --- 4) media (dir 755, tiedostot 644) ---------------------------------------
echo "🟢 Kopioidaan media…"
rsync_and_chmod ./media/ "${PROJECT_ROOT}/media/" "D755,F644"

# --- 5) Dumpit + restore_skripti (-s) ----------------------------------------
if $COPY_SQL; then
  echo "🟢 Kopioidaan dumpit + restore_skripti…"

  newest_db_dump=$(ls -t ./db_backups/easelect-* 2>/dev/null | head -n1 || true)
  newest_roles_dump=$(ls -t ./db_backups/roles-*   2>/dev/null | head -n1 || true)
  restore_script="./db_backups/restore_easelect.sh"

  if [[ -z $newest_db_dump && -z $newest_roles_dump && ! -f $restore_script ]]; then
    echo "⚠️  Dumppeja tai restore_skriptiä ei löytynyt – skipataan."
  else
    $SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" \
        "mkdir -p ${PROJECT_ROOT}/db_backups"

    [[ -n $newest_db_dump   ]] && \
      rsync_and_chmod "$newest_db_dump"   "${PROJECT_ROOT}/db_backups/" "F644"
    [[ -n $newest_roles_dump ]] && \
      rsync_and_chmod "$newest_roles_dump" "${PROJECT_ROOT}/db_backups/" "F644"

    if [[ -f $restore_script ]]; then
      rsync_and_chmod "$restore_script" "${PROJECT_ROOT}/db_backups/" "F755"
    fi
  fi
fi

echo "✅  Kopiointi & oikeudet valmiit!"


# #!/bin/bash
# # prod_copy.sh

# # Kopioi easelect-binaarin, frontend- ja media-kansiot (ja valinnaisesti tuoreimmat
# # tietokantadumpit) etäpalvelimelle rsyncin avulla.
# #
# # Liput:
# #   -s, --sql       Kopioi myös uusimmat dumpit (easelect-*.sql|.dump & roles-*.sql)
# #   -d, --delete    Poista etäpäästä tiedostot, joita ei enää löydy paikallisesti

# # --- Etäpalvelimen tiedot ----------------------------------------------------
# REMOTE_USER="administrator"
# REMOTE_HOST="81.88.23.109"
# PROJECT_ROOT="/home/administrator/easelect"

# # --- Oletusasetukset ---------------------------------------------------------
# COPY_SQL=false
# DELETE_EXTRAS=false

# # --- Parametrien käsittely ---------------------------------------------------
# while [[ "$#" -gt 0 ]]; do
#   case "$1" in
#     -s|--sql)    COPY_SQL=true  ;;
#     -d|--delete) DELETE_EXTRAS=true ;;
#     *)  echo "Tuntematon parametri: $1"; exit 1 ;;
#   esac
#   shift
# done

# # --- Yhteinen SSH-komento ----------------------------------------------------
# SSH_CMD="ssh -i ~/.ssh/easelect_key -o BatchMode=yes -o IdentitiesOnly=yes"

# # Rsync käyttää samaa yhteyttä
# RSYNC_OPTIONS=(-av --progress -e "$SSH_CMD")
# $DELETE_EXTRAS && RSYNC_OPTIONS+=(--delete)

# # --- Varmista etäkohde -------------------------------------------------------
# $SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${PROJECT_ROOT}"

# # --- 1) easelect-binaari -----------------------------------------------------
# echo "🟢 Kopioidaan easelect-binaari..."
# rsync "${RSYNC_OPTIONS[@]}" ./easelect \
#       "${REMOTE_USER}@${REMOTE_HOST}:${PROJECT_ROOT}/easelect"

# # --- 2) .env-tiedosto ---------------------------------------------------------
# if [[ -f ".env" ]]; then
#   echo "🟢 Kopioidaan .env..."
#   rsync "${RSYNC_OPTIONS[@]}" ./.env \
#         "${REMOTE_USER}@${REMOTE_HOST}:${PROJECT_ROOT}/.env"
#   $SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" "chmod 600 ${PROJECT_ROOT}/.env"
# else
#   echo "⚠️  .env-tiedostoa ei löytynyt – ei kopioida."
# fi

# # --- 3) frontend --------------------------------------------------------------
# echo "🟢 Kopioidaan frontend-kansio..."
# rsync "${RSYNC_OPTIONS[@]}" ./frontend/ \
#       "${REMOTE_USER}@${REMOTE_HOST}:${PROJECT_ROOT}/frontend/"

# # --- 4) media -----------------------------------------------------------------
# echo "🟢 Kopioidaan media-kansio..."
# rsync "${RSYNC_OPTIONS[@]}" ./media/ \
#       "${REMOTE_USER}@${REMOTE_HOST}:${PROJECT_ROOT}/media/"

# # --- 5) Tietokantadumpit (valinnainen) ----------------------------------------
# if $COPY_SQL; then
#   echo "🟢 Etsitään tuoreimmat dumpit db_backups-kansiosta..."

#   newest_db=$(ls -t ./db_backups/easelect-* 2>/dev/null | head -n1 || true)
#   newest_roles=$(ls -t ./db_backups/roles-* 2>/dev/null | head -n1 || true)

#   if [[ -z "$newest_db" && -z "$newest_roles" ]]; then
#     echo "⚠️  Dump-tiedostoja ei löytynyt. Kopio jätetään väliin."
#   else
#     $SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${PROJECT_ROOT}/db_backups"

#     if [[ -n "$newest_db" ]]; then
#       echo "   • Kopioidaan: $(basename "$newest_db")"
#       rsync "${RSYNC_OPTIONS[@]}" "$newest_db" \
#             "${REMOTE_USER}@${REMOTE_HOST}:${PROJECT_ROOT}/db_backups/"
#     fi

#     if [[ -n "$newest_roles" ]]; then
#       echo "   • Kopioidaan: $(basename "$newest_roles")"
#       rsync "${RSYNC_OPTIONS[@]}" "$newest_roles" \
#             "${REMOTE_USER}@${REMOTE_HOST}:${PROJECT_ROOT}/db_backups/"
#     fi

#     $SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" \
#         "chmod 644 ${PROJECT_ROOT}/db_backups/* 2>/dev/null || true"
#   fi
# fi

# # --- 6) Oikeuksien fixaus -----------------------------------------------------
# $SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" <<EOF
# chmod 755 ${PROJECT_ROOT}/easelect
# chmod -R 755 ${PROJECT_ROOT}/frontend ${PROJECT_ROOT}/media
# EOF

# echo "✅  Kopiointi valmis!"

# # #!/bin/bash
# # # nimiehdotus: deploy.sh

# # # Etäpalvelimen tiedot
# # REMOTE_USER="administrator"         # Korvaa omalla etäpalvelimen käyttäjänimelläsi
# # REMOTE_HOST="185.117.250.236"       # Korvaa etäpalvelimen hostname tai IP
# # PROJECT_ROOT="/home/administrator/easelect"  # Projektin juurikansio etäkoneella

# # # Oletusasetukset
# # COPY_SQL=false
# # DELETE_EXTRAS=false

# # # Käsitellään parametrit
# # while [[ "$#" -gt 0 ]]; do
# #     case "$1" in
# #         -s|--sql)
# #             COPY_SQL=true
# #             ;;
# #         -d|--delete)
# #             DELETE_EXTRAS=true
# #             ;;
# #         *)
# #             echo "Tuntematon parametri: $1"
# #             exit 1
# #             ;;
# #     esac
# #     shift
# # done

# # # Luodaan projektikansio, jos sitä ei vielä ole
# # ssh "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $PROJECT_ROOT"

# # # Valitaan rsyncin perusoptiot
# # RSYNC_OPTIONS=(-av --progress)

# # # Jos -d / --delete on päällä, poistetaan etäpäästä tiedostot, joita ei enää löydy paikallisesti
# # if [ "$DELETE_EXTRAS" = true ]; then
# #     RSYNC_OPTIONS+=("--delete")
# # fi

# # echo "Kopioidaan easelect-binaari projektin juureen..."
# # rsync "${RSYNC_OPTIONS[@]}" ./easelect "$REMOTE_USER@$REMOTE_HOST:$PROJECT_ROOT/easelect"

# # # Kopioidaan .env, jos se on olemassa
# # if [ -f "./.env" ]; then
# #     echo "Kopioidaan .env..."
# #     rsync "${RSYNC_OPTIONS[@]}" ./.env "$REMOTE_USER@$REMOTE_HOST:$PROJECT_ROOT/.env"
# #     ssh "$REMOTE_USER@$REMOTE_HOST" "chmod 600 $PROJECT_ROOT/.env"
# # else
# #     echo "Varoitus: .env tiedostoa ei löytynyt – sitä ei kopioida."
# # fi

# # echo "Kopioidaan frontend-kansio projektin juureen..."
# # rsync "${RSYNC_OPTIONS[@]}" ./frontend/ "$REMOTE_USER@$REMOTE_HOST:$PROJECT_ROOT/frontend/"

# # echo "Kopioidaan media-kansio projektin juureen..."
# # rsync "${RSYNC_OPTIONS[@]}" ./media/ "$REMOTE_USER@$REMOTE_HOST:$PROJECT_ROOT/media/"

# # # Jos halutaan kopioida uusin SQL (lipulla -s / --sql), etsitään se ./others-kansiosta
# # if [ "$COPY_SQL" = true ]; then
# #     newest_sql=$(ls -t ./others/*.sql 2>/dev/null | head -1)
# #     if [ -z "$newest_sql" ]; then
# #         echo "Ei löytynyt .sql-tiedostoja hakemistosta ./others. Kopio jätetään väliin ☺"
# #     else
# #         echo "Kopioidaan uusin SQL-tiedosto: $newest_sql"
# #         ssh "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $PROJECT_ROOT/others"
# #         rsync "${RSYNC_OPTIONS[@]}" "$newest_sql" "$REMOTE_USER@$REMOTE_HOST:$PROJECT_ROOT/others/"
# #         ssh "$REMOTE_USER@$REMOTE_HOST" "chmod 644 $PROJECT_ROOT/others/$(basename "$newest_sql")"
# #     fi
# # fi

# # # Asetetaan käyttöoikeudet binäärille ja kansioille
# # ssh "$REMOTE_USER@$REMOTE_HOST" "chmod 755 $PROJECT_ROOT/easelect"
# # ssh "$REMOTE_USER@$REMOTE_HOST" "chmod -R 755 $PROJECT_ROOT/frontend $PROJECT_ROOT/media"

# # echo "Valmista! ☺"
