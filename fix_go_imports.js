/*
fix_go_imports.js

Käyttö:
   node fix_go_imports.js [polku/päätiedosto.go tai hakemisto] [--fix-imports] [--exclude=hakemisto/**,tiedosto.go,...] [--file=tiedosto.go]

Oletus: "main.go", jos polkua ei anneta.
*/

const fs = require("fs");
const path = require("path");
const glob = require("glob");

// Käytettyjen tiedostojen seuranta, jotta vältetään kaksoiskäsittely
const processedFiles = new Set();

let totalImportsFound = 0;
let totalFixesMade = 0;
let totalErrorsFound = 0;

// packageMap: avain = package-nimi, arvo = [listaus hakemistojen absoluuttisia polkuja]
const packageMap = {};

// -----------------------------------------------------------------------------
// 1) Rakennetaan packageMap kaikista projektin hakemistoista
// -----------------------------------------------------------------------------
function buildPackageMap(baseDir, excludePatterns) {
    // Kerätään kaikki .go-tiedostot (joita ei ole exclude-listassa)
    const allGoFiles = glob.sync("**/*.go", {
        cwd: baseDir,
        nodir: true,
        ignore: excludePatterns,
    });

    // Käydään jokainen .go-tiedosto läpi
    for (const goFile of allGoFiles) {
        const absolutePath = path.join(baseDir, goFile);
        const dirPath = path.dirname(absolutePath);

        let fileContent;
        try {
            fileContent = fs.readFileSync(absolutePath, "utf8");
        } catch (err) {
            console.error(`\x1b[31mvirhe: ${err.message}\x1b[0m`);
            continue;
        }

        // Etsitään rivi:  package XXX
        const packageRegex = /^\s*package\s+([\w]+)\b/m;
        const m = packageRegex.exec(fileContent);
        if (m) {
            const pkgName = m[1];
            if (!packageMap[pkgName]) {
                packageMap[pkgName] = new Set();
            }
            packageMap[pkgName].add(dirPath);
        }
    }

    // muutetaan Set -> Array, helpompi käsitellä
    for (const pkg in packageMap) {
        packageMap[pkg] = Array.from(packageMap[pkg]);
    }
}

// -----------------------------------------------------------------------------
// 2) Import-lauseiden jäsentäminen
// -----------------------------------------------------------------------------

// Etsii tiedoston kommenttialueet (yksiriviset ja moniriviset)
function findCommentAreas(fileContent) {
    const commentAreas = [];
    const singleLineCommentRegex = /\/\/[^\n]*/g;
    let match;
    while ((match = singleLineCommentRegex.exec(fileContent)) !== null) {
        commentAreas.push([match.index, match.index + match[0].length]);
    }
    const multiLineCommentRegex = /\/\*[\s\S]*?\*\//g;
    while ((match = multiLineCommentRegex.exec(fileContent)) !== null) {
        commentAreas.push([match.index, match.index + match[0].length]);
    }
    return commentAreas;
}

// Tarkistaa, onko annettu indeksi jossain kommenttialueessa
function isIndexInComment(index, commentAreas) {
    for (const [start, end] of commentAreas) {
        if (index >= start && index < end) {
            return true;
        }
    }
    return false;
}

// Parsii .go-tiedoston import-lauseet
function parseGoImports(fileContent) {
    const importStatements = [];
    const commentAreas = findCommentAreas(fileContent);

    // Yksiriviset importit, esim. import "package/path" TAI alias "package/path"
    // -> muoto:  import   something   "foo/bar"
    // aliasRegex nappaa sekä mahdollisen aliaksen että polun.
    const singleImportRegex = /import\s+(([\w]+)\s+)?\"([^"]+)\"/g;

    let match;
    while ((match = singleImportRegex.exec(fileContent)) !== null) {
        if (isIndexInComment(match.index, commentAreas)) continue;
        const alias = match[2] || null;     // esim. 'myAlias'
        const importPath = match[3];        // esim. 'foo/bar'
        importStatements.push({
            fullStatement: match[0],
            importPath,
            alias,
            index: match.index,
            type: "single"
        });
    }

    // Ryhmitellyt importit, esim.
    // import (
    //    "fmt"
    //    alias "package/path"
    // )
    // aliasRegex:  ^alias\s+"paketti" TAI ^"paketti"
    const groupedImportRegex = /import\s*\(([\s\S]*?)\)/g;
    while ((match = groupedImportRegex.exec(fileContent)) !== null) {
        if (isIndexInComment(match.index, commentAreas)) continue;

        const innerContent = match[1];
        // hae rivit, joissa voi olla alias "foo/bar" tai "foo/bar"
        //   -> (\w+)?\s*"([^"]+)"
        const innerImportRegex = /(?:([\w]+)\s+)?\"([^"]+)\"/g;
        let innerMatch;
        while ((innerMatch = innerImportRegex.exec(innerContent)) !== null) {
            const alias = innerMatch[1] || null;
            const importPath = innerMatch[2];
            importStatements.push({
                fullStatement: innerMatch[0],
                importPath,
                alias,
                index: match.index, 
                type: "grouped"
            });
        }
    }

    return importStatements;
}

// -----------------------------------------------------------------------------
// 3) Käsitellään tiedostot ja yritetään korjata importit
// -----------------------------------------------------------------------------
function processGoFile(filePath, fixImports, excludePatterns) {
    if (processedFiles.has(filePath)) {
        return;
    }
    processedFiles.add(filePath);

    if (fs.lstatSync(filePath).isDirectory()) {
        const files = fs.readdirSync(filePath);
        for (const file of files) {
            if (file.endsWith(".go")) {
                processGoFile(path.join(filePath, file), fixImports, excludePatterns);
            }
        }
        return;
    }

    let fileContent;
    try {
        fileContent = fs.readFileSync(filePath, "utf8");
    } catch (err) {
        console.error(`\x1b[31mvirhe: ${err.message}\x1b[0m`);
        return;
    }

    const importsInFile = parseGoImports(fileContent);
    if (importsInFile.length === 0) {
        return;
    }

    // Käytetään objekti-pohjaista lähestymistapaa, jotta päivitykset säilyvät koko tiedoston käsittelyn ajan
    const newFileContentObj = { newFileContent: fileContent };
    const fileModifiedObj = { fileModified: false };

    const projectNimi = path.basename(process.cwd());

    for (const importEntry of importsInFile) {
        totalImportsFound++;
        const originalImportPath = importEntry.importPath;
        const possiblyAlias = importEntry.alias;

        // 1) Suhteelliset importit (./, ../)
        if (originalImportPath.startsWith("./") || originalImportPath.startsWith("../")) {
            const absoluteImportPath = path.resolve(path.dirname(filePath), originalImportPath);
            if (fs.existsSync(absoluteImportPath) && fs.lstatSync(absoluteImportPath).isDirectory()) {
                console.log(`👍 import ok: '${originalImportPath}' löytyy (${filePath})`);
                processGoFile(absoluteImportPath, fixImports, excludePatterns);
            } else {
                handleMissingDirectory({
                    filePath,
                    originalImportPath,
                    alias: possiblyAlias,
                    fixImports,
                    newFileContentObj,
                    fileModifiedObj,
                });
            }
        }
        // 2) Paikalliset importit, joissa projektin nimi alussa
        else if (originalImportPath.startsWith(projectNimi + "/")) {
            const adjustedImportPath = originalImportPath.substring(projectNimi.length + 1);
            const absoluteImportPath = path.resolve(process.cwd(), adjustedImportPath);

            if (fs.existsSync(absoluteImportPath) && fs.lstatSync(absoluteImportPath).isDirectory()) {
                console.log(`😎 import ok: '${originalImportPath}' löytyy (${filePath})`);
                processGoFile(absoluteImportPath, fixImports, excludePatterns);
            } else {
                handleMissingDirectory({
                    filePath,
                    originalImportPath,
                    alias: possiblyAlias,
                    fixImports,
                    newFileContentObj,
                    fileModifiedObj,
                });
            }
        }
    }

    if (fileModifiedObj.fileModified) {
        fs.writeFileSync(filePath, newFileContentObj.newFileContent, "utf8");
        console.log(`\x1b[32mtiedosto '${filePath}' päivitetty. 👍\x1b[0m`);
    }
}

// -----------------------------------------------------------------------------
// Apufunktio, joka yrittää löytää puuttuvan kansion packageMapista
// -----------------------------------------------------------------------------
function handleMissingDirectory({
    filePath,
    originalImportPath,
    alias,
    fixImports,
    newFileContentObj,
    fileModifiedObj
}) {
    if (!fixImports) {
        totalErrorsFound++;
        console.error(`\x1b[31mvirhe: hakemistoa '${originalImportPath}' ei löydy (${filePath})\x1b[0m`);
        return;
    }

    // Jos meillä on alias (esim. e_sessions), yritetään katsoa onko packageMap[alias].
    // Muussa tapauksessa yritetään selvittää "paketin nimi" polun viimeisestä segmentistä
    // tai jostain muusta heuristiikasta.
    let guessPackageName = alias || path.basename(originalImportPath);

    if (packageMap[guessPackageName] && packageMap[guessPackageName].length === 1) {
        // Meillä on yksikäsitteinen match
        const foundDir = packageMap[guessPackageName][0];
        fixImportPathInFile({
            filePath,
            oldPath: originalImportPath,
            newDirectory: foundDir,
            newFileContentObj,
            fileModifiedObj
        });
    } else if (packageMap[guessPackageName] && packageMap[guessPackageName].length > 1) {
        // Löytyi useita polkuja samalla package-nimellä
        totalErrorsFound++;
        console.error(
            `\x1b[31mvirhe: hakemistoa '${originalImportPath}' ei löytynyt, mutta package '${guessPackageName}' on useassa paikassa (${filePath}).\x1b[0m`
        );
    } else {
        // Ei löytynyt packageMapista. Yritetään fallback-haku:
        //   Tsekataan, onko jollain package-nimellä jokin polku, joka on "lähellä"?
        //   Tähän voisi tehdä fuzzy-löydön, mutta otetaan vain yksinkertainen esimerkki.

        // Käydään kaikki package-nimet läpi ja etsitään polku, joka päättyy samaan
        // "basenameen" tms. Oikeassa projektissa voisi laskea Levenshtein-etäisyyden.
        let fallbackHit = null;
        for (const pkg of Object.keys(packageMap)) {
            const dirs = packageMap[pkg];
            for (const d of dirs) {
                if (path.basename(d) === path.basename(originalImportPath)) {
                    if (fallbackHit === null) fallbackHit = { pkg, d };
                    else {
                        // useampia osumia -> ei voi korjata yksikäsitteisesti
                        fallbackHit = null; 
                        break;
                    }
                }
            }
            if (fallbackHit === null) continue;
        }

        if (fallbackHit && fallbackHit.pkg) {
            // Korjataan using fallback
            fixImportPathInFile({
                filePath,
                oldPath: originalImportPath,
                newDirectory: fallbackHit.d,
                newFileContentObj,
                fileModifiedObj
            });
        } else {
            totalErrorsFound++;
            console.error(
                `\x1b[31mvirhe: hakemistoa '${originalImportPath}' ei löytynyt, eikä packageMapista löytynyt matchia (${filePath}).\x1b[0m`
            );
        }
    }
}

// Korjaa import-lauseen polun
function fixImportPathInFile({
    filePath,
    oldPath,
    newDirectory,
    newFileContentObj,
    fileModifiedObj
}) {
    // Haetaan projektin nimi (process.cwd() viittaa projektin juureen)
    const projectNimi = path.basename(process.cwd());
    // Lasketaan polku suhteessa projektin juureen
    const relativeToProjectRoot = path.relative(process.cwd(), newDirectory).replace(/\\/g, "/");
    // Muodostetaan lopullinen import-polku, joka alkaa projektin nimellä
    const newFixedImportPath = `${projectNimi}/${relativeToProjectRoot}`;

    // Korvataan vanha import-polku uudella polulla tiedoston sisällössä
    const regex = new RegExp(`(["\`](?:${oldPath})["\"])`, "g");
    const replaced = newFileContentObj.newFileContent.replace(
        regex,
        match => match.replace(oldPath, newFixedImportPath)
    );
    if (replaced !== newFileContentObj.newFileContent) {
        newFileContentObj.newFileContent = replaced;
        fileModifiedObj.fileModified = true;
        totalFixesMade++;
        console.log(`\x1b[33mkorjataan: '${oldPath}' -> '${newFixedImportPath}' (${filePath})\x1b[0m`);
    }
}


// -----------------------------------------------------------------------------
// Pääfunktio
// -----------------------------------------------------------------------------
function paafunktio() {
    const args = process.argv.slice(2);
    let entryPoint = "main.go";
    let fixImports = false;
    let excludePatterns = [];
    let singleTestFile = null;

    for (const arg of args) {
        if (arg.startsWith("--exclude=")) {
            const patternList = arg.replace("--exclude=", "");
            excludePatterns = patternList
                .split(",")
                .map(item => item.trim())
                .filter(Boolean);
        } else if (arg === "--fix-imports") {
            fixImports = true;
        } else if (arg.startsWith("--file=")) {
            singleTestFile = arg.replace("--file=", "");
        } else {
            // Oletetaan, että tämä on entry point, jos --file-parametri ei ole käytössä
            entryPoint = arg;
        }
    }

    // 1) Rakennetaan packageMap (koko projektista tai halutusta juuresta)
    buildPackageMap(process.cwd(), excludePatterns);

    // 2) Käynnistetään vars. prosessointi
    if (singleTestFile) {
        if (!fs.existsSync(singleTestFile)) {
            console.error(
                `\x1b[31mvirhe: tiedostoa '${singleTestFile}' ei löydy.\x1b[0m`
            );
            process.exit(1);
        }
        console.log(`Käsitellään tiedostoa: '${singleTestFile}' ✨`);
        processGoFile(path.resolve(singleTestFile), fixImports, excludePatterns);
    } else {
        if (!fs.existsSync(entryPoint)) {
            console.error(
                `\x1b[31mvirhe: tiedostoa tai hakemistoa '${entryPoint}' ei löydy.\x1b[0m`
            );
            process.exit(1);
        }

        let goFiles = [];
        if (fs.lstatSync(entryPoint).isDirectory()) {
            goFiles = glob.sync("**/*.go", { nodir: true, ignore: excludePatterns });
        } else {
            goFiles = [entryPoint];
        }

        for (const goFile of goFiles) {
            processGoFile(path.resolve(goFile), fixImports, excludePatterns);
        }
    }

    // 3) Loppuyhteenveto
    console.log("\nYhteenveto:");
    console.log(`Käsitelty tiedostoja: ${processedFiles.size}`);
    console.log(`Importteja löytyi: ${totalImportsFound}`);
    console.log(`Korjauksia tehty: ${totalFixesMade}`);
    console.log(`Virheitä: ${totalErrorsFound}`);
}

paafunktio();
console.log("********************************");
