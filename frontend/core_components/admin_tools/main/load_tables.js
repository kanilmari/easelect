// load_tables.js

import { create_navigation_buttons } from '../../navigation/navigation.js';
import { custom_views } from '../../navigation/custom_views.js';
import { openNavTab } from '../../navigation/tabs.js';

export async function load_tables() {
    try {
        // Haetaan palvelimelta taululista
        const response = await fetch('/api/tables');
        if (!response.ok) {
            // Mikäli pyyntö ei onnistunut, heitetään virhe
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        // Muodostetaan JSON-olio vastauksesta
        const result = await response.json();
        // Talletetaan taulut taulukkoon
        const grouped_tables = result.tables; // esim. [{ table_name: 'users' }, ...]

        // Luodaan navigation-buttonit sovelluksen "näkymille" 🤓
        create_navigation_buttons(custom_views);

        // Kootaan kaikki taulujen ja näkymien nimet yhteen joukkoon
        const all_table_names = new Set();
        custom_views.forEach(view => all_table_names.add(view.name));
        grouped_tables.forEach(table => {
            all_table_names.add(table.table_name);
        });

        // Tarkistetaan localStoragesta, onko jokin taulu valmiiksi valittuna
        let selected_table = localStorage.getItem('selected_table');
        if (selected_table && all_table_names.has(selected_table)) {
            await openNavTab(selected_table);
        } else {
            // Oletustaulu, jos ei ole tallennettua valintaa
            let default_table_name = 'service_catalog';
            if (!all_table_names.has(default_table_name)) {
                if (custom_views.length > 0) {
                    default_table_name = custom_views[0].name;
                }
            }
            if (default_table_name) {
                localStorage.setItem('selected_table', default_table_name);
                await openNavTab(default_table_name);
            }
        }
    } catch (error) {
        console.error('Error loading tables:', error);
    }
}

