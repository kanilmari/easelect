// delete_rows.js
import { get_selected_ids } from '../../../table_views/table_view/selection_helper.js';
import { fetchTableData } from '../../../endpoints/endpoint_data_fetcher.js';
import { generate_table } from '../../../table_views/view_table.js';
import { refreshTableUnified } from '../gt_1_2_row_read/table_refresh_collector.js';

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

            // Päivitetään näkymä refreshTableUnified-funktion avulla
            console.log('delete_rows.js: delete_selected_items kutsuu funktiota refreshTableUnified');
            await refreshTableUnified(table_name, { skipUrlParams: true });
        } else {
            const error_data = await response.json();
            alert(`Virhe poistossa: ${error_data.message || 'Tuntematon virhe.'}`);
        }
    } catch (error) {
        console.error('Virhe poistossa:', error);
        alert('Virhe poistossa.');
    }
}