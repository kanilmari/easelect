/**
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

    // Käytetään fragmenttia otsikkorivin ja datarivien kerryttämiseen
    const headerFragment = document.createDocumentFragment();

    // Otsikkorivi
    const headerRow = document.createElement('div');
    headerRow.className = 'row header';

    headers.forEach((header, colIndex) => {
        const cell = document.createElement('div');
        cell.className = 'cell header sortable';
        cell.textContent = header.label;
        cell.dataset.row = 0;      // Otsikkorivin tunnistus
        cell.dataset.col = colIndex;

        // Klikkaamalla otsikkoa -> sort-funktio
        cell.addEventListener('click', () => onSort(header.key));

        // DRAG HANDLE
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.textContent = '⠿'; // Unicode "grip" -ikoni
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

    // headerRowin dragover / drop
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

    headerFragment.appendChild(headerRow);

    // Lisätään otsikkorivi taulukkoon
    table.appendChild(headerFragment);

    // Käytetään uutta fragmenttia data-riveille
    const dataFragment = document.createDocumentFragment();

    // Data-rivit
    filteredData.forEach((item, rowIndex) => {
        const row = document.createElement('div');
        row.className = 'row';

        headers.forEach((header, colIndex) => {
            const cell = document.createElement('div');
            cell.className = 'cell';

            const cellContent = document.createElement('div');
            cellContent.className = 'cell-content';
            cellContent.textContent = item[header.key] ?? '';
            // Säilytetään rivinvaihdot
            cellContent.style.whiteSpace = 'pre-wrap';

            cell.appendChild(cellContent);
            cell.dataset.row = rowIndex + 1;
            cell.dataset.col = colIndex;
            row.appendChild(cell);
        });

        dataFragment.appendChild(row);
    });

    table.appendChild(dataFragment);

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

    // Taulukon drop-käsittely
    table.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    table.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetRow = e.target.closest('.row');
        if (!targetRow) return;
        const toRow = parseInt(targetRow.dataset.row, 10);
        const fromRow = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (typeof onReorderTransposed === 'function') {
            onReorderTransposed(fromRow, toRow);
        }
    });

    // Käytetään fragmenttia rivien keräämiseen
    const fragment = document.createDocumentFragment();

    headers.forEach((header, rowIndex) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.dataset.row = rowIndex;

        // Otsikkosolu
        const labelCell = document.createElement('div');
        labelCell.className = 'cell header sortable';
        labelCell.dataset.row = rowIndex;
        labelCell.dataset.col = 0;

        const labelCellContent = document.createElement('div');
        labelCellContent.className = 'cell-content';
        labelCellContent.textContent = header.label;
        labelCell.appendChild(labelCellContent);

        // Klikkaus sorttausfunktiolle
        labelCell.addEventListener('click', () => onSort(header.key));

        // Drag handle
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.textContent = '⠿';
        dragHandle.draggable = true;
        dragHandle.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', rowIndex);
        });
        dragHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        labelCell.appendChild(dragHandle);
        row.appendChild(labelCell);

        // Data-sarakkeet
        filteredData.forEach((item, colIndex) => {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = rowIndex;
            cell.dataset.col = colIndex + 1; // 0 on otsikolle

            const cellContent = document.createElement('div');
            cellContent.className = 'cell-content';
            cellContent.textContent = item[header.key] ?? '';
            cellContent.style.whiteSpace = 'pre-wrap';

            cell.appendChild(cellContent);
            row.appendChild(cell);
        });

        fragment.appendChild(row);
    });

    // Liitetään fragmentti taulukkoon
    table.appendChild(fragment);

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

    // Fragmentti lippujen kokoamiseen
    const fragment = document.createDocumentFragment();

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
            valueSpan.textContent = " " + (item[h.key] ?? '');

            fieldRow.appendChild(labelSpan);
            fieldRow.appendChild(valueSpan);
            ticket.appendChild(fieldRow);
        });

        fragment.appendChild(ticket);
    });

    container.appendChild(fragment);
    return container;
}