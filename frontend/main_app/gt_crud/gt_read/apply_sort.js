// apply_sort.js

import { fetchDataWithSort } from './fetch_sorted_data.js';

export function applySort(table_name, column) {
    let currentOrder = localStorage.getItem(`${table_name}_sort_order_${column}`) || 'ASC';
    currentOrder = currentOrder === 'ASC' ? 'DESC' : 'ASC';

    const columns = JSON.parse(localStorage.getItem(`${table_name}_columns`)) || [];
    columns.forEach(col => {
        localStorage.removeItem(`${table_name}_sort_order_${col}`);
    });

    localStorage.setItem(`${table_name}_sort_order_${column}`, currentOrder);
    localStorage.setItem(`${table_name}_sort_column`, column);

    fetchDataWithSort(table_name, column, currentOrder);
}
