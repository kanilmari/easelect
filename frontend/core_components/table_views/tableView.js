import { makeColumnClass }      from "../../common_components/filterbar/column_visibility.js";
import { count_this_function }  from "../dev_tools/function_counter.js";
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
export function generateNormalTable(
    filteredData,
    headers,
    tableName,              // ★ uusi parametri
    onSort,
    onReorderColumns
) {
    count_this_function?.("generateNormalTable");

    const table = document.createElement("div");
    table.className = "table";

    /* ---------- OTSIKKORIVI ------------------------------------ */
    const headerRow = document.createElement("div");
    headerRow.className = "row header";

    headers.forEach((header, colIndex) => {
        const colClass = makeColumnClass(tableName, header.key);   // ★
        const cell     = document.createElement("div");
        cell.className = "cell header sortable";
        cell.classList.add(colClass);                              // ★
        cell.textContent  = header.label;
        cell.dataset.row  = 0;
        cell.dataset.col  = colIndex;
        cell.addEventListener("click", () => onSort(header.key));

        /* --- drag-kahva -------------------------------------- */
        const dragHandle       = document.createElement("span");
        dragHandle.className   = "drag-handle";
        dragHandle.textContent = "⠿";
        dragHandle.draggable   = true;
        dragHandle.addEventListener("dragstart", (e) =>
            e.dataTransfer.setData("text/plain", colIndex)
        );
        dragHandle.addEventListener("mousedown", (e) => e.stopPropagation());

        cell.appendChild(dragHandle);
        headerRow.appendChild(cell);
    });

    headerRow.addEventListener("dragover", (e) => e.preventDefault());
    headerRow.addEventListener("drop", (e) => {
        e.preventDefault();
        const fromCol    = parseInt(e.dataTransfer.getData("text/plain"), 10);
        const targetCell = e.target.closest(".cell.header");
        if (!targetCell) return;
        const toCol = parseInt(targetCell.dataset.col, 10);
        onReorderColumns?.(fromCol, toCol);
    });

    table.appendChild(headerRow);

    /* ---------- DATA-RIVIT ------------------------------------ */
    filteredData.forEach((item, rowIndex) => {
        const row = document.createElement("div");
        row.className = "row";

        headers.forEach((header, colIndex) => {
            const colClass   = makeColumnClass(tableName, header.key); // ★
            const cell       = document.createElement("div");
            cell.className   = "cell";
            cell.classList.add(colClass);                              // ★
            cell.dataset.row = rowIndex + 1;
            cell.dataset.col = colIndex;

            const cellContent = document.createElement("div");
            cellContent.className = "cell-content";
            cellContent.classList.add(colClass);                       // ★
            cellContent.textContent = item[header.key] ?? "";
            cellContent.style.whiteSpace = "pre-wrap";

            cell.appendChild(cellContent);
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
export function generateTransposedTable(
    filteredData,
    headers,
    tableName,                 // ★ uusi parametri
    onSort,
    onReorderTransposed
) {
    count_this_function?.("generateTransposedTable");

    const table = document.createElement("div");
    table.className = "table";

    table.addEventListener("dragover", (e) => e.preventDefault());
    table.addEventListener("drop", (e) => {
        e.preventDefault();
        const targetRow = e.target.closest(".row");
        if (!targetRow) return;
        const toRow   = parseInt(targetRow.dataset.row, 10);
        const fromRow = parseInt(e.dataTransfer.getData("text/plain"), 10);
        onReorderTransposed?.(fromRow, toRow);
    });

    headers.forEach((header, rowIndex) => {
        const row = document.createElement("div");
        row.className  = "row";
        row.dataset.row = rowIndex;

        const colClass = makeColumnClass(tableName, header.key);       // ★

        /* --- label-solu ---------------------------------------- */
        const labelCell = document.createElement("div");
        labelCell.className = "cell header sortable";
        labelCell.classList.add(colClass);                             // ★
        labelCell.dataset.row = rowIndex;
        labelCell.dataset.col = 0;

        const labelContent = document.createElement("div");
        labelContent.className = "cell-content";
        labelContent.classList.add(colClass);                          // ★
        labelContent.textContent = header.label;
        labelCell.appendChild(labelContent);
        labelCell.addEventListener("click", () => onSort(header.key));

        /* --- drag-kahva ---------------------------------------- */
        const dragHandle       = document.createElement("span");
        dragHandle.className   = "drag-handle";
        dragHandle.textContent = "⠿";
        dragHandle.draggable   = true;
        dragHandle.addEventListener("dragstart", (e) =>
            e.dataTransfer.setData("text/plain", rowIndex)
        );
        dragHandle.addEventListener("mousedown", (e) => e.stopPropagation());
        labelCell.appendChild(dragHandle);
        row.appendChild(labelCell);

        /* --- data-solut ---------------------------------------- */
        filteredData.forEach((item, colIndex) => {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.classList.add(colClass);                               // ★
            cell.dataset.row = rowIndex;
            cell.dataset.col = colIndex + 1;

            const c = document.createElement("div");
            c.className = "cell-content";
            c.classList.add(colClass);                                  // ★
            c.textContent = item[header.key] ?? "";
            c.style.whiteSpace = "pre-wrap";

            cell.appendChild(c);
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
export function generateTicketView(
    filteredData,
    headers,
    tableName,                // ★ uusi parametri
    onSort
) {
    count_this_function?.("generateTicketView");

    const container = document.createElement("div");
    container.className = "ticket-container";

    filteredData.forEach((item) => {
        const ticket = document.createElement("div");
        ticket.className = "ticket";

        headers.forEach((h) => {
            const colClass = makeColumnClass(tableName, h.key);       // ★

            const fieldRow = document.createElement("div");
            fieldRow.classList.add(colClass);                         // ★

            const labelSpan = document.createElement("span");
            labelSpan.className = "label";
            labelSpan.classList.add(colClass);                        // ★
            labelSpan.textContent = `${h.label}:`;
            labelSpan.addEventListener("click", () => onSort(h.key));

            const valueSpan = document.createElement("span");
            valueSpan.classList.add(colClass);                        // ★
            valueSpan.textContent = " " + (item[h.key] ?? "");

            fieldRow.appendChild(labelSpan);
            fieldRow.appendChild(valueSpan);
            ticket.appendChild(fieldRow);
        });

        container.appendChild(ticket);
    });

    return container;
}
