/* check_js_imports.js

Käyttö:
   node check_js_imports.js [polku/pääskripti.js] [--fix-imports]

Oletus: "main.js" jos et anna polkua.

Skripti:
 - Rekursiivisesti parseaa import-lauseet kaikista tiedostoista,
 - Tarkistaa polut (löytyykö tiedosto),
 - Etsii samannimistä tiedostoa projektista, jos polkua ei löydy,
 - Päivittää import-lauseen, jos löytyy täsmälleen 1 match.

Yhteenveto lopuksi:
   X virhettä, Y OK, yhteensä Z importtia.
*/

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Jotta emme käsittelisi samoja tiedostoja moneen kertaan, pidetään kirjaa
const kasitellyt_tiedostot = new Set();

// Laskurit
let yhteensa_importteja = 0;
let virheita = 0;
let ok_count = 0;

/**
 * Parsii tiedoston JS importit, korjaa tarvittaessa polut, ja
 * rekursiivisesti käsittelee importoidut moduulit.
 */
function kasittele_tiedosto(tiedostoPolku, korjaa_importit) {
  // Jos jo käsitelty, hyppää yli (vältetään loputon kierto)
  if (kasitellyt_tiedostot.has(tiedostoPolku)) {
    return;
  }
  kasitellyt_tiedostot.add(tiedostoPolku);

  // Lue tiedosto
  let sisalto;
  try {
    sisalto = fs.readFileSync(tiedostoPolku, 'utf8');
  } catch (err) {
    console.error(`\x1b[31mvirhe:\x1b[0m tiedoston lukeminen epäonnistui: ${tiedostoPolku} -> ${err.message}`);
    return;
  }

  // Hajotetaan rivit, jotta voimme muokata import-lauseita
  const rivit = sisalto.split('\n');
  let muutoksia = false;

  // Etsitään import-lauseita regexillä.
  // Huom: Yksinkertainen regex, ei kata dynaamisia import() yms.
  // Ottaa muodon: import ... from '..." tai "import ... from "..."
  const importKaava = /import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;

  // Käydään importit läpi rivitasolla
  for (let riviIndex = 0; riviIndex < rivit.length; riviIndex++) {
    let rivi = rivit[riviIndex];
    let match;
    while ((match = importKaava.exec(rivi)) !== null) {
      const alkuperainenPolku = match[1]; // esim './logical_components/table_views/view_table.js'
      yhteensa_importteja++;

      // Vain jos alkaa ./ tai ../, yritetään tarkistaa tiedoston olemassaoloa
      if (alkuperainenPolku.startsWith('./') || alkuperainenPolku.startsWith('../')) {
        // Katso onko absoluuttinen polku olemassa
        const absoluuttinen = path.resolve(path.dirname(tiedostoPolku), alkuperainenPolku);

        if (fs.existsSync(absoluuttinen)) {
          ok_count++;
          // Rekursiivisesti käsitellään importattua moduulia
          kasittele_tiedosto(absoluuttinen, korjaa_importit);
        } else {
          // Ei löydy => korjausyritys tai virhe
          if (korjaa_importit) {
            // Kokeile etsiä projektista sama tiedostonimi
            const tiedostonNimi = path.basename(alkuperainenPolku);
            const matches = glob.sync(`**/${tiedostonNimi}`, { nodir: true });

            if (matches.length === 1) {
              // Löytyi täsmälleen yksi match
              const loytynyt = path.resolve(matches[0]);
              // Lasketaan uusi polku suhteessa käsiteltävään tiedostoon
              const uusiRelative = path.relative(path.dirname(tiedostoPolku), loytynyt)
                .replace(/\\/g, '/'); // Windows-takakauttaviivat -> kauttaviivat

              console.log(`\x1b[33mkorjataan:\x1b[0m '${alkuperainenPolku}' -> '${uusiRelative}' (${tiedostonPolku})`);
              // Muokataan riviä
              const korjattu = rivi.replace(alkuperainenPolku, uusiRelative);
              rivi = korjattu; // Paivitetään rivi
              rivit[riviIndex] = rivi;
              muutoksia = true;
              ok_count++;

              // Käsitellään rekursiivisesti löytynyt moduuli
              kasittele_tiedosto(loytynyt, korjaa_importit);
            } else if (matches.length === 0) {
              virheita++;
              console.error(`\x1b[31mvirhe:\x1b[0m ei löytynyt tiedostoa '${alkuperainenPolku}', eikä vastaavaa nimeä projektista.`);
            } else {
              virheita++;
              console.error(`\x1b[31mvirhe:\x1b[0m ei löytynyt tiedostoa '${alkuperainenPolku}'. Useita samannimisiä: ${matches}`);
            }
          } else {
            virheita++;
            console.error(`\x1b[31mvirhe:\x1b[0m tiedostoa '${alkuperainenPolku}' ei löydy (viite: ${tiedostoPolku})`);
          }
        }
      } else {
        // Ei-relatiivinen import (esim. 'react' tai '/absolute/path') - jätetään rauhaan
        ok_count++;
      }
    }
  }

  // Jos jokin import-polku korjattiin, kirjoitetaan takaisin tiedostoon
  if (muutoksia) {
    const uusiSisalto = rivit.join('\n');
    fs.writeFileSync(tiedostoPolku, uusiSisalto, 'utf8');
    console.log(`\x1b[32mTiedosto "${tiedostoPolku}" päivitetty.\x1b[0m`);
  }
}

function paafunktio() {
  // Poimitaan komentoriviparametrit
  const entryPoint = process.argv[2] && !process.argv[2].startsWith('--')
    ? process.argv[2]
    : 'main.js';
  const korjaa_importit = process.argv.includes('--fix-imports');

  kasittele_tiedosto(entryPoint, korjaa_importit);

  // Yhteenveto
  if (yhteensa_importteja === 0) {
    console.log('\x1b[33mEi löytynyt lainkaan import-lauseita.\x1b[0m');
  } else {
    console.log(`${virheita} virhettä, ${ok_count} OK, yhteensä ${yhteensa_importteja} importtia.`);
  }
}

paafunktio();
