// main.js
import { translatePage } from "./core_components/lang/lang.js";
import { setAdminMode, checkAdminMode } from "./core_components/admin_tools/admin_mode.js";
import { initNavbar } from "./core_components/navigation/navbar.js";
import { update_oids_and_table_names } from "./core_components/admin_tools/main/update_oids_and_table_names.js";
import { load_tables } from "./core_components/admin_tools/main/load_tables.js";
import { updateMenuLanguageDisplay } from "./core_components/lang/lang_panel.js";
import { handle_table_selected_event } from "./core_components/navigation/navigation.js";
import { initializeTreeCallAdmin } from "./common_components/vanilla_tree/tree_call_admin.js";

import "./common_components/print_svgs/logout_svg.js";
import "./core_components/table_views/table_view/table_column_resizer.js";
import "./core_components/navigation/tabs.js";
import "./core_components/theme.js";
import "./core_components/show_errors.js";
import "./core_components/dev_tools/print_session_details.js";

document.addEventListener("DOMContentLoaded", async () => {

    // 0. Ladataan kieli ennen kaikkea muuta:
    // (Oletus 'en' tai mistä nyt tahansa haluat valitun kielen hakea)
    const chosen_language = localStorage.getItem("chosen_language") || "en";
    await translatePage(chosen_language);

    // 1. Alustetaan navbar
    initNavbar();

    // 2. Tarkistetaan polku
    const current_path = window.location.pathname;
    if (current_path.startsWith("/tables/")) {
        const table_name = current_path.replace("/tables/", "");
        if (table_name) {
            localStorage.setItem("selected_table", table_name);
        }
    }

    // 3. Haetaan admin-tila
    try {
        await setAdminMode();  // Odotetaan async-haun valmistumista
        const adminMode = checkAdminMode();
        if (adminMode) {
            console.log("Admin-tila päällä, suoritetaan admin-funktioita ☺");
            update_oids_and_table_names();
            load_tables();

            // Tässä kutsutaan vasta treeCallAdminin alustajaa
            await initializeTreeCallAdmin();
        } else {
            console.log("Ei admin-tilassa, skipataan admin-funktiot ☺");
        }
    } catch (error) {
        console.error(error);
        console.log("Ei admin-tilassa, skipataan admin-funktiot ☺");
    }

    updateMenuLanguageDisplay();
});

// Reagoidaan “tableSelected”-eventtiin
document.addEventListener("tableSelected", handle_table_selected_event);

// // main.js
// import "./core_components/lang/lang.js";
// import { setAdminMode, checkAdminMode } from "./core_components/admin_tools/admin_mode.js";
// import { initNavbar } from "./core_components/navigation/navbar.js";
// import { update_oids_and_table_names } from "./core_components/admin_tools/main/update_oids_and_table_names.js";
// import { load_tables } from "./core_components/admin_tools/main/load_tables.js";
// import { updateMenuLanguageDisplay } from "./core_components/lang/lang_panel.js";
// import { handle_table_selected_event } from "./core_components/navigation/navigation.js";

// // HUOM! Nyt tree_call_admin.js ei lataudu automaattisesti
// import { initializeTreeCallAdmin } from "./common_components/vanilla_tree/tree_call_admin.js";

// import "./common_components/print_svgs/logout_svg.js";
// import "./core_components/lang/lang.js";
// import "./core_components/table_views/table_view/table_column_resizer.js";
// import "./core_components/navigation/tabs.js";
// import "./core_components/theme.js";
// import "./core_components/show_errors.js";

// document.addEventListener("DOMContentLoaded", async () => {
//     // 1. Alustetaan navbar
//     initNavbar();

//     // 2. Tarkistetaan polku
//     const current_path = window.location.pathname;
//     if (current_path.startsWith("/tables/")) {
//         const table_name = current_path.replace("/tables/", "");
//         if (table_name) {
//             localStorage.setItem("selected_table", table_name);
//         }
//     }

//     // 3. Haetaan admin-tila
//     try {
//         await setAdminMode();  // Odotetaan async-haun valmistumista
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

//     updateMenuLanguageDisplay();
// });

// // Reagoidaan “tableSelected”-eventtiin
// document.addEventListener("tableSelected", handle_table_selected_event);


// // // main.js
// // import "./core_components/admin_tools/admin_mode.js";
// // import { initNavbar } from "./core_components/navigation/navbar.js";
// // import { update_oids_and_table_names } from "./core_components/admin_tools/main/update_oids_and_table_names.js";
// // import { load_tables } from "./core_components/admin_tools/main/load_tables.js";
// // import { updateMenuLanguageDisplay } from "./core_components/lang/lang_panel.js";
// // import { handle_table_selected_event } from "./core_components/navigation/navigation.js";

// // // Tarpeellisia lisäimportteja
// // import "./common_components/print_svgs/logout_svg.js";
// // import "./core_components/lang/lang.js";
// // import "./common_components/vanilla_tree/tree_call_admin.js";
// // import "./core_components/table_views/table_view/table_column_resizer.js";
// // import "./core_components/navigation/tabs.js";
// // import "./core_components/theme.js";

// // document.addEventListener("DOMContentLoaded", () => {
// //     const current_path = window.location.pathname;

// //     // 1. Alustetaan navbar
// //     initNavbar();

// //     // 2. Tarkistetaan, onko polku esim. "/tables/..."
// //     if (current_path.startsWith("/tables/")) {
// //         const table_name = current_path.replace("/tables/", "");
// //         if (table_name) {
// //             localStorage.setItem("selected_table", table_name);
// //         }
// //     }

// //     // 3. Luetaan admin-tila localStoragesta
// //     const adminMode = localStorage.getItem("admin_mode") === "true";

// //     if (adminMode) {
// //         console.log("Admin-tila päällä, suoritetaan admin-funktioita ☺");
// //         // Adminille tarkoitetut kutsut:
// //         update_oids_and_table_names();
// //         load_tables();
// //     } else {
// //         console.log("Ei admin-tilassa, skipataan admin-funktiot");
// //         // Mahdolliset tavallisen käyttäjän puolen funktiot...
// //     }

// //     updateMenuLanguageDisplay();
// // });

// // // Reagoidaan “tableSelected”-eventtiin (mm. navigointia varten)
// // document.addEventListener("tableSelected", handle_table_selected_event);
