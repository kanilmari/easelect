// filter_table_data.js
import { fetchTableData } from '../endpoints/endpoint_data_fetcher.js';

export async function get_filtered_data(table_name) {
    const filters = getFiltersFromFilterBar(table_name);
    const sort_column = localStorage.getItem(`${table_name}_sort_column`);
    let sort_order = null;
    if (sort_column) {
        sort_order = localStorage.getItem(`${table_name}_sort_order_${sort_column}`);
    }

    try {
        const result = await fetchTableData({
            table_name: table_name,
            sort_column: sort_column,
            sort_order: sort_order,
            filters: filters
        });
        return { data: result.data, columns: result.columns, types: result.types };
    } catch (error) {
        console.error(`Virhe haettaessa dataa taululle ${table_name}:`, error);
        return null;
    }
}

export function getFiltersFromFilterBar(table_name) {
    const filters = {};
    const filterBar = document.getElementById(`${table_name}_filterBar`);
    if (!filterBar) return filters;

    const inputs = filterBar.querySelectorAll('input, select');
    inputs.forEach(input => {
        if (input.value.trim() !== '') {
            const column = input.id.replace(`${table_name}_filter_`, '');
            filters[column] = input.value.trim();
        }
    });

    return filters;
}
