// card_view.js

import { createModal, showModal } from '../../../common_components/modal/modal_factory.js';
import { endpoint_router } from '../../endpoints/endpoint_router.js';
import { update_card_selection } from '../table_view/selection.js';
import { createImageElement, create_seeded_avatar } from './card_layout.js';

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

/**
 * parseRoleString - tukee useita pilkulla erotettuja rooleja 
 * (esim. "image,header+lang-key" tai "header+lang_key").
 * Palauttaa:
 *   {
 *     baseRoles: [...],  // esim. ['image','header']
 *     hasLangKey: boolean
 *   }
 */
function parseRoleString(roleStr) {
    if (!roleStr) return { baseRoles: [], hasLangKey: false };

    const rolesRaw = roleStr.split(',').map(r => r.trim());
    let hasLangKey = false;
    const baseRoles = [];

    rolesRaw.forEach(role => {
        if (role.includes('+')) {
            // rooli esim. "header+lang-key" tai "header+lang_key"
            const [mainRole, extra] = role.split('+').map(r => r.trim());
            baseRoles.push(mainRole);
            if (extra === 'lang-key' || extra === 'lang_key') {
                hasLangKey = true;
            }
        } else {
            baseRoles.push(role);
        }
    });

    return { baseRoles, hasLangKey };
}

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

/**
 * Pieni apufunktio, joka erottaa labelin ja arvon eri elementteihin.
 * - Avain näytetään vain, jos sitä ei ole tyhjennetty jo (ts. jos haluttiin näyttää se).
 * - Arvo tallennetaan valueDiv:iin, jossa on data-column-attribuutti.
 * - Jos hasLangKey on true, arvon sijaan asetetaan data-lang-key-attribuutti.
 */
function createKeyValueElement(column_label, raw_value, column, hasLangKey, cssClass = 'big_card_generic_field') {
    const wrapper = document.createElement('div');
    wrapper.classList.add('key_value_wrapper');

    // Näytetään avain vain jos column_label ei ole tyhjä
    if (column_label) {
        const labelDiv = document.createElement('div');
        labelDiv.classList.add('kv_label');
        labelDiv.textContent = column_label;
        wrapper.appendChild(labelDiv);
    }

    // Arvo:
    const valueDiv = document.createElement('div');
    valueDiv.classList.add(cssClass);
    valueDiv.setAttribute('data-column', column);

    // Tallennetaan raaka arvo data-raw-value -kenttään (editointia varten)
    valueDiv.setAttribute('data-raw-value', raw_value);

    if (hasLangKey) {
        // Kieliavain => jätetään textContent tyhjäksi, asetetaan attribuutti
        valueDiv.setAttribute('data-lang-key', raw_value);
    } else {
        valueDiv.textContent = raw_value;
        valueDiv.style.whiteSpace = 'pre-wrap';
    }

    wrapper.appendChild(valueDiv);

    return wrapper;
}

/**
 * Avaa ison kortin modaalin. Näyttää kootusti kortin kentät, roolit ym.
 * Täällä näytetään aina label, koska "isolla kortilla tiedot saavat olla näkyvillä".
 * Muokkaus huomioi saman rakenteen, eli label ja value ovat erillisissä elementeissä.
 */
// card_view.js

/**
 * Avaa ison kortin modaalin. Näyttää kootusti kortin kentät, roolit ym.
 * Täällä näytetään aina label, koska "isolla kortilla tiedot saavat olla näkyvillä".
 * Muokkaus huomioi saman rakenteen, eli label ja value ovat erillisissä elementeissä.
 */
export async function open_big_card_modal(row_item, table_name) {
    // Tämä ohjaa vain sitä, käytetäänkö <details> + <summary>-rakennetta isojen tekstien lyhennykseen,
    // EI sitä, näytetäänkö description-kentät ylipäätään.
    let summary_details = false; // aseta false, jos haluat aina näyttää koko tekstin

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

        // Otsikoksi valitaan header-roolin arvo
        let modal_header_text = '';

        // Suuri container modalia varten
        const big_card_div = document.createElement('div');
        big_card_div.classList.add('big_card_container');

        const card_modal_content_div = document.createElement('div');
        card_modal_content_div.classList.add('big_card_content');

        // Haetaan headerin eka kirjain (avataria varten)
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

        // Luontiaika / ID seed
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

            // Iso kortti => label näytetään aina
            const column_label = format_column_name(column);

            // Jos rooleja ei ole, näytetään peruskenttänä
            if (baseRoles.length === 0) {
                const kvElem = createKeyValueElement(
                    column_label,
                    val_str,
                    column,
                    hasLangKey,
                    'big_card_generic_field'
                );
                card_modal_content_div.appendChild(kvElem);
                continue;
            }

            let handled = false;
            for (const singleRole of baseRoles) {
                // hidden -> ohitetaan
                if (/^hidden(\d+)?$/.test(singleRole)) {
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

                // details
                if (/^details(\d+)?$/.test(singleRole)) {
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
                    // Tallennetaan vain otsikkoteksti modaalin yläotsikolle
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
                        const kvElem = createKeyValueElement(
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
                        const kvElem = createKeyValueElement(
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

                // Tuntematon rooli => avain-arvo
                if (!handled) {
                    const kvElem = createKeyValueElement(
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

        // Jos ei image-roolia ollenkaan => iso avatar
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

        // description-osiot
        if (description_entries.length > 0) {
            const desc_container = document.createElement('div');
            desc_container.classList.add('big_card_description_container');

            for (const descObj of description_entries) {
                const d = document.createElement('div');
                d.classList.add('single_big_description');

                // Käytetään lyhennystä vain jos summary_details on true
                if (summary_details) {
                    // Jos teksti on kovin pitkä, piilotetaan loput <details>-elementtiin
                    if (!descObj.hasLangKey && descObj.rawValue.length > 300) {
                        const details_el = document.createElement('details');
                        const summary_el = document.createElement('summary');
                        summary_el.textContent = descObj.rawValue.slice(0, 300) + '...';
                        details_el.appendChild(summary_el);

                        const restText = descObj.rawValue.slice(300);
                        const kvElem = createKeyValueElement(
                            descObj.label,
                            restText,
                            descObj.column,
                            descObj.hasLangKey,
                            'big_description_value'
                        );
                        details_el.appendChild(kvElem);

                        d.appendChild(details_el);

                    } else {
                        // Teksti lyhyt tai on kieliavain – näytetään suoraan
                        const kvElem = createKeyValueElement(
                            descObj.label,
                            descObj.rawValue,
                            descObj.column,
                            descObj.hasLangKey,
                            'big_description_value'
                        );
                        d.appendChild(kvElem);
                    }
                } else {
                    // summary_details = false => näytetään koko teksti suoraan
                    const kvElem = createKeyValueElement(
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

                const kvElem = createKeyValueElement(
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

        // details-osio
        if (details_entries.length > 0) {
            const details_container = document.createElement('div');
            details_container.classList.add('big_card_details_container');
            details_container.style.display = 'grid';
            details_container.style.gridTemplateColumns = '1fr 1fr';
            details_container.style.gap = '0.5rem';

            for (const detailObj of details_entries) {
                const detail_item = document.createElement('div');
                detail_item.classList.add('big_card_detail_item');

                if (summary_details) {
                    // summary_details = true => piilotetaan loppu jos teksti on kovin pitkä
                    if (!detailObj.hasLangKey && detailObj.rawValue.length > 300) {
                        const details_el = document.createElement('details');
                        const summary_el = document.createElement('summary');
                        summary_el.textContent = detailObj.rawValue.slice(0, 300) + '...';
                        details_el.appendChild(summary_el);

                        const restText = detailObj.rawValue.slice(300);
                        const kvElem = createKeyValueElement(
                            detailObj.label,
                            restText,
                            detailObj.column,
                            detailObj.hasLangKey,
                            'big_card_detail_value'
                        );
                        details_el.appendChild(kvElem);
                        detail_item.appendChild(details_el);
                    } else {
                        const kvElem = createKeyValueElement(
                            detailObj.label,
                            detailObj.rawValue,
                            detailObj.column,
                            detailObj.hasLangKey,
                            'big_card_detail_value'
                        );
                        detail_item.appendChild(kvElem);
                    }
                } else {
                    // summary_details = false => näytetään aina koko teksti
                    const kvElem = createKeyValueElement(
                        detailObj.label,
                        detailObj.rawValue,
                        detailObj.column,
                        detailObj.hasLangKey,
                        'big_card_detail_value'
                    );
                    detail_item.appendChild(kvElem);
                }

                details_container.appendChild(detail_item);
            }
            card_modal_content_div.appendChild(details_container);
        }

        // Dynaamiset lapsitiedot
        if (row_item.id) {
            try {
                const dynamic_child_data = await endpoint_router('fetchDynamicChildren', {
                    method: 'POST',
                    body_data: {
                        parent_table: table_name,
                        parent_pk_value: String(row_item.id)
                    },
                });
                console.log('card_view.js: open_big_card_modal(); dynaamiset lapsitiedot:', dynamic_child_data);

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

        // Luodaan modaali, mutta emme luo otsikkoa createModal-funktiossa (skipModalTitle: true)
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
 * Lähettää kerralla kortin päivittyneet sarake-arvot palvelimelle.
 * Käyttää yksitellen 'id + column + value' -formaattia.
 */
export async function sendCardUpdates(table_name, rowId, updatedData) {
    console.log(`[${table_name}] Lähetetään kortin uudet arvot, rowId=${rowId}`, updatedData);

    for (const [column, value] of Object.entries(updatedData)) {
        const payload = {
            id: rowId,
            column: column,
            value: value
        };

        try {
            const response = await fetch(`/api/update-row?table=${table_name}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Update failed for column ${column}: HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log(`[${table_name}] OK, sarake=${column} päivitetty, vastaus:`, result);

        } catch (err) {
            console.error("virhe: " + err.message);
        }
    }
}

/**
 * Korvaa tekstisisällöt <input>- tai <textarea>-kentillä,
 * mutta vain, jos rakenteessa editable_in_ui on true kyseiselle sarakkeelle ja taululle.
 */
export function enableEditing(container, table_name) {
    console.log('enabling editing... table= ' + table_name);
    let parsedFullTreeData = null;

    // Haetaan schema-/column-tiedot localStoragesta
    try {
        const rawFullTreeData = localStorage.getItem('full_tree_data');
        if (rawFullTreeData) {
            parsedFullTreeData = JSON.parse(rawFullTreeData);
        }
    } catch (e) {
        console.warn(`enableEditing: ei voitu jäsentää full_tree_data taululle ${table_name}:`, e);
    }

    // Muodostetaan nopeat hakurakenteet: { column_name -> { editable_in_ui, data_type } }
    const columnInfoMap = {};
    if (parsedFullTreeData && Array.isArray(parsedFullTreeData.column_details)) {
        for (const colObj of parsedFullTreeData.column_details) {
            if (colObj.table_name === table_name && colObj.column_name) {
                columnInfoMap[colObj.column_name] = {
                    editable_in_ui: !!colObj.editable_in_ui,
                    data_type: colObj.data_type || 'text'
                };
            }
        }
    }

    // Käydään läpi kaikki elementit, joissa data-column-attribuutti
    const textFields = container.querySelectorAll('[data-column]');
    textFields.forEach((fieldElem) => {
        const columnName = fieldElem.getAttribute('data-column');
        if (!columnInfoMap[columnName]) {
            console.log(`[${table_name}] sarakkeelle ${columnName} ei löydy columnInfoMap:ia => ei muokata.`);
            return;
        }

        const isEditable = columnInfoMap[columnName].editable_in_ui;
        const dataType = columnInfoMap[columnName].data_type;

        // Jos sisällä on <details>, ohitetaan
        if (fieldElem.querySelector('details')) {
            console.log(`[${table_name}] sarake: ${columnName}, sis. <details>, jätetään ennalleen.`);
            return;
        }

        // Jos editable_in_ui ei ole true, jätetään kenttä lukutilaan
        if (!isEditable) {
            console.log(`[${table_name}] sarake: ${columnName}, editable_in_ui=false => ei muokata.`);
            return;
        }

        // data-raw-value
        const rawValueAttr = fieldElem.getAttribute('data-raw-value');
        const originalText = (rawValueAttr !== null)
            ? rawValueAttr
            : fieldElem.textContent.trim();

        fieldElem.setAttribute('data-original-text', originalText);
        fieldElem.textContent = ''; // tyhjennetään

        // Päätellään syötekomponentti dataType:n perusteella
        if (dataType === 'boolean') {
            console.log(`[${table_name}] sarake: ${columnName}, data_type=boolean => <input type="checkbox">.`);
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = (originalText.toLowerCase() === 'true' || originalText === '1');
            fieldElem.appendChild(checkbox);

        } else if (dataType === 'date') {
            console.log(`[${table_name}] sarake: ${columnName}, data_type=date => <input type="date">.`);
            const dateInput = document.createElement('input');
            dateInput.type = 'date';
            dateInput.value = (originalText.match(/^\d{4}-\d{2}-\d{2}$/)) ? originalText : '';
            fieldElem.appendChild(dateInput);

        } else if (dataType === 'int' || dataType === 'integer' || dataType === 'numeric') {
            console.log(`[${table_name}] sarake: ${columnName}, data_type=numeric => <input type="number">.`);
            const numberInput = document.createElement('input');
            numberInput.type = 'number';
            numberInput.value = originalText || '';
            fieldElem.appendChild(numberInput);

        } else {
            // Teksti
            if (originalText.length > 80) {
                console.log(`[${table_name}] sarake: ${columnName}, data_type=text => <textarea>.`);
                const textarea = document.createElement('textarea');
                textarea.value = originalText;
                textarea.style.width = '100%';
                textarea.rows = 4;
                fieldElem.appendChild(textarea);
            } else {
                console.log(`[${table_name}] sarake: ${columnName}, data_type=text => <input type="text">.`);
                const input = document.createElement('input');
                input.type = 'text';
                input.value = originalText;
                input.style.width = '100%';
                fieldElem.appendChild(input);
            }
        }
    });
}

/**
 * Palauttaa kentät takaisin tavalliseen tilaan
 * ja kerää uudet arvot olioon { columnNimi: 'uusiArvo' }.
 */
function disableEditing(container) {
    const textFields = container.querySelectorAll('[data-column]');
    const updatedValues = {};

    textFields.forEach((fieldElem) => {
        // Jos on <details>, ohitetaan
        const detailsEl = fieldElem.querySelector('details');
        if (detailsEl) {
            return;
        }
        const columnName = fieldElem.getAttribute('data-column') || '';
        const originalText = fieldElem.getAttribute('data-original-text') || '';
        const inputEl = fieldElem.querySelector('input, textarea');

        if (!inputEl) {
            return;
        }

        let newValue;
        if (inputEl.type === 'checkbox') {
            newValue = inputEl.checked;
        } else {
            newValue = inputEl.value.trim();
        }

        updatedValues[columnName] = newValue;

        // Palautetaan tekstinä
        fieldElem.textContent = (typeof newValue === 'boolean')
            ? String(newValue)
            : (newValue || originalText);

        fieldElem.style.whiteSpace = 'pre-wrap';
        fieldElem.removeAttribute('data-original-text');
    });

    return updatedValues;
}

/** 
 * Pieni apufunktio sarakenimen siistimiseen 
 */
function format_column_name(column) {
    const replaced = column.replace(/_/g, ' ');
    return replaced.charAt(0).toUpperCase() + replaced.slice(1);
}