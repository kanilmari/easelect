/**
 * tableView.js
 * 
 * Sisältää funktiot erilaisten näkymien (normal, transposed, ticket) luomiseen.
 * Vastaanottaa parametreina dataa, headers-listan sekä callback-funktioita,
 * esim. sort-funktio ja reorder-funktiot (drag & drop).
 */

/**
 * Normal-näkymä:
 *  - Yksi otsikkorivi
 *  - Jokainen rivi = yksi data-alkio
 *  - Sarakkeiden otsikoissa on drag handle, jolla voi järjestää sarakkeita
 */
export function generateNormalTable(filteredData, headers, onSort, onReorderColumns) {
    const table = document.createElement('div');
    table.className = 'table';

    // Otsikkorivi
    const headerRow = document.createElement('div');
    headerRow.className = 'row header';

    headers.forEach((header, colIndex) => {
        const cell = document.createElement('div');
        cell.className = 'cell header sortable';
        cell.textContent = header.label;

        // Lisää data-row="0", jotta valintatoiminto ymmärtää otsikkorivin
        cell.dataset.row = 0;
        cell.dataset.col = colIndex;

        // Klikkaamalla otsikkoa -> sort-funktio
        cell.addEventListener('click', () => onSort(header.key));

        // == DRAG HANDLE (normal-näkymään) ==
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.textContent = '⠿'; // Unicode "grip" -ikoni tms.
        dragHandle.draggable = true;

        dragHandle.addEventListener('dragstart', (e) => {
            // Tallennetaan, mistä sarakkeesta raahaus alkoi
            e.dataTransfer.setData('text/plain', colIndex);
        });

        // Estetään solumaalauksen käynnistyminen, kun klikkaa kahvaa
        dragHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        cell.appendChild(dragHandle);
        headerRow.appendChild(cell);
    });

    // headerRowiin dragover / drop
    headerRow.addEventListener('dragover', (e) => {
        e.preventDefault(); // sallitaan drop
    });
    headerRow.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromCol = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const targetCell = e.target.closest('.cell.header');
        if (!targetCell) return;
        const toCol = parseInt(targetCell.dataset.col, 10);

        if (typeof onReorderColumns === 'function') {
            onReorderColumns(fromCol, toCol);
        }
    });

    table.appendChild(headerRow);

    // Data-rivit
    filteredData.forEach((item, rowIndex) => {
        const row = document.createElement('div');
        row.className = 'row';

        headers.forEach((header, colIndex) => {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.textContent = item[header.key];

            // Huomaa: data-riveillä rowIndex on +1, koska rivillä 0 on otsikko
            cell.dataset.row = rowIndex + 1;
            cell.dataset.col = colIndex;

            row.appendChild(cell);
        });

        table.appendChild(row);
    });

    return table;
}

/**
 * Transposed-näkymä:
 *  - Jokainen header on oma "rivi"
 *  - Ensimmäinen solu = header.label
 *  - Seuraavat solut = data-arvot pystyssä
 *  - Nyt lisätään drag handle, jolla voi siirtää riviä ylös/alas
 */
export function generateTransposedTable(filteredData, headers, onSort, onReorderTransposed) {
    const table = document.createElement('div');
    table.className = 'table';

    // Lisätään dragover-/drop-listenerit "table"-elementtiin (tai halutessa rivitasolle)
    table.addEventListener('dragover', (e) => {
        e.preventDefault(); // sallitaan drop
    });
    table.addEventListener('drop', (e) => {
        e.preventDefault();
        // Etsitään lähin .row
        const targetRow = e.target.closest('.row');
        if (!targetRow) return;
        const toRow = parseInt(targetRow.dataset.row, 10);

        const fromRow = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (typeof onReorderTransposed === 'function') {
            onReorderTransposed(fromRow, toRow);
        }
    });

    headers.forEach((header, rowIndex) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.dataset.row = rowIndex;

        // Otsikkosolu
        const labelCell = document.createElement('div');
        labelCell.className = 'cell header sortable';
        labelCell.textContent = header.label;
        labelCell.dataset.row = rowIndex;
        labelCell.dataset.col = 0;

        // Sorttaus klikkaamalla
        labelCell.addEventListener('click', () => onSort(header.key));

        // == DRAG HANDLE (transposed-näkymään) ==
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.textContent = '⠿';
        dragHandle.draggable = true;

        dragHandle.addEventListener('dragstart', (e) => {
            // Tallennetaan, mistä rivistä raahaus alkoi
            e.dataTransfer.setData('text/plain', rowIndex);
        });
        dragHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation(); // ettei käynnistä solun "valintaa"
        });

        labelCell.appendChild(dragHandle);
        row.appendChild(labelCell);

        // Data-sarakkeet
        filteredData.forEach((item, colIndex) => {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.textContent = item[header.key];

            cell.dataset.row = rowIndex;
            cell.dataset.col = colIndex + 1; // +1, koska 0 on otsikkosolu
            row.appendChild(cell);
        });

        table.appendChild(row);
    });

    return table;
}

/**
 * Ticket-näkymä:
 *  - Jokaisesta data-alkiosta muodostetaan "lippu"
 *  - Ei sarake- eikä rividraggausta, vain listaus pystyyn
 */
export function generateTicketView(filteredData, headers, onSort) {
    const container = document.createElement('div');
    container.className = 'ticket-container';

    filteredData.forEach(item => {
        const ticket = document.createElement('div');
        ticket.className = 'ticket';

        headers.forEach(h => {
            const fieldRow = document.createElement('div');

            const labelSpan = document.createElement('span');
            labelSpan.className = 'label';
            labelSpan.textContent = h.label + ":";
            // sorttausotsikkona
            labelSpan.addEventListener('click', () => onSort(h.key));

            const valueSpan = document.createElement('span');
            valueSpan.textContent = " " + item[h.key];

            fieldRow.appendChild(labelSpan);
            fieldRow.appendChild(valueSpan);
            ticket.appendChild(fieldRow);
        });

        container.appendChild(ticket);
    });

    return container;
}
