// view_table.js

import { create_table_element } from './table_view/create_table_structure_and_data.js';
import { create_card_view } from './card_view/card_view.js';
import { applySavedColumnVisibility } from '../../main_app/gt_toolbar/column_visibility_dropdown.js';
import { initializeInfiniteScroll, resetOffset, updateOffset } from '../infinite_scroll/infinite_scroll.js';
// import { createToolbar } from '../../main_app/create_toolbar.js';
import { create_filter_bar } from '../../main_app/filterbar/create_filter_bar.js';
import { create_chat_ui } from '../ai_features/table_chat/chat.js';
import { create_tree_view } from './tree_view/tree_view.js';

export async function generate_table(table_name, columns, data, data_types) {
    try {
        // 1. Varmistus
        if (!Array.isArray(data)) {
            data = [];
        }
        if (data.length === 0) {
            console.info(`Taulu ${table_name} on tyhjä tai data[] puuttuu.`);
        }

        // 2. Haetaan / luodaan container
        let main_table_container = document.getElementById(`${table_name}_container`);
        if (!main_table_container) {
            main_table_container = document.createElement('div');
            main_table_container.id = `${table_name}_container`;
            main_table_container.classList.add('content_div');
            document.getElementById('tabs_container').appendChild(main_table_container);
        }

        // 3. Taulukomponentit
        let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
        if (!table_parts_container) {
            table_parts_container = document.createElement('div');
            table_parts_container.id = `${table_name}_table_parts_container`;
            table_parts_container.classList.add('table_parts_container');
            main_table_container.appendChild(table_parts_container);
        }

        // 4. Haetaan nykyinen näkymä localStoragesta; oletus 'card'
        const current_view = localStorage.getItem(`${table_name}_view`) || 'card';
        table_parts_container.setAttribute('data-view', current_view);

        // 5. Luo/päivitä toolbar
        // createToolbar(table_name, current_view);

        // 6. Tallennetaan saraketiedot
        localStorage.setItem(`${table_name}_columns`, JSON.stringify(columns));

        // 7. Nollataan offset
        resetOffset();

        // 8. Luodaan (tai haetaan) table-, card- ja tree-view-divit
        let table_view_div = document.getElementById(`${table_name}_table_view_container`);
        if (!table_view_div) {
            table_view_div = document.createElement('div');
            table_view_div.id = `${table_name}_table_view_container`;
            table_view_div.classList.add('scrollable_content');
            table_parts_container.appendChild(table_view_div);
        }
        let card_view_div = document.getElementById(`${table_name}_card_view_container`);
        if (!card_view_div) {
            card_view_div = document.createElement('div');
            card_view_div.id = `${table_name}_card_view_container`;
            card_view_div.classList.add('scrollable_content');
            table_parts_container.appendChild(card_view_div);
        }
        // UUSI: tree_view_div
        let tree_view_div = document.getElementById(`${table_name}_tree_view_container`);
        if (!tree_view_div) {
            tree_view_div = document.createElement('div');
            tree_view_div.id = `${table_name}_tree_view_container`;
            // Sovitaan, että laitetaan myös scrollable_content-luokka
            tree_view_div.classList.add('scrollable_content');
            tree_view_div.style.padding = '6px';
            table_parts_container.appendChild(tree_view_div);
        }

        // 9. Tyhjennetään 
        table_view_div.innerHTML = '';
        card_view_div.innerHTML = '';
        tree_view_div.innerHTML = '';

        // 9.1 Taulunäkymä
        const new_table_element = create_table_element(columns, data, table_name, data_types);
        table_view_div.appendChild(new_table_element);
        applySavedColumnVisibility(new_table_element);

        // 9.2 Korttinäkymä
        const new_card_container = await create_card_view(columns, data, table_name);
        card_view_div.appendChild(new_card_container);

        // 9.3 Puunäkymä
        // Kutsutaan uutta create_tree_view-funktiota:
        await create_tree_view(table_name, columns, data);

        // 10. Näytetään/ piilotetaan sen mukaan, mikä current_view
        if (current_view === 'table') {
            table_view_div.style.display = 'block';
            card_view_div.style.display = 'none';
            tree_view_div.style.display = 'none';
        } else if (current_view === 'card') {
            table_view_div.style.display = 'none';
            card_view_div.style.display = 'block';
            tree_view_div.style.display = 'none';
        } else if (current_view === 'tree') {
            table_view_div.style.display = 'none';
            card_view_div.style.display = 'none';
            tree_view_div.style.display = 'block';
        }

        // 11. offset
        updateOffset(data.length);

        // 12. Filtteripalkki
        create_filter_bar(table_name, columns, data_types);
        // create_filter_bar_window(table_name, columns, data_types);
        // const table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
        create_chat_ui(table_name, table_parts_container);

        // 13. infinite scroll vain table- ja card-näkymille:
        // (jos et halua tree-näkymään, jätä pois)
        if (current_view === 'table' || current_view === 'card') {
            initializeInfiniteScroll(table_name);
        }

    } catch (error) {
        console.error(`error creating table ${table_name}:`, error);
    }
}
