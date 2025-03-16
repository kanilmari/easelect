// delete_rows.js
import { get_selected_ids } from '../../../table_views/table_view/selection_helper.js';

export async function delete_selected_items(table_name) {
    const selected_ids = get_selected_ids(table_name);
    if (selected_ids.length === 0) {
        alert('Valitse poistettavat kohteet.');
        return;
    }

    if (!confirm(`Haluatko varmasti poistaa valitut ${selected_ids.length} kohdetta?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/delete-rows?table=${table_name}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: selected_ids }),
        });

        if (response.ok) {
            alert('Valitut kohteet poistettu onnistuneesti! ☺');

            // Päivitetään näkymä noutamalla taulun data uudelleen
            console.log('delete_rows.js: delete_selected_items kutsuu funktiota fetchTableData');
            const table_data = await fetchTableData({ table_name });
            console.log('delete_rows.js: delete_selected_items kutsuu funktiota generate_table');
            await generate_table(table_name, table_data.columns, table_data.data, table_data.types);
        } else {
            const error_data = await response.json();
            alert(`Virhe poistossa: ${error_data.message || 'Tuntematon virhe.'}`);
        }
    } catch (error) {
        console.error('Virhe poistossa:', error);
        alert('Virhe poistossa.');
    }
}