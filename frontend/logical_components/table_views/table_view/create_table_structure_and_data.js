// create_table_structure_and_data.js

import { filter_table } from '../../../main_app/filterbar/filter.js';
import { toggle_select_all, update_row_selection } from './selection.js';
import { initializeInfiniteScroll } from '../../infinite_scroll/infinite_scroll.js';
import { addEventListenersToCells } from './add_listeners_to_table_cells.js';
import { handleSortClick } from '../../../main_app/gt_crud/gt_read/handle_sort_and_search.js';
import { initialize_column_resizing } from './column_resizing.js';

// Pääfunktio, joka luo taulun rakenteen ja asettaa datan
export function create_table_element(columns, data, table_name, dataTypes) {
    const table = document.createElement('table');
    table.classList.add('table_from_db');
    table.id = `${table_name}_table`;

    table.dataset.columns = JSON.stringify(columns);
    table.dataset.dataTypes = JSON.stringify(dataTypes);

    const colgroup = createColgroup(columns);
    table.appendChild(colgroup);

    const thead = createTableHead(columns, table_name);
    table.appendChild(thead);

    const tbody = createTableBody(columns, data, table_name);
    table.appendChild(tbody);

    addEventListenersToCells(table, columns, data, dataTypes, table_name);

    initializeInfiniteScroll(table_name);
    initialize_column_resizing(table);

    return table;
}

function createColgroup(columns) {
    const colgroup = document.createElement('colgroup');

    // Uusi sarake numeroinnille
    const numbering_col = document.createElement('col');
    colgroup.appendChild(numbering_col);

    // Valintaruutusarake
    const select_col = document.createElement('col');
    colgroup.appendChild(select_col);

    // Varsinaiset taulun sarakkeet
    columns.forEach(() => {
        const col = document.createElement('col');
        colgroup.appendChild(col);
    });
    return colgroup;
}

function createTableHead(columns, table_name) {
    const thead = document.createElement('thead');
    const header_row = document.createElement('tr');
    const filter_row = document.createElement('tr');

    // Numerointisolun otsikko (#)
    const numbering_th = document.createElement('th');
    numbering_th.style.width = '50px';
    numbering_th.style.textAlign = 'center';
    numbering_th.textContent = '';
    header_row.appendChild(numbering_th);

    // Tyhjä solupaikka filtteririville
    const numbering_filter_th = document.createElement('th');
    filter_row.appendChild(numbering_filter_th);

    // Sarake valintaruudulle ("valitse kaikki" -checkbox)
    const select_all_th = document.createElement('th');
    select_all_th.style.width = '50px';
    select_all_th.style.textAlign = 'center';
    select_all_th.style.verticalAlign = 'middle';

    const select_all_checkbox = document.createElement('input');
    select_all_checkbox.type = 'checkbox';
    select_all_checkbox.addEventListener('change', (e) => toggle_select_all(e, table_name));
    select_all_th.appendChild(select_all_checkbox);
    header_row.appendChild(select_all_th);

    const empty_filter_cell = document.createElement('th');
    filter_row.appendChild(empty_filter_cell);

    // Luodaan otsikot data-sarakkeille
    columns.forEach(column => {
        const th = createHeaderCell(column, table_name);
        header_row.appendChild(th);

        const filter_cell = createFilterCell(column, table_name);
        filter_row.appendChild(filter_cell);
    });

    thead.appendChild(header_row);
    thead.appendChild(filter_row);

    return thead;
}

function createHeaderCell(column, table_name) {
    const th = document.createElement('th');
    th.style.cursor = 'default';

    const columnSpan = document.createElement('span');
    columnSpan.textContent = column;

    const sortIndicator = document.createElement('span');
    sortIndicator.classList.add('float_right');
    sortIndicator.style.cursor = 'pointer';

    let sortOrder = localStorage.getItem(`${table_name}_sort_order_${column}`);
    if (sortOrder) {
        sortIndicator.textContent = sortOrder === 'ASC' ? '▲' : '▼';
    } else {
        sortIndicator.textContent = '⇵';
    }

    sortIndicator.addEventListener('click', (event) => {
        event.stopPropagation();
        handleSortClick(column, table_name);
    });

    th.appendChild(columnSpan);
    th.appendChild(sortIndicator);

    return th;
}

function createFilterCell(column, table_name) {
    const filter_cell = document.createElement('th');
    const filter_input = document.createElement('input');
    filter_input.type = 'text';
    filter_input.id = `${table_name}_${column}_filter`;
    filter_input.placeholder = `Hae ${column}`;
    filter_input.addEventListener('keyup', () => filter_table(table_name));
    filter_cell.appendChild(filter_input);

    // Piilotetaan toistaiseksi
    filter_cell.style.display = 'none';

    return filter_cell;
}

function createTableBody(columns, data, table_name) {
    const tbody = document.createElement('tbody');
    tbody.id = `${table_name}_table_body`;

    data.forEach((item, rowIndex) => {
        const row = document.createElement('tr');

        // Uusi numerointisolu
        const numbering_td = document.createElement('td');
        numbering_td.style.textAlign = 'center';
        numbering_td.style.verticalAlign = 'middle';
        numbering_td.classList.add('table_row_numbering');
        numbering_td.textContent = rowIndex + 1;
        row.appendChild(numbering_td);

        // Checkbox-solu
        const checkbox_td = createCheckboxCell(row, table_name);
        row.appendChild(checkbox_td);

        // Data-sarakkeet
        columns.forEach((column, colIndex) => {
            const td = createDataCell(item, column, columns, rowIndex, colIndex);
            row.appendChild(td);
        });

        tbody.appendChild(row);
    });

    return tbody;
}

export function createCheckboxCell(row) {
    const checkbox_td = document.createElement('td');
    checkbox_td.style.textAlign = 'center';
    checkbox_td.style.verticalAlign = 'middle';

    const row_checkbox = document.createElement('input');
    row_checkbox.type = 'checkbox';
    row_checkbox.classList.add('row_checkbox');
    row_checkbox.addEventListener('change', () => update_row_selection(row));
    checkbox_td.appendChild(row_checkbox);

    return checkbox_td;
}

export function createDataCell(item, column, columns, rowIndex, colIndex) {
    const td = document.createElement('td');
    td.tabIndex = 0;
    td.dataset.rowIndex = rowIndex;
    td.dataset.colIndex = colIndex;

    let value = item[column];
    let displayValue = '';

    const foreignKeyColumn = column.replace('_name', '_id');

    if (columns.includes(foreignKeyColumn)) {
        value = item[column];
        displayValue = formatValue(value);
        td.textContent = displayValue;
    } else if (columns.includes(`${column}_name`)) {
        value = item[column];
        td.title = (item[`${column}_name`] === null || item[`${column}_name`] === undefined)
          ? 'Tuntematon'
          : item[`${column}_name`];
        displayValue = formatValue(value);
        td.textContent = displayValue;
    } else {
        value = item[column];
        displayValue = formatValue(value);
        td.textContent = displayValue;
    }

    return td;
}

function formatValue(value) {
    if (value === null || value === undefined) {
        return 'Tuntematon';
    } else if (Array.isArray(value)) {
        return value.join(', ');
    } else if (typeof value === 'object') {
        const sortedValue = sortObjectKeys(value);
        return JSON.stringify(sortedValue, null, 2);
    } else {
        return value;
    }
}

function sortObjectKeys(obj) {
    return Object.keys(obj).sort().reduce((result, key) => {
        result[key] = obj[key];
        return result;
    }, {});
}
