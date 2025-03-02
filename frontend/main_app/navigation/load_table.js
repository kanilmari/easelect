// load_table.js

import { generate_table } from '../../logical_components/table_views/view_table.js';
import { fetchTableData } from '../endpoints/endpoint_data_fetcher.js';

/**
 * Lataa taulun datan huomioiden:
 *  - URL-parametrit (esim. ?columnX=foobar)
 *  - localStoragen tallettamat filtterit (esim. {tableName}_filters)
 *  - filterBar-elementin syötteet
 *  - localStoragen sort_column/sort_order (tai URL:n vastaavat)
 *
 * @param {string} table_name - Taulun nimi
 */
export async function load_table(table_name) {
    try {
        // 1) Haetaan URL-parametrit
        const url_params = new URLSearchParams(window.location.search);
        let filters = {};
        let sort_column = null;
        let sort_order = null;
        let offset_value = 0;

        // 2) Poimitaan varatut URL-parametrit
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

        // 3) Luetaan myös localStoragesta tallennettu sort_column (ja sille sort_order)
        const stored_sort_column = localStorage.getItem(`${table_name}_sort_column`);
        if (stored_sort_column) {
            sort_column = stored_sort_column;
            const stored_sort_order = localStorage.getItem(`${table_name}_sort_order_${stored_sort_column}`);
            if (stored_sort_order) {
                sort_order = stored_sort_order;
            }
        }

        // 4) Luetaan localStoragen tallentamat filtterit (esim. {tableName}_filters) ja yhdistetään URL-filttereihin
        const storedFilterString = localStorage.getItem(`${table_name}_filters`);
        if (storedFilterString) {
            try {
                const storedFilters = JSON.parse(storedFilterString);
                // storedFilters on tyyliä:
                //   { "tableName_filter_columnX": "foobar", "tableName_filter_columnY_from": "1", ... }
                // mapFilterIdsToColumns muuntaa -> { columnX: "foobar", columnY_from: "1", ... }
                const localStorageFilters = mapFilterIdsToColumns(storedFilters, table_name);
                // Yhdistetään URL-filtterit ja localStorage-filtterit
                filters = { ...localStorageFilters, ...filters };
            } catch (err) {
                console.warn('Virhe localStorage filtterien parse:ssa:', err);
            }
        }

        // 5) Luetaan myös filterBar-elementin syötteet (jos sellainen on)
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

        // 6) Kutsutaan fetchTableData suoraan suodattimilla
        //    Nyt meillä on offset_value, sort_column, sort_order ja yhdistetyt filters
        const result = await fetchTableData({
            table_name,
            offset: offset_value,
            sort_column,
            sort_order,
            filters
        });

        // 7) Käsitellään vastaus
        // /api/get-results voi esim. palauttaa:
        // {
        //   columns: [...],
        //   data: [...],
        //   types: {...},       // data_types
        //   resultsPerLoad: number,
        //   userColumnSettings: [...]
        // }
        const data = result.data || [];
        const response_columns = result.columns || [];
        const data_types = result.types || {};
        const userColumnSettings = result.userColumnSettings || [];

        // Tulostetaan saraketiedot (userColumnSettings) konsoliin (debug)
        console.log(`User column settings for table '${table_name}':`, userColumnSettings);

        // 8) Tallennetaan localStorageen esim. sarakeluettelot ja tietotyypit
        localStorage.setItem(`${table_name}_columns`, JSON.stringify(response_columns));
        localStorage.setItem(`${table_name}_dataTypes`, JSON.stringify(data_types));

        // 9) Rakennetaan taulun DOM-näkymä
        await generate_table(table_name, response_columns, data, data_types);

    } catch (error) {
        console.error(`error loading table ${table_name}:`, error);
    }
}

/**
 * Apufunktio, joka poimii localStoragen avaimet
 * (esim. "myTable_filter_status": "Open") ja muuntaa
 * niistä -> { status: "Open" }
 */
function mapFilterIdsToColumns(storedFilters, tableName) {
    const mapped = {};
    for (const [fullId, value] of Object.entries(storedFilters)) {
        if (!fullId.startsWith(`${tableName}_filter_`)) {
            continue;
        }
        // Poistetaan alusta "tableName_filter_"
        const colPart = fullId.substring(`${tableName}_filter_`.length);
        mapped[colPart] = value;
    }
    return mapped;
}


// // load_table.js

// import { generate_table } from '../../logical_components/table_views/view_table.js';
// import { fetchTableData } from '../endpoints/endpoint_data_fetcher.js';

// /**
//  * Lataa taulun datan huomioiden sekä URL-parametrit että localStoragen filtterit.
//  */
// export async function load_table(table_name) {
//     try {
//         // 1) Kootaan URL-parametreista tulevat filtterit + sortit
//         const url_params = new URLSearchParams(window.location.search);
//         let filters = {};
//         let sort_column = null;
//         let sort_order = null;
//         let offset_value = 0;

//         if (url_params.has('sort_column')) {
//             sort_column = url_params.get('sort_column');
//         }
//         if (url_params.has('sort_order')) {
//             sort_order = url_params.get('sort_order');
//         }
//         if (url_params.has('offset')) {
//             offset_value = parseInt(url_params.get('offset'), 10) || 0;
//         }

//         // Muut URL-parametrit = filtteröinti
//         for (const [param_key, param_value] of url_params.entries()) {
//             const lower_key = param_key.toLowerCase();
//             if (
//                 lower_key !== 'table' &&
//                 lower_key !== 'sort_column' &&
//                 lower_key !== 'sort_order' &&
//                 lower_key !== 'offset'
//             ) {
//                 filters[param_key] = param_value;
//             }
//         }

//         // 2) Luetaan localStoragesta sort_column + sort_order
//         const stored_sort_column = localStorage.getItem(`${table_name}_sort_column`);
//         if (stored_sort_column) {
//             sort_column = stored_sort_column;
//             const stored_sort_order = localStorage.getItem(`${table_name}_sort_order_${stored_sort_column}`);
//             if (stored_sort_order) {
//                 sort_order = stored_sort_order;
//             }
//         }

//         // 3) **LUETAAN localStorage-filtterit** ja yhdistetään jo kerättyihin `filters`
//         const storedFilterString = localStorage.getItem(`${table_name}_filters`);
//         if (storedFilterString) {
//             try {
//                 const storedFilters = JSON.parse(storedFilterString);
//                 // storedFilters on tyyliä { "tableA_filter_columnX": "foobar", "tableA_filter_columnY_from": "1", ... }
//                 // Meidän on mapitettava ne => { columnX: "foobar", columnY_from: "1", ... }

//                 const localStorageFilters = mapFilterIdsToColumns(storedFilters, table_name);
//                 // Yhdistetään URL-filtterit ja localStorage-filtterit
//                 // (jos haluat, URL voi yliajaa localStoragen, tai toisin päin)
//                 filters = { ...localStorageFilters, ...filters };

//             } catch (err) {
//                 console.warn('Virhe localStorage filtterien parse:ssa:', err);
//             }
//         }

//         // 4) Kutsutaan fetchTableData suoraan suodattimilla
//         const result = await fetchTableData({
//             table_name,
//             offset: offset_value,
//             sort_column,
//             sort_order,
//             filters // << nyt localStorage + URL + filterBar
//         });

//         // 5) Rakennetaan taulun DOM-näkymä
//         const data = result.data || [];
//         const response_columns = result.columns || [];
//         const data_types = result.types || {};

//         await generate_table(table_name, response_columns, data, data_types);

//     } catch (error) {
//         console.error(`error loading table ${table_name}:`, error);
//     }
// }

// /**
//  * mapFilterIdsToColumns:
//  *  - Oletetaan, että localStoragessa on avain "tableName_filter_status" = "Open"
//  *    => -> "status" : "Open"
//  *  - Numerofilttereissä "tableName_filter_price_from": "100" => => "price_from": "100"
//  */
// function mapFilterIdsToColumns(storedFilters, tableName) {
//     const mapped = {};
//     for (const [fullId, value] of Object.entries(storedFilters)) {
//         if (!fullId.startsWith(`${tableName}_filter_`)) continue;
//         // Poistetaan alusta "tableName_filter_"
//         let colPart = fullId.substring(`${tableName}_filter_`.length);
//         // colPart voisi olla esim. "price_from", "price_to", "status"
//         mapped[colPart] = value;
//     }
//     return mapped;
// }


// // // load_table.js (huom. eri kuin load_tables.js)

// // import { generate_table } from '../../logical_components/table_views/view_table.js';
// // import { fetchTableData } from '../endpoints/endpoint_data_fetcher.js';

// // /**
// //  * Lataa taulun datan huomioiden sekä URL:n query-parametrit (esim. ?status=Open)
// //  * että mahdollisen filterBarin. Lisäksi lukee sort_column ja sort_order -arvot localStoragesta
// //  * ellei niitä annettu URL-parametreina.
// //  *
// //  * @param {string} table_name - Taulun nimi
// //  */
// // export async function load_table(table_name) {
// //     try {
// //         // Haetaan URL-parametrit
// //         const url_params = new URLSearchParams(window.location.search);
// //         let filters = {};
// //         let sort_column = null;
// //         let sort_order = null;
// //         let offset_value = 0;

// //         // Poimitaan "varatut" URL-parametrit
// //         if (url_params.has('sort_column')) {
// //             sort_column = url_params.get('sort_column');
// //         }
// //         if (url_params.has('sort_order')) {
// //             sort_order = url_params.get('sort_order');
// //         }
// //         if (url_params.has('offset')) {
// //             offset_value = parseInt(url_params.get('offset'), 10) || 0;
// //         }

// //         // Loput URL-parametrit tulkitaan filtteröinniksi
// //         for (const [param_key, param_value] of url_params.entries()) {
// //             const lower_key = param_key.toLowerCase();
// //             if (
// //                 lower_key !== 'table' &&
// //                 lower_key !== 'sort_column' &&
// //                 lower_key !== 'sort_order' &&
// //                 lower_key !== 'offset'
// //             ) {
// //                 filters[param_key] = param_value;
// //             }
// //         }

// //         // Luetaan myös localStoragesta lajittelu
// //         const stored_sort_column = localStorage.getItem(`${table_name}_sort_column`);
// //         if (stored_sort_column) {
// //             sort_column = stored_sort_column;
// //             const stored_sort_order = localStorage.getItem(`${table_name}_sort_order_${stored_sort_column}`);
// //             if (stored_sort_order) {
// //                 sort_order = stored_sort_order;
// //             }
// //         }

// //         // Luetaan myös filtteripalkin arvot
// //         const filter_bar = document.getElementById(`${table_name}_filterBar`);
// //         if (filter_bar) {
// //             const inputs = filter_bar.querySelectorAll('input, select');
// //             inputs.forEach(input => {
// //                 if (input.value.trim() !== '') {
// //                     const column = input.id.replace(`${table_name}_filter_`, '');
// //                     filters[column] = input.value.trim();
// //                 }
// //             });
// //         }

// //         // Haetaan data yhdellä kutsulla /api/get-results
// //         const result = await fetchTableData({
// //             table_name,
// //             offset: offset_value,
// //             sort_column,
// //             sort_order,
// //             filters
// //         });

// //         // Käsitellään vastaus
// //         // Huomaa, että /api/get-results voi palauttaa:
// //         // {
// //         //   columns: [...],
// //         //   data: [...],
// //         //   types: {...},
// //         //   resultsPerLoad: number,
// //         //   userColumnSettings: [...]
// //         // }
// //         const data = result.data || [];
// //         const response_columns = result.columns || [];
// //         const data_types = result.types || {};
// //         const userColumnSettings = result.userColumnSettings || [];

// //         // Tulostetaan saraketiedot (userColumnSettings) konsoliin
// //         console.log(`User column settings for table '${table_name}':`, userColumnSettings);

// //         // Tallennetaan localStorageen esim. sarakeluettelot ja tietotyypit
// //         localStorage.setItem(`${table_name}_columns`, JSON.stringify(response_columns));
// //         localStorage.setItem(`${table_name}_dataTypes`, JSON.stringify(data_types));

// //         // Rakennetaan taulun DOM-näkymä
// //         await generate_table(table_name, response_columns, data, data_types);

// //     } catch (error) {
// //         console.error(`error loading table ${table_name}:`, error);
// //     }
// // }