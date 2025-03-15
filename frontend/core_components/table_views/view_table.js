// view_table.js
import { create_table_element } from './table_view/create_table_structure_and_data.js';
import { create_card_view } from './card_view/card_view.js';
import { applySavedColumnVisibility } from '../general_tables/gt_toolbar/column_visibility_dropdown.js';
import { initializeInfiniteScroll, resetOffset, updateOffset } from '../infinite_scroll/infinite_scroll.js';
import { create_filter_bar } from '../filterbar/create_filter_bar.js';
import { create_chat_ui } from '../../common_components/ai_features/table_chat/chat.js';
import { create_tree_view } from './tree_view/tree_view.js';
import { TableComponent } from './tableComponent.js';

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
        create: async (table_name, columns, data) => await create_card_view(columns, data, table_name),
        getContainerId: (table_name) => `${table_name}_card_view_container`
    },
    tree: {
        create: async (table_name, columns, data) => await create_tree_view(table_name, columns, data),
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
        // 1. Tarkistetaan data
        if (!Array.isArray(data)) {
            data = [];
        }
        if (data.length === 0) {
            console.info(`Taulu ${table_name} on tyhjä tai data[] puuttuu.`);
        }

        // 2. Luodaan pääcontainer, jos sitä ei ole
        let main_table_container = document.getElementById(`${table_name}_container`);
        if (!main_table_container) {
            main_table_container = document.createElement('div');
            main_table_container.id = `${table_name}_container`;
            main_table_container.classList.add('content_div');
            document.getElementById('tabs_container').appendChild(main_table_container);
        }

        // 3. Luodaan table_parts_container, jos sitä ei ole
        let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
        if (!table_parts_container) {
            table_parts_container = document.createElement('div');
            table_parts_container.id = `${table_name}_table_parts_container`;
            table_parts_container.classList.add('table_parts_container');
            main_table_container.appendChild(table_parts_container);
        }

        // 4. Haetaan nykyinen näkymä
        const current_view = localStorage.getItem(`${table_name}_view`) || 'card';
        table_parts_container.setAttribute('data-view', current_view);

        // 5. Tallennetaan sarakkeet localStorageen
        localStorage.setItem(`${table_name}_columns`, JSON.stringify(columns));

        // 6. Nollataan offset
        resetOffset();

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
            container.innerHTML = '';
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

        // 11. Päivitetään offset
        updateOffset(data.length);

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
        console.error(`Virhe luotaessa taulua ${table_name}:`, error);
    }
}