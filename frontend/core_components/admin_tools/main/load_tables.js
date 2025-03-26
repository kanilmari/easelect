// load_tables.js

import { create_navigation_buttons, handle_all_navigation } from '../../navigation/navigation.js';
import { custom_views } from '../custom_views.js';

export async function load_tables() {
    try {
        const response = await fetch('/api/tables');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();

        const grouped_tables = result.tables; // esim. [{ table_name: 'users' }, ...]

        // Luodaan navigation-buttonit
        create_navigation_buttons(custom_views);

        const all_table_names = new Set();
        custom_views.forEach(view => all_table_names.add(view.name));
        grouped_tables.forEach(table => {
            all_table_names.add(table.table_name);
        });

        let selected_table = localStorage.getItem('selected_table');
        if (selected_table && all_table_names.has(selected_table)) {
            // Kutsutaan suoraan handle_all_navigation
            // console.log('load_tables.js: funktio load_tables kutsuu handle_all_navigation arvoilla: ', selected_table, custom_views);
            await handle_all_navigation(selected_table, custom_views);
        } else {
            let default_table_name = 'service_catalog';
            if (!all_table_names.has(default_table_name)) {
                if (custom_views.length > 0) {
                    default_table_name = custom_views[0].name;
                }
            }
            if (default_table_name) {
                localStorage.setItem('selected_table', default_table_name);
                // console.log('load_tables.js: funktio load_tables kutsuu handle_all_navigation oletustaulun arvolla: ', default_table_name, 'ja custom_views:', custom_views);
                await handle_all_navigation(default_table_name, custom_views);
            }
        }
    } catch (error) {
        console.error('Error loading tables:', error);
    }
}
