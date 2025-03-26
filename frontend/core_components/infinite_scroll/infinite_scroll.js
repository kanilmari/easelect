// infinite_scroll.js

import { fetchTableData } from '../endpoints/endpoint_data_fetcher.js';
import { appendDataToTable } from '../table_views/table_view/append_rows_to_table_view.js';
import { appendDataToCardView } from '../table_views/card_view/card_view.js';

// Tuodaan unifyed-tila
import {
    getUnifiedTableState,
    setUnifiedTableState
} from '../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js';

// "isLoading" ja IntersectionObserverin hallintamuuttujat paikallisesti
let isLoading = false;
let observer = null;
let sentinel = null;

/**
 * Nollaa offsetin unifyed-tilasta esim. kun taulu latautuu uusilla filttereillä.
 */
export function resetOffset(tableName) {
    const state = getUnifiedTableState(tableName);
    state.offset = 0;
    // console.log('infinite_scroll.js: resetOffset kutsuu funktiota setUnifiedTableState arvoilla tableName:', tableName, 'state:', state);
    setUnifiedTableState(tableName, state);
}

/**
 * Inkrementoi offsetia unifyed-tilassa ladatun datan määrällä.
 */
export function updateOffset(tableName, loadedCount) {
    const state = getUnifiedTableState(tableName);
    const oldOffset = state.offset || 0;
    state.offset = oldOffset + loadedCount;
    // console.log('infinite_scroll.js: updateOffset kutsuu funktiota setUnifiedTableState arvoilla tableName:', tableName, 'state:', state);
    setUnifiedTableState(tableName, state);
}

/**
 * Alustaa infinite scroll -toiminnon taululle `tableName`.
 * Käyttää IntersectionObserveria. Kun containerin lopussa oleva
 * sentinel-elementti tulee näkyviin, haetaan lisää dataa offsetin mukaan.
 *
 * @param {string} tableName   Minkä “taulun” scrollille varaus
 * @param {string} orientation 'vertical' tai 'horizontal'
 */
export function initializeInfiniteScroll(tableName, orientation = 'vertical') {
    const currentView = localStorage.getItem(`${tableName}_view`) || 'table';
    const containerId = `${tableName}_${currentView}_view_container`;
    const container = document.getElementById(containerId);

    if (!container) {
        console.error(`Ei löydy containeria: #${containerId}`);
        return;
    }

    // Jos observer on olemassa, tuhotaan se ensin (estää tuplahavainnoinnin)
    if (observer) {
        observer.disconnect();
        observer = null;
    }

    // Luodaan sentinel-elementti, ellei jo ole
    sentinel = document.createElement('div');
    sentinel.id = `${tableName}_infinite_scroll_sentinel`;
    sentinel.style.height = '1px';
    sentinel.style.width = '100%';
    container.appendChild(sentinel);

    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                fetchMoreData(tableName);
            }
        });
    }, {
        root: container,
        // Määritellään margin sen mukaan, halutaanko pysty- vai vaakavieritystä
        rootMargin: orientation === 'vertical'
            ? '0px 0px 100px 0px'
            : '0px 100px 0px 0px',
        threshold: 0.0
    });

    observer.observe(sentinel);
}

/**
 * Varsinainen “hae lisää dataa” -funktio. Käyttää unifyed-tilaa
 * filtterien, sortin ja offsetin selvittämiseen.
 */
async function fetchMoreData(tableName) {
    if (isLoading) return;
    isLoading = true;

    try {
        const currentView = localStorage.getItem(`${tableName}_view`) || 'table';

        // Haetaan unifyed-tila: offset, filters, sort
        const state = getUnifiedTableState(tableName);
        const offsetVal = state.offset || 0;
        const filters = state.filters || {};
        const sort_column = state.sort?.column || null;
        const sort_order = state.sort?.direction || null;

        // Haetaan data offsetista eteenpäin — callerName-lisäys
        const result = await fetchTableData({
            table_name: tableName,
            offset: offsetVal,
            sort_column,
            sort_order,
            filters,
            callerName: 'fetchMoreData (infinite scroll)'
        });

        // Jos ei dataa -> lopetetaan infinite scroll -> unobserve
        if (!result.data || result.data.length === 0) {
            if (observer && sentinel) {
                observer.unobserve(sentinel);
            }
            return;
        }

        // Päivitetään offset unifyed-tilassa
        const loadedCount = result.data.length;
        console.log('infinite_scroll.js: fetchMoreData kutsuu funktiota updateOffset arvoilla:', tableName, loadedCount);
        updateOffset(tableName, loadedCount);

        // Päivitetään DOM sen mukaan, mikä näkymä on voimassa
        if (currentView === 'table') {
            const table = document.querySelector(`#${tableName}_container table`);
            if (!table) {
                console.error(`Tauluelementti puuttuu: #${tableName}_container table`);
                return;
            }
            const columns = JSON.parse(table.dataset.columns);
            const dataTypes = JSON.parse(table.dataset.dataTypes);
            appendDataToTable(table, result.data, columns, dataTypes);

        } else if (currentView === 'card') {
            // Korttinäkymä
            const cardContainer = document.querySelector(`#${tableName}_card_view_container .card_container`);
            if (!cardContainer) {
                console.error(`Korttinäkymän kontainer puuttuu: #${tableName}_card_view_container .card_container`);
                return;
            }
            const columns = JSON.parse(localStorage.getItem(`${tableName}_columns`)) || [];
            appendDataToCardView(cardContainer, columns, result.data, tableName);

        } else if (['normal', 'transposed', 'ticket'].includes(currentView)) {
            // TableComponent-näkymä (SPA-hallintasovellus)
            const containerId = `${tableName}_${currentView}_view_container`;
            const container = document.getElementById(containerId);
            if (!container) {
                console.error(`Kontainer puuttuu: #${containerId}`);
                return;
            }
            const tableComponentRoot = container.querySelector('.table-component-root');
            if (tableComponentRoot && tableComponentRoot.tableComponentInstance) {
                tableComponentRoot.tableComponentInstance.appendData(result.data);
            } else {
                console.error(`TableComponent ei löydy (tableName: ${tableName}, view: ${currentView}).`);
            }
        }

    } catch (err) {
        console.error('error fetching more data:', err);
    } finally {
        isLoading = false;
    }
}