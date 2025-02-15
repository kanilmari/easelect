// infinite_scroll.js

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

export function initializeInfiniteScroll(table_name) {
    // 1. Katsotaan, kumpi näkymä on aktiivinen
    const current_view = localStorage.getItem(`${table_name}_view`) || 'table'; 
    // Vaihtoehdot: 'table' tai 'card'.

    // 2. Rakennetaan container-id dynaamisesti
    const container_id = `${table_name}_${current_view}_view_container`;
    
    // 3. Haetaan kontti
    const container = document.getElementById(container_id);

    if (!container) {
        console.error(`Container element not found: #${container_id}`);
        return;
    }

    // Jos meillä on jo vanha handleScroll tallessa, poistetaan se
    if (handleScroll) {
        container.removeEventListener('scroll', handleScroll);
    }

    // 4. Määritellään handleScroll
    handleScroll = function() {
        if (isLoading) return;

        // Kun kontti scrollataan melkein alas asti, ladataan lisää dataa
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 100) {
            fetchMoreData(table_name);
        }
    };

    // 5. Lisätään scroll-listener
    container.addEventListener('scroll', handleScroll);
}

async function fetchMoreData(table_name) {
    console.log('fetching more data');
    if (isLoading) return;
    isLoading = true;

    try {
        // Palautetaan current_view, jotta saadaan ladattua oikeaan näkymään
        const current_view = localStorage.getItem(`${table_name}_view`) || 'table';

        // Haetaan filtterit
        const filters = getFiltersFromFilterBar(table_name);

        // Haetaan lajittelun parametrit
        const sort_column = localStorage.getItem(`${table_name}_sort_column`);
        let sort_order = null;
        if (sort_column) {
            sort_order = localStorage.getItem(`${table_name}_sort_order_${sort_column}`);
        }

        // Kutsutaan yhteistä fetchTableData-funktiota
        const result = await fetchTableData({
            table_name: table_name,
            offset: offset,
            sort_column: sort_column,
            sort_order: sort_order,
            filters: filters
        });

        // Jos ei lisää dataa, poistetaan scroll-listener
        if (!result.data || result.data.length === 0) {
            const currentContainerId = `${table_name}_${current_view}_view_container`;
            const container = document.getElementById(currentContainerId);
            if (container) {
                container.removeEventListener('scroll', handleScroll);
            }
            isLoading = false;
            return;
        }

        // Kasvatetaan offsetia
        updateOffset(result.data.length);

        // Päivitetään oikea näkymä
        if (current_view === 'table') {
            const table = document.querySelector(`#${table_name}_container table`);
            if (!table) {
                console.error(`Table element not found for table: ${table_name}`);
                isLoading = false;
                return;
            }
            const columns = JSON.parse(table.dataset.columns);
            const dataTypes = JSON.parse(table.dataset.dataTypes);
            appendDataToTable(table, result.data, columns, dataTypes);
        } else if (current_view === 'card') {
            const cardContainer = document.querySelector(`#${table_name}_card_view_container .card_container`);
            if (!cardContainer) {
                console.error(`Card container not found for table: ${table_name}`);
                isLoading = false;
                return;
            }
            const columns = JSON.parse(localStorage.getItem(`${table_name}_columns`));
            appendDataToCardView(cardContainer, columns, result.data, table_name);
        }

    } catch (error) {
        console.error('Error fetching more data:', error);
    } finally {
        isLoading = false;
    }
}
