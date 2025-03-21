// table_refresh_collector.js

import { fetchTableData } from '../../../endpoints/endpoint_data_fetcher.js';
import { generate_table } from '../../../table_views/view_table.js';
import { resetOffset, updateOffset } from '../../../infinite_scroll/infinite_scroll.js';

/* Uusi unified-osuus */

/**
 * Palauttaa taulun unified-tilan (sort, filters, offset, jne.)
 * localStoragesta. Jos tila puuttuu tai on korruptoitunut, palauttaa oletukset.
 */
export function getUnifiedTableState(tableName) {
    const storageKey = `${tableName}_sorting_and_filtering_specs`;
    const defaultState = {
        sort: {
            column: null,
            direction: null
        },
        filters: {},
        offset: 0
    };

    const raw = localStorage.getItem(storageKey);
    if (!raw) {
        return defaultState;
    }
    try {
        const parsed = JSON.parse(raw);
        // yhdistetään mahdollisesti puuttuvat kentät varmuuden vuoksi
        return { ...defaultState, ...parsed };
    } catch (err) {
        console.warn(`Virhe parsing localStorage avaimella ${storageKey}:`, err);
        return defaultState;
    }
}

/**
 * Asettaa (ja tallentaa localStorageen) taulun unified-tilan.
 * partialState voi sisältää esim. { sort: {...}, filters: {...}, offset: 99 }
 * tai vain osan noista.
 */
export function setUnifiedTableState(tableName, partialState) {
    const storageKey = `${tableName}_sorting_and_filtering_specs`;
    const currentState = getUnifiedTableState(tableName);
    const newState = {
        ...currentState,
        ...partialState
    };
    localStorage.setItem(storageKey, JSON.stringify(newState));
    return newState; // palautetaan halutessa
}

/**
 * Pääfunktio, joka huolehtii:
 *   1) sortin & filttereiden kokoamisesta (unified-tila localStoragesta),
 *   2) offsetin käsittelystä,
 *   3) datan hakemisesta fetchTableData-funktiolla,
 *   4) taulun rakentamisesta generate_table:lla,
 *   5) offsetin päivityksestä (infinite scroll).
 *
 * Optiot:
 *   - skipUrlParams: (bool) halutaanko lukea URL-parametreja
 *   - offsetOverride: (number) jos halutaan aloittaa jostain muusta offsetista
 *   - newSortColumn, newSortDirection: jos halutaan ylikirjoittaa localStoragen sorttia
 *   - newFilters: jos halutaan ylikirjoittaa localStoragen filtterejä
 */
// table_refresh_collector.js

export async function refreshTableUnified(tableName, options = {}) {
    // console.log('refreshTableUnified tableName and options: ', tableName, options);
    try {
        // 1) Haetaan ensin localStoragen nykyinen unified-tila
        let currentState = getUnifiedTableState(tableName);

        // 2) Haetaanko myös URL-parametrit? (Jos skipUrlParams = false, niin sekoitetaan ne sisään.)
        if (!options.skipUrlParams) {
            const urlParams = new URLSearchParams(window.location.search);

            // Voidaan lukea esim. ?sort_column=..., ?sort_order=..., ?filter_xxx=..., ?offset=...
            const urlSortColumn = urlParams.get('sort_column');
            const urlSortOrder = urlParams.get('sort_order');
            const urlOffset = urlParams.get('offset');

            if (urlSortColumn) {
                currentState.sort.column = urlSortColumn;
            }
            if (urlSortOrder) {
                currentState.sort.direction = urlSortOrder.toUpperCase();
            }
            if (urlOffset) {
                currentState.offset = parseInt(urlOffset, 10) || 0;
            }

            // Luetaan myös muita filtterejä
            urlParams.forEach((val, key) => {
                if (!['table', 'sort_column', 'sort_order', 'offset'].includes(key.toLowerCase())) {
                    currentState.filters[key] = val;
                }
            });
        }

        // 3) Ylikirjoita localStoragen tilaa, jos kutsuja laittoi explicit overrideja
        if (typeof options.offsetOverride === 'number') {
            currentState.offset = options.offsetOverride;
        }
        if (options.newSortColumn) {
            currentState.sort.column = options.newSortColumn;
        }
        if (options.newSortDirection) {
            currentState.sort.direction = options.newSortDirection;
        }
        if (options.newFilters && typeof options.newFilters === 'object') {
            currentState.filters = { ...currentState.filters, ...options.newFilters };
        }

        // 4) Tallennetaan localStorageen
        // console.log('table_refresh_collector.js: refreshTableUnified kutsuu funktiota setUnifiedTableState arvoilla:', tableName, currentState);
        setUnifiedTableState(tableName, currentState);

        // 5) Nollataan offset (asetetaan localStorageen offset=0 tälle taululle)
        // console.log('table_refresh_collector.js: refreshTableUnified kutsuu funktiota resetOffset arvoilla:', tableName);
        resetOffset(tableName);

        // 6) Haetaan localStoragesta tuore offset uudelleen
        currentState = getUnifiedTableState(tableName);

        // 7) Haetaan data fetchTableData-funktiolla (nyt varmasti offset=0, ellei override)
        const result = await fetchTableData({
            table_name: tableName,
            offset: currentState.offset,
            sort_column: currentState.sort.column,
            sort_order: currentState.sort.direction,
            filters: currentState.filters,
            callerName: 'refreshTableUnified'
        });
        if (!result) {
            console.warn(`fetchTableData palautti tyhjän vastauksen taululle: ${tableName}`);
            return;
        }

        const data = result.data || [];
        const columns = result.columns || [];
        const data_types = result.types || {};

        // 8) Rakennetaan varsinainen taulu/näkymä
        // console.log('refreshTableUnified kutsuu funktiota generate_table');
        await generate_table(tableName, columns, data, data_types);

        // 9) Päivitetään offset infinite scrollia varten
        // console.log('table_refresh_collector.js: refreshTableUnified kutsuu funktiota updateOffset arvoilla:', tableName, data.length);
        updateOffset(tableName, data.length);

    } catch (err) {
        console.error('virhe: %s', err?.message || err);
    }
}

// export async function refreshTableUnified(tableName, options = {}) {
//     console.log('refreshTableUnified tableName and options: ', tableName, options);
//     try {
//         // 1) Haetaan ensin localStoragen nykyinen unified-tila
//         let currentState = getUnifiedTableState(tableName);

//         // 2) Haetaanko myös URL-parametrit? (Jos skipUrlParams = false, niin sekoitetaan ne sisään.)
//         if (!options.skipUrlParams) {
//             const urlParams = new URLSearchParams(window.location.search);

//             // Voidaan lukea esim. ?sort_column=..., ?sort_order=..., ?filter_xxx=..., ?offset=...
//             const urlSortColumn = urlParams.get('sort_column');
//             const urlSortOrder = urlParams.get('sort_order');
//             const urlOffset = urlParams.get('offset');

//             if (urlSortColumn) {
//                 currentState.sort.column = urlSortColumn;
//             }
//             if (urlSortOrder) {
//                 currentState.sort.direction = urlSortOrder.toUpperCase();
//             }
//             if (urlOffset) {
//                 currentState.offset = parseInt(urlOffset, 10) || 0;
//             }

//             // Luetaan myös filtterejä, jos tarve
//             urlParams.forEach((val, key) => {
//                 if (!['table', 'sort_column', 'sort_order', 'offset'].includes(key.toLowerCase())) {
//                     currentState.filters[key] = val;
//                 }
//             });
//         }

//         // 3) Ylikirjoita localStoragen tilaa, jos kutsuja laittoi explicit overrideja
//         if (typeof options.offsetOverride === 'number') {
//             currentState.offset = options.offsetOverride;
//         }
//         if (options.newSortColumn) {
//             currentState.sort.column = options.newSortColumn;
//         }
//         if (options.newSortDirection) {
//             currentState.sort.direction = options.newSortDirection;
//         }
//         if (options.newFilters && typeof options.newFilters === 'object') {
//             currentState.filters = { ...currentState.filters, ...options.newFilters };
//         }

//         // 4) Tallennetaan takaisin localStorageen
//         console.log('table_refresh_collector.js: refreshTableUnified kutsuu funktiota setUnifiedTableState arvoilla: ', tableName, currentState);
//         setUnifiedTableState(tableName, currentState);

//         // 5) Nollataan offset nimenomaisesti tälle taululle
//         console.log('table_refresh_collector.js: refreshTableUnified kutsuu funktiota resetOffset arvoilla:', tableName);
//         resetOffset(tableName);

//         // 6) Haetaan data fetchTableData-funktiolla — lisätään callerName
//         const result = await fetchTableData({
//             table_name: tableName,
//             offset: currentState.offset,
//             sort_column: currentState.sort.column,
//             sort_order: currentState.sort.direction,
//             filters: currentState.filters,
//             callerName: 'refreshTableUnified'
//         });
//         if (!result) {
//             console.warn(`fetchTableData palautti tyhjän vastauksen taululle: ${tableName}`);
//             return;
//         }

//         const data = result.data || [];
//         const columns = result.columns || [];
//         const data_types = result.types || {};

//         // 7) Rakennetaan varsinainen taulu (tai näyttää että generoi HTML-näkymän)
//         console.log('refreshTableUnified kutsuu funktiota generate_table');
//         await generate_table(tableName, columns, data, data_types);

//         // 8) Päivitetään offset infinite scrollia varten
//         console.log('table_refresh_collector.js: refreshTableUnified kutsuu funktiota updateOffset arvoilla:', tableName, data.length);
//         updateOffset(tableName, data.length);

//     } catch (err) {
//         console.error('Virhe refreshTableUnified-funktiossa:', err);
//     }
// }

/**
 * Pieni apufunktio esimerkkinä, kun klikkaat “sarakkeen järjestä” -nappia:
 *  - se vaihtaa currentState.sort.direction ASC <-> DESC
 *  - tallentaa tilan
 *  - kutsuu refreshTableUnified
 */
export async function toggleSortAndRefresh(tableName, column) {
    const state = getUnifiedTableState(tableName);

    if (state.sort.column === column) {
        if (state.sort.direction === 'ASC') {
            state.sort.direction = 'DESC';
        } else {
            state.sort.direction = 'ASC';
        }
    } else {
        state.sort.column = column;
        state.sort.direction = 'ASC';
    }
    console.log('table_refresh_collector.js: toggleSortAndRefresh kutsuu funktiota setUnifiedTableState arvoilla: ', tableName, state);
    setUnifiedTableState(tableName, state);

    await refreshTableUnified(tableName, { skipUrlParams: true });
}
