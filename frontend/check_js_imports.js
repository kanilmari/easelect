/* check_js_imports.js

Käyttö:
   node check_js_imports.js [polku/pääskripti.js] [--fix-imports] [--exclude=hakemisto/**,file.js, ... ]

Oletus: "main.js" jos et anna polkua.

Skripti:
 - Rekursiivisesti parseaa import-lauseet kaikista tiedostoista,
 - Tarkistaa polut (löytyykö tiedosto),
 - Etsii samannimistä tiedostoa projektista, jos polkua ei löydy,
 - Korjaa import-lauseen (lisää relatiivisen polun), jos löytyy täsmälleen 1 match,
   tai jos polku on puutteellinen (esim. "endpoints/...").

Yhteenveto lopuksi:
   X virhettä, Y OK, yhteensä Z importtia.
   Tarkistettiin myös, montako tiedostoa käsiteltiin, ja listataan orvot tiedostot, sekä ekskludatut.
*/

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const kasitellyt_tiedostot = new Set();

let yhteensa_importteja = 0;
let virheita = 0;
let ok_count = 0;

/**
 * Palauttaa listan [start, end]-pareja, joissa koodi on kommenttien sisällä.
 * Käydään läpi sekä yksiriviset // ... että moniriviset /* ... *\/
 */
function etsi_kommenttialueet(sisalto) {
  const alueet = [];

  // Etsi yksiriviset kommentit
  const yksirivi = /\/\/[^\n]*/g;
  let osuma;
  while ((osuma = yksirivi.exec(sisalto)) !== null) {
    alueet.push([osuma.index, osuma.index + osuma[0].length]);
  }

  // Etsi moniriviset kommentit
  const monirivi = /\/\*[\s\S]*?\*\//g;
  while ((osuma = monirivi.exec(sisalto)) !== null) {
    alueet.push([osuma.index, osuma.index + osuma[0].length]);
  }

  return alueet;
}

/**
 * Onko annettu indeksi jonkin kommenttialueen sisällä?
 */
function onko_indeksi_kommentissa(index, kommenttialueet) {
  for (const [alku, loppu] of kommenttialueet) {
    if (index >= alku && index < loppu) {
      return true;
    }
  }
  return false;
}

function onko_local_import_ilman_pisteita(polku) {
  return (!polku.startsWith('.') && polku.includes('/'));
}

function kasittele_tiedosto(tiedosto_polku, korjaa_importit) {
  if (kasitellyt_tiedostot.has(tiedosto_polku)) {
    return;
  }
  kasitellyt_tiedostot.add(tiedosto_polku);

  let sisalto;
  try {
    sisalto = fs.readFileSync(tiedosto_polku, 'utf8');
  } catch (err) {
    console.error(`\x1b[31mvirhe: %s\x1b[0m`, err.message);
    return;
  }

  // Haetaan kommenttialueet
  const kommenttialueet = etsi_kommenttialueet(sisalto);

  // Kaksi erillistä regexiä:
  // 1) Nimetty import (esim. import { X } from 'polku';)
  const importKaavaNimetty = /import\s+[\w{}*$,\s]+\s+from\s+['"]([^'"]+)['"]/g;

  // 2) Sivuvaikutus‐import (esim. import 'polku';)
  const importKaavaSivuvaikutus = /import\s+['"]([^'"]+)['"]/g;

  let match;
  const importit = [];

  // Käydään läpi nimetyt importit
  while ((match = importKaavaNimetty.exec(sisalto)) !== null) {
    // Jos import-lause on kommentissa, hypätään yli
    if (onko_indeksi_kommentissa(match.index, kommenttialueet)) {
      continue;
    }

    const koko_import_lause = match[0];
    const alkuperainen_polku = match[1];
    importit.push({
      match_index: match.index,
      lause: koko_import_lause,
      polku: alkuperainen_polku
    });
  }

  // Käydään läpi sivuvaikutus‐importit
  while ((match = importKaavaSivuvaikutus.exec(sisalto)) !== null) {
    // Jos import-lause on kommentissa, hypätään yli
    if (onko_indeksi_kommentissa(match.index, kommenttialueet)) {
      continue;
    }

    const koko_import_lause = match[0];
    const alkuperainen_polku = match[1];
    importit.push({
      match_index: match.index,
      lause: koko_import_lause,
      polku: alkuperainen_polku
    });
  }

  // Jos ei löytynyt lainkaan importteja, voidaan palata
  if (importit.length === 0) {
    return;
  }

  if (importit.length === 0) {
    return; // ei importteja, ei muutettavaa, mutta tiedosto on nyt käsitelty
  }

  let sisalto_uusi = sisalto;
  let muutoksia = false;

  for (const imp of importit) {
    yhteensa_importteja++;
    const alkuperainen_polku = imp.polku;

    // 1) Relatiiviset
    if (alkuperainen_polku.startsWith('./') || alkuperainen_polku.startsWith('../')) {
      const absoluuttinen = path.resolve(path.dirname(tiedosto_polku), alkuperainen_polku);

      if (fs.existsSync(absoluuttinen)) {
        ok_count++;
        kasittele_tiedosto(absoluuttinen, korjaa_importit);
      } else {
        // Yritetään korjata
        if (korjaa_importit) {
          const tiedoston_nimi = path.basename(alkuperainen_polku);
          const matches = glob.sync(`**/${tiedoston_nimi}`, { nodir: true });
          if (matches.length === 1) {
            const loytynyt = path.resolve(matches[0]);
            let uusi_rel = path
              .relative(path.dirname(tiedosto_polku), loytynyt)
              .replace(/\\/g, '/');

            if (!uusi_rel.startsWith('.')) {
              uusi_rel = './' + uusi_rel;
            }
            console.log(`\x1b[33mkorjataan:\x1b[0m '${alkuperainen_polku}' -> '${uusi_rel}' (${tiedosto_polku})`);

            const vanha_lause = imp.lause;
            const korjattu_lause = vanha_lause.replace(alkuperainen_polku, uusi_rel);

            sisalto_uusi = sisalto_uusi.replace(vanha_lause, korjattu_lause);
            muutoksia = true;
            ok_count++;

            kasittele_tiedosto(loytynyt, korjaa_importit);
          } else if (matches.length === 0) {
            virheita++;
            console.error(
              `\x1b[31mvirhe: ei löytynyt tiedostoa '${absoluuttinen}', `
              + `eikä vastaavaa nimeä projektista. (alkuperäinen import: '${alkuperainen_polku}', `
              + `viite: '${tiedosto_polku}')`
            );
          } else {
            virheita++;
            console.error(
              `\x1b[31mvirhe: ei löytynyt tiedostoa '${absoluuttinen}'. Useita samannimisiä: ${matches} `
              + `(alkuperäinen: '${alkuperainen_polku}', viite: '${tiedosto_polku}')`
            );
          }
        } else {
          virheita++;
          console.error(
            `\x1b[31mvirhe: tiedostoa '${absoluuttinen}' ei löydy `
            + `(alkuperäinen import: '${alkuperainen_polku}', viite: '${tiedosto_polku}')`
          );
        }
      }
    }

    // 2) Paikallinen polku ilman pisteitä
    else if (onko_local_import_ilman_pisteita(alkuperainen_polku)) {
      const polku_oletuksella = './' + alkuperainen_polku;
      const absoluuttinen = path.resolve(path.dirname(tiedosto_polku), polku_oletuksella);

      if (fs.existsSync(absoluuttinen)) {
        if (korjaa_importit) {
          console.log(
            `\x1b[33mkorjataan:\x1b[0m '${alkuperainen_polku}' -> '${polku_oletuksella}' (${tiedosto_polku})`
          );

          const vanha_lause = imp.lause;
          const korjattu_lause = vanha_lause.replace(alkuperainen_polku, polku_oletuksella);

          sisalto_uusi = sisalto_uusi.replace(vanha_lause, korjattu_lause);
          muutoksia = true;
          ok_count++;

          kasittele_tiedosto(absoluuttinen, korjaa_importit);
        } else {
          virheita++;
          console.error(
            `\x1b[31mvirhe: import '${alkuperainen_polku}' näyttää paikalliselta tiedostolta, `
            + `mutta se ei ala './' tai '../'. (viite: '${tiedosto_polku}')`
          );
        }
      } else {
        virheita++;
        console.error(
          `\x1b[31mvirhe: import '${alkuperainen_polku}' ei ala './' tai '../', `
          + `mutta tiedostoa '${absoluuttinen}' ei löytynyt. (viite: '${tiedosto_polku}')`
        );
      }
    }

    // 3) Oletetaan npm-paketti
    else {
      ok_count++;
    }
  }

  if (muutoksia) {
    fs.writeFileSync(tiedosto_polku, sisalto_uusi, 'utf8');
    console.log(`\x1b[32mTiedosto "${tiedosto_polku}" päivitetty.\x1b[0m`);
  }
}

function paafunktio() {
  // Luetaan komentoriviparametrit
  const args = process.argv.slice(2);
  let entryPoint = 'main.js';
  let korjaa_importit = false;
  let excludePatterns = [];

  for (const arg of args) {
    if (arg.startsWith('--exclude=')) {
      // Pilkotaan pilkkuerotelluiksi pattern-määrittelyiksi
      const exclStr = arg.replace('--exclude=', '');
      excludePatterns = exclStr
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    } else if (arg === '--fix-imports') {
      korjaa_importit = true;
    } else {
      // Oletetaan, että tämä on entry point
      entryPoint = arg;
    }
  }

  // Käydään entryPoint aina läpi, jos se on olemassa
  // (estetään sen ekskludointi, vaikka patternit sanoisivat toisin)
  if (!fs.existsSync(entryPoint)) {
    console.error(`\x1b[31mvirhe: tiedostoa '${entryPoint}' ei ole olemassa.\x1b[0m`);
    process.exit(1);
  }

  // Luodaan ignore-lista globaaleja hakuja varten.
  // node_modules/** on usein oletusignorena, ja sen päälle lisätään
  // käyttäjän antamat patternit.
  const defaultIgnore = ['node_modules/**'];
  const ignoreForAll = defaultIgnore.concat(excludePatterns);

  // 1) Käsitellään entryPoint
  kasittele_tiedosto(path.resolve(entryPoint), korjaa_importit);

  // 2) Haetaan kaikki JS-tiedostot, paitsi ignore-listatut (sekä node_modules).
  const kaikki_js_tiedostot = glob.sync('**/*.js', {
    nodir: true,
    ignore: ignoreForAll
  });

  // 3) Listataan excluded files.  
  //    Käydään läpi kaikki .js-tiedostot (myös node_modules) ja katsotaan mitkä
  //    jäävät ulos edellisestä hausta, koska pattern ignoraa ne.
  //    Käyttäjän excludePatterns + defaultIgnore = ignoreForAll.
  const excluded_glob = glob.sync('**/*.js', { nodir: true, ignore: defaultIgnore });
  // excluded_glob listaa KAIKKI .js tiedostot (paitsi node_modules/**).
  // "kaikki_js_tiedostot" puolestaan on se porukka, joka ei ole ignore-listassa.
  // Erotus on excluded.
  const included_abs = new Set(kaikki_js_tiedostot.map(f => path.resolve(f)));
  const excluded_abs = excluded_glob
    .map(f => path.resolve(f))
    .filter(f => !included_abs.has(f) && f !== path.resolve(entryPoint));

  // 4) Selvitetään orvot
  //    Otamme siis included-listasta (kaikki_js_tiedostot) ne, joita ei käsitelty.
  //    main.js (entryPoint) on jo kasitellyt_tiedostot -joukossa.
  const orvot = kaikki_js_tiedostot
    .map(t => path.resolve(t))
    .filter(t => !kasitellyt_tiedostot.has(t));

  // Tulostukset
  console.log('');
  if (yhteensa_importteja === 0) {
    console.log('\x1b[33mEi löytynyt lainkaan import-lauseita.\x1b[0m');
    console.log(`Tarkistettiin silti ${kasitellyt_tiedostot.size} tiedostoa.`);
  } else {
    console.log(
      `Tarkistettiin ${kasitellyt_tiedostot.size} tiedostoa. `
      + `${virheita} virhettä, ${ok_count} OK, yhteensä ${yhteensa_importteja} importtia.`
    );
  }

  // Orvot
  if (orvot.length > 0) {
    console.log('\x1b[33mOrvot tiedostot:\x1b[0m');
    orvot.forEach(o => console.log('  ' + o));
  } else {
    console.log('Ei orpoja tiedostoja!');
  }

  // Ekskludatut
  if (excluded_abs.length > 0) {
    console.log('\n\x1b[33mExcluded tiedostot (ei käsitelty):\x1b[0m');
    excluded_abs.forEach(e => console.log('  ' + e));
  }
}

paafunktio();
console.log('********************************');
