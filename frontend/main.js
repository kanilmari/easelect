// main.js

import { generate_table } from './tabcontent/general_table_tab/gt_crud/gt_read/view_table.js';
import { load_rights_management } from './tabcontent/rights/rights_management.js';
import { load_foreign_keys_view } from './tabcontent/foreign_keys_view.js';
import { load_trigger_management } from './common_actions/notification_triggers/notification_triggers.js';
import { load_single_chat_view } from './common_actions/builder_chat/load_single_chat_view.js';
import { handle_navigation, create_navigation_buttons } from './navbar/navigation.js';
import { load_table_columns } from './set_table_columns.js';
import { load_table_creation } from './tabcontent/table_crud/create_table.js';
import { load_table_based_permissions } from './tabcontent/table_permissions/manage_table_permissions.js';
import './common_actions/vanilla_tree/tree_call.js';
import { fetchTableData } from './tabcontent/general_table_tab/gt_crud/gt_read/endpoint_data_fetcher.js';
import { updateMenuLanguageDisplay } from './navbar/lang_panel/lang_panel.js';
import './common_actions/lang/lang.js';

// Huomaa, että group-arvo ("tools") toimii kieliavaimena navigaatiossa.
export const custom_views = [
    {
        name: '▶ Oikeuksien hallinta',
        loadFunction: load_rights_management,
        containerId: 'rights_management_container',
        group: 'tools'
    },
    {
        name: '▶ Taulukohtaiset oikeudet',
        loadFunction: load_table_based_permissions,
        containerId: 'table_based_permissions_container',
        group: 'tools'
    },
    {
        name: '▶ Lisää heräte',
        loadFunction: load_trigger_management,
        containerId: 'trigger_management_container',
        group: 'tools'
    },
    {
        name: '▶ Vierasavaimet',
        loadFunction: load_foreign_keys_view,
        containerId: 'foreign_keys_container',
        group: 'tools'
    },
    {
        name: '▶ Sarakkeiden järjestys',
        loadFunction: load_table_columns,
        containerId: 'table_columns_container',
        group: 'tools'
    },
    {
        name: '▶ Luo taulu',
        loadFunction: load_table_creation,
        containerId: 'table_creation_container',
        group: 'tools'
    },
    {
        name: '▶ Chat',
        loadFunction: load_single_chat_view,
        containerId: 'single_chat_container',
        group: 'tools'
    }
];

// DOMContentLoaded: aseta perustoiminnot jne.
document.addEventListener('DOMContentLoaded', () => {
    update_oids_and_table_names();
    load_tables();
    updateMenuLanguageDisplay();

});

document.addEventListener('tableSelected', async (event) => {
    const selected_table_name = event.detail.tableName;
    const { loadFunction, containerId } = get_load_info(selected_table_name, custom_views);
    await handle_navigation(selected_table_name, containerId, loadFunction);
    localStorage.setItem('selected_table', selected_table_name);
});

async function update_oids_and_table_names() {
    try {
        const response = await fetch('/update-oids');
        if (!response.ok) {
            throw new Error(`error updating OID values: ${response.statusText}`);
        }
    } catch (error) {
        console.error('error updating OID values and table names:', error);
    }
}

async function load_tables() {
    try {
        const response = await fetch('/api/tables');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();

        const grouped_tables = result.tables; // array, esim. [{ table_name: 'users' }, ... ]
        
        // Luodaan navigation buttonit
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

export function get_load_info(name, custom_views) {
    const custom_view = custom_views.find(view => view.name === name);
    if (custom_view) {
        return {
            loadFunction: custom_view.loadFunction,
            containerId: custom_view.containerId
        };
    } else {
        // Oletus: tavallisen taulun lukufunktio
        return {
            loadFunction: () => load_table(name),
            containerId: `${name}_container`
        };
    }
}

export async function load_table(table_name) {
    try {
        let filters = {};
        let sort_column = null;
        let sort_order = null;

        const columns_response = await fetch(`/api/get-columns?table=${table_name}`);
        const filterBar = document.getElementById(`${table_name}_filterBar`);
        if (filterBar) {
            const inputs = filterBar.querySelectorAll('input, select');
            inputs.forEach(input => {
                if (input.value.trim() !== '') {
                    const column = input.id.replace(`${table_name}_filter_`, '');
                    filters[column] = input.value.trim();
                }
            });
        }

        sort_column = localStorage.getItem(`${table_name}_sort_column`);
        if (sort_column) {
            sort_order = localStorage.getItem(`${table_name}_sort_order_${sort_column}`);
        }

        const result = await fetchTableData({
            table_name,
            sort_column,
            sort_order,
            filters
        });
        const data = result.data || [];
        const response_columns = result.columns || [];
        const data_types = result.types || [];

        localStorage.setItem(`${table_name}_columns`, JSON.stringify(response_columns));
        localStorage.setItem(`${table_name}_dataTypes`, JSON.stringify(data_types));

        await generate_table(table_name, response_columns, data, data_types);

    } catch (error) {
        console.error(`error loading table ${table_name}:`, error);
    }
}

// Sarakeotsikoiden leveyden säätö
document.addEventListener("DOMContentLoaded", function() {
    const table_headers = document.querySelectorAll("#auth_user_groups_table th");
    table_headers.forEach(function(table_header) {
        let existing_resize_handle = table_header.querySelector(".resize-handle");
        if (!existing_resize_handle) {
            let resize_handle_element = document.createElement("div");
            resize_handle_element.classList.add("resize-handle");
            table_header.appendChild(resize_handle_element);
        }
    });

    const resize_handles = document.querySelectorAll(".resize-handle");
    resize_handles.forEach(function(resize_handle_element) {
        resize_handle_element.addEventListener("mousedown", function(mousedown_event) {
            mousedown_event.preventDefault();
            let table_header_element = resize_handle_element.parentElement;
            let start_mouse_x_position = mousedown_event.pageX;
            let start_header_width = table_header_element.offsetWidth;

            function handle_mousemove(mousemove_event) {
                let offset_x = mousemove_event.pageX - start_mouse_x_position;
                let new_width = start_header_width + offset_x;
                if (new_width > 30) {
                    table_header_element.style.width = new_width + "px";
                }
            }
            function handle_mouseup() {
                document.removeEventListener("mousemove", handle_mousemove);
                document.removeEventListener("mouseup", handle_mouseup);
            }
            document.addEventListener("mousemove", handle_mousemove);
            document.addEventListener("mouseup", handle_mouseup);
        });
    });
});