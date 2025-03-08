// add_row.js

import { generate_table } from '../../../logical_components/table_views/view_table.js';
import { createModal, showModal, hideModal } from '../../../logical_components/modal/modal_factory.js';
import { fetchTableData } from '../../endpoints/endpoint_data_fetcher.js';
import { createVanillaDropdown } from '../../../logical_components/vanilla_dropdown/vanilla_dropdown.js';

var debug = true; 

// Säilytetään lomakkeen tilaa globaalisti modaalin osalta
let modal_form_state = {};

// ---------------------------------------------
// Auto-resize logiikka kaikille textareille,
// joilla on auto_resize_textarea -luokka.
// ---------------------------------------------
document.addEventListener('input', (event) => {
    if (event.target.classList.contains('auto_resize_textarea')) {
        event.target.style.height = 'auto';
        event.target.style.height = event.target.scrollHeight + 'px';
    }
});

/**
 * Avataan rivinlisäyslomake. Hakee saraketiedot,
 * lapsitaulut (yksi-moneen) ja monesta-moneen-liitokset,
 * ja rakentaa lomakkeen dynaamisesti.
 */
export async function open_add_row_modal(table_name) {
    console.log('open_add_row_modal, table:', table_name);
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

    // Haetaan taulut, jotka ovat 1->m-suhteessa TÄHÄN tauluun
    let oneToManyRelations = [];
    try {
        oneToManyRelations = await fetchOneToManyRelations(table_name);
        if (!oneToManyRelations) {
            oneToManyRelations = [];
        }
        console.log('oneToManyRelations:', oneToManyRelations);
    } catch (err) {
        console.debug('virhe haettaessa 1->m-suhteita:', err);
        oneToManyRelations = [];
    }

    // Haetaan monesta-moneen -liitokset
    let manyToManyInfos = [];
    try {
        manyToManyInfos = await fetchManyToManyInfos(table_name);
        if (!manyToManyInfos) {
            manyToManyInfos = [];
        }
        console.log('manyToManyInfos:', manyToManyInfos);
    } catch (err) {
        console.debug('virhe M2M-hauissa:', err);
        manyToManyInfos = [];
    }

    // Määritä poissuljettavat sarakkeet
    const exclude_columns = ['id', 'created', 'updated', 'openai_embedding', 'creation_spec'];

    // Suodata pään taulun sarakkeet
    const columns = columns_info.filter(col => {
        const column_name = col.column_name.toLowerCase();
        const column_default = col.column_default;
        const is_identity = col.is_identity && col.is_identity.toLowerCase() === 'yes';

        if (exclude_columns.includes(column_name)) {
            return false;
        }
        // Jos sarakkeella on oletusarvo, tai se on identity-sarake,
        // ei kysytä lomakkeella
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

    // Luodaan pää-lomake
    const form = document.createElement('form');
    form.id = 'add_row_form';
    form.style.display = 'flex';
    form.style.flexDirection = 'column';

    // Rakennetaan pään taulun lomakekentät
    for (const column of columns) {
        const label = document.createElement('label');
        label.textContent = column.column_name;
        label.htmlFor = `${table_name}-${column.column_name}-input`;
        label.style.margin = '10px 0 5px';

        // Tarkistetaan, onko foreign key -sarake
        if (column.foreign_table_name) {
            // TEHDÄÄN DROPDOWN
            const dropdown_container = document.createElement('div');
            dropdown_container.id = `${table_name}-${column.column_name}-input`;
            dropdown_container.style.marginBottom = '10px';

            let options = await fetchReferencedData(column.foreign_table_name);
            if (!Array.isArray(options)) {
                options = [];
            }
            const mapped_options = options.map(opt => {
                const pk_column = Object.keys(opt).find(key => key !== 'display');
                return {
                    value: opt[pk_column],
                    label: `${opt[pk_column]} - ${opt['display']}`
                };
            });

            const hidden_input = document.createElement('input');
            hidden_input.type = 'hidden';
            hidden_input.name = column.column_name; // sama nimi kuin sarake
            form.appendChild(hidden_input);

            createVanillaDropdown({
                containerElement: dropdown_container,
                options: mapped_options,
                placeholder: 'Valitse...',
                searchPlaceholder: 'Hae...',
                showClearButton: true,
                useSearch: true,
                onChange: (val) => {
                    hidden_input.value = val || '';
                    modal_form_state[column.column_name] = val;
                }
            });
            if (modal_form_state[column.column_name]) {
                const dd_instance = dropdown_container.__dropdown;
                dd_instance.setValue(modal_form_state[column.column_name], false);
                hidden_input.value = modal_form_state[column.column_name];
            }
            form.appendChild(label);
            form.appendChild(dropdown_container);

        } else {
            // Muut sarakkeen tiedot
            const data_type_lower = column.data_type.toLowerCase();

            // *** TARKISTETAAN, ONKO KYSE "position"-SARAKKEESTA / GEOMETRYSTA
            if (
                data_type_lower.includes('geometry') &&
                column.column_name.toLowerCase() === 'position'
            ) {
                const container = document.createElement('div');
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.gap = '6px';
            
                const addrLabel = document.createElement('label');
                addrLabel.textContent = 'Anna osoite (HERE-validointi)';
            
                const addrInput = document.createElement('input');
                addrInput.type = 'text';
                addrInput.placeholder = 'Esim. Mannerheimintie 10, Helsinki';
            
                // Tämä div-lista, joka näyttää 5 ehdotusta
                const suggestionsDiv = document.createElement('div');
                suggestionsDiv.style.marginTop = '10px';
            
                // Piilotettu input geometryn tallennukseen
                const hiddenGeom = document.createElement('input');
                hiddenGeom.type = 'hidden';
                hiddenGeom.name = column.column_name; 
                hiddenGeom.value = modal_form_state[column.column_name] || '';
            
                // Validointi-nappi
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
                            body: JSON.stringify({ address: addr })
                        });
                        if (!resp.ok) {
                            const errData = await resp.json();
                            alert('Geokoodaus epäonnistui: ' + (errData.message || 'Tuntematon virhe'));
                            return;
                        }
                        const suggestions = await resp.json(); 
                        // Tyhjennetään vanhat ehdotukset
                        suggestionsDiv.innerHTML = '';
            
                        if (!Array.isArray(suggestions) || suggestions.length === 0) {
                            alert('Ei tuloksia');
                            return;
                        }
            
                        // Lisätään enintään 5 ehdotusta
                        suggestions.slice(0, 5).forEach((sug) => {
                            const sugDiv = document.createElement('div');
                            sugDiv.style.border = '1px solid var(--border_color)';
                            sugDiv.style.padding = '6px';
                            sugDiv.style.marginBottom = '4px';
                            sugDiv.style.cursor = 'pointer';
            
                            // Näytetään esim. Title tai Label
                            sugDiv.textContent = `${sug.label || sug.title}`;
            
                            // Klikattaessa täytetään lomakekentät
                            sugDiv.addEventListener('click', () => {
                                // Rakennetaan geometry WKT pituus- ja leveysasteesta
                                const wkt = `POINT(${sug.lon} ${sug.lat})`;
                                hiddenGeom.value = wkt;
                                modal_form_state[column.column_name] = wkt;
                            
                                // Jos lomakkeessa on [name="title"], täytetään se:
                                const titleField = form.querySelector('[name="title"]');
                                if (titleField) {
                                    titleField.value = sug.title || '';
                                    modal_form_state['title'] = sug.title || '';
                                }
                            
                                // Jos lomakkeessa on [name="label"], täytetään se:
                                const labelField = form.querySelector('[name="label"]');
                                if (labelField) {
                                    labelField.value = sug.label || '';
                                    modal_form_state['label'] = sug.label || '';
                                }
                            
                                // Maa, maakoodi
                                const countryCodeField = form.querySelector('[name="country_code"]');
                                if (countryCodeField) {
                                    countryCodeField.value = sug.countryCode || '';
                                    modal_form_state['country_code'] = sug.countryCode || '';
                                }
                            
                                const countryNameField = form.querySelector('[name="country_name"]');
                                if (countryNameField) {
                                    countryNameField.value = sug.countryName || '';
                                    modal_form_state['country_name'] = sug.countryName || '';
                                }
                            
                                // Osavaltio tms. (jos HERE palauttaa)
                                const stateField = form.querySelector('[name="state"]');
                                if (stateField) {
                                    stateField.value = sug.state || '';
                                    modal_form_state['state'] = sug.state || '';
                                }
                            
                                // County
                                const countyField = form.querySelector('[name="county"]');
                                if (countyField) {
                                    countyField.value = sug.county || '';
                                    modal_form_state['county'] = sug.county || '';
                                }
                            
                                // Kaupunki
                                const cityField = form.querySelector('[name="city"]');
                                if (cityField) {
                                    cityField.value = sug.city || '';
                                    modal_form_state['city'] = sug.city || '';
                                }
                            
                                // Kunta / District
                                const districtField = form.querySelector('[name="district"]');
                                if (districtField) {
                                    districtField.value = sug.district || '';
                                    modal_form_state['district'] = sug.district || '';
                                }
                            
                                // Katu
                                const streetField = form.querySelector('[name="street"]');
                                if (streetField) {
                                    streetField.value = sug.street || '';
                                    modal_form_state['street'] = sug.street || '';
                                }
                            
                                // Talonnumero
                                const houseNumberField = form.querySelector('[name="house_number"]');
                                if (houseNumberField) {
                                    houseNumberField.value = sug.houseNumber || '';
                                    modal_form_state['house_number'] = sug.houseNumber || '';
                                }
                            
                                // Postinumero
                                const postalCodeField = form.querySelector('[name="postal_code"]');
                                if (postalCodeField) {
                                    postalCodeField.value = sug.postalCode || '';
                                    modal_form_state['postal_code'] = sug.postalCode || '';
                                }
                            
                                // Ilmoitetaan käyttäjälle valinnasta
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
            } else if (
                data_type_lower === 'text' ||
                data_type_lower.includes('varchar') ||
                data_type_lower.startsWith('character varying')
            ) {
                // TEKSTIKENTTÄ / TEXTAREA
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
                // OLETUS: luodaan input
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
    }

    //
    // *** 1 -> monen lapsitaulut (foreign key lapsitaulussa) ***
    //
    modal_form_state['_childRowsArray'] = [];

    for (const ref of oneToManyRelations) {
        // Hae lapsitaulun saraketiedot
        let childColumns = [];
        try {
            const resp = await fetch(`/api/get-columns?table=${ref.source_table_name}`);
            if (!resp.ok) throw new Error(`http error: ${resp.status}`);
            childColumns = await resp.json();
        } catch (err) {
            console.error('virhe lapsitaulun sarakkeiden haussa:', err);
            childColumns = [];
        }

        // Poistetaan se sarake, joka viittaa pääriviin (ref.source_column_name),
        // koska sen täyttö on automaattinen
        childColumns = childColumns.filter(cc => cc.column_name !== ref.source_column_name);

        if (childColumns.length > 0) {
            // Tehdään yksinkertainen fieldset lapsitaulun kentille
            const fieldset = document.createElement('fieldset');
            fieldset.style.marginTop = '20px';
            const legend = document.createElement('legend');
            legend.textContent = `Lisää aliobjekti (1-m): ${ref.source_table_name}`;
            fieldset.appendChild(legend);

            // Luo lapsi-lomakkeen tilakokoelma
            const childObjectState = {
                tableName: ref.source_table_name,
                referencingColumn: ref.source_column_name, // vierasavain lapsitaulussa
                data: {}
            };
            // Tallennetaan se globaaliin arrayhin
            modal_form_state['_childRowsArray'].push(childObjectState);

            for (const ccol of childColumns) {
                const label = document.createElement('label');
                label.textContent = ccol.column_name;
                label.htmlFor = `child-${ref.source_table_name}-${ccol.column_name}`;
                label.style.margin = '10px 0 5px';

                const data_type_lower = ccol.data_type.toLowerCase();
                let childInput;
                if (
                    data_type_lower === 'text' ||
                    data_type_lower.includes('varchar') ||
                    data_type_lower.startsWith('character varying')
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

                // Tallennetaan arvo childObjectStateen
                childInput.addEventListener('input', (e) => {
                    childObjectState.data[ccol.column_name] = e.target.value;
                });

                fieldset.appendChild(label);
                fieldset.appendChild(childInput);
            }
            form.appendChild(fieldset);
        }
    }

    //
    // *** monesta -> moneen -liitokset ***
    //
    modal_form_state['_manyToManyRows'] = [];

    for (const info of manyToManyInfos) {
        // info.link_table_name, info.mainTableFkColumn, info.thirdTableName, info.thirdTableFkColumn
        const fieldset = document.createElement('fieldset');
        fieldset.style.marginTop = '20px';
        const legend = document.createElement('legend');
        legend.textContent = `Lisää monesta-moneen-liitos: ${info.third_table_name}`;
        fieldset.appendChild(legend);

        // Haetaan "kolmannen taulun" saraketiedot, jotta voidaan vaihtoehtoisesti lisätä uusi rivi
        let thirdTableColumns = [];
        try {
            const resp = await fetch(`/api/get-columns?table=${info.third_table_name}`);
            if (!resp.ok) throw new Error(`http error: ${resp.status}`);
            thirdTableColumns = await resp.json();
        } catch (err) {
            console.error('virhe kolmannen taulun sarakkeiden haussa:', err);
        }

        const exclude_cols = ['id','created','updated','openai_embedding','creation_spec'];
        const sanitizedThirdCols = thirdTableColumns.filter(tc => {
            if (exclude_cols.includes(tc.column_name.toLowerCase())) return false;
            if ((tc.column_default && tc.column_default.trim() !== '') ||
                (tc.is_identity && tc.is_identity.toLowerCase() === 'yes')) {
                return false;
            }
            return true;
        });

        // Luodaan valinta: olemassaolevan rivin dropdown TAI uuden rivin luonti
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

        // Haetaan "kolmannen taulun" data ja luodaan valikko:
        let mapped_options = [];
        try {
            const thirdTableOptions = await fetchReferencedData(info.third_table_name);
            mapped_options = thirdTableOptions.map(opt => {
                const pk_column = Object.keys(opt).find(key => key !== 'display');
                return {
                    value: opt[pk_column],
                    label: `${opt[pk_column]} - ${opt['display']}`
                };
            });
        } catch (err) {
            console.error('virhe kolmannen taulun datan haussa:', err);
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
        fieldset.appendChild(dropdown_container);

        // Uuden rivin luontikentät
        const newRowFieldset = document.createElement('div');
        newRowFieldset.style.display = 'none'; // näytetään vain jos "new" on valittu

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

        // Radiovaihdot:
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

        // Tallennetaan tilarakenne, jonka luemme submitissä
        modal_form_state['_manyToManyRows'].push({
            linkTableName: info.link_table_name,
            mainTableFkColumn: info.mainTableFkColumn,
            thirdTableName: info.third_table_name,
            thirdTableFkColumn: info.third_table_fk_column,

            existingHiddenInput: hiddenInput,
            newRowState: newM2MObjectState,
            modeRadioName: `m2m_mode_${info.third_table_name}`
        });

        form.appendChild(fieldset);
    }

    // Lomakkeen lopun painikkeet
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

    // Estetään vahingossa tehtävät submitit: vain "Lisää"-painike saa kutsua submit_new_row
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Jos submitteri ei ole nimenomaan "Lisää"-painike, ei lisätä riviä
        if (!e.submitter || e.submitter !== submit_button) {
            return;
        }
        await submit_new_row(table_name, form, columns);
    });

    // Luo ja näytä modaalin
    createModal({
        titleDataLangKey: `add_row_`+table_name,
        titleDataLangKeyFallback: `add_row`,
        contentElements: [form],
        width: '600px',
    });

    showModal();
    console.log('Modal displayed successfully.');
}

/** Hakee lapsi-suhteet suoraan taulusta foreign_key_relations_1_m */
async function fetchOneToManyRelations(tableName) {
    try {
        const response = await fetch(`/api/get-1m-relations?table=${tableName}`);
        if (!response.ok) {
            if (debug) {
                console.debug(`Ei löytynyt 1->m-suhteita taululle ${tableName}, status: ${response.status}`);
            }
            return [];
        }
        return await response.json();
    } catch (error) {
        if (debug) {
            console.debug(`virhe haettaessa 1->m-suhteita taululle ${tableName}:`, error);
        }
        return [];
    }
}

/** Haetaan monesta->moneen -liitokset (kuten ennen) */
export async function fetchManyToManyInfos(tableName) {
    try {
        const response = await fetch(`/api/get-many-to-many?table=${tableName}`);
        if (!response.ok) {
            if (debug) {
                console.debug(`Ei löytynyt monesta-moneen-liitoksia taululle ${tableName}, status: ${response.status}`);
            }
            return [];
        }
        return await response.json();
    } catch (error) {
        if (debug) {
            console.debug(`virhe haettaessa monesta-moneen-liitoksia taululle ${tableName}:`, error);
        }
        return [];
    }
}

/** Haetaan ulkoisen avaimen taulun data, josta valikko generoitava */
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

/** Lomakkeen submit: lähetetään pään data, lapsidatat ja M2M. */
async function submit_new_row(table_name, form, columns) {
    const form_data = new FormData(form);
    const data = {};

    // 1) Pään taulun sarakkeet
    columns.forEach(column => {
        let value = form_data.get(column.column_name);
        if (column.data_type.toLowerCase() === 'boolean') {
            value = form.elements[column.column_name].checked;
        }
        data[column.column_name] = value;
    });

    // 2) Lapsidata
    if (modal_form_state['_childRowsArray'] && modal_form_state['_childRowsArray'].length > 0) {
        data['_childRows'] = modal_form_state['_childRowsArray'];
    }

    // 3) Monesta->moneen -liitokset
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
                // On valittu “new”. Luetaan newRowState
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
        data['_manyToMany'] = finalM2M;
    }

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

/** Kun uusi rivi lisätty, haetaan taulun sisältö uudelleen ja generoidaan näkyviin */
async function reload_table(table_name) {
    try {
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


// // add_row.js

// import { generate_table } from '../../../logical_components/table_views/view_table.js';
// import { createModal, showModal, hideModal } from '../../../logical_components/modal/modal_factory.js';
// import { fetchTableData } from '../../endpoints/endpoint_data_fetcher.js';
// import { createVanillaDropdown } from '../../../logical_components/vanilla_dropdown/vanilla_dropdown.js';

// var debug = true; 

// // Säilytetään lomakkeen tilaa globaalisti modaalin osalta
// let modal_form_state = {};

// // ---------------------------------------------
// // Auto-resize logiikka kaikille textareille,
// // joilla on auto_resize_textarea -luokka.
// // ---------------------------------------------
// document.addEventListener('input', (event) => {
//     if (event.target.classList.contains('auto_resize_textarea')) {
//         event.target.style.height = 'auto';
//         event.target.style.height = event.target.scrollHeight + 'px';
//     }
// });

// /**
//  * Avataan rivinlisäyslomake. Hakee saraketiedot,
//  * lapsitaulut (yksi-moneen) ja monesta-moneen-liitokset,
//  * ja rakentaa lomakkeen dynaamisesti.
//  */
// export async function open_add_row_modal(table_name) {
//     console.log('open_add_row_modal, table:', table_name);
//     let columns_info;
//     try {
//         const response = await fetch(`/api/get-columns?table=${table_name}`);
//         if (!response.ok) {
//             throw new Error(`http error! status: ${response.status}`);
//         }
//         columns_info = await response.json();
//         console.log('columns_info:', columns_info);
//     } catch (error) {
//         console.error(`Error fetching column information for table ${table_name}:`, error);
//         alert('Virhe haettaessa saraketietoja.');
//         return;
//     }

//     if (!columns_info || columns_info.length === 0) {
//         console.error('No column information received.');
//         alert('Taululle ei ole saatavilla sarakkeita.');
//         return;
//     }

//     // Haetaan taulut, jotka ovat 1->m-suhteessa TÄHÄN tauluun
//     let oneToManyRelations = [];
//     try {
//         oneToManyRelations = await fetchOneToManyRelations(table_name);
//         if (!oneToManyRelations) {
//             if (debug) {
//                 console.debug('oneToManyRelations on null, asetetaan tyhjäksi taulukoksi');
//             }
//             oneToManyRelations = [];
//         }
//         console.log('oneToManyRelations:', oneToManyRelations);
//     } catch (err) {
//         if (debug) {
//             console.debug('virhe haettaessa 1->m-suhteita:', err);
//         }
//         oneToManyRelations = [];
//     }

//     // Haetaan monesta-moneen -liitokset
//     let manyToManyInfos = [];
//     try {
//         manyToManyInfos = await fetchManyToManyInfos(table_name);
//         if (!manyToManyInfos) {
//             if (debug) {
//                 console.debug('manyToManyInfos on null, asetetaan tyhjäksi taulukoksi');
//             }
//             manyToManyInfos = [];
//         }
//         console.log('manyToManyInfos:', manyToManyInfos);
//     } catch (err) {
//         if (debug) {
//             console.debug('virhe M2M-hauissa:', err);
//         }
//         manyToManyInfos = [];
//     }

//     // Määritä poissuljettavat sarakkeet
//     const exclude_columns = ['id', 'created', 'updated', 'openai_embedding', 'creation_spec'];

//     // Suodata pään taulun sarakkeet
//     const columns = columns_info.filter(col => {
//         const column_name = col.column_name.toLowerCase();
//         const column_default = col.column_default;
//         const is_identity = col.is_identity && col.is_identity.toLowerCase() === 'yes';

//         if (exclude_columns.includes(column_name)) {
//             return false;
//         }
//         // Jos sarakkeella on oletusarvo, tai se on identity-sarake,
//         // ei kysytä lomakkeella
//         if ((column_default && column_default.trim() !== '') || is_identity) {
//             return false;
//         }
//         return true;
//     });

//     if (columns.length === 0) {
//         console.error('No columns available to display in the modal.');
//         alert('Taululle ei ole lisättäviä sarakkeita.');
//         return;
//     }

//     // Luodaan pää-lomake
//     const form = document.createElement('form');
//     form.id = 'add_row_form';
//     form.style.display = 'flex';
//     form.style.flexDirection = 'column';

//     // Rakennetaan pään taulun lomakekentät
//     for (const column of columns) {
//         const label = document.createElement('label');
//         label.textContent = column.column_name;
//         label.htmlFor = `${table_name}-${column.column_name}-input`;
//         label.style.margin = '10px 0 5px';

//         // Jos sarake on foreign key => dropdown
//         if (column.foreign_table_name) {
//             const dropdown_container = document.createElement('div');
//             dropdown_container.id = `${table_name}-${column.column_name}-input`;
//             dropdown_container.style.marginBottom = '10px';

//             let options = await fetchReferencedData(column.foreign_table_name);
//             if (!Array.isArray(options)) {
//                 console.warn(`fetchReferencedData ei palauttanut taulukkoa taululle ${column.foreign_table_name}.`);
//                 options = [];
//             }
//             const mapped_options = options.map(opt => {
//                 const pk_column = Object.keys(opt).find(key => key !== 'display');
//                 return {
//                     value: opt[pk_column],
//                     label: `${opt[pk_column]} - ${opt['display']}`
//                 };
//             });

//             const hidden_input = document.createElement('input');
//             hidden_input.type = 'hidden';
//             hidden_input.name = column.column_name; // sama nimi kuin sarake
//             form.appendChild(hidden_input);

//             createVanillaDropdown({
//                 containerElement: dropdown_container,
//                 options: mapped_options,
//                 placeholder: 'Valitse...',
//                 searchPlaceholder: 'Hae...',
//                 showClearButton: true,
//                 useSearch: true,
//                 onChange: (val) => {
//                     hidden_input.value = val || '';
//                     modal_form_state[column.column_name] = val;
//                 }
//             });
//             if (modal_form_state[column.column_name]) {
//                 const dd_instance = dropdown_container.__dropdown;
//                 dd_instance.setValue(modal_form_state[column.column_name], false);
//                 hidden_input.value = modal_form_state[column.column_name];
//             }
//             form.appendChild(label);
//             form.appendChild(dropdown_container);
//         } else {
//             // Muut sarakkeet => text/textarea/numerokenttä tms.
//             const data_type_lower = column.data_type.toLowerCase();
//             if (
//                 data_type_lower === 'text' ||
//                 data_type_lower.includes('varchar') ||
//                 data_type_lower.startsWith('character varying')
//             ) {
//                 const textarea = document.createElement('textarea');
//                 textarea.name = column.column_name;
//                 textarea.required = column.is_nullable.toLowerCase() === 'no';
//                 textarea.rows = 1;
//                 textarea.classList.add('auto_resize_textarea');

//                 textarea.style.lineHeight = '1.2em';
//                 textarea.style.minHeight = '2em';
//                 textarea.style.padding = '4px 6px';
//                 textarea.style.border = '1px solid var(--border_color)';
//                 textarea.style.borderRadius = '4px';
//                 textarea.style.height = 'auto';
//                 textarea.value = modal_form_state[column.column_name] || '';
//                 textarea.style.height = textarea.scrollHeight + 'px';
//                 textarea.dispatchEvent(new Event('input'));

//                 textarea.addEventListener('input', (e) => {
//                     modal_form_state[column.column_name] = e.target.value;
//                 });

//                 form.appendChild(label);
//                 form.appendChild(textarea);
//             } else {
//                 const input = document.createElement('input');
//                 input.type = get_input_type(column.data_type);
//                 input.id = `${table_name}-${column.column_name}-input`;
//                 input.name = column.column_name;
//                 input.required = column.is_nullable.toLowerCase() === 'no';
//                 input.style.padding = '8px';
//                 input.style.border = '1px solid var(--border_color)';
//                 input.style.borderRadius = '4px';

//                 if (modal_form_state[column.column_name]) {
//                     input.value = modal_form_state[column.column_name];
//                 }

//                 input.addEventListener('input', (e) => {
//                     modal_form_state[column.column_name] = e.target.value;
//                 });

//                 form.appendChild(label);
//                 form.appendChild(input);
//             }
//         }
//     }

//     //
//     // *** 1 -> monen lapsitaulut (foreign key lapsitaulussa) ***
//     //
//     modal_form_state['_childRowsArray'] = [];

//     for (const ref of oneToManyRelations) {
//         // Hae lapsitaulun saraketiedot
//         let childColumns = [];
//         try {
//             const resp = await fetch(`/api/get-columns?table=${ref.source_table_name}`);
//             if (!resp.ok) throw new Error(`http error: ${resp.status}`);
//             childColumns = await resp.json();
//         } catch (err) {
//             console.error('virhe lapsitaulun sarakkeiden haussa:', err);
//             childColumns = [];
//         }

//         // Poistetaan se sarake, joka viittaa pääriviin (ref.source_column_name),
//         // koska sen täyttö on automaattinen
//         childColumns = childColumns.filter(cc => cc.column_name !== ref.source_column_name);

//         if (childColumns.length > 0) {
//             // Tehdään yksinkertainen fieldset lapsitaulun kentille
//             const fieldset = document.createElement('fieldset');
//             fieldset.style.marginTop = '20px';
//             const legend = document.createElement('legend');
//             legend.textContent = `Lisää aliobjekti (1-m): ${ref.source_table_name}`;
//             fieldset.appendChild(legend);

//             // Luo lapsi-lomakkeen tilakokoelma
//             const childObjectState = {
//                 tableName: ref.source_table_name,
//                 referencingColumn: ref.source_column_name, // vierasavain lapsitaulussa
//                 data: {}
//             };
//             // Tallennetaan se globaaliin arrayhin
//             modal_form_state['_childRowsArray'].push(childObjectState);

//             for (const ccol of childColumns) {
//                 const label = document.createElement('label');
//                 label.textContent = ccol.column_name;
//                 label.htmlFor = `child-${ref.source_table_name}-${ccol.column_name}`;
//                 label.style.margin = '10px 0 5px';

//                 const data_type_lower = ccol.data_type.toLowerCase();
//                 let childInput;
//                 if (
//                     data_type_lower === 'text' ||
//                     data_type_lower.includes('varchar') ||
//                     data_type_lower.startsWith('character varying')
//                 ) {
//                     childInput = document.createElement('textarea');
//                     childInput.rows = 1;
//                     childInput.classList.add('auto_resize_textarea');
//                 } else {
//                     childInput = document.createElement('input');
//                     childInput.type = get_input_type(ccol.data_type);
//                 }
//                 childInput.name = ccol.column_name;
//                 childInput.style.marginBottom = '5px';
//                 childInput.style.border = '1px solid var(--border_color)';
//                 childInput.style.borderRadius = '4px';

//                 // Tallennetaan arvo childObjectStateen
//                 childInput.addEventListener('input', (e) => {
//                     childObjectState.data[ccol.column_name] = e.target.value;
//                 });

//                 fieldset.appendChild(label);
//                 fieldset.appendChild(childInput);
//             }
//             form.appendChild(fieldset);
//         }
//     }

//     //
//     // *** monesta -> moneen -liitokset ***
//     //
//     modal_form_state['_manyToManyRows'] = [];

//     for (const info of manyToManyInfos) {
//         // info.link_table_name, info.mainTableFkColumn, info.thirdTableName, info.thirdTableFkColumn
//         const fieldset = document.createElement('fieldset');
//         fieldset.style.marginTop = '20px';
//         const legend = document.createElement('legend');
//         legend.textContent = `Lisää monesta-moneen-liitos: ${info.third_table_name}`;
//         fieldset.appendChild(legend);

//         // Haetaan "kolmannen taulun" saraketiedot, jotta voidaan vaihtoehtoisesti lisätä uusi rivi
//         let thirdTableColumns = [];
//         try {
//             const resp = await fetch(`/api/get-columns?table=${info.third_table_name}`);
//             if (!resp.ok) throw new Error(`http error: ${resp.status}`);
//             thirdTableColumns = await resp.json();
//         } catch (err) {
//             console.error('virhe kolmannen taulun sarakkeiden haussa:', err);
//         }

//         const exclude_cols = ['id','created','updated','openai_embedding','creation_spec'];
//         const sanitizedThirdCols = thirdTableColumns.filter(tc => {
//             if (exclude_cols.includes(tc.column_name.toLowerCase())) return false;
//             if ((tc.column_default && tc.column_default.trim() !== '') ||
//                 (tc.is_identity && tc.is_identity.toLowerCase() === 'yes')) {
//                 return false;
//             }
//             return true;
//         });

//         // Luodaan valinta: olemassaolevan rivin dropdown TAI uuden rivin luonti
//         const radioContainer = document.createElement('div');
//         radioContainer.style.display = 'flex';
//         radioContainer.style.gap = '1em';

//         const existingRadio = document.createElement('input');
//         existingRadio.type = 'radio';
//         existingRadio.name = `m2m_mode_${info.third_table_name}`;
//         existingRadio.value = 'existing';
//         existingRadio.checked = true;
//         const existingRadioLabel = document.createElement('label');
//         existingRadioLabel.textContent = 'Valitse olemassaolevista';

//         const newRadio = document.createElement('input');
//         newRadio.type = 'radio';
//         newRadio.name = `m2m_mode_${info.third_table_name}`;
//         newRadio.value = 'new';
//         const newRadioLabel = document.createElement('label');
//         newRadioLabel.textContent = 'Luo kokonaan uusi rivi';

//         radioContainer.appendChild(existingRadio);
//         radioContainer.appendChild(existingRadioLabel);
//         radioContainer.appendChild(newRadio);
//         radioContainer.appendChild(newRadioLabel);

//         fieldset.appendChild(radioContainer);

//         // Dropdown + hidden input
//         const dropdown_container = document.createElement('div');
//         dropdown_container.style.marginTop = '1em';

//         const hiddenInput = document.createElement('input');
//         hiddenInput.type = 'hidden';
//         hiddenInput.name = `_m2m_existing_${info.link_table_name}_${info.third_table_name}`;
//         dropdown_container.appendChild(hiddenInput);

//         // Haetaan "kolmannen taulun" data ja luodaan valikko:
//         let mapped_options = [];
//         try {
//             const thirdTableOptions = await fetchReferencedData(info.third_table_name);
//             mapped_options = thirdTableOptions.map(opt => {
//                 const pk_column = Object.keys(opt).find(key => key !== 'display');
//                 return {
//                     value: opt[pk_column],
//                     label: `${opt[pk_column]} - ${opt['display']}`
//                 };
//             });
//         } catch (err) {
//             console.error('virhe kolmannen taulun datan haussa:', err);
//         }

//         createVanillaDropdown({
//             containerElement: dropdown_container,
//             options: mapped_options,
//             placeholder: `Valitse ${info.third_table_name}...`,
//             searchPlaceholder: 'Hae...',
//             showClearButton: true,
//             useSearch: true,
//             onChange: (val) => {
//                 hiddenInput.value = val || '';
//             }
//         });
//         fieldset.appendChild(dropdown_container);

//         // Uuden rivin luontikentät
//         const newRowFieldset = document.createElement('div');
//         newRowFieldset.style.display = 'none'; // näytetään vain jos "new" on valittu

//         const newM2MObjectState = {
//             tableName: info.third_table_name,
//             data: {}
//         };

//         for (const ccol of sanitizedThirdCols) {
//             const label = document.createElement('label');
//             label.textContent = ccol.column_name;
//             label.style.display = 'block';

//             let inputElem;
//             const data_type_lower = ccol.data_type.toLowerCase();
//             if (data_type_lower.includes('text') || data_type_lower.includes('char')) {
//                 inputElem = document.createElement('textarea');
//                 inputElem.rows = 1;
//                 inputElem.classList.add('auto_resize_textarea');
//             } else {
//                 inputElem = document.createElement('input');
//                 inputElem.type = get_input_type(ccol.data_type);
//             }
//             inputElem.name = ccol.column_name;
//             inputElem.style.border = '1px solid var(--border_color)';
//             inputElem.style.borderRadius = '4px';
//             inputElem.style.display = 'block';
//             inputElem.style.marginBottom = '6px';

//             inputElem.addEventListener('input', (e) => {
//                 newM2MObjectState.data[ccol.column_name] = e.target.value;
//             });

//             newRowFieldset.appendChild(label);
//             newRowFieldset.appendChild(inputElem);
//         }

//         fieldset.appendChild(newRowFieldset);

//         // Radiovaihdot:
//         existingRadio.addEventListener('change', () => {
//             if (existingRadio.checked) {
//                 dropdown_container.style.display = 'block';
//                 newRowFieldset.style.display = 'none';
//             }
//         });
//         newRadio.addEventListener('change', () => {
//             if (newRadio.checked) {
//                 dropdown_container.style.display = 'none';
//                 newRowFieldset.style.display = 'block';
//             }
//         });

//         // Tallennetaan tilarakenne, jonka luemme submitissä
//         modal_form_state['_manyToManyRows'].push({
//             linkTableName: info.link_table_name,
//             mainTableFkColumn: info.mainTableFkColumn,
//             thirdTableName: info.third_table_name,
//             thirdTableFkColumn: info.third_table_fk_column,

//             existingHiddenInput: hiddenInput,
//             newRowState: newM2MObjectState,
//             modeRadioName: `m2m_mode_${info.third_table_name}`
//         });

//         form.appendChild(fieldset);
//     }

//     // Lomakkeen lopun painikkeet
//     const form_actions = document.createElement('div');
//     form_actions.style.display = 'flex';
//     form_actions.style.justifyContent = 'flex-end';
//     form_actions.style.marginTop = '20px';

//     const cancel_button = document.createElement('button');
//     cancel_button.type = 'button';
//     cancel_button.textContent = 'Peruuta';
//     cancel_button.style.padding = '8px 16px';
//     cancel_button.style.marginLeft = '10px';
//     cancel_button.style.border = 'none';
//     cancel_button.style.borderRadius = '4px';
//     cancel_button.style.cursor = 'pointer';
//     cancel_button.addEventListener('click', hideModal);

//     const submit_button = document.createElement('button');
//     submit_button.type = 'submit';
//     submit_button.textContent = 'Lisää';
//     submit_button.style.padding = '8px 16px';
//     submit_button.style.marginLeft = '10px';
//     submit_button.style.border = 'none';
//     submit_button.style.borderRadius = '4px';
//     submit_button.style.cursor = 'pointer';

//     form_actions.appendChild(cancel_button);
//     form_actions.appendChild(submit_button);
//     form.appendChild(form_actions);

//     // Submit
//     form.addEventListener('submit', async (e) => {
//         e.preventDefault();
//         await submit_new_row(table_name, form, columns);
//     });

//     // Luo ja näytä modaalin
//     createModal({
//         titleDataLangKey: `add_new_row`,
//         contentElements: [form],
//         width: '600px',
//     });

//     showModal();
//     console.log('Modal displayed successfully.');
// }

// /** Hakee lapsi-suhteet suoraan taulusta foreign_key_relations_1_m */
// async function fetchOneToManyRelations(tableName) {
//     try {
//         const response = await fetch(`/api/get-1m-relations?table=${tableName}`);
//         if (!response.ok) {
//             if (debug) {
//                 console.debug(`Ei löytynyt 1->m-suhteita taululle ${tableName}, status: ${response.status}`);
//             }
//             return [];
//         }
//         return await response.json();
//     } catch (error) {
//         if (debug) {
//             console.debug(`virhe haettaessa 1->m-suhteita taululle ${tableName}:`, error);
//         }
//         return [];
//     }
// }

// /** Haetaan monesta->moneen -liitokset (kuten ennen) */
// export async function fetchManyToManyInfos(tableName) {
//     try {
//         const response = await fetch(`/api/get-many-to-many?table=${tableName}`);
//         if (!response.ok) {
//             if (debug) {
//                 console.debug(`Ei löytynyt monesta-moneen-liitoksia taululle ${tableName}, status: ${response.status}`);
//             }
//             return [];
//         }
//         return await response.json();
//     } catch (error) {
//         if (debug) {
//             console.debug(`virhe haettaessa monesta-moneen-liitoksia taululle ${tableName}:`, error);
//         }
//         return [];
//     }
// }

// /** Haetaan ulkoisen avaimen taulun data, josta valikko generoitava */
// export async function fetchReferencedData(foreign_table_name) {
//     try {
//         const response = await fetch(`/referenced-data?table=${foreign_table_name}`);
//         if (!response.ok) {
//             throw new Error(`http error! status: ${response.status}`);
//         }
//         const data = await response.json();

//         if (!Array.isArray(data)) {
//             console.warn(`fetchReferencedData: odotettiin taulukkoa, mutta saatiin:`, data);
//             return [];
//         }
//         return data;
//     } catch (error) {
//         console.error(`virhe haettaessa dataa taulusta ${foreign_table_name}:`, error);
//         return [];
//     }
// }

// /** Päätellään input-tyyppi datatyypin perusteella */
// function get_input_type(data_type) {
//     switch (data_type.toLowerCase()) {
//         case 'integer':
//         case 'bigint':
//         case 'smallint':
//         case 'numeric':
//             return 'number';
//         case 'boolean':
//             return 'checkbox';
//         case 'date':
//             return 'date';
//         case 'timestamp':
//         case 'timestamp without time zone':
//         case 'timestamp with time zone':
//             return 'datetime-local';
//         default:
//             return 'text';
//     }
// }

// /** Lomakkeen submit: lähetetään pään data, lapsidatat ja M2M. */
// async function submit_new_row(table_name, form, columns) {
//     const form_data = new FormData(form);
//     const data = {};

//     // 1) Pään taulun sarakkeet
//     columns.forEach(column => {
//         let value = form_data.get(column.column_name);
//         if (column.data_type.toLowerCase() === 'boolean') {
//             value = form.elements[column.column_name].checked;
//         }
//         data[column.column_name] = value;
//     });

//     // 2) Lapsidata
//     if (modal_form_state['_childRowsArray'] && modal_form_state['_childRowsArray'].length > 0) {
//         data['_childRows'] = modal_form_state['_childRowsArray'];
//     }

//     // 3) Monesta->moneen -liitokset
//     let finalM2M = [];
//     if (modal_form_state['_manyToManyRows'] && modal_form_state['_manyToManyRows'].length > 0) {
//         for (let m2m of modal_form_state['_manyToManyRows']) {
//             const modeInputs = form.querySelectorAll(`input[name="${m2m.modeRadioName}"]`);
//             let selectedMode = 'existing';
//             modeInputs.forEach(radio => {
//                 if (radio.checked) {
//                     selectedMode = radio.value;
//                 }
//             });

//             if (selectedMode === 'existing') {
//                 const existingVal = m2m.existingHiddenInput.value;
//                 if (existingVal) {
//                     finalM2M.push({
//                         linkTableName: m2m.linkTableName,
//                         mainTableFkColumn: m2m.mainTableFkColumn,
//                         thirdTableName: m2m.thirdTableName,
//                         thirdTableFkColumn: m2m.thirdTableFkColumn,
//                         selectedValue: existingVal,
//                         isNewRow: false
//                     });
//                 }
//             } else {
//                 // On valittu “new”. Luetaan newRowState
//                 const newData = m2m.newRowState.data || {};
//                 if (Object.keys(newData).length > 0) {
//                     finalM2M.push({
//                         linkTableName: m2m.linkTableName,
//                         mainTableFkColumn: m2m.mainTableFkColumn,
//                         thirdTableName: m2m.thirdTableName,
//                         thirdTableFkColumn: m2m.thirdTableFkColumn,
//                         isNewRow: true,
//                         newRowData: newData
//                     });
//                 }
//             }
//         }
//     }
//     if (finalM2M.length > 0) {
//         data['_manyToMany'] = finalM2M;
//     }

//     try {
//         const response = await fetch(`/api/add-row?table=${table_name}`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(data),
//         });

//         if (response.ok) {
//             alert('Rivi lisätty onnistuneesti!');
//             hideModal();
//             modal_form_state = {};
//             await reload_table(table_name);
//         } else {
//             const error_data = await response.json();
//             alert(`Virhe uuden rivin lisäämisessä: ${error_data.message || 'Tuntematon virhe.'}`);
//         }
//     } catch (error) {
//         console.error('virhe uuden rivin lisäämisessä:', error);
//         alert('virhe uuden rivin lisäämisessä.');
//     }
// }

// /** Kun uusi rivi lisätty, haetaan taulun sisältö uudelleen ja generoidaan näkyviin */
// async function reload_table(table_name) {
//     try {
//         const result = await fetchTableData({
//             table_name: table_name
//         });
//         const data = result.data;
//         const columns = result.columns;
//         const types = result.types; // jos taustalta tulee myös types

//         await generate_table(table_name, columns, data, types);
//     } catch (error) {
//         console.error(`virhe taulun ${table_name} lataamisessa:`, error);
//     }
// }

// // // add_row.js 2025-03-04--21-58

// // import { generate_table } from '../../../logical_components/table_views/view_table.js';
// // import { createModal, showModal, hideModal } from '../../../logical_components/modal/modal_factory.js';
// // import { fetchTableData } from '../../endpoints/endpoint_data_fetcher.js';
// // import { createVanillaDropdown } from '../../../logical_components/vanilla_dropdown/vanilla_dropdown.js';

// // var debug = true; 

// // // Säilytetään lomakkeen tilaa globaalisti modaalin osalta
// // let modal_form_state = {};

// // // ---------------------------------------------
// // // Auto-resize logiikka kaikille textareille,
// // // joilla on auto_resize_textarea -luokka.
// // // ---------------------------------------------
// // document.addEventListener('input', (event) => {
// //     if (event.target.classList.contains('auto_resize_textarea')) {
// //         event.target.style.height = 'auto';
// //         event.target.style.height = event.target.scrollHeight + 'px';
// //     }
// // });

// // /**
// //  * Avataan rivinlisäyslomake. Hakee saraketiedot,
// //  * lapsitaulut (yksi-moneen) ja monesta-moneen-liitokset,
// //  * ja rakentaa lomakkeen dynaamisesti.
// //  */
// // export async function open_add_row_modal(table_name) {
// //     console.log('open_add_row_modal, table:', table_name);
// //     let columns_info;
// //     try {
// //         const response = await fetch(`/api/get-columns?table=${table_name}`);
// //         if (!response.ok) {
// //             throw new Error(`http error! status: ${response.status}`);
// //         }
// //         columns_info = await response.json();
// //         console.log('columns_info:', columns_info);
// //     } catch (error) {
// //         console.error(`Error fetching column information for table ${table_name}:`, error);
// //         alert('Virhe haettaessa saraketietoja.');
// //         return;
// //     }

// //     if (!columns_info || columns_info.length === 0) {
// //         console.error('No column information received.');
// //         alert('Taululle ei ole saatavilla sarakkeita.');
// //         return;
// //     }

// //     // Haetaan taulut, jotka ovat 1->m-suhteessa TÄHÄN tauluun
// //     let oneToManyRelations = [];
// //     try {
// //         oneToManyRelations = await fetchOneToManyRelations(table_name);
// //         if (!oneToManyRelations) {
// //             if (debug) {
// //                 console.debug('oneToManyRelations on null, asetetaan tyhjäksi taulukoksi');
// //             }
// //             oneToManyRelations = [];
// //         }
// //         console.log('oneToManyRelations:', oneToManyRelations);
// //     } catch (err) {
// //         if (debug) {
// //             console.debug('virhe haettaessa 1->m-suhteita:', err);
// //         }
// //         oneToManyRelations = [];
// //     }

// //     // Haetaan monesta-moneen -liitokset
// //     let manyToManyInfos = [];
// //     try {
// //         manyToManyInfos = await fetchManyToManyInfos(table_name);
// //         if (!manyToManyInfos) {
// //             if (debug) {
// //                 console.debug('manyToManyInfos on null, asetetaan tyhjäksi taulukoksi');
// //             }
// //             manyToManyInfos = [];
// //         }
// //         console.log('manyToManyInfos:', manyToManyInfos);
// //     } catch (err) {
// //         if (debug) {
// //             console.debug('virhe M2M-hauissa:', err);
// //         }
// //         manyToManyInfos = [];
// //     }

// //     // Määritä poissuljettavat sarakkeet
// //     const exclude_columns = ['id', 'created', 'updated', 'openai_embedding', 'creation_spec'];

// //     // Suodata pään taulun sarakkeet
// //     const columns = columns_info.filter(col => {
// //         const column_name = col.column_name.toLowerCase();
// //         const column_default = col.column_default;
// //         const is_identity = col.is_identity && col.is_identity.toLowerCase() === 'yes';

// //         if (exclude_columns.includes(column_name)) {
// //             return false;
// //         }
// //         // Jos sarakkeella on oletusarvo, tai se on identity-sarake,
// //         // ei kysytä lomakkeella
// //         if ((column_default && column_default.trim() !== '') || is_identity) {
// //             return false;
// //         }
// //         return true;
// //     });

// //     if (columns.length === 0) {
// //         console.error('No columns available to display in the modal.');
// //         alert('Taululle ei ole lisättäviä sarakkeita.');
// //         return;
// //     }

// //     // Luodaan pää-lomake
// //     const form = document.createElement('form');
// //     form.id = 'add_row_form';
// //     form.style.display = 'flex';
// //     form.style.flexDirection = 'column';

// //     // Rakennetaan pään taulun lomakekentät
// //     for (const column of columns) {
// //         const label = document.createElement('label');
// //         label.textContent = column.column_name;
// //         label.htmlFor = `${table_name}-${column.column_name}-input`;
// //         label.style.margin = '10px 0 5px';

// //         // Jos sarake on foreign key => dropdown
// //         if (column.foreign_table_name) {
// //             const dropdown_container = document.createElement('div');
// //             dropdown_container.id = `${table_name}-${column.column_name}-input`;
// //             dropdown_container.style.marginBottom = '10px';

// //             let options = await fetchReferencedData(column.foreign_table_name);
// //             if (!Array.isArray(options)) {
// //                 console.warn(`fetchReferencedData ei palauttanut taulukkoa taululle ${column.foreign_table_name}.`);
// //                 options = [];
// //             }
// //             const mapped_options = options.map(opt => {
// //                 const pk_column = Object.keys(opt).find(key => key !== 'display');
// //                 return {
// //                     value: opt[pk_column],
// //                     label: `${opt[pk_column]} - ${opt['display']}`
// //                 };
// //             });

// //             const hidden_input = document.createElement('input');
// //             hidden_input.type = 'hidden';
// //             hidden_input.name = column.column_name; // sama nimi kuin sarake
// //             form.appendChild(hidden_input);

// //             createVanillaDropdown({
// //                 containerElement: dropdown_container,
// //                 options: mapped_options,
// //                 placeholder: 'Valitse...',
// //                 searchPlaceholder: 'Hae...',
// //                 showClearButton: true,
// //                 useSearch: true,
// //                 onChange: (val) => {
// //                     hidden_input.value = val || '';
// //                     modal_form_state[column.column_name] = val;
// //                 }
// //             });
// //             if (modal_form_state[column.column_name]) {
// //                 const dd_instance = dropdown_container.__dropdown;
// //                 dd_instance.setValue(modal_form_state[column.column_name], false);
// //                 hidden_input.value = modal_form_state[column.column_name];
// //             }
// //             form.appendChild(label);
// //             form.appendChild(dropdown_container);
// //         } else {
// //             // Muut sarakkeet => text/textarea/numerokenttä tms.
// //             const data_type_lower = column.data_type.toLowerCase();
// //             if (
// //                 data_type_lower === 'text' ||
// //                 data_type_lower.includes('varchar') ||
// //                 data_type_lower.startsWith('character varying')
// //             ) {
// //                 const textarea = document.createElement('textarea');
// //                 textarea.name = column.column_name;
// //                 textarea.required = column.is_nullable.toLowerCase() === 'no';
// //                 textarea.rows = 1;
// //                 textarea.classList.add('auto_resize_textarea');

// //                 textarea.style.lineHeight = '1.2em';
// //                 textarea.style.minHeight = '2em';
// //                 textarea.style.padding = '4px 6px';
// //                 textarea.style.border = '1px solid var(--border_color)';
// //                 textarea.style.borderRadius = '4px';
// //                 textarea.style.height = 'auto';
// //                 textarea.value = modal_form_state[column.column_name] || '';
// //                 textarea.style.height = textarea.scrollHeight + 'px';
// //                 textarea.dispatchEvent(new Event('input'));

// //                 textarea.addEventListener('input', (e) => {
// //                     modal_form_state[column.column_name] = e.target.value;
// //                 });

// //                 form.appendChild(label);
// //                 form.appendChild(textarea);
// //             } else {
// //                 const input = document.createElement('input');
// //                 input.type = get_input_type(column.data_type);
// //                 input.id = `${table_name}-${column.column_name}-input`;
// //                 input.name = column.column_name;
// //                 input.required = column.is_nullable.toLowerCase() === 'no';
// //                 input.style.padding = '8px';
// //                 input.style.border = '1px solid var(--border_color)';
// //                 input.style.borderRadius = '4px';

// //                 if (modal_form_state[column.column_name]) {
// //                     input.value = modal_form_state[column.column_name];
// //                 }

// //                 input.addEventListener('input', (e) => {
// //                     modal_form_state[column.column_name] = e.target.value;
// //                 });

// //                 form.appendChild(label);
// //                 form.appendChild(input);
// //             }
// //         }
// //     }

// //     //
// //     // *** 1 -> monen lapsitaulut (foreign key lapsitaulussa) ***
// //     //
// //     modal_form_state['_childRowsArray'] = [];

// //     for (const ref of oneToManyRelations) {
// //         // Hae lapsitaulun saraketiedot
// //         let childColumns = [];
// //         try {
// //             const resp = await fetch(`/api/get-columns?table=${ref.source_table_name}`);
// //             if (!resp.ok) throw new Error(`http error: ${resp.status}`);
// //             childColumns = await resp.json();
// //         } catch (err) {
// //             console.error('virhe lapsitaulun sarakkeiden haussa:', err);
// //             childColumns = [];
// //         }

// //         // Poistetaan se sarake, joka viittaa pääriviin (ref.source_column_name),
// //         // koska sen täyttö on automaattinen
// //         childColumns = childColumns.filter(cc => cc.column_name !== ref.source_column_name);

// //         if (childColumns.length > 0) {
// //             // Tehdään yksinkertainen fieldset lapsitaulun kentille
// //             const fieldset = document.createElement('fieldset');
// //             fieldset.style.marginTop = '20px';
// //             const legend = document.createElement('legend');
// //             legend.textContent = `Lisää aliobjekti (1-m): ${ref.source_table_name}`;
// //             fieldset.appendChild(legend);

// //             // Luo lapsi-lomakkeen tilakokoelma
// //             const childObjectState = {
// //                 tableName: ref.source_table_name,
// //                 referencingColumn: ref.source_column_name, // vierasavain lapsitaulussa
// //                 data: {}
// //             };
// //             // Tallennetaan se globaaliin arrayhin
// //             modal_form_state['_childRowsArray'].push(childObjectState);

// //             for (const ccol of childColumns) {
// //                 const label = document.createElement('label');
// //                 label.textContent = ccol.column_name;
// //                 label.htmlFor = `child-${ref.source_table_name}-${ccol.column_name}`;
// //                 label.style.margin = '10px 0 5px';

// //                 const data_type_lower = ccol.data_type.toLowerCase();
// //                 let childInput;
// //                 if (
// //                     data_type_lower === 'text' ||
// //                     data_type_lower.includes('varchar') ||
// //                     data_type_lower.startsWith('character varying')
// //                 ) {
// //                     childInput = document.createElement('textarea');
// //                     childInput.rows = 1;
// //                     childInput.classList.add('auto_resize_textarea');
// //                 } else {
// //                     childInput = document.createElement('input');
// //                     childInput.type = get_input_type(ccol.data_type);
// //                 }
// //                 childInput.name = ccol.column_name;
// //                 childInput.style.marginBottom = '5px';
// //                 childInput.style.border = '1px solid var(--border_color)';
// //                 childInput.style.borderRadius = '4px';

// //                 // Tallennetaan arvo childObjectStateen
// //                 childInput.addEventListener('input', (e) => {
// //                     childObjectState.data[ccol.column_name] = e.target.value;
// //                 });

// //                 fieldset.appendChild(label);
// //                 fieldset.appendChild(childInput);
// //             }
// //             form.appendChild(fieldset);
// //         }
// //     }

// //     //
// //     // *** monesta -> moneen -liitokset ***
// //     //
// //     modal_form_state['_manyToManyRows'] = [];

// //     for (const info of manyToManyInfos) {
// //         // info.link_table_name, info.mainTableFkColumn, info.thirdTableName, info.thirdTableFkColumn
// //         const fieldset = document.createElement('fieldset');
// //         fieldset.style.marginTop = '20px';
// //         const legend = document.createElement('legend');
// //         legend.textContent = `Lisää monesta-moneen-liitos: ${info.third_table_name}`;
// //         fieldset.appendChild(legend);

// //         // Haetaan "kolmannen taulun" saraketiedot, jotta voidaan vaihtoehtoisesti lisätä uusi rivi
// //         let thirdTableColumns = [];
// //         try {
// //             const resp = await fetch(`/api/get-columns?table=${info.third_table_name}`);
// //             if (!resp.ok) throw new Error(`http error: ${resp.status}`);
// //             thirdTableColumns = await resp.json();
// //         } catch (err) {
// //             console.error('virhe kolmannen taulun sarakkeiden haussa:', err);
// //         }

// //         const exclude_cols = ['id','created','updated','openai_embedding','creation_spec'];
// //         const sanitizedThirdCols = thirdTableColumns.filter(tc => {
// //             if (exclude_cols.includes(tc.column_name.toLowerCase())) return false;
// //             if ((tc.column_default && tc.column_default.trim() !== '') ||
// //                 (tc.is_identity && tc.is_identity.toLowerCase() === 'yes')) {
// //                 return false;
// //             }
// //             return true;
// //         });

// //         // Luodaan valinta: olemassaolevan rivin dropdown TAI uuden rivin luonti
// //         const radioContainer = document.createElement('div');
// //         radioContainer.style.display = 'flex';
// //         radioContainer.style.gap = '1em';

// //         const existingRadio = document.createElement('input');
// //         existingRadio.type = 'radio';
// //         existingRadio.name = `m2m_mode_${info.third_table_name}`;
// //         existingRadio.value = 'existing';
// //         existingRadio.checked = true;
// //         const existingRadioLabel = document.createElement('label');
// //         existingRadioLabel.textContent = 'Valitse olemassaolevista';

// //         const newRadio = document.createElement('input');
// //         newRadio.type = 'radio';
// //         newRadio.name = `m2m_mode_${info.third_table_name}`;
// //         newRadio.value = 'new';
// //         const newRadioLabel = document.createElement('label');
// //         newRadioLabel.textContent = 'Luo kokonaan uusi rivi';

// //         radioContainer.appendChild(existingRadio);
// //         radioContainer.appendChild(existingRadioLabel);
// //         radioContainer.appendChild(newRadio);
// //         radioContainer.appendChild(newRadioLabel);

// //         fieldset.appendChild(radioContainer);

// //         // Dropdown + hidden input
// //         const dropdown_container = document.createElement('div');
// //         dropdown_container.style.marginTop = '1em';

// //         const hiddenInput = document.createElement('input');
// //         hiddenInput.type = 'hidden';
// //         hiddenInput.name = `_m2m_existing_${info.link_table_name}_${info.third_table_name}`;
// //         dropdown_container.appendChild(hiddenInput);

// //         // Haetaan "kolmannen taulun" data ja luodaan valikko:
// //         let mapped_options = [];
// //         try {
// //             const thirdTableOptions = await fetchReferencedData(info.third_table_name);
// //             mapped_options = thirdTableOptions.map(opt => {
// //                 const pk_column = Object.keys(opt).find(key => key !== 'display');
// //                 return {
// //                     value: opt[pk_column],
// //                     label: `${opt[pk_column]} - ${opt['display']}`
// //                 };
// //             });
// //         } catch (err) {
// //             console.error('virhe kolmannen taulun datan haussa:', err);
// //         }

// //         createVanillaDropdown({
// //             containerElement: dropdown_container,
// //             options: mapped_options,
// //             placeholder: `Valitse ${info.third_table_name}...`,
// //             searchPlaceholder: 'Hae...',
// //             showClearButton: true,
// //             useSearch: true,
// //             onChange: (val) => {
// //                 hiddenInput.value = val || '';
// //             }
// //         });
// //         fieldset.appendChild(dropdown_container);

// //         // Uuden rivin luontikentät
// //         const newRowFieldset = document.createElement('div');
// //         newRowFieldset.style.display = 'none'; // näytetään vain jos "new" on valittu

// //         const newM2MObjectState = {
// //             tableName: info.third_table_name,
// //             data: {}
// //         };

// //         for (const ccol of sanitizedThirdCols) {
// //             const label = document.createElement('label');
// //             label.textContent = ccol.column_name;
// //             label.style.display = 'block';

// //             let inputElem;
// //             const data_type_lower = ccol.data_type.toLowerCase();
// //             if (data_type_lower.includes('text') || data_type_lower.includes('char')) {
// //                 inputElem = document.createElement('textarea');
// //                 inputElem.rows = 1;
// //                 inputElem.classList.add('auto_resize_textarea');
// //             } else {
// //                 inputElem = document.createElement('input');
// //                 inputElem.type = get_input_type(ccol.data_type);
// //             }
// //             inputElem.name = ccol.column_name;
// //             inputElem.style.border = '1px solid var(--border_color)';
// //             inputElem.style.borderRadius = '4px';
// //             inputElem.style.display = 'block';
// //             inputElem.style.marginBottom = '6px';

// //             inputElem.addEventListener('input', (e) => {
// //                 newM2MObjectState.data[ccol.column_name] = e.target.value;
// //             });

// //             newRowFieldset.appendChild(label);
// //             newRowFieldset.appendChild(inputElem);
// //         }

// //         fieldset.appendChild(newRowFieldset);

// //         // Radiovaihdot:
// //         existingRadio.addEventListener('change', () => {
// //             if (existingRadio.checked) {
// //                 dropdown_container.style.display = 'block';
// //                 newRowFieldset.style.display = 'none';
// //             }
// //         });
// //         newRadio.addEventListener('change', () => {
// //             if (newRadio.checked) {
// //                 dropdown_container.style.display = 'none';
// //                 newRowFieldset.style.display = 'block';
// //             }
// //         });

// //         // Tallennetaan tilarakenne, jonka luemme submitissä
// //         modal_form_state['_manyToManyRows'].push({
// //             linkTableName: info.link_table_name,
// //             mainTableFkColumn: info.mainTableFkColumn,
// //             thirdTableName: info.third_table_name,
// //             thirdTableFkColumn: info.third_table_fk_column,

// //             existingHiddenInput: hiddenInput,
// //             newRowState: newM2MObjectState,
// //             modeRadioName: `m2m_mode_${info.third_table_name}`
// //         });

// //         form.appendChild(fieldset);
// //     }

// //     // Lomakkeen lopun painikkeet
// //     const form_actions = document.createElement('div');
// //     form_actions.style.display = 'flex';
// //     form_actions.style.justifyContent = 'flex-end';
// //     form_actions.style.marginTop = '20px';

// //     const cancel_button = document.createElement('button');
// //     cancel_button.type = 'button';
// //     cancel_button.textContent = 'Peruuta';
// //     cancel_button.style.padding = '8px 16px';
// //     cancel_button.style.marginLeft = '10px';
// //     cancel_button.style.border = 'none';
// //     cancel_button.style.borderRadius = '4px';
// //     cancel_button.style.cursor = 'pointer';
// //     cancel_button.addEventListener('click', hideModal);

// //     const submit_button = document.createElement('button');
// //     submit_button.type = 'submit';
// //     submit_button.textContent = 'Lisää';
// //     submit_button.style.padding = '8px 16px';
// //     submit_button.style.marginLeft = '10px';
// //     submit_button.style.border = 'none';
// //     submit_button.style.borderRadius = '4px';
// //     submit_button.style.cursor = 'pointer';

// //     form_actions.appendChild(cancel_button);
// //     form_actions.appendChild(submit_button);
// //     form.appendChild(form_actions);

// //     // Submit
// //     form.addEventListener('submit', async (e) => {
// //         e.preventDefault();
// //         await submit_new_row(table_name, form, columns);
// //     });

// //     // Luo ja näytä modaalin
// //     createModal({
// //         titleDataLangKey: `add_new_row`,
// //         contentElements: [form],
// //         width: '600px',
// //     });

// //     showModal();
// //     console.log('Modal displayed successfully.');
// // }

// // /** Hakee lapsi-suhteet suoraan taulusta foreign_key_relations_1_m */
// // async function fetchOneToManyRelations(tableName) {
// //     try {
// //         const response = await fetch(`/api/get-1m-relations?table=${tableName}`);
// //         if (!response.ok) {
// //             if (debug) {
// //                 console.debug(`Ei löytynyt 1->m-suhteita taululle ${tableName}, status: ${response.status}`);
// //             }
// //             return [];
// //         }
// //         return await response.json();
// //     } catch (error) {
// //         if (debug) {
// //             console.debug(`virhe haettaessa 1->m-suhteita taululle ${tableName}:`, error);
// //         }
// //         return [];
// //     }
// // }

// // /** Haetaan monesta->moneen -liitokset (kuten ennen) */
// // export async function fetchManyToManyInfos(tableName) {
// //     try {
// //         const response = await fetch(`/api/get-many-to-many?table=${tableName}`);
// //         if (!response.ok) {
// //             if (debug) {
// //                 console.debug(`Ei löytynyt monesta-moneen-liitoksia taululle ${tableName}, status: ${response.status}`);
// //             }
// //             return [];
// //         }
// //         return await response.json();
// //     } catch (error) {
// //         if (debug) {
// //             console.debug(`virhe haettaessa monesta-moneen-liitoksia taululle ${tableName}:`, error);
// //         }
// //         return [];
// //     }
// // }

// // /** Haetaan ulkoisen avaimen taulun data, josta valikko generoitava */
// // export async function fetchReferencedData(foreign_table_name) {
// //     try {
// //         const response = await fetch(`/referenced-data?table=${foreign_table_name}`);
// //         if (!response.ok) {
// //             throw new Error(`http error! status: ${response.status}`);
// //         }
// //         const data = await response.json();

// //         if (!Array.isArray(data)) {
// //             console.warn(`fetchReferencedData: odotettiin taulukkoa, mutta saatiin:`, data);
// //             return [];
// //         }
// //         return data;
// //     } catch (error) {
// //         console.error(`virhe haettaessa dataa taulusta ${foreign_table_name}:`, error);
// //         return [];
// //     }
// // }

// // /** Päätellään input-tyyppi datatyypin perusteella */
// // function get_input_type(data_type) {
// //     switch (data_type.toLowerCase()) {
// //         case 'integer':
// //         case 'bigint':
// //         case 'smallint':
// //         case 'numeric':
// //             return 'number';
// //         case 'boolean':
// //             return 'checkbox';
// //         case 'date':
// //             return 'date';
// //         case 'timestamp':
// //         case 'timestamp without time zone':
// //         case 'timestamp with time zone':
// //             return 'datetime-local';
// //         default:
// //             return 'text';
// //     }
// // }

// // /** Lomakkeen submit: lähetetään pään data, lapsidatat ja M2M. */
// // async function submit_new_row(table_name, form, columns) {
// //     const form_data = new FormData(form);
// //     const data = {};

// //     // 1) Pään taulun sarakkeet
// //     columns.forEach(column => {
// //         let value = form_data.get(column.column_name);
// //         if (column.data_type.toLowerCase() === 'boolean') {
// //             value = form.elements[column.column_name].checked;
// //         }
// //         data[column.column_name] = value;
// //     });

// //     // 2) Lapsidata
// //     if (modal_form_state['_childRowsArray'] && modal_form_state['_childRowsArray'].length > 0) {
// //         data['_childRows'] = modal_form_state['_childRowsArray'];
// //     }

// //     // 3) Monesta->moneen -liitokset
// //     let finalM2M = [];
// //     if (modal_form_state['_manyToManyRows'] && modal_form_state['_manyToManyRows'].length > 0) {
// //         for (let m2m of modal_form_state['_manyToManyRows']) {
// //             const modeInputs = form.querySelectorAll(`input[name="${m2m.modeRadioName}"]`);
// //             let selectedMode = 'existing';
// //             modeInputs.forEach(radio => {
// //                 if (radio.checked) {
// //                     selectedMode = radio.value;
// //                 }
// //             });

// //             if (selectedMode === 'existing') {
// //                 const existingVal = m2m.existingHiddenInput.value;
// //                 if (existingVal) {
// //                     finalM2M.push({
// //                         linkTableName: m2m.linkTableName,
// //                         mainTableFkColumn: m2m.mainTableFkColumn,
// //                         thirdTableName: m2m.thirdTableName,
// //                         thirdTableFkColumn: m2m.thirdTableFkColumn,
// //                         selectedValue: existingVal,
// //                         isNewRow: false
// //                     });
// //                 }
// //             } else {
// //                 // On valittu “new”. Luetaan newRowState
// //                 const newData = m2m.newRowState.data || {};
// //                 if (Object.keys(newData).length > 0) {
// //                     finalM2M.push({
// //                         linkTableName: m2m.linkTableName,
// //                         mainTableFkColumn: m2m.mainTableFkColumn,
// //                         thirdTableName: m2m.thirdTableName,
// //                         thirdTableFkColumn: m2m.thirdTableFkColumn,
// //                         isNewRow: true,
// //                         newRowData: newData
// //                     });
// //                 }
// //             }
// //         }
// //     }
// //     if (finalM2M.length > 0) {
// //         data['_manyToMany'] = finalM2M;
// //     }

// //     try {
// //         const response = await fetch(`/api/add-row?table=${table_name}`, {
// //             method: 'POST',
// //             headers: { 'Content-Type': 'application/json' },
// //             body: JSON.stringify(data),
// //         });

// //         if (response.ok) {
// //             alert('Rivi lisätty onnistuneesti!');
// //             hideModal();
// //             modal_form_state = {};
// //             await reload_table(table_name);
// //         } else {
// //             const error_data = await response.json();
// //             alert(`Virhe uuden rivin lisäämisessä: ${error_data.message || 'Tuntematon virhe.'}`);
// //         }
// //     } catch (error) {
// //         console.error('virhe uuden rivin lisäämisessä:', error);
// //         alert('virhe uuden rivin lisäämisessä.');
// //     }
// // }

// // /** Kun uusi rivi lisätty, haetaan taulun sisältö uudelleen ja generoidaan näkyviin */
// // async function reload_table(table_name) {
// //     try {
// //         const result = await fetchTableData({
// //             table_name: table_name
// //         });
// //         const data = result.data;
// //         const columns = result.columns;
// //         const types = result.types; // jos taustalta tulee myös types

// //         await generate_table(table_name, columns, data, types);
// //     } catch (error) {
// //         console.error(`virhe taulun ${table_name} lataamisessa:`, error);
// //     }
// // }


// // // // add_row.js

// // // import { generate_table } from '../../../logical_components/table_views/view_table.js';
// // // import { createModal, showModal, hideModal } from '../../../logical_components/modal/modal_factory.js';
// // // import { fetchTableData } from '../../endpoints/endpoint_data_fetcher.js';
// // // import { createVanillaDropdown } from '../../../logical_components/vanilla_dropdown/vanilla_dropdown.js';

// // // var debug = true; 

// // // // Säilytetään lomakkeen tilaa globaalisti modaalin osalta
// // // let modal_form_state = {};

// // // // ---------------------------------------------
// // // // Auto-resize logiikka kaikille textareille,
// // // // joilla on auto_resize_textarea -luokka.
// // // // ---------------------------------------------
// // // document.addEventListener('input', (event) => {
// // //     if (event.target.classList.contains('auto_resize_textarea')) {
// // //         event.target.style.height = 'auto';
// // //         event.target.style.height = event.target.scrollHeight + 'px';
// // //     }
// // // });

// // // /**
// // //  * Avataan rivinlisäyslomake. Hakee saraketiedot,
// // //  * lapsitaulut (yksi-moneen) ja monesta-moneen-liitokset,
// // //  * ja rakentaa lomakkeen dynaamisesti.
// // //  */
// // // export async function open_add_row_modal(table_name) {
// // //     console.log('open_add_row_modal, table:', table_name);
// // //     let columns_info;
// // //     try {
// // //         const response = await fetch(`/api/get-columns?table=${table_name}`);
// // //         if (!response.ok) {
// // //             throw new Error(`http error! status: ${response.status}`);
// // //         }
// // //         columns_info = await response.json();
// // //         console.log('columns_info:', columns_info);
// // //     } catch (error) {
// // //         console.error(`Error fetching column information for table ${table_name}:`, error);
// // //         alert('Virhe haettaessa saraketietoja.');
// // //         return;
// // //     }

// // //     if (!columns_info || columns_info.length === 0) {
// // //         console.error('No column information received.');
// // //         alert('Taululle ei ole saatavilla sarakkeita.');
// // //         return;
// // //     }

// // //     // Haetaan taulut, jotka ovat 1->m-suhteessa TÄHÄN tauluun
// // //     let oneToManyRelations = [];
// // //     try {
// // //         oneToManyRelations = await fetchOneToManyRelations(table_name);
// // //         if (!oneToManyRelations) {
// // //             if (debug) {
// // //                 console.debug('oneToManyRelations on null, asetetaan tyhjäksi taulukoksi');
// // //             }
// // //             oneToManyRelations = [];
// // //         }
// // //         console.log('oneToManyRelations:', oneToManyRelations);
// // //     } catch (err) {
// // //         if (debug) {
// // //             console.debug('virhe haettaessa 1->m-suhteita:', err);
// // //         }
// // //         oneToManyRelations = [];
// // //     }

// // //     // Haetaan monesta-moneen -liitokset
// // //     let manyToManyInfos = [];
// // //     try {
// // //         manyToManyInfos = await fetchManyToManyInfos(table_name);
// // //         if (!manyToManyInfos) {
// // //             if (debug) {
// // //                 console.debug('manyToManyInfos on null, asetetaan tyhjäksi taulukoksi');
// // //             }
// // //             manyToManyInfos = [];
// // //         }
// // //         console.log('manyToManyInfos:', manyToManyInfos);
// // //     } catch (err) {
// // //         if (debug) {
// // //             console.debug('virhe M2M-hauissa:', err);
// // //         }
// // //         manyToManyInfos = [];
// // //     }

// // //     // Määritä poissuljettavat sarakkeet
// // //     const exclude_columns = ['id', 'created', 'updated', 'openai_embedding', 'creation_spec'];

// // //     // Suodata pään taulun sarakkeet
// // //     const columns = columns_info.filter(col => {
// // //         const column_name = col.column_name.toLowerCase();
// // //         const column_default = col.column_default;
// // //         const is_identity = col.is_identity && col.is_identity.toLowerCase() === 'yes';

// // //         if (exclude_columns.includes(column_name)) {
// // //             return false;
// // //         }
// // //         // Jos sarakkeella on oletusarvo, tai se on identity-sarake,
// // //         // ei kysytä lomakkeella
// // //         if ((column_default && column_default.trim() !== '') || is_identity) {
// // //             return false;
// // //         }
// // //         return true;
// // //     });

// // //     if (columns.length === 0) {
// // //         console.error('No columns available to display in the modal.');
// // //         alert('Taululle ei ole lisättäviä sarakkeita.');
// // //         return;
// // //     }

// // //     // Luodaan pää-lomake
// // //     const form = document.createElement('form');
// // //     form.id = 'add_row_form';
// // //     form.style.display = 'flex';
// // //     form.style.flexDirection = 'column';

// // //     // Rakennetaan pään taulun lomakekentät
// // //     for (const column of columns) {
// // //         const label = document.createElement('label');
// // //         label.textContent = column.column_name;
// // //         label.htmlFor = `${table_name}-${column.column_name}-input`;
// // //         label.style.margin = '10px 0 5px';

// // //         // Jos sarake on foreign key => dropdown
// // //         if (column.foreign_table_name) {
// // //             const dropdown_container = document.createElement('div');
// // //             dropdown_container.id = `${table_name}-${column.column_name}-input`;
// // //             dropdown_container.style.marginBottom = '10px';

// // //             let options = await fetchReferencedData(column.foreign_table_name);
// // //             if (!Array.isArray(options)) {
// // //                 console.warn(`fetchReferencedData ei palauttanut taulukkoa taululle ${column.foreign_table_name}.`);
// // //                 options = [];
// // //             }
// // //             const mapped_options = options.map(opt => {
// // //                 const pk_column = Object.keys(opt).find(key => key !== 'display');
// // //                 return {
// // //                     value: opt[pk_column],
// // //                     label: `${opt[pk_column]} - ${opt['display']}`
// // //                 };
// // //             });

// // //             const hidden_input = document.createElement('input');
// // //             hidden_input.type = 'hidden';
// // //             hidden_input.name = column.column_name; // sama nimi kuin sarake
// // //             form.appendChild(hidden_input);

// // //             createVanillaDropdown({
// // //                 containerElement: dropdown_container,
// // //                 options: mapped_options,
// // //                 placeholder: 'Valitse...',
// // //                 searchPlaceholder: 'Hae...',
// // //                 showClearButton: true,
// // //                 useSearch: true,
// // //                 onChange: (val) => {
// // //                     hidden_input.value = val || '';
// // //                     modal_form_state[column.column_name] = val;
// // //                 }
// // //             });
// // //             if (modal_form_state[column.column_name]) {
// // //                 const dd_instance = dropdown_container.__dropdown;
// // //                 dd_instance.setValue(modal_form_state[column.column_name], false);
// // //                 hidden_input.value = modal_form_state[column.column_name];
// // //             }
// // //             form.appendChild(label);
// // //             form.appendChild(dropdown_container);
// // //         } else {
// // //             // Muut sarakkeet => text/textarea/numerokenttä tms.
// // //             const data_type_lower = column.data_type.toLowerCase();
// // //             if (
// // //                 data_type_lower === 'text' ||
// // //                 data_type_lower.includes('varchar') ||
// // //                 data_type_lower.startsWith('character varying')
// // //             ) {
// // //                 const textarea = document.createElement('textarea');
// // //                 textarea.name = column.column_name;
// // //                 textarea.required = column.is_nullable.toLowerCase() === 'no';
// // //                 textarea.rows = 1;
// // //                 textarea.classList.add('auto_resize_textarea');

// // //                 textarea.style.lineHeight = '1.2em';
// // //                 textarea.style.minHeight = '2em';
// // //                 textarea.style.padding = '4px 6px';
// // //                 textarea.style.border = '1px solid var(--border_color)';
// // //                 textarea.style.borderRadius = '4px';
// // //                 textarea.style.height = 'auto';
// // //                 textarea.value = modal_form_state[column.column_name] || '';
// // //                 textarea.style.height = textarea.scrollHeight + 'px';
// // //                 textarea.dispatchEvent(new Event('input'));

// // //                 textarea.addEventListener('input', (e) => {
// // //                     modal_form_state[column.column_name] = e.target.value;
// // //                 });

// // //                 form.appendChild(label);
// // //                 form.appendChild(textarea);
// // //             } else {
// // //                 const input = document.createElement('input');
// // //                 input.type = get_input_type(column.data_type);
// // //                 input.id = `${table_name}-${column.column_name}-input`;
// // //                 input.name = column.column_name;
// // //                 input.required = column.is_nullable.toLowerCase() === 'no';
// // //                 input.style.padding = '8px';
// // //                 input.style.border = '1px solid var(--border_color)';
// // //                 input.style.borderRadius = '4px';

// // //                 if (modal_form_state[column.column_name]) {
// // //                     input.value = modal_form_state[column.column_name];
// // //                 }

// // //                 input.addEventListener('input', (e) => {
// // //                     modal_form_state[column.column_name] = e.target.value;
// // //                 });

// // //                 form.appendChild(label);
// // //                 form.appendChild(input);
// // //             }
// // //         }
// // //     }

// // //     //
// // //     // *** 1 -> monen lapsitaulut (foreign key lapsitaulussa) ***
// // //     //
// // //     modal_form_state['_childRowsArray'] = [];

// // //     for (const ref of oneToManyRelations) {
// // //         // Hae lapsitaulun saraketiedot
// // //         let childColumns = [];
// // //         try {
// // //             const resp = await fetch(`/api/get-columns?table=${ref.source_table_name}`);
// // //             if (!resp.ok) throw new Error(`http error: ${resp.status}`);
// // //             childColumns = await resp.json();
// // //         } catch (err) {
// // //             console.error('virhe lapsitaulun sarakkeiden haussa:', err);
// // //             childColumns = [];
// // //         }

// // //         // Poistetaan se sarake, joka viittaa pääriviin (ref.source_column_name),
// // //         // koska sen täyttö on automaattinen
// // //         childColumns = childColumns.filter(cc => cc.column_name !== ref.source_column_name);

// // //         if (childColumns.length > 0) {
// // //             // Tehdään yksinkertainen fieldset lapsitaulun kentille
// // //             const fieldset = document.createElement('fieldset');
// // //             fieldset.style.marginTop = '20px';
// // //             const legend = document.createElement('legend');
// // //             legend.textContent = `Lisää aliobjekti (1-m): ${ref.source_table_name}`;
// // //             fieldset.appendChild(legend);

// // //             // Luo lapsi-lomakkeen tilakokoelma
// // //             const childObjectState = {
// // //                 tableName: ref.source_table_name,
// // //                 referencingColumn: ref.source_column_name, // vierasavain lapsitaulussa
// // //                 data: {}
// // //             };
// // //             // Tallennetaan se globaaliin arrayhin
// // //             modal_form_state['_childRowsArray'].push(childObjectState);

// // //             for (const ccol of childColumns) {
// // //                 const label = document.createElement('label');
// // //                 label.textContent = ccol.column_name;
// // //                 label.htmlFor = `child-${ref.source_table_name}-${ccol.column_name}`;
// // //                 label.style.margin = '10px 0 5px';

// // //                 const data_type_lower = ccol.data_type.toLowerCase();
// // //                 let childInput;
// // //                 if (
// // //                     data_type_lower === 'text' ||
// // //                     data_type_lower.includes('varchar') ||
// // //                     data_type_lower.startsWith('character varying')
// // //                 ) {
// // //                     childInput = document.createElement('textarea');
// // //                     childInput.rows = 1;
// // //                     childInput.classList.add('auto_resize_textarea');
// // //                 } else {
// // //                     childInput = document.createElement('input');
// // //                     childInput.type = get_input_type(ccol.data_type);
// // //                 }
// // //                 childInput.name = ccol.column_name;
// // //                 childInput.style.marginBottom = '5px';
// // //                 childInput.style.border = '1px solid var(--border_color)';
// // //                 childInput.style.borderRadius = '4px';

// // //                 // Tallennetaan arvo childObjectStateen
// // //                 childInput.addEventListener('input', (e) => {
// // //                     childObjectState.data[ccol.column_name] = e.target.value;
// // //                 });

// // //                 fieldset.appendChild(label);
// // //                 fieldset.appendChild(childInput);
// // //             }
// // //             form.appendChild(fieldset);
// // //         }
// // //     }

// // //     //
// // //     // *** monesta -> moneen -liitokset ***
// // //     //
// // //     modal_form_state['_manyToManyRows'] = [];

// // //     for (const info of manyToManyInfos) {
// // //         // info.link_table_name, info.mainTableFkColumn, info.thirdTableName, info.thirdTableFkColumn
// // //         const fieldset = document.createElement('fieldset');
// // //         fieldset.style.marginTop = '20px';
// // //         const legend = document.createElement('legend');
// // //         legend.textContent = `Lisää monesta-moneen-liitos: ${info.third_table_name}`;
// // //         fieldset.appendChild(legend);

// // //         // Haetaan "kolmannen taulun" data
// // //         let thirdTableOptions = [];
// // //         try {
// // //             thirdTableOptions = await fetchReferencedData(info.third_table_name);
// // //         } catch (err) {
// // //             console.error('virhe kolmannen taulun datan haussa:', err);
// // //             thirdTableOptions = [];
// // //         }
// // //         const mapped_options = thirdTableOptions.map(opt => {
// // //             const pk_column = Object.keys(opt).find(key => key !== 'display');
// // //             return {
// // //                 value: opt[pk_column],
// // //                 label: `${opt[pk_column]} - ${opt['display']}`
// // //             };
// // //         });

// // //         // Piilotettu input
// // //         const hiddenInput = document.createElement('input');
// // //         hiddenInput.type = 'hidden';
// // //         hiddenInput.name = `_m2m_${info.link_table_name}_${info.third_table_name}`;
// // //         fieldset.appendChild(hiddenInput);

// // //         // Dropdown
// // //         const dropdown_container = document.createElement('div');
// // //         createVanillaDropdown({
// // //             containerElement: dropdown_container,
// // //             options: mapped_options,
// // //             placeholder: `Valitse ${info.third_table_name}...`,
// // //             searchPlaceholder: 'Hae...',
// // //             showClearButton: true,
// // //             useSearch: true,
// // //             onChange: (val) => {
// // //                 // Tallennetaan many-to-many-lomaketilaan
// // //                 let existingSlot = modal_form_state['_manyToManyRows']
// // //                     .find(s => s.linkTableName === info.link_table_name);

// // //                 if (!existingSlot) {
// // //                     existingSlot = {
// // //                         linkTableName: info.link_table_name,
// // //                         mainTableFkColumn: info.mainTableFkColumn,
// // //                         thirdTableName: info.third_table_name,
// // //                         thirdTableFkColumn: info.third_tableFkColumn,
// // //                         selectedValue: null
// // //                     };
// // //                     modal_form_state['_manyToManyRows'].push(existingSlot);
// // //                 }
// // //                 existingSlot.selectedValue = val || null;
// // //                 hiddenInput.value = val || '';
// // //             }
// // //         });
// // //         fieldset.appendChild(dropdown_container);

// // //         form.appendChild(fieldset);
// // //     }

// // //     // Lomakkeen lopun painikkeet
// // //     const form_actions = document.createElement('div');
// // //     form_actions.style.display = 'flex';
// // //     form_actions.style.justifyContent = 'flex-end';
// // //     form_actions.style.marginTop = '20px';

// // //     const cancel_button = document.createElement('button');
// // //     cancel_button.type = 'button';
// // //     cancel_button.textContent = 'Peruuta';
// // //     cancel_button.style.padding = '8px 16px';
// // //     cancel_button.style.marginLeft = '10px';
// // //     cancel_button.style.border = 'none';
// // //     cancel_button.style.borderRadius = '4px';
// // //     cancel_button.style.cursor = 'pointer';
// // //     cancel_button.addEventListener('click', hideModal);

// // //     const submit_button = document.createElement('button');
// // //     submit_button.type = 'submit';
// // //     submit_button.textContent = 'Lisää';
// // //     submit_button.style.padding = '8px 16px';
// // //     submit_button.style.marginLeft = '10px';
// // //     submit_button.style.border = 'none';
// // //     submit_button.style.borderRadius = '4px';
// // //     submit_button.style.cursor = 'pointer';

// // //     form_actions.appendChild(cancel_button);
// // //     form_actions.appendChild(submit_button);
// // //     form.appendChild(form_actions);

// // //     // Submit
// // //     form.addEventListener('submit', async (e) => {
// // //         e.preventDefault();
// // //         await submit_new_row(table_name, form, columns);
// // //     });

// // //     // Luo ja näytä modaalin
// // //     createModal({
// // //         titleDataLangKey: `add_new_row`,
// // //         contentElements: [form],
// // //         width: '600px',
// // //     });

// // //     showModal();
// // //     console.log('Modal displayed successfully.');
// // // }

// // // /** Hakee lapsi-suhteet suoraan taulusta foreign_key_relations_1_m */
// // // async function fetchOneToManyRelations(tableName) {
// // //     try {
// // //         const response = await fetch(`/api/get-1m-relations?table=${tableName}`);
// // //         if (!response.ok) {
// // //             if (debug) {
// // //                 console.debug(`Ei löytynyt 1->m-suhteita taululle ${tableName}, status: ${response.status}`);
// // //             }
// // //             return [];
// // //         }
// // //         return await response.json();
// // //     } catch (error) {
// // //         if (debug) {
// // //             console.debug(`virhe haettaessa 1->m-suhteita taululle ${tableName}:`, error);
// // //         }
// // //         return [];
// // //     }
// // // }

// // // /** Haetaan monesta->moneen -liitokset (kuten ennen) */
// // // export async function fetchManyToManyInfos(tableName) {
// // //     try {
// // //         const response = await fetch(`/api/get-many-to-many?table=${tableName}`);
// // //         if (!response.ok) {
// // //             if (debug) {
// // //                 console.debug(`Ei löytynyt monesta-moneen-liitoksia taululle ${tableName}, status: ${response.status}`);
// // //             }
// // //             return [];
// // //         }
// // //         return await response.json();
// // //     } catch (error) {
// // //         if (debug) {
// // //             console.debug(`virhe haettaessa monesta-moneen-liitoksia taululle ${tableName}:`, error);
// // //         }
// // //         return [];
// // //     }
// // // }

// // // /** Haetaan ulkoisen avaimen taulun data, josta valikko generoitava */
// // // export async function fetchReferencedData(foreign_table_name) {
// // //     try {
// // //         const response = await fetch(`/referenced-data?table=${foreign_table_name}`);
// // //         if (!response.ok) {
// // //             throw new Error(`http error! status: ${response.status}`);
// // //         }
// // //         const data = await response.json();

// // //         if (!Array.isArray(data)) {
// // //             console.warn(`fetchReferencedData: odotettiin taulukkoa, mutta saatiin:`, data);
// // //             return [];
// // //         }
// // //         return data;
// // //     } catch (error) {
// // //         console.error(`virhe haettaessa dataa taulusta ${foreign_table_name}:`, error);
// // //         return [];
// // //     }
// // // }

// // // /** Päätellään input-tyyppi datatyypin perusteella */
// // // function get_input_type(data_type) {
// // //     switch (data_type.toLowerCase()) {
// // //         case 'integer':
// // //         case 'bigint':
// // //         case 'smallint':
// // //         case 'numeric':
// // //             return 'number';
// // //         case 'boolean':
// // //             return 'checkbox';
// // //         case 'date':
// // //             return 'date';
// // //         case 'timestamp':
// // //         case 'timestamp without time zone':
// // //         case 'timestamp with time zone':
// // //             return 'datetime-local';
// // //         default:
// // //             return 'text';
// // //     }
// // // }

// // // /** Lomakkeen submit: lähetetään pään data, lapsidatat ja M2M. */
// // // async function submit_new_row(table_name, form, columns) {
// // //     const form_data = new FormData(form);
// // //     const data = {};

// // //     // 1) Pään taulun sarakkeet
// // //     columns.forEach(column => {
// // //         let value = form_data.get(column.column_name);
// // //         if (column.data_type.toLowerCase() === 'boolean') {
// // //             value = form.elements[column.column_name].checked;
// // //         }
// // //         data[column.column_name] = value;
// // //     });

// // //     // 2) Lapsidata
// // //     if (modal_form_state['_childRowsArray'] && modal_form_state['_childRowsArray'].length > 0) {
// // //         data['_childRows'] = modal_form_state['_childRowsArray'];
// // //     }

// // //     // 3) Monesta->moneen -liitokset
// // //     if (modal_form_state['_manyToManyRows'] && modal_form_state['_manyToManyRows'].length > 0) {
// // //         // Oletus: valittu vain yksi item per liitostaulu
// // //         data['_manyToMany'] = modal_form_state['_manyToManyRows'].filter(item => item.selectedValue);
// // //     }

// // //     try {
// // //         const response = await fetch(`/api/add-row?table=${table_name}`, {
// // //             method: 'POST',
// // //             headers: { 'Content-Type': 'application/json' },
// // //             body: JSON.stringify(data),
// // //         });

// // //         if (response.ok) {
// // //             alert('Rivi lisätty onnistuneesti!');
// // //             hideModal();
// // //             modal_form_state = {};
// // //             await reload_table(table_name);
// // //         } else {
// // //             const error_data = await response.json();
// // //             alert(`Virhe uuden rivin lisäämisessä: ${error_data.message || 'Tuntematon virhe.'}`);
// // //         }
// // //     } catch (error) {
// // //         console.error('virhe uuden rivin lisäämisessä:', error);
// // //         alert('virhe uuden rivin lisäämisessä.');
// // //     }
// // // }

// // // /** Kun uusi rivi lisätty, haetaan taulun sisältö uudelleen ja generoidaan näkyviin */
// // // async function reload_table(table_name) {
// // //     try {
// // //         const result = await fetchTableData({
// // //             table_name: table_name
// // //         });
// // //         const data = result.data;
// // //         const columns = result.columns;
// // //         const types = result.types; // jos taustalta tulee myös types

// // //         await generate_table(table_name, columns, data, types);
// // //     } catch (error) {
// // //         console.error(`virhe taulun ${table_name} lataamisessa:`, error);
// // //     }
// // // }


// // // // // add_row.js

// // // // import { generate_table } from '../../../logical_components/table_views/view_table.js';
// // // // import { createModal, showModal, hideModal } from '../../../logical_components/modal/modal_factory.js';
// // // // import { fetchTableData } from '../../endpoints/endpoint_data_fetcher.js';
// // // // import { createVanillaDropdown } from '../../../logical_components/vanilla_dropdown/vanilla_dropdown.js';

// // // // var debug = true;
// // // // // Säilytetään lomakkeen tilaa globaalisti modaalin osalta
// // // // let modal_form_state = {};

// // // // // ---------------------------------------------
// // // // // Auto-resize logiikka kaikille textareille,
// // // // // joilla on auto_resize_textarea -luokka.
// // // // // ---------------------------------------------
// // // // document.addEventListener('input', (event) => {
// // // //     if (event.target.classList.contains('auto_resize_textarea')) {
// // // //         event.target.style.height = 'auto';
// // // //         event.target.style.height = event.target.scrollHeight + 'px';
// // // //     }
// // // // });

// // // // /**
// // // //  * Avataan rivinlisäyslomake. Hakee saraketiedot,
// // // //  * lapsitaulut (yksi-moneen) ja monesta-moneen-liitokset,
// // // //  * ja rakentaa lomakkeen dynaamisesti.
// // // //  */
// // // // export async function open_add_row_modal(table_name) {
// // // //     console.log('open_add_row_modal, table:', table_name);
// // // //     let columns_info;
// // // //     try {
// // // //         const response = await fetch(`/api/get-columns?table=${table_name}`);
// // // //         if (!response.ok) {
// // // //             throw new Error(`http error! status: ${response.status}`);
// // // //         }
// // // //         columns_info = await response.json();
// // // //         console.log('columns_info:', columns_info);
// // // //     } catch (error) {
// // // //         console.error(`Error fetching column information for table ${table_name}:`, error);
// // // //         alert('Virhe haettaessa saraketietoja.');
// // // //         return;
// // // //     }

// // // //     if (!columns_info || columns_info.length === 0) {
// // // //         console.error('No column information received.');
// // // //         alert('Taululle ei ole saatavilla sarakkeita.');
// // // //         return;
// // // //     }

// // // //     // Haetaan taulut, jotka ovat 1->m-suhteessa TÄHÄN tauluun,
// // // //     // suoraan taulusta foreign_key_relations_1_m
// // // //     let oneToManyRelations = [];
// // // //     try {
// // // //         oneToManyRelations = await fetchOneToManyRelations(table_name);
// // // //         console.log('oneToManyRelations:', oneToManyRelations);
// // // //     } catch (err) {
// // // //         console.error('virhe haettaessa 1->m-suhteita:', err);
// // // //         oneToManyRelations = [];
// // // //     }

// // // //     // Haetaan monesta-moneen -liitokset
// // // //     let manyToManyInfos = [];
// // // //     try {
// // // //         manyToManyInfos = await fetchManyToManyInfos(table_name);
// // // //         console.log('manyToManyInfos:', manyToManyInfos);
// // // //     } catch (err) {
// // // //         console.error('virhe M2M-hauissa:', err);
// // // //         manyToManyInfos = [];
// // // //     }

// // // //     // Määritä poissuljettavat sarakkeet
// // // //     const exclude_columns = ['id', 'created', 'updated', 'openai_embedding', 'creation_spec'];

// // // //     // Suodata pään taulun sarakkeet
// // // //     const columns = columns_info.filter(col => {
// // // //         const column_name = col.column_name.toLowerCase();
// // // //         const column_default = col.column_default;
// // // //         const is_identity = col.is_identity && col.is_identity.toLowerCase() === 'yes';

// // // //         if (exclude_columns.includes(column_name)) {
// // // //             return false;
// // // //         }
// // // //         // Jos sarakkeella on oletusarvo, tai se on identity-sarake,
// // // //         // ei kysytä lomakkeella
// // // //         if ((column_default && column_default.trim() !== '') || is_identity) {
// // // //             return false;
// // // //         }
// // // //         return true;
// // // //     });

// // // //     if (columns.length === 0) {
// // // //         console.error('No columns available to display in the modal.');
// // // //         alert('Taululle ei ole lisättäviä sarakkeita.');
// // // //         return;
// // // //     }

// // // //     // Luodaan pää-lomake
// // // //     const form = document.createElement('form');
// // // //     form.id = 'add_row_form';
// // // //     form.style.display = 'flex';
// // // //     form.style.flexDirection = 'column';

// // // //     // Rakennetaan pään taulun lomakekentät
// // // //     for (const column of columns) {
// // // //         const label = document.createElement('label');
// // // //         label.textContent = column.column_name;
// // // //         label.htmlFor = `${table_name}-${column.column_name}-input`;
// // // //         label.style.margin = '10px 0 5px';

// // // //         // Jos sarake on foreign key => dropdown
// // // //         if (column.foreign_table_name) {
// // // //             const dropdown_container = document.createElement('div');
// // // //             dropdown_container.id = `${table_name}-${column.column_name}-input`;
// // // //             dropdown_container.style.marginBottom = '10px';

// // // //             let options = await fetchReferencedData(column.foreign_table_name);
// // // //             if (!Array.isArray(options)) {
// // // //                 console.warn(`fetchReferencedData ei palauttanut taulukkoa taululle ${column.foreign_table_name}.`);
// // // //                 options = [];
// // // //             }
// // // //             const mapped_options = options.map(opt => {
// // // //                 const pk_column = Object.keys(opt).find(key => key !== 'display');
// // // //                 return {
// // // //                     value: opt[pk_column],
// // // //                     label: `${opt[pk_column]} - ${opt['display']}`
// // // //                 };
// // // //             });

// // // //             const hidden_input = document.createElement('input');
// // // //             hidden_input.type = 'hidden';
// // // //             hidden_input.name = column.column_name; // sama nimi kuin sarake
// // // //             form.appendChild(hidden_input);

// // // //             createVanillaDropdown({
// // // //                 containerElement: dropdown_container,
// // // //                 options: mapped_options,
// // // //                 placeholder: 'Valitse...',
// // // //                 searchPlaceholder: 'Hae...',
// // // //                 showClearButton: true,
// // // //                 useSearch: true,
// // // //                 onChange: (val) => {
// // // //                     hidden_input.value = val || '';
// // // //                     modal_form_state[column.column_name] = val;
// // // //                 }
// // // //             });
// // // //             if (modal_form_state[column.column_name]) {
// // // //                 const dd_instance = dropdown_container.__dropdown;
// // // //                 dd_instance.setValue(modal_form_state[column.column_name], false);
// // // //                 hidden_input.value = modal_form_state[column.column_name];
// // // //             }
// // // //             form.appendChild(label);
// // // //             form.appendChild(dropdown_container);
// // // //         } else {
// // // //             // Muut sarakkeet => text/textarea/numerokenttä tms.
// // // //             const data_type_lower = column.data_type.toLowerCase();
// // // //             if (
// // // //                 data_type_lower === 'text' ||
// // // //                 data_type_lower.includes('varchar') ||
// // // //                 data_type_lower.startsWith('character varying')
// // // //             ) {
// // // //                 const textarea = document.createElement('textarea');
// // // //                 textarea.name = column.column_name;
// // // //                 textarea.required = column.is_nullable.toLowerCase() === 'no';
// // // //                 textarea.rows = 1;
// // // //                 textarea.classList.add('auto_resize_textarea');

// // // //                 textarea.style.lineHeight = '1.2em';
// // // //                 textarea.style.minHeight = '2em';
// // // //                 textarea.style.padding = '4px 6px';
// // // //                 textarea.style.border = '1px solid var(--border_color)';
// // // //                 textarea.style.borderRadius = '4px';
// // // //                 textarea.style.height = 'auto';
// // // //                 textarea.value = modal_form_state[column.column_name] || '';
// // // //                 textarea.style.height = textarea.scrollHeight + 'px';
// // // //                 textarea.dispatchEvent(new Event('input'));

// // // //                 textarea.addEventListener('input', (e) => {
// // // //                     modal_form_state[column.column_name] = e.target.value;
// // // //                 });

// // // //                 form.appendChild(label);
// // // //                 form.appendChild(textarea);
// // // //             } else {
// // // //                 const input = document.createElement('input');
// // // //                 input.type = get_input_type(column.data_type);
// // // //                 input.id = `${table_name}-${column.column_name}-input`;
// // // //                 input.name = column.column_name;
// // // //                 input.required = column.is_nullable.toLowerCase() === 'no';
// // // //                 input.style.padding = '8px';
// // // //                 input.style.border = '1px solid var(--border_color)';
// // // //                 input.style.borderRadius = '4px';

// // // //                 if (modal_form_state[column.column_name]) {
// // // //                     input.value = modal_form_state[column.column_name];
// // // //                 }

// // // //                 input.addEventListener('input', (e) => {
// // // //                     modal_form_state[column.column_name] = e.target.value;
// // // //                 });

// // // //                 form.appendChild(label);
// // // //                 form.appendChild(input);
// // // //             }
// // // //         }
// // // //     }

// // // //     //
// // // //     // *** 1 -> monen lapsitaulut (foreign key lapsitaulussa) ***
// // // //     //
// // // //     // Kasataan lapsitaulut taulusta foreign_key_relations_1_m.
// // // //     // Tallennamme lapsilomakkeet arrayhin:
// // // //     modal_form_state['_childRowsArray'] = [];

// // // //     for (const ref of oneToManyRelations) {
// // // //         // Hae lapsitaulun saraketiedot
// // // //         let childColumns = [];
// // // //         try {
// // // //             const resp = await fetch(`/api/get-columns?table=${ref.source_table_name}`);
// // // //             if (!resp.ok) throw new Error(`http error: ${resp.status}`);
// // // //             childColumns = await resp.json();
// // // //         } catch (err) {
// // // //             console.error('virhe lapsitaulun sarakkeiden haussa:', err);
// // // //             childColumns = [];
// // // //         }

// // // //         // Poistetaan se sarake, joka viittaa pääriviin (ref.source_column_name),
// // // //         // koska sen täyttö on automaattinen
// // // //         childColumns = childColumns.filter(cc => cc.column_name !== ref.source_column_name);

// // // //         if (childColumns.length > 0) {
// // // //             // Tehdään yksinkertainen fieldset lapsitaulun kentille
// // // //             const fieldset = document.createElement('fieldset');
// // // //             fieldset.style.marginTop = '20px';
// // // //             const legend = document.createElement('legend');
// // // //             legend.textContent = `Lisää aliobjekti (1-m): ${ref.source_table_name}`;
// // // //             fieldset.appendChild(legend);

// // // //             // Luo lapsi-lomakkeen tilakokoelma
// // // //             const childObjectState = {
// // // //                 tableName: ref.source_table_name,
// // // //                 referencingColumn: ref.source_column_name, // vierasavain lapsitaulussa
// // // //                 data: {}
// // // //             };
// // // //             // Tallennetaan se globaaliin arrayhin
// // // //             modal_form_state['_childRowsArray'].push(childObjectState);

// // // //             for (const ccol of childColumns) {
// // // //                 const label = document.createElement('label');
// // // //                 label.textContent = ccol.column_name;
// // // //                 label.htmlFor = `child-${ref.source_table_name}-${ccol.column_name}`;
// // // //                 label.style.margin = '10px 0 5px';

// // // //                 const data_type_lower = ccol.data_type.toLowerCase();
// // // //                 let childInput;
// // // //                 if (
// // // //                     data_type_lower === 'text' ||
// // // //                     data_type_lower.includes('varchar') ||
// // // //                     data_type_lower.startsWith('character varying')
// // // //                 ) {
// // // //                     childInput = document.createElement('textarea');
// // // //                     childInput.rows = 1;
// // // //                     childInput.classList.add('auto_resize_textarea');
// // // //                 } else {
// // // //                     childInput = document.createElement('input');
// // // //                     childInput.type = get_input_type(ccol.data_type);
// // // //                 }
// // // //                 childInput.name = ccol.column_name;
// // // //                 childInput.style.marginBottom = '5px';
// // // //                 childInput.style.border = '1px solid var(--border_color)';
// // // //                 childInput.style.borderRadius = '4px';

// // // //                 // Tallennetaan arvo childObjectStateen
// // // //                 childInput.addEventListener('input', (e) => {
// // // //                     childObjectState.data[ccol.column_name] = e.target.value;
// // // //                 });

// // // //                 fieldset.appendChild(label);
// // // //                 fieldset.appendChild(childInput);
// // // //             }
// // // //             form.appendChild(fieldset);
// // // //         }
// // // //     }

// // // //     //
// // // //     // *** monesta -> moneen -liitokset ***
// // // //     //
// // // //     // Rakennetaan lomake-osio jokaista many-to-many -liitosta varten.
// // // //     // Oletuksena yksi valinta per liitostaulu.
// // // //     //
// // // //     modal_form_state['_manyToManyRows'] = [];

// // // //     for (const info of manyToManyInfos) {
// // // //         // info.link_table_name, info.mainTableFkColumn, info.thirdTableName, info.thirdTableFkColumn
// // // //         const fieldset = document.createElement('fieldset');
// // // //         fieldset.style.marginTop = '20px';
// // // //         const legend = document.createElement('legend');
// // // //         legend.textContent = `Lisää monesta-moneen-liitos: ${info.third_table_name}`;
// // // //         fieldset.appendChild(legend);

// // // //         // Haetaan "kolmannen taulun" data
// // // //         let thirdTableOptions = [];
// // // //         try {
// // // //             thirdTableOptions = await fetchReferencedData(info.third_table_name);
// // // //         } catch (err) {
// // // //             console.error('virhe kolmannen taulun datan haussa:', err);
// // // //             thirdTableOptions = [];
// // // //         }
// // // //         const mapped_options = thirdTableOptions.map(opt => {
// // // //             const pk_column = Object.keys(opt).find(key => key !== 'display');
// // // //             return {
// // // //                 value: opt[pk_column],
// // // //                 label: `${opt[pk_column]} - ${opt['display']}`
// // // //             };
// // // //         });

// // // //         // Piilotettu input
// // // //         const hiddenInput = document.createElement('input');
// // // //         hiddenInput.type = 'hidden';
// // // //         hiddenInput.name = `_m2m_${info.link_table_name}_${info.third_table_name}`;
// // // //         fieldset.appendChild(hiddenInput);

// // // //         // Dropdown
// // // //         const dropdown_container = document.createElement('div');
// // // //         createVanillaDropdown({
// // // //             containerElement: dropdown_container,
// // // //             options: mapped_options,
// // // //             placeholder: `Valitse ${info.third_table_name}...`,
// // // //             searchPlaceholder: 'Hae...',
// // // //             showClearButton: true,
// // // //             useSearch: true,
// // // //             onChange: (val) => {
// // // //                 // Tallennetaan many-to-many-lomaketilaan
// // // //                 let existingSlot = modal_form_state['_manyToManyRows']
// // // //                     .find(s => s.linkTableName === info.link_table_name);

// // // //                 if (!existingSlot) {
// // // //                     existingSlot = {
// // // //                         linkTableName: info.link_table_name,
// // // //                         mainTableFkColumn: info.mainTableFkColumn,
// // // //                         thirdTableName: info.third_table_name,
// // // //                         thirdTableFkColumn: info.thirdTableFkColumn,
// // // //                         selectedValue: null
// // // //                     };
// // // //                     modal_form_state['_manyToManyRows'].push(existingSlot);
// // // //                 }
// // // //                 existingSlot.selectedValue = val || null;
// // // //                 hiddenInput.value = val || '';
// // // //             }
// // // //         });
// // // //         fieldset.appendChild(dropdown_container);

// // // //         form.appendChild(fieldset);
// // // //     }

// // // //     // Lomakkeen lopun painikkeet
// // // //     const form_actions = document.createElement('div');
// // // //     form_actions.style.display = 'flex';
// // // //     form_actions.style.justifyContent = 'flex-end';
// // // //     form_actions.style.marginTop = '20px';

// // // //     const cancel_button = document.createElement('button');
// // // //     cancel_button.type = 'button';
// // // //     cancel_button.textContent = 'Peruuta';
// // // //     cancel_button.style.padding = '8px 16px';
// // // //     cancel_button.style.marginLeft = '10px';
// // // //     cancel_button.style.border = 'none';
// // // //     cancel_button.style.borderRadius = '4px';
// // // //     cancel_button.style.cursor = 'pointer';
// // // //     cancel_button.addEventListener('click', hideModal);

// // // //     const submit_button = document.createElement('button');
// // // //     submit_button.type = 'submit';
// // // //     submit_button.textContent = 'Lisää';
// // // //     submit_button.style.padding = '8px 16px';
// // // //     submit_button.style.marginLeft = '10px';
// // // //     submit_button.style.border = 'none';
// // // //     submit_button.style.borderRadius = '4px';
// // // //     submit_button.style.cursor = 'pointer';

// // // //     form_actions.appendChild(cancel_button);
// // // //     form_actions.appendChild(submit_button);
// // // //     form.appendChild(form_actions);

// // // //     // Submit
// // // //     form.addEventListener('submit', async (e) => {
// // // //         e.preventDefault();
// // // //         await submit_new_row(table_name, form, columns);
// // // //     });

// // // //     // Luo ja näytä modaalin
// // // //     createModal({
// // // //         titleDataLangKey: `add_new_row`,
// // // //         contentElements: [form],
// // // //         width: '600px',
// // // //     });

// // // //     showModal();
// // // //     console.log('Modal displayed successfully.');
// // // // }

// // // // /** Hakee lapsi-suhteet suoraan taulusta foreign_key_relations_1_m */
// // // // async function fetchOneToManyRelations(tableName) {
// // // //     const response = await fetch(`/api/get-1m-relations?table=${tableName}`);
// // // //     if (!response.ok) {
// // // //         throw new Error(`http error! status: ${response.status}`);
// // // //     }
// // // //     return response.json();
// // // // }

// // // // /** Haetaan monesta->moneen -liitokset (kuten ennen) */
// // // // export async function fetchManyToManyInfos(tableName) {
// // // //     const response = await fetch(`/api/get-many-to-many?table=${tableName}`);
// // // //     if (!response.ok) {
// // // //         throw new Error(`http error! status: ${response.status}`);
// // // //     }
// // // //     return response.json();
// // // // }

// // // // /** Haetaan ulkoisen avaimen taulun data, josta valikko generoitava */
// // // // export async function fetchReferencedData(foreign_table_name) {
// // // //     try {
// // // //         const response = await fetch(`/referenced-data?table=${foreign_table_name}`);
// // // //         if (!response.ok) {
// // // //             throw new Error(`http error! status: ${response.status}`);
// // // //         }
// // // //         const data = await response.json();

// // // //         if (!Array.isArray(data)) {
// // // //             console.warn(`fetchReferencedData: odotettiin taulukkoa, mutta saatiin:`, data);
// // // //             return [];
// // // //         }
// // // //         return data;
// // // //     } catch (error) {
// // // //         console.error(`virhe haettaessa dataa taulusta ${foreign_table_name}:`, error);
// // // //         return [];
// // // //     }
// // // // }

// // // // /** Päätellään input-tyyppi datatyypin perusteella */
// // // // function get_input_type(data_type) {
// // // //     switch (data_type.toLowerCase()) {
// // // //         case 'integer':
// // // //         case 'bigint':
// // // //         case 'smallint':
// // // //         case 'numeric':
// // // //             return 'number';
// // // //         case 'boolean':
// // // //             return 'checkbox';
// // // //         case 'date':
// // // //             return 'date';
// // // //         case 'timestamp':
// // // //         case 'timestamp without time zone':
// // // //         case 'timestamp with time zone':
// // // //             return 'datetime-local';
// // // //         default:
// // // //             return 'text';
// // // //     }
// // // // }

// // // // /** Lomakkeen submit: lähetetään pään data, lapsidatat ja M2M. */
// // // // async function submit_new_row(table_name, form, columns) {
// // // //     const form_data = new FormData(form);
// // // //     const data = {};

// // // //     // 1) Pään taulun sarakkeet
// // // //     columns.forEach(column => {
// // // //         let value = form_data.get(column.column_name);
// // // //         if (column.data_type.toLowerCase() === 'boolean') {
// // // //             value = form.elements[column.column_name].checked;
// // // //         }
// // // //         data[column.column_name] = value;
// // // //     });

// // // //     // 2) Lapsidata
// // // //     if (modal_form_state['_childRowsArray'] && modal_form_state['_childRowsArray'].length > 0) {
// // // //         data['_childRows'] = modal_form_state['_childRowsArray'];
// // // //     }

// // // //     // 3) Monesta->moneen -liitokset
// // // //     if (modal_form_state['_manyToManyRows'] && modal_form_state['_manyToManyRows'].length > 0) {
// // // //         // Oletus: valittu vain yksi item per liitostaulu
// // // //         data['_manyToMany'] = modal_form_state['_manyToManyRows'].filter(item => item.selectedValue);
// // // //     }

// // // //     try {
// // // //         const response = await fetch(`/api/add-row?table=${table_name}`, {
// // // //             method: 'POST',
// // // //             headers: { 'Content-Type': 'application/json' },
// // // //             body: JSON.stringify(data),
// // // //         });

// // // //         if (response.ok) {
// // // //             alert('Rivi lisätty onnistuneesti!');
// // // //             hideModal();
// // // //             modal_form_state = {};
// // // //             await reload_table(table_name);
// // // //         } else {
// // // //             const error_data = await response.json();
// // // //             alert(`Virhe uuden rivin lisäämisessä: ${error_data.message || 'Tuntematon virhe.'}`);
// // // //         }
// // // //     } catch (error) {
// // // //         console.error('virhe uuden rivin lisäämisessä:', error);
// // // //         alert('virhe uuden rivin lisäämisessä.');
// // // //     }
// // // // }

// // // // /** Kun uusi rivi lisätty, haetaan taulun sisältö uudelleen ja generoidaan näkyviin */
// // // // async function reload_table(table_name) {
// // // //     try {
// // // //         const result = await fetchTableData({
// // // //             table_name: table_name
// // // //         });
// // // //         const data = result.data;
// // // //         const columns = result.columns;
// // // //         const types = result.types; // jos taustalta tulee myös types

// // // //         await generate_table(table_name, columns, data, types);
// // // //     } catch (error) {
// // // //         console.error(`virhe taulun ${table_name} lataamisessa:`, error);
// // // //     }
// // // // }


// // // // // // add_row.js

// // // // // import { generate_table } from '../../../logical_components/table_views/view_table.js';
// // // // // import { createModal, showModal, hideModal } from '../../../logical_components/modal/modal_factory.js';
// // // // // import { fetchTableData } from '../../endpoints/endpoint_data_fetcher.js';
// // // // // import { createVanillaDropdown } from '../../../logical_components/vanilla_dropdown/vanilla_dropdown.js';

// // // // // // Säilytetään lomakkeen tilaa globaalisti modaalin osalta
// // // // // let modal_form_state = {};

// // // // // // ---------------------------------------------
// // // // // // Auto-resize logiikka kaikille textareille,
// // // // // // joilla on auto_resize_textarea -luokka.
// // // // // // ---------------------------------------------
// // // // // document.addEventListener('input', (event) => {
// // // // //     if (event.target.classList.contains('auto_resize_textarea')) {
// // // // //         event.target.style.height = 'auto';
// // // // //         event.target.style.height = event.target.scrollHeight + 'px';
// // // // //     }
// // // // // });

// // // // // /**
// // // // //  * Avataan rivinlisäyslomake. Hakee saraketiedot,
// // // // //  * lapsitaulut (yksi-moneen) ja monesta-moneen-liitokset,
// // // // //  * ja rakentaa lomakkeen dynaamisesti.
// // // // //  */
// // // // // export async function open_add_row_modal(table_name) {
// // // // //     console.log('open_add_row_modal, table:', table_name);
// // // // //     let columns_info;
// // // // //     try {
// // // // //         const response = await fetch(`/api/get-columns?table=${table_name}`);
// // // // //         if (!response.ok) {
// // // // //             throw new Error(`http error! status: ${response.status}`);
// // // // //         }
// // // // //         columns_info = await response.json();
// // // // //         console.log('columns_info:', columns_info);
// // // // //     } catch (error) {
// // // // //         console.error(`Error fetching column information for table ${table_name}:`, error);
// // // // //         alert('Virhe haettaessa saraketietoja.');
// // // // //         return;
// // // // //     }

// // // // //     if (!columns_info || columns_info.length === 0) {
// // // // //         console.error('No column information received.');
// // // // //         alert('Taululle ei ole saatavilla sarakkeita.');
// // // // //         return;
// // // // //     }

// // // // //     // Haetaan taulut, jotka viittaavat tähän tauluun (yksi -> monta)
// // // // //     let referencingTables = [];
// // // // //     try {
// // // // //         referencingTables = await fetchReferencingTables(table_name);
// // // // //         console.log('referencingTables:', referencingTables);
// // // // //     } catch (err) {
// // // // //         console.error('virhe haettaessa viittaavia tauluja:', err);
// // // // //         referencingTables = [];
// // // // //     }

// // // // //     // Haetaan monesta-moneen -liitokset
// // // // //     let manyToManyInfos = [];
// // // // //     try {
// // // // //         manyToManyInfos = await fetchManyToManyInfos(table_name);
// // // // //         console.log('manyToManyInfos:', manyToManyInfos);
// // // // //     } catch (err) {
// // // // //         console.error('virhe M2M-hauissa:', err);
// // // // //         manyToManyInfos = [];
// // // // //     }

// // // // //     // Määritä poissuljettavat sarakkeet
// // // // //     const exclude_columns = ['id', 'created', 'updated', 'openai_embedding', 'creation_spec'];

// // // // //     // Suodata pään taulun sarakkeet
// // // // //     const columns = columns_info.filter(col => {
// // // // //         const column_name = col.column_name.toLowerCase();
// // // // //         const column_default = col.column_default;
// // // // //         const is_identity = col.is_identity && col.is_identity.toLowerCase() === 'yes';

// // // // //         if (exclude_columns.includes(column_name)) {
// // // // //             return false;
// // // // //         }
// // // // //         // Jos sarakkeella on oletusarvo, tai se on identity-sarake,
// // // // //         // ei kysytä lomakkeella
// // // // //         if ((column_default && column_default.trim() !== '') || is_identity) {
// // // // //             return false;
// // // // //         }
// // // // //         return true;
// // // // //     });

// // // // //     if (columns.length === 0) {
// // // // //         console.error('No columns available to display in the modal.');
// // // // //         alert('Taululle ei ole lisättäviä sarakkeita.');
// // // // //         return;
// // // // //     }

// // // // //     // Luodaan pää-lomake
// // // // //     const form = document.createElement('form');
// // // // //     form.id = 'add_row_form';
// // // // //     form.style.display = 'flex';
// // // // //     form.style.flexDirection = 'column';

// // // // //     // Rakennetaan pään taulun lomakekentät
// // // // //     for (const column of columns) {
// // // // //         const label = document.createElement('label');
// // // // //         label.textContent = column.column_name;
// // // // //         label.htmlFor = `${table_name}-${column.column_name}-input`;
// // // // //         label.style.margin = '10px 0 5px';

// // // // //         // Jos sarake on foreign key => dropdown
// // // // //         if (column.foreign_table_name) {
// // // // //             const dropdown_container = document.createElement('div');
// // // // //             dropdown_container.id = `${table_name}-${column.column_name}-input`;
// // // // //             dropdown_container.style.marginBottom = '10px';

// // // // //             let options = await fetchReferencedData(column.foreign_table_name);
// // // // //             if (!Array.isArray(options)) {
// // // // //                 console.warn(`fetchReferencedData ei palauttanut taulukkoa taululle ${column.foreign_table_name}.`);
// // // // //                 options = [];
// // // // //             }
// // // // //             const mapped_options = options.map(opt => {
// // // // //                 const pk_column = Object.keys(opt).find(key => key !== 'display');
// // // // //                 return {
// // // // //                     value: opt[pk_column],
// // // // //                     label: `${opt[pk_column]} - ${opt['display']}`
// // // // //                 };
// // // // //             });

// // // // //             const hidden_input = document.createElement('input');
// // // // //             hidden_input.type = 'hidden';
// // // // //             hidden_input.name = column.column_name; // sama nimi kuin sarake
// // // // //             form.appendChild(hidden_input);

// // // // //             createVanillaDropdown({
// // // // //                 containerElement: dropdown_container,
// // // // //                 options: mapped_options,
// // // // //                 placeholder: 'Valitse...',
// // // // //                 searchPlaceholder: 'Hae...',
// // // // //                 showClearButton: true,
// // // // //                 useSearch: true,
// // // // //                 onChange: (val) => {
// // // // //                     hidden_input.value = val || '';
// // // // //                     modal_form_state[column.column_name] = val;
// // // // //                 }
// // // // //             });
// // // // //             if (modal_form_state[column.column_name]) {
// // // // //                 const dd_instance = dropdown_container.__dropdown;
// // // // //                 dd_instance.setValue(modal_form_state[column.column_name], false);
// // // // //                 hidden_input.value = modal_form_state[column.column_name];
// // // // //             }
// // // // //             form.appendChild(label);
// // // // //             form.appendChild(dropdown_container);
// // // // //         } else {
// // // // //             // Muut sarakkeet => text/textarea/numerokenttä tms.
// // // // //             const data_type_lower = column.data_type.toLowerCase();
// // // // //             if (
// // // // //                 data_type_lower === 'text' ||
// // // // //                 data_type_lower.includes('varchar') ||
// // // // //                 data_type_lower.startsWith('character varying')
// // // // //             ) {
// // // // //                 const textarea = document.createElement('textarea');
// // // // //                 textarea.name = column.column_name;
// // // // //                 textarea.required = column.is_nullable.toLowerCase() === 'no';
// // // // //                 textarea.rows = 1;
// // // // //                 textarea.classList.add('auto_resize_textarea');

// // // // //                 textarea.style.lineHeight = '1.2em';
// // // // //                 textarea.style.minHeight = '2em';
// // // // //                 textarea.style.padding = '4px 6px';
// // // // //                 textarea.style.border = '1px solid var(--border_color)';
// // // // //                 textarea.style.borderRadius = '4px';
// // // // //                 textarea.style.height = 'auto';
// // // // //                 textarea.value = modal_form_state[column.column_name] || '';
// // // // //                 textarea.style.height = textarea.scrollHeight + 'px';
// // // // //                 textarea.dispatchEvent(new Event('input'));

// // // // //                 textarea.addEventListener('input', (e) => {
// // // // //                     modal_form_state[column.column_name] = e.target.value;
// // // // //                 });

// // // // //                 form.appendChild(label);
// // // // //                 form.appendChild(textarea);
// // // // //             } else {
// // // // //                 const input = document.createElement('input');
// // // // //                 input.type = get_input_type(column.data_type);
// // // // //                 input.id = `${table_name}-${column.column_name}-input`;
// // // // //                 input.name = column.column_name;
// // // // //                 input.required = column.is_nullable.toLowerCase() === 'no';
// // // // //                 input.style.padding = '8px';
// // // // //                 input.style.border = '1px solid var(--border_color)';
// // // // //                 input.style.borderRadius = '4px';

// // // // //                 if (modal_form_state[column.column_name]) {
// // // // //                     input.value = modal_form_state[column.column_name];
// // // // //                 }

// // // // //                 input.addEventListener('input', (e) => {
// // // // //                     modal_form_state[column.column_name] = e.target.value;
// // // // //                 });

// // // // //                 form.appendChild(label);
// // // // //                 form.appendChild(input);
// // // // //             }
// // // // //         }
// // // // //     }

// // // // //     //
// // // // //     // *** 1 -> monen lapsitaulut (foreign key lapsitaulussa) ***
// // // // //     //
// // // // //     // Kasataan *kaikki* lapsitaulut. Oletamme, että kuhunkin lapsitauluun voi
// // // // //     // lisätä "yhden lapsirivin" – jos haluat useita, laajennat vastaavasti.
// // // // //     //
// // // // //     // Tallennamme lapsilomakkeet arrayhin:
// // // // //     modal_form_state['_childRowsArray'] = [];

// // // // //     for (const ref of referencingTables) {
// // // // //         // Hae lapsitaulun saraketiedot
// // // // //         let childColumns = [];
// // // // //         try {
// // // // //             const resp = await fetch(`/api/get-columns?table=${ref.referencing_table_name}`);
// // // // //             if (!resp.ok) throw new Error(`http error: ${resp.status}`);
// // // // //             childColumns = await resp.json();
// // // // //         } catch (err) {
// // // // //             console.error('virhe lapsitaulun sarakkeiden haussa:', err);
// // // // //             childColumns = [];
// // // // //         }

// // // // //         // Poistetaan se sarake, joka viittaa pääriviin (esim. service_id),
// // // // //         // koska sen täyttö on automaattinen
// // // // //         childColumns = childColumns.filter(cc => cc.column_name !== ref.referencing_column_name);

// // // // //         if (childColumns.length > 0) {
// // // // //             // Tehdään yksinkertainen fieldset lapsitaulun kentille
// // // // //             const fieldset = document.createElement('fieldset');
// // // // //             fieldset.style.marginTop = '20px';
// // // // //             const legend = document.createElement('legend');
// // // // //             legend.textContent = `Lisää aliobjekti (1-m): ${ref.referencing_table_name}`;
// // // // //             fieldset.appendChild(legend);

// // // // //             // Luo lapsi-lomakkeen tilakokoelma
// // // // //             const childObjectState = {
// // // // //                 tableName: ref.referencing_table_name,
// // // // //                 referencingColumn: ref.referencing_column_name,
// // // // //                 data: {}
// // // // //             };
// // // // //             // Tallennetaan se globaaliin arrayhin
// // // // //             modal_form_state['_childRowsArray'].push(childObjectState);

// // // // //             for (const ccol of childColumns) {
// // // // //                 const label = document.createElement('label');
// // // // //                 label.textContent = ccol.column_name;
// // // // //                 label.htmlFor = `child-${ref.referencing_table_name}-${ccol.column_name}`;
// // // // //                 label.style.margin = '10px 0 5px';

// // // // //                 const data_type_lower = ccol.data_type.toLowerCase();
// // // // //                 let childInput;
// // // // //                 if (
// // // // //                     data_type_lower === 'text' ||
// // // // //                     data_type_lower.includes('varchar') ||
// // // // //                     data_type_lower.startsWith('character varying')
// // // // //                 ) {
// // // // //                     childInput = document.createElement('textarea');
// // // // //                     childInput.rows = 1;
// // // // //                     childInput.classList.add('auto_resize_textarea');
// // // // //                 } else {
// // // // //                     childInput = document.createElement('input');
// // // // //                     childInput.type = get_input_type(ccol.data_type);
// // // // //                 }
// // // // //                 childInput.name = ccol.column_name;
// // // // //                 childInput.style.marginBottom = '5px';
// // // // //                 childInput.style.border = '1px solid var(--border_color)';
// // // // //                 childInput.style.borderRadius = '4px';

// // // // //                 // Tallennetaan arvo childObjectStateen
// // // // //                 childInput.addEventListener('input', (e) => {
// // // // //                     childObjectState.data[ccol.column_name] = e.target.value;
// // // // //                 });

// // // // //                 fieldset.appendChild(label);
// // // // //                 fieldset.appendChild(childInput);
// // // // //             }
// // // // //             form.appendChild(fieldset);
// // // // //         }
// // // // //     }

// // // // //     //
// // // // //     // *** monesta -> moneen -liitokset ***
// // // // //     //
// // // // //     // Rakennetaan lomake-osio jokaista many-to-many -liitosta varten.
// // // // //     // Oletuksena yksi valinta per liitostaulu. Jos haluat useita, laajennat.
// // // // //     //
// // // // //     modal_form_state['_manyToManyRows'] = [];

// // // // //     for (const info of manyToManyInfos) {
// // // // //         // info.link_table_name, info.mainTableFkColumn, info.thirdTableName, info.thirdTableFkColumn
// // // // //         const fieldset = document.createElement('fieldset');
// // // // //         fieldset.style.marginTop = '20px';
// // // // //         const legend = document.createElement('legend');
// // // // //         legend.textContent = `Lisää monesta-moneen-liitos: ${info.third_table_name}`;
// // // // //         fieldset.appendChild(legend);

// // // // //         // Haetaan "kolmannen taulun" data
// // // // //         let thirdTableOptions = [];
// // // // //         try {
// // // // //             thirdTableOptions = await fetchReferencedData(info.third_table_name);
// // // // //         } catch (err) {
// // // // //             console.error('virhe kolmannen taulun datan haussa:', err);
// // // // //             thirdTableOptions = [];
// // // // //         }
// // // // //         const mapped_options = thirdTableOptions.map(opt => {
// // // // //             const pk_column = Object.keys(opt).find(key => key !== 'display');
// // // // //             return {
// // // // //                 value: opt[pk_column],
// // // // //                 label: `${opt[pk_column]} - ${opt['display']}`
// // // // //             };
// // // // //         });

// // // // //         // Piilotettu input
// // // // //         const hiddenInput = document.createElement('input');
// // // // //         hiddenInput.type = 'hidden';
// // // // //         hiddenInput.name = `_m2m_${info.link_table_name}_${info.third_table_name}`;
// // // // //         fieldset.appendChild(hiddenInput);

// // // // //         // Dropdown
// // // // //         const dropdown_container = document.createElement('div');
// // // // //         createVanillaDropdown({
// // // // //             containerElement: dropdown_container,
// // // // //             options: mapped_options,
// // // // //             placeholder: `Valitse ${info.third_table_name}...`,
// // // // //             searchPlaceholder: 'Hae...',
// // // // //             showClearButton: true,
// // // // //             useSearch: true,
// // // // //             onChange: (val) => {
// // // // //                 // Tallennetaan many-to-many-lomaketilaan
// // // // //                 let existingSlot = modal_form_state['_manyToManyRows']
// // // // //                     .find(s => s.linkTableName === info.link_table_name);

// // // // //                 if (!existingSlot) {
// // // // //                     existingSlot = {
// // // // //                         linkTableName: info.link_table_name,
// // // // //                         mainTableFkColumn: info.main_table_fk_column,
// // // // //                         thirdTableName: info.third_table_name,
// // // // //                         thirdTableFkColumn: info.third_table_fk_column,
// // // // //                         selectedValue: null
// // // // //                     };
// // // // //                     modal_form_state['_manyToManyRows'].push(existingSlot);
// // // // //                 }
// // // // //                 existingSlot.selectedValue = val || null;
// // // // //                 hiddenInput.value = val || '';
// // // // //             }
// // // // //         });
// // // // //         fieldset.appendChild(dropdown_container);

// // // // //         form.appendChild(fieldset);
// // // // //     }

// // // // //     // Lomakkeen lopun painikkeet
// // // // //     const form_actions = document.createElement('div');
// // // // //     form_actions.style.display = 'flex';
// // // // //     form_actions.style.justifyContent = 'flex-end';
// // // // //     form_actions.style.marginTop = '20px';

// // // // //     const cancel_button = document.createElement('button');
// // // // //     cancel_button.type = 'button';
// // // // //     cancel_button.textContent = 'Peruuta';
// // // // //     cancel_button.style.padding = '8px 16px';
// // // // //     cancel_button.style.marginLeft = '10px';
// // // // //     cancel_button.style.border = 'none';
// // // // //     cancel_button.style.borderRadius = '4px';
// // // // //     cancel_button.style.cursor = 'pointer';
// // // // //     cancel_button.addEventListener('click', hideModal);

// // // // //     const submit_button = document.createElement('button');
// // // // //     submit_button.type = 'submit';
// // // // //     submit_button.textContent = 'Lisää';
// // // // //     submit_button.style.padding = '8px 16px';
// // // // //     submit_button.style.marginLeft = '10px';
// // // // //     submit_button.style.border = 'none';
// // // // //     submit_button.style.borderRadius = '4px';
// // // // //     submit_button.style.cursor = 'pointer';

// // // // //     form_actions.appendChild(cancel_button);
// // // // //     form_actions.appendChild(submit_button);
// // // // //     form.appendChild(form_actions);

// // // // //     // Submit
// // // // //     form.addEventListener('submit', async (e) => {
// // // // //         e.preventDefault();
// // // // //         await submit_new_row(table_name, form, columns);
// // // // //     });

// // // // //     // Luo ja näytä modaalin
// // // // //     createModal({
// // // // //         titleDataLangKey: `add_new_row`,
// // // // //         contentElements: [form],
// // // // //         width: '600px',
// // // // //     });

// // // // //     showModal();
// // // // //     console.log('Modal displayed successfully.');
// // // // // }

// // // // // /** Haetaan lapsitaulut (yksi->moni) */
// // // // // export async function fetchReferencingTables(tableName) {
// // // // //     const response = await fetch(`/api/get-referencing-tables?table=${tableName}`);
// // // // //     if (!response.ok) {
// // // // //         throw new Error(`http error! status: ${response.status}`);
// // // // //     }
// // // // //     return response.json();
// // // // // }

// // // // // /** Haetaan monesta->moneen -liitokset */
// // // // // export async function fetchManyToManyInfos(tableName) {
// // // // //     const response = await fetch(`/api/get-many-to-many?table=${tableName}`);
// // // // //     if (!response.ok) {
// // // // //         throw new Error(`http error! status: ${response.status}`);
// // // // //     }
// // // // //     return response.json();
// // // // // }

// // // // // /** Haetaan ulkoisen avaimen taulun data, josta valikko generoitava */
// // // // // export async function fetchReferencedData(foreign_table_name) {
// // // // //     try {
// // // // //         const response = await fetch(`/referenced-data?table=${foreign_table_name}`);
// // // // //         if (!response.ok) {
// // // // //             throw new Error(`http error! status: ${response.status}`);
// // // // //         }
// // // // //         const data = await response.json();

// // // // //         if (!Array.isArray(data)) {
// // // // //             console.warn(`fetchReferencedData: odotettiin taulukkoa, mutta saatiin:`, data);
// // // // //             return [];
// // // // //         }
// // // // //         return data;
// // // // //     } catch (error) {
// // // // //         console.error(`virhe haettaessa dataa taulusta ${foreign_table_name}:`, error);
// // // // //         return [];
// // // // //     }
// // // // // }

// // // // // /** Päätellään input-tyyppi datatyypin perusteella */
// // // // // function get_input_type(data_type) {
// // // // //     switch (data_type.toLowerCase()) {
// // // // //         case 'integer':
// // // // //         case 'bigint':
// // // // //         case 'smallint':
// // // // //         case 'numeric':
// // // // //             return 'number';
// // // // //         case 'boolean':
// // // // //             return 'checkbox';
// // // // //         case 'date':
// // // // //             return 'date';
// // // // //         case 'timestamp':
// // // // //         case 'timestamp without time zone':
// // // // //         case 'timestamp with time zone':
// // // // //             return 'datetime-local';
// // // // //         default:
// // // // //             return 'text';
// // // // //     }
// // // // // }

// // // // // /** Lomakkeen submit: lähetetään pään data, lapsidatat ja M2M. */
// // // // // async function submit_new_row(table_name, form, columns) {
// // // // //     const form_data = new FormData(form);
// // // // //     const data = {};

// // // // //     // 1) Pään taulun sarakkeet
// // // // //     columns.forEach(column => {
// // // // //         let value = form_data.get(column.column_name);
// // // // //         if (column.data_type.toLowerCase() === 'boolean') {
// // // // //             value = form.elements[column.column_name].checked;
// // // // //         }
// // // // //         data[column.column_name] = value;
// // // // //     });

// // // // //     // 2) Lapsidata
// // // // //     if (modal_form_state['_childRowsArray'] && modal_form_state['_childRowsArray'].length > 0) {
// // // // //         data['_childRows'] = modal_form_state['_childRowsArray'];
// // // // //     }

// // // // //     // 3) Monesta->moneen -liitokset
// // // // //     if (modal_form_state['_manyToManyRows'] && modal_form_state['_manyToManyRows'].length > 0) {
// // // // //         // Oletus: valittu vain yksi item per liitostaulu
// // // // //         data['_manyToMany'] = modal_form_state['_manyToManyRows'].filter(item => item.selectedValue);
// // // // //     }

// // // // //     try {
// // // // //         const response = await fetch(`/api/add-row?table=${table_name}`, {
// // // // //             method: 'POST',
// // // // //             headers: { 'Content-Type': 'application/json' },
// // // // //             body: JSON.stringify(data),
// // // // //         });

// // // // //         if (response.ok) {
// // // // //             alert('Rivi lisätty onnistuneesti!');
// // // // //             hideModal();
// // // // //             modal_form_state = {};
// // // // //             await reload_table(table_name);
// // // // //         } else {
// // // // //             const error_data = await response.json();
// // // // //             alert(`Virhe uuden rivin lisäämisessä: ${error_data.message || 'Tuntematon virhe.'}`);
// // // // //         }
// // // // //     } catch (error) {
// // // // //         console.error('virhe uuden rivin lisäämisessä:', error);
// // // // //         alert('virhe uuden rivin lisäämisessä.');
// // // // //     }
// // // // // }

// // // // // /** Kun uusi rivi lisätty, haetaan taulun sisältö uudelleen ja generoidaan näkyviin */
// // // // // async function reload_table(table_name) {
// // // // //     try {
// // // // //         const result = await fetchTableData({
// // // // //             table_name: table_name
// // // // //         });
// // // // //         const data = result.data;
// // // // //         const columns = result.columns;
// // // // //         const types = result.types; // jos taustalta tulee myös types

// // // // //         await generate_table(table_name, columns, data, types);
// // // // //     } catch (error) {
// // // // //         console.error(`virhe taulun ${table_name} lataamisessa:`, error);
// // // // //     }
// // // // // }


// // // // // // // // // add_row.js

// // // // // // // // import { generate_table } from '../../../logical_components/table_views/view_table.js';
// // // // // // // // import { createModal, showModal, hideModal } from '../../../logical_components/modal/modal_factory.js';
// // // // // // // // import { fetchTableData } from '../../endpoints/endpoint_data_fetcher.js';
// // // // // // // // import { createVanillaDropdown } from '../../../logical_components/vanilla_dropdown/vanilla_dropdown.js';

// // // // // // // // let modal_form_state = {}; // Tallennetaan modaalin syötetyt arvot

// // // // // // // // // ***********************************************
// // // // // // // // // * Auto-resize logiikka kaikille textareille,  *
// // // // // // // // // * joilla on auto_resize_textarea -luokka.     *
// // // // // // // // // ***********************************************
// // // // // // // // document.addEventListener('input', (event) => {
// // // // // // // //     if (event.target.classList.contains('auto_resize_textarea')) {
// // // // // // // //         event.target.style.height = 'auto';
// // // // // // // //         event.target.style.height = event.target.scrollHeight + 'px';
// // // // // // // //     }
// // // // // // // // });
// // // // // // // // export async function open_add_row_modal(table_name) {
// // // // // // // //     console.log('gugguu');
// // // // // // // //     console.log('open_add_row_modal');
// // // // // // // //     let columns_info;
// // // // // // // //     try {
// // // // // // // //         const response = await fetch(`/api/get-columns?table=${table_name}`);
// // // // // // // //         if (!response.ok) {
// // // // // // // //             throw new Error(`http error! status: ${response.status}`);
// // // // // // // //         }
// // // // // // // //         columns_info = await response.json();
// // // // // // // //         console.log('columns_info:', columns_info);
// // // // // // // //     } catch (error) {
// // // // // // // //         console.error(`Error fetching column information for table ${table_name}:`, error);
// // // // // // // //         alert('Virhe haettaessa saraketietoja.');
// // // // // // // //         return;
// // // // // // // //     }

// // // // // // // //     if (!columns_info || columns_info.length === 0) {
// // // // // // // //         console.error('No column information received.');
// // // // // // // //         alert('Taululle ei ole saatavilla sarakkeita.');
// // // // // // // //         return;
// // // // // // // //     }

// // // // // // // //     // Hae myös lapsitauluja (eli tauluja, jotka viittaavat tähän)
// // // // // // // //     let referencingTables = [];
// // // // // // // //     try {
// // // // // // // //         referencingTables = await fetchReferencingTables(table_name);
// // // // // // // //         console.log('referencingTables:', referencingTables);
// // // // // // // //     } catch (err) {
// // // // // // // //         console.error('virhe haettaessa viittaavia tauluja:', err);
// // // // // // // //         // ei fataali, jatketaan
// // // // // // // //         referencingTables = [];
// // // // // // // //     }

// // // // // // // //     // Määritä poissuljettavat sarakkeet
// // // // // // // //     const exclude_columns = ['id', 'created', 'updated', 'openai_embedding', 'creation_spec'];

// // // // // // // //     // Suodata sarakkeet
// // // // // // // //     const columns = columns_info.filter(col => {
// // // // // // // //         const column_name = col.column_name.toLowerCase();
// // // // // // // //         const column_default = col.column_default;
// // // // // // // //         const is_identity = col.is_identity && col.is_identity.toLowerCase() === 'yes';

// // // // // // // //         if (exclude_columns.includes(column_name)) {
// // // // // // // //             return false;
// // // // // // // //         }
// // // // // // // //         if ((column_default && column_default.trim() !== '') || is_identity) {
// // // // // // // //             return false;
// // // // // // // //         }
// // // // // // // //         return true;
// // // // // // // //     });

// // // // // // // //     if (columns.length === 0) {
// // // // // // // //         console.error('No columns available to display in the modal.');
// // // // // // // //         alert('Taululle ei ole lisättäviä sarakkeita.');
// // // // // // // //         return;
// // // // // // // //     }

// // // // // // // //     // Luo lomake
// // // // // // // //     const form = document.createElement('form');
// // // // // // // //     form.id = 'add_row_form';
// // // // // // // //     form.style.display = 'flex';
// // // // // // // //     form.style.flexDirection = 'column';

// // // // // // // //     // Pään taulun kentät
// // // // // // // //     for (const column of columns) {
// // // // // // // //         const label = document.createElement('label');
// // // // // // // //         label.textContent = column.column_name;
// // // // // // // //         label.htmlFor = `${table_name}-${column.column_name}-input`;
// // // // // // // //         label.style.margin = '10px 0 5px';

// // // // // // // //         if (column.foreign_table_name) {
// // // // // // // //             // vierasavainsarake -> dropdown
// // // // // // // //             const dropdown_container = document.createElement('div');
// // // // // // // //             dropdown_container.id = `${table_name}-${column.column_name}-input`;
// // // // // // // //             dropdown_container.style.marginBottom = '10px';

// // // // // // // //             let options = await fetch_referenced_data(column.foreign_table_name);
// // // // // // // //             if (!Array.isArray(options)) {
// // // // // // // //                 console.warn(`fetchReferencedData ei palauttanut taulukkoa taululle ${column.foreign_table_name}.`);
// // // // // // // //                 options = [];
// // // // // // // //             }
// // // // // // // //             let mapped_options = options.map(opt => {
// // // // // // // //                 const pk_column = Object.keys(opt).find(key => key !== 'display');
// // // // // // // //                 return {
// // // // // // // //                     value: opt[pk_column],
// // // // // // // //                     label: `${opt[pk_column]} - ${opt['display']}`
// // // // // // // //                 };
// // // // // // // //             });

// // // // // // // //             const hidden_input = document.createElement('input');
// // // // // // // //             hidden_input.type = 'hidden';
// // // // // // // //             hidden_input.name = column.column_name;   // tärkeää, että nimi on sama kuin sarake
// // // // // // // //             form.appendChild(hidden_input);

// // // // // // // //             createVanillaDropdown({
// // // // // // // //                 containerElement: dropdown_container,
// // // // // // // //                 options: mapped_options,
// // // // // // // //                 placeholder: 'Valitse...',
// // // // // // // //                 searchPlaceholder: 'Hae...',
// // // // // // // //                 showClearButton: true,
// // // // // // // //                 useSearch: true,
// // // // // // // //                 onChange: (val) => {
// // // // // // // //                     hidden_input.value = val || '';
// // // // // // // //                     modal_form_state[column.column_name] = val;
// // // // // // // //                 }
// // // // // // // //             });
// // // // // // // //             if (modal_form_state[column.column_name]) {
// // // // // // // //                 const dd_instance = dropdown_container.__dropdown;
// // // // // // // //                 dd_instance.setValue(modal_form_state[column.column_name], false);
// // // // // // // //                 hidden_input.value = modal_form_state[column.column_name];
// // // // // // // //             }
// // // // // // // //             form.appendChild(label);
// // // // // // // //             form.appendChild(dropdown_container);
// // // // // // // //         } else {
// // // // // // // //             // Muu sarake
// // // // // // // //             const data_type_lower = column.data_type.toLowerCase();
// // // // // // // //             if (
// // // // // // // //                 data_type_lower === 'text' ||
// // // // // // // //                 data_type_lower.includes('varchar') ||
// // // // // // // //                 data_type_lower.startsWith('character varying')
// // // // // // // //             ) {
// // // // // // // //                 const textarea = document.createElement('textarea');
// // // // // // // //                 textarea.name = column.column_name;
// // // // // // // //                 textarea.required = column.is_nullable.toLowerCase() === 'no';
// // // // // // // //                 textarea.rows = 1;
// // // // // // // //                 textarea.classList.add('auto_resize_textarea');

// // // // // // // //                 textarea.style.lineHeight = '1.2em';
// // // // // // // //                 textarea.style.minHeight = '2em';
// // // // // // // //                 textarea.style.padding = '4px 6px';
// // // // // // // //                 textarea.style.border = '1px solid var(--border_color)';
// // // // // // // //                 textarea.style.borderRadius = '4px';
// // // // // // // //                 textarea.style.height = 'auto';
// // // // // // // //                 textarea.value = modal_form_state[column.column_name] || '';
// // // // // // // //                 textarea.style.height = textarea.scrollHeight + 'px';
// // // // // // // //                 textarea.dispatchEvent(new Event('input'));

// // // // // // // //                 textarea.addEventListener('input', (e) => {
// // // // // // // //                     modal_form_state[column.column_name] = e.target.value;
// // // // // // // //                 });

// // // // // // // //                 form.appendChild(label);
// // // // // // // //                 form.appendChild(textarea);
// // // // // // // //             } else {
// // // // // // // //                 const input = document.createElement('input');
// // // // // // // //                 input.type = get_input_type(column.data_type);
// // // // // // // //                 input.id = `${table_name}-${column.column_name}-input`;
// // // // // // // //                 input.name = column.column_name;
// // // // // // // //                 input.required = column.is_nullable.toLowerCase() === 'no';
// // // // // // // //                 input.style.padding = '8px';
// // // // // // // //                 input.style.border = '1px solid var(--border_color)';
// // // // // // // //                 input.style.borderRadius = '4px';

// // // // // // // //                 if (modal_form_state[column.column_name]) {
// // // // // // // //                     input.value = modal_form_state[column.column_name];
// // // // // // // //                 }

// // // // // // // //                 input.addEventListener('input', (e) => {
// // // // // // // //                     modal_form_state[column.column_name] = e.target.value;
// // // // // // // //                 });

// // // // // // // //                 form.appendChild(label);
// // // // // // // //                 form.appendChild(input);
// // // // // // // //             }
// // // // // // // //         }
// // // // // // // //     }

// // // // // // // //     // Tarkistetaan, onko YKSI viittaava aliobjekti – otetaan yksinkertaisuuden vuoksi
// // // // // // // //     // vain yksi. Jos haluat tukea useammalle, silmukoi tässä.
// // // // // // // //     if (referencingTables.length > 0) {
// // // // // // // //         const ref = referencingTables[0];
// // // // // // // //         // Hae lapsitaulun saraketiedot
// // // // // // // //         let childColumns = [];
// // // // // // // //         try {
// // // // // // // //             const resp = await fetch(`/api/get-columns?table=${ref.referencing_table_name}`);
// // // // // // // //             if (!resp.ok) throw new Error(`http error: ${resp.status}`);
// // // // // // // //             childColumns = await resp.json();
// // // // // // // //         } catch (err) {
// // // // // // // //             console.error('virhe lapsitaulun sarakkeiden haussa:', err);
// // // // // // // //             childColumns = [];
// // // // // // // //         }

// // // // // // // //         // Poistetaan se sarake, joka viittaa pääriviin (esim. service_id),
// // // // // // // //         // koska sen täyttö on automaattista
// // // // // // // //         childColumns = childColumns.filter(cc => cc.column_name !== ref.referencing_column_name);

// // // // // // // //         if (childColumns.length > 0) {
// // // // // // // //             // Tehdään yksinkertainen fieldset lapsitaulun kentille
// // // // // // // //             const fieldset = document.createElement('fieldset');
// // // // // // // //             fieldset.style.marginTop = '20px';
// // // // // // // //             const legend = document.createElement('legend');
// // // // // // // //             legend.textContent = `Lisää ${ref.referencing_table_name} (aliobjekti)`;
// // // // // // // //             fieldset.appendChild(legend);

// // // // // // // //             for (const ccol of childColumns) {
// // // // // // // //                 // Renderöidään yksinkertainen text/textarea/numero-kenttä
// // // // // // // //                 const label = document.createElement('label');
// // // // // // // //                 label.textContent = ccol.column_name;
// // // // // // // //                 label.htmlFor = `child-${ref.referencing_table_name}-${ccol.column_name}`;
// // // // // // // //                 label.style.margin = '10px 0 5px';

// // // // // // // //                 const data_type_lower = ccol.data_type.toLowerCase();
// // // // // // // //                 let childInput;
// // // // // // // //                 if (
// // // // // // // //                     data_type_lower === 'text' ||
// // // // // // // //                     data_type_lower.includes('varchar') ||
// // // // // // // //                     data_type_lower.startsWith('character varying')
// // // // // // // //                 ) {
// // // // // // // //                     childInput = document.createElement('textarea');
// // // // // // // //                     childInput.rows = 1;
// // // // // // // //                     childInput.classList.add('auto_resize_textarea');
// // // // // // // //                 } else {
// // // // // // // //                     childInput = document.createElement('input');
// // // // // // // //                     childInput.type = get_input_type(ccol.data_type);
// // // // // // // //                 }
// // // // // // // //                 childInput.name = ccol.column_name;
// // // // // // // //                 childInput.style.marginBottom = '5px';
// // // // // // // //                 childInput.style.border = '1px solid var(--border_color)';
// // // // // // // //                 childInput.style.borderRadius = '4px';

// // // // // // // //                 // tallennetaan arvo child_form_stateen
// // // // // // // //                 childInput.addEventListener('input', (e) => {
// // // // // // // //                     if (!modal_form_state['_childData']) {
// // // // // // // //                         modal_form_state['_childData'] = {};
// // // // // // // //                     }
// // // // // // // //                     modal_form_state['_childData'][ccol.column_name] = e.target.value;
// // // // // // // //                 });

// // // // // // // //                 fieldset.appendChild(label);
// // // // // // // //                 fieldset.appendChild(childInput);
// // // // // // // //             }
// // // // // // // //             form.appendChild(fieldset);

// // // // // // // //             // Tallennetaan viitassuhteen tiedot (taulun nimi, referencingColumn, ym.)
// // // // // // // //             // Näin ne on helppo koota submitissä
// // // // // // // //             modal_form_state['_childInfo'] = {
// // // // // // // //                 tableName: ref.referencing_table_name,
// // // // // // // //                 referencingColumn: ref.referencing_column_name
// // // // // // // //             };
// // // // // // // //         }
// // // // // // // //     }

// // // // // // // //     // Lisää lomakkeen toiminnot
// // // // // // // //     const form_actions = document.createElement('div');
// // // // // // // //     form_actions.style.display = 'flex';
// // // // // // // //     form_actions.style.justifyContent = 'flex-end';
// // // // // // // //     form_actions.style.marginTop = '20px';

// // // // // // // //     const cancel_button = document.createElement('button');
// // // // // // // //     cancel_button.type = 'button';
// // // // // // // //     cancel_button.textContent = 'Peruuta';
// // // // // // // //     cancel_button.style.padding = '8px 16px';
// // // // // // // //     cancel_button.style.marginLeft = '10px';
// // // // // // // //     cancel_button.style.border = 'none';
// // // // // // // //     cancel_button.style.borderRadius = '4px';
// // // // // // // //     cancel_button.style.cursor = 'pointer';
// // // // // // // //     cancel_button.addEventListener('click', hideModal);

// // // // // // // //     const submit_button = document.createElement('button');
// // // // // // // //     submit_button.type = 'submit';
// // // // // // // //     submit_button.textContent = 'Lisää';
// // // // // // // //     submit_button.style.padding = '8px 16px';
// // // // // // // //     submit_button.style.marginLeft = '10px';
// // // // // // // //     submit_button.style.border = 'none';
// // // // // // // //     submit_button.style.borderRadius = '4px';
// // // // // // // //     submit_button.style.cursor = 'pointer';

// // // // // // // //     form_actions.appendChild(cancel_button);
// // // // // // // //     form_actions.appendChild(submit_button);
// // // // // // // //     form.appendChild(form_actions);

// // // // // // // //     form.addEventListener('submit', async (e) => {
// // // // // // // //         e.preventDefault();
// // // // // // // //         await submit_new_row(table_name, form, columns);
// // // // // // // //     });

// // // // // // // //     createModal({
// // // // // // // //         titleDataLangKey: `add_new_row`,
// // // // // // // //         contentElements: [form],
// // // // // // // //         width: '600px',
// // // // // // // //     });

// // // // // // // //     showModal();
// // // // // // // //     console.log('Modal displayed successfully.');
// // // // // // // // }

// // // // // // // // /** Uusi apufunktio: hakee viittaavat taulut */
// // // // // // // // async function fetchReferencingTables(tableName) {
// // // // // // // //     const response = await fetch(`/api/get-referencing-tables?table=${tableName}`);
// // // // // // // //     if (!response.ok) {
// // // // // // // //         throw new Error(`http error! status: ${response.status}`);
// // // // // // // //     }
// // // // // // // //     return response.json();
// // // // // // // // }

// // // // // // // // /** Päivitetty submit_new_row sis. aliobjektien logiikan */
// // // // // // // // async function submit_new_row(table_name, form, columns) {
// // // // // // // //     const form_data = new FormData(form);
// // // // // // // //     const data = {};

// // // // // // // //     // Haetaan pään taulun sarakkeiden arvot
// // // // // // // //     columns.forEach(column => {
// // // // // // // //         let value = form_data.get(column.column_name);
// // // // // // // //         if (column.data_type.toLowerCase() === 'boolean') {
// // // // // // // //             value = form.elements[column.column_name].checked;
// // // // // // // //         }
// // // // // // // //         data[column.column_name] = value;
// // // // // // // //     });

// // // // // // // //     // Jos meillä on lapsidata:
// // // // // // // //     if (modal_form_state['_childData'] && modal_form_state['_childInfo']) {
// // // // // // // //         data['_childRows'] = {
// // // // // // // //             tableName: modal_form_state['_childInfo'].tableName,
// // // // // // // //             referencingColumn: modal_form_state['_childInfo'].referencingColumn,
// // // // // // // //             data: modal_form_state['_childData']
// // // // // // // //         };
// // // // // // // //     }

// // // // // // // //     try {
// // // // // // // //         const response = await fetch(`/api/add-row?table=${table_name}`, {
// // // // // // // //             method: 'POST',
// // // // // // // //             headers: { 'Content-Type': 'application/json' },
// // // // // // // //             body: JSON.stringify(data),
// // // // // // // //         });

// // // // // // // //         if (response.ok) {
// // // // // // // //             alert('Rivi lisätty onnistuneesti!');
// // // // // // // //             hideModal();
// // // // // // // //             modal_form_state = {};
// // // // // // // //             await reload_table(table_name);
// // // // // // // //         } else {
// // // // // // // //             const error_data = await response.json();
// // // // // // // //             alert(`Virhe uuden rivin lisäämisessä: ${error_data.message || 'Tuntematon virhe.'}`);
// // // // // // // //         }
// // // // // // // //     } catch (error) {
// // // // // // // //         console.error('virhe uuden rivin lisäämisessä:', error);
// // // // // // // //         alert('virhe uuden rivin lisäämisessä.');
// // // // // // // //     }
// // // // // // // // }


// // // // // // // // export async function fetch_referenced_data(foreign_table_name) {
// // // // // // // //     try {
// // // // // // // //         const response = await fetch(`/referenced-data?table=${foreign_table_name}`);
// // // // // // // //         if (!response.ok) {
// // // // // // // //             throw new Error(`http error! status: ${response.status}`);
// // // // // // // //         }
// // // // // // // //         const data = await response.json();

// // // // // // // //         if (!Array.isArray(data)) {
// // // // // // // //             console.warn(`fetchReferencedData: odotettiin taulukkoa, mutta saatiin:`, data);
// // // // // // // //             return [];
// // // // // // // //         }
// // // // // // // //         return data;
// // // // // // // //     } catch (error) {
// // // // // // // //         console.error(`virhe haettaessa dataa taulusta ${foreign_table_name}:`, error);
// // // // // // // //         return [];
// // // // // // // //     }
// // // // // // // // }

// // // // // // // // export async function fetchReferencedData(foreignTableName) {
// // // // // // // //     try {
// // // // // // // //         const response = await fetch(`/referenced-data?table=${foreignTableName}`);
// // // // // // // //         if (!response.ok) {
// // // // // // // //             throw new Error(`HTTP error! status: ${response.status}`);
// // // // // // // //         }
// // // // // // // //         const data = await response.json();

// // // // // // // //         // Uusi tarkistus: palauta aina taulukko tai tyhjä taulukko
// // // // // // // //         if (!Array.isArray(data)) {
// // // // // // // //             console.warn(`fetchReferencedData: odotettiin taulukkoa, mutta saatiin:`, data);
// // // // // // // //             return [];
// // // // // // // //         }
// // // // // // // //         return data;
// // // // // // // //     } catch (error) {
// // // // // // // //         console.error(`Virhe haettaessa dataa taulusta ${foreignTableName}:`, error);
// // // // // // // //         return [];
// // // // // // // //     }
// // // // // // // // }

// // // // // // // // function get_input_type(data_type) {
// // // // // // // //     switch (data_type.toLowerCase()) {
// // // // // // // //         case 'integer':
// // // // // // // //         case 'bigint':
// // // // // // // //         case 'smallint':
// // // // // // // //         case 'numeric':
// // // // // // // //             return 'number';
// // // // // // // //         case 'boolean':
// // // // // // // //             return 'checkbox';
// // // // // // // //         case 'date':
// // // // // // // //             return 'date';
// // // // // // // //         case 'timestamp':
// // // // // // // //         case 'timestamp without time zone':
// // // // // // // //         case 'timestamp with time zone':
// // // // // // // //             return 'datetime-local';
// // // // // // // //         default:
// // // // // // // //             return 'text';
// // // // // // // //     }
// // // // // // // // }

// // // // // // // // // async function submit_new_row(table_name, form, columns) {
// // // // // // // // //     const form_data = new FormData(form);
// // // // // // // // //     const data = {};

// // // // // // // // //     columns.forEach(column => {
// // // // // // // // //         let value = form_data.get(column.column_name);

// // // // // // // // //         if (column.data_type.toLowerCase() === 'boolean') {
// // // // // // // // //             value = form.elements[column.column_name].checked;
// // // // // // // // //         }

// // // // // // // // //         data[column.column_name] = value;
// // // // // // // // //     });

// // // // // // // // //     try {
// // // // // // // // //         const response = await fetch(`/api/add-row?table=${table_name}`, {
// // // // // // // // //             method: 'POST',
// // // // // // // // //             headers: { 'Content-Type': 'application/json' },
// // // // // // // // //             body: JSON.stringify(data),
// // // // // // // // //         });

// // // // // // // // //         if (response.ok) {
// // // // // // // // //             alert('Rivi lisätty onnistuneesti!');
// // // // // // // // //             hideModal();
// // // // // // // // //             modal_form_state = {};
// // // // // // // // //             await reload_table(table_name);
// // // // // // // // //         } else {
// // // // // // // // //             const error_data = await response.json();
// // // // // // // // //             alert(`Virhe uuden rivin lisäämisessä: ${error_data.message || 'Tuntematon virhe.'}`);
// // // // // // // // //         }
// // // // // // // // //     } catch (error) {
// // // // // // // // //         console.error('virhe uuden rivin lisäämisessä:', error);
// // // // // // // // //         alert('virhe uuden rivin lisäämisessä.');
// // // // // // // // //     }
// // // // // // // // // }

// // // // // // // // async function reload_table(table_name) {
// // // // // // // //     try {
// // // // // // // //         // Haetaan tiedot data_fetcher-funktiolla
// // // // // // // //         const result = await fetchTableData({
// // // // // // // //             table_name: table_name
// // // // // // // //         });

// // // // // // // //         const data = result.data;
// // // // // // // //         const columns = result.columns;
// // // // // // // //         const types = result.types; // jos taustalta tulee myös types

// // // // // // // //         await generate_table(table_name, columns, data, types);
// // // // // // // //     } catch (error) {
// // // // // // // //         console.error(`virhe taulun ${table_name} lataamisessa:`, error);
// // // // // // // //     }
// // // // // // // // }
