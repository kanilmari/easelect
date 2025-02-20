// // rights_dropdown_helpers.js

// import { fetchTableData } from '../endpoints/endpoint_data_fetcher.js';

// export async function create_dropdown({ container, table_name, label_text, select_id, value_field, text_field }) {
//     try {
//         // Haetaan data suoraan fetchTableData-funktion avulla.
//         // offset, sort_column, sort_order, filters jne. ovat valinnaisia parametreja,
//         // nyt käytämme vain taulun nimen.
//         const result = await fetchTableData({ table_name });
//         // const columns = result.columns;
//         const data = result.data;

//         const label = document.createElement('label');
//         label.textContent = label_text;
//         label.htmlFor = select_id;

//         const select = document.createElement('select');
//         select.id = select_id;

//         data.forEach(item => {
//             const option = document.createElement('option');
//             option.value = item[value_field];
//             option.textContent = item[text_field];
//             select.appendChild(option);
//         });

//         container.appendChild(label);
//         container.appendChild(select);
//         container.appendChild(document.createElement('br'));

//     } catch (error) {
//         console.error(`Virhe dropdownia ${select_id} luodessa:`, error);
//     }
// }
