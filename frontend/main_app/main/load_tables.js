// load_tables.js

import { create_navigation_buttons, handle_navigation } from '../navigation/navigation.js';
import { custom_views } from './custom_views.js';
import { get_load_info } from '../navigation/nav_utils.js';

export async function load_tables() {
    try {
        const response = await fetch('/api/tables');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();

        const grouped_tables = result.tables; // esim. [{ table_name: 'users' }, ... ]

        // Luodaan navigation-buttonit
        create_navigation_buttons(custom_views);

        const all_table_names = new Set();
        custom_views.forEach(view => all_table_names.add(view.name));
        grouped_tables.forEach(table => {
            all_table_names.add(table.table_name);
        });

        let selected_table = localStorage.getItem('selected_table');
        if (selected_table && all_table_names.has(selected_table)) {
            const { loadFunction, containerId } = get_load_info(selected_table, custom_views);
            await handle_navigation(selected_table, containerId, loadFunction);
        } else {
            let default_table_name = 'main_todo';
            if (!all_table_names.has(default_table_name)) {
                if (custom_views.length > 0) {
                    default_table_name = custom_views[0].name;
                }
            }
            if (default_table_name) {
                localStorage.setItem('selected_table', default_table_name);
                const { loadFunction, containerId } = get_load_info(default_table_name, custom_views);
                await handle_navigation(default_table_name, containerId, loadFunction);
            }
        }
    } catch (error) {
        console.error('Error loading tables:', error);
    }
}
