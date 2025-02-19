// set_table_columns.js

import { loadManagementView } from './utils.js';
import { fetchTableData } from '../main_app/endpoints/endpoint_data_fetcher.js';
import { fetch_columns_for_table } from '../main_app/endpoints/endpoint_column_fetcher.js';
import { createVanillaDropdown } from './vanilla_dropdown/vanilla_dropdown.js';

export async function load_table_columns() {
    return loadManagementView('table_columns_container', generate_table_columns_view);
}

async function generate_table_columns_view(container) {
    try {
        container.innerHTML = ''; // Tyhjennetään kontti varmuuden vuoksi

        // Luodaan lomake
        const form = document.createElement('form');
        form.id = 'table_columns_form';

        // Haetaan listaus tauluista
        const { data: tables } = await fetchTableData({ table_name: 'system_db_tables' });

        // Luodaan vaniljadropdownin kääre-elementti
        const dropdownContainer = document.createElement('div');
        dropdownContainer.classList.add('table-dropdown-container');

        // Muutetaan taulut -> { value, label } -muoto
        const dropdownOptions = tables.map(table => ({
            value: table.table_name,
            label: table.table_name
        }));

        // Luodaan hakutoiminnolla varustettu dropdown
        const tableDropdownInstance = createVanillaDropdown({
            containerElement: dropdownContainer,
            options: dropdownOptions,
            placeholder: 'Valitse taulu...',
            searchPlaceholder: 'Hae taulua...',
            onChange: async (selectedTable) => {
                if (selectedTable) {
                    await display_table_columns(selectedTable, columnsContainer);
                }
            }
        });

        // Lisätään dropdownContainer lomakkeeseen
        form.appendChild(dropdownContainer);

        // Tyhjä div sarakkeille
        const columnsContainer = document.createElement('div');
        columnsContainer.id = 'columns_container';
        form.appendChild(columnsContainer);

        // Lisätään lomake containeriin
        container.appendChild(form);

        // Jos tauluja on, asetetaan ensimmäinen valituksi ja haetaan sen sarakkeet
        if (tables.length > 0) {
            tableDropdownInstance.setValue(tables[0].table_name, true);
        }

    } catch (error) {
        console.error('Virhe taulun sarakkeita luodessa:', error);
    }
}

async function display_table_columns(table_name, columnsContainer) {
    try {
        columnsContainer.innerHTML = ''; // Tyhjennetään mahdolliset aiemmat sarakkeet

        // Haetaan saraketiedot
        const columnsInfo = await fetch_columns_for_table(table_name);

        // column_uid -> column_name -mapping
        const columnIdToName = {};
        columnsInfo.forEach(column => {
            columnIdToName[column.column_uid] = column.column_name;
        });

        // Oletusjärjestys
        let columnsOrder = columnsInfo.map(column => column.column_uid);

        // Haetaan mahdollinen käyttäjän määrittämä järjestys col_display_order -kentästä
        const { data: tableDataArray } = await fetchTableData({ table_name });
        const tableData = tableDataArray[0]; // Oletetaan ensimmäinen rivi

        if (tableData && Array.isArray(tableData.col_display_order) && tableData.col_display_order.length > 0) {
            let userDefinedOrder = tableData.col_display_order;

            // Poistetaan mahdolliset viittaukset kadonneisiin sarakkeisiin
            userDefinedOrder = userDefinedOrder.filter(colId => columnIdToName[colId]);

            // Lisätään uudet sarakkeet, joita ei ole käyttäjän järjestyksessä
            const remainingCols = columnsOrder.filter(colId => !userDefinedOrder.includes(colId));
            columnsOrder = [...userDefinedOrder, ...remainingCols];
        }

        // Järjestettävä lista
        const list = document.createElement('ul');
        list.id = 'sortable_columns';
        list.style.listStyleType = 'none';
        list.style.padding = '0';

        columnsOrder.forEach(columnId => {
            const listItem = document.createElement('li');
            listItem.textContent = columnIdToName[columnId] || columnId;
            listItem.dataset.columnId = columnId;
            listItem.style.padding = '8px';
            listItem.style.border = '1px solid var(--border_color, #ccc)';
            listItem.style.marginBottom = '4px';
            listItem.style.cursor = 'move';
            list.appendChild(listItem);
        });

        columnsContainer.appendChild(list);

        // SortableJS
        new Sortable(list, {
            animation: 150
        });

        // "Tallenna järjestys" -painike
        let saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.id = 'save_order_button';
        saveButton.textContent = 'Tallenna järjestys';
        saveButton.addEventListener('click', () => saveColumnOrder(table_name));
        columnsContainer.appendChild(saveButton);

    } catch (error) {
        console.error(`Virhe sarakkeita näytettäessä taululle ${table_name}:`, error);
    }
}

async function saveColumnOrder(table_name) {
    try {
        const listItems = document.querySelectorAll('#sortable_columns li');
        // Poimitaan column_uid:t
        const newOrder = Array.from(listItems)
            .map(item => parseInt(item.dataset.columnId, 10))
            .filter(colId => !isNaN(colId));

        // Lähetetään uusi järjestys taustapalvelulle
        const response = await fetch(`/tables/system_db_tables/update_column_order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                table_name: table_name,
                new_order: newOrder
            })
        });

        if (response.ok) {
            alert('Sarakkeiden järjestys tallennettu onnistuneesti!');
        } else {
            const errorData = await response.json();
            alert(`Virhe tallennettaessa järjestystä: ${errorData.message || 'Tuntematon virhe.'}`);
        }

    } catch (error) {
        console.error('Virhe tallennettaessa sarakkeiden järjestystä:', error);
        alert('Virhe tallennettaessa sarakkeiden järjestystä.');
    }
}
