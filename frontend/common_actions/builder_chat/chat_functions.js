// chat-functions.js

function formatText(text) {
    // Tunnista **text** ja korvaa <strong>text</strong>
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

export function createContentFromData(data) {
    console.log("createContentFromData() has this data to process:" + data);

    let contentHTML = '';
    let isTable = false;
    let isCodeBlock = false;

    // Jaa data rivien mukaan, jotta käsittely helpottuu
    const rows = data.split(/<br\s*\/?>|\n/);

    rows.forEach(row => {
        row = row.trim();
        if (row.startsWith('```') || row.startsWith('\\`\\`\\`')) {
            if (isCodeBlock) {
                contentHTML += '</code></pre>\n';
                isCodeBlock = false;
            } else {
                contentHTML += '<pre><code>';
                isCodeBlock = true;
            }
        } else if (isCodeBlock) {
            contentHTML += row + '\n';
        } else if (row.includes('|') && !/^(\|\s*-+\s*)+\|?$/.test(row)) {
            // Tämä rivi on osa taulukkoa, mutta ei ole pelkästään viivoista koostuva
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
            contentHTML += '  </tr>\n';
        } else if (!/^(\|\s*-+\s*)+\|?$/.test(row)) {
            // Jos taulukko on meneillään, sulje se ennen muun tekstin käsittelyä
            if (isTable) {
                contentHTML += '</table>\n';
                isTable = false;
            }

            // Lisää rivit tekstinä
            if (row) {
                contentHTML += `<p>${formatText(row)}</p>\n`;
            }
        }
    });

    // Lopeta mahdollisesti avoinna oleva taulukko
    if (isTable) {
        contentHTML += '</table>\n';
    }

    // Lopeta mahdollisesti avoinna oleva koodilohko
    if (isCodeBlock) {
        contentHTML += '</code></pre>\n';
    }

    console.log("data after processing: " + contentHTML);
    return contentHTML;
}

