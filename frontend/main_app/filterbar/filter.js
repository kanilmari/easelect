// filter.js
import { get_filtered_data } from './filter_table_data.js';
import { generate_table } from '../gt_crud/gt_read/view_table.js';

export async function filter_table(table_name) {
    try {
        const result = await get_filtered_data(table_name);
        if (result) {
            const { data, columns, types } = result; // Lisätty types
            await generate_table(table_name, columns, data, types); // Kutsutaan generate_table
        }
    } catch (error) {
        console.error(`Virhe taulua ${table_name} suodattaessa:`, error);
    }
}
