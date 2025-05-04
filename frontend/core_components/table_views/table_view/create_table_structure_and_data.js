// create_table_structure_and_data.js

import { toggle_select_all, update_row_selection } from './selection.js';
import { addEventListenersToCells } from './add_listeners_to_table_cells.js';
import { initialize_column_resizing } from './column_resizing.js';

// Uusi unify-funktiot – polku voi olla erilainen projektissasi!
import { getUnifiedTableState, setUnifiedTableState, refreshTableUnified } from '../../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js'; 
import { resetOffset } from '../../infinite_scroll/infinite_scroll.js';
import { makeColumnClass } from '../../filterbar/column_visibility.js';
/**
 * Pääfunktio, joka luo taulun rakenteen ja asettaa datan.
 */
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
    initialize_column_resizing(table);

    return table;
}

function createColgroup(columns) {
    const colgroup = document.createElement('colgroup');

    // Numerointisolu
    const numbering_col = document.createElement('col');
    colgroup.appendChild(numbering_col);

    // Valintaruutusolu
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

    // --- Numerointisolu (#) ---
    const numbering_th = document.createElement('th');
    numbering_th.style.width = '50px';
    numbering_th.style.textAlign = 'center';
    numbering_th.textContent = '';
    header_row.appendChild(numbering_th);

    // Tyhjä solupaikka filtteririville
    const numbering_filter_th = document.createElement('th');
    filter_row.appendChild(numbering_filter_th);

    // --- Sarake valintaruudulle ( "valitse kaikki" -checkbox ) ---
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

    // --- Data-sarakkeiden otsikot & filtterit ---
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

/**
 * createHeaderCell:
 *  - Luo yhden <th>-solun, johon lisätään sarakkeen nimi
 *  - Perään sortIndicator (ASC/DESC/none)
 *  - Klikatessa sortIndicatoria päivitetään unified-tila ja kutsutaan refresh.
 */
function createHeaderCell(column, table_name) {
    const th = document.createElement('th');
    th.style.cursor = 'default';
    th.classList.add(makeColumnClass(table_name, column));   // ★

    const columnSpan = document.createElement('span');
    columnSpan.textContent = column;

    // Sort-indikaattori
    const sortIndicator = document.createElement('span');
    sortIndicator.classList.add('float_right');
    sortIndicator.style.cursor = 'pointer';

    const st = getUnifiedTableState(table_name);
    if (st.sort && st.sort.column === column) {
        sortIndicator.textContent = (st.sort.direction === 'ASC') ? '▲'
                                   : (st.sort.direction === 'DESC') ? '▼'
                                   : '⇵';
    } else {
        sortIndicator.textContent = '⇵';
    }

    sortIndicator.addEventListener('click', (e) => {
        e.stopPropagation();
        onSortIndicatorClick(table_name, column);
    });

    th.appendChild(columnSpan);
    th.appendChild(sortIndicator);
    return th;
}

/**
 * Klikattaessa sort-indikaattoria:
 *  - luetaan nykyinen state
 *  - jos sama sarake => kierretään ASC->DESC->none
 *  - jos eri sarake => asetetaan ASC
 *  - tallennetaan & refresh.
 */
function onSortIndicatorClick(table_name, column) {
    const state = getUnifiedTableState(table_name);
    if (!state.sort) {
        state.sort = { column: null, direction: null };
    }

    let currentCol = state.sort.column;
    let currentDir = (state.sort.direction || '').toUpperCase();

    if (currentCol === column) {
        if (currentDir === 'ASC') {
            // vaihdetaan DESC
            state.sort.direction = 'DESC';
        } else if (currentDir === 'DESC') {
            // poistetaan sort
            state.sort.column = null;
            state.sort.direction = null;
        } else {
            // none -> ASC
            state.sort.direction = 'ASC';
        }
    } else {
        // uusi sarake => ASC
        state.sort.column = column;
        state.sort.direction = 'ASC';
    }
    console.log('table_refresh_collector.js: onSortIndicatorClick kutsuu funktiota setUnifiedTableState arvoilla: ', table_name, state);
    setUnifiedTableState(table_name, state);
    resetOffset();
    refreshTableUnified(table_name, {});
}

/**
 * createFilterCell:
 *  - Luo <th>, jossa on <input> filtterin kirjoittamista varten
 *  - Käytetään ID-muotoa: `${table_name}_${column}_filter`
 *  - onkeyup => tallennetaan unifyed-tilaan ja refresh
 */
function createFilterCell(column, table_name) {
    const filter_cell = document.createElement('th');
    filter_cell.classList.add(makeColumnClass(table_name, column)); // ★

    const filter_input = document.createElement('input');
    filter_input.type  = 'text';
    filter_input.id    = `${table_name}_${column}_filter`;
    filter_input.placeholder = `Hae ${column}`;

    const st = getUnifiedTableState(table_name);
    const filterKey = filter_input.id;
    if (st.filters && st.filters[filterKey]) {
        filter_input.value = st.filters[filterKey];
    }

    filter_input.addEventListener('keyup', () => {
        updateFilterAndRefresh(table_name, filterKey, filter_input.value);
    });

    filter_cell.appendChild(filter_input);
    return filter_cell;
}

/**
 * Tallentaa filterin unifyed-tilaan, nollaa offsetin, refreshTableUnified.
 */
function updateFilterAndRefresh(table_name, filterKey, value) {
    const st = getUnifiedTableState(table_name);
    if (!st.filters) {
        st.filters = {};
    }
    if (value.trim() === '') {
        delete st.filters[filterKey];
    } else {
        st.filters[filterKey] = value;
    }
    console.log('table_refresh_collector.js: updateFilterAndRefresh kutsuu funktiota setUnifiedTableState arvoilla: ', table_name, st);
    setUnifiedTableState(table_name, st);
    resetOffset();
    refreshTableUnified(table_name, {});
}

function createTableBody(columns, data, table_name) {
    const tbody = document.createElement('tbody');
    tbody.id = `${table_name}_table_body`;

    data.forEach((item, rowIndex) => {
        const row = document.createElement('tr');

        // Numerointisolu
        const numbering_td = document.createElement('td');
        numbering_td.style.textAlign = 'center';
        numbering_td.style.verticalAlign = 'middle';
        numbering_td.classList.add('table_row_numbering');
        numbering_td.textContent = rowIndex + 1;
        row.appendChild(numbering_td);

        // Checkbox
        const checkbox_td = createCheckboxCell(row, table_name);
        row.appendChild(checkbox_td);

        // Data-sarakkeet
        columns.forEach((column, colIndex) => {
            const td = createDataCell(item, column, columns, rowIndex, colIndex, table_name);
            row.appendChild(td);
        });

        tbody.appendChild(row);
    });

    return tbody;
}

export function createCheckboxCell(row, table_name) {
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

export function createDataCell(item, column, columns, rowIndex, colIndex, table_name) {
    const td = document.createElement('td');
    td.tabIndex = 0;
    td.dataset.rowIndex = rowIndex;
    td.dataset.colIndex  = colIndex;
    td.classList.add(makeColumnClass(table_name, column)); // ★

    let value = item[column];
    let displayValue = '';

    const foreignKeyColumn = column.replace('_name', '_id');

    if (columns.includes(foreignKeyColumn)) {
        displayValue = formatValue(value);
        td.textContent = displayValue;
    } else if (columns.includes(`${column}_name`)) {
        td.title = (item[`${column}_name`] == null) ? 'Tuntematon'
                                                    : item[`${column}_name`];
        displayValue = formatValue(value);
        td.textContent = displayValue;
    } else {
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


// // create_table_structure_and_data.js

// import { toggle_select_all, update_row_selection } from './selection.js';
// import { addEventListenersToCells } from './add_listeners_to_table_cells.js';
// import { initialize_column_resizing } from './column_resizing.js';

// // Uusi unify-funktiot – polku voi olla erilainen projektissasi!
// import { getUnifiedTableState, setUnifiedTableState, refreshTableUnified } from '../../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js'; 
// import { resetOffset } from '../../infinite_scroll/infinite_scroll.js';

// /**
//  * Pääfunktio, joka luo taulun rakenteen ja asettaa datan.
//  */
// export function create_table_element(columns, data, table_name, dataTypes) {
//     const table = document.createElement('table');
//     table.classList.add('table_from_db');
//     table.id = `${table_name}_table`;

//     table.dataset.columns = JSON.stringify(columns);
//     table.dataset.dataTypes = JSON.stringify(dataTypes);

//     const colgroup = createColgroup(columns);
//     table.appendChild(colgroup);

//     const thead = createTableHead(columns, table_name);
//     table.appendChild(thead);

//     const tbody = createTableBody(columns, data, table_name);
//     table.appendChild(tbody);

//     addEventListenersToCells(table, columns, data, dataTypes, table_name);
//     initialize_column_resizing(table);

//     return table;
// }

// function createColgroup(columns) {
//     const colgroup = document.createElement('colgroup');

//     // Numerointisolu
//     const numbering_col = document.createElement('col');
//     colgroup.appendChild(numbering_col);

//     // Valintaruutusolu
//     const select_col = document.createElement('col');
//     colgroup.appendChild(select_col);

//     // Varsinaiset taulun sarakkeet
//     columns.forEach(() => {
//         const col = document.createElement('col');
//         colgroup.appendChild(col);
//     });
//     return colgroup;
// }

// function createTableHead(columns, table_name) {
//     const thead = document.createElement('thead');
//     const header_row = document.createElement('tr');
//     const filter_row = document.createElement('tr');

//     // --- Numerointisolu (#) ---
//     const numbering_th = document.createElement('th');
//     numbering_th.style.width = '50px';
//     numbering_th.style.textAlign = 'center';
//     numbering_th.textContent = '';
//     header_row.appendChild(numbering_th);

//     // Tyhjä solupaikka filtteririville
//     const numbering_filter_th = document.createElement('th');
//     filter_row.appendChild(numbering_filter_th);

//     // --- Sarake valintaruudulle ( "valitse kaikki" -checkbox ) ---
//     const select_all_th = document.createElement('th');
//     select_all_th.style.width = '50px';
//     select_all_th.style.textAlign = 'center';
//     select_all_th.style.verticalAlign = 'middle';

//     const select_all_checkbox = document.createElement('input');
//     select_all_checkbox.type = 'checkbox';
//     select_all_checkbox.addEventListener('change', (e) => toggle_select_all(e, table_name));
//     select_all_th.appendChild(select_all_checkbox);
//     header_row.appendChild(select_all_th);

//     const empty_filter_cell = document.createElement('th');
//     filter_row.appendChild(empty_filter_cell);

//     // --- Data-sarakkeiden otsikot & filtterit ---
//     columns.forEach(column => {
//         const th = createHeaderCell(column, table_name);
//         header_row.appendChild(th);

//         const filter_cell = createFilterCell(column, table_name);
//         filter_row.appendChild(filter_cell);
//     });

//     thead.appendChild(header_row);
//     thead.appendChild(filter_row);
//     return thead;
// }

// /**
//  * createHeaderCell:
//  *  - Luo yhden <th>-solun, johon lisätään sarakkeen nimi
//  *  - Perään sortIndicator (ASC/DESC/none)
//  *  - Klikatessa sortIndicatoria päivitetään unified-tila ja kutsutaan refresh.
//  */
// function createHeaderCell(column, table_name) {
//     const th = document.createElement('th');
//     th.style.cursor = 'default';

//     const columnSpan = document.createElement('span');
//     columnSpan.textContent = column;

//     // Sort-indikaattori
//     const sortIndicator = document.createElement('span');
//     sortIndicator.classList.add('float_right');
//     sortIndicator.style.cursor = 'pointer';

//     // Tarkistetaan, onko unified-tilassa jo jokin sort tälle sarakkeelle
//     const st = getUnifiedTableState(table_name);
//     if (st.sort && st.sort.column === column) {
//         // Jos on sama sarake:
//         if (st.sort.direction === 'ASC') {
//             sortIndicator.textContent = '▲';
//         } else if (st.sort.direction === 'DESC') {
//             sortIndicator.textContent = '▼';
//         } else {
//             sortIndicator.textContent = '⇵';
//         }
//     } else {
//         // Ei sortattu / jokin muu sarake sortattuna
//         sortIndicator.textContent = '⇵';
//     }

//     sortIndicator.addEventListener('click', (event) => {
//         event.stopPropagation();
//         onSortIndicatorClick(table_name, column);
//     });

//     th.appendChild(columnSpan);
//     th.appendChild(sortIndicator);

//     return th;
// }

// /**
//  * Klikattaessa sort-indikaattoria:
//  *  - luetaan nykyinen state
//  *  - jos sama sarake => kierretään ASC->DESC->none
//  *  - jos eri sarake => asetetaan ASC
//  *  - tallennetaan & refresh.
//  */
// function onSortIndicatorClick(table_name, column) {
//     const state = getUnifiedTableState(table_name);
//     if (!state.sort) {
//         state.sort = { column: null, direction: null };
//     }

//     let currentCol = state.sort.column;
//     let currentDir = (state.sort.direction || '').toUpperCase();

//     if (currentCol === column) {
//         if (currentDir === 'ASC') {
//             // vaihdetaan DESC
//             state.sort.direction = 'DESC';
//         } else if (currentDir === 'DESC') {
//             // poistetaan sort
//             state.sort.column = null;
//             state.sort.direction = null;
//         } else {
//             // none -> ASC
//             state.sort.direction = 'ASC';
//         }
//     } else {
//         // uusi sarake => ASC
//         state.sort.column = column;
//         state.sort.direction = 'ASC';
//     }
//     console.log('table_refresh_collector.js: onSortIndicatorClick kutsuu funktiota setUnifiedTableState arvoilla: ', table_name, state);
//     setUnifiedTableState(table_name, state);
//     resetOffset();
//     refreshTableUnified(table_name, {});
// }

// /**
//  * createFilterCell:
//  *  - Luo <th>, jossa on <input> filtterin kirjoittamista varten
//  *  - Käytetään ID-muotoa: `${table_name}_${column}_filter`
//  *  - onkeyup => tallennetaan unifyed-tilaan ja refresh
//  */
// function createFilterCell(column, table_name) {
//     const filter_cell = document.createElement('th');
//     const filter_input = document.createElement('input');
//     filter_input.type = 'text';
//     filter_input.id = `${table_name}_${column}_filter`;
//     filter_input.placeholder = `Hae ${column}`;

//     // Alustetaan unifyed-tilasta (jos sieltä löytyy arvo)
//     const st = getUnifiedTableState(table_name);
//     const filterKey = filter_input.id; 
//     if (st.filters && st.filters[filterKey]) {
//         filter_input.value = st.filters[filterKey];
//     }

//     // onkeyup => tallennus & refresh
//     filter_input.addEventListener('keyup', () => {
//         updateFilterAndRefresh(table_name, filterKey, filter_input.value);
//     });

//     filter_cell.appendChild(filter_input);
//     return filter_cell;
// }

// /**
//  * Tallentaa filterin unifyed-tilaan, nollaa offsetin, refreshTableUnified.
//  */
// function updateFilterAndRefresh(table_name, filterKey, value) {
//     const st = getUnifiedTableState(table_name);
//     if (!st.filters) {
//         st.filters = {};
//     }
//     if (value.trim() === '') {
//         delete st.filters[filterKey];
//     } else {
//         st.filters[filterKey] = value;
//     }
//     console.log('table_refresh_collector.js: updateFilterAndRefresh kutsuu funktiota setUnifiedTableState arvoilla: ', table_name, st);
//     setUnifiedTableState(table_name, st);
//     resetOffset();
//     refreshTableUnified(table_name, {});
// }

// function createTableBody(columns, data, table_name) {
//     const tbody = document.createElement('tbody');
//     tbody.id = `${table_name}_table_body`;

//     data.forEach((item, rowIndex) => {
//         const row = document.createElement('tr');

//         // Numerointisolu
//         const numbering_td = document.createElement('td');
//         numbering_td.style.textAlign = 'center';
//         numbering_td.style.verticalAlign = 'middle';
//         numbering_td.classList.add('table_row_numbering');
//         numbering_td.textContent = rowIndex + 1;
//         row.appendChild(numbering_td);

//         // Checkbox
//         const checkbox_td = createCheckboxCell(row, table_name);
//         row.appendChild(checkbox_td);

//         // Data-sarakkeet
//         columns.forEach((column, colIndex) => {
//             const td = createDataCell(item, column, columns, rowIndex, colIndex);
//             row.appendChild(td);
//         });

//         tbody.appendChild(row);
//     });

//     return tbody;
// }

// export function createCheckboxCell(row, table_name) {
//     const checkbox_td = document.createElement('td');
//     checkbox_td.style.textAlign = 'center';
//     checkbox_td.style.verticalAlign = 'middle';

//     const row_checkbox = document.createElement('input');
//     row_checkbox.type = 'checkbox';
//     row_checkbox.classList.add('row_checkbox');
//     row_checkbox.addEventListener('change', () => update_row_selection(row));
//     checkbox_td.appendChild(row_checkbox);

//     return checkbox_td;
// }

// export function createDataCell(item, column, columns, rowIndex, colIndex) {
//     const td = document.createElement('td');
//     td.tabIndex = 0;
//     td.dataset.rowIndex = rowIndex;
//     td.dataset.colIndex = colIndex;

//     let value = item[column];
//     let displayValue = '';

//     const foreignKeyColumn = column.replace('_name', '_id');

//     if (columns.includes(foreignKeyColumn)) {
//         displayValue = formatValue(value);
//         td.textContent = displayValue;
//     } else if (columns.includes(`${column}_name`)) {
//         td.title = (item[`${column}_name`] == null)
//             ? 'Tuntematon'
//             : item[`${column}_name`];
//         displayValue = formatValue(value);
//         td.textContent = displayValue;
//     } else {
//         displayValue = formatValue(value);
//         td.textContent = displayValue;
//     }
//     return td;
// }

// function formatValue(value) {
//     if (value === null || value === undefined) {
//         return 'Tuntematon';
//     } else if (Array.isArray(value)) {
//         return value.join(', ');
//     } else if (typeof value === 'object') {
//         const sortedValue = sortObjectKeys(value);
//         return JSON.stringify(sortedValue, null, 2);
//     } else {
//         return value;
//     }
// }

// function sortObjectKeys(obj) {
//     return Object.keys(obj).sort().reduce((result, key) => {
//         result[key] = obj[key];
//         return result;
//     }, {});
// }
