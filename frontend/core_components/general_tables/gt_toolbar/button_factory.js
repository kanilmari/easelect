// button_factory.js

import { open_add_row_modal } from '../gt_1_row_crud/gt_1_1_row_create/add_row.js';
import { delete_selected_items } from '../gt_1_row_crud/gt_1_4_row_delete/delete_rows.js';
import { createColumnVisibilityDropdown } from './column_visibility_dropdown.js';
import { open_column_management_modal } from './column_management.js';
import { applyViewStyling } from '../../table_views/draw_view_selector_buttons.js';

/**
 * Luo nappi rivin lisäämiseen
 */
export function createAddRowButton(table_name) {
    const button = document.createElement('button');
    button.textContent = 'Lisää Rivi';
    button.setAttribute('data-lang-key', 'add_row_' + table_name);
    button.setAttribute('data-lang-key-fallback', 'add_row');
    button.classList.add('add_row_button');
    button.classList.add('button');
    button.style.backgroundColor = 'var(--button_bg_color)';
    button.style.color = 'var(--button_text_color)';
    button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = 'var(--button_hover_bg_color)';
        button.style.color = 'var(--button_hover_text_color)';
    });
    button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = 'var(--button_bg_color)';
        button.style.color = 'var(--button_text_color)';
    });
    button.addEventListener('click', () => open_add_row_modal(table_name));

    return button;
}

/**
 * Luo nappi valittujen rivien poistamiseen
 */
export function createDeleteSelectedButton(table_name, current_view) {
    const button = document.createElement('button');
    button.classList.add('delete_selected_button');
    button.classList.add('button');
    button.style.backgroundColor = 'var(--button_bg_color)';
    button.style.color = 'var(--button_text_color)';
    button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = 'var(--button_hover_bg_color)';
        button.style.color = 'var(--button_hover_text_color)';
    });
    button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = 'var(--button_bg_color)';
        button.style.color = 'var(--button_text_color)';
    });

    // Luodaan roskakorikuvake käyttäen createElementNS (poistetaan innerHTML)
    const svgTrash = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgTrash.setAttribute("height", "16px");
    svgTrash.setAttribute("width", "16px");
    svgTrash.setAttribute("viewBox", "0 -960 960 960");
    svgTrash.setAttribute("fill", "#e8eaed");

    // Luo <path> elementti ja anna d-attribuutti
    const pathTrash = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathTrash.setAttribute("d", "m336-280 144-144 144 144 56-56-144-144 144-144-56-56-144 144-144-144-56 56 144 144-144 144 56 56ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z");

    // Liitetään path roskakori-SVG:hen
    svgTrash.appendChild(pathTrash);

    // Liitetään roskakori-nappiin
    button.appendChild(svgTrash);

    // Luodaan tekstisolmu
    const btnText = document.createTextNode(' Poista Valitut');
    button.appendChild(btnText);

    // Klikattaessa kutsutaan delete_selected_items
    button.addEventListener('click', () => delete_selected_items(table_name, current_view));

    return button;
}

/**
 * Luo column visibility -dropdownin (näkyvät sarakkeet).
 */
export function createColumnVisibilityDropdownButton(tableContainer) {
    const dropdown = createColumnVisibilityDropdown(tableContainer);
    return dropdown || null;
}

/**
 * Luo napin taulun column-managementtiä varten.
 */
export function createColumnManagementButton(table_name) {
    const button = document.createElement('button');
    button.classList.add('column_management_button');
    button.setAttribute('data-lang-key', 'manage_table_short');
    button.style.backgroundColor = 'var(--button_bg_color)';
    button.style.color = 'var(--button_text_color)';
    button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = 'var(--button_hover_bg_color)';
        button.style.color = 'var(--button_hover_text_color)';
    });
    button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = 'var(--button_bg_color)';
        button.style.color = 'var(--button_text_color)';
    });
    button.addEventListener('click', () => {
        open_column_management_modal(table_name);
    });

    return button;
}