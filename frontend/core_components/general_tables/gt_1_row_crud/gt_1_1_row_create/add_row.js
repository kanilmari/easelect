// add_row.js

import { createModal, showModal, hideModal } from '../../../../common_components/modal/modal_factory.js';
import { refreshTableUnified } from '../gt_1_2_row_read/table_refresh_collector.js';
import { createVanillaDropdown } from '../../../../common_components/vanilla_dropdown/vanilla_dropdown.js';

var debug = true;

// Säilytetään lomakkeen tilaa globaalisti
let modal_form_state = {};

// Auto-resize logiikka kaikille textareille
document.addEventListener('input', (event) => {
    if (event.target.classList.contains('auto_resize_textarea')) {
        event.target.style.height = 'auto';
        event.target.style.height = event.target.scrollHeight + 'px';
    }
});

/**
 * -----------------------------------------------
 *   OHJAUSFUNKTIO: avaa rivinlisäyslomakkeen
 * -----------------------------------------------
 */
export async function open_add_row_modal(table_name) {
    console.log('open_add_row_modal, table:', table_name);

    // 1) Haetaan saraketiedot
    const columns_info = await fetchColumnsInfo(table_name);
    if (!columns_info || columns_info.length === 0) {
        console.error('No column information received.');
        alert('Taululle ei ole saatavilla sarakkeita.');
        return;
    }

    // 2) Ei enää frontin filtteröintiä – käytetään sellaisenaan backendistä saatuja sarakkeita
    const columns = columns_info;
    if (!columns || columns.length === 0) {
        console.error('No columns available to display in the modal.');
        alert('Taululle ei ole lisättäviä sarakkeita.');
        return;
    }

    // 3) Haetaan 1->m-suhteet ja monesta->moneen -liitokset
    let oneToManyRelations = await fetchOneToManyRelations(table_name);
    let manyToManyInfos = await fetchManyToManyInfos(table_name);

    if (!oneToManyRelations) oneToManyRelations = [];
    if (!manyToManyInfos) manyToManyInfos = [];

    // 4) Rakennetaan lomake
    const form = buildMainForm(table_name, columns, oneToManyRelations, manyToManyInfos);

    // 5) Lomakkeen loppuun painikkeet ja submit
    appendFormActions(form, table_name, columns);

    // 6) Luodaan ja näytetään modaalinen ikkuna
    createModal({
        titleDataLangKey: `add_row_${table_name}`,
        titleDataLangKeyFallback: `add_row`,
        contentElements: [form],
        width: '600px',
    });
    showModal();
    console.log('Modal displayed successfully.');
}

/* --------------------------------------------
   API/FETCH-FUNKTIOT
   -------------------------------------------- */

async function fetchColumnsInfo(table_name) {
    try {
        const response = await fetch(`/api/get-columns?table=${table_name}`);
        if (!response.ok) {
            throw new Error(`http error! status: ${response.status}`);
        }
        const columns_info = await response.json();
        console.log('columns_info:', columns_info);
        return columns_info;
    } catch (error) {
        console.error(`Error fetching column information for table ${table_name}:`, error);
        alert('Virhe haettaessa saraketietoja.');
        return null;
    }
}

async function fetchOneToManyRelations(tableName) {
    try {
        const response = await fetch(`/api/get-1m-relations?table=${tableName}`);
        if (!response.ok) {
            if (debug) {
                console.debug(`Ei löytynyt 1->m-suhteita taululle ${tableName}, status: ${response.status}`);
            }
            return [];
        }
        const data = await response.json();
        console.log('1->m-suhteet backendistä:', data);
        return data;
    } catch (error) {
        if (debug) {
            console.debug(`virhe haettaessa 1->m-suhteita taululle ${tableName}:`, error);
        }
        return [];
    }
}

export async function fetchManyToManyInfos(table_name) {
    try {
        const response = await fetch(`/api/get-many-to-many?table=${table_name}`);
        if (!response.ok) {
            if (debug) {
                console.debug(`Ei löytynyt monesta-moneen-liitoksia taululle ${table_name}, status: ${response.status}`);
            }
            return [];
        }
        return await response.json();
    } catch (error) {
        if (debug) {
            console.debug(`virhe haettaessa monesta-moneen-liitoksia taululle ${table_name}:`, error);
        }
        return [];
    }
}

export async function fetchReferencedData(foreign_table_name) {
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

/* --------------------------------------------
   LOMAKKEEN RAKENTAMISEN APUFUNKTIOITA
   -------------------------------------------- */

function buildMainForm(table_name, columns, oneToManyRelations, manyToManyInfos) {
    const form = document.createElement('form');
    form.id = 'add_row_form';
    form.style.display = 'flex';
    form.style.flexDirection = 'column';

    for (const column of columns) {
        if (column.foreign_table_name) {
            buildForeignKeyField(form, table_name, column);
        } else {
            buildRegularField(form, table_name, column);
        }
    }

    // 1->m-suhteet
    modal_form_state['_childRowsArray'] = [];
    buildOneToManySection(form, oneToManyRelations);

    // m2m-suhteet
    modal_form_state['_manyToManyRows'] = [];
    buildManyToManySection(form, manyToManyInfos);

    return form;
}

function buildForeignKeyField(form, table_name, column) {
    const label = document.createElement('label');
    label.textContent = column.column_name;
    label.htmlFor = `${table_name}-${column.column_name}-input`;
    label.style.margin = '10px 0 5px';

    const dropdown_container = document.createElement('div');
    dropdown_container.id = `${table_name}-${column.column_name}-input`;
    dropdown_container.style.marginBottom = '10px';

    const hidden_input = document.createElement('input');
    hidden_input.type = 'hidden';
    hidden_input.name = column.column_name;
    form.appendChild(hidden_input);

    createVanillaDropdown({
        containerElement: dropdown_container,
        options: [],
        placeholder: 'Valitse...',
        searchPlaceholder: 'Hae...',
        showClearButton: true,
        useSearch: true,
        onChange: (val) => {
            hidden_input.value = val || '';
            modal_form_state[column.column_name] = val;
        },
    });

    // Hae data
    fetchReferencedData(column.foreign_table_name)
        .then(options => {
            if (!Array.isArray(options)) return;
            const mapped_options = options.map(opt => {
                const pk_column = Object.keys(opt).find(key => key !== 'display');
                return {
                    value: opt[pk_column],
                    label: `${opt[pk_column]} - ${opt['display']}`
                };
            });
            // Tässä demossa ohitamme dropdownin setOptions -logiikan
        })
        .catch(err => {
            console.error(`virhe haettaessa dataa taulusta ${column.foreign_table_name}:`, err);
        });

    form.appendChild(label);
    form.appendChild(dropdown_container);
}

function buildRegularField(form, table_name, column) {
    const label = document.createElement('label');
    label.textContent = column.column_name;
    label.htmlFor = `${table_name}-${column.column_name}-input`;
    label.style.margin = '10px 0 5px';

    const data_type_lower = column.data_type.toLowerCase();

    // Esimerkki: geometry/position
    if (data_type_lower.includes('geometry') && column.column_name.toLowerCase() === 'position') {
        buildGeometryField(form, column);
        return;
    }

    if (data_type_lower === 'text' ||
        data_type_lower.includes('varchar') ||
        data_type_lower.startsWith('character varying') || 
        data_type_lower === 'jsonb') {
        const textarea = document.createElement('textarea');
        textarea.name = column.column_name;
        textarea.required = column.is_nullable.toLowerCase() === 'no';
        textarea.rows = 1;
        textarea.classList.add('auto_resize_textarea');
        textarea.style.lineHeight = '1.2em';
        textarea.style.minHeight = '2em';
        textarea.style.padding = '4px 6px';
        textarea.style.border = '1px solid var(--border_color)';
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
        const input = document.createElement('input');
        input.type = get_input_type(column.data_type);
        input.id = `${table_name}-${column.column_name}-input`;
        input.name = column.column_name;
        input.required = column.is_nullable.toLowerCase() === 'no';
        input.style.padding = '8px';
        input.style.border = '1px solid var(--border_color)';
        input.style.borderRadius = '4px';

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

function buildOneToManySection(form, oneToManyRelations) {
    modal_form_state['_childRowsArray'] = modal_form_state['_childRowsArray'] || [];

    for (const ref of oneToManyRelations) {
        console.log(`Suhteen ${ref.source_table_name}->${ref.target_table_name} insert_new_source_with_target:`, JSON.stringify(ref.insert_new_source_with_target));
        if (ref.insert_new_source_with_target && ref.insert_new_source_with_target.Bool === false) {
            console.log(`Ohitetaan suhde ${ref.source_table_name}->${ref.target_table_name}, Bool on false`);
            continue;
        }

        fetch(`/api/get-columns?table=${ref.source_table_name}`)
            .then(resp => {
                if (!resp.ok) {
                    throw new Error(`http error: ${resp.status}`);
                }
                return resp.json();
            })
            .then(childColumns => {
                childColumns = childColumns.filter(cc => cc.column_name !== ref.source_column_name);

                let targetInsertSpecs = null;
                try {
                    if (ref.target_insert_specs) {
                        targetInsertSpecs = JSON.parse(ref.target_insert_specs);
                    }
                } catch (parseErr) {
                    console.error('virhe target_insert_specs JSON-parsinnassa:', parseErr);
                }
                const fileUploadSpec = targetInsertSpecs?.file_upload || null;

                if (fileUploadSpec && fileUploadSpec.enabled && fileUploadSpec.filename_column) {
                    childColumns = childColumns.filter(cc => cc.column_name !== fileUploadSpec.filename_column);
                }

                if (childColumns.length > 0) {
                    const fieldset = document.createElement('fieldset');
                    fieldset.style.marginTop = '20px';

                    const legend = document.createElement('legend');
                    legend.textContent = `Lisää aliobjekti (1-m): ${ref.source_table_name}`;
                    fieldset.appendChild(legend);

                    const childObjectState = {
                        tableName: ref.source_table_name,
                        referencingColumn: ref.source_column_name,
                        data: {},
                        fileUploadSpec: fileUploadSpec
                    };
                    modal_form_state['_childRowsArray'].push(childObjectState);

                    for (const ccol of childColumns) {
                        const label = document.createElement('label');
                        label.textContent = ccol.column_name;
                        label.htmlFor = `child-${ref.source_table_name}-${ccol.column_name}`;
                        label.style.margin = '10px 0 5px';

                        const dataTypeLower = ccol.data_type.toLowerCase();
                        if (dataTypeLower.includes('geometry') && ccol.column_name.toLowerCase() === 'position') {
                            buildChildGeometryField(fieldset, ccol, childObjectState);
                        } else {
                            let childInput;
                            if (
                                dataTypeLower === 'text' ||
                                dataTypeLower.includes('varchar') ||
                                dataTypeLower.startsWith('character varying')
                            ) {
                                childInput = document.createElement('textarea');
                                childInput.rows = 1;
                                childInput.classList.add('auto_resize_textarea');
                            } else {
                                childInput = document.createElement('input');
                                childInput.type = get_input_type(ccol.data_type);
                            }
                            childInput.name = ccol.column_name;
                            childInput.style.marginBottom = '5px';
                            childInput.style.border = '1px solid var(--border_color)';
                            childInput.style.borderRadius = '4px';

                            childInput.addEventListener('input', (e) => {
                                childObjectState.data[ccol.column_name] = e.target.value;
                            });

                            fieldset.appendChild(label);
                            fieldset.appendChild(childInput);
                        }
                    }

                    if (fileUploadSpec?.enabled) {
                        buildFileUploadField(fieldset, fileUploadSpec, childObjectState);
                    }

                    form.appendChild(fieldset);
                }
            })
            .catch(err => {
                console.error('virhe lapsitaulun sarakkeiden haussa:', err);
            });
    }
}

function buildFileUploadField(fieldset, fileUploadSpec, childObjectState) {
    const label = document.createElement('label');
    label.textContent = 'Valitse tiedosto';
    label.style.margin = '10px 0 5px';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = fileUploadSpec.allowed_file_types.map(ext => `.${ext}`).join(',');
    fileInput.required = true;
    fileInput.style.marginBottom = '10px';

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.size / (1024 * 1024) > fileUploadSpec.max_file_size_mb) {
            alert(`Tiedoston maksimikoko on ${fileUploadSpec.max_file_size_mb} MB.`);
            fileInput.value = '';
            return;
        }
        childObjectState.data[fileUploadSpec.filename_column] = file.name;
        childObjectState._actualFileObject = file;
    });

    fieldset.appendChild(label);
    fieldset.appendChild(fileInput);
}

/** Lisää lomakkeen alalaitaan Peruuta- ja Lisää-painikkeet */
function appendFormActions(form, table_name, columns) {
    const form_actions = document.createElement('div');
    form_actions.style.display = 'flex';
    form_actions.style.justifyContent = 'flex-end';
    form_actions.style.marginTop = '20px';

    const cancel_button = document.createElement('button');
    cancel_button.type = 'button';
    cancel_button.textContent = 'Peruuta';
    cancel_button.style.padding = '8px 16px';
    cancel_button.style.marginLeft = '10px';
    cancel_button.style.border = 'none';
    cancel_button.style.borderRadius = '4px';
    cancel_button.style.cursor = 'pointer';
    cancel_button.addEventListener('click', hideModal);

    const submit_button = document.createElement('button');
    submit_button.type = 'submit';
    submit_button.textContent = 'Lisää';
    submit_button.style.padding = '8px 16px';
    submit_button.style.marginLeft = '10px';
    submit_button.style.border = 'none';
    submit_button.style.borderRadius = '4px';
    submit_button.style.cursor = 'pointer';

    form_actions.appendChild(cancel_button);
    form_actions.appendChild(submit_button);
    form.appendChild(form_actions);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!e.submitter || e.submitter !== submit_button) {
            return;
        }
        await submit_new_row(table_name, form, columns);
    });
}

/** Päätellään input-tyyppi datatyypin perusteella */
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

/** Lomakkeen submit: lähetetään pään data, lapsidatat ja M2M-liitokset backendille */
async function submit_new_row(table_name, form, columns) {
    const formData = new FormData();

    const mainData = {};
    columns.forEach(column => {
        let value = form.elements[column.column_name]?.value ?? '';
        if (column.data_type.toLowerCase() === 'boolean') {
            value = form.elements[column.column_name].checked;
        }
        mainData[column.column_name] = value;
    });

    let childRowsToSend = [];
    if (modal_form_state['_childRowsArray'] && modal_form_state['_childRowsArray'].length > 0) {
        modal_form_state['_childRowsArray'].forEach((child, index) => {
            const safeChild = { ...child };
            childRowsToSend.push(safeChild);
        });
    }
    if (childRowsToSend.length > 0) {
        mainData['_childRows'] = childRowsToSend;
    }

    let finalM2M = [];
    if (modal_form_state['_manyToManyRows'] && modal_form_state['_manyToManyRows'].length > 0) {
        for (let m2m of modal_form_state['_manyToManyRows']) {
            const modeInputs = form.querySelectorAll(`input[name="${m2m.modeRadioName}"]`);
            let selectedMode = 'existing';
            modeInputs.forEach(radio => {
                if (radio.checked) {
                    selectedMode = radio.value;
                }
            });

            if (selectedMode === 'existing') {
                const existingVal = m2m.existingHiddenInput.value;
                if (existingVal) {
                    finalM2M.push({
                        linkTableName: m2m.linkTableName,
                        mainTableFkColumn: m2m.mainTableFkColumn,
                        thirdTableName: m2m.thirdTableName,
                        thirdTableFkColumn: m2m.thirdTableFkColumn,
                        selectedValue: existingVal,
                        isNewRow: false
                    });
                }
            } else {
                const newData = m2m.newRowState.data || {};
                if (Object.keys(newData).length > 0) {
                    finalM2M.push({
                        linkTableName: m2m.linkTableName,
                        mainTableFkColumn: m2m.mainTableFkColumn,
                        thirdTableName: m2m.thirdTableName,
                        thirdTableFkColumn: m2m.thirdTableFkColumn,
                        isNewRow: true,
                        newRowData: newData
                    });
                }
            }
        }
    }
    if (finalM2M.length > 0) {
        mainData['_manyToMany'] = finalM2M;
    }

    const mainDataJSON = JSON.stringify(mainData);
    formData.append('jsonPayload', mainDataJSON);

    childRowsToSend.forEach((child, index) => {
        if (child._actualFileObject) {
            formData.append(`file_child_${index}`, child._actualFileObject);
        }
    });

    try {
        const response = await fetch(`/api/add-row-multipart?table=${table_name}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error_data = await response.json();
            alert(`Virhe: ${error_data.message || response.statusText}`);
            return;
        }

        alert('Rivi lisätty onnistuneesti!');
        hideModal();
        modal_form_state = {};

        // Uusi "refresh" unifyed-tavalla:
        await refreshTableUnified(table_name, {
            offsetOverride: 0,   // Aloitetaan nollasta, jotta uusi rivi näkyy ylhäältä
            skipUrlParams: true  // Ei huomioida URL-parametreja
        });

    } catch (error) {
        console.error('virhe uuden rivin lisäämisessä (multipart):', error);
        alert('virhe uuden rivin lisäämisessä (multipart).');
    }
}


/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////
/////////////////

/** Täyttää taustakenttiä valitun osoitteen lisätiedoilla */
function fillAdditionalGeometryFields(form, suggestion) {
    // Näitä voi säätää tilanteen mukaan.
    const fieldMap = [
        'title',
        'label',
        'country_code',
        'country_name',
        'state',
        'county',
        'city',
        'district',
        'street',
        'house_number',
        'postal_code',
    ];
    fieldMap.forEach(fieldName => {
        const field = form.querySelector(`[name="${fieldName}"]`);
        if (field) {
            field.value = suggestion[fieldName] || '';
            modal_form_state[fieldName] = suggestion[fieldName] || '';
        }
    });
}

/** Geometriakentän HERE-validointi (päätaulun position) */
function buildGeometryField(form, column) {
    const label = document.createElement('label');
    label.textContent = column.column_name;

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '6px';

    const addrLabel = document.createElement('label');
    addrLabel.textContent = 'Anna osoite (HERE-validointi)';

    const addrInput = document.createElement('input');
    addrInput.type = 'text';
    addrInput.placeholder = 'Esim. Mannerheimintie 10, Helsinki';

    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.style.marginTop = '10px';

    const hiddenGeom = document.createElement('input');
    hiddenGeom.type = 'hidden';
    hiddenGeom.name = column.column_name;
    hiddenGeom.value = modal_form_state[column.column_name] || '';

    const validateBtn = document.createElement('button');
    validateBtn.type = 'button';
    validateBtn.textContent = 'Validoi HEREllä';

    validateBtn.addEventListener('click', async () => {
        const addr = addrInput.value.trim();
        if (!addr) {
            alert('Syötä osoite ennen validointia');
            return;
        }
        try {
            const resp = await fetch('/api/geocode-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: addr }),
            });
            if (!resp.ok) {
                const errData = await resp.json();
                alert('Geokoodaus epäonnistui: ' + (errData.message || 'Tuntematon virhe'));
                return;
            }
            const suggestions = await resp.json();
            suggestionsDiv.replaceChildren();
            if (!Array.isArray(suggestions) || suggestions.length === 0) {
                alert('Ei tuloksia');
                return;
            }
            suggestions.slice(0, 5).forEach((sug) => {
                const sugDiv = document.createElement('div');
                sugDiv.style.border = '1px solid var(--border_color)';
                sugDiv.style.padding = '6px';
                sugDiv.style.marginBottom = '4px';
                sugDiv.style.cursor = 'pointer';
                sugDiv.textContent = `${sug.label || sug.title}`;
                sugDiv.addEventListener('click', () => {
                    const wkt = `POINT(${sug.lon} ${sug.lat})`;
                    hiddenGeom.value = wkt;
                    modal_form_state[column.column_name] = wkt;
                    fillAdditionalGeometryFields(form, sug);
                    alert(`Valitsit: ${sug.label || sug.title}.\nKoordinaatit tallennettu!`);
                });
                suggestionsDiv.appendChild(sugDiv);
            });
        } catch (err) {
            console.error('Geokoodausvirhe:', err);
            alert('Geokoodausvirhe (tarkista konsoli).');
        }
    });

    container.appendChild(addrLabel);
    container.appendChild(addrInput);
    container.appendChild(validateBtn);
    container.appendChild(suggestionsDiv);
    container.appendChild(hiddenGeom);

    form.appendChild(label);
    form.appendChild(container);
}

/** Lapsitaulun geometriakentän HERE-validointi */
function buildChildGeometryField(fieldset, column, childObjectState) {
    const label = document.createElement('label');
    label.textContent = column.column_name;

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '6px';

    const addrLabel = document.createElement('label');
    addrLabel.textContent = 'Anna osoite (HERE-validointi)';

    const addrInput = document.createElement('input');
    addrInput.type = 'text';
    addrInput.placeholder = 'Esim. Mikonkatu 8, Helsinki';

    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.style.marginTop = '10px';

    const hiddenGeom = document.createElement('input');
    hiddenGeom.type = 'hidden';
    hiddenGeom.name = column.column_name;
    hiddenGeom.value = '';

    const validateBtn = document.createElement('button');
    validateBtn.type = 'button';
    validateBtn.textContent = 'Validoi HEREllä';
    validateBtn.addEventListener('click', async () => {
        const addr = addrInput.value.trim();
        if (!addr) {
            alert('Syötä osoite ennen validointia');
            return;
        }
        try {
            const resp = await fetch('/api/geocode-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: addr }),
            });
            if (!resp.ok) {
                const errData = await resp.json();
                alert('Geokoodaus epäonnistui: ' + (errData.message || 'Tuntematon virhe'));
                return;
            }
            const suggestions = await resp.json();
            suggestionsDiv.replaceChildren();
            if (!Array.isArray(suggestions) || suggestions.length === 0) {
                alert('Ei tuloksia');
                return;
            }
            suggestions.slice(0, 5).forEach((sug) => {
                const sugDiv = document.createElement('div');
                sugDiv.style.border = '1px solid var(--border_color)';
                sugDiv.style.padding = '6px';
                sugDiv.style.marginBottom = '4px';
                sugDiv.style.cursor = 'pointer';
                sugDiv.textContent = `${sug.label || sug.title}`;
                sugDiv.addEventListener('click', () => {
                    const wkt = `POINT(${sug.lon} ${sug.lat})`;
                    hiddenGeom.value = wkt;
                    childObjectState.data[column.column_name] = wkt;

                    // Täytetään muita kenttiä lapsitaulusta, jos sellaisia on
                    const fillIfPresent = (fieldName, val) => {
                        const field = fieldset.querySelector(`[name="${fieldName}"]`);
                        if (field) {
                            field.value = val || '';
                            childObjectState.data[fieldName] = val || '';
                        }
                    };
                    fillIfPresent('title', sug.title);
                    fillIfPresent('label', sug.label);
                    fillIfPresent('here_id', sug.hereId);
                    fillIfPresent('result_type', sug.resultType);
                    fillIfPresent('country_code', sug.countryCode);
                    fillIfPresent('country_name', sug.countryName);
                    fillIfPresent('state', sug.state);
                    fillIfPresent('county', sug.county);
                    fillIfPresent('city', sug.city);
                    fillIfPresent('district', sug.district);
                    fillIfPresent('street', sug.street);
                    fillIfPresent('house_number', sug.houseNumber);
                    fillIfPresent('postal_code', sug.postalCode);

                    alert(`Valitsit: ${sug.label || sug.title}.\nKoordinaatit tallennettu!`);
                });
                suggestionsDiv.appendChild(sugDiv);
            });
        } catch (err) {
            console.error('[CHILD] Geokoodausvirhe:', err);
            alert('Geokoodausvirhe (tarkista konsoli).');
        }
    });

    container.appendChild(addrLabel);
    container.appendChild(addrInput);
    container.appendChild(validateBtn);
    container.appendChild(suggestionsDiv);
    container.appendChild(hiddenGeom);

    fieldset.appendChild(label);
    fieldset.appendChild(container);
}

/** Rakentaa monesta->moneen-lomakesektion */
function buildManyToManySection(form, manyToManyInfos) {
    for (const info of manyToManyInfos) {
        const fieldset = document.createElement('fieldset');
        fieldset.style.marginTop = '20px';
        const legend = document.createElement('legend');
        legend.textContent = `Lisää monesta-moneen-liitos: ${info.third_table_name}`;
        fieldset.appendChild(legend);

        // Haetaan "kolmannen taulun" sarakkeet
        fetch(`/api/get-columns?table=${info.third_table_name}`)
            .then(resp => {
                if (!resp.ok) throw new Error(`http error: ${resp.status}`);
                return resp.json();
            })
            .then(thirdTableColumns => {
                const exclude_cols = ['id', 'created', 'updated', 'openai_embedding', 'creation_spec'];
                const sanitizedThirdCols = thirdTableColumns.filter(tc => {
                    if (exclude_cols.includes(tc.column_name.toLowerCase())) return false;
                    if ((tc.column_default && tc.column_default.trim() !== '') ||
                        (tc.is_identity && tc.is_identity.toLowerCase() === 'yes')) {
                        return false;
                    }
                    return true;
                });

                // Valinta: olemassaoleva rivi / uusi rivi
                const radioContainer = document.createElement('div');
                radioContainer.style.display = 'flex';
                radioContainer.style.gap = '1em';

                const existingRadio = document.createElement('input');
                existingRadio.type = 'radio';
                existingRadio.name = `m2m_mode_${info.third_table_name}`;
                existingRadio.value = 'existing';
                existingRadio.checked = true;
                const existingRadioLabel = document.createElement('label');
                existingRadioLabel.textContent = 'Valitse olemassaolevista';

                const newRadio = document.createElement('input');
                newRadio.type = 'radio';
                newRadio.name = `m2m_mode_${info.third_table_name}`;
                newRadio.value = 'new';
                const newRadioLabel = document.createElement('label');
                newRadioLabel.textContent = 'Luo kokonaan uusi rivi';

                radioContainer.appendChild(existingRadio);
                radioContainer.appendChild(existingRadioLabel);
                radioContainer.appendChild(newRadio);
                radioContainer.appendChild(newRadioLabel);
                fieldset.appendChild(radioContainer);

                // Dropdown + hidden input
                const dropdown_container = document.createElement('div');
                dropdown_container.style.marginTop = '1em';

                const hiddenInput = document.createElement('input');
                hiddenInput.type = 'hidden';
                hiddenInput.name = `_m2m_existing_${info.link_table_name}_${info.third_table_name}`;
                dropdown_container.appendChild(hiddenInput);

                // Haetaan kolmannen taulun data
                fetchReferencedData(info.third_table_name)
                    .then(thirdTableOptions => {
                        let mapped_options = [];
                        if (Array.isArray(thirdTableOptions)) {
                            mapped_options = thirdTableOptions.map(opt => {
                                const pk_column = Object.keys(opt).find(key => key !== 'display');
                                return {
                                    value: opt[pk_column],
                                    label: `${opt[pk_column]} - ${opt['display']}`
                                };
                            });
                        }
                        createVanillaDropdown({
                            containerElement: dropdown_container,
                            options: mapped_options,
                            placeholder: `Valitse ${info.third_table_name}...`,
                            searchPlaceholder: 'Hae...',
                            showClearButton: true,
                            useSearch: true,
                            onChange: (val) => {
                                hiddenInput.value = val || '';
                            }
                        });
                    })
                    .catch(err => console.error('virhe kolmannen taulun datan haussa:', err));

                fieldset.appendChild(dropdown_container);

                // Uuden rivin luontikentät
                const newRowFieldset = document.createElement('div');
                newRowFieldset.style.display = 'none';

                const newM2MObjectState = {
                    tableName: info.third_table_name,
                    data: {}
                };

                for (const ccol of sanitizedThirdCols) {
                    const label = document.createElement('label');
                    label.textContent = ccol.column_name;
                    label.style.display = 'block';

                    let inputElem;
                    const data_type_lower = ccol.data_type.toLowerCase();
                    if (data_type_lower.includes('text') || data_type_lower.includes('char')) {
                        inputElem = document.createElement('textarea');
                        inputElem.rows = 1;
                        inputElem.classList.add('auto_resize_textarea');
                    } else {
                        inputElem = document.createElement('input');
                        inputElem.type = get_input_type(ccol.data_type);
                    }
                    inputElem.name = ccol.column_name;
                    inputElem.style.border = '1px solid var(--border_color)';
                    inputElem.style.borderRadius = '4px';
                    inputElem.style.display = 'block';
                    inputElem.style.marginBottom = '6px';

                    inputElem.addEventListener('input', (e) => {
                        newM2MObjectState.data[ccol.column_name] = e.target.value;
                    });

                    newRowFieldset.appendChild(label);
                    newRowFieldset.appendChild(inputElem);
                }

                fieldset.appendChild(newRowFieldset);

                // Radiovaihdot
                existingRadio.addEventListener('change', () => {
                    if (existingRadio.checked) {
                        dropdown_container.style.display = 'block';
                        newRowFieldset.style.display = 'none';
                    }
                });
                newRadio.addEventListener('change', () => {
                    if (newRadio.checked) {
                        dropdown_container.style.display = 'none';
                        newRowFieldset.style.display = 'block';
                    }
                });

                // Muistetaan globaaliin tilaan
                modal_form_state['_manyToManyRows'].push({
                    linkTableName: info.link_table_name,
                    mainTableFkColumn: info.mainTableFkColumn, // huom. varmista että sama parametri kuin backendi odottaa
                    thirdTableName: info.third_table_name,
                    thirdTableFkColumn: info.third_table_fk_column,
                    existingHiddenInput: hiddenInput,
                    newRowState: newM2MObjectState,
                    modeRadioName: `m2m_mode_${info.third_table_name}`
                });

                form.appendChild(fieldset);
            })
            .catch(err => {
                console.error('virhe kolmannen taulun sarakkeiden haussa:', err);
            });
    }
}
