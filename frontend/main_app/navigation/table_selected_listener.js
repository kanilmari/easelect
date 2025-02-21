// table_selected_listener.js

import { handle_all_navigation } from '../navigation/navigation.js';
import { custom_views } from '../main/custom_views.js';

export async function handle_table_selected_event(event) {
    const selected_table_name = event.detail.tableName;
    await handle_all_navigation(selected_table_name, custom_views);
}


// // table_selected_listener.js

// import { custom_views } from '../main/custom_views.js';
// import { get_load_info } from './nav_utils.js';
// import { handle_navigation } from './navigation.js';

// export async function handle_table_selected_event(event) {
//     const selected_table_name = event.detail.tableName;
//     const { loadFunction, containerId } = get_load_info(selected_table_name, custom_views);
//     await handle_navigation(selected_table_name, containerId, loadFunction);
//     localStorage.setItem('selected_table', selected_table_name);
// }
