// main.js

import { initNavbar } from './main_app/navigation/navbar.js';
import { update_oids_and_table_names } from './main_app/main/update_oids_and_table_names.js';
import { load_tables } from './main_app/main/load_tables.js';
import { updateMenuLanguageDisplay } from './logical_components/lang/lang_panel.js';
import { handle_table_selected_event } from './main_app/navigation/table_selected_listener.js';

// Tarpeellisia lisäimportteja
import './logical_components/lang/lang.js';
import './logical_components/vanilla_tree/tree_call.js';
import './logical_components/table_views/table_view/table_column_resizer.js';
import './logical_components/print_svgs/logout_svg.js';
import './main_app/navigation/tabs.js';

document.addEventListener('DOMContentLoaded', () => {
  const current_path = window.location.pathname; 

  // 1. Alustetaan navbar
  initNavbar();

  // 2. Tarkistetaan, onko polku esim. "/tables/..."
  if (current_path.startsWith("/tables/")) {
    const table_name = current_path.replace("/tables/", "");
    if (table_name) {
      localStorage.setItem('selected_table', table_name);
    }
  }

  // 3. Päivitetään OID:t, ladataan taulut, ja päivitetään kielivalinta
  update_oids_and_table_names();
  load_tables();
  updateMenuLanguageDisplay();
});

// Reagoidaan “tableSelected”-eventtiin (mm. navigointia varten)
document.addEventListener('tableSelected', handle_table_selected_event);


// // navigation.js

// import { get_load_info } from './main_app/navigation/nav_utils.js';
// import { update_oids_and_table_names } from './main_app/main/update_oids_and_table_names.js';
// import { load_tables } from './main_app/main/load_tables.js';
// import { handle_table_selected_event } from './main_app/navigation/table_selected_listener.js';
// import { updateMenuLanguageDisplay } from './logical_components/lang/lang_panel.js';

// // Ladataan myös muut tarvittavat komponentit
// import './logical_components/lang/lang.js';
// import './logical_components/vanilla_tree/tree_call.js';
// import './logical_components/table_views/table_view/table_column_resizer.js';
// import './logical_components/print_svgs/logout_svg.js';
// import './main_app/navigation/navbar.js';
// import './main_app/navigation/tabs.js';

// const MAX_RECENT_TABS = 5;

// /**
//  * Tämä on entinen handle_navigation, uudella nimellä (esim. performNavigation).
//  * Täällä on kaikki välilehtien aktiivisuuden, recently viewed -listojen
//  * ja containerien piilottamis-/näyttämislogiikka.
//  */
// export async function performNavigation(data_lang_key, container_id, load_function, groupName) {
//   console.log('Navigating to:', data_lang_key);
//   console.log('Container ID:', container_id);
//   console.log('Load function:', load_function);
//   console.log('Group name:', groupName);

//   // 1) Poistetaan edelliseltä aktiiviselta nappilta .active
//   const old_active_button = document.querySelector('.general_button_nav.active');
//   if (old_active_button) {
//     const old_key = old_active_button.dataset.langKey;
//     update_recently_viewed_list(old_key);
//     old_active_button.classList.remove('active');
//   }

//   // 2) Lisätään klikatun tabin "recently viewed" -listaan
//   update_recently_viewed_list(data_lang_key);

//   // 3) Merkitään klikatusta napista .active, muilta poistetaan
//   const navigation_buttons = document.querySelectorAll('.general_button_nav');
//   navigation_buttons.forEach(button => {
//     if (button.dataset.langKey === data_lang_key) {
//       button.classList.add('active');
//     } else {
//       button.classList.remove('active');
//     }
//   });

//   // 4) Piilotetaan kaikki containerit
//   const all_containers = document.querySelectorAll('#tabs_container > .content_div');
//   all_containers.forEach(container_element => {
//     container_element.classList.add('hidden');
//   });

//   // 5) Ladataan, jos ei vielä ladattu
//   let container_element = document.getElementById(container_id);
//   if (!container_element) {
//     await load_function();
//     container_element = document.getElementById(container_id);
//   } else if (!container_element.hasChildNodes()) {
//     await load_function();
//   }
//   container_element.classList.remove('hidden');

//   // 6) Merkitään ryhmän otsikkoon .child-active
//   update_active_heading(groupName);

//   // 7) Päivitetään .recently_viewed -status
//   update_recently_viewed_status();
// }

// /**
//  * Tämä on se uusi "ylätason" funktio, joka yhdistää get_load_info + performNavigation.
//  * Kutsutaan muualta aina, kun halutaan navigoida tiettyyn tauluun/näkymään.
//  */
// export async function handle_all_navigation(name, customViews) {
//   // 1) Selvitetään, onko kyseessä custom_view vai normaali taulu
//   const { loadFunction, containerId } = get_load_info(name, customViews);

//   // 2) Etsitään halutessa groupName, jos se on relevanttia
//   //    Tässä esimerkissä käydään customViews-läpikäynti:
//   let groupName = null;
//   const foundView = customViews.find(v => v.name === name);
//   if (foundView && foundView.group) {
//     groupName = foundView.group;
//   }

//   // 3) Kutsutaan vanhaa "performNavigation" (entinen handle_navigation)
//   await performNavigation(name, containerId, loadFunction, groupName);

//   // 4) Tallennetaan localStorageen valinta
//   localStorage.setItem('selected_table', name);
// }

// /**
//  * Seuraavat funktiot ovat entisiä apufunktioita 'handle_navigation' -funktion sisältä.
//  */
// function update_recently_viewed_list(tab_key) {
//   const rv_list_str = localStorage.getItem('recently_viewed_tabs');
//   let rv_list = rv_list_str ? JSON.parse(rv_list_str) : [];

//   rv_list = rv_list.filter(key => key !== tab_key);
//   rv_list.unshift(tab_key);

//   while (rv_list.length > MAX_RECENT_TABS) {
//     rv_list.pop();
//   }
//   localStorage.setItem('recently_viewed_tabs', JSON.stringify(rv_list));
// }

// function remove_from_recently_viewed(tab_key) {
//   const rv_list_str = localStorage.getItem('recently_viewed_tabs');
//   if (!rv_list_str) return;
  
//   let rv_list = JSON.parse(rv_list_str);
//   rv_list = rv_list.filter(key => key !== tab_key);
//   localStorage.setItem('recently_viewed_tabs', JSON.stringify(rv_list));
// }

// function update_recently_viewed_status() {
//   const navigation_buttons = document.querySelectorAll('.general_button_nav');
//   const rv_list_str = localStorage.getItem('recently_viewed_tabs');

//   if (!rv_list_str) {
//     // Poistetaan kaikilta "recently_viewed" -luokka
//     navigation_buttons.forEach(button => {
//       button.classList.remove('recently_viewed');
//       button.removeAttribute('title');
//     });
//   } else {
//     const rv_list = JSON.parse(rv_list_str);
//     navigation_buttons.forEach(button => {
//       const button_key = button.dataset.langKey;
//       const is_active = button.classList.contains('active');
//       if (rv_list.includes(button_key) && !is_active) {
//         button.classList.add('recently_viewed');
//         button.setAttribute('title', 'Recently viewed (right-click to clear)');
//         button.addEventListener(
//           'contextmenu',
//           function(evt) {
//             evt.preventDefault();
//             remove_from_recently_viewed(button_key);
//             update_recently_viewed_status();
//           },
//           { once: true }
//         );
//       } else {
//         button.classList.remove('recently_viewed');
//         button.removeAttribute('title');
//       }
//     });
//   }

//   // Lisätään / poistetaan .child-rv collapsible-otsikoista
//   const groups_with_rv = new Set();
//   navigation_buttons.forEach(button => {
//     if (button.classList.contains('recently_viewed')) {
//       groups_with_rv.add(button.dataset.group);
//     }
//   });

//   const all_headings = document.querySelectorAll('.collapsible');
//   all_headings.forEach(heading => {
//     heading.classList.remove('child-rv');
//   });
//   groups_with_rv.forEach(g => {
//     const heading = document.querySelector(`.collapsible[data-group="${g}"]`);
//     if (heading && !heading.classList.contains('child-active')) {
//       heading.classList.add('child-rv');
//     }
//   });
// }

// function update_active_heading(groupName) {
//   const all_headings = document.querySelectorAll('.collapsible');
//   all_headings.forEach(heading => heading.classList.remove('child-active'));

//   const active_heading = document.querySelector(`.collapsible[data-group="${groupName}"]`);
//   if (active_heading) {
//     active_heading.classList.add('child-active');
//   }
// }

// // // main.js

// // import { update_oids_and_table_names } from './main_app/main/update_oids_and_table_names.js';
// // import { load_tables } from './main_app/main/load_tables.js';
// // import { handle_table_selected_event } from './main_app/navigation/table_selected_listener.js';
// // import { updateMenuLanguageDisplay } from './logical_components/lang/lang_panel.js';

// // // Ladataan myös muut tarvittavat komponentit
// // import './logical_components/lang/lang.js';
// // import './logical_components/vanilla_tree/tree_call.js';
// // import './logical_components/table_views/table_view/table_column_resizer.js';
// // import './logical_components/print_svgs/logout_svg.js';
// // import './main_app/navigation/navbar.js';
// // import './main_app/navigation/tabs.js';


// // document.addEventListener('DOMContentLoaded', () => {
// //     const current_path = window.location.pathname;  // esim. "/tables/tickets"

// //     if (current_path.startsWith("/tables/")) {
// //         const table_name = current_path.replace("/tables/", "");
// //         if (table_name) {
// //             localStorage.setItem('selected_table', table_name);
// //         }
// //     }

// //     update_oids_and_table_names();
// //     load_tables();
// //     updateMenuLanguageDisplay();
// // });

// // // Reagoidaan “tableSelected”-eventtiin (mm. navigointia varten)
// // document.addEventListener('tableSelected', handle_table_selected_event);

