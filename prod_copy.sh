#!/bin/bash
# nimiehdotus: deploy.sh

# Etäpalvelimen tiedot
REMOTE_USER="administrator"         # Korvaa omalla etäpalvelimen käyttäjänimelläsi
REMOTE_HOST="185.117.250.236"       # Korvaa etäpalvelimen hostname tai IP
PROJECT_ROOT="/home/administrator/easelect"  # Projektin juurikansio etäkoneella

# Oletusasetukset
COPY_SQL=false
DELETE_EXTRAS=false

# Käsitellään parametrit
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        -s|--sql)
            COPY_SQL=true
            ;;
        -d|--delete)
            DELETE_EXTRAS=true
            ;;
        *)
            echo "Tuntematon parametri: $1"
            exit 1
            ;;
    esac
    shift
done

# Luodaan projektikansio, jos sitä ei vielä ole
ssh "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $PROJECT_ROOT"

# Valitaan rsyncin perusoptiot
RSYNC_OPTIONS=(-av --progress)

# Jos -d / --delete on päällä, poistetaan etäpäästä tiedostot, joita ei enää löydy paikallisesti
if [ "$DELETE_EXTRAS" = true ]; then
    RSYNC_OPTIONS+=("--delete")
fi

echo "Kopioidaan easelect-binaari projektin juureen..."
rsync "${RSYNC_OPTIONS[@]}" ./easelect "$REMOTE_USER@$REMOTE_HOST:$PROJECT_ROOT/easelect"

# Kopioidaan .env, jos se on olemassa
if [ -f "./.env" ]; then
    echo "Kopioidaan .env..."
    rsync "${RSYNC_OPTIONS[@]}" ./.env "$REMOTE_USER@$REMOTE_HOST:$PROJECT_ROOT/.env"
    ssh "$REMOTE_USER@$REMOTE_HOST" "chmod 600 $PROJECT_ROOT/.env"
else
    echo "Varoitus: .env tiedostoa ei löytynyt – sitä ei kopioida."
fi

echo "Kopioidaan frontend-kansio projektin juureen..."
rsync "${RSYNC_OPTIONS[@]}" ./frontend/ "$REMOTE_USER@$REMOTE_HOST:$PROJECT_ROOT/frontend/"

echo "Kopioidaan media-kansio projektin juureen..."
rsync "${RSYNC_OPTIONS[@]}" ./media/ "$REMOTE_USER@$REMOTE_HOST:$PROJECT_ROOT/media/"

# Jos halutaan kopioida uusin SQL (lipulla -s / --sql), etsitään se ./others-kansiosta
if [ "$COPY_SQL" = true ]; then
    newest_sql=$(ls -t ./others/*.sql 2>/dev/null | head -1)
    if [ -z "$newest_sql" ]; then
        echo "Ei löytynyt .sql-tiedostoja hakemistosta ./others. Kopio jätetään väliin ☺"
    else
        echo "Kopioidaan uusin SQL-tiedosto: $newest_sql"
        ssh "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $PROJECT_ROOT/others"
        rsync "${RSYNC_OPTIONS[@]}" "$newest_sql" "$REMOTE_USER@$REMOTE_HOST:$PROJECT_ROOT/others/"
        ssh "$REMOTE_USER@$REMOTE_HOST" "chmod 644 $PROJECT_ROOT/others/$(basename "$newest_sql")"
    fi
fi

# Asetetaan käyttöoikeudet binäärille ja kansioille
ssh "$REMOTE_USER@$REMOTE_HOST" "chmod 755 $PROJECT_ROOT/easelect"
ssh "$REMOTE_USER@$REMOTE_HOST" "chmod -R 755 $PROJECT_ROOT/frontend $PROJECT_ROOT/media"

echo "Valmista! ☺"
