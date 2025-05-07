// append_rows_to_table_view.js

import { selectCell } from './table_content_utils.js';
import { editCell } from '../../general_tables/gt_1_row_crud/gt_1_3_row_update/edit_cell.js';
import { handleKeyDown } from './add_listeners_to_table_cells.js';
import { createDataCell, createCheckboxCell } from './create_table_structure_and_data.js';

export function appendDataToTable(table, newData, columns, dataTypes, tableName) {
    const tbody = table.querySelector('tbody');
    const existingRows = tbody.rows.length;

    newData.forEach((item, index) => {
        const row = document.createElement('tr');

        // Muodostetaan numerointisolu
        const numbering_td = document.createElement('td');
        numbering_td.style.textAlign = 'center';
        numbering_td.style.verticalAlign = 'middle';
        numbering_td.classList.add('table_row_numbering');
        numbering_td.textContent = existingRows + index + 1; // 1-pohjainen laskuri
        row.appendChild(numbering_td);

        // Luodaan checkbox-solu
        const checkbox_td = createCheckboxCell(row, table.id.replace('_table', ''));
        row.appendChild(checkbox_td);

        // Luodaan data-solut
        columns.forEach((column, colIndex) => {
            const td = createDataCell(item, column, columns, existingRows + index, colIndex, tableName);
            row.appendChild(td);
        });

        tbody.appendChild(row);
    });

    // Lisätään eventit soluihin
    const cells = tbody.querySelectorAll('td:not(:first-child)');
    cells.forEach(cell => {
        cell.addEventListener('click', (e) => {
            selectCell(e.target);
        });
        cell.addEventListener('dblclick', (e) => {
            editCell(e.target, columns, newData, dataTypes, table.id.replace('_table', ''));
        });
        cell.addEventListener('keydown', (event) => {
            handleKeyDown(event, cell, columns, newData, dataTypes, table.id.replace('_table', ''));
        });
    });
}