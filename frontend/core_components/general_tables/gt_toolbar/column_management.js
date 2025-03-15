// column_management.js

import { createModal, showModal, hideModal } from '../../../common_components/modal/modal_factory.js';
import { fetch_columns_for_table } from '../../endpoints/endpoint_column_fetcher.js';

export async function open_column_management_modal(table_name) {
    const columns = await fetch_columns_for_table(table_name);

    // Muunna character varying -> VARCHAR
    columns.forEach(col => {
        if (col.data_type.toLowerCase() === "character varying") {
            col.data_type = "VARCHAR";
        }
    });

    const initial_columns = columns.map(col => ({
        column_name: col.column_name,
        data_type: col.data_type.toUpperCase(),
        length: col.character_maximum_length || ''
    }));

    // Käytetään vain yhtä "form"-elementtiä pääkontainerina:
    const form = document.createElement('form');
    form.id = `column_management_form_${table_name}`;
    form.classList.add('column_management_forms');
    form.style.display = 'grid';
    form.style.gridTemplateColumns = '1fr';
    form.style.gridGap = '10px';
    form.style.backgroundColor = 'var(--bg_color)';
    form.style.color = 'var(--text_color)';
    form.style.border = '1px solid var(--border_color)';
    form.style.padding = '10px';

    const allowedTypes = ['INTEGER', 'VARCHAR', 'TEXT', 'BOOLEAN', 'DATE'];

    function createColumnRow(column_name_value, data_type_value, length_value, original = true) {
        const row = document.createElement('div');
        row.classList.add('column-row');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '1fr 1fr';
        row.style.gridGap = '5px';
        row.style.border = '1px solid var(--table_border_color)';
        row.style.padding = '5px';

        // Asetetaan suhteellinen asemointi, jotta poistonappi voidaan ankkuroida oikeaan yläkulmaan:
        row.style.position = 'relative';

        // Nimi
        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Nimi: ';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.name = 'column_name';
        nameInput.value = column_name_value || '';
        if (original) {
            nameInput.dataset.originalName = column_name_value;
        }
        nameLabel.appendChild(nameInput);
        row.appendChild(nameLabel);

        // Tietotyyppi
        const typeLabel = document.createElement('label');
        typeLabel.textContent = ' Tietotyyppi: ';
        const typeSelect = document.createElement('select');
        typeSelect.name = 'data_type';

        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '--Valitse--';
        typeSelect.appendChild(emptyOpt);

        allowedTypes.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (data_type_value && t === data_type_value.toUpperCase()) {
                opt.selected = true;
            }
            typeSelect.appendChild(opt);
        });

        typeLabel.appendChild(typeSelect);
        row.appendChild(typeLabel);

        // Pituus (vain VARCHAR)
        const lengthLabel = document.createElement('label');
        lengthLabel.textContent = 'Pituus (vain VARCHAR): ';
        const lengthInput = document.createElement('input');
        lengthInput.type = 'number';
        lengthInput.name = 'length';
        lengthInput.value = length_value || '';
        lengthLabel.appendChild(lengthInput);
        row.appendChild(lengthLabel);

        // Piilotetaan pituuskenttä, jos tyyppi ei ole VARCHAR
        if (data_type_value !== 'VARCHAR') {
            lengthLabel.style.display = 'none';
        }
        typeSelect.addEventListener('change', () => {
            if (typeSelect.value === 'VARCHAR') {
                lengthLabel.style.display = 'block';
            } else {
                lengthLabel.style.display = 'none';
                lengthInput.value = '';
            }
        });

        // Poista-painike (punainen rasti, aina divin oikeassa yläkulmassa, näkyy hoveroitaessa)
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = '×';
        removeButton.style.position = 'absolute';
        removeButton.style.top = '5px';
        removeButton.style.right = '5px';
        removeButton.style.color = 'red';
        removeButton.style.border = 'none';
        removeButton.style.backgroundColor = 'transparent';
        removeButton.style.fontSize = '18px';
        removeButton.style.cursor = 'pointer';
        removeButton.style.opacity = '0';
        removeButton.style.transition = 'opacity 0.2s';

        // Näytä rasti hoverissa, piilota kun ei hover
        row.addEventListener('mouseenter', () => {
            removeButton.style.opacity = '1';
        });
        row.addEventListener('mouseleave', () => {
            removeButton.style.opacity = '0';
        });

        removeButton.addEventListener('click', () => {
            row.remove();
        });
        row.appendChild(removeButton);

        return row;
    }

    // Luo rivit olemassa oleville sarakkeille
    columns.forEach(col => {
        const dt = allowedTypes.includes(col.data_type.toUpperCase()) ? col.data_type : '';
        const r = createColumnRow(col.column_name, dt, col.character_maximum_length, true);
        form.appendChild(r);
    });

    // Luo ensimmäinen tyhjä uusi sarake -rivi
    const initialNewRow = createColumnRow('', '', '', false);
    form.appendChild(initialNewRow);

    // Lisää uusi sarake -painike
    const addRowButton = document.createElement('button');
    addRowButton.type = 'button';
    addRowButton.textContent = 'Lisää uusi sarake';
    addRowButton.style.backgroundColor = 'var(--button_bg_color)';
    addRowButton.style.color = 'var(--button_text_color)';
    addRowButton.addEventListener('mouseenter', () => {
        addRowButton.style.backgroundColor = 'var(--button_hover_bg_color)';
        addRowButton.style.color = 'var(--button_hover_text_color)';
    });
    addRowButton.addEventListener('mouseleave', () => {
        addRowButton.style.backgroundColor = 'var(--button_bg_color)';
        addRowButton.style.color = 'var(--button_text_color)';
    });
    addRowButton.addEventListener('click', () => {
        const newRow = createColumnRow('', '', '', false);
        form.insertBefore(newRow, addRowButton);
    });
    form.appendChild(addRowButton);

    // Kolme nappia: Peruuta, Tallenna, Poista taulu
    const buttonRow = document.createElement('div');
    buttonRow.style.display = 'grid';
    buttonRow.style.gridTemplateColumns = 'auto auto auto';
    buttonRow.style.gridGap = '10px';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Peruuta';
    cancelButton.style.backgroundColor = 'var(--button_bg_color)';
    cancelButton.style.color = 'var(--button_text_color)';
    cancelButton.addEventListener('mouseenter', () => {
        cancelButton.style.backgroundColor = 'var(--button_hover_bg_color)';
        cancelButton.style.color = 'var(--button_hover_text_color)';
    });
    cancelButton.addEventListener('mouseleave', () => {
        cancelButton.style.backgroundColor = 'var(--button_bg_color)';
        cancelButton.style.color = 'var(--button_text_color)';
    });
    cancelButton.addEventListener('click', () => {
        hideModal();
    });
    buttonRow.appendChild(cancelButton);

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.textContent = 'Tallenna muutokset';
    saveButton.style.backgroundColor = 'var(--button_bg_color)';
    saveButton.style.color = 'var(--button_text_color)';
    saveButton.addEventListener('mouseenter', () => {
        saveButton.style.backgroundColor = 'var(--button_hover_bg_color)';
        saveButton.style.color = 'var(--button_hover_text_color)';
    });
    saveButton.addEventListener('mouseleave', () => {
        saveButton.style.backgroundColor = 'var(--button_bg_color)';
        saveButton.style.color = 'var(--button_text_color)';
    });
    buttonRow.appendChild(saveButton);

    const deleteTableButton = document.createElement('button');
    deleteTableButton.type = 'button';
    deleteTableButton.textContent = 'Poista koko taulu';
    deleteTableButton.style.backgroundColor = 'red';
    deleteTableButton.style.color = 'white';
    deleteTableButton.addEventListener('click', async () => {
        const ok = confirm(`Haluatko varmasti poistaa taulun ${table_name} kokonaan? Tätä toimintoa ei voi perua!`);
        if (!ok) return;

        try {
            const resp = await fetch('/api/drop-table', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ table_name })
            });

            if (!resp.ok) {
                const text = await resp.text();
                alert(`Virhe poistettaessa taulua: ${text}`);
                return;
            }

            alert(`Taulu ${table_name} poistettu onnistuneesti.`);
            hideModal();
            location.reload();
        } catch (err) {
            console.error('Virhe poistettaessa taulua:', err);
            alert('Virhe poistettaessa taulua.');
        }
    });
    buttonRow.appendChild(deleteTableButton);

    form.appendChild(buttonRow);

    createModal({
        // Näytetään otsikko vain data-lang-keyllä:
        titleDataLangKey: `manage_table+${table_name}`,
        contentElements: [form],
        maxWidth: '768px'
    });
    showModal();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const currentRows = form.querySelectorAll('.column-row');
        const currentColumns = [];

        currentRows.forEach(r => {
            const nameInput = r.querySelector('input[name="column_name"]');
            const typeSelect = r.querySelector('select[name="data_type"]');
            const lengthInput = r.querySelector('input[name="length"]');

            currentColumns.push({
                original_name: nameInput.dataset.originalName || null,
                new_name: nameInput.value.trim(),
                data_type: typeSelect.value,
                length: lengthInput.value ? parseInt(lengthInput.value, 10) : null
            });
        });

        const removed_columns = [];
        const modified_columns = [];
        const added_columns = [];

        // Alkuperäiset sarakkeet
        for (const initCol of initial_columns) {
            const found = currentColumns.find(c => c.original_name === initCol.column_name);
            if (!found) {
                removed_columns.push(initCol.column_name);
            } else {
                const changedName = found.original_name !== found.new_name;
                let changedType = false;

                if (found.data_type && found.data_type !== initCol.data_type) {
                    changedType = true;
                } else if (initCol.data_type === 'VARCHAR') {
                    const origLen = initCol.length === '' ? null : parseInt(initCol.length, 10);
                    const newLen = found.length;
                    if (origLen !== newLen) {
                        changedType = true;
                    }
                }

                if ((changedName || changedType) && found.data_type !== '') {
                    modified_columns.push({
                        original_name: found.original_name,
                        new_name: found.new_name,
                        data_type: found.data_type,
                        length: found.data_type.toUpperCase() === 'VARCHAR' ? found.length : null
                    });
                }
            }
        }

        // Uudet sarakkeet
        for (const currCol of currentColumns) {
            if (!currCol.original_name && currCol.new_name !== '' && currCol.data_type !== '') {
                added_columns.push({
                    original_name: "",
                    new_name: currCol.new_name,
                    data_type: currCol.data_type,
                    length: currCol.data_type.toUpperCase() === 'VARCHAR' ? currCol.length : null
                });
            }
        }

        const requestData = {
            table_name: table_name,
            modified_columns: modified_columns,
            added_columns: added_columns,
            removed_columns: removed_columns
        };

        console.log("Tallennetaan muutokset:", requestData);

        try {
            const resp = await fetch('/api/modify-columns', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            console.log("Palvelimen vastaus:", resp.status, resp.statusText);
            if (!resp.ok) {
                const text = await resp.text();
                console.log("Palvelimen virhevastaus:", text);
                alert(`Virhe: ${text}`);
                return;
            }

            const responseData = await resp.json();
            console.log("Palvelimen onnistumisvastaus:", responseData);
            alert('Muutokset tallennettu onnistuneesti.');
            hideModal();
            location.reload();

        } catch (error) {
            console.error('Virhe tallennettaessa muutoksia:', error);
            alert('Virhe tallennettaessa muutoksia.');
        }
    });
}

