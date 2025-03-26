// endpoint_column_fetcher.js

/**
 * fetch_columns_for_table hakee annetun taulun sarakkeet reitistä /api/table-columns/:table_name
 * @param {string} table_name - Taulun nimi, jonka sarakkeet halutaan hakea
 * @returns {Promise<Array>} Palauttaa taulun saraketietojen listan
 */
export async function fetch_columns_for_table(table_name) {
    const response = await fetch(`/api/table-columns/${table_name}`);
    if (!response.ok) {
        const error_text = await response.text();
        console.error('error fetching table columns:', error_text);
        throw new Error('failed to fetch table columns');
    }
    return await response.json();
}
