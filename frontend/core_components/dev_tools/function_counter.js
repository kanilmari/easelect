// function_counter.js
// Yksinkertainen funktiokutsujen laskuri, joka tallettaa
// tulokset localStorageen *lasku­määrän mukaan lajiteltuna*.
//
// API:
//   count_this_function(nimi)            – inkrementoi ja tallentaa
//   get_sorted_function_counts() : []    – palauttaa [{ functionName, count }, ...]
//
//  N.B.  Tämä moduuli ei käytä värejä, koska kyse on JS-koodista.

export function count_this_function(nykyisen_funktion_nimi) {
    // 1. Lataa aiemmat laskurit (tyhjä objekti, jos puuttuu)
    const jsonMuodossaTallennetutLaskurit = localStorage.getItem('function_counts');
    const funktioidenSuorituskerrat = jsonMuodossaTallennetutLaskurit
        ? JSON.parse(jsonMuodossaTallennetutLaskurit)
        : {};

    // 2. Päivitä tämän funktion laskuri
    const nykyinenArvo = Number(funktioidenSuorituskerrat[nykyisen_funktion_nimi] || 0);
    funktioidenSuorituskerrat[nykyisen_funktion_nimi] = nykyinenArvo + 1;

    // 3. Lajittele objektin avain-arvo-parit laskevaan järjestykseen suorituskertojen mukaan
    const lajitellutParit = Object.entries(funktioidenSuorituskerrat).sort(
        ([, aLaskuri], [, bLaskuri]) => bLaskuri - aLaskuri
    );
    const lajiteltuObjekti = Object.fromEntries(lajitellutParit);

    // 4. Tallenna takaisin localStorageen jo valmiiksi lajiteltuna
    localStorage.setItem('function_counts', JSON.stringify(lajiteltuObjekti));
}

/**
 * Palauttaa localStoragessa olevan laskuridatan lajiteltuna
 * suurimmasta pienimpään.
 *
 * @returns {Array<{ functionName: string, count: number }>}
 */
export function get_sorted_function_counts() {
    const tallenne = localStorage.getItem('function_counts');
    if (!tallenne) return [];

    try {
        const obj = JSON.parse(tallenne);
        return Object.entries(obj).map(([functionName, count]) => ({
            functionName,
            count,
        }));
    } catch (err) {
        console.error('virhe: localStorage-tietojen jäsennys epäonnistui –', err);
        return [];
    }
}
