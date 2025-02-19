// add_row.js

import { generate_table } from '../../../logical_components/table_views/view_table.js';
import { createModal, showModal, hideModal } from '../../../logical_components/modal/modal_factory.js';
import { fetchTableData } from '../../endpoints/endpoint_data_fetcher.js';
import { createVanillaDropdown } from '../../../logical_components/vanilla_dropdown/vanilla_dropdown.js';

let modal_form_state = {}; // Tallennetaan modaalin syötetyt arvot

// ***********************************************
// * Auto-resize logiikka kaikille textareille,  *
// * joilla on auto_resize_textarea -luokka.     *
// ***********************************************
document.addEventListener('input', (event) => {
    if (event.target.classList.contains('auto_resize_textarea')) {
        event.target.style.height = 'auto';
        event.target.style.height = event.target.scrollHeight + 'px';
    }
});
export async function open_add_row_modal(table_name) {
    console.log('gugguu');
    console.log('open_add_row_modal');
    let columns_info;
    try {
        const response = await fetch(`/api/get-columns?table=${table_name}`);
        if (!response.ok) {
            throw new Error(`http error! status: ${response.status}`);
        }
        columns_info = await response.json();
        console.log('columns_info:', columns_info);
    } catch (error) {
        console.error(`Error fetching column information for table ${table_name}:`, error);
        alert('Virhe haettaessa saraketietoja.');
        return;
    }

    if (!columns_info || columns_info.length === 0) {
        console.error('No column information received.');
        alert('Taululle ei ole saatavilla sarakkeita.');
        return;
    }

    // Määritä poissuljettavat sarakkeet
    const exclude_columns = ['id', 'created', 'updated', 'openai_embedding', 'creation_spec'];

    // Suodata sarakkeet
    const columns = columns_info.filter(col => {
        const column_name = col.column_name.toLowerCase();
        // const data_type = col.data_type.toLowerCase();
        const column_default = col.column_default;
        const is_identity = col.is_identity && col.is_identity.toLowerCase() === 'yes';

        if (exclude_columns.includes(column_name)) {
            return false;
        }
        if ((column_default && column_default.trim() !== '') || is_identity) {
            return false;
        }

        return true;
    });

    if (columns.length === 0) {
        console.error('No columns available to display in the modal.');
        alert('Taululle ei ole lisättäviä sarakkeita.');
        return;
    }

    // Luo lomake
    const form = document.createElement('form');
    form.id = 'add_row_form';
    form.style.display = 'flex';
    form.style.flexDirection = 'column';

    for (const column of columns) {
        const label = document.createElement('label');
        label.textContent = column.column_name;
        label.htmlFor = `${table_name}-${column.column_name}-input`;
        Object.assign(label.style, {
            margin: '10px 0 5px',
        });

        // Tarkastetaan, onko vierasavainsarake
        if (column.foreign_table_name) {
            // Tämä on vierasavainsarake; käytetään edistynyttä dropdownia
            const dropdown_container = document.createElement('div');
            dropdown_container.id = `${table_name}-${column.column_name}-input`;
            dropdown_container.style.marginBottom = '10px';
        
            // Hae vaihtoehdot...
            let options = await fetch_referenced_data(column.foreign_table_name);
            if (!Array.isArray(options)) {
                console.warn(`fetchReferencedData ei palauttanut taulukkoa taululle ${column.foreign_table_name}.`);
                options = [];
            }
        
            // Muodostetaan { value, label } -rakenne
            let mapped_options = options.map(opt => {
                const pk_column = Object.keys(opt).find(key => key !== 'display');
                return {
                    value: opt[pk_column],
                    label: `${opt[pk_column]} - ${opt['display']}`
                };
            });
        
            // Luodaan piilokenttä, jonka kautta dropdownin valinta välittyy lomakkeeseen
            const hidden_input = document.createElement('input');
            hidden_input.type = 'hidden';
            hidden_input.name = column.column_name;   // tärkeää, että nimi on sama kuin sarake
            form.appendChild(hidden_input);
        
            // Luodaan dropdown
            createVanillaDropdown({
                containerElement: dropdown_container,
                options: mapped_options,
                placeholder: 'Valitse...',
                searchPlaceholder: 'Hae...',
                showClearButton: true,
                useSearch: true,
                onChange: (val) => {
                    // Tallennetaan dropdownin valinta piilokenttään 
                    hidden_input.value = val || '';
                    // Halutessasi myös modal_form_state:iin:
                    modal_form_state[column.column_name] = val;
                }
            });
        
            // Jos lomakkeen tilassa on jo arvo, asetetaan se dropdowniin ja piilokenttään
            if (modal_form_state[column.column_name]) {
                const dd_instance = dropdown_container.__dropdown;
                dd_instance.setValue(modal_form_state[column.column_name], false);
                hidden_input.value = modal_form_state[column.column_name];
            }
        
            form.appendChild(label);
            form.appendChild(dropdown_container);
        
        } else {
            // Muu, ei-foreign-key -sarake
            const data_type_lower = column.data_type.toLowerCase();

            // Jos text- tai varchar-tyyppinen kenttä, luodaan <textarea>
            if (
                data_type_lower === 'text' ||
                data_type_lower.includes('varchar') ||
                data_type_lower.startsWith('character varying')
            ) {
                const textarea = document.createElement('textarea');
                textarea.name = column.column_name;
                textarea.required = column.is_nullable.toLowerCase() === 'no';
                textarea.rows = 1;
                textarea.classList.add('auto_resize_textarea');

                textarea.style.lineHeight = '1.2em';
                textarea.style.minHeight = '2em';
                textarea.style.padding = '4px 6px';
                textarea.style.border = '1px solid #ccc';
                textarea.style.borderRadius = '4px';
                textarea.style.height = 'auto';
                textarea.value = modal_form_state[column.column_name] || '';
                textarea.style.height = textarea.scrollHeight + 'px';

                textarea.dispatchEvent(new Event('input'));

                textarea.addEventListener('input', (e) => {
                    modal_form_state[column.column_name] = e.target.value;
                });

                form.appendChild(label);
                form.appendChild(textarea);

            } else {
                // Muuten käytetään normaalia syötekenttää
                const input = document.createElement('input');
                input.type = get_input_type(column.data_type);
                input.id = `${table_name}-${column.column_name}-input`;
                input.name = column.column_name;
                input.required = column.is_nullable.toLowerCase() === 'no';
                Object.assign(input.style, {
                    padding: '8px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                });

                if (modal_form_state[column.column_name]) {
                    input.value = modal_form_state[column.column_name];
                }

                input.addEventListener('input', (e) => {
                    modal_form_state[column.column_name] = e.target.value;
                });

                form.appendChild(label);
                form.appendChild(input);
            }
        }
    }

    // Lisää lomakkeen toiminnot (peruuta- ja lisää-painikkeet)
    const form_actions = document.createElement('div');
    Object.assign(form_actions.style, {
        display: 'flex',
        justifyContent: 'flex-end',
        marginTop: '20px',
    });

    const cancel_button = document.createElement('button');
    cancel_button.type = 'button';
    cancel_button.textContent = 'Peruuta';
    Object.assign(cancel_button.style, {
        padding: '8px 16px',
        marginLeft: '10px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
    });
    cancel_button.addEventListener('click', hideModal);

    const submit_button = document.createElement('button');
    submit_button.type = 'submit';
    submit_button.textContent = 'Lisää';
    Object.assign(submit_button.style, {
        padding: '8px 16px',
        marginLeft: '10px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
    });

    form_actions.appendChild(cancel_button);
    form_actions.appendChild(submit_button);
    form.appendChild(form_actions);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submit_new_row(table_name, form, columns);
    });

    createModal({
        titleDataLangKey: `add_new_row`,
        contentElements: [form],
        width: '600px',
    });

    showModal();
    console.log('Modal displayed successfully.');
}

export async function fetch_referenced_data(foreign_table_name) {
    try {
        const response = await fetch(`/referenced-data?table=${foreign_table_name}`);
        if (!response.ok) {
            throw new Error(`http error! status: ${response.status}`);
        }
        const data = await response.json();

        if (!Array.isArray(data)) {
            console.warn(`fetchReferencedData: odotettiin taulukkoa, mutta saatiin:`, data);
            return [];
        }
        return data;
    } catch (error) {
        console.error(`virhe haettaessa dataa taulusta ${foreign_table_name}:`, error);
        return [];
    }
}

export async function fetchReferencedData(foreignTableName) {
    try {
        const response = await fetch(`/referenced-data?table=${foreignTableName}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Uusi tarkistus: palauta aina taulukko tai tyhjä taulukko
        if (!Array.isArray(data)) {
            console.warn(`fetchReferencedData: odotettiin taulukkoa, mutta saatiin:`, data);
            return [];
        }
        return data;
    } catch (error) {
        console.error(`Virhe haettaessa dataa taulusta ${foreignTableName}:`, error);
        return [];
    }
}

function get_input_type(data_type) {
    switch (data_type.toLowerCase()) {
        case 'integer':
        case 'bigint':
        case 'smallint':
        case 'numeric':
            return 'number';
        case 'boolean':
            return 'checkbox';
        case 'date':
            return 'date';
        case 'timestamp':
        case 'timestamp without time zone':
        case 'timestamp with time zone':
            return 'datetime-local';
        default:
            return 'text';
    }
}

async function submit_new_row(table_name, form, columns) {
    const form_data = new FormData(form);
    const data = {};

    columns.forEach(column => {
        let value = form_data.get(column.column_name);

        if (column.data_type.toLowerCase() === 'boolean') {
            value = form.elements[column.column_name].checked;
        }

        data[column.column_name] = value;
    });

    try {
        const response = await fetch(`/api/add-row?table=${table_name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            alert('Rivi lisätty onnistuneesti!');
            hideModal();
            modal_form_state = {};
            await reload_table(table_name);
        } else {
            const error_data = await response.json();
            alert(`Virhe uuden rivin lisäämisessä: ${error_data.message || 'Tuntematon virhe.'}`);
        }
    } catch (error) {
        console.error('virhe uuden rivin lisäämisessä:', error);
        alert('virhe uuden rivin lisäämisessä.');
    }
}

async function reload_table(table_name) {
    try {
        // Haetaan tiedot data_fetcher-funktiolla
        const result = await fetchTableData({
            table_name: table_name
        });

        const data = result.data;
        const columns = result.columns;
        const types = result.types; // jos taustalta tulee myös types

        await generate_table(table_name, columns, data, types);
    } catch (error) {
        console.error(`virhe taulun ${table_name} lataamisessa:`, error);
    }
}
