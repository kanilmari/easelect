// manage_table_permissions.js

import { loadManagementView } from '../../common_actions/utils.js';
import { fetchTableData } from '../general_table_tab/gt_crud/gt_read/endpoint_data_fetcher.js';

export async function load_table_based_permissions() {
    return loadManagementView('table_based_permissions_container', generate_permissions_form);
}

async function generate_permissions_form(table_based_permissions_container) {
    const [function_list, user_group_list, table_list_data] = await Promise.all([
        fetch_general_table_functions(),
        fetch_user_groups(),
        fetch_tables()
    ]);

    // Pääkontaineri, jossa vasemmalla puu ja oikealla oikeuslomake
    const main_wrapper = document.createElement('div');
    main_wrapper.style.display = 'grid';
    main_wrapper.style.gridTemplateColumns = '300px 1fr';
    main_wrapper.style.gridGap = '20px';
    main_wrapper.style.backgroundColor = 'var(--bg_color)';
    main_wrapper.style.color = 'var(--text_color)';
    main_wrapper.style.padding = '10px';

    // Vasemmalle puuvalitsin (table_selector_tree)
    const table_selector_side_container = document.createElement('div');
    table_selector_side_container.style.display = 'flex';
    table_selector_side_container.style.flexDirection = 'column';
    table_selector_side_container.style.gap = '10px';

    // Taulurakenne puuna
    const table_selector_tree = document.createElement('div');
    table_selector_tree.id = 'table_selector_tree';
    table_selector_tree.style.border = `1px solid var(--border_color)`;
    table_selector_tree.style.padding = '5px';
    table_selector_side_container.appendChild(table_selector_tree);

    // Tallenna-nappi
    const save_button = document.createElement('button');
    save_button.type = 'button';
    save_button.textContent = 'Tallenna oikeudet';
    save_button.style.backgroundColor = 'var(--button_bg_color)';
    save_button.style.color = 'var(--button_text_color)';
    save_button.style.border = `1px solid var(--button_active_border_color)`;
    save_button.style.padding = '5px 10px';
    save_button.addEventListener('mouseenter', () => {
        save_button.style.backgroundColor = 'var(--button_hover_bg_color)';
        save_button.style.color = 'var(--button_hover_text_color)';
    });
    save_button.addEventListener('mouseleave', () => {
        save_button.style.backgroundColor = 'var(--button_bg_color)';
        save_button.style.color = 'var(--button_text_color)';
    });
    save_button.addEventListener('mousedown', () => {
        save_button.style.backgroundColor = 'var(--button_active_bg_color)';
        save_button.style.color = 'var(--button_active_text_color)';
    });
    save_button.addEventListener('mouseup', () => {
        save_button.style.backgroundColor = 'var(--button_bg_color)';
        save_button.style.color = 'var(--text_color)';
    });
    save_button.addEventListener('click', async () => {
        if (current_selected_table_names.length === 0) {
            alert('Valitse ensin taulu (tai kansio) puusta, ennen kuin tallennat oikeuksia.');
            return;
        }
        const permission_form = main_wrapper.querySelector('#table_based_permissions_form');
        await save_permissions_for_multiple_tables(permission_form, current_selected_table_names);
    });
    table_selector_side_container.appendChild(save_button);

    // Lisätään hakukenttä funktioiden hakua varten
    const search_container = document.createElement('div');
    search_container.style.display = 'flex';
    search_container.style.flexDirection = 'column';
    search_container.style.gap = '5px';

    const search_label = document.createElement('label');
    search_label.textContent = 'Hae funktioita:';
    search_container.appendChild(search_label);

    const search_input = document.createElement('input');
    search_input.type = 'text';
    search_input.style.padding = '5px';
    search_input.style.border = `1px solid var(--border_color)`;
    search_input.style.width = '80%';
    search_container.appendChild(search_input);

    table_selector_side_container.appendChild(search_container);

    main_wrapper.appendChild(table_selector_side_container);

    // Oikeuslomake
    const permission_form = document.createElement('div');
    permission_form.id = 'table_based_permissions_form';
    permission_form.style.display = 'grid';
    permission_form.style.gridTemplateColumns = `300px repeat(${user_group_list.length}, 110px)`;
    permission_form.style.backgroundColor = 'var(--bg_color)';
    permission_form.style.color = 'var(--text_color)';
    permission_form.style.border = `1px solid var(--border_color)`;
    permission_form.style.gap = '2px';
    permission_form.style.padding = '10px';
    permission_form.style.height = 'min-content';
    permission_form.style.width = 'min-content';

    // Ylävasen nurkka
    const top_left_corner = document.createElement('div');
    top_left_corner.textContent = 'Funktio / Ryhmä';
    top_left_corner.style.fontWeight = 'bold';
    top_left_corner.style.overflow = 'hidden';
    top_left_corner.style.whiteSpace = 'nowrap';
    top_left_corner.style.textOverflow = 'ellipsis';
    top_left_corner.style.borderBottom = `1px solid var(--border_color)`;
    top_left_corner.style.borderRight = `1px solid var(--border_color)`;
    top_left_corner.style.padding = '5px';
    permission_form.appendChild(top_left_corner);

    // Otsikkosolut jokaiselle ryhmälle, joihin lisätään myös "valitse kaikki" -checkbox
    user_group_list.forEach((group_item, group_index) => {
        const group_div = document.createElement('div');
        const group_name_with_wbr = group_item.name.replace(/([._-])/g, '$1<wbr>');
        group_div.innerHTML = group_name_with_wbr;
        group_div.style.fontWeight = 'bold';
        group_div.style.textAlign = 'center';
        group_div.style.overflow = 'hidden';
        group_div.style.whiteSpace = 'normal';
        group_div.style.borderBottom = `1px solid var(--border_color)`;
        if (group_index < user_group_list.length - 1) {
            group_div.style.borderRight = `1px solid var(--border_color)`;
        }
        group_div.style.padding = '5px';

        // "Valitse kaikki" -checkbox tälle ryhmälle
        const select_all_checkbox = document.createElement('input');
        select_all_checkbox.type = 'checkbox';
        select_all_checkbox.style.marginLeft = '6px';
        select_all_checkbox.addEventListener('change', () => {
            // Togglaa kaikki saman ryhmän checkboxit
            const group_checkboxes = permission_form.querySelectorAll(
                `input[type="checkbox"][data-group-id="${group_item.id}"]`
            );
            group_checkboxes.forEach(cb => {
                cb.checked = select_all_checkbox.checked;
            });
        });
        group_div.appendChild(select_all_checkbox);

        permission_form.appendChild(group_div);
    });

    // Jotta voimme suodattaa rivejä (funktioita) helposti, kootaan jokainen
    // funktion rivi yhteen containeriin, jonka display:contents pitää gridin toimivan
    const function_rows = [];

    function_list.forEach((function_item) => {
        const row_container = document.createElement('div');
        // display: contents; -> ei muuta ulkoasua, mutta antaa meidän piilottaa koko rivin yhdellä asetuksella
        row_container.style.display = 'contents';

        // Nimetään funktio siistimmin
        let cleaned_function_name = function_item.name.replace(/Handler/g, '');
        cleaned_function_name = cleaned_function_name.replace(/([A-Z])/g, ' $1');
        cleaned_function_name = cleaned_function_name.replace(/_/g, ' ');
        cleaned_function_name = cleaned_function_name.replace(/\./, ':<br>');
        cleaned_function_name = cleaned_function_name.charAt(0).toUpperCase() + cleaned_function_name.slice(1);
        const fn_name_with_wbr = cleaned_function_name.replace(/([._-])/g, '$1<wbr>');

        // Funktion nimi -solu
        const function_cell = document.createElement('div');
        function_cell.innerHTML = fn_name_with_wbr;
        function_cell.style.fontWeight = 'bold';
        function_cell.style.overflow = 'hidden';
        function_cell.style.whiteSpace = 'normal';
        function_cell.style.textOverflow = 'ellipsis';
        function_cell.style.borderBottom = `1px solid var(--border_color)`;
        function_cell.style.borderRight = `1px solid var(--border_color)`;
        function_cell.style.padding = '5px';
        function_cell.style.lineHeight = '1.2em';

        row_container.appendChild(function_cell);

        const group_cells = [];

        user_group_list.forEach((group_item, group_index) => {
            const cell = document.createElement('div');
            cell.style.borderBottom = `1px solid var(--table_border_color)`;
            if (group_index < user_group_list.length - 1) {
                cell.style.borderRight = `1px solid var(--table_border_color)`;
            }
            cell.style.display = 'flex';
            cell.style.justifyContent = 'center';
            cell.style.alignItems = 'center';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.functionId = function_item.id;
            checkbox.dataset.groupId = group_item.id;

            cell.appendChild(checkbox);
            row_container.appendChild(cell);
            group_cells.push(cell);
        });

        // Lisätään row_container lomakkeen sisään
        permission_form.appendChild(row_container);

        // Tallennetaan viite hakutoimintoa varten
        function_rows.push({
            row_container,
            function_item,
            function_name_cell: function_cell,
            group_cells
        });
    });

    main_wrapper.appendChild(permission_form);
    table_based_permissions_container.appendChild(main_wrapper);

    // Hakutoiminnallisuus: suodatetaan rivejä sen perusteella, vastaako funktiohaun teksti
    search_input.addEventListener('input', () => {
        const search_term = search_input.value.toLowerCase();
        function_rows.forEach(({ row_container, function_item }) => {
            const fn_name_lower = function_item.name.toLowerCase();
            if (fn_name_lower.includes(search_term)) {
                row_container.style.display = 'contents';
            } else {
                row_container.style.display = 'none';
            }
        });
    });

    let current_selected_table_names = [];

    async function fetch_current_permissions() {
        const response = await fetch('/api/table_permissions');
        if (!response.ok) {
            throw new Error(`virhe oikeuksien haussa: ${response.statusText}`);
        }
        const permissions_data = await response.json();
        return permissions_data;
    }

    async function update_permissions_for_single_table(selected_table_name) {
        const permissions_data = await fetch_current_permissions();
        // Tyhjennetään ensin kaikki checkboxit
        // const checkboxes = permission_form.querySelectorAll('input[type="checkbox"]');
        const checkboxes = permission_form.querySelectorAll('input[type="checkbox"][data-function-id][data-group-id]');
        checkboxes.forEach(single_checkbox => single_checkbox.checked = false);

        // Merkitään checkboksit, joilla on oikeus valittuun tauluun
        permissions_data
            .filter(permission_item => permission_item.target_table_name === selected_table_name)
            .forEach(permission_item => {
                const selector = `input[type="checkbox"][data-function-id="${permission_item.function_id}"][data-group-id="${permission_item.auth_user_group_id}"]`;
                const matching_checkbox = permission_form.querySelector(selector);
                if (matching_checkbox) {
                    matching_checkbox.checked = true;
                }
            });
    }

    // Uusi funktio tallennukseen, joka tukee useampaa taulua
    async function save_permissions_for_multiple_tables(permission_form, target_table_names) {
        // Kerätään asetetut oikeudet formista
        // const checkboxes = permission_form.querySelectorAll('input[type="checkbox"]');
        const checkboxes = permission_form.querySelectorAll('input[type="checkbox"][data-function-id][data-group-id]');
        const permissions_to_save = [];

        // Jokainen valittu taulu saa samat oikeudet
        target_table_names.forEach(table_name => {
            checkboxes.forEach(single_checkbox => {
                if (single_checkbox.checked) {
                    permissions_to_save.push({
                        auth_user_group_id: parseInt(single_checkbox.dataset.groupId, 10),
                        function_id: parseInt(single_checkbox.dataset.functionId, 10),
                        target_schema_name: 'public',
                        target_table_name: table_name
                    });
                }
            });
        });

        const save_response = await fetch('/api/table_permissions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ permissions: permissions_to_save })
        });

        if (!save_response.ok) {
            const error_text = await save_response.text();
            alert(`Virhe tallennettaessa oikeuksia: ${error_text}`);
            return;
        }
        alert('Oikeudet tallennettu onnistuneesti kaikille valituille tauluille!');
    }

    document.addEventListener('checkboxSelectionChanged', async (e) => {
        const selectedCategories = e.detail.selectedCategories;
        current_selected_table_names = [];

        if (selectedCategories.length === 1) {
            // Jos vain yksi taulu on valittu, haetaan sen olemassaolevat oikeudet.
            const firstSelectedNodeId = selectedCategories[0];
            const firstSelectedNode = document.getElementById(firstSelectedNodeId);
            if (firstSelectedNode) {
                const spanElem = firstSelectedNode.querySelector('span[data-lang-key], button[data-lang-key]');
                if (spanElem) {
                    const tableNameLangKey = spanElem.getAttribute('data-lang-key');
                    current_selected_table_names.push(tableNameLangKey);
                    await update_permissions_for_single_table(tableNameLangKey);
                }
            }
        } else if (selectedCategories.length > 1) {
            // Useampi taulu valittu, tyhjennetään lomake ja käytetään sitä mallina
            // kaikille valituille tauluille. Ei haeta olemassaolevia oikeuksia.
            // const checkboxes = permission_form.querySelectorAll('input[type="checkbox"]');
            const checkboxes = permission_form.querySelectorAll('input[type="checkbox"][data-function-id][data-group-id]');
            checkboxes.forEach(single_checkbox => single_checkbox.checked = false);

            // Haetaan jokaiselle valitulle node:lle taulun nimi
            selectedCategories.forEach(nodeId => {
                const nodeEl = document.getElementById(nodeId);
                const spanElem = nodeEl ? nodeEl.querySelector('span[data-lang-key], button[data-lang-key]') : null;
                if (spanElem) {
                    const tableNameLangKey = spanElem.getAttribute('data-lang-key');
                    current_selected_table_names.push(tableNameLangKey);
                }
            });
        } else {
            // Ei valintoja
            current_selected_table_names = [];
            // const checkboxes = permission_form.querySelectorAll('input[type="checkbox"]');
            const checkboxes = permission_form.querySelectorAll('input[type="checkbox"][data-function-id][data-group-id]');
            checkboxes.forEach(single_checkbox => single_checkbox.checked = false);
        }
    });
}

async function fetch_general_table_functions() {
    const result = await fetchTableData({
      table_name: 'functions',
      filters: {
        general_table_related: 'true'
      }
    });
    console.log('Vain general_table_related=true rivit', result);

    // Palautetaan pelkistetty lista, esim. { id, name }
    return result.data.map(fn => ({
        id: fn.id,
        name: fn.name
    }));
}

export async function fetch_user_groups() {
    try {
        // Kutsutaan fetchTableData-funktiota halutulla taulun nimellä
        const result = await fetchTableData({ table_name: 'auth_user_groups' });
        
        // Palautetaan datasta vain halutut kentät
        return result.data.map(user_group_item => ({
            id: user_group_item.id,
            name: user_group_item.name
        }));
    } catch (error) {
        throw new Error(`virhe käyttäjäryhmien haussa: ${error.message}`);
    }
}

async function fetch_tables() {
    const response = await fetch('/api/tables');
    if (!response.ok) {
        throw new Error(`virhe taulujen haussa: ${response.statusText}`);
    }
    const result_data = await response.json();

    // Lisätään lokitusta
    console.log("DEBUG /api/tables response:", result_data);
    // Tarkastellaan, mitä result_data.tables oikeasti on
    console.log("DEBUG result_data.tables:", result_data.tables);
    console.log("DEBUG tyyppi:", typeof result_data.tables);

    const grouped_tables = result_data.tables; 
    const all_tables = [];

    // Jos odotat objektimuodossa olevia tauluja, käsitellään se
    if (grouped_tables && typeof grouped_tables === 'object' && !Array.isArray(grouped_tables)) {
        Object.values(grouped_tables).forEach(table_array => {
            console.log("DEBUG table_array:", table_array);
            if (Array.isArray(table_array)) {
                all_tables.push(...table_array);
            }
        });
    } else if (Array.isArray(grouped_tables)) {
        // Jos se onkin suoraan taulukko
        all_tables.push(...grouped_tables);
    } else {
        console.warn("unexpected data structure in result_data.tables:", grouped_tables);
    }

    return all_tables;
}
