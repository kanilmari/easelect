// // infinite_scroll.js

import { getFiltersFromFilterBar } from '../../main_app/filterbar/filter_table_data.js';
import { appendDataToTable } from '../table_views/table_view/append_rows_to_table_view.js';
import { appendDataToCardView } from '../table_views/card_view/card_view.js';
import { fetchTableData } from '../../main_app/endpoints/endpoint_data_fetcher.js'; // polku tarpeen mukaan

let isLoading = false;
let offset = 0;
let handleScroll; // Määritellään handleScroll moduulin laajuudessa

export function resetOffset() {
    offset = 0;
}

export function updateOffset(newOffset) {
    offset += newOffset;
}

/**
 * Alustaa infinite scrollin annetulle table_namelle ja näkymälle.
 * orientation = 'vertical' tai 'horizontal' (esim. transposed-näkymään).
 */
export function initializeInfiniteScroll(table_name, orientation = 'vertical') {
    // Haetaan localStoragesta nykyinen näkymä
    const current_view = localStorage.getItem(`${table_name}_view`) || 'table';

    // Käytetään samaa ID-kaavaa kuin generate_table() luo:
    // esim. "mytable_normal_view_container", "mytable_transposed_view_container", "mytable_ticket_view_container"
    const container_id = `${table_name}_${current_view}_view_container`;
    const container = document.getElementById(container_id);
    if (!container) {
        console.error(`Container element not found: #${container_id}`);
        return;
    }

    // Poistetaan mahdollinen vanha scroll-listener
    if (handleScroll) {
        container.removeEventListener('scroll', handleScroll);
    }

    // Luodaan funktio, joka kutsuu fetchMoreData, kun lähestytään vierityksen loppua
    handleScroll = function() {
        if (isLoading) return;

        if (orientation === 'vertical') {
            // Pystysuuntainen rullaus
            if (container.scrollTop + container.clientHeight >= container.scrollHeight - 100) {
                fetchMoreData(table_name);
            }
        } else if (orientation === 'horizontal') {
            // Vaakasuuntainen rullaus (transposed-näkymä)
            if (container.scrollLeft + container.clientWidth >= container.scrollWidth - 100) {
                fetchMoreData(table_name);
            }
        }
    };

    // Kiinnitetään uusi listener
    container.addEventListener('scroll', handleScroll);
}

/**
 * Hakee lisää dataa, kun rullataan loppuun.
 */
async function fetchMoreData(table_name) {
    console.log('fetching more data');
    if (isLoading) return;
    isLoading = true;

    try {
        const current_view = localStorage.getItem(`${table_name}_view`) || 'table';
        const filters = getFiltersFromFilterBar(table_name);
        const sort_column = localStorage.getItem(`${table_name}_sort_column`);
        let sort_order = null;
        if (sort_column) {
            sort_order = localStorage.getItem(`${table_name}_sort_order_${sort_column}`);
        }

        // Haetaan uudet rivit
        const result = await fetchTableData({
            table_name: table_name,
            offset: offset,
            sort_column: sort_column,
            sort_order: sort_order,
            filters: filters
        });

        // Jos ei tullut dataa, poistetaan scroll-listener, jotta ei kutsuta loputtomiin
        if (!result.data || result.data.length === 0) {
            const containerId = `${table_name}_${current_view}_view_container`;
            const container = document.getElementById(containerId);
            if (container) {
                container.removeEventListener('scroll', handleScroll);
            }
            isLoading = false;
            return;
        }

        // Päivitetään offset
        updateOffset(result.data.length);

        // Päivitetään data oikeaan näkymään
        if (current_view === 'table') {
            // Perinteinen HTML-taulu
            const table = document.querySelector(`#${table_name}_container table`);
            if (!table) {
                console.error(`Table element not found for table: ${table_name}`);
                return;
            }
            const columns = JSON.parse(table.dataset.columns);
            const dataTypes = JSON.parse(table.dataset.dataTypes);
            appendDataToTable(table, result.data, columns, dataTypes);

        } else if (current_view === 'card') {
            // Korttinäkymä
            const cardContainer = document.querySelector(`#${table_name}_card_view_container .card_container`);
            if (!cardContainer) {
                console.error(`Card container not found for table: ${table_name}`);
                return;
            }
            const columns = JSON.parse(localStorage.getItem(`${table_name}_columns`));
            appendDataToCardView(cardContainer, columns, result.data, table_name);

        } else if (['normal', 'transposed', 'ticket'].includes(current_view)) {
            // Uudet TableComponent-pohjaiset näkymät
            // Haetaan ko. näkymän container
            const containerId = `${table_name}_${current_view}_view_container`;
            const container = document.getElementById(containerId);
            if (!container) {
                console.error(`No container found: #${containerId}`);
                return;
            }

            // TableComponentin juurielementillä on luokka .table-component-root
            const tableComponentRoot = container.querySelector('.table-component-root');
            if (tableComponentRoot && tableComponentRoot.tableComponentInstance) {
                // Lisätään uudet rivit appendData-metodilla
                tableComponentRoot.tableComponentInstance.appendData(result.data);
            } else {
                console.error(`TableComponent instance not found in ${current_view} view for table: ${table_name}`);
            }
        }

    } catch (error) {
        console.error('Error fetching more data:', error);
    } finally {
        isLoading = false;
    }
}
