// card_helpers.js

/**
 * parseRoleString - tukee useita pilkulla erotettuja rooleja 
 * (esim. "image,header+lang-key" tai "header+lang_key").
 * Palauttaa:
 *   {
 *     baseRoles: [...],  // esim. ['image','header']
 *     hasLangKey: boolean
 *   }
 */
export function parseRoleString(roleStr) {
    if (!roleStr) return { baseRoles: [], hasLangKey: false };

    const rolesRaw = roleStr.split(',').map(r => r.trim());
    let hasLangKey = false;
    const baseRoles = [];

    rolesRaw.forEach(role => {
        if (role.includes('+')) {
            // rooli esim. "header+lang-key" tai "header+lang_key"
            const [mainRole, extra] = role.split('+').map(r => r.trim());
            baseRoles.push(mainRole);
            if (extra === 'lang-key' || extra === 'lang_key') {
                hasLangKey = true;
            }
        } else {
            baseRoles.push(role);
        }
    });

    return { baseRoles, hasLangKey };
}

/**
 * Pieni apufunktio, joka erottaa labelin ja arvon eri elementteihin.
 * - Avain näytetään vain, jos sitä ei ole tyhjennetty jo (ts. jos haluttiin näyttää se).
 * - Arvo tallennetaan valueDiv:iin, jossa on data-column-attribuutti.
 * - Jos hasLangKey on true, arvon sijaan asetetaan data-lang-key-attribuutti.
 */
export function createKeyValueElement(
    column_label,
    raw_value,
    column,
    hasLangKey,
    cssClass = "big_card_generic_field"
) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("key_value_wrapper");

    /* ---------- LABEL ---------- */
    if (column_label) {
        const labelDiv = document.createElement("div");
        labelDiv.classList.add("kv_label");
        // Kieliavain attribuuttiin, ei varatekstiä
        labelDiv.setAttribute("data-lang-key", column);
        wrapper.appendChild(labelDiv);
    }

    /* ---------- VALUE ---------- */
    const valueDiv = document.createElement("div");
    valueDiv.classList.add(cssClass);
    valueDiv.setAttribute("data-column", column);

    // Tallennetaan raaka arvo muokkausta varten
    valueDiv.setAttribute("data-raw-value", raw_value);

    if (hasLangKey) {
        valueDiv.setAttribute("data-lang-key", raw_value);
    } else {
        valueDiv.textContent = raw_value;
        valueDiv.style.whiteSpace = "pre-wrap";
    }

    wrapper.appendChild(valueDiv);

    return wrapper;
}

/**
 * Palauttaa kentät takaisin tavalliseen tilaan
 * ja kerää uudet arvot olioon { columnNimi: 'uusiArvo' }.
 */
export function disableEditing(container) {
    const textFields = container.querySelectorAll('[data-column]');
    const updatedValues = {};

    textFields.forEach((fieldElem) => {
        // Jos on <details>, ohitetaan
        const detailsEl = fieldElem.querySelector('details');
        if (detailsEl) {
            return;
        }
        const columnName = fieldElem.getAttribute('data-column') || '';
        const originalText = fieldElem.getAttribute('data-original-text') || '';
        const inputEl = fieldElem.querySelector('input, textarea');

        if (!inputEl) {
            return;
        }

        let newValue;
        if (inputEl.type === 'checkbox') {
            newValue = inputEl.checked;
        } else {
            newValue = inputEl.value.trim();
        }

        updatedValues[columnName] = newValue;

        // Palautetaan tekstinä
        fieldElem.textContent = (typeof newValue === 'boolean')
            ? String(newValue)
            : (newValue || originalText);

        fieldElem.style.whiteSpace = 'pre-wrap';
        fieldElem.removeAttribute('data-original-text');
    });

    return updatedValues;
}

/** 
 * Pieni apufunktio sarakenimen siistimiseen 
 */
export function format_column_name(column) {
    const replaced = column.replace(/_/g, ' ');
    return replaced.charAt(0).toUpperCase() + replaced.slice(1);
}

/**
 * Lähettää kerralla kortin päivittyneet sarake-arvot palvelimelle.
 * Käyttää yksitellen 'id + column + value' -formaattia.
 */
export async function sendCardUpdates(table_name, rowId, updatedData) {
    console.log(`[${table_name}] Lähetetään kortin uudet arvot, rowId=${rowId}`, updatedData);

    for (const [column, value] of Object.entries(updatedData)) {
        const payload = {
            id: rowId,
            column: column,
            value: value
        };

        try {
            const response = await fetch(`/api/update-row?table=${table_name}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Update failed for column ${column}: HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log(`[${table_name}] OK, sarake=${column} päivitetty, vastaus:`, result);

        } catch (err) {
            console.error("virhe: " + err.message);
        }
    }
}

/**
 * Korvaa tekstisisällöt <input>- tai <textarea>-kentillä,
 * mutta vain, jos rakenteessa editable_in_ui on true kyseiselle sarakkeelle ja taululle.
 */
export function enableEditing(container, table_name) {
    console.log('enabling editing... table= ' + table_name);
    let parsedFullTreeData = null;

    // Haetaan schema-/column-tiedot localStoragesta
    try {
        const rawFullTreeData = localStorage.getItem('full_tree_data');
        if (rawFullTreeData) {
            parsedFullTreeData = JSON.parse(rawFullTreeData);
        }
    } catch (e) {
        console.warn(`enableEditing: ei voitu jäsentää full_tree_data taululle ${table_name}:`, e);
    }

    // Muodostetaan nopeat hakurakenteet: { column_name -> { editable_in_ui, data_type } }
    const columnInfoMap = {};
    if (parsedFullTreeData && Array.isArray(parsedFullTreeData.column_details)) {
        for (const colObj of parsedFullTreeData.column_details) {
            if (colObj.table_name === table_name && colObj.column_name) {
                columnInfoMap[colObj.column_name] = {
                    editable_in_ui: !!colObj.editable_in_ui,
                    data_type: colObj.data_type || 'text'
                };
            }
        }
    }

    // Käydään läpi kaikki elementit, joissa data-column-attribuutti
    const textFields = container.querySelectorAll('[data-column]');
    textFields.forEach((fieldElem) => {
        const columnName = fieldElem.getAttribute('data-column');
        if (!columnInfoMap[columnName]) {
            console.log(`[${table_name}] sarakkeelle ${columnName} ei löydy columnInfoMap:ia => ei muokata.`);
            return;
        }

        const isEditable = columnInfoMap[columnName].editable_in_ui;
        const dataType = columnInfoMap[columnName].data_type;

        // Jos sisällä on <details>, ohitetaan
        if (fieldElem.querySelector('details')) {
            console.log(`[${table_name}] sarake: ${columnName}, sis. <details>, jätetään ennalleen.`);
            return;
        }

        // Jos editable_in_ui ei ole true, jätetään kenttä lukutilaan
        if (!isEditable) {
            console.log(`[${table_name}] sarake: ${columnName}, editable_in_ui=false => ei muokata.`);
            return;
        }

        // data-raw-value
        const rawValueAttr = fieldElem.getAttribute('data-raw-value');
        const originalText = (rawValueAttr !== null)
            ? rawValueAttr
            : fieldElem.textContent.trim();

        fieldElem.setAttribute('data-original-text', originalText);
        fieldElem.textContent = ''; // tyhjennetään

        // Päätellään syötekomponentti dataType:n perusteella
        if (dataType === 'boolean') {
            console.log(`[${table_name}] sarake: ${columnName}, data_type=boolean => <input type="checkbox">.`);
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = (originalText.toLowerCase() === 'true' || originalText === '1');
            fieldElem.appendChild(checkbox);

        } else if (dataType === 'date') {
            console.log(`[${table_name}] sarake: ${columnName}, data_type=date => <input type="date">.`);
            const dateInput = document.createElement('input');
            dateInput.type = 'date';
            dateInput.value = (originalText.match(/^\d{4}-\d{2}-\d{2}$/)) ? originalText : '';
            fieldElem.appendChild(dateInput);

        } else if (dataType === 'int' || dataType === 'integer' || dataType === 'numeric') {
            console.log(`[${table_name}] sarake: ${columnName}, data_type=numeric => <input type="number">.`);
            const numberInput = document.createElement('input');
            numberInput.type = 'number';
            numberInput.value = originalText || '';
            fieldElem.appendChild(numberInput);

        } else {
            // Teksti
            if (originalText.length > 80) {
                console.log(`[${table_name}] sarake: ${columnName}, data_type=text => <textarea>.`);
                const textarea = document.createElement('textarea');
                textarea.value = originalText;
                textarea.style.width = '100%';
                textarea.rows = 4;
                fieldElem.appendChild(textarea);
            } else {
                console.log(`[${table_name}] sarake: ${columnName}, data_type=text => <input type="text">.`);
                const input = document.createElement('input');
                input.type = 'text';
                input.value = originalText;
                input.style.width = '100%';
                fieldElem.appendChild(input);
            }
        }
    });
}