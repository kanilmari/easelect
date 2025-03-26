// view_table.js

import { create_table_element } from './table_view/create_table_structure_and_data.js';
import { create_card_view } from './card_view/card_view.js';
import { applySavedColumnVisibility } from '../general_tables/gt_toolbar/column_visibility_dropdown.js';
import { initializeInfiniteScroll, updateOffset } from '../infinite_scroll/infinite_scroll.js';
import { create_filter_bar } from '../filterbar/create_filter_bar.js';
import { create_chat_ui } from '../../common_components/ai_features/table_chat/chat.js';
import { create_tree_view } from './tree_view/tree_view.js';
import { TableComponent } from './tableComponent.js';
import { applyViewStyling } from './draw_view_selector_buttons.js';

// Määritellään näkymät objektina
const views = {
    table: {
        create: (table_name, columns, data, data_types) => {
            const tableElement = create_table_element(columns, data, table_name, data_types);
            applySavedColumnVisibility(tableElement);
            return tableElement;
        },
        getContainerId: (table_name) => `${table_name}_table_view_container`
    },
    card: {
        create: async (table_name, columns, data, data_types) => {
            //   console.log('view_table.js: card create kutsuu create_card_view');
            return await create_card_view(columns, data, table_name);
            // HUOM: yllä oleva funktio ei (vielä) ota data_types-argumenttia vastaan,
            // koska create_card_view lukee sen localStoragesta.
        },
        getContainerId: (table_name) => `${table_name}_card_view_container`
    },
    tree: {
        create: async (table_name, columns, data) => {
            //   console.log('view_table.js: tree create kutsuu create_tree_view');
            return await create_tree_view(table_name, columns, data);
        },
        getContainerId: (table_name) => `${table_name}_tree_view_container`
    },
    normal: {
        create: (table_name, columns, data) => {
            const headers = columns.map(c => ({ label: c, key: c }));
            const tableComp = new TableComponent({ data, headers, initialView: 'normal' });
            return tableComp.getElement();
        },
        getContainerId: (table_name) => `${table_name}_normal_view_container`
    },
    transposed: {
        create: (table_name, columns, data) => {
            const headers = columns.map(c => ({ label: c, key: c }));
            const tableComp = new TableComponent({ data, headers, initialView: 'transposed' });
            return tableComp.getElement();
        },
        getContainerId: (table_name) => `${table_name}_transposed_view_container`
    },
    ticket: {
        create: (table_name, columns, data) => {
            const headers = columns.map(c => ({ label: c, key: c }));
            const tableComp = new TableComponent({ data, headers, initialView: 'ticket' });
            return tableComp.getElement();
        },
        getContainerId: (table_name) => `${table_name}_ticket_view_container`
    }
};




export async function generate_table(table_name, columns, data, data_types) {
    try {
        // 1. Lue table_specs LocalStoragesta
        const tableSpecs = JSON.parse(localStorage.getItem('table_specs')) || {};

        // 2. Onko käyttäjän aiemmin valitsema näkymä tallennettu?
        let current_view = localStorage.getItem(`${table_name}_view`);

        // 3. Jos ei löytynyt, tarkistetaan default_view_name
        if (!current_view) {
            const default_view_name = tableSpecs[table_name]?.default_view_name;
            if (default_view_name) {
                current_view = default_view_name;
            } else {
                current_view = 'card';
            }
            localStorage.setItem(`${table_name}_view`, current_view);
        }

        // ⬇ Kutsutaan applyViewStyling, joka käyttää localStorage.getItem('selected_table') -arvoa
        applyViewStyling(table_name);

        // 4. Haetaan tai luodaan kontainerit jne.
        const main_table_container_id = `${table_name}_container`;
        let main_table_container = document.getElementById(main_table_container_id);
        if (!main_table_container) {
            main_table_container = document.createElement('div');
            main_table_container.id = main_table_container_id;
            main_table_container.classList.add('content_div');
            document.getElementById('tabs_container').appendChild(main_table_container);
        }

        let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
        if (!table_parts_container) {
            table_parts_container = document.createElement('div');
            table_parts_container.id = `${table_name}_table_parts_container`;
            table_parts_container.classList.add('table_parts_container');
            main_table_container.appendChild(table_parts_container);
        }

        table_parts_container.setAttribute('data-view', current_view);

        // 5. Tallennetaan sarakkeet localStorageen
        localStorage.setItem(`${table_name}_columns`, JSON.stringify(columns));
        localStorage.setItem(`${table_name}_dataTypes`, JSON.stringify(data_types));

        // 7. Luodaan tai haetaan näkymäcontainerit dynaamisesti
        const viewContainers = {};
        for (const viewType in views) {
            const containerId = views[viewType].getContainerId(table_name);
            let container = document.getElementById(containerId);
            if (!container) {
                container = document.createElement('div');
                container.id = containerId;
                container.classList.add('scrollable_content');
                if (viewType === 'tree') {
                    container.style.padding = '6px';
                }
                table_parts_container.appendChild(container);
            }
            viewContainers[viewType] = container;
        }

        // 8. Tyhjennetään kaikki näkymäcontainerit
        for (const container of Object.values(viewContainers)) {
            container.replaceChildren();
        }

        // 9. Luodaan ja näytetään haluttu näkymä
        if (views[current_view]) {
            const viewElement = await views[current_view].create(table_name, columns, data, data_types);
            viewContainers[current_view].appendChild(viewElement);
            viewContainers[current_view].style.display = 'block';
        } else {
            console.warn(`Tuntematon näkymä: ${current_view}`);
        }

        // 10. Piilotetaan muut näkymät
        for (const viewType in viewContainers) {
            if (viewType !== current_view) {
                viewContainers[viewType].style.display = 'none';
            }
        }

        // 12. Luodaan suodatuspalkki
        create_filter_bar(table_name, columns, data_types);

        // 13. Luodaan chat UI
        create_chat_ui(table_name, table_parts_container);

        // 14. Alustetaan infinite scroll
        if (current_view === 'transposed') {
            initializeInfiniteScroll(table_name, 'horizontal');
        } else {
            initializeInfiniteScroll(table_name, 'vertical');
        }

    } catch (error) {
        console.error(`virhe luotaessa taulua ${table_name}:`, error);
    }
}

// /**
//  * Rakentaa ja näyttää halutun näkymän (esim. 'table', 'card', 'normal', 'tree'...)
//  * @param {string} table_name   - Taulun/tablen nimi
//  * @param {Array}  columns      - Sarakeotsikot
//  * @param {Array}  data         - Rivit
//  * @param {Object} data_types   - Avain-arvo, jossa esim. { sarake: "integer" }
//  */
// export async function generate_table(table_name, columns, data, data_types) {
//     try {
//         // 1. Lue table_specs LocalStoragesta
//         const tableSpecs = JSON.parse(localStorage.getItem('table_specs')) || {};

//         // 2. Onko käyttäjän aiemmin valitsema näkymä tallennettu?
//         let current_view = localStorage.getItem(`${table_name}_view`);

//         // 3. Jos ei löytynyt, tarkistetaan default_view_name
//         if (!current_view) {
//             const default_view_name = tableSpecs[table_name]?.default_view_name;
//             if (default_view_name) {
//                 // Käytetään suoraan palvelimelta saatua oletusnäkymän nimeä
//                 current_view = default_view_name;
//             } else {
//                 // Jos ei ole default_view_name-arvoa, käytetään perusnäkymää
//                 current_view = 'table';
//             }
//             // Tallennetaan localStorageen, jotta käyttäjän päivitys ei muuta tätä
//             localStorage.setItem(`${table_name}_view`, current_view);
//         }

//         // 4. Loppu on samaa koodia – asetetaan container jne.
//         const main_table_container_id = `${table_name}_container`;
//         let main_table_container = document.getElementById(main_table_container_id);
//         if (!main_table_container) {
//             main_table_container = document.createElement('div');
//             main_table_container.id = main_table_container_id;
//             main_table_container.classList.add('content_div');
//             document.getElementById('tabs_container').appendChild(main_table_container);
//         }

//         let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
//         if (!table_parts_container) {
//             table_parts_container = document.createElement('div');
//             table_parts_container.id = `${table_name}_table_parts_container`;
//             table_parts_container.classList.add('table_parts_container');
//             main_table_container.appendChild(table_parts_container);
//         }

//         table_parts_container.setAttribute('data-view', current_view);

//         // 5. Tallennetaan sarakkeet localStorageen
//         localStorage.setItem(`${table_name}_columns`, JSON.stringify(columns));
//         localStorage.setItem(`${table_name}_dataTypes`, JSON.stringify(data_types));

//         // 6. (Poistettu resetOffset) — hoidetaan offset vain refreshTableUnified-funktiossa

//         // 7. Luodaan tai haetaan näkymäcontainerit dynaamisesti
//         const viewContainers = {};
//         for (const viewType in views) {
//             const containerId = views[viewType].getContainerId(table_name);
//             let container = document.getElementById(containerId);
//             if (!container) {
//                 container = document.createElement('div');
//                 container.id = containerId;
//                 container.classList.add('scrollable_content');
//                 if (viewType === 'tree') {
//                     container.style.padding = '6px';
//                 }
//                 table_parts_container.appendChild(container);
//             }
//             viewContainers[viewType] = container;
//         }

//         // 8. Tyhjennetään kaikki näkymäcontainerit
//         for (const container of Object.values(viewContainers)) {
//             const removedLength = container.innerHTML.length;
//             // if (removedLength > 0) {
//             //   console.log(`view_table.js: poistettiin entistä HTML-sisältöä pituudelta: ${removedLength}`);
//             // }
//             container.replaceChildren();
//         }

//         // 9. Luodaan ja näytetään haluttu näkymä
//         if (views[current_view]) {
//             // console.log(`view_table.js: generate_table kutsuu näkymän create-funktion: ${current_view}`);
//             const viewElement = await views[current_view].create(table_name, columns, data, data_types);
//             viewContainers[current_view].appendChild(viewElement);
//             viewContainers[current_view].style.display = 'block';
//         } else {
//             console.warn(`Tuntematon näkymä: ${current_view}`);
//         }

//         // 10. Piilotetaan muut näkymät
//         for (const viewType in viewContainers) {
//             if (viewType !== current_view) {
//                 viewContainers[viewType].style.display = 'none';
//             }
//         }

//         // 12. Luodaan suodatuspalkki
//         //   console.log('view_table.js: generate_table kutsuu create_filter_bar');
//         create_filter_bar(table_name, columns, data_types);

//         // 13. Luodaan chat UI
//         create_chat_ui(table_name, table_parts_container);

//         // 14. Alustetaan infinite scroll
//         //   console.log('view_table.js: generate_table kutsuu initializeInfiniteScroll');
//         if (current_view === 'transposed') {
//             initializeInfiniteScroll(table_name, 'horizontal');
//         } else {
//             initializeInfiniteScroll(table_name, 'vertical');
//         }

//     } catch (error) {
//         console.error(`Virhe luotaessa taulua ${table_name}:`, error);
//     }
// }