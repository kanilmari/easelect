/**
 * tableComponent.js
 *
 * Tässä moduulissa määritellään TableComponent-luokka, joka
 * mahdollistaa dynaamisen taulun luomisen ja erilaiset näkymätilat
 * (esim. normaali / käänteinen / tiketti).
 *
 * Käyttö:
 *  - Luo TableComponent-olio halutulla datalla ja otsikoilla
 *  - Upota olio DOM:iin esim. container.appendChild(table.getElement())
 *  - Aseta filttereitä (setFilter), vaihda näkymiä (setView), jne.
 */

// TableComponent.js

import {
    generateNormalTable,
    generateTransposedTable,
    generateTicketView
} from './tableView.js';
import { count_this_function } from '../dev_tools/function_counter.js';

export class TableComponent {
    /**
     * Luo uuden TableComponent-olion.
     *
     * @param {Object} params - Olion konfiguraatio.
     * @param {Array<Object>} params.data - Taulukon data taulukkona objekteja.
     * @param {Array<Object>} params.headers - Sarakkeiden määrittely taulukkona.
     * @param {string} [params.initialView='normal'] - Alustava näkymä (normal, transposed tai ticket).
     */
    constructor({
        data,
        headers,
        table_name,                  // ★ uusi parametri
        initialView = 'normal'
    }) {
        this.data        = data    || [];
        this.headers     = headers || [];
        this.table_name  = table_name || '';   // ★ tallennetaan
        this.currentView = initialView;
    
        /* --- lajittelu- & filtteri-tilat ----------------------------- */
        this.sortDirections = {};
        this.headers.forEach(h => { this.sortDirections[h.key] = 'asc'; });
    
        this.filterCriteria = {};
        this.headers.forEach(h => { this.filterCriteria[h.key] = ''; });
    
        /* --- valinta- ja DOM-rakenteet (alkuperäinen koodi) ---------- */
        this.isSelecting = false;
        this.startRow    = null;
        this.startCol    = null;
    
        this.rootElement = document.createElement('div');
        this.rootElement.classList.add('table-component-root');
        this.rootElement.tableComponentInstance = this;
    
        /* --- valikon rakentaminen (kopio-napit jne.) ---------------- */
        this.selectionMenu           = document.createElement('div');
        this.selectionMenu.className = 'selection-menu';
        this.selectionMenu.style.position = 'absolute';
        this.selectionMenu.style.display  = 'none';
    
        const copyHeadersBtn = document.createElement('button');
        copyHeadersBtn.dataset.action = 'copy-headers';
        copyHeadersBtn.textContent    = 'Kopioi otsikot + solut';
    
        const copyNoHeadersBtn = document.createElement('button');
        copyNoHeadersBtn.dataset.action = 'copy-no-headers';
        copyNoHeadersBtn.textContent    = 'Kopioi vain solut';
    
        this.selectionMenu.appendChild(copyHeadersBtn);
        this.selectionMenu.appendChild(copyNoHeadersBtn);
        this.rootElement.appendChild(this.selectionMenu);
    
        /* --- valikkonappien kuuntelijat ------------------------------ */
        this.selectionMenu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action === 'copy-headers')     this.copySelected(true);
            else if (action === 'copy-no-headers') this.copySelected(false);
            this.hideSelectionMenu();
        });
    
        /* --- ensimmäinen renderointi + event-kuuntelut --------------- */
        this.render();
    
        this.rootElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.rootElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.rootElement.addEventListener('mouseup',   (e) => this.onMouseUp(e));
        this.rootElement.addEventListener('contextmenu',(e) => this.onContextMenu(e));
    }

    /**
     * Palauttaa pääelementin, jonka voi liittää DOM:iin.
     * @returns {HTMLElement} TableComponentin rootElement.
     */
    getElement() {
        return this.rootElement;
    }

    /**
     * Asettaa uuden datan ja piirtää komponentin uudelleen.
     * @param {Array<Object>} newData - Uusi data taulukkona objekteja
     */
    setData(newData) {
        this.data = newData;
        this.render();
    }

    /**
     * Liittää uutta dataa olemassa olevaan dataan ja päivittää näkymän.
     * @param {Array<Object>} newData - Uusi data liitettäväksi
     */
    appendData(newData) {
        if (!Array.isArray(newData)) {
            console.error('appendData: newData ei ole taulukko');
            return;
        }
        this.data = this.data.concat(newData);
        this.updateViewWithNewData(newData);
    }

    /**
     * Päivittää näkymän uudella datalla riippuen siitä, mikä näkymä on valittuna.
     * @param {Array<Object>} newData - Uusi data liitettäväksi
     * @private
     */
    updateViewWithNewData(newData) {
        if (this.currentView === 'normal') {
            this.appendToNormalView(newData);
        } else if (this.currentView === 'transposed') {
            this.appendToTransposedView(newData);
        } else if (this.currentView === 'ticket') {
            this.appendToTicketView(newData);
        }
    }

    /**
     * Liittää uutta dataa normal-näkymään.
     * @param {Array<Object>} newData - Uusi data liitettäväksi
     * @private
     */

    appendToNormalView(newData) {
        count_this_function?.('TableComponent_appendToNormalView');
    
        const tableDiv = this.rootElement.querySelector('.table');
        if (!tableDiv) {
            console.error('Div-based table (".table") not found');
            return;
        }
    
        const existingRows   = tableDiv.querySelectorAll('.row:not(.header)');
        const currentRowCnt  = existingRows.length;
    
        newData.forEach((rowData, idx) => {
            const row = document.createElement('div');
            row.classList.add('row');
    
            this.headers.forEach((header, colIndex) => {
                const colClass   = makeColumnClass(this.table_name, header.key);   // ★
                const cell       = document.createElement('div');
                cell.classList.add('cell', colClass);                             // ★
                cell.dataset.row = (currentRowCnt + idx + 1).toString();
                cell.dataset.col = colIndex.toString();
    
                const cellContent = document.createElement('div');
                cellContent.className = 'cell-content';
                cellContent.classList.add(colClass);                               // ★
                cellContent.textContent = rowData[header.key] ?? '';
                cellContent.style.whiteSpace = 'pre-wrap';
    
                cell.appendChild(cellContent);
                row.appendChild(cell);
            });
    
            tableDiv.appendChild(row);
        });
    }
    
    /**
     * Liittää uutta dataa transposed-näkymään.
     * @param {Array<Object>} newData - Uusi data liitettäväksi
     * @private
     */
    appendToTransposedView() {
        // Transposed-näkymässä uudet rivit lisätään sarakkeina, joten piirretään koko taulu uudelleen yksinkertaisuuden vuoksi
        this.render();
    }

    /**
     * Liittää uutta dataa ticket-näkymään.
     * @param {Array<Object>} newData - Uusi data liitettäväksi
     * @private
     */
    appendToTicketView(newData) {
        const ticketContainer = this.rootElement.querySelector('.ticket-container');
        if (!ticketContainer) {
            console.error('Ticket container not found');
            return;
        }
        newData.forEach(rowData => {
            const ticket = document.createElement('div');
            ticket.classList.add('ticket');
            this.headers.forEach(header => {
                const p = document.createElement('p');
                p.textContent = `${header.label}: ${rowData[header.key] || ''}`;
                ticket.appendChild(p);
            });
            ticketContainer.appendChild(ticket);
        });
    }

    /**
     * Asettaa filtterin tietylle sarakkeelle ja piirtää komponentin uudelleen.
     * @param {string} key - Sarakkeen avain (header.key)
     * @param {string} value - Filtteröintimerkintä
     */
    setFilter(key, value) {
        this.filterCriteria[key] = value.trim();
        this.render();
    }

    /**
     * Asettaa näkymätilan (normal, transposed tai ticket) ja piirtää uudelleen.
     * @param {string} viewMode - 'normal', 'transposed' tai 'ticket'
     */
    setView(viewMode) {
        this.currentView = viewMode;
        this.render();
    }

    /**
     * Piirtää komponentin uudelleen nykyisten data-, filtteri- ja näkymäasetusten perusteella.
     */
    render() {
        count_this_function?.('TableComponent_render');
    
        const menuRef = this.selectionMenu;
        this.rootElement.replaceChildren();
    
        const filteredData = this.getFilteredData();
    
        let tableElement;
        if (this.currentView === 'normal') {
            tableElement = generateNormalTable(
                filteredData,
                this.headers,
                this.table_name,                           // ★ välitetään ensin
                (key)           => this.sortData(key),
                (fromCol, toCol) => this.reorderColumns(fromCol, toCol)
            );
        } else if (this.currentView === 'transposed') {
            tableElement = generateTransposedTable(
                filteredData,
                this.headers,
                this.table_name,                           // ★
                (key)           => this.sortData(key),
                (fromRow, toRow) => this.reorderColumnsTransposed(fromRow, toRow)
            );
        } else { /* 'ticket' */
            tableElement = generateTicketView(
                filteredData,
                this.headers,
                this.table_name,                           // ★
                (key) => this.sortData(key)
            );
        }
    
        this.rootElement.appendChild(tableElement);
        this.rootElement.appendChild(menuRef);
    
        this.clearSelection();
        this.hideSelectionMenu();
    }
    /**
     * Palauttaa tällä hetkellä asetetun filtterin perusteella suodatetun datan.
     * @private
     * @returns {Array<Object>} Filtteröity data
     */
    getFilteredData() {
        return this.data.filter(item => {
            for (const key in this.filterCriteria) {
                const filterVal = this.filterCriteria[key];
                if (!filterVal) continue;
                const itemVal = String(item[key] || '').toLowerCase();
                if (!itemVal.includes(filterVal.toLowerCase())) {
                    return false;
                }
            }
            return true;
        });
    }

    /**
     * Lajittelee dataa annetun avaimen (key) perusteella (asc/desc vaihtuu).
     * @param {string} key - Sarakkeen avain, jonka mukaan lajitellaan
     */
    sortData(key) {
        this.sortDirections[key] = (this.sortDirections[key] === 'asc') ? 'desc' : 'asc';
        const direction = this.sortDirections[key];

        this.data.sort((a, b) => {
            const valA = a[key];
            const valB = b[key];
            if (typeof valA === 'number' && typeof valB === 'number') {
                return (direction === 'asc') ? valA - valB : valB - valA;
            } else {
                // Merkkijonovertailu
                return (direction === 'asc')
                    ? String(valA).localeCompare(String(valB))
                    : String(valB).localeCompare(String(valA));
            }
        });
        this.render();
    }

    /**
     * SARAKKEIDEN uudelleensijoittaminen normal-näkymässä.
     * @param {number} fromIndex - Sarakkeen alkuperäinen indeksi (headers-taulukossa)
     * @param {number} toIndex   - Sarakkeen uusi indeksi (headers-taulukossa)
     */
    reorderColumns(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        const movedHeader = this.headers[fromIndex];
        this.headers.splice(fromIndex, 1);
        this.headers.splice(toIndex, 0, movedHeader);

        // Tallennetaan uusi järjestys localStorageen
        localStorage.setItem('columnsOrder', JSON.stringify(this.headers));

        this.render();
    }

    /**
     * RIVIEN uudelleensijoittaminen transposed-näkymässä.
     * (transposed-näkymä = header = rivi)
     * @param {number} fromIndex - Sarakkeen (rivin) alkuperäinen indeksi
     * @param {number} toIndex   - Sarakkeen (rivin) uusi indeksi
     */
    reorderColumnsTransposed(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        const movedHeader = this.headers[fromIndex];
        this.headers.splice(fromIndex, 1);
        this.headers.splice(toIndex, 0, movedHeader);

        localStorage.setItem('columnsOrder', JSON.stringify(this.headers));
        this.render();
    }

    /**
     * Mousedown-event solujen valintaa varten.
     * @param {MouseEvent} e
     * @private
     */
    onMouseDown(e) {
        if (this.currentView === 'ticket') return; // Ei valintaa tiketti-näkymässä
        if (e.button !== 0) return; // Vain vasen hiiren nappi

        // Varmistetaan, että klikkaus kohdistuu soluun
        const cell = e.target.closest('.cell');
        if (!cell) {
            // Jos klikataan muualle kuin soluun, nollataan valinta
            if (!this.selectionMenu.contains(e.target)) {
                this.clearSelection();
                this.hideSelectionMenu();
            }
            return;
        }

        // Estetään valinta, jos klikataan raahauskahvaa
        if (e.target.classList.contains('drag-handle')) {
            return;
        }

        this.isSelecting = true;
        this.clearSelection();
        this.hideSelectionMenu();

        this.startRow = parseInt(cell.dataset.row, 10);
        this.startCol = parseInt(cell.dataset.col, 10);

        // Korostetaan alkusolu
        this.highlightRegion(this.startRow, this.startCol, this.startRow, this.startCol);
    }

    /**
     * Mousemove-event solujen valintaa varten.
     * @param {MouseEvent} e
     * @private
     */
    onMouseMove(e) {
        if (!this.isSelecting) return;
        if (!e.target.classList.contains('cell')) return;

        const currentRow = parseInt(e.target.dataset.row, 10);
        const currentCol = parseInt(e.target.dataset.col, 10);

        this.clearSelection();
        this.highlightRegion(this.startRow, this.startCol, currentRow, currentCol);
    }

    /**
     * Mouseup-event solujen valintaa varten.
     * @param {MouseEvent}
     * @private
     */
    onMouseUp() {
        if (!this.isSelecting) return;
        this.isSelecting = false;
    }

    /**
     * Oikeaklikkaus (contextmenu) -> näytetään kopiointivalikko valituille soluille.
     * @param {MouseEvent} e
     * @private
     */
    onContextMenu(e) {
        if (e.target.classList.contains('cell') && e.target.classList.contains('selected')) {
            e.preventDefault();
            this.showSelectionMenu(e.pageX, e.pageY);
        }
    }

    /**
     * Korostaa (lisää .selected-luokan) solut, jotka ovat annettujen rivi- ja sarakeindeksien välillä.
     * @param {number} r1 - Alkuperäinen rivinumero
     * @param {number} c1 - Alkuperäinen sarakenumero
     * @param {number} r2 - Nykyinen rivinumero
     * @param {number} c2 - Nykyinen sarakenumero
     * @private
     */
    highlightRegion(r1, c1, r2, c2) {
        if (r1 > r2) [r1, r2] = [r2, r1];
        if (c1 > c2) [c1, c2] = [c2, c1];

        for (let row = r1; row <= r2; row++) {
            for (let col = c1; col <= c2; col++) {
                const selector = `.cell[data-row='${row}'][data-col='${col}']`;
                const cell = this.rootElement.querySelector(selector);
                if (cell) {
                    cell.classList.add('selected');
                }
            }
        }
    }

    /**
     * Poistaa valinnan (poistaa .selected-luokan kaikilta soluilta).
     * @private
     */
    clearSelection() {
        this.rootElement.querySelectorAll('.cell.selected').forEach(cell => {
            cell.classList.remove('selected');
        });
    }

    /**
     * Asettaa valikkonäyn annettuihin koordinaatteihin.
     * @param {number} x
     * @param {number} y
     * @private
     */
    showSelectionMenu(x, y) {
        this.selectionMenu.style.left = x + 'px';
        this.selectionMenu.style.top = y + 'px';
        this.selectionMenu.style.display = 'block';
    }

    /**
     * Piilottaa valikkonäyn.
     * @private
     */
    hideSelectionMenu() {
        this.selectionMenu.style.display = 'none';
    }

    /**
     * Kopioi valitut solut (normal- tai transposed-näkymässä) leikepöydälle.
     * @param {boolean} withHeaders - Jos true, kopioi myös otsikkorivin/otsikkosolut
     */
    copySelected(withHeaders) {
        const range = this.getSelectedRange();
        if (!range) return;

        const { minRow, maxRow, minCol, maxCol } = range;
        let copyText = '';

        if (this.currentView === 'normal') {
            // Normaali
            if (withHeaders) {
                // Otsikkorivi
                const headerRow = [];
                for (let col = minCol; col <= maxCol; col++) {
                    const headerCell = this.rootElement.querySelector(
                        `.cell[data-row='0'][data-col='${col}']`
                    );
                    headerRow.push(headerCell ? headerCell.textContent : '');
                }
                copyText += headerRow.join(',') + '\n';
            }
            // Data
            for (let row = minRow; row <= maxRow; row++) {
                const rowData = [];
                for (let col = minCol; col <= maxCol; col++) {
                    const cell = this.rootElement.querySelector(
                        `.cell[data-row='${row}'][data-col='${col}']`
                    );
                    rowData.push(cell ? cell.textContent : '');
                }
                copyText += rowData.join(',') + '\n';
            }
        } else if (this.currentView === 'transposed') {
            // Transposed
            if (withHeaders) {
                // Jokainen valittu rivi = header + data
                for (let row = minRow; row <= maxRow; row++) {
                    const rowData = [];
                    const headerCell = this.rootElement.querySelector(
                        `.cell[data-row='${row}'][data-col='0']`
                    );
                    rowData.push(headerCell ? headerCell.textContent : '');
                    for (let col = minCol; col <= maxCol; col++) {
                        const cell = this.rootElement.querySelector(
                            `.cell[data-row='${row}'][data-col='${col}']`
                        );
                        rowData.push(cell ? cell.textContent : '');
                    }
                    copyText += rowData.join(',') + '\n';
                }
            } else {
                // Ilman otsikoita
                for (let row = minRow; row <= maxRow; row++) {
                    const rowData = [];
                    for (let col = minCol; col <= maxCol; col++) {
                        const cell = this.rootElement.querySelector(
                            `.cell[data-row='${row}'][data-col='${col}']`
                        );
                        rowData.push(cell ? cell.textContent : '');
                    }
                    copyText += rowData.join(',') + '\n';
                }
            }
        }

        copyText = copyText.trim();
        navigator.clipboard.writeText(copyText)
            .then(() => {
                alert('Kopioitu leikepöydälle!');
            })
            .catch(err => {
                console.error('Kopiointi epäonnistui:', err);
                alert('Kopiointi epäonnistui.');
            });

        this.hideSelectionMenu();
    }

    /**
     * Selvittää valittujen solujen pienimmän ja suurimman (rivi, sarake) -arvon.
     * @private
     * @returns {{ minRow: number, maxRow: number, minCol: number, maxCol: number } | null} 
     *   null, jos ei valittuja soluja.
     */
    getSelectedRange() {
        const selectedCells = this.rootElement.querySelectorAll('.cell.selected');
        if (!selectedCells.length) return null;

        let minRow = Infinity, maxRow = -Infinity;
        let minCol = Infinity, maxCol = -Infinity;

        selectedCells.forEach(cell => {
            const row = parseInt(cell.dataset.row, 10);
            const col = parseInt(cell.dataset.col, 10);
            if (row < minRow) minRow = row;
            if (row > maxRow) maxRow = row;
            if (col < minCol) minCol = col;
            if (col > maxCol) maxCol = col;
        });

        return { minRow, maxRow, minCol, maxCol };
    }

    /**
     * Poistaa komponentin DOM:ista.
     * @public
     */
    destroy() {
        if (this.rootElement && this.rootElement.parentNode) {
            this.rootElement.parentNode.removeChild(this.rootElement);
        }
    }
}
