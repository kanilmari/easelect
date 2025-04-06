/* check_js_imports.js

Käyttö:
   node check_js_imports.js [polku/pääskripti.js] [--fix-imports] [--exclude=hakemisto/**,file.js, ... ]

Oletus: "main.js" jos et anna polkua.

Skripti:
 - Rakentaa symbolikartan (mistä tiedostosta löytyy esim. 'function foo' tai 'export function foo').
 - Rekursiivisesti parseaa import-lauseet kaikista tiedostoista,
 - Tarkistaa polut (löytyykö tiedosto),
 - Jos polku ei löydy, etsii samannimistä tiedostoa projektista,
 - Jos ei löydy tiedostoa nimen perusteella, mutta import-lauseessa on nimettyjä symboleja,  
   yritetään symbolikartasta löytää tiedosto(t),
 - Korjaa import-lauseen (lisää relatiivisen polun), jos löytyy täsmälleen 1 match,
 - Yhteenveto lopuksi.
*/

const fs = require("fs");
const path = require("path");
const glob = require("glob");

const kasitellyt_tiedostot = new Set();

let yhteensa_importteja = 0;
let virheita = 0;
let ok_count = 0;

// Kartta: { symboli: Set([tiedostopolku, ...]) }
const symbolikartta = new Map();

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
    return !polku.startsWith(".") && polku.includes("/");
}

/**
 * Rakennetaan symbolikartta:
 * Haetaan kaikista js-tiedostoista funktiomäärittelyt:
 *   function foo(...),
 *   export function foo(...),
 *   export { foo, bar } ...
 * Jo yksinkertainen haku "function foo" riittää monissa tapauksissa.
 *
 * Tallennetaan symbolikartta: symboli -> Set[tiedostot]
 */
function rakenna_symbolikartta(ignoreList) {
    const kaikki_js = glob.sync("**/*.js", { nodir: true, ignore: ignoreList });

    for (const tiedosto of kaikki_js) {
        let sisalto = "";
        try {
            sisalto = fs.readFileSync(tiedosto, "utf8");
        } catch (err) {
            console.log(`\x1b[31mvirhe: %s\x1b[0m`, err.message);
            continue;
        }

        // 1) etsitään "function foo(":
        //    sallitaan myös export function foo(
        //    regex nappaa function-nimen group 2 tai 3
        const funktio_regex = /\b(export\s+)?function\s+(\w+)/g;
        let m;
        while ((m = funktio_regex.exec(sisalto)) !== null) {
            const funktio_nimi = m[2];
            if (!symbolikartta.has(funktio_nimi)) {
                symbolikartta.set(funktio_nimi, new Set());
            }
            symbolikartta.get(funktio_nimi).add(path.resolve(tiedosto));
        }

        // 2) etsitään export { foo, bar }
        //    poimitaan kaikki symbolit {foo, bar} -osiosta
        const export_braces_regex = /export\s*\{\s*([^}]+)\}/g;
        while ((m = export_braces_regex.exec(sisalto)) !== null) {
            // esim. "foo, bar as b2, baz"
            // Jaetaan pilkulla, ja puretaan "as" pois jos on
            const sisus = m[1].split(",").map((s) => s.trim());
            sisus.forEach((s) => {
                // esim "bar as b2" -> [bar, b2]
                const osat = s.split(/\s+as\s+/);
                const nimi = osat[0].trim();
                if (nimi) {
                    if (!symbolikartta.has(nimi)) {
                        symbolikartta.set(nimi, new Set());
                    }
                    symbolikartta.get(nimi).add(path.resolve(tiedosto));
                }
            });
        }

        // Halutessasi voisit laajentaa vielä esim. "export default function foo() {"
        // tai Node-tyyliset module.exports. Tässä vain esimerkki.
    }
}

/**
 * Etsii import-lauseesta nimetyt symbolit, esim:
 *   import { load_table, do_stuff as ds } from '...';
 * Palauttaa taulukon: ['load_table', 'do_stuff']
 * (eli ohitetaan "as"-nimet).
 */
function poimi_nimetyt_symbolit(import_lause) {
    // Sallitaan monirivinen osuus
    const re = /import\s*\{\s*([\s\S]*?)\}\s*from\s*['"]/;
    const mm = re.exec(import_lause);
    if (!mm) {
        return [];
    }

    // Poistetaan moniriviset kommentit /* ... */ ja yksiriviset kommentit // ...
    let sisus = mm[1];
    sisus = sisus.replace(/\/\*[\s\S]*?\*\//g, ""); // poistaa /*...*/
    sisus = sisus.replace(/\/\/[^\n]*/g, ""); // poistaa //...

    return sisus
        .split(",")
        .map((s) => s.trim())
        .map((s) => {
            // esim. "myFunc as mf" -> ["myFunc", "mf"]
            const asMatch = s.split(/\s+as\s+/);
            return asMatch[0].trim(); // palautetaan alkuperäinen symbolinimi
        })
        .filter(Boolean);
}

/**
 * Yrittää etsiä symbolikartasta yhden ja ainoan tiedoston,
 * joka sisältäisi kaikki annetut symbolit.
 * Palauttaa null jos 0 tai useampi match,
 * tai palauttaa se yhden polun jos täsmää.
 */
function etsi_tiedosto_symbolien_perusteella(symbolit) {
    if (symbolit.length === 0) {
        return null;
    }

    // Otetaan symbolit yksitellen, etsitään niille set tiedostoja,
    // ja leikataan intersection
    let yhteinen = null;
    for (const sym of symbolit) {
        if (!symbolikartta.has(sym)) {
            // symboli ei esiinny missään
            return null;
        }
        const mahdolliset = symbolikartta.get(sym);
        if (yhteinen === null) {
            // ensimmäinen symboli
            yhteinen = new Set(mahdolliset);
        } else {
            // intersection
            yhteinen = new Set([...yhteinen].filter((x) => mahdolliset.has(x)));
        }
        if (yhteinen.size === 0) {
            return null;
        }
    }

    // nyt yhteinen sisältää tiedostoja, joissa on kaikki symbolit
    if (yhteinen.size === 1) {
        return [...yhteinen][0];
    }
    // 0 tai useampi
    return null;
}

function kasittele_tiedosto(tiedosto_polku, korjaa_importit) {
    if (kasitellyt_tiedostot.has(tiedosto_polku)) {
        return;
    }
    kasitellyt_tiedostot.add(tiedosto_polku);

    let sisalto;
    try {
        sisalto = fs.readFileSync(tiedosto_polku, "utf8");
    } catch (err) {
        console.error(`\x1b[31mvirhe: %s\x1b[0m`, err.message);
        return;
    }

    // Haetaan kommenttialueet
    const kommenttialueet = etsi_kommenttialueet(sisalto);

    // Korjattu regex, joka sallii kommentit ja rivinvaihdot aaltosulkujen sisällä
    const importKaavaNimetty = /import\s+([\s\S]+?)\s+from\s+['"]([^'"]+)['"]/g;
    const importKaavaSivuvaikutus = /import\s+['"]([^'"]+)['"]/g;

    let match;
    const importit = [];

    // Käydään läpi nimetyt importit
    while ((match = importKaavaNimetty.exec(sisalto)) !== null) {
        if (onko_indeksi_kommentissa(match.index, kommenttialueet)) {
            continue;
        }
        const koko_import_lause = match[0];
        const alkuperainen_polku = match[2];
        importit.push({
            match_index: match.index,
            lause: koko_import_lause,
            polku: alkuperainen_polku,
            tyypit: "nimetty",
        });
    }

    // Käydään läpi sivuvaikutus‐importit
    while ((match = importKaavaSivuvaikutus.exec(sisalto)) !== null) {
        if (onko_indeksi_kommentissa(match.index, kommenttialueet)) {
            continue;
        }
        const koko_import_lause = match[0];
        const alkuperainen_polku = match[1];
        importit.push({
            match_index: match.index,
            lause: koko_import_lause,
            polku: alkuperainen_polku,
            tyypit: "sivuvaikutus",
        });
    }

    if (importit.length === 0) {
        return;
    }

    let sisalto_uusi = sisalto;
    let muutoksia = false;

    for (const imp of importit) {
        yhteensa_importteja++;
        const alkuperainen_polku = imp.polku;

        // 1) Relatiiviset importit
        if (
            alkuperainen_polku.startsWith("./") ||
            alkuperainen_polku.startsWith("../")
        ) {
            const absoluuttinen = path.resolve(
                path.dirname(tiedosto_polku),
                alkuperainen_polku
            );

            if (fs.existsSync(absoluuttinen)) {
                ok_count++;
                kasittele_tiedosto(absoluuttinen, korjaa_importit);
            } else {
                // Yritetään korjata
                if (korjaa_importit) {
                    const tiedoston_nimi = path.basename(alkuperainen_polku);
                    // Lisätään ignore: globalIgnorePatterns
                    const matches = glob.sync(`**/${tiedoston_nimi}`, {
                        nodir: true,
                        ignore: globalIgnorePatterns,
                    });
                    if (matches.length === 1) {
                        const loytynyt = path.resolve(matches[0]);
                        let uusi_rel = path
                            .relative(path.dirname(tiedosto_polku), loytynyt)
                            .replace(/\\/g, "/");

                        if (!uusi_rel.startsWith(".")) {
                            uusi_rel = "./" + uusi_rel;
                        }
                        console.log(
                            `\x1b[33mkorjataan:\x1b[0m '${alkuperainen_polku}' -> '${uusi_rel}' (${tiedosto_polku})`
                        );

                        const vanha_lause = imp.lause;
                        const korjattu_lause = vanha_lause.replace(
                            alkuperainen_polku,
                            uusi_rel
                        );

                        sisalto_uusi = sisalto_uusi.replace(
                            vanha_lause,
                            korjattu_lause
                        );
                        muutoksia = true;
                        ok_count++;

                        kasittele_tiedosto(loytynyt, korjaa_importit);
                    } else if (matches.length === 0) {
                        if (imp.tyypit === "nimetty") {
                            const symbolit = poimi_nimetyt_symbolit(imp.lause);
                            const loytynyt_tiedosto =
                                etsi_tiedosto_symbolien_perusteella(symbolit);
                            if (loytynyt_tiedosto) {
                                let uusi_rel = path
                                    .relative(
                                        path.dirname(tiedosto_polku),
                                        loytynyt_tiedosto
                                    )
                                    .replace(/\\/g, "/");
                                if (!uusi_rel.startsWith(".")) {
                                    uusi_rel = "./" + uusi_rel;
                                }

                                console.log(
                                    `\x1b[33mkorjataan:\x1b[0m '${alkuperainen_polku}' -> '${uusi_rel}' symbolien perusteella (${tiedosto_polku})`
                                );

                                const vanha_lause = imp.lause;
                                const korjattu_lause = vanha_lause.replace(
                                    alkuperainen_polku,
                                    uusi_rel
                                );

                                sisalto_uusi = sisalto_uusi.replace(
                                    vanha_lause,
                                    korjattu_lause
                                );
                                muutoksia = true;
                                ok_count++;

                                kasittele_tiedosto(
                                    loytynyt_tiedosto,
                                    korjaa_importit
                                );
                            } else {
                                virheita++;
                                console.error(
                                    `\x1b[31mvirhe: ei löytynyt tiedostoa '${absoluuttinen}', ` +
                                        `eikä vastaavaa nimeä projektista, eikä symbolihakua (import { ${symbolit.join(
                                            ", "
                                        )} }). (viite: '${tiedosto_polku}')`
                                );
                            }
                        } else {
                            virheita++;
                            console.error(
                                `\x1b[31mvirhe: ei löytynyt tiedostoa '${absoluuttinen}', ` +
                                    `eikä vastaavaa nimeä projektista. (alkuperäinen import: '${alkuperainen_polku}', ` +
                                    `viite: '${tiedosto_polku}')`
                            );
                        }
                    } else {
                        virheita++;
                        console.error(
                            `\x1b[31mvirhe: ei löytynyt tiedostoa '${absoluuttinen}'. Useita samannimisiä: ${matches} ` +
                                `(alkuperäinen: '${alkuperainen_polku}', viite: '${tiedosto_polku}')`
                        );
                    }
                } else {
                    virheita++;
                    console.error(
                        `\x1b[31mvirhe: tiedostoa '${absoluuttinen}' ei löydy ` +
                            `(alkuperäinen import: '${alkuperainen_polku}', viite: '${tiedosto_polku}')`
                    );
                }
            }
        }

        // 2) Paikallinen polku ilman pisteitä (oletuksella ./)
        else if (onko_local_import_ilman_pisteita(alkuperainen_polku)) {
            const polku_oletuksella = "./" + alkuperainen_polku;
            const absoluuttinen = path.resolve(
                path.dirname(tiedosto_polku),
                polku_oletuksella
            );

            if (fs.existsSync(absoluuttinen)) {
                if (korjaa_importit) {
                    console.log(
                        `\x1b[33mkorjataan:\x1b[0m '${alkuperainen_polku}' -> '${polku_oletuksella}' (${tiedosto_polku})`
                    );

                    const vanha_lause = imp.lause;
                    const korjattu_lause = vanha_lause.replace(
                        alkuperainen_polku,
                        polku_oletuksella
                    );

                    sisalto_uusi = sisalto_uusi.replace(
                        vanha_lause,
                        korjattu_lause
                    );
                    muutoksia = true;
                    ok_count++;

                    kasittele_tiedosto(absoluuttinen, korjaa_importit);
                } else {
                    virheita++;
                    console.error(
                        `\x1b[31mvirhe: import '${alkuperainen_polku}' näyttää paikalliselta tiedostolta, ` +
                            `mutta se ei ala './' tai '../'. (viite: '${tiedosto_polku}')`
                    );
                }
            } else {
                virheita++;
                console.error(
                    `\x1b[31mvirhe: import '${alkuperainen_polku}' ei ala './' tai '../', ` +
                        `mutta tiedostoa '${absoluuttinen}' ei löytynyt. (viite: '${tiedosto_polku}')`
                );
            }
        }

        // 3) Oletetaan npm-paketti
        else {
            ok_count++;
        }
    }

    if (muutoksia) {
        fs.writeFileSync(tiedosto_polku, sisalto_uusi, "utf8");
        console.log(`\x1b[32mTiedosto "${tiedosto_polku}" päivitetty.\x1b[0m`);
    }
}

function paafunktio() {
    // Luetaan komentoriviparametrit
    const args = process.argv.slice(2);
    let entryPoint = "main.js";
    let korjaa_importit = false;
    let excludePatterns = [];

    for (const arg of args) {
        if (arg.startsWith("--exclude=")) {
            // Pilkotaan pilkkuerotelluiksi pattern-määrittelyiksi
            const exclStr = arg.replace("--exclude=", "");
            excludePatterns = exclStr
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
        } else if (arg === "--fix-imports") {
            korjaa_importit = true;
        } else {
            // Oletetaan, että tämä on entry point
            entryPoint = arg;
        }
    }

    // Jos entryPoint puuttuu
    if (!fs.existsSync(entryPoint)) {
        console.error(
            `\x1b[31mvirhe: tiedostoa '${entryPoint}' ei ole olemassa.\x1b[0m`
        );
        process.exit(1);
    }

    // node_modules/** on oletusignorena
    const defaultIgnore = ["node_modules/**"];
    const ignoreForAll = defaultIgnore.concat(excludePatterns);
    globalIgnorePatterns = ignoreForAll;

    // 0) Rakennetaan symbolikartta
    //    (jotta pystytään korjaamaan import { load_table } -tapauksia, joissa polku on väärä)
    rakenna_symbolikartta(ignoreForAll);

    // 1) Käsitellään entryPoint
    kasittele_tiedosto(path.resolve(entryPoint), korjaa_importit);

    // 2) Haetaan kaikki JS-tiedostot, paitsi ignore-listatut
    const kaikki_js_tiedostot = glob.sync("**/*.js", {
        nodir: true,
        ignore: ignoreForAll,
    });

    // 3) Listataan excluded files
    //    Haetaan ensin kaikki .js (paitsi node_modules), otetaan erotus
    const excluded_glob = glob.sync("**/*.js", {
        nodir: true,
        ignore: defaultIgnore,
    });
    const included_abs = new Set(
        kaikki_js_tiedostot.map((f) => path.resolve(f))
    );
    const excluded_abs = excluded_glob
        .map((f) => path.resolve(f))
        .filter((f) => !included_abs.has(f) && f !== path.resolve(entryPoint));

    // 4) Selvitetään orvot
    const orvot = kaikki_js_tiedostot
        .map((t) => path.resolve(t))
        .filter((t) => !kasitellyt_tiedostot.has(t));

    // Orvot
    if (orvot.length > 0) {
        console.log("\x1b[33mOrvot tiedostot:\x1b[0m");
        orvot.forEach((o) => console.log("  " + o));
    } else {
        console.log("Ei orpoja tiedostoja!");
    }

    // Ekskludatut
    if (excluded_abs.length > 0) {
        console.log("\n\x1b[33mExcluded tiedostot (ei käsitelty):\x1b[0m");
        excluded_abs.forEach((e) => console.log("  " + e));
    }

    // Tulokset
    console.log("");
    if (yhteensa_importteja === 0) {
        console.log("\x1b[33mEi löytynyt lainkaan import-lauseita.\x1b[0m");
        console.log(
            `Tarkistettiin silti ${kasitellyt_tiedostot.size} tiedostoa.`
        );
    } else {
        console.log(
            `Tarkistettiin ${kasitellyt_tiedostot.size} tiedostoa. ` +
                `${virheita} virhettä, ${ok_count} OK, yhteensä ${yhteensa_importteja} importtia.`
        );
    }
}

paafunktio();
console.log("********************************");
