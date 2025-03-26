// foreign_keys_view.js

import { loadManagementView } from '../../common_components/utils.js';
import { createModal, showModal, hideModal } from '../../common_components/modal/modal_factory.js';
import { fetch_columns_for_table } from '../endpoints/endpoint_column_fetcher.js';
import { endpoint_router } from '../endpoints/endpoint_router.js';
import { createVanillaDropdown } from '../../common_components/vanilla_dropdown/vanilla_dropdown.js';

/**
 * Ladataan foreign keys -näkymä laiskasti, kun välilehti avataan.
 */
export function load_foreign_keys_view() {
    return loadManagementView('foreign_keys_container', generate_foreign_keys_view);
}

/**
 * Pääfunktio, joka generoi "Foreign Keys" -näkymän:
 * 1) Add-nappi ja sen modaalin luominen
 * 2) Taulukko olemassaolevista vierasavaimista
 */
export async function generate_foreign_keys_view(container) {
    try {
        container.replaceChildren(); // Tyhjennä vanha sisältö

        // Luo "Add Foreign Key" -nappi
        const addButton = document.createElement('button');
        addButton.textContent = 'Add Foreign Key';
        addButton.id = 'open_modal_button';
        addButton.style.marginBottom = '20px';
        container.appendChild(addButton);

        // Tapahtumankuuntelija -> avaa modaalin
        addButton.addEventListener('click', async () => {
            const form = await createForeignKeyForm(container);
            createModal({
                titleDataLangKey: 'add-foreign-key',
                contentElements: [form],
                width: '600px'
            });
            showModal();
        });

        // Näytä olemassa olevat vierasavaimet
        await displayForeignKeysTable(container);

    } catch (error) {
        console.error('Error generating foreign key view:', error);
    }
}

/**
 * Luo lomake vierasavaimen lisäämistä varten.
 */
async function createForeignKeyForm(container) {
    const form = document.createElement('form');
    form.id = 'add_foreign_key_form';

    // Luo placeholderit “kontit” omalle dropdownille
    // (Voit sijoittaa nämä labelien sisään, tai viereen, miten vain haluat.)
    const referencingTableDiv = document.createElement('div');
    const referencingColumnDiv = document.createElement('div');
    const referencedTableDiv = document.createElement('div');
    const referencedColumnDiv = document.createElement('div');

    // Lisää lomakkeeseen
    form.appendChild(document.createTextNode('Referencing Table:'));
    form.appendChild(referencingTableDiv);
    form.appendChild(document.createElement('br'));

    form.appendChild(document.createTextNode('Referencing Column:'));
    form.appendChild(referencingColumnDiv);
    form.appendChild(document.createElement('br'));

    form.appendChild(document.createTextNode('Referenced Table:'));
    form.appendChild(referencedTableDiv);
    form.appendChild(document.createElement('br'));

    form.appendChild(document.createTextNode('Referenced Column:'));
    form.appendChild(referencedColumnDiv);
    form.appendChild(document.createElement('br'));

    // Haetaan taulujen nimet /api/table-names -endpointilta
    let tables = [];
    try {
        const resp = await fetch('/api/table-names');
        if (!resp.ok) {
            throw new Error(`Error fetching table names: ${resp.statusText}`);
        }
        tables = await resp.json();  // ["users", "orders", ...]
    } catch (err) {
        console.error('Error fetching table names:', err);
    }

    // Muodostetaan dropdown-valikkojen options-taulukko
    const tableOptions = tables.map(tbl => ({
        value: tbl,
        label: tbl
    }));

    // Luodaan referencing_table -dropdown
    const referencingTableDropdown = createVanillaDropdown({
        containerElement: referencingTableDiv,
        options: tableOptions,
        placeholder: 'Valitse taulu...',
        onChange: async (selectedValue) => {
            // Kun taulu vaihtuu, päivitetään referencingColumnDropdown
            await updateColumnsDropdown(selectedValue, referencingColumnDropdown);
        }
    });

    // Luodaan referencing_column -dropdown, ensin tyhjänä
    const referencingColumnDropdown = createVanillaDropdown({
        containerElement: referencingColumnDiv,
        options: [],  // Aloitetaan tyhjällä
        placeholder: '-- Select Column --',
        onChange: (selectedColumn) => {
            // Tarvittaessa tee jotain, kun column vaihtuu
            console.log("referencing column changed to:", selectedColumn);
        }
    });

    // Vastaavat dropdownit referenced_table / referenced_column
    const referencedTableDropdown = createVanillaDropdown({
        containerElement: referencedTableDiv,
        options: tableOptions,
        placeholder: 'Valitse taulu...',
        onChange: async (selectedValue) => {
            await updateColumnsDropdown(selectedValue, referencedColumnDropdown);
        }
    });

    const referencedColumnDropdown = createVanillaDropdown({
        containerElement: referencedColumnDiv,
        options: [],
        placeholder: '-- Select Column --'
    });

    // Ladataan aluksi column-listat (jos haluat, että ekat valinnat on esivalittu)
    await updateColumnsDropdown(referencingTableDropdown.getValue(), referencingColumnDropdown);
    await updateColumnsDropdown(referencedTableDropdown.getValue(), referencedColumnDropdown);

    // Luo form-action -napit
    const formActions = document.createElement('div');
    formActions.classList.add('form-actions');

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.classList.add('cancel-button');
    cancelButton.addEventListener('click', () => {
        hideModal();
    });

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.textContent = 'Add Foreign Key';
    submitButton.classList.add('submit-button');

    formActions.appendChild(cancelButton);
    formActions.appendChild(submitButton);
    form.appendChild(formActions);

    // Lomakkeen submit
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Haetaan arvot suoraan dropdown-instansseista
        const referencingTableVal = referencingTableDropdown.getValue();
        const referencingColumnVal = referencingColumnDropdown.getValue();
        const referencedTableVal = referencedTableDropdown.getValue();
        const referencedColumnVal = referencedColumnDropdown.getValue();

        if (!referencingTableVal || !referencingColumnVal ||
            !referencedTableVal   || !referencedColumnVal) {
            alert('Täytä kaikki kentät.');
            return;
        }

        const formObject = {
            referencing_table: referencingTableVal,
            referencing_column: referencingColumnVal,
            referenced_table: referencedTableVal,
            referenced_column: referencedColumnVal
        };

        try {
            await endpoint_router('addForeignKey', {
                method: 'POST',
                body_data: formObject
            });
            alert('Foreign key added successfully');
            hideModal();
            generate_foreign_keys_view(container);
        } catch (error) {
            console.error('Error adding foreign key:', error);
            alert('Error adding foreign key: ' + error.message);
        }
    });

    return form;
}

// Aiempi helper-funktio, nyt vain hieman muokattuna:
async function updateColumnsDropdown(tableName, dropdownInstance) {
    // Jos ei ole valittua taulua, nollataan dropdown
    if (!tableName) {
        dropdownInstance.setOptions([]);
        return;
    }

    try {
        const columns_info = await fetch_columns_for_table(tableName);
        // Luodaan options: [{ value: "id", label: "id"}, ...]
        const colOptions = columns_info.map(col => ({
            value: col.column_name,
            label: col.column_name
        }));
        dropdownInstance.setOptions(colOptions);
    } catch (error) {
        console.error(`Error fetching columns for table ${tableName}:`, error);
        dropdownInstance.setOptions([]);
    }
}


/**
 * Näytä table, joka listaa foreign key -tiedot
 */
async function displayForeignKeysTable(container) {
    // Haetaan foreign key -data endpoint_routerilla
    let result;
    try {
        result = await endpoint_router('fetchForeignKeys', { method: 'GET' });
    } catch (err) {
        console.error('Virhe vierasavainten haussa:', err);
        // Voit halutessasi näyttää punaisen virheilmoituksen tms.
        const errorDiv = document.createElement('div');
        errorDiv.style.color = 'red';
        errorDiv.textContent = 'virhe: ' + err.message; // suomeksi punaisella
        container.appendChild(errorDiv);
        return;
    }

    const columns = result.columns; 
    const data = result.data;

    // Taulukon luonti
    const table = document.createElement('table');
    table.id = 'foreign_keys_table';

    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    const header_row = document.createElement('tr');
    // Sarake radiopainikkeelle
    const selectTh = document.createElement('th');
    selectTh.textContent = ''; 
    header_row.appendChild(selectTh);

    columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        header_row.appendChild(th);
    });
    thead.appendChild(header_row);
    table.appendChild(thead);

    data.forEach((item, index) => {
        const row = document.createElement('tr');

        // Radiopainike
        const selectTd = document.createElement('td');
        selectTd.classList.add('select-cell');
        const radioInput = document.createElement('input');
        radioInput.type = 'radio';
        radioInput.name = 'selected_foreign_key';
        radioInput.value = index;
        selectTd.appendChild(radioInput);
        row.appendChild(selectTd);

        columns.forEach(column => {
            const td = document.createElement('td');
            td.textContent = item[column];
            row.appendChild(td);
        });
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // Poista-painike
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Poista valittu vierasavain';
    deleteButton.style.marginTop = '20px';
    deleteButton.addEventListener('click', async () => {
        const selectedRadio = document.querySelector('input[name="selected_foreign_key"]:checked');
        if (!selectedRadio) {
            alert('Valitse vierasavain poistettavaksi.');
            return;
        }
        const selectedIndex = selectedRadio.value;
        const selectedForeignKey = data[selectedIndex];

        if (!confirm('Haluatko varmasti poistaa valitun vierasavaimen?')) {
            return;
        }

        // Lähetä poistopyyntö
        try {
            await endpoint_router('deleteForeignKey', {
                method: 'POST',
                body_data: {
                    constraint_name: selectedForeignKey.constraint_name,
                    referencing_table: selectedForeignKey.referencing_table,
                }
            });
            alert('Vierasavain poistettu onnistuneesti');
            generate_foreign_keys_view(container);

        } catch (error) {
            console.error('Virhe poistettaessa vierasavainta:', error);
            alert('Virhe poistettaessa vierasavainta: ' + error.message);
        }
    });
    container.appendChild(deleteButton);
}
