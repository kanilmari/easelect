// open_big_card_modal.js

import { endpoint_router } from '../../endpoints/endpoint_router.js';
import { createModal, showModal } from '../../../common_components/modal/modal_factory.js';
import { createImageElement, create_seeded_avatar } from './card_layout.js';
import { 
  parseRoleString,
  createKeyValueElement,
  disableEditing,
  format_column_name,
  enableEditing,
  sendCardUpdates
} from './card_helpers.js';

/**
 * Luo avain–arvo-elementin siten, että label on omalla rivillään ja value seuraavalla.
 * Asettaa myös data-lang-key, jos hasLangKey on true.
 */
function createTwoLineKeyValueElement(label, value, column, hasLangKey, className) {
    const container = document.createElement('div');
    container.classList.add('two_line_field');

    const labelDiv = document.createElement('div');
    labelDiv.classList.add('two_line_label');
    labelDiv.textContent = label;

    const valueDiv = document.createElement('div');
    valueDiv.classList.add(className);
    valueDiv.classList.add('two_line_value');
    valueDiv.setAttribute('data-column', column);

    if (hasLangKey) {
        // Kirjataan vain avain talteen. Käännös hoidetaan muualta (tai suoraan DOM:sta).
        valueDiv.setAttribute('data-lang-key', value);
    } else {
        valueDiv.textContent = value;
    }

    container.appendChild(labelDiv);
    container.appendChild(valueDiv);

    return container;
}

/**
 * Avaa ison kortin modaalin. Näyttää kootusti kortin kentät, roolit ym.
 * Iso kortti ei näytä kenttää ollenkaan, jos show_key_on_card on false ja rooli on “details” (tai “details_link”).
 * Otsikoille ja arvoille on oma rivi.
 */
export async function open_big_card_modal(row_item, table_name) {
    // Tämä ohjaa <details>-lyhennysten käyttöä isoissa teksteissä
    let summary_details = false; // aseta true, jos haluat pitkissä teksteissä collapsible <details>

    try {
        let data_types = {};
        try {
            data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
        } catch (error) {
            console.warn("could not parse data_types for table", table_name, error);
        }

        const columns = Object.keys(row_item);
        const sorted_columns = [...columns];
        sorted_columns.sort((colA, colB) => {
            const a_card_element = data_types[colA]?.card_element || '';
            const b_card_element = data_types[colB]?.card_element || '';
            if (a_card_element && !b_card_element) return -1;
            if (!a_card_element && b_card_element) return 1;
            return 0;
        });

        // Otsikoksi valitaan header-roolin arvo (jos on)
        let modal_header_text = '';

        // Suuri container modalia varten
        const big_card_div = document.createElement('div');
        big_card_div.classList.add('big_card_container');

        const card_modal_content_div = document.createElement('div');
        card_modal_content_div.classList.add('big_card_content');

        // Haetaan headerin eka kirjain (avatar)
        let header_first_letter = '';
        for (const col of sorted_columns) {
            const roleFull = data_types[col]?.card_element || '';
            const { baseRoles } = parseRoleString(roleFull);
            if (baseRoles.includes('header')) {
                const val_str = row_item[col] ? String(row_item[col]) : '';
                if (val_str.trim()) {
                    header_first_letter = val_str.trim()[0];
                }
            }
        }

        // Luontiaika / ID seed (avatarin generointiin)
        const created_part = row_item.created
            || row_item.created_at
            || row_item.luontiaika
            || null;
        const id_part = (row_item.id !== undefined) ? String(row_item.id) : 'unknown_id';
        const creation_seed = created_part ? `${id_part}_${created_part}` : id_part;

        // Onko taululla image-rooli?
        const table_has_image_role = sorted_columns.some(col => {
            const { baseRoles } = parseRoleString(data_types[col]?.card_element || '');
            return baseRoles.includes('image');
        });

        const description_entries = [];
        const details_entries = [];
        const keywords_list = [];
        let found_image_for_this_row = false;

        // Sarakkeiden käsittely
        for (const column of sorted_columns) {
            const raw_val = row_item[column];
            let val_str = '';
            if (raw_val !== null && raw_val !== undefined) {
                val_str = (typeof raw_val === 'string') ? raw_val : String(raw_val);
            }

            const roleFull = data_types[column]?.card_element || '';
            const { baseRoles, hasLangKey } = parseRoleString(roleFull);

            // Iso kortti => aina näytetään label *paitsi* jos rooli on details tai details_link
            // ja show_key_on_card = false (ohitetaan koko kenttä).
            const showKeyOnCard = data_types[column]?.show_key_on_card === true;
            const column_label = format_column_name(column);

            // Jos ei rooleja, näytetään peruskenttänä
            if (baseRoles.length === 0) {
                const kvElem = createTwoLineKeyValueElement(
                    column_label,
                    val_str,
                    column,
                    hasLangKey,
                    'big_card_generic_field'
                );
                card_modal_content_div.appendChild(kvElem);
                continue;
            }

            // Käydään roolit läpi
            let handled = false;
            for (const singleRole of baseRoles) {
                // hidden -> ohitetaan
                if (/^hidden(\d+)?$/.test(singleRole)) {
                    handled = true;
                    continue;
                }

                // details_link
                if (/^details_link(\d+)?$/.test(singleRole)) {
                    // jos show_key_on_card on false, ohitetaan
                    if (!showKeyOnCard) {
                        handled = true;
                        continue;
                    }
                    let suffix_number = Number.MAX_SAFE_INTEGER;
                    const match = singleRole.match(/^details_link(\d+)?$/);
                    if (match && match[1]) {
                        suffix_number = parseInt(match[1], 10);
                    }
                    details_entries.push({
                        suffix_number,
                        rawValue: val_str,
                        label: column_label,
                        hasLangKey,
                        column,
                        isLink: true
                    });
                    handled = true;
                    continue;
                }

                // details
                if (/^details(\d+)?$/.test(singleRole)) {
                    // jos show_key_on_card on false, ohitetaan
                    if (!showKeyOnCard) {
                        handled = true;
                        continue;
                    }
                    let suffix_number = Number.MAX_SAFE_INTEGER;
                    const match = singleRole.match(/^details(\d+)?$/);
                    if (match && match[1]) {
                        suffix_number = parseInt(match[1], 10);
                    }
                    details_entries.push({
                        suffix_number,
                        rawValue: val_str,
                        label: column_label,
                        hasLangKey,
                        column,
                        isLink: false
                    });
                    handled = true;
                    continue;
                }

                // description
                if (/^description(\d+)?$/.test(singleRole)) {
                    let suffix_number = Number.MAX_SAFE_INTEGER;
                    const match = singleRole.match(/^description(\d+)?$/);
                    if (match && match[1]) {
                        suffix_number = parseInt(match[1], 10);
                    }
                    description_entries.push({
                        suffix_number,
                        rawValue: val_str,
                        label: column_label,
                        hasLangKey,
                        column
                    });
                    handled = true;
                    continue;
                }

                // keywords
                if (singleRole === 'keywords') {
                    keywords_list.push({
                        column,
                        rawValue: val_str,
                        label: column_label,
                        hasLangKey
                    });
                    handled = true;
                    continue;
                }

                // image
                if (singleRole === 'image') {
                    found_image_for_this_row = true;
                    const image_div = document.createElement('div');
                    image_div.classList.add('big_card_image');

                    if (val_str.trim()) {
                        let img_src = val_str.trim();
                        if (
                            !img_src.startsWith('http://') &&
                            !img_src.startsWith('https://') &&
                            !img_src.startsWith('./') &&
                            !img_src.startsWith('/')
                        ) {
                            const possibleMatch = img_src.match(/^(\d+)_(\d+)_(\d+)\.(\w+)$/);
                            if (possibleMatch) {
                                const mainTableId = possibleMatch[1];
                                const mainRowId = possibleMatch[2];
                                img_src = `/media/${mainTableId}/${mainRowId}/${img_src}`;
                            } else {
                                img_src = '/media/' + img_src;
                            }
                        }
                        const fancyImgEl = createImageElement(img_src, true);
                        image_div.appendChild(fancyImgEl);
                    } else {
                        // Avatar
                        const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
                        image_div.appendChild(avatar);
                    }
                    card_modal_content_div.appendChild(image_div);
                    handled = true;
                    continue;
                }

                // header
                if (singleRole === 'header') {
                    // Tallennetaan otsikkoteksti modaalille
                    if (hasLangKey) {
                        modal_header_text = val_str;
                    } else {
                        modal_header_text = `${column_label}: ${val_str}`;
                    }

                    // Luodaan myös iso header-elementti kortin sisälle
                    const header_el = document.createElement('div');
                    header_el.classList.add('big_card_header');
                    if (hasLangKey) {
                        header_el.setAttribute('data-lang-key', val_str);
                    } else {
                        const kvElem = createTwoLineKeyValueElement(
                            column_label,
                            val_str,
                            column,
                            hasLangKey,
                            'big_card_header_value'
                        );
                        header_el.appendChild(kvElem);
                    }
                    header_el.style.whiteSpace = 'pre-wrap';

                    card_modal_content_div.appendChild(header_el);
                    handled = true;
                    continue;
                }

                // creation_spec
                if (singleRole === 'creation_spec') {
                    const creation_div = document.createElement('div');
                    creation_div.classList.add('big_card_creation_spec');
                    if (hasLangKey) {
                        creation_div.setAttribute('data-lang-key', val_str);
                    } else {
                        const kvElem = createTwoLineKeyValueElement(
                            column_label,
                            val_str,
                            column,
                            hasLangKey,
                            'big_card_creation_value'
                        );
                        creation_div.appendChild(kvElem);
                        creation_div.style.whiteSpace = 'pre-wrap';
                    }
                    card_modal_content_div.appendChild(creation_div);
                    handled = true;
                    continue;
                }

                // Tuntematon rooli => avain-arvo kahdelle riville
                if (!handled) {
                    const kvElem = createTwoLineKeyValueElement(
                        column_label,
                        val_str,
                        column,
                        hasLangKey,
                        'big_card_generic_field'
                    );
                    card_modal_content_div.appendChild(kvElem);
                    handled = true;
                }
            }
        }

        // Jos taululla on image-rooli, mutta ei kuvaa => iso avatar
        if (table_has_image_role && !found_image_for_this_row) {
            const image_div = document.createElement('div');
            image_div.classList.add('big_card_image');
            const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
            image_div.appendChild(avatar);
            card_modal_content_div.appendChild(image_div);
        }

        // Jos ei image-roolia -> iso avatar
        if (!table_has_image_role) {
            const avatar_div = document.createElement('div');
            avatar_div.classList.add('big_card_image');
            const big_avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
            avatar_div.appendChild(big_avatar);
            card_modal_content_div.appendChild(avatar_div);
        }

        // Sortataan description- ja details-listat
        description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
        details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

        // description
        if (description_entries.length > 0) {
            const desc_container = document.createElement('div');
            desc_container.classList.add('big_card_description_container');

            for (const descObj of description_entries) {
                const d = document.createElement('div');
                d.classList.add('single_big_description');

                if (summary_details) {
                    // Näytetään <details>-lyhennys vain jos teksti on pitkä ja EI kieliavain
                    if (!descObj.hasLangKey && descObj.rawValue.length > 300) {
                        const details_el = document.createElement('details');
                        const summary_el = document.createElement('summary');
                        summary_el.textContent = descObj.rawValue.slice(0, 300) + '...';
                        details_el.appendChild(summary_el);

                        const restText = descObj.rawValue.slice(300);
                        const kvElem = createTwoLineKeyValueElement(
                            descObj.label,
                            restText,
                            descObj.column,
                            descObj.hasLangKey,
                            'big_description_value'
                        );
                        details_el.appendChild(kvElem);
                        d.appendChild(details_el);
                    } else {
                        const kvElem = createTwoLineKeyValueElement(
                            descObj.label,
                            descObj.rawValue,
                            descObj.column,
                            descObj.hasLangKey,
                            'big_description_value'
                        );
                        d.appendChild(kvElem);
                    }
                } else {
                    // Näytetään koko teksti
                    const kvElem = createTwoLineKeyValueElement(
                        descObj.label,
                        descObj.rawValue,
                        descObj.column,
                        descObj.hasLangKey,
                        'big_description_value'
                    );
                    d.appendChild(kvElem);
                }

                desc_container.appendChild(d);
            }
            card_modal_content_div.appendChild(desc_container);
        }

        // keywords
        if (keywords_list.length > 0) {
            const kw_container = document.createElement('div');
            kw_container.classList.add('big_card_keywords_container');
            for (const kwObj of keywords_list) {
                const k = document.createElement('div');
                k.classList.add('big_card_keyword_item');

                const kvElem = createTwoLineKeyValueElement(
                    kwObj.label,
                    kwObj.rawValue,
                    kwObj.column,
                    kwObj.hasLangKey,
                    'big_card_keyword_value'
                );
                k.appendChild(kvElem);

                kw_container.appendChild(k);
            }
            card_modal_content_div.appendChild(kw_container);
        }

        // details (ja details_link)
        if (details_entries.length > 0) {
            const details_container = document.createElement('div');
            details_container.classList.add('big_card_details_container');
            details_container.style.display = 'grid';
            details_container.style.gridTemplateColumns = '1fr 1fr';
            details_container.style.gap = '0.5rem';

            for (const detailObj of details_entries) {
                const detail_item = document.createElement('div');
                detail_item.classList.add('big_card_detail_item');

                // Luodaan 2-rivin avain–arvo -elementti, mutta jos rooli on linkki (isLink), lisätään <a>-elementti.
                if (detailObj.isLink) {
                    // summary_details -logiikka on harvoin järkevä linkeille, mutta pidetään symmetria
                    if (summary_details && !detailObj.hasLangKey && detailObj.rawValue.length > 300) {
                        const details_el = document.createElement('details');
                        const summary_el = document.createElement('summary');
                        summary_el.textContent = detailObj.rawValue.slice(0, 300) + '...';
                        details_el.appendChild(summary_el);

                        // Loppu
                        const restText = detailObj.rawValue.slice(300);
                        const linkElem = createLinkTwoLine(detailObj.label, restText, detailObj.column, detailObj.hasLangKey);
                        details_el.appendChild(linkElem);
                        detail_item.appendChild(details_el);
                    } else {
                        const linkElem = createLinkTwoLine(
                            detailObj.label,
                            detailObj.rawValue,
                            detailObj.column,
                            detailObj.hasLangKey
                        );
                        detail_item.appendChild(linkElem);
                    }
                } else {
                    // summary_details = true => mahdollinen <details> jos pitkä
                    if (summary_details && !detailObj.hasLangKey && detailObj.rawValue.length > 300) {
                        const details_el = document.createElement('details');
                        const summary_el = document.createElement('summary');
                        summary_el.textContent = detailObj.rawValue.slice(0, 300) + '...';
                        details_el.appendChild(summary_el);

                        const restText = detailObj.rawValue.slice(300);
                        const kvElem = createTwoLineKeyValueElement(
                            detailObj.label,
                            restText,
                            detailObj.column,
                            detailObj.hasLangKey,
                            'big_card_detail_value'
                        );
                        details_el.appendChild(kvElem);
                        detail_item.appendChild(details_el);
                    } else {
                        const kvElem = createTwoLineKeyValueElement(
                            detailObj.label,
                            detailObj.rawValue,
                            detailObj.column,
                            detailObj.hasLangKey,
                            'big_card_detail_value'
                        );
                        detail_item.appendChild(kvElem);
                    }
                }

                details_container.appendChild(detail_item);
            }
            card_modal_content_div.appendChild(details_container);
        }

        // Haetaan mahdolliset dynaamiset lapsitiedot
        if (row_item.id) {
            try {
                const dynamic_child_data = await endpoint_router('fetchDynamicChildren', {
                    method: 'POST',
                    body_data: {
                        parent_table: table_name,
                        parent_pk_value: String(row_item.id)
                    },
                });
                console.log('open_big_card_modal.js: dynaamiset lapsitiedot:', dynamic_child_data);

                if (dynamic_child_data && dynamic_child_data.child_tables) {
                    for (const child_obj of dynamic_child_data.child_tables) {
                        const child_table_name = child_obj.table;
                        const child_column_name = child_obj.column;
                        const child_rows = child_obj.rows || [];

                        const child_container_div = document.createElement('div');
                        child_container_div.classList.add('big_card_child_container');

                        const child_header = document.createElement('h3');
                        child_header.textContent = `${child_table_name} - ${child_column_name}`;
                        child_container_div.appendChild(child_header);

                        const link_elem = document.createElement('a');
                        link_elem.href = `/tables/${child_table_name}?${child_column_name}=${row_item.id}`;
                        link_elem.textContent = `Avaa /tables/${child_table_name}?${child_column_name}=${row_item.id}`;
                        link_elem.target = '_blank';
                        child_container_div.appendChild(link_elem);

                        child_rows.forEach(single_child_row => {
                            const row_div = document.createElement('div');
                            row_div.classList.add('child_item');
                            row_div.textContent = JSON.stringify(single_child_row, null, 2);
                            row_div.style.whiteSpace = 'pre-wrap';
                            child_container_div.appendChild(row_div);
                        });

                        card_modal_content_div.appendChild(child_container_div);
                    }
                }
            } catch (err) {
                console.error("virhe: " + err.message);
            }
        }

        big_card_div.appendChild(card_modal_content_div);

        // --- MUOKKAUSNAPPI ---
        let editModeActive = false;
        const editButton = document.createElement('button');
        editButton.textContent = 'Muokkaa';
        editButton.addEventListener('click', async () => {
            editModeActive = !editModeActive;
            if (editModeActive) {
                editButton.textContent = 'Tallenna';
                enableEditing(card_modal_content_div, table_name);
            } else {
                editButton.textContent = 'Muokkaa';
                const updatedData = disableEditing(card_modal_content_div);
                console.log('Päivitetyt arvot:', updatedData);

                // Lähetetään muutokset palvelimelle
                if (row_item.id !== undefined) {
                    try {
                        await sendCardUpdates(table_name, row_item.id, updatedData);
                    } catch (err) {
                        console.error("virhe: " + err.message);
                    }
                }
            }
        });
        big_card_div.appendChild(editButton);

        // Luodaan modaali, mutta skipataan createModal-funktion otsikko (skipModalTitle: true)
        createModal({
            skipModalTitle: true,
            tableName: table_name,
            contentElements: [big_card_div],
            width: '70vw'
        });
        showModal();

    } catch (err) {
        console.error("virhe: " + err.message);
    }
}

/**
 * Luo label–linkki -yhdistelmän kahdelle riville (esim. details_link).
 */
function createLinkTwoLine(label, linkValue, column, hasLangKey) {
    const container = document.createElement('div');
    container.classList.add('two_line_field');

    const labelDiv = document.createElement('div');
    labelDiv.classList.add('two_line_label');
    labelDiv.textContent = label;

    const valueDiv = document.createElement('div');
    valueDiv.classList.add('big_card_detail_value', 'two_line_value');
    valueDiv.setAttribute('data-column', column);

    if (hasLangKey) {
        // Kirjataan vain avain talteen
        valueDiv.setAttribute('data-lang-key', linkValue);
    } else {
        // Luodaan linkki
        const linkEl = document.createElement('a');
        linkEl.href = linkValue.trim();
        linkEl.target = '_blank';
        linkEl.textContent = linkValue.trim();
        valueDiv.appendChild(linkEl);
    }

    container.appendChild(labelDiv);
    container.appendChild(valueDiv);
    return container;
}


// // open_big_card_modal.js

// import { endpoint_router } from '../../endpoints/endpoint_router.js';
// import { createModal, showModal } from '../../../common_components/modal/modal_factory.js';
// import { createImageElement, create_seeded_avatar } from './card_layout.js';
// import { 
//   parseRoleString,
//   createKeyValueElement,
//   disableEditing,
//   format_column_name,
//   enableEditing,
//   sendCardUpdates
// } from './card_helpers.js';

// // Helper functions are now imported from card_helpers.js

// /**
//  * Avaa ison kortin modaalin. Näyttää kootusti kortin kentät, roolit ym.
//  * Täällä näytetään aina label, koska "isolla kortilla tiedot saavat olla näkyvillä".
//  * Muokkaus huomioi saman rakenteen, eli label ja value ovat erillisissä elementeissä.
//  */
// export async function open_big_card_modal(row_item, table_name) {
//     // Tämä ohjaa vain sitä, käytetäänkö <details> + <summary>-rakennetta isojen tekstien lyhennykseen,
//     // EI sitä, näytetäänkö description-kentät ylipäätään.
//     let summary_details = false; // aseta false, jos haluat aina näyttää koko tekstin

//     try {
//         let data_types = {};
//         try {
//             data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
//         } catch (error) {
//             console.warn("could not parse data_types for table", table_name, error);
//         }

//         const columns = Object.keys(row_item);
//         const sorted_columns = [...columns];
//         sorted_columns.sort((colA, colB) => {
//             const a_card_element = data_types[colA]?.card_element || '';
//             const b_card_element = data_types[colB]?.card_element || '';
//             if (a_card_element && !b_card_element) return -1;
//             if (!a_card_element && b_card_element) return 1;
//             return 0;
//         });

//         // Otsikoksi valitaan header-roolin arvo
//         let modal_header_text = '';

//         // Suuri container modalia varten
//         const big_card_div = document.createElement('div');
//         big_card_div.classList.add('big_card_container');

//         const card_modal_content_div = document.createElement('div');
//         card_modal_content_div.classList.add('big_card_content');

//         // Haetaan headerin eka kirjain (avataria varten)
//         let header_first_letter = '';
//         for (const col of sorted_columns) {
//             const roleFull = data_types[col]?.card_element || '';
//             const { baseRoles } = parseRoleString(roleFull);
//             if (baseRoles.includes('header')) {
//                 const val_str = row_item[col] ? String(row_item[col]) : '';
//                 if (val_str.trim()) {
//                     header_first_letter = val_str.trim()[0];
//                 }
//             }
//         }

//         // Luontiaika / ID seed
//         const created_part = row_item.created
//             || row_item.created_at
//             || row_item.luontiaika
//             || null;
//         const id_part = (row_item.id !== undefined) ? String(row_item.id) : 'unknown_id';
//         const creation_seed = created_part ? `${id_part}_${created_part}` : id_part;

//         // Onko taululla image-rooli?
//         const table_has_image_role = sorted_columns.some(col => {
//             const { baseRoles } = parseRoleString(data_types[col]?.card_element || '');
//             return baseRoles.includes('image');
//         });

//         const description_entries = [];
//         const details_entries = [];
//         const keywords_list = [];
//         let found_image_for_this_row = false;

//         // Sarakkeiden käsittely
//         for (const column of sorted_columns) {
//             const raw_val = row_item[column];
//             let val_str = '';
//             if (raw_val !== null && raw_val !== undefined) {
//                 val_str = (typeof raw_val === 'string') ? raw_val : String(raw_val);
//             }

//             const roleFull = data_types[column]?.card_element || '';
//             const { baseRoles, hasLangKey } = parseRoleString(roleFull);

//             // Iso kortti => label näytetään aina
//             const column_label = format_column_name(column);

//             // Jos rooleja ei ole, näytetään peruskenttänä
//             if (baseRoles.length === 0) {
//                 const kvElem = createKeyValueElement(
//                     column_label,
//                     val_str,
//                     column,
//                     hasLangKey,
//                     'big_card_generic_field'
//                 );
//                 card_modal_content_div.appendChild(kvElem);
//                 continue;
//             }

//             let handled = false;
//             for (const singleRole of baseRoles) {
//                 // hidden -> ohitetaan
//                 if (/^hidden(\d+)?$/.test(singleRole)) {
//                     handled = true;
//                     continue;
//                 }
//                 // description
//                 if (/^description(\d+)?$/.test(singleRole)) {
//                     let suffix_number = Number.MAX_SAFE_INTEGER;
//                     const match = singleRole.match(/^description(\d+)?$/);
//                     if (match && match[1]) {
//                         suffix_number = parseInt(match[1], 10);
//                     }
//                     description_entries.push({
//                         suffix_number,
//                         rawValue: val_str,
//                         label: column_label,
//                         hasLangKey,
//                         column
//                     });
//                     handled = true;
//                     continue;
//                 }

//                 // details
//                 if (/^details(\d+)?$/.test(singleRole)) {
//                     let suffix_number = Number.MAX_SAFE_INTEGER;
//                     const match = singleRole.match(/^details(\d+)?$/);
//                     if (match && match[1]) {
//                         suffix_number = parseInt(match[1], 10);
//                     }
//                     details_entries.push({
//                         suffix_number,
//                         rawValue: val_str,
//                         label: column_label,
//                         hasLangKey,
//                         column
//                     });
//                     handled = true;
//                     continue;
//                 }

//                 // keywords
//                 if (singleRole === 'keywords') {
//                     keywords_list.push({
//                         column,
//                         rawValue: val_str,
//                         label: column_label,
//                         hasLangKey
//                     });
//                     handled = true;
//                     continue;
//                 }

//                 // image
//                 if (singleRole === 'image') {
//                     found_image_for_this_row = true;
//                     const image_div = document.createElement('div');
//                     image_div.classList.add('big_card_image');

//                     if (val_str.trim()) {
//                         let img_src = val_str.trim();
//                         if (
//                             !img_src.startsWith('http://') &&
//                             !img_src.startsWith('https://') &&
//                             !img_src.startsWith('./') &&
//                             !img_src.startsWith('/')
//                         ) {
//                             const possibleMatch = img_src.match(/^(\d+)_(\d+)_(\d+)\.(\w+)$/);
//                             if (possibleMatch) {
//                                 const mainTableId = possibleMatch[1];
//                                 const mainRowId = possibleMatch[2];
//                                 img_src = `/media/${mainTableId}/${mainRowId}/${img_src}`;
//                             } else {
//                                 img_src = '/media/' + img_src;
//                             }
//                         }
//                         const fancyImgEl = createImageElement(img_src, true);
//                         image_div.appendChild(fancyImgEl);
//                     } else {
//                         // Avatar
//                         const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
//                         image_div.appendChild(avatar);
//                     }
//                     card_modal_content_div.appendChild(image_div);
//                     handled = true;
//                     continue;
//                 }

//                 // header
//                 if (singleRole === 'header') {
//                     // Tallennetaan vain otsikkoteksti modaalin yläotsikolle
//                     if (hasLangKey) {
//                         modal_header_text = val_str;
//                     } else {
//                         modal_header_text = `${column_label}: ${val_str}`;
//                     }

//                     // Luodaan myös iso header-elementti kortin sisälle
//                     const header_el = document.createElement('div');
//                     header_el.classList.add('big_card_header');
//                     if (hasLangKey) {
//                         header_el.setAttribute('data-lang-key', val_str);
//                     } else {
//                         const kvElem = createKeyValueElement(
//                             column_label,
//                             val_str,
//                             column,
//                             hasLangKey,
//                             'big_card_header_value'
//                         );
//                         header_el.appendChild(kvElem);
//                     }
//                     header_el.style.whiteSpace = 'pre-wrap';

//                     card_modal_content_div.appendChild(header_el);
//                     handled = true;
//                     continue;
//                 }

//                 // creation_spec
//                 if (singleRole === 'creation_spec') {
//                     const creation_div = document.createElement('div');
//                     creation_div.classList.add('big_card_creation_spec');
//                     if (hasLangKey) {
//                         creation_div.setAttribute('data-lang-key', val_str);
//                     } else {
//                         const kvElem = createKeyValueElement(
//                             column_label,
//                             val_str,
//                             column,
//                             hasLangKey,
//                             'big_card_creation_value'
//                         );
//                         creation_div.appendChild(kvElem);
//                         creation_div.style.whiteSpace = 'pre-wrap';
//                     }
//                     card_modal_content_div.appendChild(creation_div);
//                     handled = true;
//                     continue;
//                 }

//                 // Tuntematon rooli => avain-arvo
//                 if (!handled) {
//                     const kvElem = createKeyValueElement(
//                         column_label,
//                         val_str,
//                         column,
//                         hasLangKey,
//                         'big_card_generic_field'
//                     );
//                     card_modal_content_div.appendChild(kvElem);
//                     handled = true;
//                 }
//             }
//         }

//         // Jos taululla on image-rooli, mutta ei kuvaa => iso avatar
//         if (table_has_image_role && !found_image_for_this_row) {
//             const image_div = document.createElement('div');
//             image_div.classList.add('big_card_image');
//             const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
//             image_div.appendChild(avatar);
//             card_modal_content_div.appendChild(image_div);
//         }

//         // Jos ei image-roolia ollenkaan => iso avatar
//         if (!table_has_image_role) {
//             const avatar_div = document.createElement('div');
//             avatar_div.classList.add('big_card_image');
//             const big_avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
//             avatar_div.appendChild(big_avatar);
//             card_modal_content_div.appendChild(avatar_div);
//         }

//         // Sortataan description- ja details-listat
//         description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
//         details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

//         // description-osiot
//         if (description_entries.length > 0) {
//             const desc_container = document.createElement('div');
//             desc_container.classList.add('big_card_description_container');

//             for (const descObj of description_entries) {
//                 const d = document.createElement('div');
//                 d.classList.add('single_big_description');

//                 // Käytetään lyhennystä vain jos summary_details on true
//                 if (summary_details) {
//                     // Jos teksti on kovin pitkä, piilotetaan loput <details>-elementtiin
//                     if (!descObj.hasLangKey && descObj.rawValue.length > 300) {
//                         const details_el = document.createElement('details');
//                         const summary_el = document.createElement('summary');
//                         summary_el.textContent = descObj.rawValue.slice(0, 300) + '...';
//                         details_el.appendChild(summary_el);

//                         const restText = descObj.rawValue.slice(300);
//                         const kvElem = createKeyValueElement(
//                             descObj.label,
//                             restText,
//                             descObj.column,
//                             descObj.hasLangKey,
//                             'big_description_value'
//                         );
//                         details_el.appendChild(kvElem);

//                         d.appendChild(details_el);

//                     } else {
//                         // Teksti lyhyt tai on kieliavain – näytetään suoraan
//                         const kvElem = createKeyValueElement(
//                             descObj.label,
//                             descObj.rawValue,
//                             descObj.column,
//                             descObj.hasLangKey,
//                             'big_description_value'
//                         );
//                         d.appendChild(kvElem);
//                     }
//                 } else {
//                     // summary_details = false => näytetään koko teksti suoraan
//                     const kvElem = createKeyValueElement(
//                         descObj.label,
//                         descObj.rawValue,
//                         descObj.column,
//                         descObj.hasLangKey,
//                         'big_description_value'
//                     );
//                     d.appendChild(kvElem);
//                 }

//                 desc_container.appendChild(d);
//             }
//             card_modal_content_div.appendChild(desc_container);
//         }

//         // keywords
//         if (keywords_list.length > 0) {
//             const kw_container = document.createElement('div');
//             kw_container.classList.add('big_card_keywords_container');
//             for (const kwObj of keywords_list) {
//                 const k = document.createElement('div');
//                 k.classList.add('big_card_keyword_item');

//                 const kvElem = createKeyValueElement(
//                     kwObj.label,
//                     kwObj.rawValue,
//                     kwObj.column,
//                     kwObj.hasLangKey,
//                     'big_card_keyword_value'
//                 );
//                 k.appendChild(kvElem);

//                 kw_container.appendChild(k);
//             }
//             card_modal_content_div.appendChild(kw_container);
//         }

//         // details-osio
//         if (details_entries.length > 0) {
//             const details_container = document.createElement('div');
//             details_container.classList.add('big_card_details_container');
//             details_container.style.display = 'grid';
//             details_container.style.gridTemplateColumns = '1fr 1fr';
//             details_container.style.gap = '0.5rem';

//             for (const detailObj of details_entries) {
//                 const detail_item = document.createElement('div');
//                 detail_item.classList.add('big_card_detail_item');

//                 if (summary_details) {
//                     // summary_details = true => piilotetaan loppu jos teksti on kovin pitkä
//                     if (!detailObj.hasLangKey && detailObj.rawValue.length > 300) {
//                         const details_el = document.createElement('details');
//                         const summary_el = document.createElement('summary');
//                         summary_el.textContent = detailObj.rawValue.slice(0, 300) + '...';
//                         details_el.appendChild(summary_el);

//                         const restText = detailObj.rawValue.slice(300);
//                         const kvElem = createKeyValueElement(
//                             detailObj.label,
//                             restText,
//                             detailObj.column,
//                             detailObj.hasLangKey,
//                             'big_card_detail_value'
//                         );
//                         details_el.appendChild(kvElem);
//                         detail_item.appendChild(details_el);
//                     } else {
//                         const kvElem = createKeyValueElement(
//                             detailObj.label,
//                             detailObj.rawValue,
//                             detailObj.column,
//                             detailObj.hasLangKey,
//                             'big_card_detail_value'
//                         );
//                         detail_item.appendChild(kvElem);
//                     }
//                 } else {
//                     // summary_details = false => näytetään aina koko teksti
//                     const kvElem = createKeyValueElement(
//                         detailObj.label,
//                         detailObj.rawValue,
//                         detailObj.column,
//                         detailObj.hasLangKey,
//                         'big_card_detail_value'
//                     );
//                     detail_item.appendChild(kvElem);
//                 }

//                 details_container.appendChild(detail_item);
//             }
//             card_modal_content_div.appendChild(details_container);
//         }

//         // Dynaamiset lapsitiedot
//         if (row_item.id) {
//             try {
//                 const dynamic_child_data = await endpoint_router('fetchDynamicChildren', {
//                     method: 'POST',
//                     body_data: {
//                         parent_table: table_name,
//                         parent_pk_value: String(row_item.id)
//                     },
//                 });
//                 console.log('open_big_card_modal.js: dynaamiset lapsitiedot:', dynamic_child_data);

//                 if (dynamic_child_data && dynamic_child_data.child_tables) {
//                     for (const child_obj of dynamic_child_data.child_tables) {
//                         const child_table_name = child_obj.table;
//                         const child_column_name = child_obj.column;
//                         const child_rows = child_obj.rows || [];

//                         const child_container_div = document.createElement('div');
//                         child_container_div.classList.add('big_card_child_container');

//                         const child_header = document.createElement('h3');
//                         child_header.textContent = `${child_table_name} - ${child_column_name}`;
//                         child_container_div.appendChild(child_header);

//                         const link_elem = document.createElement('a');
//                         link_elem.href = `/tables/${child_table_name}?${child_column_name}=${row_item.id}`;
//                         link_elem.textContent = `Avaa /tables/${child_table_name}?${child_column_name}=${row_item.id}`;
//                         link_elem.target = '_blank';
//                         child_container_div.appendChild(link_elem);

//                         child_rows.forEach(single_child_row => {
//                             const row_div = document.createElement('div');
//                             row_div.classList.add('child_item');
//                             row_div.textContent = JSON.stringify(single_child_row, null, 2);
//                             row_div.style.whiteSpace = 'pre-wrap';
//                             child_container_div.appendChild(row_div);
//                         });

//                         card_modal_content_div.appendChild(child_container_div);
//                     }
//                 }
//             } catch (err) {
//                 console.error("virhe: " + err.message);
//             }
//         }

//         big_card_div.appendChild(card_modal_content_div);

//         // --- MUOKKAUSNAPPI ---
//         let editModeActive = false;
//         const editButton = document.createElement('button');
//         editButton.textContent = 'Muokkaa';
//         editButton.addEventListener('click', async () => {
//             editModeActive = !editModeActive;
//             if (editModeActive) {
//                 editButton.textContent = 'Tallenna';
//                 enableEditing(card_modal_content_div, table_name);
//             } else {
//                 editButton.textContent = 'Muokkaa';
//                 const updatedData = disableEditing(card_modal_content_div);
//                 console.log('Päivitetyt arvot:', updatedData);

//                 // Lähetetään muutokset palvelimelle
//                 if (row_item.id !== undefined) {
//                     try {
//                         await sendCardUpdates(table_name, row_item.id, updatedData);
//                     } catch (err) {
//                         console.error("virhe: " + err.message);
//                     }
//                 }
//             }
//         });
//         big_card_div.appendChild(editButton);

//         // Luodaan modaali, mutta emme luo otsikkoa createModal-funktiossa (skipModalTitle: true)
//         createModal({
//             skipModalTitle: true,
//             tableName: table_name,
//             contentElements: [big_card_div],
//             width: '70vw'
//         });
//         showModal();

//     } catch (err) {
//         console.error("virhe: " + err.message);
//     }
// }