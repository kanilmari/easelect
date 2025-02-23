/**
 * app.js
 *
 * - Ladataan data (data.json) fetchillä
 * - Luodaan TableComponent dynaamisilla otsikoilla
 * - Generoidaan filtterikentät avaimien perusteella
 * - Luodaan myös näkymävalitsin (normal / transposed / ticket)
 * - Sidotaan kopiointinapit (esimerkin vuoksi index.html:ssä olevaan valikkoon)
 */

import { TableComponent } from './tableComponent.js';

console.log('app.js loaded');

fetch('./data.json')
    .then(res => res.json())
    .then((tableData) => {
        if (!tableData || !tableData.length) {
            console.error("Ei dataa tai data on tyhjä.");
            return;
        }

        // Poimitaan avaimet ensimmäisestä objektista
        const keys = Object.keys(tableData[0]);

        // Tarkistetaan, onko localStoragessa tallennettu sarakkeiden järjestys
        let headers;
        const storedColumns = localStorage.getItem('columnsOrder');
        if (storedColumns) {
            // Jos localStoragessa on jo valmiina sarakekuvaus, käytetään sitä
            // Huom. Tallennuksen yhteydessä on tallennettu { label, key } -rakenne
            headers = JSON.parse(storedColumns);
        } else {
            // Jos localStorage on tyhjä, luodaan headers dynaamisesti datan avaimista
            headers = keys.map(k => ({
                label: capitalize(k), // esim. "id" -> "Id", "nimi" -> "Nimi"
                key: k
            }));
        }

        // Luodaan taulukomponentti
        const table = new TableComponent({
            data: tableData,
            headers: headers,
            initialView: 'normal'
        });

        // Kiinnitetään se DOM:iin
        const container = document.getElementById('tableContainer');
        container.appendChild(table.getElement());

        // Generoidaan dynaamiset filtterikentät
        const controlPanel = document.getElementById('controlPanel');
        keys.forEach(k => {
            // Label
            const label = document.createElement('label');
            label.textContent = k + ': ';

            // Tekstikenttä
            const input = document.createElement('input');
            input.type = 'text';
            input.addEventListener('input', (e) => {
                table.setFilter(k, e.target.value);
            });

            controlPanel.appendChild(label);
            controlPanel.appendChild(input);
        });

        // Generoidaan näkymävalitsin
        const viewSelector = document.createElement('select');
        const options = [
            { value: 'normal', text: 'Normaali' },
            { value: 'transposed', text: 'Vertailu (transposed)' },
            { value: 'ticket', text: 'Tiketti' }
        ];
        options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.text;
            viewSelector.appendChild(opt);
        });
        viewSelector.addEventListener('change', (e) => {
            table.setView(e.target.value);
        });
        controlPanel.appendChild(viewSelector);

        // Kopiointinapit (esimerkin vuoksi sidottu suoraan index.html:ssä olevaan valikkoon)
        document.getElementById('copyHeaders').addEventListener('click', () => {
            table.copySelected(true);
        });
        document.getElementById('copyCellsOnly').addEventListener('click', () => {
            table.copySelected(false);
        });
    })
    .catch(err => {
        console.error("Dataa ei voitu ladata:", err);
    });


/** Apufunktio: iso alkukirjain */
function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}