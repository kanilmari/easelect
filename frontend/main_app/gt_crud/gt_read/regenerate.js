// regenerate.js
import { generate_table } from '../../../logical_components/table_views/view_table.js';
import { fetchTableData } from '../../endpoints/endpoint_data_fetcher.js';

export async function regenerate_view(table_name) {
    try {
        const result = await fetchTableData({ table_name });
        const columns = result.columns;
        const rows = result.data;
        await generate_table(table_name, columns, rows, result.types);
    } catch (error) {
        alert('Virhe näkymän päivittämisessä: ' + error.message);
    }
}