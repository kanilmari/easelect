// foreign_keys_view.js

import { loadManagementView } from '../common_actions/utils.js';
import { createModal, showModal, hideModal } from '../common_actions/modal/modal_factory.js';
import { fetch_columns_for_table } from './general_table_tab/gt_crud/gt_read/endpoint_column_fetcher.js';

export function load_foreign_keys_view() {
    // Annetaan id sekä generointifunktio:
    return loadManagementView('foreign_keys_container', generate_foreign_keys_view);
}

export async function generate_foreign_keys_view(container) {
    try {
        container.innerHTML = ''; // Tyhjennä vanha sisältö

        // Luo "Add Foreign Key" -nappi
        const addButton = document.createElement('button');
        addButton.textContent = 'Add Foreign Key';
        addButton.id = 'open_modal_button';
        addButton.style.marginBottom = '20px'; // Lisää hieman tilaa napin alle
        container.appendChild(addButton);

        // Lisää napille tapahtumankuuntelija modaalin avaamiseksi
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

async function createForeignKeyForm(container) {
    // Luo lomake-elementti
    const form = document.createElement('form');
    form.id = 'add_foreign_key_form';

    // Määrittele kentät halutussa järjestyksessä
    const fields = [
        { name: 'referencing_table', label: 'Referencing Table' },
        { name: 'referencing_column', label: 'Referencing Column' },
        { name: 'referenced_table', label: 'Referenced Table' },
        { name: 'referenced_column', label: 'Referenced Column' },
    ];

    // Säilö select-elementit
    const selects = {};

    // Hae taulujen nimet
    const tablesResponse = await fetch('/api/table-names');
    if (!tablesResponse.ok) {
        throw new Error(`Error fetching table names: ${tablesResponse.statusText}`);
    }
    const tables = await tablesResponse.json(); // Taulujen nimet taulukossa

    // Luo select-elementit kentille järjestyksessä
    for (const field of fields) {
        const label = document.createElement('label');
        label.textContent = field.label + ': ';
        const select = document.createElement('select');
        select.name = field.name;
        select.required = true;
        label.appendChild(select);
        form.appendChild(label);
        form.appendChild(document.createElement('br'));

        if (field.name.endsWith('table')) {
            // Täytä taulut select-elementtiin
            tables.forEach(table => {
                const option = document.createElement('option');
                option.value = table;
                option.textContent = table;
                select.appendChild(option);
            });
        } else if (field.name.endsWith('column')) {
            // Alusta column select tyhjillä vaihtoehdoilla
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-- Select Column --';
            select.appendChild(emptyOption);
        }

        // Tallenna select-elementti
        selects[field.name] = select;
    }

    // Lisää tapahtumankuuntelijat table-valinnoille
    selects['referencing_table'].addEventListener('change', async () => {
        await updateColumnsDropdown(selects['referencing_table'].value, selects['referencing_column']);
    });

    selects['referenced_table'].addEventListener('change', async () => {
        await updateColumnsDropdown(selects['referenced_table'].value, selects['referenced_column']);
    });

    // Aluksi lataa sarakkeet oletusvalituilla tauluilla
    await updateColumnsDropdown(selects['referencing_table'].value, selects['referencing_column']);
    await updateColumnsDropdown(selects['referenced_table'].value, selects['referenced_column']);

    // Lisää lomakkeen toiminnot
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

    // Lisää lomakkeen lähettämistapahtumankuuntelija
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        const formObject = {};
        formData.forEach((value, key) => {
            formObject[key] = value.trim();
        });

        // Lähetä data backendille
        try {
            const response = await fetch('/add_foreign_key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formObject),
            });
            if (response.ok) {
                alert('Foreign key added successfully');
                hideModal();
                // Päivitä vierasavainten näkymä
                generate_foreign_keys_view(container);
            } else {
                const errorData = await response.json();
                alert('Error adding foreign key: ' + (errorData.error || response.statusText));
            }
        } catch (error) {
            console.error('Error adding foreign key:', error);
            alert('Error adding foreign key: ' + error.message);
        }
    });

    return form;
}

/**
 * updateColumnsDropdown:
 * Korvattu suora fetch-kutsu fetch_columns_for_table -funktiolla
 */
async function updateColumnsDropdown(tableName, columnsSelect) {
    columnsSelect.innerHTML = '';
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- Select Column --';
    columnsSelect.appendChild(emptyOption);

    try {
        const columns_info = await fetch_columns_for_table(tableName);
        // Populate the columns dropdown
        columns_info.forEach(column => {
            const option = document.createElement('option');
            option.value = column.column_name;
            option.textContent = column.column_name;
            columnsSelect.appendChild(option);
        });
    } catch (error) {
        console.error(`Error fetching columns for table ${tableName}:`, error);
    }
}

async function displayForeignKeysTable(container) {
    // Fetch foreign keys
    const response = await fetch('/foreign_keys');
    const result = await response.json();
    const columns = result.columns; // ['referencing_table', 'referencing_column', 'referenced_table', 'referenced_column']
    const data = result.data;

    // Luo taulukko vierasavainten näyttämistä varten
    const table = document.createElement('table');
    table.id = 'foreign_keys_table'; // Lisää id helpompaa valintaa varten
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    // Lisää sarake radiopainikkeille
    const header_row = document.createElement('tr');
    const selectTh = document.createElement('th');
    selectTh.textContent = ''; // Tyhjä otsikko valintasarakkeelle
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

        // Lisää radiopainike
        const selectTd = document.createElement('td');
        selectTd.classList.add('select-cell'); // Lisää CSS-luokka
        const radioInput = document.createElement('input');
        radioInput.type = 'radio';
        radioInput.name = 'selected_foreign_key';
        radioInput.value = index; // Käytä indeksiä arvona
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

    // Lisää Poista-painike
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Poista valittu vierasavain';
    deleteButton.style.marginTop = '20px'; // Lisää tilaa taulukon yläpuolelle
    deleteButton.addEventListener('click', async () => {
        // Hae valittu radiopainike
        const selectedRadio = document.querySelector('input[name="selected_foreign_key"]:checked');
        if (!selectedRadio) {
            alert('Valitse vierasavain poistettavaksi.');
            return;
        }
        const selectedIndex = selectedRadio.value;
        const selectedForeignKey = data[selectedIndex];

        // Vahvista poisto
        if (!confirm('Haluatko varmasti poistaa valitun vierasavaimen?')) {
            return;
        }

        // Lähetä poistopyyntö backendille
        try {
            const response = await fetch('/delete_foreign_key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    constraint_name: selectedForeignKey.constraint_name,
                    referencing_table: selectedForeignKey.referencing_table,
                }),
            });
            if (response.ok) {
                alert('Vierasavain poistettu onnistuneesti');
                // Päivitä vierasavainten näkymä
                generate_foreign_keys_view(container);
            } else {
                const errorData = await response.json();
                alert('Virhe poistettaessa vierasavainta: ' + (errorData.error || response.statusText));
            }
        } catch (error) {
            console.error('Virhe poistettaessa vierasavainta:', error);
            alert('Virhe poistettaessa vierasavainta: ' + error.message);
        }
    });
    container.appendChild(deleteButton);
}
