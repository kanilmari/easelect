// table_refresh_collector.js

import { fetchTableData } from '../../../endpoints/endpoint_data_fetcher.js';
import { generate_table } from '../../../table_views/view_table.js';
import { resetOffset, updateOffset } from '../../../infinite_scroll/infinite_scroll.js';

/**
 * Rakentaa filtterit localStoragesta, filterBar-elementistä ja 
 * (valinnaisesti) URL-parametreista.
 */
export function buildFilters(table_name, options = {}) {
  const { skipUrlParams = false } = options;
  let finalFilters = {};

  // 1) Luetaan localStoragen filtterit
  const storedFilterString = localStorage.getItem(`${table_name}_filters`);
  if (storedFilterString) {
    try {
      const parsed = JSON.parse(storedFilterString);
      for (const [fullKey, val] of Object.entries(parsed)) {
        if (val.trim() !== '') {
          // "myTable_filter_status" -> "status"
          const col = fullKey.replace(`${table_name}_filter_`, '');
          finalFilters[col] = val.trim();
        }
      }
    } catch (err) {
      console.warn(`Virhe localStoragen filtterien parse:ssa:`, err);
    }
  }

  // 2) Haetaan filterBar-elementin syötteet
  const filterBar = document.getElementById(`${table_name}_filterBar`);
  if (filterBar) {
    const inputs = filterBar.querySelectorAll('input, select');
    inputs.forEach(input => {
      const val = input.value.trim();
      if (val !== '') {
        const col = input.id.replace(`${table_name}_filter_`, '');
        finalFilters[col] = val;
      }
    });
  }

  // 3) (Valinnaisesti) Haetaan myös URL-parametrit
  if (!skipUrlParams) {
    const urlParams = new URLSearchParams(window.location.search);
    for (const [pkey, pval] of urlParams.entries()) {
      const lower = pkey.toLowerCase();
      if (!['table','sort_column','sort_order','offset'].includes(lower)) {
        finalFilters[pkey] = pval;
      }
    }
  }

  return finalFilters;
}

/**
 * Selvittää sort_column, sort_order ja offset
 * (localStorage + URL-parametrit). 
 * Mahdolliset valinnaiset override-arvot \`options\`-objektissa.
 */
export function buildSortAndOffset(table_name, options = {}) {
  const urlParams = new URLSearchParams(window.location.search);
  let offsetVal = parseInt(urlParams.get('offset') || '0', 10);

  // Luetaan localStoragesta tallennettu sort_column + sort_order
  const storedSortCol = localStorage.getItem(`${table_name}_sort_column`);
  let sort_column = storedSortCol || urlParams.get('sort_column') || null;
  let sort_order = null;
  if (sort_column) {
    sort_order = localStorage.getItem(`${table_name}_sort_order_${sort_column}`) 
                 || urlParams.get('sort_order') 
                 || null;
  }

  // Jos kutsuja asettaa offsetin käsin
  if (typeof options.offsetOverride === 'number') {
    offsetVal = options.offsetOverride;
  }

  return { sort_column, sort_order, offsetVal };
}

/**
 * refresh_table:
 * Yksi funktio, joka:
 *  1) Rakentaa filtterit
 *  2) hakee datan (fetchTableData),
 *  3) tyhjentää offsetin,
 *  4) kutsuu generate_table(...).
 * 
 * Optiot:
 *   skipUrlParams: true/false (halutaanko lukea URL-param. suodattimia)
 *   offsetOverride: luku (jos haluat aloittaa jostain muusta offsetista)
 */
export async function refresh_table(table_name, options = {}) {
  try {
    // 1) Rakennetaan filtterit, sort ja offset
    const filters = buildFilters(table_name, { skipUrlParams: !!options.skipUrlParams });
    const { sort_column, sort_order, offsetVal } = buildSortAndOffset(table_name, options);

    // 2) Nollataan offset
    resetOffset();

    // 3) Haetaan data
    const result = await fetchTableData({
      table_name,
      offset: offsetVal,
      sort_column,
      sort_order,
      filters
    });
    if (!result) {
      console.warn(`fetchTableData palautti tyhjän. Taulu: ${table_name}`);
      return;
    }

    const data = result.data || [];
    const columns = result.columns || [];
    const data_types = result.types || {};

    // 4) Rakennetaan taulu
    await generate_table(table_name, columns, data, data_types);

    // 5) Päivitetään offset
    updateOffset(data.length);

  } catch (error) {
    console.error(`Virhe refresh_table-funktiossa, taulu: ${table_name}`, error);
  }
}

/**
 * Pieni apufunktio lajiteltuun hakuun.
 * Kutsutaan esim. "Klikkaa sort-painiketta" -> doSortAndRefresh(tableName, col, order).
 */
export async function doSortAndRefresh(table_name, sortColumn, sortOrder) {
  // Asetetaan localStorage
  localStorage.setItem(`${table_name}_sort_column`, sortColumn);
  localStorage.setItem(`${table_name}_sort_order_${sortColumn}`, sortOrder || 'ASC');
  await refresh_table(table_name);
}