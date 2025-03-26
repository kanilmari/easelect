// endbpoint_data_fetcher.js

/**
 * Version 2.0
 *
 * @param {Object} options
 * @param {string} options.table_name  - taulun nimi (mapataan ?table=...)
 * @param {number} [options.offset=0]  - offset-parametri (mapataan ?offset=...)
 * @param {string} [options.sort_column=null] - lajittelusarakkeen nimi (mapataan ?sort_column=...)
 * @param {string} [options.sort_order=null]  - ASC tai DESC (mapataan ?sort_order=...)
 * @param {Object} [options.filters={}] - muut filtteröintiparametrit (avain-arvo)
 * @param {string} [options.callerName=''] - (valinnainen) kutsujafunktion nimi lokitusta varten
 *
 * @returns {Promise<Object>} Palauttaa JSON-vastauksen, muotoa:
 *   {
 *     "columns": [...],
 *     "data": [...],
 *     "types": {...},
 *     "resultsPerLoad": number
 *   }
 */
export async function fetchTableData({
    table_name,
    offset = 0,
    sort_column = null,
    sort_order = null,
    filters = {},
    callerName = ''
}) {
    // Kootaan query-parametrit
    const params = new URLSearchParams();

    // Asetetaan pakollinen "table"-parametri:
    params.append('table', table_name);

    // Käytetään offset vain jos se on suurempi kuin nolla
    params.append('offset', offset);

    // Laitetaan sort_column ja sort_order, jos ne on annettu
    if (sort_column) {
        params.append('sort_column', sort_column);
    }
    if (sort_order) {
        // getResults.go hyväksyy vain "ASC" tai "DESC" isoilla kirjaimilla
        const upperOrder = sort_order.toUpperCase();
        if (upperOrder === 'ASC' || upperOrder === 'DESC') {
            params.append('sort_order', upperOrder);
        } else {
            // fallbackina ASC
            params.append('sort_order', 'ASC');
        }
    }

    // Lisätään loput filtterit parametreiksi
    for (const [key, val] of Object.entries(filters)) {
        if (val !== null && val !== undefined && val !== '') {
            params.append(key, val);
        }
    }

    // Rakennetaan lopullinen URL
    // console.log(`/api/get-results käynnistyy... (kutsu peräisin: ${callerName || 'tuntematon'})`);
    const url = `/api/get-results?${params.toString()}`;

    // Tehdään fetch-kutsu
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`fetchTableData: server responded with status ${response.status}`);
    }

    // Palautetaan purettu JSON
    return await response.json();
}