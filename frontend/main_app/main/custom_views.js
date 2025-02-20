// custom_views.js

// import { load_rights_management } from '../rights/rights_management.js';
import { load_table_based_permissions } from '../table_permissions/manage_table_permissions.js';
import { load_trigger_management } from '../../logical_components/notification_triggers/notification_triggers.js';
import { load_foreign_keys_view } from '../foreign_keys_view.js';
import { load_table_columns } from '../../logical_components/set_table_columns.js';
import { load_table_creation } from '../table_crud/create_table.js';
import { load_single_chat_view } from '../../logical_components/ai_features/project_chat/load_single_chat_view.js';

// Huomaa, että group-arvo ("tools") toimii kieliavaimena navigaatiossa.
export const custom_views = [
    // {
    //     name: '▶ Oikeuksien hallinta',
    //     loadFunction: load_rights_management,
    //     containerId: 'rights_management_container',
    //     group: 'tools'
    // },
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