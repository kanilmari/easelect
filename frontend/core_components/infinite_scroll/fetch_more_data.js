// import { fetchTableData } from '../endpoints/endpoint_data_fetcher.js';
// import { appendDataToTable } from '../table_views/table_view/append_rows_to_table_view.js';
// import { appendDataToCardView } from '../table_views/card_view/card_view.js';

// import {
//     getUnifiedTableState,
//     setUnifiedTableState
// } from '../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js';

// let isLoading = false;

// //  * Varsinainen “hae lisää dataa” -funktio.
// export async function fetchMoreData(tableName, options = {}) {
//     const { isInfiniteScroll = true, searchType = null, append = true } = options;
//     if (isLoading) return;
//     isLoading = true;

//     try {
//         const state = getUnifiedTableState(tableName);
//         const offsetVal = isInfiniteScroll ? (state.offset || 0) : 0; // Offset vain infinite scrollissa
//         const filters = state.filters || {};
//         if (searchType) filters.searchType = searchType; // Lisätään hakutyyppi filttereihin
//         const sort_column = state.sort?.column || null;
//         const sort_order = state.sort?.direction || null;

//         const result = await fetchTableData({
//             table_name: tableName,
//             offset: offsetVal,
//             sort_column,
//             sort_order,
//             filters,
//             callerName: `fetchMoreData (${isInfiniteScroll ? 'infinite scroll' : 'search'})`
//         });

//         if (!result.data || result.data.length === 0) {
//             if (isInfiniteScroll && observer && sentinel) {
//                 observer.unobserve(sentinel);
//             }
//             return;
//         }

//         if (isInfiniteScroll) {
//             updateOffset(tableName, result.data.length); // Päivitä offset vain infinite scrollissa
//         }

//         appendDataToView(tableName, result.data, append);

//     } catch (err) {
//         console.error('error fetching more data:', err);
//     } finally {
//         isLoading = false;
//     }
// }

// export function appendDataToView(tableName, data, append = true) {
//     const currentView = localStorage.getItem(`${tableName}_view`) || 'table';

//     if (currentView === 'table') {
//         const table = document.querySelector(`#${tableName}_container table`);
//         if (!table) {
//             console.error(`Tauluelementti puuttuu: #${tableName}_container table`);
//             return;
//         }
//         const columns = JSON.parse(table.dataset.columns);
//         const dataTypes = JSON.parse(table.dataset.dataTypes);
        
//         if (!append) table.innerHTML = ''; // Tyhjennä, jos ei lisätä
//         appendDataToTable(table, data, columns, dataTypes);

//     } else if (currentView === 'card') {
//         const cardContainer = document.querySelector(`#${tableName}_card_view_container .card_container`);
//         if (!cardContainer) {
//             console.error(`Korttinäkymän kontainer puuttuu: #${tableName}_card_view_container .card_container`);
//             return;
//         }
//         const columns = JSON.parse(localStorage.getItem(`${tableName}_columns`)) || [];
        
//         if (!append) cardContainer.innerHTML = ''; // Tyhjennä, jos ei lisätä
//         appendDataToCardView(cardContainer, columns, data, tableName);

//     } else if (['normal', 'transposed', 'ticket'].includes(currentView)) {
//         const containerId = `${tableName}_${currentView}_view_container`;
//         const container = document.getElementById(containerId);
//         if (!container) {
//             console.error(`Kontainer puuttuu: #${containerId}`);
//             return;
//         }
//         const tableComponentRoot = container.querySelector('.table-component-root');
//         if (tableComponentRoot && tableComponentRoot.tableComponentInstance) {
//             if (append) {
//                 tableComponentRoot.tableComponentInstance.appendData(data);
//             } else {
//                 tableComponentRoot.tableComponentInstance.setData(data); // Korvaa data
//             }
//         } else {
//             console.error(`TableComponent ei löydy (tableName: ${tableName}, view: ${currentView}).`);
//         }
//     }
// }