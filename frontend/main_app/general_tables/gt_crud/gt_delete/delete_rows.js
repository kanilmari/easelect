// delete_rows.js
import { get_selected_ids } from '../../../../logical_components/table_views/table_view/selection_helper.js';
import { regenerate_view } from '../gt_read/regenerate.js';

export async function delete_selected_items(table_name) {
    const ids = get_selected_ids(table_name);
    if (ids.length === 0) {
        alert('Valitse poistettavat kohteet.');
        return;
    }

    if (!confirm(`Haluatko varmasti poistaa valitut ${ids.length} kohdetta?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/delete-rows?table=${table_name}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids }),
        });

        if (response.ok) {
            alert('Valitut kohteet poistettu onnistuneesti!');
            // Päivitä näkymä
            await regenerate_view(table_name);
        } else {
            const error_data = await response.json();
            alert(`Virhe poistossa: ${error_data.message || 'Tuntematon virhe.'}`);
        }
    } catch (error) {
        console.error('Virhe poistossa:', error);
        alert('Virhe poistossa.');
    }
}
