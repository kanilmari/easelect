/* check_css_imports.js

Käyttö:
   1) Vain tarkistus:
      node check_css_imports.js [polku/import.css]
   2) Tarkistus + automaattiset korjaukset:
      node check_css_imports.js [polku/import.css] --fix-imports
      esim. juuressa:
      node .\frontend\css\check_css_imports.js .\frontend\css\imports.css --fix-imports

Lisäys: 
   npm install glob

Tämä etsii @import "xxx.css" ja @import url("xxx.css") -rivit, 
varmistaa tiedostojen olemassaolon ja tulostaa virheet punaisella. 
Jos --fix-imports on annettu ja tiedostoa ei löydy, se etsii samannimistä 
CSS-tiedostoa projektista globilla. 
- Jos löytyy tasan 1 osuma, päivitetään import-rivi. 
- Uusi polku kirjoitetaan aina kauttaviivoilla (/). 
Lopuksi tulostetaan yhteenveto:
   "4 virhettä, 18 OK, yhteensä 22 importtia."
*/

const fs = require('fs');
const path = require('path');
const glob = require('glob');

function tarkista_ja_korjaa_import_tiedostot() {
  // Poimitaan komentoriviparametrit
  const import_tiedosto = process.argv[2] && !process.argv[2].startsWith('--')
    ? process.argv[2]
    : 'import.css';

  // --fix-imports -valitsin
  const korjaa_importit = process.argv.includes('--fix-imports');

  // Yritetään lukea tiedosto
  let sisalto;
  try {
    sisalto = fs.readFileSync(import_tiedosto, 'utf8');
  } catch (err) {
    console.error(`\x1b[31mvirhe:\x1b[0m tiedoston lukeminen epäonnistui: ${err.message}`);
    return;
  }

  // Regex etsii molemmat muodot: @import url("xxx") ja @import "xxx"
  const import_kaava = /@import\s*(?:url\(\s*(['"])([^'"]+)\1\s*\)|(['"])([^'"]+)\3)/g;
  
  let osuma;
  let yhteensa = 0;
  let virheita = 0;
  let paivitetyt_rivit = 0;
  let ok_count = 0; // Lasketaan onnistuneet importit

  // Hajotetaan tiedosto rivikohtaisesti, jotta voimme päivittää riviä tarpeen mukaan
  const rivit = sisalto.split('\n');

  while ((osuma = import_kaava.exec(sisalto)) !== null) {
    yhteensa++;

    // polku_css on se importattu tiedosto
    const polku_css = osuma[2] || osuma[4];
    if (!polku_css) {
      continue;
    }

    // Lasketaan importin absoluuttinen sijainti
    const tarkka_polku = path.resolve(path.dirname(import_tiedosto), polku_css);

    if (fs.existsSync(tarkka_polku)) {
      // Tiedosto löytyy
      ok_count++;
    } else {
      // Tiedostoa ei löydy → virhe tai korjausyritys
      if (korjaa_importit) {
        // Korjausyritys: etsitään projektista samannimistä tiedostoa
        const tiedoston_nimi = path.basename(polku_css);
        const matches = glob.sync(`**/${tiedoston_nimi}`, { nodir: true });

        if (matches.length === 1) {
          // Löytyi täsmälleen yksi match
          const loytynyt_taydellinen_polku = path.resolve(matches[0]);
          // Lasketaan uusi polku suhteessa import.css -tiedostoon
          const uusi_suhteellinen_polku = path.relative(
            path.dirname(import_tiedosto),
            loytynyt_taydellinen_polku
          );
          // Muutetaan polun erottimet kauttaviivoiksi
          const polku_kauttaviivoilla = uusi_suhteellinen_polku.replace(/\\/g, '/');

          console.log(`\x1b[33mkorjataan:\x1b[0m "${polku_css}" -> "${polku_kauttaviivoilla}"`);

          // Päivitetään import-rivi tiedostoon
          for (let i = 0; i < rivit.length; i++) {
            if (rivit[i].includes(polku_css)) {
              rivit[i] = rivit[i].replace(polku_css, polku_kauttaviivoilla);
              paivitetyt_rivit++;
              // Oletetaan että rivi sisältää import-lauseen vain kerran
              break;
            }
          }
          ok_count++; // Nyt import on korjattu → “OK”
        } else if (matches.length === 0) {
          virheita++;
          console.error(
            `\x1b[31mvirhe:\x1b[0m tiedostoa ei löydy polulle "${polku_css}" eikä vastaavaa nimeä muualta projektista.`
          );
        } else {
          virheita++;
          console.error(
            `\x1b[31mvirhe:\x1b[0m tiedostoa ei löydy polulle "${polku_css}". Löytyi useita samannimisiä: ${matches}`
          );
        }
      } else {
        virheita++;
        console.error(`\x1b[31mvirhe:\x1b[0m tiedostoa ei löydy polulle "${polku_css}" (resolvoitu: ${tarkka_polku})`);
      }
    }
  }

  // 4) Kirjoitetaan tiedosto vain jos korjauksia tehtiin
  if (paivitetyt_rivit > 0) {
    const uusi_sisalto = rivit.join('\n');
    try {
      fs.writeFileSync(import_tiedosto, uusi_sisalto, 'utf8');
      console.log(`\x1b[32mTiedosto "${import_tiedosto}" päivitetty (${paivitetyt_rivit} riviä muutettu).\x1b[0m`);
    } catch (err) {
      console.error(`\x1b[31mvirhe:\x1b[0m tiedoston kirjoittaminen epäonnistui: ${err.message}`);
    }
  }

  // 5) Yhteenveto
  if (yhteensa === 0) {
    console.log('\x1b[33mEi löytynyt lainkaan @import -rivejä.\x1b[0m');
  } else {
    // Esimerkiksi: "4 virhettä, 18 OK, yhteensä 22 importtia."
    console.log(`${virheita} virhettä, ${ok_count} OK, yhteensä ${yhteensa} importtia.`);
  }
}

// Suoritetaan pääfunktio
tarkista_ja_korjaa_import_tiedostot();