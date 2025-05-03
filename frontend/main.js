// main.js
import { translatePage } from "./core_components/lang/lang.js";
import {
    setAuthModes,
    checkAdminMode,
} from "./core_components/admin_tools/auth_modes.js";
import { initAuthSvg } from "./core_components/auth/auth_svg.js";
import { initNavbar } from "./core_components/navigation/navbar.js";
import { update_oids_and_table_names } from "./core_components/admin_tools/main/update_oids_and_table_names.js";
import { load_tables } from "./core_components/admin_tools/main/load_tables.js";
import { updateMenuLanguageDisplay } from "./core_components/lang/lang_panel.js";
import { handle_table_selected_event } from "./core_components/navigation/navigation.js";
import { initializeTreeCallAdmin } from "./common_components/vanilla_tree/van_tr_components/tree_call_admin.js";

import "./core_components/table_views/table_view/table_column_resizer.js";
import "./core_components/theme.js";
import "./core_components/show_errors.js";
import "./core_components/dev_tools/print_session_details.js";
import "./core_components/navigation/tabs.js";

document.addEventListener("DOMContentLoaded", async () => {
    // Haetaan login- ja admin-tilat
    try {
        await setAuthModes(); // Odotetaan async-haun valmistumista

        const adminMode = checkAdminMode();
        if (adminMode) {
            console.log("Admin-tila päällä, suoritetaan admin-funktioita ☺");
            update_oids_and_table_names();
            load_tables();
            await initializeTreeCallAdmin();
        } else {
            console.log("Ei admin-tilassa, skipataan admin-funktiot ☺");
        }
    } catch (err) {
        console.error(err);
        console.log("Ei admin-tilassa, skipataan admin-funktiot ☺");
    }

    // Tässä kohtaa on jo tieto siitä, tarvitaanko login- vai logout-nappi,
    // joten kutsutaan vasta nyt SVG-init-funktiota:
    console.log("calling initAuthSvg()");
    initAuthSvg();

    const chosen_language =
        localStorage.getItem("chosen_language") ||
        (navigator.language || "en").substring(0, 2);
    console.log("Translating page, chosen_language:", chosen_language);
    await translatePage(chosen_language);

    // Alustetaan navbar
    initNavbar();

    // Tarkistetaan polku
    const current_path = window.location.pathname;
    if (current_path.startsWith("/tables/")) {
        const table_name = current_path.replace("/tables/", "");
        if (table_name) {
            localStorage.setItem("selected_table", table_name);
        }
    }

    updateMenuLanguageDisplay();
});

// Reagoidaan “tableSelected”-eventtiin
document.addEventListener("tableSelected", handle_table_selected_event);



// // main.js
// import { translatePage } from "./core_components/lang/lang.js";
// import { setAuthModes, checkAdminMode } from "./core_components/admin_tools/admin_mode.js";
// import { initNavbar } from "./core_components/navigation/navbar.js";
// import { update_oids_and_table_names } from "./core_components/admin_tools/main/update_oids_and_table_names.js";
// import { load_tables } from "./core_components/admin_tools/main/load_tables.js";
// import { updateMenuLanguageDisplay } from "./core_components/lang/lang_panel.js";
// import { handle_table_selected_event } from "./core_components/navigation/navigation.js";
// import { initializeTreeCallAdmin } from "./common_components/vanilla_tree/tree_call_admin.js";

// import "./core_components/auth/auth_svg.js";
// import "./core_components/table_views/table_view/table_column_resizer.js";
// import "./core_components/navigation/tabs.js";
// import "./core_components/theme.js";
// import "./core_components/show_errors.js";
// import "./core_components/dev_tools/print_session_details.js";

// document.addEventListener("DOMContentLoaded", async () => {
//     // Haetaan login- ja admin-tilat
//     try {
//         await setAuthModes();  // Odotetaan async-haun valmistumista
//         const adminMode = checkAdminMode();
//         if (adminMode) {
//             console.log("Admin-tila päällä, suoritetaan admin-funktioita ☺");
//             update_oids_and_table_names();
//             load_tables();

//             // Tässä kutsutaan vasta treeCallAdminin alustajaa
//             await initializeTreeCallAdmin();
//         } else {
//             console.log("Ei admin-tilassa, skipataan admin-funktiot ☺");
//         }
//     } catch (error) {
//         console.error(error);
//         console.log("Ei admin-tilassa, skipataan admin-funktiot ☺");
//     }

//     // Ladataan kieli ennen muuta:
//     const chosen_language = localStorage.getItem("chosen_language") || "en";
//     await translatePage(chosen_language);

//     // Alustetaan navbar
//     initNavbar();

//     // Tarkistetaan polku
//     const current_path = window.location.pathname;
//     if (current_path.startsWith("/tables/")) {
//         const table_name = current_path.replace("/tables/", "");
//         if (table_name) {
//             localStorage.setItem("selected_table", table_name);
//         }
//     }

//     updateMenuLanguageDisplay();
// });

// // Reagoidaan “tableSelected”-eventtiin
// document.addEventListener("tableSelected", handle_table_selected_event);
