// // filter.js
// import { refresh_table } from '../general_tables/gt_crud/gt_read/table_refresh_collector.js';

// export async function filter_table(table_name) {
//     try {
//         // Kutsumme refresh_table-funktiota.
//         // skipUrlParams:true tarkoittaa, ettei se nouki suodattimia URL-osoitteesta (voit halutessasi laittaa false).
//         await refresh_table(table_name, { skipUrlParams: true });
//     } catch (error) {
//         console.error(`Virhe taulua ${table_name} suodattaessa:`, error);
//     }
// }
