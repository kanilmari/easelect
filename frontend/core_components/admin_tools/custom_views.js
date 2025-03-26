// custom_views.js

// import { load_rights_management } from '../rights/rights_management.js';
import { load_permissions } from './manage_permissions.js';
import { load_trigger_management } from './notification_triggers.js';
import { load_foreign_keys_view } from './foreign_keys_view.js';
import { load_table_creation } from '../general_tables/gt_3_table_crud/gt_3_1_table_create/create_table_admin.js';
import { load_single_chat_view } from './project_chat/load_single_chat_view.js';

// Huomaa, että group-arvo ("tools") toimii kieliavaimena navigaatiossa.
export const custom_views = [
    // {
    //     name: '▶ Oikeuksien hallinta',
    //     loadFunction: load_rights_management,
    //     containerId: 'rights_management_container',
    //     group: 'tools'
    // },
    {
        name: 'permissions',
        loadFunction: load_permissions,
        containerId: 'permissions_container',
        group: 'admin_tools'
    },
    {
        name: 'add_notification_trigger',
        loadFunction: load_trigger_management,
        containerId: 'trigger_management_container',
        group: 'admin_tools'
    },
    {
        name: 'foreign_keys',
        loadFunction: load_foreign_keys_view,
        containerId: 'foreign_keys_container',
        group: 'admin_tools'
    },
    {
        name: 'create_table',
        loadFunction: load_table_creation,
        containerId: 'table_creation_container',
        group: 'admin_tools'
    },
    {
        name: 'admin_chat',
        loadFunction: load_single_chat_view,
        containerId: 'single_chat_container',
        group: 'admin_tools'
    }
];