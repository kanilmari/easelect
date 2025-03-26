// card_view.js

import { endpoint_router } from '../../endpoints/endpoint_router.js';
import { update_card_selection } from '../table_view/selection.js';
import { createImageElement, create_seeded_avatar } from './card_layout.js';
import { open_big_card_modal } from './open_big_card_modal.js';
import { 
  parseRoleString,
  createKeyValueElement,
  disableEditing,
  format_column_name,
  enableEditing,
  sendCardUpdates
} from './card_helpers.js';

/**
 * Lisää annettuun card_containeriin itemejä (kortteja) columns- ja data-listan perusteella.
 * Nyt label (avain) ja value (arvo) erotellaan aina omiin diveihin,
 * mutta show_key_on_card -asetuksen mukaan labelin saa myös piiloon.
 */
export function appendDataToCardView(card_container, columns, data, table_name) {
    let data_types = {};
    try {
        data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
    } catch (error) {
        console.warn("card_view.js: could not parse data_types for table", table_name, error);
    }

    data.forEach(item => {
        const card = document.createElement('div');
        card.classList.add('card');

        // Asetetaan cardiin data-id attribuutti
        if (item.id !== undefined && item.id !== null) {
            card.setAttribute('data-id', item.id);
        } else {
            console.log('card_view.js: appendDataToCardView(); ei data-id:tä');
        }

        // Valintaruutu
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('card_checkbox');
        checkbox.addEventListener('change', () => update_card_selection(card));
        card.appendChild(checkbox);

        // Sisältödivi
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('card_content');

        columns.forEach((column) => {
            const pairDiv = document.createElement('div');
            pairDiv.classList.add('card_pair');

            const labelDiv = document.createElement('div');
            labelDiv.classList.add('card_label');

            // Näytetään label vain, jos show_key_on_card on true
            const showKeyOnCard = data_types[column]?.show_key_on_card === true;
            const formatted_label = format_column_name(column);
            labelDiv.textContent = showKeyOnCard ? formatted_label : '';

            const valueDiv = document.createElement('div');
            valueDiv.classList.add('card_value');

            if (Array.isArray(item[column])) {
                valueDiv.textContent = item[column].join(', ');
                valueDiv.style.whiteSpace = 'pre-wrap';
            } else if (typeof item[column] === 'object' && item[column] !== null) {
                valueDiv.textContent = JSON.stringify(item[column], null, 2);
                valueDiv.style.whiteSpace = 'pre-wrap';
            } else {
                const txt = item[column] || '';
                valueDiv.textContent = txt;
                valueDiv.style.whiteSpace = 'pre-wrap';
            }

            pairDiv.appendChild(labelDiv);
            pairDiv.appendChild(valueDiv);
            contentDiv.appendChild(pairDiv);
        });

        card.appendChild(contentDiv);
        card_container.appendChild(card);
    });
}

// parseRoleString is now imported from card_helpers.js

/**
 * Asynkroninen create_card_view: rakentaa kortit data-taulukosta,
 * tukee roolit: header, image, description, details, keywords, creation_spec,
 * sekä kieliavain "lang-key" (tai "lang_key").
 *
 * Jokainen sarake voi sisältää useita rooleja (esim. "image,header").
 * Kaikki roolit otetaan huomioon samalle sarakkeelle.
 *
 * Avain-arvo -parit pidetään erillisinä, jotta ne eivät ole samassa elementissä,
 * mutta show_key_on_card -asetuksella voidaan piilottaa label tarvittaessa.
 */
export async function create_card_view(columns, data, table_name) {
    const card_container = document.createElement('div');
    card_container.classList.add('card_container');

    let data_types = {};
    try {
        data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
    } catch (error) {
        console.warn("could not parse data_types for table", table_name, error);
    }

    // Järjestellään sarakkeet roolien perusteella
    const sorted_columns = [...columns];
    sorted_columns.sort((colA, colB) => {
        const a_card_element = data_types[colA]?.card_element || '';
        const b_card_element = data_types[colB]?.card_element || '';
        if (a_card_element && !b_card_element) return -1;
        if (!a_card_element && b_card_element) return 1;
        return 0;
    });

    // Katsotaan, löytyykö taululta 'image'-roolia
    const tableHasImageRole = sorted_columns.some(col => {
        const { baseRoles } = parseRoleString(data_types[col]?.card_element || '');
        return baseRoles.includes('image');
    });

    // Käydään data-rivit läpi
    for (const row_item of data) {
        const card = document.createElement('div');
        card.classList.add('card');

        if (row_item.id !== undefined && row_item.id !== null) {
            card.setAttribute('data-id', row_item.id);
        } else {
            console.log('card_view.js: create_card_view(); ei data-id:tä');
        }

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('card_checkbox');
        checkbox.addEventListener('change', () => update_card_selection(card));
        card.appendChild(checkbox);

        // Sisällön container
        const card_content_div = document.createElement('div');
        card_content_div.classList.add('card_content');
        if (tableHasImageRole) {
            card_content_div.classList.add('card_content_large');
        } else {
            card_content_div.classList.add('card_content_small');
        }

        // Koontilistat
        const details_entries = [];
        const description_entries = [];
        const keywords_list = [];

        // Headerin eka kirjain avatarille
        let header_first_letter = '';
        const id_part = (row_item.id !== undefined) ? String(row_item.id) : 'unknown_id';

        // Haetaan luontiaika (seed)
        const created_part = row_item.created
            || row_item.created_at
            || row_item.luontiaika
            || null;
        let creation_seed;
        if (created_part) {
            creation_seed = `${id_part}_${created_part}`;
        } else {
            creation_seed = id_part;
        }

        // Poimitaan mahdollinen ensimmäinen header-kirjain
        for (const col of sorted_columns) {
            const roleFull = data_types[col]?.card_element || '';
            const { baseRoles } = parseRoleString(roleFull);
            if (baseRoles.includes('header')) {
                const raw_val = row_item[col];
                const val_str = (typeof raw_val === 'string') ? raw_val : String(raw_val ?? '');
                const trimmed = val_str.trim();
                if (trimmed) {
                    header_first_letter = trimmed[0];
                }
            }
        }

        let found_image_for_this_row = false;

        // Käydään sarakkeet läpi
        for (const column of sorted_columns) {
            const raw_val = row_item[column];
            let val_str = '';
            if (raw_val !== null && raw_val !== undefined) {
                val_str = (typeof raw_val === 'string') ? raw_val : String(raw_val);
            }

            const roleFull = data_types[column]?.card_element || '';
            const { baseRoles, hasLangKey } = parseRoleString(roleFull);

            const showKeyOnCard = data_types[column]?.show_key_on_card === true;
            const column_label = showKeyOnCard ? format_column_name(column) : '';

            // Jos ei rooleja, tulkitaan tavallisena tekstinä
            if (baseRoles.length === 0) {
                if (val_str.trim()) {
                    const wrapper = document.createElement('div');
                    wrapper.classList.add('card_pair');
                    const kvElem = createKeyValueElement(
                        column_label,
                        val_str,
                        column,
                        hasLangKey,
                        'card_value'
                    );
                    wrapper.appendChild(kvElem);
                    card_content_div.appendChild(wrapper);
                }
                continue;
            }

            // Käsitellään kukin rooli
            for (const singleRole of baseRoles) {

                // hidden
                if (/^hidden(\d+)?$/.test(singleRole) && val_str.trim()) {
                    // Ei näytetä eikä tallenneta
                    continue;
                }

                // description
                if (/^description(\d+)?$/.test(singleRole) && val_str.trim()) {
                    let suffix_number = Number.MAX_SAFE_INTEGER;
                    const match = singleRole.match(/^description(\d+)?$/);
                    if (match && match[1]) {
                        suffix_number = parseInt(match[1], 10);
                    }
                    description_entries.push({
                        suffix_number,
                        rawValue: val_str,
                        label: column_label,  // label näkyy vain, jos showKeyOnCard
                        hasLangKey,
                        column
                    });
                    continue;
                }

                // details
                if (/^details(\d+)?$/.test(singleRole) && val_str.trim()) {
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
                        column
                    });
                    continue;
                }

                // keywords
                if (singleRole === 'keywords' && val_str.trim()) {
                    keywords_list.push({
                        column,
                        rawValue: val_str,
                        label: column_label,
                        hasLangKey
                    });
                    continue;
                }

                // image
                if (singleRole === 'image') {
                    found_image_for_this_row = true;
                    const elem_div = document.createElement('div');
                    elem_div.classList.add('card_image');

                    const useLargeSize = tableHasImageRole;
                    if (val_str.trim()) {
                        let image_src = val_str.trim();
                        // Polun korjaus
                        if (
                            !image_src.startsWith('http://') &&
                            !image_src.startsWith('https://') &&
                            !image_src.startsWith('./') &&
                            !image_src.startsWith('/')
                        ) {
                            const match = image_src.match(/^(\d+)_(\d+)_(\d+)\.(\w+)$/);
                            if (match) {
                                const mainTableId = match[1];
                                const mainRowId = match[2];
                                image_src = `/media/${mainTableId}/${mainRowId}/${image_src}`;
                            } else {
                                image_src = '/media/' + image_src;
                            }
                        }
                        const blurredImageElement = createImageElement(image_src, useLargeSize);
                        elem_div.appendChild(blurredImageElement);

                    } else {
                        // Avatar
                        const avatar = await create_seeded_avatar(creation_seed, header_first_letter, useLargeSize);
                        elem_div.appendChild(avatar);
                    }
                    card_content_div.appendChild(elem_div);
                    continue;
                }

                // header
                if (singleRole === 'header') {
                    const elem_div = document.createElement('div');
                    elem_div.classList.add('card_header');
                    if (hasLangKey) {
                        elem_div.setAttribute('data-lang-key', val_str);
                    } else {
                        // Aina avain–arvo -erittely, mutta piilotetaan avain jos showKeyOnCard=false
                        const wrapper = document.createElement('div');
                        wrapper.classList.add('card_pair');
                        const kvElem = createKeyValueElement(
                            column_label,
                            val_str,
                            column,
                            hasLangKey,
                            'header_value'
                        );
                        wrapper.appendChild(kvElem);
                        elem_div.appendChild(wrapper);
                        elem_div.style.whiteSpace = 'pre-wrap';
                    }
                    elem_div.addEventListener('click', (e) => {
                        e.preventDefault();
                        open_big_card_modal(row_item, table_name);
                    });
                    card_content_div.appendChild(elem_div);
                    continue;
                }

                // creation_spec
                if (singleRole === 'creation_spec') {
                    const elem_div = document.createElement('div');
                    elem_div.classList.add('card_creation_spec');
                    if (hasLangKey) {
                        elem_div.setAttribute('data-lang-key', val_str);
                    } else {
                        // Aina avain–arvo -erittely
                        const wrapper = document.createElement('div');
                        wrapper.classList.add('card_pair');
                        const kvElem = createKeyValueElement(
                            column_label,
                            val_str,
                            column,
                            hasLangKey,
                            'creation_value'
                        );
                        wrapper.appendChild(kvElem);
                        elem_div.appendChild(wrapper);
                        elem_div.style.whiteSpace = 'pre-wrap';
                    }
                    card_content_div.appendChild(elem_div);
                    continue;
                }

                // jokin tuntematon rooli => perus tekstikenttä avain-arvo -erottelulla
                if (val_str.trim()) {
                    const wrapper = document.createElement('div');
                    wrapper.classList.add('card_pair');

                    const kvElem = createKeyValueElement(
                        column_label,
                        val_str,
                        column,
                        hasLangKey,
                        'card_details'
                    );
                    wrapper.appendChild(kvElem);

                    card_content_div.appendChild(wrapper);
                }
            }
        }

        // Jos taululla on image-rooli, mutta ei kuvadataa -> avatar
        if (tableHasImageRole && !found_image_for_this_row) {
            const image_div = document.createElement('div');
            image_div.classList.add('card_image');
            const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
            image_div.appendChild(avatar);
            card_content_div.appendChild(image_div);
        }

        // Jos taululla EI ole image-roolia -> pieni avatar
        if (!tableHasImageRole) {
            const avatarDiv = document.createElement('div');
            avatarDiv.classList.add('card_image');
            const smallAvatar = await create_seeded_avatar(creation_seed, header_first_letter, false);
            avatarDiv.appendChild(smallAvatar);
            card_content_div.appendChild(avatarDiv);
        }

        // Lajitellaan ja lisätään description-entries
        description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
        if (description_entries.length > 0) {
            const desc_container = document.createElement('div');
            desc_container.classList.add('card_description_container');

            for (const descObj of description_entries) {
                const d = document.createElement('div');
                d.classList.add('single_description_item');

                if (!descObj.hasLangKey) {
                    const rawLength = descObj.rawValue.length;
                    if (rawLength > 500) {
                        const shortText = descObj.rawValue.slice(0, 500) + '...';
                        const wrapper = createKeyValueElement(
                            descObj.label,
                            shortText,
                            descObj.column,
                            descObj.hasLangKey,
                            'description_value'
                        );

                        // Linkki heti lyhennetyn tekstin jatkoksi
                        const valueDiv = wrapper.querySelector('[data-column="' + descObj.column + '"]');
                        if (valueDiv) {
                            valueDiv.appendChild(document.createTextNode(' '));
                            valueDiv.appendChild(createShowMoreLink(row_item, table_name));
                        }
                        d.appendChild(wrapper);
                    } else {
                        const wrapper = createKeyValueElement(
                            descObj.label,
                            descObj.rawValue,
                            descObj.column,
                            descObj.hasLangKey,
                            'description_value'
                        );
                        d.appendChild(wrapper);
                    }
                } else {
                    const wrapper = createKeyValueElement(
                        descObj.label,
                        descObj.rawValue,
                        descObj.column,
                        descObj.hasLangKey,
                        'description_value'
                    );
                    d.appendChild(wrapper);
                }
                desc_container.appendChild(d);
            }
            card_content_div.appendChild(desc_container);
        }

        // keywords-list
        if (keywords_list.length > 0) {
            const kw_container = document.createElement('div');
            kw_container.classList.add('card_keywords_container');
            for (const kwObj of keywords_list) {
                const k = document.createElement('div');
                k.classList.add('single_keyword_item');

                // Jos ei kieliavain, lyhennetään pitkät keywordit ja näytetään “Näytä lisää”
                if (!kwObj.hasLangKey && kwObj.rawValue.length > 160) {
                    const shortText = kwObj.rawValue.slice(0, 160) + '...';
                    const wrapper = createKeyValueElement(
                        kwObj.label,
                        shortText,
                        kwObj.column,
                        kwObj.hasLangKey,
                        'keyword_value'
                    );

                    const valueDiv = wrapper.querySelector('[data-column="' + kwObj.column + '"]');
                    if (valueDiv) {
                        valueDiv.appendChild(document.createTextNode(' '));
                        valueDiv.appendChild(createShowMoreLink(row_item, table_name));
                    }
                    k.appendChild(wrapper);
                } else {
                    // Näytetään koko keyword
                    const wrapper = createKeyValueElement(
                        kwObj.label,
                        kwObj.rawValue,
                        kwObj.column,
                        kwObj.hasLangKey,
                        'keyword_value'
                    );
                    k.appendChild(wrapper);
                }

                kw_container.appendChild(k);
            }
            card_content_div.appendChild(kw_container);
        }

        // Käsitellään details-entries (nyt ilman summary_details-flagia, pelkkä pituustarkistus)
        details_entries.sort((a, b) => a.suffix_number - b.suffix_number);
        if (details_entries.length > 0) {
            const details_container = document.createElement('div');
            details_container.classList.add('card_details_container');

            const detail_count = details_entries.length;
            const row_count = Math.ceil(detail_count / 2);
            details_container.style.display = 'grid';
            details_container.style.gridAutoFlow = 'column';
            details_container.style.gridTemplateColumns = '1fr 1fr';
            details_container.style.gridTemplateRows = `repeat(${row_count}, auto)`;
            details_container.style.gap = '0.5rem';

            for (const detailObj of details_entries) {
                const detail_item = document.createElement('div');
                detail_item.classList.add('single_detail_item');

                // Luodaan ensin avain–arvo -elementti (jotta label näkyy).
                const wrapper = createKeyValueElement(
                    detailObj.label,
                    '', // teksti lisätään vasta alla
                    detailObj.column,
                    detailObj.hasLangKey,
                    'detail_value'
                );

                const valueDiv = wrapper.querySelector('.detail_value');

                // Jos teksti on tosi pitkä, lyhennetään ja näytetään “Näytä lisää” -linkki.
                if (!detailObj.hasLangKey && detailObj.rawValue.length > 80) {
                    const truncatedText = detailObj.rawValue.slice(0, 80) + '...';
                    const textDiv = document.createElement('div');
                    textDiv.textContent = truncatedText + ' ';

                    textDiv.appendChild(createShowMoreLink(row_item, table_name));
                    valueDiv.appendChild(textDiv);
                } else {
                    // Muuten näytetään koko teksti
                    valueDiv.textContent = detailObj.rawValue;
                }

                detail_item.appendChild(wrapper);
                details_container.appendChild(detail_item);
            }
            card_content_div.appendChild(details_container);
        }

        // Kortin footer
        const footer_div = document.createElement('div');
        footer_div.classList.add('card_footer');

        const footer_button = document.createElement('button');
        footer_button.textContent = 'Avaa modal';
        footer_button.addEventListener('click', (e) => {
            e.preventDefault();
            open_big_card_modal(row_item, table_name);
        });
        footer_div.appendChild(footer_button);

        card_content_div.appendChild(footer_div);
        card.appendChild(card_content_div);
        card_container.appendChild(card);
    }

    return card_container;
}


function createShowMoreLink(row_item, table_name) {
    const link = document.createElement('a');
    link.href = '#';
    link.classList.add('show_more_link');
    link.setAttribute('data-lang-key', 'show_more');
    link.addEventListener('click', (e) => {
        e.preventDefault();
        open_big_card_modal(row_item, table_name);
    });
    return link;
}

// createKeyValueElement is now imported from card_helpers.js

// The open_big_card_modal function has been moved to its own file

// sendCardUpdates is now imported from card_helpers.js

// enableEditing is now imported from card_helpers.js

// disableEditing is now imported from card_helpers.js

// format_column_name is now imported from card_helpers.js