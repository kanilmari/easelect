// load_table.js

import { generate_table } from '../../logical_components/table_views/view_table.js';
import { fetchTableData } from '../endpoints/endpoint_data_fetcher.js';

/**
 * Lataa taulun datan huomioiden sekä URL:n query-parametrit (esim. ?status=Open)
 * että mahdollisen filterBarin. Lisäksi lukee sort_column ja sort_order -arvot localStoragesta
 * ellei niitä annettu URL-parametreina.
 *
 * @param {string} table_name - Taulun nimi
 */
export async function load_table(table_name) {
    try {
        // Haetaan URL-parametrit
        const url_params = new URLSearchParams(window.location.search);
        let filters = {};
        let sort_column = null;
        let sort_order = null;
        let offset_value = 0;

        // Poimitaan "varatut" URL-parametrit
        if (url_params.has('sort_column')) {
            sort_column = url_params.get('sort_column');
        }
        if (url_params.has('sort_order')) {
            sort_order = url_params.get('sort_order');
        }
        if (url_params.has('offset')) {
            offset_value = parseInt(url_params.get('offset'), 10) || 0;
        }

        // Loput URL-parametrit tulkitaan filtteröinniksi
        for (const [param_key, param_value] of url_params.entries()) {
            const lower_key = param_key.toLowerCase();
            if (
                lower_key !== 'table' &&
                lower_key !== 'sort_column' &&
                lower_key !== 'sort_order' &&
                lower_key !== 'offset'
            ) {
                filters[param_key] = param_value;
            }
        }

        // Luetaan myös localStoragesta lajittelu
        const stored_sort_column = localStorage.getItem(`${table_name}_sort_column`);
        if (stored_sort_column) {
            sort_column = stored_sort_column;
            const stored_sort_order = localStorage.getItem(`${table_name}_sort_order_${stored_sort_column}`);
            if (stored_sort_order) {
                sort_order = stored_sort_order;
            }
        }

        // Kokeillaan hakea ensin saraketietoja
        const columns_response = await fetch(`/api/get-columns?table=${table_name}`);
        if (!columns_response.ok) {
            throw new Error(`HTTP error! status: ${columns_response.status}`);
        }

        // Luetaan myös filtteripalkin arvot
        const filter_bar = document.getElementById(`${table_name}_filterBar`);
        if (filter_bar) {
            const inputs = filter_bar.querySelectorAll('input, select');
            inputs.forEach(input => {
                if (input.value.trim() !== '') {
                    const column = input.id.replace(`${table_name}_filter_`, '');
                    filters[column] = input.value.trim();
                }
            });
        }

        // Haetaan data
        const result = await fetchTableData({
            table_name,
            offset: offset_value,
            sort_column,
            sort_order,
            filters
        });

        // Käsitellään vastaus
        const data = result.data || [];
        const response_columns = result.columns || [];
        const data_types = result.types || [];

        // Tallennetaan localStorageen esim. sarakeluettelot
        localStorage.setItem(`${table_name}_columns`, JSON.stringify(response_columns));
        localStorage.setItem(`${table_name}_dataTypes`, JSON.stringify(data_types));

        // Rakennetaan taulun DOM-näkymä
        await generate_table(table_name, response_columns, data, data_types);

    } catch (error) {
        console.error(`error loading table ${table_name}:`, error);
    }
}
