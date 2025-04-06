# nimiehdotus: copy_stuff.sh
#!/usr/bin/env bash

# Huom! Tämä skripti vaatii, että WSL-Ubuntussasi on asennettuna xclip:
#   sudo apt-get update
#   sudo apt-get install xclip
#
# Käyttö:
# 1) Tallenna tämä tiedosto esim. copy_stuff.sh-nimisenä.
# 2) Aseta suoritusoikeudet: chmod +x copy_stuff.sh
# 3) Suorita ./copy_stuff.sh

# Määritä aloitushakemisto
startDir="$(pwd)"

# Hae kaikki hakemistot (pois lukien node_modules-hakemistot)
# -type d = vain hakemistot
# -not -path "*/node_modules/*" = suljetaan pois node_modules
mapfile -t allDirs < <(find "$startDir" -type d -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/media/*" -not -path "*/others/*")


# Lisää aloitushakemisto listaan, jos se ei ole node_modules-polun sisällä
if [[ "$startDir" != *"node_modules"* ]]; then
  dirList=("$startDir" "${allDirs[@]}")
else
  dirList=("${allDirs[@]}")
fi

# Numeroi ja listaa hakemistot
echo "Hakemistot:"
counter=1
for dir in "${dirList[@]}"; do
  echo "$counter) $dir"
  ((counter++))
done

# Pyydä käyttäjää valitsemaan hakemisto
read -rp "Valitse hakemisto numero (1 - ${#dirList[@]}): " dirChoice

# Tarkista, että valinta on validi numero
if ! [[ "$dirChoice" =~ ^[0-9]+$ ]] || (( dirChoice < 1 || dirChoice > ${#dirList[@]} )); then
  echo "Virheellinen valinta. Suoritus keskeytetään."
  exit 1
fi

# Haetaan valittu hakemisto
selectedDir="${dirList[$((dirChoice - 1))]}"

# Pyydä tiedostopäätteet
read -rp "Anna haettavat tiedostopäätteet pilkulla erotettuna (esim. html,js,go): " extensionsInput

# Poistetaan mahdolliset välilyönnit ja jaetaan taulukoksi
IFS=',' read -ra extensions <<<"$(echo "$extensionsInput" | tr -d ' ')"

# Kysy halutaanko kopioida sekä polut että sisällöt (1) vai pelkät polut (2)
echo "Valitse toiminto (1 tai 2):"
echo "1) Kopioi polut ja sisällöt"
echo "2) Kopioi pelkät polut"
read -rp "Syötä valintasi (1 tai 2): " choice

if [[ "$choice" != "1" && "$choice" != "2" ]]; then
  echo "Virheellinen valinta. Suoritus keskeytetään."
  exit 1
fi

# Etsitään tiedostot suodattimilla valitusta hakemistosta
# ja poistetaan node_modules-polun sisällä olevat
files=()
for ext in "${extensions[@]}"; do
  while IFS= read -r -d '' file; do
    files+=("$file")
  done < <(find "$selectedDir" -type f -name "*.$ext" -not -path "*/node_modules/*" -print0)
done

# Poistetaan duplikaatit
declare -A seen
uniqueFiles=()
for file in "${files[@]}"; do
  if [[ -z "${seen["$file"]}" ]]; then
    seen["$file"]=1
    uniqueFiles+=("$file")
  fi
done
files=("${uniqueFiles[@]}")

# Tarkista, löytyikö tiedostoja
if (( ${#files[@]} == 0 )); then
  echo "Valitusta hakemistosta ei löytynyt yhtään tiedostoa annetuilla päätteillä."
  exit 0
fi

# Rakennetaan sisältö, joka kopioidaan leikepöydälle
clipboardContent=""

if [[ "$choice" == "1" ]]; then
  # Kopioi polut ja sisällöt
  for filePath in "${files[@]}"; do
    clipboardContent+="Polku: $filePath\n"
    clipboardContent+="Data:\n"
    # Luetaan tiedoston koko sisältö
    fileContent=$(< "$filePath")
    clipboardContent+="$fileContent\n\n"
  done
else
  # Kopioi pelkät polut
  for filePath in "${files[@]}"; do
    clipboardContent+="$filePath\n"
  done
fi

# Tarkista onko jokin sisältö kopioitavaksi
if [[ -z "$clipboardContent" ]]; then
  echo "Ei sisältöä kopioitavaksi."
  exit 0
fi

# Kopioidaan leikepöydälle xclipin avulla
# -selection clipboard = käytä varsinaista leikepöytää
# -i = lue stdin
echo -e "$clipboardContent" | xclip -selection clipboard -i

echo "Tiedot on kopioitu leikepöydälle."
