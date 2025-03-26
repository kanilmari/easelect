// lisaa_tapahtumat_soluihin.js

import { selectCell } from './table_content_utils.js';
import { editCell } from '../../general_tables/gt_1_row_crud/gt_1_3_row_update/edit_cell.js';

export function addEventListenersToCells(table, columns, data, dataTypes, table_name) {
    const cells = table.querySelectorAll('tbody td:not(:first-child)');

    cells.forEach(cell => {
        cell.addEventListener('click', (e) => {
            selectCell(e.target);
        });

        cell.addEventListener('dblclick', (e) => {
            editCell(e.target, columns, data, dataTypes, table_name);
        });

        cell.addEventListener('keydown', (event) => {
            handleKeyDown(event, cell, columns, data, dataTypes, table_name);
        });
    });
}

export function handleKeyDown(event, cell, columns, data, dataTypes, table_name) {
    if (cell.classList.contains('editing')) {
        return;
    }

    let newCell;
    const tbody = cell.closest('tbody');
    const currentRow = cell.parentElement;
    const rowIndex = Array.from(tbody.rows).indexOf(currentRow);
    const colIndex = cell.cellIndex;

    switch (event.key) {
        case 'ArrowLeft':
            if (cell.previousElementSibling) {
                newCell = cell.previousElementSibling;
            }
            break;
        case 'ArrowRight':
            if (cell.nextElementSibling) {
                newCell = cell.nextElementSibling;
            }
            break;
        case 'ArrowUp':
            if (tbody.rows[rowIndex - 1]) {
                newCell = tbody.rows[rowIndex - 1].cells[colIndex];
            }
            break;
        case 'ArrowDown':
            if (tbody.rows[rowIndex + 1]) {
                newCell = tbody.rows[rowIndex + 1].cells[colIndex];
            }
            break;
        case 'F2':
            event.preventDefault();
            editCell(cell, columns, data, dataTypes, table_name);
            break;
    }
    if (newCell && newCell.tagName.toLowerCase() === 'td') {
        selectCell(newCell);
    }
}
