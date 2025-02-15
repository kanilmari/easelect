// chat-functions.js

function formatText(text) {
    // Tunnista **text** ja korvaa <strong>text</strong>
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

/**
 * Etsii ja pilkkoo datan blokkeihin, joissa on parent_folder / file_name / full_path / content.
 * Palauttaa taulukon, jonka jokainen alkio on yhden tiedoston tiedot (oliona):
 * {
 *   parent_folder: "foo\\bar" (tai tyhjä, jos ei löydy),
 *   file_name: "readme.md" (tai tyhjä, jos ei löydy),
 *   full_path: "foo\\bar\\readme.md" (tai tyhjä, jos ei löydy),
 *   contentLines: [ "rivi1", "rivi2", ... ] (varsinaiset sisällön rivit),
 * }
 */
function parseFileBlocks(data) {
    const lines = data.split('\n').map(line => line.trim());

    let blocks = [];
    let currentBlock = [];
    let insideBlock = false;

    lines.forEach(line => {
        // Kun havaitsemme "parent_folder: " aloitetaan uusi lohko
        if (line.startsWith("parent_folder: ")) {
            // Jos edellinen lohko oli kesken, pusketaan se blocks-taulukkoon
            if (currentBlock.length > 0) {
                blocks.push(currentBlock);
                currentBlock = [];
            }
            insideBlock = true;
        }
        // Kertyvät rivit lisätään currentBlockiin
        if (insideBlock) {
            currentBlock.push(line);
        }
    });

    // Viimeinen blokki, jos jäi kesken
    if (currentBlock.length > 0) {
        blocks.push(currentBlock);
    }

    // Muodostetaan jokaisesta blokista selkeä oliorakenne
    const parsed = blocks.map(blockLines => {
        let parent_folder = "";
        let file_name = "";
        let full_path = "";
        let contentStartIndex = -1; 

        // Käydään blockLines läpi ja etsitään avaimet
        blockLines.forEach((line, idx) => {
            if (line.startsWith("parent_folder: ")) {
                parent_folder = line.replace("parent_folder: ", "").trim();
            } else if (line.startsWith("file_name: ")) {
                file_name = line.replace("file_name: ", "").trim();
            } else if (line.startsWith("full_path: ")) {
                full_path = line.replace("full_path: ", "").trim();
            } else if (line.startsWith("content:")) {
                // Sisältö alkaa tästä rivistä
                contentStartIndex = idx + 1; 
            }
        });

        // Otetaan content-osuus, joka alkaa content-rivin jälkeen
        let contentLines = [];
        if (contentStartIndex > -1 && contentStartIndex < blockLines.length) {
            contentLines = blockLines.slice(contentStartIndex);
        }

        return {
            parent_folder,
            file_name,
            full_path,
            contentLines
        };
    });

    return parsed;
}

/**
 * Muodostaa HTML:n yksittäisen tiedoston sisällöstä <details>-rakenteella.
 * Hyödyntää jo käytössä olevaa logiikkaa koodilohkojen, taulukoiden jne. formatointiin.
 */
function createDetailsHTMLForFile(fileObj) {
    const summaryLabel = fileObj.full_path || fileObj.file_name || "unknown file";
    
    // Rakennetaan content-osan data-String. Liitetään contentLines rivivaihdolla.
    // Jos contentLines on tyhjä, laitetaan "No content".
    let contentData = fileObj.contentLines.length > 0 
        ? fileObj.contentLines.join('\n') 
        : "No content";

    // Käytetään samaa logiikkaa kuin createContentFromData (pienin muokkauksin),
    // jotta saamme mm. koodilohkot ja taulukot käsiteltyä.
    const innerHTML = convertMarkdownLikeText(contentData);

    return `
<details>
  <summary>${summaryLabel}</summary>
  <p><em>parent_folder:</em> ${fileObj.parent_folder || "(empty)"}</p>
  <p><em>file_name:</em> ${fileObj.file_name || "(empty)"}</p>
  <hr>
  ${innerHTML}
</details>
`;
}

/**
 * Tämä on pohjimmiltaan sama logiikka kuin createContentFromData,
 * mutta erotettu omaksi "helppariksi", jotta voimme
 * käsitellä nimenomaan sisällön (esim. koodilohkot, taulukot) ilman
 * yksittäisten tiedostojen details/summary-rakennetta.
 */
function convertMarkdownLikeText(data) {
    let contentHTML = '';
    let isTable = false;
    let isCodeBlock = false;

    // Jaa data rivien mukaan, jotta koodilohkojen ja taulukoiden käsittely helpottuu
    const rows = data.split(/<br\s*\/?>|\n/);

    rows.forEach(row => {
        row = row.trim();
        if (row.startsWith('```') || row.startsWith('\\`\\`\\`')) {
            // Aloitus- tai lopetusmerkki koodilohkolle
            if (isCodeBlock) {
                contentHTML += '</code></pre>\n';
                isCodeBlock = false;
            } else {
                contentHTML += '<pre><code>';
                isCodeBlock = true;
            }
        } else if (isCodeBlock) {
            // Jos ollaan koodilohkon sisällä, lisätään rivit sellaisenaan
            contentHTML += row + '\n';
        } else if (row.includes('|') && !/^(\|\s*-+\s*)+\|?$/.test(row)) {
            // Tämä rivi on osa taulukkoa, mutta ei ole pelkkää "-" erotinta
            if (!isTable) {
                contentHTML += '<table>\n';
                isTable = true;
            }
            const cells = row.split('|').map(cell => cell.trim());
            contentHTML += '  <tr>\n';
            cells.forEach(cell => {
                if (cell) {
                    contentHTML += `    <td>${formatText(cell)}</td>\n`;
                }
            });
            contentHTML += '  <tr>\n';
        } else if (!/^(\|\s*-+\s*)+\|?$/.test(row)) {
            // Jos taulukko on käynnissä, suljetaan se ennen siirtymistä muuhun
            if (isTable) {
                contentHTML += '</table>\n';
                isTable = false;
            }
            // Lisätään tavallinen teksti rivinä
            if (row) {
                contentHTML += `<p>${formatText(row)}</p>\n`;
            }
        }
    });

    // Jos taulukko jäi auki, suljetaan se lopuksi
    if (isTable) {
        contentHTML += '</table>\n';
    }

    // Jos koodilohko jäi auki, suljetaan se lopuksi
    if (isCodeBlock) {
        contentHTML += '</code></pre>\n';
    }

    return contentHTML;
}

/**
 * Pääfunktio, jota kutsutaan, kun SSE-data on vastaanotettu.
 * - Hakee mahdolliset tiedostoblokit (parent_folder, file_name, full_path, content).
 * - Jos ei ole yhtään blokkeja, käsitellään data "tavallisena" markdown-lähteenä.
 * - Jos löytyy tiedostoblokkeja, jokainen luodaan details-rakenteella ja
 *   kootaan lopuksi yhteen HTML-tekstiin.
 */
function removeTripleBackticks(rawText) {
    // Poistetaan ` ```javascript ` ja ` ``` ` -rivit:
    let cleaned = rawText.replace(/```javascript\s*/gi, '')
                         .replace(/```/g, '');
    return cleaned;
  }
  
  export function createContentFromData(data) {
      console.log("createContentFromData() raw data:", data);
  
      // 0) Poistetaan code-fence -merkinnät, jotta parseFileBlocks näkee rivit
      const preprocessed = removeTripleBackticks(data);
  
      // 1) Etsitään tiedostoblokit
      const parsedBlocks = parseFileBlocks(preprocessed);
  
      if (parsedBlocks.length === 0) {
          // Ei löytynyt "parent_folder:"-alkuisia rivejä, joten käsitellään vain markdown-tyylisenä
          console.log("No file blocks found, returning plain markdown-ish text.");
          return convertMarkdownLikeText(data); 
          // HUOM: Käytämme *alkuperäistä* dataa, jotta code-lokerot 
          //       renderöityvät <pre><code>-lohkona, jos niitä on.
      }
  
      // 2) Jos löytyi tiedostoblokkeja, luodaan <details>...
      let finalHTML = '';
      parsedBlocks.forEach(file => {
          finalHTML += createDetailsHTMLForFile(file);
      });
  
      console.log("Result HTML after processing file blocks: " + finalHTML);
      return finalHTML;
  }

