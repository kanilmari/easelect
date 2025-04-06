// create_table.js

// Voit pitää default_auto_columns samana kuin aiemmin
const default_auto_columns = [
    { column_name: 'id', data_type: 'SERIAL' },
    { column_name: 'created', data_type: 'TIMESTAMPTZ NOT NULL DEFAULT NOW()' },
    { column_name: 'updated', data_type: 'TIMESTAMPTZ NOT NULL DEFAULT NOW()' }
];

import { loadManagementView } from '../../../../common_components/utils.js';
import { fetch_columns_for_table } from '../../../endpoints/endpoint_column_fetcher.js';

export function load_table_creation() {
    // Annetaan id sekä generointifunktio:
    return loadManagementView('table_creation_container', generate_table_creation_view);
}

export async function generate_table_creation_view(container) {
    container.replaceChildren(); // Tyhjennä mahdollinen aiempi sisältö

    const form = document.createElement('form');
    form.id = 'table_creation_form';
    form.style.display = 'grid';
    form.style.gridTemplateColumns = '1fr'; 
    form.style.gridGap = '10px'; 
    form.style.backgroundColor = 'var(--bg_color)';
    form.style.color = 'var(--text_color)';
    form.style.border = '1px solid var(--border_color)';
    form.style.padding = '10px';

    // Taulun nimi
    const tableNameLabel = document.createElement('label');
    tableNameLabel.textContent = 'Taulun nimi: ';
    const tableNameInput = document.createElement('input');
    tableNameInput.type = 'text';
    tableNameInput.id = 'table_name';
    tableNameInput.name = 'table_name';
    tableNameInput.required = true;
    tableNameLabel.appendChild(tableNameInput);
    form.appendChild(tableNameLabel);

    // Sarakkeet container
    const columnsContainer = document.createElement('div');
    columnsContainer.id = 'columns_container';
    columnsContainer.style.display = 'grid';
    columnsContainer.style.gridTemplateColumns = '1fr';
    columnsContainer.style.gridGap = '5px';
    form.appendChild(columnsContainer);

    // Lisää sarake -painike
    const addColumnButton = document.createElement('button');
    addColumnButton.type = 'button';
    addColumnButton.textContent = 'Lisää sarake';
    addColumnButton.style.backgroundColor = 'var(--button_bg_color)';
    addColumnButton.style.color = 'var(--button_text_color)';
    addColumnButton.addEventListener('mouseenter', () => {
        addColumnButton.style.backgroundColor = 'var(--button_hover_bg_color)';
        addColumnButton.style.color = 'var(--button_hover_text_color)';
    });
    addColumnButton.addEventListener('mouseleave', () => {
        addColumnButton.style.backgroundColor = 'var(--button_bg_color)';
        addColumnButton.style.color = 'var(--button_text_color)';
    });
    addColumnButton.addEventListener('click', () => addColumnField(columnsContainer));
    form.appendChild(addColumnButton);

    // Vierasavaimet-container
    const foreignKeysContainer = document.createElement('div');
    foreignKeysContainer.id = 'foreign_keys_container';
    foreignKeysContainer.style.display = 'grid';
    foreignKeysContainer.style.gridTemplateColumns = '1fr';
    foreignKeysContainer.style.gridGap = '5px';
    form.appendChild(foreignKeysContainer);

    // Lisää vierasavain -painike
    const addForeignKeyButton = document.createElement('button');
    addForeignKeyButton.type = 'button';
    addForeignKeyButton.textContent = 'Lisää vierasavain';
    addForeignKeyButton.style.backgroundColor = 'var(--button_bg_color)';
    addForeignKeyButton.style.color = 'var(--button_text_color)';
    addForeignKeyButton.addEventListener('mouseenter', () => {
        addForeignKeyButton.style.backgroundColor = 'var(--button_hover_bg_color)';
        addForeignKeyButton.style.color = 'var(--button_hover_text_color)';
    });
    addForeignKeyButton.addEventListener('mouseleave', () => {
        addForeignKeyButton.style.backgroundColor = 'var(--button_bg_color)';
        addForeignKeyButton.style.color = 'var(--button_text_color)';
    });
    addForeignKeyButton.addEventListener('click', async () => {
        await addForeignKeyField(foreignKeysContainer);
    });
    form.appendChild(addForeignKeyButton);

    // Lähetä-painike
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.textContent = 'Luo Taulu';
    submitButton.style.backgroundColor = 'var(--button_bg_color)';
    submitButton.style.color = 'var(--button_text_color)';
    submitButton.addEventListener('mouseenter', () => {
        submitButton.style.backgroundColor = 'var(--button_hover_bg_color)';
        submitButton.style.color = 'var(--button_hover_text_color)';
    });
    submitButton.addEventListener('mouseleave', () => {
        submitButton.style.backgroundColor = 'var(--button_bg_color)';
        submitButton.style.color = 'var(--button_text_color)';
    });
    form.appendChild(submitButton);

    // Lomakkeen lähetyksen käsittely
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitTableCreationForm(form);
    });

    container.appendChild(form);

    // Lisää oletuksena auto-sarakkeet (id, created, updated) 
    // ja sitten yksi "tyhjä" sarake, niin käyttäjä näkee logiikan.
    default_auto_columns.forEach(ac => {
        addColumnField(columnsContainer, ac.column_name, ac.data_type);
    });
    // Yksi täysin tyhjä sarake
    addColumnField(columnsContainer);

    // Haetaan heti taulujen nimet vierasavainvalintoja varten
    window.allTables = await fetchTableNames(); 
}

function addColumnField(container, initialName = '', initialType = '') {
    const columnDiv = document.createElement('div');
    columnDiv.className = 'column-field';

    // Sarakenimi
    const columnNameLabel = document.createElement('label');
    columnNameLabel.textContent = 'Sarakenimi: ';
    const columnNameInput = document.createElement('input');
    columnNameInput.type = 'text';
    columnNameInput.name = 'column_name';
    columnNameInput.required = false;
    columnNameInput.value = initialName;
    columnNameLabel.appendChild(columnNameInput);
    columnDiv.appendChild(columnNameLabel);

    // Tietotyyppi
    const dataTypeLabel = document.createElement('label');
    dataTypeLabel.textContent = ' Tietotyyppi: ';
    const dataTypeSelect = document.createElement('select');
    dataTypeSelect.name = 'data_type';
    dataTypeSelect.required = false;
    const dataTypes = [
        { value: '', text: 'Valitse tietotyyppi' },
        { value: 'SERIAL', text: 'SERIAL' },
        { value: 'INTEGER', text: 'INTEGER' },
        { value: 'VARCHAR', text: 'VARCHAR' },
        { value: 'TEXT', text: 'TEXT' },
        { value: 'BOOLEAN', text: 'BOOLEAN' },
        { value: 'DATE', text: 'DATE' },
        { value: 'TIMESTAMPTZ NOT NULL DEFAULT NOW()', text: 'TIMESTAMPTZ (auto)' },
        { value: 'JSONB', text: 'JSONB' }
    ];

    dataTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type.value;
        option.textContent = type.text;
        dataTypeSelect.appendChild(option);
    });

    dataTypeSelect.value = initialType || '';
    dataTypeLabel.appendChild(dataTypeSelect);
    columnDiv.appendChild(dataTypeLabel);

    // Pituus (vain VARCHAR)
    const lengthLabel = document.createElement('label');
    lengthLabel.textContent = ' Pituus: ';
    const lengthInput = document.createElement('input');
    lengthInput.type = 'number';
    lengthInput.name = 'length';
    lengthInput.min = '1';
    lengthInput.style.display = 'none'; // Piilotetaan oletuksena
    lengthLabel.appendChild(lengthInput);
    columnDiv.appendChild(lengthLabel);

    // Poista-painike
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Poista';
    removeButton.style.backgroundColor = 'var(--button_bg_color)';
    removeButton.style.color = 'var(--button_text_color)';
    removeButton.addEventListener('mouseenter', () => {
        removeButton.style.backgroundColor = 'var(--button_hover_bg_color)';
        removeButton.style.color = 'var(--button_hover_text_color)';
    });
    removeButton.addEventListener('mouseleave', () => {
        removeButton.style.backgroundColor = 'var(--button_bg_color)';
        removeButton.style.color = 'var(--button_text_color)';
    });
    removeButton.addEventListener('click', () => {
        container.removeChild(columnDiv);
    });
    columnDiv.appendChild(removeButton);

    dataTypeSelect.addEventListener('change', () => {
        if (dataTypeSelect.value === 'VARCHAR') {
            lengthInput.style.display = 'inline-block';
            lengthInput.required = true;
        } else {
            lengthInput.style.display = 'none';
            lengthInput.required = false;
            lengthInput.value = '';
        }
    });

    container.appendChild(columnDiv);
}

async function addForeignKeyField(container) {
    if(!window.allTables) {
        window.allTables = await fetchTableNames();
    }

    const fkDiv = document.createElement('div');
    fkDiv.className = 'foreign-key-field';
    fkDiv.style.display = 'grid';
    fkDiv.style.gridTemplateColumns = 'auto auto';
    fkDiv.style.alignItems = 'center';
    fkDiv.style.border = '1px solid var(--table_border_color)';
    fkDiv.style.padding = '5px';

    // Referoiva sarake
    const referencingColumnLabel = document.createElement('label');
    referencingColumnLabel.textContent = 'Referoiva sarake: ';
    const referencingColumnSelect = document.createElement('select');
    referencingColumnSelect.name = 'fk_referencing_column';
    referencingColumnSelect.required = true;
    referencingColumnLabel.appendChild(referencingColumnSelect);
    fkDiv.appendChild(referencingColumnLabel);

    // Viitattava taulu
    const referencedTableLabel = document.createElement('label');
    referencedTableLabel.textContent = 'Viitattava taulu: ';
    const referencedTableSelect = document.createElement('select');
    referencedTableSelect.name = 'fk_referenced_table';
    referencedTableSelect.required = true;
    for (const t of window.allTables) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        referencedTableSelect.appendChild(opt);
    }
    referencedTableLabel.appendChild(referencedTableSelect);
    fkDiv.appendChild(referencedTableLabel);

    // Viitattava sarake
    const referencedColumnLabel = document.createElement('label');
    referencedColumnLabel.textContent = 'Viitattava sarake: ';
    const referencedColumnSelect = document.createElement('select');
    referencedColumnSelect.name = 'fk_referenced_column';
    referencedColumnSelect.required = true;
    referencedColumnLabel.appendChild(referencedColumnSelect);
    fkDiv.appendChild(referencedColumnLabel);

    // Poista vierasavain -painike
    const removeFkButton = document.createElement('button');
    removeFkButton.type = 'button';
    removeFkButton.textContent = 'Poista';
    removeFkButton.style.backgroundColor = 'var(--button_bg_color)';
    removeFkButton.style.color = 'var(--button_text_color)';
    removeFkButton.addEventListener('mouseenter', () => {
        removeFkButton.style.backgroundColor = 'var(--button_hover_bg_color)';
        removeFkButton.style.color = 'var(--button_hover_text_color)';
    });
    removeFkButton.addEventListener('mouseleave', () => {
        removeFkButton.style.backgroundColor = 'var(--button_bg_color)';
        removeFkButton.style.color = 'var(--button_text_color)';
    });
    removeFkButton.addEventListener('click', () => {
        container.removeChild(fkDiv);
    });
    fkDiv.appendChild(removeFkButton);

    referencedTableSelect.addEventListener('change', async () => {
        await updateReferencedColumnsDropdown(referencedTableSelect.value, referencedColumnSelect);
    });

    await updateReferencedColumnsDropdown(referencedTableSelect.value, referencedColumnSelect);
    updateReferencingColumnsDropdown(referencingColumnSelect);

    container.appendChild(fkDiv);
}

function updateReferencingColumnsDropdown(selectElement) {
    const columnInputs = document.querySelectorAll('#columns_container .column-field input[name="column_name"]');
    selectElement.replaceChildren();
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- Valitse sarake --';
    selectElement.appendChild(emptyOption);
    columnInputs.forEach(input => {
        const trimmedVal = input.value.trim();
        if (trimmedVal) {
            const opt = document.createElement('option');
            opt.value = trimmedVal;
            opt.textContent = trimmedVal;
            selectElement.appendChild(opt);
        }
    });
}

async function updateReferencedColumnsDropdown(tableName, selectElement) {
    selectElement.replaceChildren();
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- Valitse sarake --';
    selectElement.appendChild(emptyOption);

    try {
        // Käytetään uutta funktiota
        const columns_info = await fetch_columns_for_table(tableName);
        columns_info.forEach(col => {
            const option = document.createElement('option');
            option.value = col.column_name;
            option.textContent = col.column_name;
            selectElement.appendChild(option);
        });
    } catch (error) {
        console.error(`Virhe haettaessa sarakkeita taulusta ${tableName}:`, error);
    }
}

async function fetchTableNames() {
    const tablesResponse = await fetch('/api/table-names');
    if (!tablesResponse.ok) {
        throw new Error(`Virhe taulujen nimien haussa: ${tablesResponse.statusText}`);
    }
    const tables = await tablesResponse.json(); 
    return tables;
}

async function submitTableCreationForm(form) {
    const formData = new FormData(form);
    const tableName = formData.get('table_name').trim();
    if (!tableName) {
        alert('Taulun nimi on pakollinen.');
        return;
    }

    // Kerätään saraketiedot
    const columnNames = formData.getAll('column_name');
    const dataTypes = formData.getAll('data_type');
    const lengths = formData.getAll('length');

    // Rakennetaan columns-olio
    const columns = {};
    for (let i = 0; i < columnNames.length; i++) {
        const colName = columnNames[i].trim();
        const dataType = dataTypes[i];
        const length = lengths[i];

        if (!colName) {
            continue;
        }
        if (!dataType) {
            alert(`Tietotyyppi puuttuu sarakkeelle "${colName}".`);
            return;
        }

        let typeDefinition = dataType;
        if (dataType === 'VARCHAR' && length) {
            typeDefinition += `(${length})`;
        }
        columns[colName] = typeDefinition;
    }

    if (Object.keys(columns).length === 0) {
        alert('Lisää vähintään yksi sarake.');
        return;
    }

    // Kerätään vierasavaintiedot
    const referencingColumns = formData.getAll('fk_referencing_column');
    const referencedTables = formData.getAll('fk_referenced_table');
    const referencedColumns = formData.getAll('fk_referenced_column');

    const foreignKeys = [];
    for (let i = 0; i < referencingColumns.length; i++) {
        const refCol = referencingColumns[i].trim();
        const refTable = referencedTables[i].trim();
        const refColumn = referencedColumns[i].trim();

        if (refCol && refTable && refColumn) {
            foreignKeys.push({
                referencing_column: refCol,
                referenced_table: refTable,
                referenced_column: refColumn
            });
        }
    }

    const requestData = {
        table_name: tableName,
        columns: columns,
        foreign_keys: foreignKeys
    };

    try {
        const response = await fetch('/create_table', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        const resultText = await response.text();

        if (response.ok) {
            alert('Taulu luotu onnistuneesti!');
            form.reset();
            // Palautetaan lomake oletustilaan
            const columnsContainer = document.getElementById('columns_container');
            columnsContainer.replaceChildren();
            default_auto_columns.forEach(ac => {
                addColumnField(columnsContainer, ac.column_name, ac.data_type);
            });
            addColumnField(columnsContainer); 
            const fkContainer = document.getElementById('foreign_keys_container');
            fkContainer.replaceChildren();
        } else {
            alert(`Virhe taulua luodessa: ${resultText}`);
        }
    } catch (error) {
        console.error('Virhe taulua luodessa:', error);
        alert('Virhe taulua luodessa.');
    }
}