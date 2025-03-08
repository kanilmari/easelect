#!/usr/bin/env bash

# build_and_run.sh
# Rakennetaan easelect ja ajetaan se.
# Jos easelect on jo käynnissä, suljetaan se ennen ajamista.

# Lopetetaan skripti virheeseen, jos jokin komento palauttaa != 0.
set -e

# 1) Tarkistetaan, onko easelect-prosessi jo käynnissä
pid=$(pgrep -f '^./easelect' || true)
if [ "$pid" ]; then
    echo "Löytyi käynnissä oleva 'easelect'-prosessi pid=$pid, lopetetaan se."
    kill "$pid"
    # Odotetaan prosessin loppumista sekunnin verran
    # (Lisää lokitusta halutessasi.)
    sleep 1
fi

# 2) Käännetään easelect
echo "Käännetään Go-easelect..."
go build

# 3) Ajetaan tuloksena syntynyt binääri
echo "Ajetaan ./easelect"
./easelect
