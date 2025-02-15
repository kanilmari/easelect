# Määritä aloitushakemisto
$startDir = Get-Location

# Hae kaikki hakemistot ja alihakemistot, suodata pois node_modules
$dirs = Get-ChildItem -Path $startDir -Directory -Recurse |
    Where-Object { $_.FullName -notmatch "node_modules" }

# Lisää aloitushakemisto listaan (jos aloittavassa ei ole node_modules)
if ($startDir.FullName -notmatch "node_modules") {
    $dirList = @($startDir) + $dirs
} else {
    $dirList = $dirs
}

# Numeroi ja listaa hakemistot
$counter = 1
foreach ($dir in $dirList) {
    Write-Host "$counter) $($dir.FullName)"
    $counter++
}

# Pyydä käyttäjää valitsemaan hakemisto
$dirChoice = Read-Host "Valitse hakemisto numero (1 - $($dirList.Count))"
$dirChoice = [int]$dirChoice

if ($dirChoice -ge 1 -and $dirChoice -le $dirList.Count) {
    $selectedDir = $dirList[$dirChoice - 1]
} else {
    Write-Host "Virheellinen valinta. Suoritus keskeytetaan."
    exit
}

# Pyydä käyttäjää syöttämään tiedostopäätteet
$extensionsInput = Read-Host "Anna haettavat tiedostopaateet pilkulla erotettuna (esim. html,js,go)"
# Poistetaan mahdolliset välilyönnit ja jaetaan merkkijono taulukoksi
$extensions = $extensionsInput -split ',' | ForEach-Object { $_.Trim() }

# Kysy käyttäjältä haluaako hän kopioida polut ja sisällöt vai pelkät polut
Write-Host "Valitse toiminto (1 tai 2):"
Write-Host "1) Kopioi polut ja sisallot"
Write-Host "2) Kopioi pelkat polut"
$choice = Read-Host "Syota valintasi (1 tai 2)"

# Varmista, että käyttäjän valinta on joko "1" tai "2"
if ($choice -ne "1" -and $choice -ne "2") {
    Write-Host "Virheellinen valinta. Suoritus keskeytetaan."
    exit
}

# Muodosta suodatinmerkkijonot tiedostopäätteistä
$filters = $extensions | ForEach-Object { "*.$_" }

# Hae tiedostot valitusta hakemistosta rekursiivisesti käyttäen suodattimia
# Suodata pois myös ne, joiden polussa on node_modules
$files = @()
foreach ($filter in $filters) {
    $files += Get-ChildItem -Path $selectedDir.FullName -Filter $filter -Recurse -File |
        Where-Object { $_.FullName -notmatch "node_modules" }
}

# Poistetaan mahdolliset duplikaatit
$files = $files | Select-Object -Unique

# Tarkista löytyikö tiedostoja
if ($files.Count -eq 0) {
    Write-Host "Valitusta hakemistosta ei loytynyt yhtaan tiedostoa annetuilla paatteilla."
    exit
}

# Luo muuttuja leikepöydän sisältöä varten
$clipboardContent = ""

if ($choice -eq "1") {
    foreach ($file in $files) {
        # Lisää tiedoston polku ja sisältö leikepöydän sisältöön
        $clipboardContent += "Polku: $($file.FullName)`n"
        $clipboardContent += "Data:`n"
        $clipboardContent += Get-Content -Path $file.FullName -Raw
        $clipboardContent += "`n`n" # Tyhjä rivi erottimeksi
    }
} elseif ($choice -eq "2") {
    foreach ($file in $files) {
        # Lisää tiedoston polku leikepöydän sisältöön
        $clipboardContent += "$($file.FullName)`n"
    }
}

# Tarkista onko $clipboardContent tyhjä tai null
if ([string]::IsNullOrEmpty($clipboardContent)) {
    Write-Host "Ei sisaltoa kopioitavaksi."
    exit
}

# Kopioi sisältö leikepöydälle
$clipboardContent | Set-Clipboard
Write-Host "Tiedot on kopioitu leikepoydalle."


# # Määritä aloitushakemisto
# $startDir = Get-Location

# # Hae kaikki hakemistot ja alihakemistot
# $dirs = Get-ChildItem -Path $startDir -Directory -Recurse

# # Lisää aloitushakemisto listaan
# $dirList = @($startDir) + $dirs

# # Numeroi ja listaa hakemistot
# $counter = 1
# foreach ($dir in $dirList) {
#     Write-Host "$counter) $($dir.FullName)"
#     $counter++
# }

# # Pyydä käyttäjää valitsemaan hakemisto
# $dirChoice = Read-Host "Valitse hakemisto numero (1 - $($dirList.Count))"
# $dirChoice = [int]$dirChoice

# if ($dirChoice -ge 1 -and $dirChoice -le $dirList.Count) {
#     $selectedDir = $dirList[$dirChoice - 1]
# } else {
#     Write-Host "Virheellinen valinta. Suoritus keskeytetaan."
#     exit
# }

# # Pyydä käyttäjää syöttämään tiedostopäätteet
# $extensionsInput = Read-Host "Anna haettavat tiedostopaateet pilkulla erotettuna (esim. html,js,go)"
# # Poistetaan mahdolliset välilyönnit ja jaetaan merkkijono taulukoksi
# $extensions = $extensionsInput -split ',' | ForEach-Object { $_.Trim() }

# # Kysy käyttäjältä haluaako hän kopioida polut ja sisällöt vai pelkät polut
# Write-Host "Valitse toiminto (1 tai 2):"
# Write-Host "1) Kopioi polut ja sisallot"
# Write-Host "2) Kopioi pelkat polut"
# $choice = Read-Host "Syota valintasi (1 tai 2)"

# # Varmista, että käyttäjän valinta on joko "1" tai "2"
# if ($choice -ne "1" -and $choice -ne "2") {
#     Write-Host "Virheellinen valinta. Suoritus keskeytetaan."
#     exit
# }

# # Muodosta suodatinmerkkijonot tiedostopäätteistä
# $filters = $extensions | ForEach-Object { "*.$_" }

# # Hae tiedostot valitusta hakemistosta rekursiivisesti käyttäen suodattimia
# $files = @()
# foreach ($filter in $filters) {
#     $files += Get-ChildItem -Path $selectedDir.FullName -Filter $filter -Recurse -File
# }

# # Poistetaan mahdolliset duplikaatit
# $files = $files | Select-Object -Unique

# # Tarkista löytyikö tiedostoja
# if ($files.Count -eq 0) {
#     Write-Host "Valitusta hakemistosta ei loytynyt yhtaan tiedostoa annetuilla paatteilla."
#     exit
# }

# # Luo muuttuja leikepöydän sisältöä varten
# $clipboardContent = ""

# if ($choice -eq "1") {
#     foreach ($file in $files) {
#         # Lisää tiedoston polku ja sisältö leikepöydän sisältöön
#         $clipboardContent += "Polku: $($file.FullName)`n"
#         $clipboardContent += "Data:`n"
#         $clipboardContent += Get-Content -Path $file.FullName -Raw
#         $clipboardContent += "`n`n" # Lisää tyhjä rivi erottimeksi
#     }
# } elseif ($choice -eq "2") {
#     foreach ($file in $files) {
#         # Lisää tiedoston polku leikepöydän sisältöön
#         $clipboardContent += "$($file.FullName)`n"
#     }
# }

# # Tarkista onko $clipboardContent tyhjä tai null
# if ([string]::IsNullOrEmpty($clipboardContent)) {
#     Write-Host "Ei sisaltoa kopioitavaksi."
#     exit
# }

# # Kopioi sisältö leikepöydälle
# $clipboardContent | Set-Clipboard
# Write-Host "Tiedot on kopioitu leikepoydalle."
