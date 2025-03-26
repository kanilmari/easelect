// manage_table_permissions.js

import { loadManagementView } from '../../common_components/utils.js';
import { fetchTableData } from '../endpoints/endpoint_data_fetcher.js';

export async function load_permissions() {
    return loadManagementView('permissions_container', generate_permissions_form);
}

async function generate_permissions_form(permissions_container) {
    // Haetaan erikseen taululliset ja tauluttomat funktiot + käyttäjäryhmät
    const [
        table_functions,
        tableless_functions,
        user_group_list
    ] = await Promise.all([
        fetch_general_table_functions(),  // specific_table_related: true
        fetch_tableless_functions(),     // specific_table_related: false
        fetch_user_groups()
    ]);

    let isTableBasedMode = true;
    let current_selected_table_names = [];

    // --- 1) Kontti moodinapeille + main_wrapper
    const container_with_mode_buttons = document.createElement('div');
    container_with_mode_buttons.style.display = 'flex';
    container_with_mode_buttons.style.flexDirection = 'column';

    // Moodinapit
    const mode_buttons_container = document.createElement('div');
    mode_buttons_container.style.display = 'flex';
    mode_buttons_container.style.flexDirection = 'row';
    mode_buttons_container.style.gap = '10px';
    mode_buttons_container.style.marginBottom = '10px';

    const table_mode_button = document.createElement('button');
    table_mode_button.textContent = 'Taulukohtaiset oikeudet';
    styleButton(table_mode_button);
    table_mode_button.addEventListener('click', async () => {
        isTableBasedMode = true;
        // Tyhjennetään kaikki checkboxit
        clearAllCheckboxes();
        // (Halutessasi voit myös hakea uudelleen valitun taulun oikeudet, jos current_selected_table_names.length == 1)

        refreshUI();
    });

    const tableless_mode_button = document.createElement('button');
    tableless_mode_button.textContent = 'Kiinteät oikeudet';
    styleButton(tableless_mode_button);
    tableless_mode_button.addEventListener('click', async () => {
        isTableBasedMode = false;
        // Tyhjennetään checkboxit ennen kiinteiden oikeuksien asettamista
        clearAllCheckboxes();
        // Haetaan ja merkitään kiinteät oikeudet
        await update_permissions_for_tableless();
        refreshUI();
    });

    mode_buttons_container.appendChild(table_mode_button);
    mode_buttons_container.appendChild(tableless_mode_button);
    container_with_mode_buttons.appendChild(mode_buttons_container);

    // --- 2) Main wrapper (grid)
    const main_wrapper = document.createElement('div');
    main_wrapper.style.display = 'grid';
    main_wrapper.style.gridTemplateColumns = '300px 1fr';
    main_wrapper.style.gridGap = '20px';
    main_wrapper.style.backgroundColor = 'var(--bg_color)';
    main_wrapper.style.color = 'var(--text_color)';
    main_wrapper.style.padding = '10px';

    container_with_mode_buttons.appendChild(main_wrapper);

    // --- 3) Vasen puoli: puu + tallennusnappi + hakukenttä
    const left_container = document.createElement('div');
    left_container.style.display = 'flex';
    left_container.style.flexDirection = 'column';
    left_container.style.gap = '10px';

    const table_selector_tree_container = document.createElement('div');
    table_selector_tree_container.style.display = 'flex';
    table_selector_tree_container.style.flexDirection = 'column';
    table_selector_tree_container.style.gap = '10px';

    const table_selector_tree = document.createElement('div');
    table_selector_tree.id = 'table_selector_tree';
    table_selector_tree.style.border = `1px solid var(--border_color)`;
    table_selector_tree.style.padding = '5px';
    table_selector_tree_container.appendChild(table_selector_tree);

    // Tallennusnappi
    const save_button = document.createElement('button');
    save_button.type = 'button';
    save_button.textContent = 'Tallenna oikeudet';
    styleButton(save_button);
    save_button.addEventListener('click', async () => {
        const permission_form = main_wrapper.querySelector('#permissions_form');

        if (isTableBasedMode) {
            if (current_selected_table_names.length === 0) {
                alert('Valitse ensin taulu (tai kansio) puusta, ennen kuin tallennat oikeuksia.');
                return;
            }
            await save_permissions_for_multiple_tables(permission_form, current_selected_table_names);
        } else {
            await save_tableless_permissions(permission_form);
        }
    });

    // Hakukenttä
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

    left_container.appendChild(table_selector_tree_container);
    left_container.appendChild(save_button);
    left_container.appendChild(search_container);

    main_wrapper.appendChild(left_container);

    // --- 4) Oikea puoli: permission_form
    const permission_form = document.createElement('div');
    permission_form.id = 'permissions_form';
    permission_form.style.display = 'grid';
    permission_form.style.gridTemplateColumns = `300px repeat(${user_group_list.length}, 110px)`;
    permission_form.style.backgroundColor = 'var(--bg_color)';
    permission_form.style.color = 'var(--text_color)';
    permission_form.style.border = `1px solid var(--border_color)`;
    permission_form.style.gap = '2px';
    permission_form.style.padding = '10px';
    permission_form.style.height = 'min-content';
    permission_form.style.width = 'min-content';

    // Ylävasen otsikkosolu
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

    // Ryhmäotsikot
    user_group_list.forEach((group_item, group_index) => {
        const group_div = document.createElement('div');
        const group_name_with_wbr = group_item.name.replace(/([._-])/g, '$1<wbr>');
        group_div.textContent = group_name_with_wbr;
        group_div.style.fontWeight = 'bold';
        group_div.style.textAlign = 'center';
        group_div.style.overflow = 'hidden';
        group_div.style.whiteSpace = 'normal';
        group_div.style.borderBottom = `1px solid var(--border_color)`;
        if (group_index < user_group_list.length - 1) {
            group_div.style.borderRight = `1px solid var(--border_color)`;
        }
        group_div.style.padding = '5px';

        // "Valitse kaikki" -checkbox
        const select_all_checkbox = document.createElement('input');
        select_all_checkbox.type = 'checkbox';
        select_all_checkbox.style.marginLeft = '6px';
        select_all_checkbox.addEventListener('change', () => {
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

    // Luodaan kaksi listaa: taulukohtaiset vs. kiinteät funktiot
    const function_rows_tableBased = [];
    const function_rows_tableless = [];

    function createFunctionRows(funcList, targetArr) {
        funcList.forEach((function_item) => {
            const row_container = document.createElement('div');
            row_container.style.display = 'contents';

            let cleaned_name = function_item.name.replace(/Handler/g, '');
            cleaned_name = cleaned_name.replace(/([A-Z])/g, ' $1');
            cleaned_name = cleaned_name.replace(/_/g, ' ');
            cleaned_name = cleaned_name.replace(/\./, ': ');
            cleaned_name = cleaned_name.charAt(0).toUpperCase() + cleaned_name.slice(1);
            // const fn_name_with_wbr = cleaned_name.replace(/([._-])/g, '$1<wbr>');

            // Nimisolu
            const function_cell = document.createElement('div');
            function_cell.textContent = cleaned_name;
            function_cell.style.fontWeight = 'bold';
            function_cell.style.overflow = 'hidden';
            function_cell.style.whiteSpace = 'normal';
            function_cell.style.textOverflow = 'ellipsis';
            function_cell.style.borderBottom = `1px solid var(--border_color)`;
            function_cell.style.borderRight = `1px solid var(--border_color)`;
            function_cell.style.padding = '5px';
            function_cell.style.lineHeight = '1.2em';
            row_container.appendChild(function_cell);

            // Checkboxit
            user_group_list.forEach((group_item, idx) => {
                const cell = document.createElement('div');
                cell.style.borderBottom = `1px solid var(--table_border_color)`;
                if (idx < user_group_list.length - 1) {
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
            });

            permission_form.appendChild(row_container);
            targetArr.push({ row_container, function_item });
        });
    }

    createFunctionRows(table_functions, function_rows_tableBased);
    createFunctionRows(tableless_functions, function_rows_tableless);

    main_wrapper.appendChild(permission_form);
    permissions_container.appendChild(container_with_mode_buttons);

    // *** Hakukenttä
    search_input.addEventListener('input', () => {
        const search_term = search_input.value.toLowerCase();
        function_rows_tableBased.forEach(({ row_container, function_item }) => {
            if (!isTableBasedMode) {
                row_container.style.display = 'none';
            } else {
                const fn_name_lower = function_item.name.toLowerCase();
                row_container.style.display = fn_name_lower.includes(search_term) ? 'contents' : 'none';
            }
        });
        function_rows_tableless.forEach(({ row_container, function_item }) => {
            if (isTableBasedMode) {
                row_container.style.display = 'none';
            } else {
                const fn_name_lower = function_item.name.toLowerCase();
                row_container.style.display = fn_name_lower.includes(search_term) ? 'contents' : 'none';
            }
        });
    });

    // *** Oikeuksien nouto
    async function fetch_current_permissions() {
        const response = await fetch('/api/table_permissions');
        if (!response.ok) {
            throw new Error(`virhe oikeuksien haussa: ${response.statusText}`);
        }
        return response.json();
    }

    // *** Taulukohtaisten oikeuksien päivittäminen
    async function update_permissions_for_single_table(selected_table_name) {
        const permissions_data = await fetch_current_permissions();
        clearAllCheckboxes();

        permissions_data
            .filter(item => item.target_table_name === selected_table_name)
            .forEach(permission_item => {
                const selector = `input[type="checkbox"][data-function-id="${permission_item.function_id}"][data-group-id="${permission_item.auth_user_group_id}"]`;
                const cb = permission_form.querySelector(selector);
                if (cb) cb.checked = true;
            });
    }

    // *** Kiinteiden oikeuksien päivittäminen
    async function update_permissions_for_tableless() {
        const permissions_data = await fetch_current_permissions();
        clearAllCheckboxes();

        // Otetaan ne, joilla target_table_name == ""
        permissions_data
            .filter(item => item.target_table_name === "")
            .forEach(permission_item => {
                const sel = `input[type="checkbox"][data-function-id="${permission_item.function_id}"][data-group-id="${permission_item.auth_user_group_id}"]`;
                const cb = permission_form.querySelector(sel);
                if (cb) cb.checked = true;
            });
    }

    // *** Apufunktio: tyhjennä kaikki checkboxit
    function clearAllCheckboxes() {
        const allCheckboxes = permission_form.querySelectorAll('input[type="checkbox"][data-function-id][data-group-id]');
        allCheckboxes.forEach(cb => {
            cb.checked = false;
        });
    }

    // *** Tallennus: taulukohtaiset
    async function save_permissions_for_multiple_tables(permission_form, target_table_names) {
        const allCheckboxes = permission_form.querySelectorAll('input[type="checkbox"][data-function-id][data-group-id]');
        const permissions_to_save = [];

        target_table_names.forEach(tbl => {
            allCheckboxes.forEach(cb => {
                if (cb.checked) {
                    permissions_to_save.push({
                        auth_user_group_id: parseInt(cb.dataset.groupId, 10),
                        function_id: parseInt(cb.dataset.functionId, 10),
                        target_schema_name: 'public',
                        target_table_name: tbl
                    });
                }
            });
        });

        const save_response = await fetch('/api/table_permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions: permissions_to_save })
        });

        if (!save_response.ok) {
            const error_text = await save_response.text();
            alert(`Virhe tallennettaessa oikeuksia: ${error_text}`);
            return;
        }
        alert('Oikeudet tallennettu onnistuneesti valituille tauluille!');
    }

    // *** Tallennus: kiinteä
    async function save_tableless_permissions(permission_form) {
        const allCheckboxes = permission_form.querySelectorAll('input[type="checkbox"][data-function-id][data-group-id]');
        const permissions_to_save = [];

        allCheckboxes.forEach(cb => {
            if (cb.checked) {
                permissions_to_save.push({
                    auth_user_group_id: parseInt(cb.dataset.groupId, 10),
                    function_id: parseInt(cb.dataset.functionId, 10),
                    target_schema_name: 'public',
                    target_table_name: ''
                });
            }
        });

        const save_response = await fetch('/api/table_permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions: permissions_to_save })
        });

        if (!save_response.ok) {
            const error_text = await save_response.text();
            alert(`Virhe tallennettaessa kiinteitä oikeuksia: ${error_text}`);
            return;
        }
        alert('Kiinteät (tauluttomat) oikeudet tallennettu onnistuneesti!');
    }

    // *** Puuvalinnan kuuntelu
    document.addEventListener('checkboxSelectionChanged', async (e) => {
        const selectedCategories = e.detail.selectedCategories;
        current_selected_table_names = [];

        if (selectedCategories.length === 1) {
            const nodeEl = document.getElementById(selectedCategories[0]);
            if (nodeEl) {
                const spanElem = nodeEl.querySelector('span[data-lang-key], button[data-lang-key]');
                if (spanElem) {
                    const tableNameLangKey = spanElem.getAttribute('data-lang-key');
                    current_selected_table_names.push(tableNameLangKey);
                    await update_permissions_for_single_table(tableNameLangKey);
                }
            }
        } else if (selectedCategories.length > 1) {
            clearAllCheckboxes();
            selectedCategories.forEach(nodeId => {
                const nodeEl = document.getElementById(nodeId);
                if (nodeEl) {
                    const spanElem = nodeEl.querySelector('span[data-lang-key], button[data-lang-key]');
                    if (spanElem) {
                        current_selected_table_names.push(spanElem.getAttribute('data-lang-key'));
                    }
                }
            });
        } else {
            // Ei valintoja
            current_selected_table_names = [];
            clearAllCheckboxes();
        }
    });

    // *** UI-moodin päivitys
    function refreshUI() {
        if (isTableBasedMode) {
            table_selector_tree_container.style.display = 'flex'; // näytä puu
            function_rows_tableBased.forEach(({ row_container }) => row_container.style.display = 'contents');
            function_rows_tableless.forEach(({ row_container }) => row_container.style.display = 'none');
        } else {
            table_selector_tree_container.style.display = 'none'; // piilota puu
            function_rows_tableBased.forEach(({ row_container }) => row_container.style.display = 'none');
            function_rows_tableless.forEach(({ row_container }) => row_container.style.display = 'contents');
        }
    }

    // Oletus: taulukohtainen
    refreshUI();
}

/** Apufunktio nappien stailaamiseen */
function styleButton(btn) {
    btn.style.backgroundColor = 'var(--button_bg_color)';
    btn.style.color = 'var(--button_text_color)';
    btn.style.border = `1px solid var(--button_active_border_color)`;
    btn.style.padding = '5px 10px';
    btn.addEventListener('mouseenter', () => {
        btn.style.backgroundColor = 'var(--button_hover_bg_color)';
        btn.style.color = 'var(--button_hover_text_color)';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.backgroundColor = 'var(--button_bg_color)';
        btn.style.color = 'var(--button_text_color)';
    });
    btn.addEventListener('mousedown', () => {
        btn.style.backgroundColor = 'var(--button_active_bg_color)';
        btn.style.color = 'var(--button_active_text_color)';
    });
    btn.addEventListener('mouseup', () => {
        btn.style.backgroundColor = 'var(--button_bg_color)';
        btn.style.color = 'var(--text_color)';
    });
}

// Haku funktiolistalle (esimerkki)
async function fetch_general_table_functions() {
    const result = await fetchTableData({
        table_name: 'functions',
        filters: {
            specific_table_related: 'true'
        }
    });
    console.log('specific_table_related=true rivit', result);
    return result.data.map(fn => ({
        id: fn.id,
        name: fn.name
    }));
}

async function fetch_tableless_functions() {
    const result = await fetchTableData({
        table_name: 'functions',
        filters: {
            specific_table_related: 'false'
        }
    });
    console.log('specific_table_related=false (tauluttomat funktiot)', result);
    return result.data.map(fn => ({
        id: fn.id,
        name: fn.name
    }));
}

export async function fetch_user_groups() {
    try {
        const result = await fetchTableData({ table_name: 'auth_user_groups' });
        return result.data.map(g => ({
            id: g.id,
            name: g.name
        }));
    } catch (error) {
        throw new Error(`virhe käyttäjäryhmien haussa: ${error.message}`);
    }
}
