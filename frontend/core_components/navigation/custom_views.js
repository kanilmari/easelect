// custom_views.js

import { loadManagementView } from '../../common_components/utils.js';

// Tuodaan generaattorifunktiot, jotka rakentavat varsinaisen sisällön.
// Nämä funktiot voivat sijaita esim. eri tiedostoissa:

import { generate_foreign_keys_view } from '../admin_tools/foreign_keys_view.js';
import { generate_permissions_form } from '../admin_tools/manage_permissions.js';
import { generate_notification_trigger_view } from '../admin_tools/notification_triggers.js';
import { generate_table_creation_view } from '../general_tables/gt_3_table_crud/gt_3_1_table_create/create_table_admin.js';
import { generate_single_chat_view } from '../admin_tools/project_chat/load_single_chat_view.js';

// Nämä user_tools-näkymät:
import { generate_login_view } from '../user_tools/login_tab.js';
import { generate_register_view } from '../user_tools/register_tab.js';
import { generate_user_view } from '../user_tools/user_profile_tab.js';
import { generate_create_view } from '../user_tools/add_asset_tab.js';

/**
 * Kaikki custom-view -määrittelyt samassa listassa.
 * Jos 'name' matchaa userin klikkaamaan tabiin, handle_all_navigation
 * kutsuu alla olevaa loadFunction:ia,
 * eikä refreshTableUnified -funktiota.
 */

export const custom_views = [
    // --- ADMIN_TOOLS RYHMÄ ---
    {
        name: 'permissions',
        loadFunction: async () => {
            return loadManagementView('permissions_container', generate_permissions_form);
        },
        containerId: 'permissions_container',
        group: 'admin_tools'
    },
    {
        name: 'add_notification_trigger',
        loadFunction: async () => {
            return loadManagementView('trigger_management_container', generate_notification_trigger_view);
        },
        containerId: 'trigger_management_container',
        group: 'admin_tools'
    },
    {
        name: 'foreign_keys',
        loadFunction: async () => {
            return loadManagementView('foreign_keys_container', generate_foreign_keys_view);
        },
        containerId: 'foreign_keys_container',
        group: 'admin_tools'
    },
    {
        name: 'create_table',
        loadFunction: async () => {
            return loadManagementView('table_creation_container', generate_table_creation_view);
        },
        containerId: 'table_creation_container',
        group: 'admin_tools'
    },
    {
        name: 'admin_chat',
        loadFunction: async () => {
            return loadManagementView('single_chat_container', generate_single_chat_view);
        },
        containerId: 'single_chat_container',
        group: 'admin_tools'
    },

    // --- user_tools -ryhmä ---
    {
        name: 'create',
        loadFunction: async () => {
            return loadManagementView('create_container', generate_create_view);
        },
        containerId: 'create_container',
        group: 'user_tools'
    },
    {
        name: 'user',
        loadFunction: async () => {
            return loadManagementView('user_container', generate_user_view);
        },
        containerId: 'user_container',
        group: 'user_tools'
    },
    {
        name: 'register',
        loadFunction: async () => {
            return loadManagementView('register_container', generate_register_view);
        },
        containerId: 'register_container',
        group: 'user_tools'
    },
    {
        name: 'login',
        loadFunction: async () => {
            return loadManagementView('login_container', generate_login_view);
        },
        containerId: 'login_container',
        group: 'user_tools'
    }
];
