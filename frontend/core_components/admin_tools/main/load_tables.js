// load_tables.js

import { create_navigation_buttons } from '../../navigation/navigation.js';
import { custom_views } from '../../navigation/custom_views.js';
import { openNavTab } from '../../navigation/tabs.js';
import { count_this_function } from '../../dev_tools/function_counter.js';

/**
 * Lataa taululistan, luo navigointipainikkeet ja avaa oikean näkymän.
 * 1) Jos tullaan URL:lla /tables/{taulu}, se voittaa kaiken muun.
 * 2) Muuten katsotaan localStorage.
 * 3) Ellei kumpikaan tuota tulosta, avataan oletustaulu.
 */
export async function load_tables() {
    count_this_function("load_tables");

    try {
        // Haetaan taululista palvelimelta
        const response = await fetch("/api/tables");
        if (!response.ok) {
            console.error(
                `Error loading tables: HTTP status ${response.status}`
            );
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result_from_server = await response.json();
        const array_of_grouped_tables = result_from_server.tables; // esim. [{ table_name: 'users' }, ...]

        // Luodaan sovelluksen "näkymä"-painikkeet
        create_navigation_buttons(custom_views);

        // Koonti: kaikki taulut + custom-näkymät samaan joukkoon
        const set_of_every_table_and_view_name = new Set();
        custom_views.forEach((view) => set_of_every_table_and_view_name.add(view.name));
        array_of_grouped_tables.forEach((table) =>
            set_of_every_table_and_view_name.add(table.table_name)
        );

        /* ----------------------------------------------------------
           1) Tarkistetaan, tultiinko deep-linkillä /tables/{taulu}
        ---------------------------------------------------------- */
        let resolved_table_name = null;
        const current_pathname = window.location.pathname;
        if (current_pathname.startsWith("/tables/")) {
            resolved_table_name = current_pathname.replace("/tables/", "");
            if (resolved_table_name) {
                localStorage.setItem("selected_table", resolved_table_name);
            }
        }

        /* ----------------------------------------------------------
           2) Ellei deep-linkiä, katsotaan localStorage
        ---------------------------------------------------------- */
        if (!resolved_table_name) {
            const stored_table_name = localStorage.getItem("selected_table");
            if (
                stored_table_name &&
                set_of_every_table_and_view_name.has(stored_table_name)
            ) {
                resolved_table_name = stored_table_name;
            }
        }

        /* ----------------------------------------------------------
           3) Ellei vieläkään selvinnyt, valitaan oletustaulu
        ---------------------------------------------------------- */
        if (!resolved_table_name) {
            let default_table_name = "service_catalog";
            if (!set_of_every_table_and_view_name.has(default_table_name)) {
                // Fallback: ensimmäinen custom_view tai mitä löytyy
                default_table_name =
                    custom_views.length > 0
                        ? custom_views[0].name
                        : [...set_of_every_table_and_view_name][0];
            }
            resolved_table_name = default_table_name;
            localStorage.setItem("selected_table", resolved_table_name);
        }

        /* ----------------------------------------------------------
           Lopuksi avataan oikea välilehti
        ---------------------------------------------------------- */
        if (resolved_table_name) {
            await openNavTab(resolved_table_name);
        }
    } catch (error) {
        console.error("Error in load_tables:", error);
    }
}

// export async function load_tables() {
//     try {
//         // Haetaan palvelimelta taululista
//         const response = await fetch('/api/tables');
//         if (!response.ok) {
//             // Mikäli pyyntö ei onnistunut, heitetään virhe
//             throw new Error(`HTTP error! status: ${response.status}`);
//         }
//         // Muodostetaan JSON-olio vastauksesta
//         const result = await response.json();
//         // Talletetaan taulut taulukkoon
//         const grouped_tables = result.tables; // esim. [{ table_name: 'users' }, ...]

//         // Luodaan navigation-buttonit sovelluksen "näkymille" 🤓
//         create_navigation_buttons(custom_views);

//         // Kootaan kaikki taulujen ja näkymien nimet yhteen joukkoon
//         const all_table_names = new Set();
//         custom_views.forEach(view => all_table_names.add(view.name));
//         grouped_tables.forEach(table => {
//             all_table_names.add(table.table_name);
//         });

//         // Tarkistetaan localStoragesta, onko jokin taulu valmiiksi valittuna
//         let selected_table = localStorage.getItem('selected_table');
//         if (selected_table && all_table_names.has(selected_table)) {
//             await openNavTab(selected_table);
//         } else {
//             // Oletustaulu, jos ei ole tallennettua valintaa
//             let default_table_name = 'service_catalog';
//             if (!all_table_names.has(default_table_name)) {
//                 if (custom_views.length > 0) {
//                     default_table_name = custom_views[0].name;
//                 }
//             }
//             if (default_table_name) {
//                 localStorage.setItem('selected_table', default_table_name);
//                 await openNavTab(default_table_name);
//             }
//         }
//     } catch (error) {
//         console.error('Error loading tables:', error);
//     }
// }

