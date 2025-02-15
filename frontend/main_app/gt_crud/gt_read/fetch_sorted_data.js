// fetch_sorted_data.js

import { resetOffset, updateOffset } from '../../../logical_components/infinite_scroll/infinite_scroll.js';
import { getFiltersFromFilterBar } from '../../filterbar/filter_table_data.js';
import { generate_table } from '../../../logical_components/table_views/view_table.js';
import { fetchTableData } from '../../endpoints/endpoint_data_fetcher.js';

export async function fetchDataWithSort(table_name, sortColumn, sortOrder) {
    try {
        resetOffset();
        const filters = getFiltersFromFilterBar(table_name);

        const result = await fetchTableData({
            table_name: table_name,
            sort_column: sortColumn,
            sort_order: sortOrder,
            filters: filters
        });

        await generate_table(table_name, result.columns, result.data, result.types);
        updateOffset(result.data.length);

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}