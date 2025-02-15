// rights_management.js

import { create_dropdown } from './rights_dropdown_helpers.js';
import { save_usergroup_right } from './rights_api.js';
import { loadManagementView } from '../../common_tools/utils.js';

export async function load_rights_management() {
    return loadManagementView('rights_management_container', generate_rights_management);
}

export async function generate_rights_management(container) {
    try {
        container.innerHTML = ''; // Tyhjennä vanha sisältö, jos on

        // Luo form-elementti
        const form = document.createElement('form');
        form.id = 'rights_management_form';

        // Luodaan dropdownit. Nyt annamme parametreina suoraan vain taulun nimen:
        await create_dropdown({
            container: form,
            table_name: 'auth_user_groups',
            label_text: 'Valitse käyttäjäryhmä: ',
            select_id: 'usergroup_select',
            value_field: 'id',
            text_field: 'group_name'
        });

        await create_dropdown({
            container: form,
            table_name: 'functions',
            label_text: 'Valitse oikeus funktioon: ',
            select_id: 'right_select',
            value_field: 'id',
            text_field: 'name'
        });

        await create_dropdown({
            container: form,
            table_name: 'system_db_tables',
            label_text: 'Valitse taulu: ',
            select_id: 'table_select',
            value_field: 'table_uid',
            text_field: 'table_name'
        });

        // Luo tallennuspainike
        const save_button = document.createElement('button');
        save_button.textContent = 'Tallenna oikeus';
        save_button.type = 'submit';
        form.appendChild(save_button);

        // Liitetään form containeriin
        container.appendChild(form);

        // Lomakkeen submit-toiminto, joka kutsuu API:a
        form.addEventListener('submit', async (e) => {
            e.preventDefault(); // Estä oletusarvoinen uudelleenlataus
            await save_usergroup_right();
        });

    } catch (error) {
        console.error('Virhe oikeuksien hallintaa luodessa:', error);
    }
}
