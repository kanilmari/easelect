// filter.js
import { refresh_table } from '../general_tables/gt_crud/gt_read/table_refresh_collector.js';

export async function filter_table(table_name) {
    try {
        // Kutsumme refresh_table-funktiota.
        // skipUrlParams:true tarkoittaa, ettei se nouki suodattimia URL-osoitteesta (voit halutessasi laittaa false).
        await refresh_table(table_name, { skipUrlParams: true });
    } catch (error) {
        console.error(`Virhe taulua ${table_name} suodattaessa:`, error);
    }
}

// // filter.js 2025-03-15--18-35
// import { get_filtered_data } from './filter_table_data.js';
// import { generate_table } from '../table_views/view_table.js';

// export async function filter_table(table_name) {
//     try {
//         const result = await get_filtered_data(table_name);
//         if (result) {
//             const { data, columns, types } = result; // Lisätty types
//             await generate_table(table_name, columns, data, types); // Kutsutaan generate_table
//         }
//     } catch (error) {
//         console.error(`Virhe taulua ${table_name} suodattaessa:`, error);
//     }
// }
