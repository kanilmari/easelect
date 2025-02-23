// view_table.js
import { create_table_element } from './table_view/create_table_structure_and_data.js';
import { create_card_view } from './card_view/card_view.js';
import { applySavedColumnVisibility } from '../../main_app/gt_toolbar/column_visibility_dropdown.js';
import { initializeInfiniteScroll, resetOffset, updateOffset } from '../infinite_scroll/infinite_scroll.js';
import { create_filter_bar } from '../../main_app/filterbar/create_filter_bar.js';
import { create_chat_ui } from '../ai_features/table_chat/chat.js';
import { create_tree_view } from './tree_view/tree_view.js';
import { TableComponent } from './tableComponent.js';
// HUOM: polku voi olla mikä tahansa, kunhan viet funktiot sinne, missä ne on tallennettu.

export async function generate_table(table_name, columns, data, data_types) {
    try {
        // 1. Tarkistukset
        if (!Array.isArray(data)) {
            data = [];
        }
        if (data.length === 0) {
            console.info(`Taulu ${table_name} on tyhjä tai data[] puuttuu.`);
        }

        // 2. container .content_div
        let main_table_container = document.getElementById(`${table_name}_container`);
        if (!main_table_container) {
            main_table_container = document.createElement('div');
            main_table_container.id = `${table_name}_container`;
            main_table_container.classList.add('content_div');
            document.getElementById('tabs_container').appendChild(main_table_container);
        }

        // 3. table_parts_container
        let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
        if (!table_parts_container) {
            table_parts_container = document.createElement('div');
            table_parts_container.id = `${table_name}_table_parts_container`;
            table_parts_container.classList.add('table_parts_container');
            main_table_container.appendChild(table_parts_container);
        }

        // 4. Minkä näkymän halutaan?
        const current_view = localStorage.getItem(`${table_name}_view`) || 'card';
        table_parts_container.setAttribute('data-view', current_view);

        // 5. Tallennetaan sarakeinfo
        localStorage.setItem(`${table_name}_columns`, JSON.stringify(columns));

        // 6. Nollataan offset
        resetOffset();

        // 7. Luodaan (tai haetaan) elementit
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
        let tree_view_div = document.getElementById(`${table_name}_tree_view_container`);
        if (!tree_view_div) {
            tree_view_div = document.createElement('div');
            tree_view_div.id = `${table_name}_tree_view_container`;
            tree_view_div.classList.add('scrollable_content');
            tree_view_div.style.padding = '6px';
            table_parts_container.appendChild(tree_view_div);
        }

        // LISÄTÄÄN UUSIA DIV-ELEMENTTEJÄ TAI KÄYTETÄÄN JO OLEMASSA OLEVIA?
        // Voit halutessasi luoda erilliset "normal_view_div", "transposed_view_div", "ticket_view_div".
        // TAI voit käyttää esim. table_view_div "normal" / "transposed" / "ticket" -näkymään.
        // Tässä esimerkissä käytetään *samaa* table_view_div:ia "normal", "transposed" ja "ticket" -näkymille.

        // 8. Tyhjennetään
        table_view_div.innerHTML = '';
        card_view_div.innerHTML = '';
        tree_view_div.innerHTML = '';

        // 9. Rakennetaan data DOM:iin
        //  - Jos current_view on 'table', piirretään entinen create_table_element
        //  - Jos 'card', create_card_view
        //  - Jos 'tree', create_tree_view
        //  - Jos 'normal', generateNormalTable jne.

        if (current_view === 'table') {
            // Taulunäkymä
            const new_table_element = create_table_element(columns, data, table_name, data_types);
            table_view_div.appendChild(new_table_element);
            applySavedColumnVisibility(new_table_element);

            // Näytetään table_view_div, piilotetaan muut
            table_view_div.style.display = 'block';
            card_view_div.style.display = 'none';
            tree_view_div.style.display = 'none';

        } else if (current_view === 'card') {
            // Korttinäkymä
            const new_card_container = await create_card_view(columns, data, table_name);
            card_view_div.appendChild(new_card_container);

            card_view_div.style.display = 'block';
            table_view_div.style.display = 'none';
            tree_view_div.style.display = 'none';

        } else if (current_view === 'tree') {
            // Puunäkymä
            await create_tree_view(table_name, columns, data);

            tree_view_div.style.display = 'block';
            table_view_div.style.display = 'none';
            card_view_div.style.display = 'none';

        } else if (current_view === 'normal'
            || current_view === 'transposed'
            || current_view === 'ticket') {
            // Nyt sen sijaan, että kutsuisimme suoraan
            // generateNormalTable / generateTransposedTable / generateTicketView,
            // luomme TableComponentin, joka sisäisesti hoitaa
            // kyseisen näkymän valinnan.

            const headers = columns.map(c => ({ label: c, key: c }));
            const tableComp = new TableComponent({
                data,
                headers,
                initialView: current_view  // "normal", "transposed", tai "ticket"
            });

            table_view_div.appendChild(tableComp.getElement());

            table_view_div.style.display = 'block';
            card_view_div.style.display = 'none';
            tree_view_div.style.display = 'none';

        } else {
            console.warn(`Tuntematon näkymä: ${current_view}`);
            // esim. fallback table
        }

        // 10. offset
        updateOffset(data.length);

        // 11. Kutsutaan filter_bar (luo suodatuspalkin + chat-napin ym.)
        create_filter_bar(table_name, columns, data_types);

        // 12. Chat UI
        create_chat_ui(table_name, table_parts_container);

        // 13. infinite scroll vain tietyille
        // if (
        //     current_view === 'table' ||
        //     current_view === 'card' ||
        //     current_view === 'normal' ||
        //     current_view === 'transposed' ||
        //     current_view === 'ticket'
        // ) {
        //     initializeInfiniteScroll(table_name);
        // }
        if (current_view === 'transposed') {
            initializeInfiniteScroll(table_name, 'horizontal');
        } else {
            initializeInfiniteScroll(table_name, 'vertical');
        }

    } catch (error) {
        console.error(`error creating table ${table_name}:`, error);
    }
}
