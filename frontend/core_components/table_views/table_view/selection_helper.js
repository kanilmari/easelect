// selection_helper.js

export function get_selected_ids(table_name) {
    const current_view = localStorage.getItem(`${table_name}_view`) || 'table';
    let ids = [];

    if (current_view === 'table') {
        const selected_rows = document.querySelectorAll(`#${table_name}_table_body tr.selected`);
        console.log("Löytyi valitut rivit (table):", selected_rows.length);
    
        if (selected_rows.length === 0) {
            return [];
        }
    
        const table = document.querySelector(`#${table_name}_container table`);
        if (!table) {
            return [];
        }
        const columns = JSON.parse(table.dataset.columns);
    
        const id_column_index = columns.indexOf('id');
        if (id_column_index === -1) {
            console.error("ID-saraketta ei löydy columns-taulukosta:", columns);
            return [];
        }
        const id_cell_index = id_column_index + 2; // Numerointi ja valinta huomioiden
    
        selected_rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length > id_cell_index) {
                const id_cell = cells[id_cell_index];
                const id_text = id_cell.textContent;
                const id_parsed = parseInt(id_text, 10);
                if (!isNaN(id_parsed)) {
                    ids.push(id_parsed);
                }
            }
        });
    } else if (current_view === 'card') {
        const selected_cards = document.querySelectorAll(`#${table_name}_container .card.selected`);
        console.log("Löytyi valitut kortit (card):", selected_cards.length);
    
        if (selected_cards.length === 0) {
            return [];
        }
    
        selected_cards.forEach(card => {
            const id_from_card = card.getAttribute('data-id');
            if (id_from_card) {
                ids.push(parseInt(id_from_card, 10));
            } else {
                console.warn("Kortilla ei ole data-id-attribuuttia:", card);
            }
        });
    }

    return ids;
}
