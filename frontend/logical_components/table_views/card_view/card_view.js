// card_view.js


import { createModal, showModal } from '../../../logical_components/modal/modal_factory.js';
import { endpoint_router } from '../../../main_app/endpoints/endpoint_router.js';


// REFACTOR THIS //
import { update_card_selection } from '../table_view/selection.js';


export async function create_seeded_avatar(seed_string, letter_for_avatar, useLargeSize = false) {
    // Lasketaan seed_string -> SHA-256 (hex)
    const msgUint8 = new TextEncoder().encode(seed_string);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Otetaan osa hashista numeriseen muotoon satunnaisuutta varten
    const numericHashPart_for_color = parseInt(hashHex.slice(0, 8), 16);
    const numericHashPart_for_radius = parseInt(hashHex.slice(8, 16), 16);

    // Määritetään maksimi merkkimäärä
    const max_chars = 16;
    let final_text = '?';
    if (letter_for_avatar) {
        if (letter_for_avatar.length > max_chars) {
            final_text = letter_for_avatar.slice(0, max_chars) + '...';
        } else {
            final_text = letter_for_avatar;
        }
    }
    const final_letter = final_text.toUpperCase();

    // Taustavärin laskenta HSL-muodossa
    const hue_value = numericHashPart_for_color % 360;
    const saturation_value = 30;  // Tummahko
    const lightness_value = 40;
    const chosen_color_hsl = `hsl(${hue_value}, ${saturation_value}%, ${lightness_value}%)`;

    // Border-radiaalin laskenta
    const random_radius = (numericHashPart_for_radius % 30) + 1;
    const chosen_border_radius = `${random_radius}%`;

    // Fontit
    const fonts = [
        'Arial, sans-serif',
        '"Times New Roman", Times, serif',
        'Consolas, monospace',
        'Verdana, Geneva, sans-serif',
        '"Trebuchet MS", Helvetica, sans-serif',
        'Georgia, serif',
        '"Palatino Linotype", "Book Antiqua", Palatino, serif'
    ];
    const font_index = (numericHashPart_for_color >>> 8) % fonts.length;
    const chosen_font = fonts[font_index];

    // Jos haluamme ison 300x300 tai pienen 120x120
    const containerSize = useLargeSize ? 300 : 120;
    const avatarBoxSize = useLargeSize ? 220 : 120;

    // Container
    const container_div = document.createElement('div');
    container_div.style.width = containerSize + 'px';
    container_div.style.height = containerSize + 'px';
    container_div.style.display = 'flex';
    container_div.style.alignItems = 'center';
    container_div.style.justifyContent = 'center';
    container_div.style.overflow = 'hidden';

    // Avatar-elementti
    const avatar_div = document.createElement('div');
    avatar_div.textContent = final_letter;
    avatar_div.style.display = 'flex';
    avatar_div.style.alignItems = 'center';
    avatar_div.style.justifyContent = 'center';
    avatar_div.style.width = avatarBoxSize + 'px';
    avatar_div.style.height = avatarBoxSize + 'px';
    avatar_div.style.backgroundColor = chosen_color_hsl;
    avatar_div.style.fontFamily = chosen_font;
    avatar_div.style.fontWeight = 'bold';
    avatar_div.style.fontSize = useLargeSize ? '7rem' : '4rem';
    avatar_div.style.color = '#fff';
    avatar_div.style.textShadow = '2px 2px 5px rgba(0, 0, 0, 0.5)';
    avatar_div.style.borderRadius = chosen_border_radius;

    container_div.appendChild(avatar_div);
    return container_div;
}

/**
 * Asynkroninen create_card_view: rakentaa kortit data-taulukosta.
 */
export async function create_card_view(columns, data, table_name) {
    const card_container = document.createElement('div');
    card_container.classList.add('card_container');

    // Haetaan data_types localStoragesta
    let data_types = {};
    try {
        data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
    } catch (error) {
        console.warn("could not parse data_types for table", table_name, error);
    }

    // Järjestellään sarakkeet vanhan logiikan mukaan
    const sorted_columns = [...columns];
    sorted_columns.sort((colA, colB) => {
        const a_card_element = data_types[colA]?.card_element || '';
        const b_card_element = data_types[colB]?.card_element || '';
        if (a_card_element && !b_card_element) return -1;
        if (!a_card_element && b_card_element) return 1;
        return 0;
    });

    // Katsotaan, löytyykö TAULULTA ylipäätään 'image'-roolia
    const tableHasImageRole = sorted_columns.some(col => data_types[col]?.card_element === 'image');

    // Käydään data läpi, rivi kerrallaan
    for (const row_item of data) {
        const card = document.createElement('div');
        card.classList.add('card');

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('card_checkbox');
        checkbox.addEventListener('change', () => update_card_selection(card));
        card.appendChild(checkbox);

        // Luodaan sisällön container
        const content_div = document.createElement('div');
        content_div.classList.add('card_content');

        if (tableHasImageRole) {
            content_div.classList.add('card_content_large');
        } else {
            content_div.classList.add('card_content_small');
        }

        // Kasaamme description-, details- ja keywords-dataa
        const details_entries = [];
        const description_entries = [];
        const keywords_list = [];

        // Etsimme headerin ekaa kirjainta (siemen avatarille)
        let header_first_letter = '';
        const id_part = (row_item.id !== undefined)
            ? String(row_item.id)
            : 'unknown_id';

        // Haetaan luontiaika
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
            const role = data_types[col]?.card_element || '';
            if (role === 'header') {
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

            const role = data_types[column]?.card_element || '';
            const show_key_on_card = data_types[column]?.show_key_on_card === true;
            const column_label = format_column_name(column);
            const final_text = show_key_on_card
                ? `${column_label}: ${val_str}`
                : val_str;

            // Onko description / details?
            const description_match = role.match(/^description(\d+)?$/);
            const details_match = role.match(/^details(\d+)?$/);

            if (description_match) {
                let suffix_number = Number.MAX_SAFE_INTEGER;
                if (description_match[1]) {
                    suffix_number = parseInt(description_match[1], 10);
                }
                if (val_str.trim()) {
                    description_entries.push({
                        suffix_number,
                        text: final_text
                    });
                }
                continue;
            }

            if (details_match) {
                let suffix_number = Number.MAX_SAFE_INTEGER;
                if (details_match[1]) {
                    suffix_number = parseInt(details_match[1], 10);
                }
                if (val_str.trim()) {
                    details_entries.push({
                        suffix_number,
                        text: final_text
                    });
                }
                continue;
            }

            if (role === 'keywords') {
                if (val_str.trim()) {
                    keywords_list.push({
                        column,
                        text: final_text
                    });
                }
                continue;
            }

            // Jos rooli on image
            if (role === 'image') {
                found_image_for_this_row = true;
                const elem_div = document.createElement('div');
                elem_div.classList.add('card_image');

                const useLargeSize = tableHasImageRole;
                if (val_str.trim()) {
                    let image_src = val_str.trim();
                    if (
                        !image_src.startsWith('http://') &&
                        !image_src.startsWith('https://') &&
                        !image_src.startsWith('./') &&
                        !image_src.startsWith('/')
                    ) {
                        image_src = 'media/' + image_src;
                    }
                    const img = document.createElement('img');
                    img.src = image_src;
                    img.alt = 'Kuva puuttuu';
                    img.style.width = useLargeSize ? '300px' : '140px';
                    img.style.height = useLargeSize ? '300px' : '140px';
                    img.style.objectFit = 'cover';
                    elem_div.appendChild(img);

                } else {
                    // Avatareja, jos ei URL:ia
                    const avatar = await create_seeded_avatar(creation_seed, header_first_letter, useLargeSize);
                    elem_div.appendChild(avatar);
                }
                content_div.appendChild(elem_div);
                continue;
            }

            // Muut roolit
            const elem_div = document.createElement('div');
            switch (role) {
                case 'header':
                    elem_div.classList.add('card_header');
                    elem_div.textContent = final_text;

                    // Klikkaus otsikosta avaa modaalin
                    elem_div.addEventListener('click', (e) => {
                        e.preventDefault();
                        // Kutsutaan big-card-funktiota row_itemilla
                        open_big_card_modal(row_item, table_name);
                    });
                    
                    content_div.appendChild(elem_div);
                    break;

                case 'creation_spec':
                    elem_div.classList.add('card_creation_spec');
                    elem_div.textContent = final_text;
                    content_div.appendChild(elem_div);
                    break;

                default:
                    if (val_str.trim()) {
                        elem_div.classList.add('card_details');
                        elem_div.textContent = final_text;
                        content_div.appendChild(elem_div);
                    }
                    break;
            }
        }

        // Jos taululla on image-rooli, mutta tämän rivin sarakkeista ei löytynyt imagea:
        if (tableHasImageRole && !found_image_for_this_row) {
            const image_div = document.createElement('div');
            image_div.classList.add('card_image');
            const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
            image_div.appendChild(avatar);
            content_div.appendChild(image_div);
        }

        // Jos taululla EI ole image-roolia lainkaan, mutta silti halutaan pieni avatar
        if (!tableHasImageRole) {
            const avatarDiv = document.createElement('div');
            avatarDiv.classList.add('card_image');
            const smallAvatar = await create_seeded_avatar(creation_seed, header_first_letter, false);
            avatarDiv.appendChild(smallAvatar);
            content_div.appendChild(avatarDiv);
        }

        // Lajitellaan description- ja details-entryt
        description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
        details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

        // Luo description-container
        if (description_entries.length > 0) {
            const desc_container = document.createElement('div');
            desc_container.classList.add('card_description_container');

            for (const descObj of description_entries) {
                const d = document.createElement('div');
                d.classList.add('single_description_item');

                // Leikataan halutessa 500 merkkiin
                const fullText = descObj.text;
                let displayText = fullText;
                if (fullText.length > 500) {
                    displayText = fullText.slice(0, 500) + '...';
                }

                d.textContent = displayText;
                desc_container.appendChild(d);
            }

            // Lisätään "Näytä lisää" linkki, jos jonkun descriptionin pituus > 500
            const anyLong = description_entries.some(desc => desc.text.length > 500);
            if (anyLong) {
                const show_more_link = document.createElement('a');
                show_more_link.href = '#';
                show_more_link.textContent = 'Näytä lisää';
                show_more_link.classList.add('show_more_link');

                // Klikkaus avaa saman modaalin
                show_more_link.addEventListener('click', (e) => {
                    e.preventDefault();
                    open_big_card_modal(row_item, table_name);
                });

                desc_container.appendChild(show_more_link);
            }
            content_div.appendChild(desc_container);
        }

        // Luo keywords-container
        if (keywords_list.length > 0) {
            const kw_container = document.createElement('div');
            kw_container.classList.add('card_keywords_container');
            for (const kwObj of keywords_list) {
                const k = document.createElement('div');
                k.classList.add('single_keyword_item');
                k.textContent = kwObj.text;
                kw_container.appendChild(k);
            }
            content_div.appendChild(kw_container);
        }

        // Luo details-container
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

                if (detailObj.text.length > 160) {
                    const details_element = document.createElement('details');
                    const summary_element = document.createElement('summary');
                    
                    summary_element.textContent = detailObj.text.slice(0, 160);
                    const rest_of_text = detailObj.text.slice(160);

                    details_element.appendChild(summary_element);
                    details_element.appendChild(document.createTextNode(rest_of_text));
                    detail_item.appendChild(details_element);
                } else {
                    detail_item.textContent = detailObj.text;
                }
                details_container.appendChild(detail_item);
            }
            content_div.appendChild(details_container);
        }

        // Halutessasi lisätä kortin alapäähän napin, jolla avataan modal:
        const footer_div = document.createElement('div');
        footer_div.classList.add('card_footer');

        const footer_button = document.createElement('button');
        footer_button.textContent = 'Avaa modal';
        footer_button.addEventListener('click', (e) => {
            e.preventDefault();
            // Nyt käytetään row_item-parametria
            open_big_card_modal(row_item, table_name);
        });
        footer_div.appendChild(footer_button);

        content_div.appendChild(footer_div);

        // Lisätään content_div korttiin
        card.appendChild(content_div);
        // Lisätään kortti lopulliseen containeriin
        card_container.appendChild(card);
    }

    return card_container;
}



/**
 * Lisää annettuun card_containeriin lisää itemejä (kortteja) columns- ja data-listan perusteella.
 * HUOM: Tämä funktio on tässä yhä synkroninen, koska ei kutsu create_seeded_avataria.
 */
/**
 * Lisää annettuun card_containeriin lisää itemejä (kortteja) columns- ja data-listan perusteella.
 * HUOM: Tämä funktio on tässä yhä synkroninen, koska ei kutsu create_seeded_avataria.
 */
export function appendDataToCardView(card_container, columns, data, table_name) {
    let data_types = {};
    try {
        data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
    } catch (error) {
        console.warn("could not parse data_types for table", table_name, error);
    }

    data.forEach(item => {
        const card = document.createElement('div');
        card.classList.add('card');

        // Asetetaan cardiin data-id attribuutti
        if (item.id !== undefined && item.id !== null) {
            card.setAttribute('data-id', item.id);
            console.log(`Lisätty kortti, data-id: ${item.id}`);
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

            const show_key_on_card = data_types[column]?.show_key_on_card === true;
            const formatted_label = format_column_name(column);

            if (show_key_on_card) {
                labelDiv.textContent = `${formatted_label}:`;
            } else {
                labelDiv.textContent = '';
            }

            const valueDiv = document.createElement('div');
            valueDiv.classList.add('card_value');

            if (Array.isArray(item[column])) {
                valueDiv.textContent = item[column].join(', ');
            } else if (typeof item[column] === 'object' && item[column] !== null) {
                valueDiv.textContent = JSON.stringify(item[column]);
            } else {
                valueDiv.textContent = item[column] || '';
            }

            pairDiv.appendChild(labelDiv);
            pairDiv.appendChild(valueDiv);
            contentDiv.appendChild(pairDiv);
        });

        card.appendChild(contentDiv);
        card_container.appendChild(card);
    });
}

export async function open_big_card_modal(row_item, table_name) {
    try {
        const big_card_div = document.createElement('div');
        big_card_div.classList.add('big_card_container');

        // Haetaan data_types localStoragesta
        let data_types = {};
        try {
            data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
        } catch (error) {
            console.warn("could not parse data_types for table", table_name, error);
        }

        // Sarakkeet
        const columns = Object.keys(row_item);
        const sorted_columns = [...columns];
        sorted_columns.sort((colA, colB) => {
            const a_card_element = data_types[colA]?.card_element || '';
            const b_card_element = data_types[colB]?.card_element || '';
            if (a_card_element && !b_card_element) return -1;
            if (!a_card_element && b_card_element) return 1;
            return 0;
        });

        const content_div = document.createElement('div');
        content_div.classList.add('big_card_content');

        // Etsitään header-kirjain avatarille
        let header_first_letter = '';
        for (const col of sorted_columns) {
            const role = data_types[col]?.card_element || '';
            if (role === 'header') {
                const val_str = row_item[col] ? String(row_item[col]) : '';
                if (val_str.trim()) {
                    header_first_letter = val_str.trim()[0];
                }
            }
        }

        const created_part = row_item.created
            || row_item.created_at
            || row_item.luontiaika
            || null;
        const id_part = (row_item.id !== undefined) ? String(row_item.id) : 'unknown_id';
        const creation_seed = created_part ? `${id_part}_${created_part}` : id_part;

        const table_has_image_role = sorted_columns.some(col => data_types[col]?.card_element === 'image');

        const description_entries = [];
        const details_entries = [];
        const keywords_list = [];
        let found_image_for_this_row = false;

        for (const column of sorted_columns) {
            const raw_val = row_item[column];
            let val_str = '';
            if (raw_val !== null && raw_val !== undefined) {
                val_str = (typeof raw_val === 'string') ? raw_val : String(raw_val);
            }
            const role = data_types[column]?.card_element || '';
            const show_key_on_card = data_types[column]?.show_key_on_card === true;
            const column_label = format_column_name(column);
            const final_text = show_key_on_card
                ? `${column_label}: ${val_str}`
                : val_str;

            const description_match = role.match(/^description(\d+)?$/);
            const details_match = role.match(/^details(\d+)?$/);

            if (description_match) {
                let suffix_number = Number.MAX_SAFE_INTEGER;
                if (description_match[1]) {
                    suffix_number = parseInt(description_match[1], 10);
                }
                if (val_str.trim()) {
                    description_entries.push({ suffix_number, text: final_text });
                }
                continue;
            }
            if (details_match) {
                let suffix_number = Number.MAX_SAFE_INTEGER;
                if (details_match[1]) {
                    suffix_number = parseInt(details_match[1], 10);
                }
                if (val_str.trim()) {
                    details_entries.push({ suffix_number, text: final_text });
                }
                continue;
            }
            if (role === 'keywords') {
                if (val_str.trim()) {
                    keywords_list.push({ column, text: final_text });
                }
                continue;
            }
            if (role === 'image') {
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
                        img_src = 'media/' + img_src;
                    }
                    const img = document.createElement('img');
                    img.src = img_src;
                    img.alt = 'Kuva puuttuu';
                    img.style.width = '300px';
                    img.style.height = '300px';
                    img.style.objectFit = 'cover';
                    image_div.appendChild(img);
                } else {
                    // Jos ei URL:ia, luodaan iso avatar
                    const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
                    image_div.appendChild(avatar);
                }
                content_div.appendChild(image_div);
                continue;
            }

            // Muut roolit
            if (role === 'header') {
                const header_el = document.createElement('div');
                header_el.classList.add('big_card_header');
                header_el.textContent = final_text;
                content_div.appendChild(header_el);
            } else if (role === 'creation_spec') {
                const creation_div = document.createElement('div');
                creation_div.classList.add('big_card_creation_spec');
                creation_div.textContent = final_text;
                content_div.appendChild(creation_div);
            } else {
                if (val_str.trim()) {
                    const detail_div = document.createElement('div');
                    detail_div.classList.add('big_card_generic_field');
                    detail_div.textContent = final_text;
                    content_div.appendChild(detail_div);
                }
            }
        }

        if (table_has_image_role && !found_image_for_this_row) {
            const image_div = document.createElement('div');
            image_div.classList.add('big_card_image');
            const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
            image_div.appendChild(avatar);
            content_div.appendChild(image_div);
        }
        if (!table_has_image_role) {
            const avatar_div = document.createElement('div');
            avatar_div.classList.add('big_card_image');
            const big_avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
            avatar_div.appendChild(big_avatar);
            content_div.appendChild(avatar_div);
        }

        // Lajitellaan description- ja details-listat
        description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
        details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

        if (description_entries.length > 0) {
            const desc_container = document.createElement('div');
            desc_container.classList.add('big_card_description_container');
            for (const descObj of description_entries) {
                const d = document.createElement('div');
                d.classList.add('single_big_description');
                d.textContent = descObj.text;
                desc_container.appendChild(d);
            }
            content_div.appendChild(desc_container);
        }
        if (keywords_list.length > 0) {
            const kw_container = document.createElement('div');
            kw_container.classList.add('big_card_keywords_container');
            for (const kwObj of keywords_list) {
                const k = document.createElement('div');
                k.classList.add('big_card_keyword_item');
                k.textContent = kwObj.text;
                kw_container.appendChild(k);
            }
            content_div.appendChild(kw_container);
        }
        if (details_entries.length > 0) {
            const details_container = document.createElement('div');
            details_container.classList.add('big_card_details_container');
            details_container.style.display = 'grid';
            details_container.style.gridTemplateColumns = '1fr 1fr';
            details_container.style.gap = '0.5rem';

            for (const detailObj of details_entries) {
                const detail_item = document.createElement('div');
                detail_item.classList.add('big_card_detail_item');

                if (detailObj.text.length > 300) {
                    const details_el = document.createElement('details');
                    const summary_el = document.createElement('summary');
                    summary_el.textContent = detailObj.text.slice(0, 300) + '...';
                    details_el.appendChild(summary_el);
                    details_el.appendChild(document.createTextNode(detailObj.text.slice(300)));
                    detail_item.appendChild(details_el);
                } else {
                    detail_item.textContent = detailObj.text;
                }
                details_container.appendChild(detail_item);
            }
            content_div.appendChild(details_container);
        }

        // Täällä tehdään varsinainen dynaaminen lapsihaku
        if (row_item.id) {
            try {
                const dynamic_child_data = await endpoint_router('fetchDynamicChildren', {
                    method: 'POST',
                    body_data: {
                        parent_table: table_name,
                        parent_pk_value: String(row_item.id) // jos haluat varmistaa stringin
                    },
                });
                console.log('dynaamiset lapsitiedot:', dynamic_child_data);

                if (dynamic_child_data && dynamic_child_data.child_tables) {
                    for (const child_obj of dynamic_child_data.child_tables) {
                        // child_obj.table, child_obj.column, child_obj.rows
                        const child_table_name = child_obj.table;
                        const child_column_name = child_obj.column;
                        const child_rows = child_obj.rows || [];

                        const child_container_div = document.createElement('div');
                        child_container_div.classList.add('big_card_child_container');

                        // Otsikko, esim "riskikartoitukset - lahettajan_id"
                        const child_header = document.createElement('h3');
                        child_header.textContent = `${child_table_name} - ${child_column_name}`;
                        child_container_div.appendChild(child_header);

                        // Linkki, joka suodattaa /tables/child_table_name?child_column_name=row_item.id
                        const link_elem = document.createElement('a');
                        link_elem.href = `/tables/${child_table_name}?${child_column_name}=${row_item.id}`;
                        link_elem.textContent = `Avaa /tables/${child_table_name}?${child_column_name}=${row_item.id}`;
                        link_elem.target = '_blank'; // avaa uuteen välilehteen
                        child_container_div.appendChild(link_elem);

                        // Listataan rivit
                        child_rows.forEach(single_child_row => {
                            const row_div = document.createElement('div');
                            row_div.classList.add('child_item');
                            row_div.textContent = JSON.stringify(single_child_row);
                            child_container_div.appendChild(row_div);
                        });

                        content_div.appendChild(child_container_div);
                    }
                }
            } catch (err) {
                console.error('virhe dynaamisessa lapsihaussa:', err);
            }
        }

        // Lisätään content_div big_card_div:iin
        big_card_div.appendChild(content_div);

        // Luodaan modal isoa korttia varten, mutta emme käytä tarkkaan sen paluuarvoja
        createModal({
            titleDataLangKey: 'card_details_big',
            tableName: table_name,
            contentElements: [big_card_div],
            width: '70vw'
        });

        // Näytetään modal
        showModal();

    } catch (err) {
        console.error('virhe ison kortin luonnissa (JS):', err);
    }
}


function format_column_name(column) {
    const replaced = column.replace(/_/g, ' ');
    return replaced.charAt(0).toUpperCase() + replaced.slice(1);
}

// // export async function open_big_card_modal(row_item, table_name) {
// //     try {
// //         // Luodaan kortin perusrakenne
// //         const big_card_div = document.createElement('div');
// //         big_card_div.classList.add('big_card_container'); 

// //         // Haetaan data_types localStoragesta
// //         let data_types = {};
// //         try {
// //             data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
// //         } catch (e) {
// //             console.warn("could not parse data_types for table", table_name);
// //         }

// //         // Sortataan sarakkeet
// //         const columns = Object.keys(row_item);
// //         const sorted_columns = [...columns];
// //         sorted_columns.sort((colA, colB) => {
// //             const a_card_element = data_types[colA]?.card_element || '';
// //             const b_card_element = data_types[colB]?.card_element || '';
// //             if (a_card_element && !b_card_element) return -1;
// //             if (!a_card_element && b_card_element) return 1;
// //             return 0;
// //         });

// //         // Luo rungon grid-asettelulle
// //         const content_div = document.createElement('div');
// //         content_div.classList.add('big_card_content');

// //         // Selvitetään siemenen parametrit (avatar-tarpeisiin)
// //         let header_first_letter = '';
// //         for (const col of sorted_columns) {
// //             const role = data_types[col]?.card_element || '';
// //             if (role === 'header') {
// //                 const val_str = row_item[col] ? String(row_item[col]) : '';
// //                 if (val_str.trim()) {
// //                     header_first_letter = val_str.trim()[0];
// //                 }
// //             }
// //         }

// //         const created_part = row_item.created
// //             || row_item.created_at
// //             || row_item.luontiaika
// //             || null;
// //         const id_part = (row_item.id !== undefined) ? String(row_item.id) : 'unknown_id';
// //         const creation_seed = created_part
// //             ? `${id_part}_${created_part}`
// //             : id_part;

// //         // Tunnistetaan onko taululla jokin 'image'-rooli
// //         const table_has_image_role = sorted_columns.some(col => data_types[col]?.card_element === 'image');

// //         // Kootaan description-, details-, keywords-listat
// //         const description_entries = [];
// //         const details_entries = [];
// //         const keywords_list = [];
// //         let found_image_for_this_row = false;

// //         // Käydään sarakkeet läpi ja täytetään iso kortti
// //         for (const column of sorted_columns) {
// //             const raw_val = row_item[column];
// //             let val_str = '';
// //             if (raw_val !== null && raw_val !== undefined) {
// //                 val_str = (typeof raw_val === 'string') ? raw_val : String(raw_val);
// //             }
// //             const role = data_types[column]?.card_element || '';
// //             const show_key_on_card = data_types[column]?.show_key_on_card === true;
// //             const column_label = format_column_name(column);
// //             const final_text = show_key_on_card
// //                 ? `${column_label}: ${val_str}`
// //                 : val_str;

// //             // Onko description tai details?
// //             const description_match = role.match(/^description(\d+)?$/);
// //             const details_match = role.match(/^details(\d+)?$/);

// //             if (description_match) {
// //                 let suffix_number = Number.MAX_SAFE_INTEGER;
// //                 if (description_match[1]) {
// //                     suffix_number = parseInt(description_match[1], 10);
// //                 }
// //                 if (val_str.trim()) {
// //                     description_entries.push({ suffix_number, text: final_text });
// //                 }
// //                 continue;
// //             }

// //             if (details_match) {
// //                 let suffix_number = Number.MAX_SAFE_INTEGER;
// //                 if (details_match[1]) {
// //                     suffix_number = parseInt(details_match[1], 10);
// //                 }
// //                 if (val_str.trim()) {
// //                     details_entries.push({ suffix_number, text: final_text });
// //                 }
// //                 continue;
// //             }

// //             if (role === 'keywords') {
// //                 if (val_str.trim()) {
// //                     keywords_list.push({ column, text: final_text });
// //                 }
// //                 continue;
// //             }

// //             if (role === 'image') {
// //                 found_image_for_this_row = true;
// //                 const image_div = document.createElement('div');
// //                 image_div.classList.add('big_card_image');
// //                 if (val_str.trim()) {
// //                     let img_src = val_str.trim();
// //                     if (
// //                         !img_src.startsWith('http://') &&
// //                         !img_src.startsWith('https://') &&
// //                         !img_src.startsWith('./') &&
// //                         !img_src.startsWith('/')
// //                     ) {
// //                         img_src = 'media/' + img_src;
// //                     }
// //                     const img = document.createElement('img');
// //                     img.src = img_src;
// //                     img.alt = 'Kuva puuttuu';
// //                     img.style.width = '300px';
// //                     img.style.height = '300px';
// //                     img.style.objectFit = 'cover';
// //                     image_div.appendChild(img);
// //                 } else {
// //                     // Jos ei URL:ia, luodaan iso avatar
// //                     const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
// //                     image_div.appendChild(avatar);
// //                 }
// //                 content_div.appendChild(image_div);
// //                 continue;
// //             }

// //             // Jos rooli on header/creation_spec/muuta
// //             if (role === 'header') {
// //                 const header_el = document.createElement('div');
// //                 header_el.classList.add('big_card_header');
// //                 header_el.textContent = final_text;
// //                 content_div.appendChild(header_el);
// //             } else if (role === 'creation_spec') {
// //                 const creation_div = document.createElement('div');
// //                 creation_div.classList.add('big_card_creation_spec');
// //                 creation_div.textContent = final_text;
// //                 content_div.appendChild(creation_div);
// //             } else {
// //                 if (val_str.trim()) {
// //                     const detail_div = document.createElement('div');
// //                     detail_div.classList.add('big_card_generic_field');
// //                     detail_div.textContent = final_text;
// //                     content_div.appendChild(detail_div);
// //                 }
// //             }
// //         }

// //         // Jos taululla on image-rooli, mutta tältä riviltä ei löytynyt
// //         if (table_has_image_role && !found_image_for_this_row) {
// //             const image_div = document.createElement('div');
// //             image_div.classList.add('big_card_image');
// //             const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
// //             image_div.appendChild(avatar);
// //             content_div.appendChild(image_div);
// //         }

// //         // Jos taululla EI ole image-roolia, mutta halutaan iso avatar
// //         if (!table_has_image_role) {
// //             const avatarDiv = document.createElement('div');
// //             avatarDiv.classList.add('big_card_image');
// //             const bigAvatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
// //             avatarDiv.appendChild(bigAvatar);
// //             content_div.appendChild(avatarDiv);
// //         }

// //         // Sortataan description- ja details-entryt
// //         description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
// //         details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

// //         // Näytetään description (täysmittaisena)
// //         if (description_entries.length > 0) {
// //             const desc_container = document.createElement('div');
// //             desc_container.classList.add('big_card_description_container');
// //             for (const descObj of description_entries) {
// //                 const d = document.createElement('div');
// //                 d.classList.add('single_big_description');
// //                 d.textContent = descObj.text;
// //                 desc_container.appendChild(d);
// //             }
// //             content_div.appendChild(desc_container);
// //         }

// //         // Näytetään keywords
// //         if (keywords_list.length > 0) {
// //             const kw_container = document.createElement('div');
// //             kw_container.classList.add('big_card_keywords_container');
// //             for (const kwObj of keywords_list) {
// //                 const k = document.createElement('div');
// //                 k.classList.add('big_card_keyword_item');
// //                 k.textContent = kwObj.text;
// //                 kw_container.appendChild(k);
// //             }
// //             content_div.appendChild(kw_container);
// //         }

// //         // Näytetään details
// //         if (details_entries.length > 0) {
// //             const details_container = document.createElement('div');
// //             details_container.classList.add('big_card_details_container');
// //             details_container.style.display = 'grid';
// //             details_container.style.gridTemplateColumns = '1fr 1fr';
// //             details_container.style.gap = '0.5rem';

// //             for (const detailObj of details_entries) {
// //                 const detail_item = document.createElement('div');
// //                 detail_item.classList.add('big_card_detail_item');

// //                 if (detailObj.text.length > 300) {
// //                     const details_el = document.createElement('details');
// //                     const summary_el = document.createElement('summary');
// //                     summary_el.textContent = detailObj.text.slice(0, 300) + '...';
// //                     details_el.appendChild(summary_el);
// //                     details_el.appendChild(document.createTextNode(detailObj.text.slice(300)));
// //                     detail_item.appendChild(details_el);
// //                 } else {
// //                     detail_item.textContent = detailObj.text;
// //                 }
// //                 details_container.appendChild(detail_item);
// //             }
// //             content_div.appendChild(details_container);
// //         }

// //         /**
// //          * Tässä on dynaaminen lapsihaku:
// //          * Käytämme 'fetchDynamicChildren', joka hakee
// //          * kaikki referencing_table -> referencing_column
// //          * -viittaukset, ja noutaa lapsirivit parent_id:llä.
// //          */
// //         if (row_item.id) {
// //             try {
// //                 const dynamic_child_data = await endpoint_router('fetchDynamicChildren', {
// //                     method: 'POST',
// // 					body_data: {
// // 						parent_table: table_name,
// // 						// Tämä muunto varmistaa, että JSON:issa arvo on merkkijono ("123"), eikä numero (123)
// // 						parent_pk_value: String(row_item.id) 
// // 					},
// //                 });
// //                 console.log('dynaamiset lapsitiedot:', dynamic_child_data);

// //                 if (dynamic_child_data && dynamic_child_data.child_tables) {
// //                     for (const childObj of dynamic_child_data.child_tables) {
// //                         const child_table_name = childObj.table;
// //                         const child_rows = childObj.rows;

// //                         if (child_rows && child_rows.length > 0) {
// //                             const child_table_div = document.createElement('div');
// //                             child_table_div.classList.add('big_card_child_container');

// //                             // Otsikko lapsitaulun nimellä
// //                             const header = document.createElement('h3');
// //                             header.textContent = `Lapsitaulu: ${child_table_name}`;
// //                             child_table_div.appendChild(header);

// //                             // Listataan jokainen lapsirivi
// //                             child_rows.forEach((child_row) => {
// //                                 const row_div = document.createElement('div');
// //                                 row_div.classList.add('child_item');
// //                                 // Voit muotoilla haluamallasi tavalla
// //                                 row_div.textContent = JSON.stringify(child_row);
// //                                 child_table_div.appendChild(row_div);
// //                             });
// //                             content_div.appendChild(child_table_div);
// //                         }
// //                     }
// //                 }
// //             } catch (err) {
// //                 console.error('virhe dynaamisessa lapsihaussa:', err);
// //             }
// //         }

// //         // Yhdistetään content_div lopulliseen big_card_div:iin
// //         big_card_div.appendChild(content_div);

// //         // Luodaan modal isoa korttia varten
// //         const { modal_overlay, modal } = createModal({
// //             titleDataLangKey: 'card_details_big',
// //             tableName: table_name,
// //             contentElements: [big_card_div],
// //             width: '70vw'
// //         });

// //         // Näytetään modal
// //         showModal();

// //     } catch (err) {
// //         // JavaScriptin oma virheenkäsittely
// //         console.error('virhe ison kortin luonnissa (JS):', err);
// //     }
// // }

// // // Apufunktio sarakenimen muuntamiseen (jos ei jo koodissa)
// // function format_column_name(column) {
// //     const replaced = column.replace(/_/g, ' ');
// //     return replaced.charAt(0).toUpperCase() + replaced.slice(1);
// // }


// // card_view.js

// import { update_card_selection } from '../selection.js';
// import { createModal, showModal, hideModal } from '../../../../logical_components/modal/modal_factory.js';
// import { endpoint_router } from '../../../../endpoint_router.js';

// export async function create_seeded_avatar(seed_string, letter_for_avatar, useLargeSize = false) {
//     // Lasketaan seed_string -> SHA-256 (hex)
//     const msgUint8 = new TextEncoder().encode(seed_string);
//     const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
//     const hashArray = Array.from(new Uint8Array(hashBuffer));
//     const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

//     // Otetaan osa hashista numeriseen muotoon satunnaisuutta varten
//     const numericHashPart_for_color = parseInt(hashHex.slice(0, 8), 16);
//     const numericHashPart_for_radius = parseInt(hashHex.slice(8, 16), 16);

//     // Määritetään maksimi merkkimäärä
//     const max_chars = 16;
//     let final_text = '?';
//     if (letter_for_avatar) {
//         if (letter_for_avatar.length > max_chars) {
//             final_text = letter_for_avatar.slice(0, max_chars) + '...';
//         } else {
//             final_text = letter_for_avatar;
//         }
//     }
//     const final_letter = final_text.toUpperCase();

//     // Taustavärin laskenta HSL-muodossa
//     const hue_value = numericHashPart_for_color % 360;
//     const saturation_value = 30;  // Tummahko
//     const lightness_value = 40;
//     const chosen_color_hsl = `hsl(${hue_value}, ${saturation_value}%, ${lightness_value}%)`;

//     // Border-radiaalin laskenta
//     const random_radius = (numericHashPart_for_radius % 30) + 1;
//     const chosen_border_radius = `${random_radius}%`;

//     // Fontit
//     const fonts = [
//         'Arial, sans-serif',
//         '"Times New Roman", Times, serif',
//         'Consolas, monospace',
//         'Verdana, Geneva, sans-serif',
//         '"Trebuchet MS", Helvetica, sans-serif',
//         'Georgia, serif',
//         '"Palatino Linotype", "Book Antiqua", Palatino, serif'
//     ];
//     const font_index = (numericHashPart_for_color >>> 8) % fonts.length;
//     const chosen_font = fonts[font_index];

//     // Jos haluamme ison 300x300 tai pienen 120x120
//     const containerSize = useLargeSize ? 300 : 120;
//     const avatarBoxSize = useLargeSize ? 220 : 120;

//     // Container
//     const container_div = document.createElement('div');
//     container_div.style.width = containerSize + 'px';
//     container_div.style.height = containerSize + 'px';
//     container_div.style.display = 'flex';
//     container_div.style.alignItems = 'center';
//     container_div.style.justifyContent = 'center';
//     container_div.style.overflow = 'hidden';

//     // Avatar-elementti
//     const avatar_div = document.createElement('div');
//     avatar_div.textContent = final_letter;
//     avatar_div.style.display = 'flex';
//     avatar_div.style.alignItems = 'center';
//     avatar_div.style.justifyContent = 'center';
//     avatar_div.style.width = avatarBoxSize + 'px';
//     avatar_div.style.height = avatarBoxSize + 'px';
//     avatar_div.style.backgroundColor = chosen_color_hsl;
//     avatar_div.style.fontFamily = chosen_font;
//     avatar_div.style.fontWeight = 'bold';
//     avatar_div.style.fontSize = useLargeSize ? '7rem' : '4rem';
//     avatar_div.style.color = '#fff';
//     avatar_div.style.textShadow = '2px 2px 5px rgba(0, 0, 0, 0.5)';
//     avatar_div.style.borderRadius = chosen_border_radius;

//     container_div.appendChild(avatar_div);
//     return container_div;
// }

// // Apufunktio sarakenimen muuntamiseen
// function format_column_name(column) {
//     // Korvataan alaviivat välilyönneillä
//     const replaced = column.replace(/_/g, ' ');
//     // Ensimmäinen kirjain isoksi
//     return replaced.charAt(0).toUpperCase() + replaced.slice(1);
// }

// /**
//  * Asynkroninen create_card_view: rakentaa kortit data-taulukosta.
//  */
// export async function create_card_view(columns, data, table_name) {
//     const card_container = document.createElement('div');
//     card_container.classList.add('card_container');

//     // Haetaan data_types localStoragesta
//     let data_types = {};
//     try {
//         data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
//     } catch (e) {
//         console.warn("could not parse data_types for table", table_name);
//     }

//     // Järjestellään sarakkeet vanhan logiikan mukaan
//     const sorted_columns = [...columns];
//     sorted_columns.sort((colA, colB) => {
//         const a_card_element = data_types[colA]?.card_element || '';
//         const b_card_element = data_types[colB]?.card_element || '';
//         if (a_card_element && !b_card_element) return -1;
//         if (!a_card_element && b_card_element) return 1;
//         return 0;
//     });

//     // Katsotaan, löytyykö TAULULTA ylipäätään 'image'-roolia
//     const tableHasImageRole = sorted_columns.some(col => data_types[col]?.card_element === 'image');

//     // Käydään data läpi, rivi kerrallaan
//     for (const row_item of data) {
//         const card = document.createElement('div');
//         card.classList.add('card');

//         // Checkbox
//         const checkbox = document.createElement('input');
//         checkbox.type = 'checkbox';
//         checkbox.classList.add('card_checkbox');
//         checkbox.addEventListener('change', () => update_card_selection(card));
//         card.appendChild(checkbox);

//         // Luodaan sisällön container
//         const content_div = document.createElement('div');
//         content_div.classList.add('card_content');

//         if (tableHasImageRole) {
//             content_div.classList.add('card_content_large');
//         } else {
//             content_div.classList.add('card_content_small');
//         }

//         // Kasaamme description-, details- ja keywords-dataa
//         const details_entries = [];
//         const description_entries = [];
//         const keywords_list = [];

//         // Etsimme headerin ekaa kirjainta (siemen avatarille)
//         let header_first_letter = '';
//         const id_part = (row_item.id !== undefined)
//             ? String(row_item.id)
//             : 'unknown_id';

//         // Haetaan luontiaika
//         const created_part = row_item.created
//             || row_item.created_at
//             || row_item.luontiaika
//             || null;

//         let creation_seed;
//         if (created_part) {
//             creation_seed = `${id_part}_${created_part}`;
//         } else {
//             creation_seed = id_part;
//         }

//         // Poimitaan mahdollinen ensimmäinen header-kirjain
//         for (const col of sorted_columns) {
//             const role = data_types[col]?.card_element || '';
//             if (role === 'header') {
//                 const raw_val = row_item[col];
//                 const val_str = (typeof raw_val === 'string') ? raw_val : String(raw_val ?? '');
//                 const trimmed = val_str.trim();
//                 if (trimmed) {
//                     header_first_letter = trimmed[0];
//                 }
//             }
//         }

//         let found_image_for_this_row = false;

//         // Käydään sarakkeet läpi
//         for (const column of sorted_columns) {
//             const raw_val = row_item[column];
//             let val_str = '';
//             if (raw_val !== null && raw_val !== undefined) {
//                 val_str = (typeof raw_val === 'string') ? raw_val : String(raw_val);
//             }

//             const role = data_types[column]?.card_element || '';
//             const show_key_on_card = data_types[column]?.show_key_on_card === true;
//             const column_label = format_column_name(column);
//             const final_text = show_key_on_card
//                 ? `${column_label}: ${val_str}`
//                 : val_str;

//             // Onko description / details?
//             const description_match = role.match(/^description(\d+)?$/);
//             const details_match = role.match(/^details(\d+)?$/);

//             if (description_match) {
//                 let suffix_number = Number.MAX_SAFE_INTEGER;
//                 if (description_match[1]) {
//                     suffix_number = parseInt(description_match[1], 10);
//                 }
//                 if (val_str.trim()) {
//                     description_entries.push({
//                         suffix_number,
//                         text: final_text
//                     });
//                 }
//                 continue;
//             }

//             if (details_match) {
//                 let suffix_number = Number.MAX_SAFE_INTEGER;
//                 if (details_match[1]) {
//                     suffix_number = parseInt(details_match[1], 10);
//                 }
//                 if (val_str.trim()) {
//                     details_entries.push({
//                         suffix_number,
//                         text: final_text
//                     });
//                 }
//                 continue;
//             }

//             if (role === 'keywords') {
//                 if (val_str.trim()) {
//                     keywords_list.push({
//                         column,
//                         text: final_text
//                     });
//                 }
//                 continue;
//             }

//             // Jos rooli on image
//             if (role === 'image') {
//                 found_image_for_this_row = true;
//                 const elem_div = document.createElement('div');
//                 elem_div.classList.add('card_image');

//                 const useLargeSize = tableHasImageRole;
//                 if (val_str.trim()) {
//                     let image_src = val_str.trim();
//                     if (
//                         !image_src.startsWith('http://') &&
//                         !image_src.startsWith('https://') &&
//                         !image_src.startsWith('./') &&
//                         !image_src.startsWith('/')
//                     ) {
//                         image_src = 'media/' + image_src;
//                     }
//                     const img = document.createElement('img');
//                     img.src = image_src;
//                     img.alt = 'Kuva puuttuu';
//                     img.style.width = useLargeSize ? '300px' : '140px';
//                     img.style.height = useLargeSize ? '300px' : '140px';
//                     img.style.objectFit = 'cover';
//                     elem_div.appendChild(img);

//                 } else {
//                     // Avatareja, jos ei URL:ia
//                     const avatar = await create_seeded_avatar(creation_seed, header_first_letter, useLargeSize);
//                     elem_div.appendChild(avatar);
//                 }
//                 content_div.appendChild(elem_div);
//                 continue;
//             }

//             // Muut roolit
//             const elem_div = document.createElement('div');
//             switch (role) {
//                 case 'header':
//                     elem_div.classList.add('card_header');
//                     elem_div.textContent = final_text;

//                     // Klikkaus otsikosta avaa modaalin
//                     elem_div.addEventListener('click', (e) => {
//                         e.preventDefault();
//                         // Tässä korjattu parametri:
//                         open_big_card_modal(row_item, table_name);
//                     });
                    
//                     content_div.appendChild(elem_div);
//                     break;

//                 case 'creation_spec':
//                     elem_div.classList.add('card_creation_spec');
//                     elem_div.textContent = final_text;
//                     content_div.appendChild(elem_div);
//                     break;

//                 default:
//                     if (val_str.trim()) {
//                         elem_div.classList.add('card_details');
//                         elem_div.textContent = final_text;
//                         content_div.appendChild(elem_div);
//                     }
//                     break;
//             }
//         }

//         // Jos taululla on image-rooli, mutta tämän rivin sarakkeista ei löytynyt imagea:
//         if (tableHasImageRole && !found_image_for_this_row) {
//             const image_div = document.createElement('div');
//             image_div.classList.add('card_image');
//             const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
//             image_div.appendChild(avatar);
//             content_div.appendChild(image_div);
//         }

//         // Jos taululla EI ole image-roolia lainkaan, mutta silti halutaan pieni avatar
//         if (!tableHasImageRole) {
//             const avatarDiv = document.createElement('div');
//             avatarDiv.classList.add('card_image');
//             const smallAvatar = await create_seeded_avatar(creation_seed, header_first_letter, false);
//             avatarDiv.appendChild(smallAvatar);
//             content_div.appendChild(avatarDiv);
//         }

//         // Lajitellaan description- ja details-entryt
//         description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
//         details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

//         // Luo description-container
//         if (description_entries.length > 0) {
//             const desc_container = document.createElement('div');
//             desc_container.classList.add('card_description_container');

//             for (const descObj of description_entries) {
//                 const d = document.createElement('div');
//                 d.classList.add('single_description_item');

//                 // Leikataan halutessa 500 merkkiin
//                 const fullText = descObj.text;
//                 let displayText = fullText;
//                 if (fullText.length > 500) {
//                     displayText = fullText.slice(0, 500) + '...';
//                 }

//                 d.textContent = displayText;
//                 desc_container.appendChild(d);
//             }

//             // Lisätään "Näytä lisää" linkki, jos jonkun descriptionin pituus > 500
//             const anyLong = description_entries.some(desc => desc.text.length > 500);
//             if (anyLong) {
//                 const show_more_link = document.createElement('a');
//                 show_more_link.href = '#';
//                 show_more_link.textContent = 'Näytä lisää';
//                 show_more_link.classList.add('show_more_link');

//                 // Klikkaus avaa saman modaalin
//                 show_more_link.addEventListener('click', (e) => {
//                     e.preventDefault();
//                     open_big_card_modal(row_item, table_name);
//                 });

//                 desc_container.appendChild(show_more_link);
//             }
//             content_div.appendChild(desc_container);
//         }

//         // Luo keywords-container
//         if (keywords_list.length > 0) {
//             const kw_container = document.createElement('div');
//             kw_container.classList.add('card_keywords_container');
//             for (const kwObj of keywords_list) {
//                 const k = document.createElement('div');
//                 k.classList.add('single_keyword_item');
//                 k.textContent = kwObj.text;
//                 kw_container.appendChild(k);
//             }
//             content_div.appendChild(kw_container);
//         }

//         // Luo details-container
//         if (details_entries.length > 0) {
//             const details_container = document.createElement('div');
//             details_container.classList.add('card_details_container');

//             const detail_count = details_entries.length;
//             const row_count = Math.ceil(detail_count / 2);
//             details_container.style.display = 'grid';
//             details_container.style.gridAutoFlow = 'column';
//             details_container.style.gridTemplateColumns = '1fr 1fr';
//             details_container.style.gridTemplateRows = `repeat(${row_count}, auto)`;
//             details_container.style.gap = '0.5rem';

//             for (const detailObj of details_entries) {
//                 const detail_item = document.createElement('div');
//                 detail_item.classList.add('single_detail_item');

//                 if (detailObj.text.length > 160) {
//                     const details_element = document.createElement('details');
//                     const summary_element = document.createElement('summary');
                    
//                     summary_element.textContent = detailObj.text.slice(0, 160);
//                     const rest_of_text = detailObj.text.slice(160);

//                     details_element.appendChild(summary_element);
//                     details_element.appendChild(document.createTextNode(rest_of_text));
//                     detail_item.appendChild(details_element);
//                 } else {
//                     detail_item.textContent = detailObj.text;
//                 }
//                 details_container.appendChild(detail_item);
//             }
//             content_div.appendChild(details_container);
//         }

//         // Halutessasi lisätä kortin alapäähän napin, jolla avataan modal:
//         const footer_div = document.createElement('div');
//         footer_div.classList.add('card_footer');

//         const footer_button = document.createElement('button');
//         footer_button.textContent = 'Avaa modal';
//         footer_button.addEventListener('click', (e) => {
//             e.preventDefault();
//             // Tässäkin korjattu parametri:
//             open_big_card_modal(row_item, table_name);
//         });
//         footer_div.appendChild(footer_button);

//         content_div.appendChild(footer_div);

//         // Lisätään content_div korttiin
//         card.appendChild(content_div);
//         // Lisätään kortti lopulliseen containeriin
//         card_container.appendChild(card);
//     }

//     return card_container;
// }


// /**
//  * Lisää annettuun card_containeriin lisää itemejä (kortteja) columns- ja data-listan perusteella.
//  * HUOM: Tämä funktio on tässä yhä synkroninen, koska ei kutsu create_seeded_avataria.
//  */
// export function appendDataToCardView(card_container, columns, data, table_name) {
//     let data_types = {};
//     try {
//         data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
//     } catch (e) {
//         console.warn("could not parse data_types for table", table_name);
//     }

//     data.forEach(item => {
//         const card = document.createElement('div');
//         card.classList.add('card');

//         // Asetetaan cardiin data-id attribuutti
//         if (item.id !== undefined && item.id !== null) {
//             card.setAttribute('data-id', item.id);
//             console.log(`Lisätty kortti, data-id: ${item.id}`);
//         }

//         // Valintaruutu
//         const checkbox = document.createElement('input');
//         checkbox.type = 'checkbox';
//         checkbox.classList.add('card_checkbox');
//         checkbox.addEventListener('change', () => update_card_selection(card));
//         card.appendChild(checkbox);

//         // Sisältödivi
//         const contentDiv = document.createElement('div');
//         contentDiv.classList.add('card_content');

//         columns.forEach((column) => {
//             const pairDiv = document.createElement('div');
//             pairDiv.classList.add('card_pair');

//             const labelDiv = document.createElement('div');
//             labelDiv.classList.add('card_label');

//             const show_key_on_card = data_types[column]?.show_key_on_card === true;
//             const formatted_label = format_column_name(column);

//             if (show_key_on_card) {
//                 labelDiv.textContent = `${formatted_label}:`;
//             } else {
//                 labelDiv.textContent = '';
//             }

//             const valueDiv = document.createElement('div');
//             valueDiv.classList.add('card_value');

//             if (Array.isArray(item[column])) {
//                 valueDiv.textContent = item[column].join(', ');
//             } else if (typeof item[column] === 'object' && item[column] !== null) {
//                 valueDiv.textContent = JSON.stringify(item[column]);
//             } else {
//                 valueDiv.textContent = item[column] || '';
//             }

//             pairDiv.appendChild(labelDiv);
//             pairDiv.appendChild(valueDiv);
//             contentDiv.appendChild(pairDiv);
//         });

//         card.appendChild(contentDiv);
//         card_container.appendChild(card);
//     });
// }


// // card_view.js (sama tiedosto, uusi funktio)

// export async function open_big_card_modal(row_item, table_name) {
//     try {
//         const big_card_div = document.createElement('div');
//         big_card_div.classList.add('big_card_container'); 

//         let data_types = {};
//         try {
//             data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
//         } catch (e) {
//             console.warn("could not parse data_types for table", table_name);
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

//         const content_div = document.createElement('div');
//         content_div.classList.add('big_card_content');

//         let header_first_letter = '';
//         for (const col of sorted_columns) {
//             const role = data_types[col]?.card_element || '';
//             if (role === 'header') {
//                 const val_str = row_item[col] ? String(row_item[col]) : '';
//                 if (val_str.trim()) {
//                     header_first_letter = val_str.trim()[0];
//                 }
//             }
//         }

//         const created_part = row_item.created
//             || row_item.created_at
//             || row_item.luontiaika
//             || null;
//         const id_part = (row_item.id !== undefined) ? String(row_item.id) : 'unknown_id';
//         const creation_seed = created_part
//             ? `${id_part}_${created_part}`
//             : id_part;

//         const table_has_image_role = sorted_columns.some(col => data_types[col]?.card_element === 'image');

//         const description_entries = [];
//         const details_entries = [];
//         const keywords_list = [];
//         let found_image_for_this_row = false;

//         for (const column of sorted_columns) {
//             const raw_val = row_item[column];
//             let val_str = '';
//             if (raw_val !== null && raw_val !== undefined) {
//                 val_str = (typeof raw_val === 'string') ? raw_val : String(raw_val);
//             }
//             const role = data_types[column]?.card_element || '';
//             const show_key_on_card = data_types[column]?.show_key_on_card === true;
//             const column_label = format_column_name(column);
//             const final_text = show_key_on_card
//                 ? `${column_label}: ${val_str}`
//                 : val_str;

//             const description_match = role.match(/^description(\d+)?$/);
//             const details_match = role.match(/^details(\d+)?$/);

//             if (description_match) {
//                 let suffix_number = Number.MAX_SAFE_INTEGER;
//                 if (description_match[1]) {
//                     suffix_number = parseInt(description_match[1], 10);
//                 }
//                 if (val_str.trim()) {
//                     description_entries.push({ suffix_number, text: final_text });
//                 }
//                 continue;
//             }

//             if (details_match) {
//                 let suffix_number = Number.MAX_SAFE_INTEGER;
//                 if (details_match[1]) {
//                     suffix_number = parseInt(details_match[1], 10);
//                 }
//                 if (val_str.trim()) {
//                     details_entries.push({ suffix_number, text: final_text });
//                 }
//                 continue;
//             }

//             if (role === 'keywords') {
//                 if (val_str.trim()) {
//                     keywords_list.push({ column, text: final_text });
//                 }
//                 continue;
//             }

//             if (role === 'image') {
//                 found_image_for_this_row = true;
//                 const image_div = document.createElement('div');
//                 image_div.classList.add('big_card_image');
//                 if (val_str.trim()) {
//                     let img_src = val_str.trim();
//                     if (
//                         !img_src.startsWith('http://') &&
//                         !img_src.startsWith('https://') &&
//                         !img_src.startsWith('./') &&
//                         !img_src.startsWith('/')
//                     ) {
//                         img_src = 'media/' + img_src;
//                     }
//                     const img = document.createElement('img');
//                     img.src = img_src;
//                     img.alt = 'Kuva puuttuu';
//                     img.style.width = '300px';
//                     img.style.height = '300px';
//                     img.style.objectFit = 'cover';
//                     image_div.appendChild(img);
//                 } else {
//                     const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
//                     image_div.appendChild(avatar);
//                 }
//                 content_div.appendChild(image_div);
//                 continue;
//             }

//             if (role === 'header') {
//                 const header_el = document.createElement('div');
//                 header_el.classList.add('big_card_header');
//                 header_el.textContent = final_text;
//                 content_div.appendChild(header_el);
//             } else if (role === 'creation_spec') {
//                 const creation_div = document.createElement('div');
//                 creation_div.classList.add('big_card_creation_spec');
//                 creation_div.textContent = final_text;
//                 content_div.appendChild(creation_div);
//             } else {
//                 if (val_str.trim()) {
//                     const detail_div = document.createElement('div');
//                     detail_div.classList.add('big_card_generic_field');
//                     detail_div.textContent = final_text;
//                     content_div.appendChild(detail_div);
//                 }
//             }
//         }

//         if (table_has_image_role && !found_image_for_this_row) {
//             const image_div = document.createElement('div');
//             image_div.classList.add('big_card_image');
//             const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
//             image_div.appendChild(avatar);
//             content_div.appendChild(image_div);
//         }

//         if (!table_has_image_role) {
//             const avatarDiv = document.createElement('div');
//             avatarDiv.classList.add('big_card_image');
//             const bigAvatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
//             avatarDiv.appendChild(bigAvatar);
//             content_div.appendChild(avatarDiv);
//         }

//         description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
//         details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

//         if (description_entries.length > 0) {
//             const desc_container = document.createElement('div');
//             desc_container.classList.add('big_card_description_container');
//             for (const descObj of description_entries) {
//                 const d = document.createElement('div');
//                 d.classList.add('single_big_description');
//                 d.textContent = descObj.text;
//                 desc_container.appendChild(d);
//             }
//             content_div.appendChild(desc_container);
//         }

//         if (keywords_list.length > 0) {
//             const kw_container = document.createElement('div');
//             kw_container.classList.add('big_card_keywords_container');
//             for (const kwObj of keywords_list) {
//                 const k = document.createElement('div');
//                 k.classList.add('big_card_keyword_item');
//                 k.textContent = kwObj.text;
//                 kw_container.appendChild(k);
//             }
//             content_div.appendChild(kw_container);
//         }

//         if (details_entries.length > 0) {
//             const details_container = document.createElement('div');
//             details_container.classList.add('big_card_details_container');
//             details_container.style.display = 'grid';
//             details_container.style.gridTemplateColumns = '1fr 1fr';
//             details_container.style.gap = '0.5rem';

//             for (const detailObj of details_entries) {
//                 const detail_item = document.createElement('div');
//                 detail_item.classList.add('big_card_detail_item');

//                 if (detailObj.text.length > 300) {
//                     const details_el = document.createElement('details');
//                     const summary_el = document.createElement('summary');
//                     summary_el.textContent = detailObj.text.slice(0, 300) + '...'; 
//                     details_el.appendChild(summary_el);
//                     details_el.appendChild(document.createTextNode(detailObj.text.slice(300)));
//                     detail_item.appendChild(details_el);
//                 } else {
//                     detail_item.textContent = detailObj.text;
//                 }
//                 details_container.appendChild(detail_item);
//             }
//             content_div.appendChild(details_container);
//         }

//         if (row_item.id) {
//             console.log('Tarkistetaan lapsielementtejä parentille:', row_item.id);
//             let children_data = [];
//             try {
//                 children_data = await endpoint_router('fetchContentTables', {
//                     method: 'POST',
//                     body_data: { parent_id: row_item.id },
//                 });
//                 console.log('Lapset haettu:', children_data);
//             } catch (err) {
//                 console.error('virhe lapsien haussa (JS):', err);
//             }

//             if (children_data && children_data.length > 0) {
//                 const child_container = document.createElement('div');
//                 child_container.classList.add('big_card_child_container');
//                 child_container.textContent = 'Löydettiin lapsielementtejä, esim.:';

//                 for (const child_item of children_data) {
//                     const child_div = document.createElement('div');
//                     child_div.classList.add('child_item');
//                     child_div.textContent = JSON.stringify(child_item);
//                     child_container.appendChild(child_div);
//                 }
//                 content_div.appendChild(child_container);
//             }
//         }

//         big_card_div.appendChild(content_div);

//         const { modal_overlay, modal } = createModal({
//             titleDataLangKey: 'card_details_big',
//             tableName: table_name,
//             contentElements: [big_card_div],
//             width: '70vw'
//         });

//         showModal();

//     } catch (err) {
//         console.error('virhe ison kortin luonnissa (JS):', err);
//     }
// }


// // // card_view.js

// // import { update_card_selection } from '../selection.js';
// // import { shortenContainer } from '../../../../logical_components/vanilla_shortener/vanilla_shortener.js';
// // import { createModal, showModal, hideModal } from '../../../../logical_components/modal/modal_factory.js';

// // export async function create_seeded_avatar(seed_string, letter_for_avatar, useLargeSize = false) {
// //     // Lasketaan seed_string -> SHA-256 (hex)
// //     const msgUint8 = new TextEncoder().encode(seed_string);
// //     const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
// //     const hashArray = Array.from(new Uint8Array(hashBuffer));
// //     const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

// //     // Otetaan osa hashista numeriseen muotoon satunnaisuutta varten
// //     const numericHashPart_for_color = parseInt(hashHex.slice(0, 8), 16);
// //     const numericHashPart_for_radius = parseInt(hashHex.slice(8, 16), 16);
// //     // console.log("hashes: " + numericHashPart_for_color, numericHashPart_for_radius);

// //     // Määritetään maksimi merkkimäärä
// //     const max_chars = 16;
// //     let final_text = '?';
// //     if (letter_for_avatar) {
// //         if (letter_for_avatar.length > max_chars) {
// //             final_text = letter_for_avatar.slice(0, max_chars) + '...';
// //         } else {
// //             final_text = letter_for_avatar;
// //         }
// //     }
// //     const final_letter = final_text.toUpperCase();

// //     // Taustavärin laskenta HSL-muodossa
// //     const hue_value = numericHashPart_for_color % 360;
// //     const saturation_value = 30;  // Tummahko
// //     const lightness_value = 40;
// //     const chosen_color_hsl = `hsl(${hue_value}, ${saturation_value}%, ${lightness_value}%)`;

// //     // Border-radiaalin laskenta
// //     const random_radius = (numericHashPart_for_radius % 30) + 1;
// //     const chosen_border_radius = `${random_radius}%`;

// //     // Fontit
// //     const fonts = [
// //         'Arial, sans-serif',
// //         '"Times New Roman", Times, serif',
// //         'Consolas, monospace',
// //         'Verdana, Geneva, sans-serif',
// //         '"Trebuchet MS", Helvetica, sans-serif',
// //         'Georgia, serif',
// //         '"Palatino Linotype", "Book Antiqua", Palatino, serif'
// //     ];

// //     const font_index = (numericHashPart_for_color >>> 8) % fonts.length;
// //     // console.log('font index:', font_index);
// //     const chosen_font = fonts[font_index];

// //     // Jos haluamme ison 300x300 tai pienen 140x140
// //     const containerSize = useLargeSize ? 300 : 120;
// //     const avatarBoxSize = useLargeSize ? 220 : 120;
// //     // (voit säätää arvoa haluamallasi tavalla)

// //     // Container
// //     const container_div = document.createElement('div');
// //     container_div.style.width = containerSize + 'px';
// //     container_div.style.height = containerSize + 'px';
// //     container_div.style.display = 'flex';
// //     container_div.style.alignItems = 'center';
// //     container_div.style.justifyContent = 'center';
// //     container_div.style.overflow = 'hidden';

// //     // Avatar-elementti
// //     const avatar_div = document.createElement('div');
// //     avatar_div.textContent = final_letter;
// //     avatar_div.style.display = 'flex';
// //     avatar_div.style.alignItems = 'center';
// //     avatar_div.style.justifyContent = 'center';

// //     avatar_div.style.width = avatarBoxSize + 'px';
// //     avatar_div.style.height = avatarBoxSize + 'px';
// //     avatar_div.style.backgroundColor = chosen_color_hsl;
// //     avatar_div.style.fontFamily = chosen_font;
// //     avatar_div.style.fontWeight = 'bold';
// //     avatar_div.style.fontSize = useLargeSize ? '7rem' : '4rem'; // pienempi fontti pienessä koossa
// //     avatar_div.style.color = '#fff';
// //     avatar_div.style.textShadow = '2px 2px 5px rgba(0, 0, 0, 0.5)';
// //     avatar_div.style.borderRadius = chosen_border_radius;

// //     container_div.appendChild(avatar_div);
// //     return container_div;
// // }


// // // Apufunktio sarakenimen muuntamiseen
// // function format_column_name(column) {
// //     // Korvataan alaviivat välilyönneillä
// //     const replaced = column.replace(/_/g, ' ');
// //     // Ensimmäinen kirjain isoksi
// //     return replaced.charAt(0).toUpperCase() + replaced.slice(1);
// // }

// // /**
// //  * Asynkroninen create_card_view: rakentaa kortit data-taulukosta.
// //  * NYT laajennettuna tukemaan myös description_1, description_2, details_1, details_2 jne.
// //  * Numerolliset listaukset tulevat ensin nousevassa järjestyksessä, sitten numeroimaton "description"/"details".
// //  */
// // /**
// //  * Asynkroninen create_card_view: rakentaa kortit data-taulukosta.
// //  * NYT laajennettuna tukemaan myös description_1, description_2, details_1, details_2 jne.
// //  * Numerolliset listaukset tulevat ensin nousevassa järjestyksessä, sitten numeroimaton "description"/"details".
// //  */
// // export async function create_card_view(columns, data, table_name) {
// //     const card_container = document.createElement('div');
// //     card_container.classList.add('card_container');

// //     // Haetaan data_types localStoragesta
// //     let data_types = {};
// //     try {
// //         data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
// //     } catch (e) {
// //         console.warn("could not parse data_types for table", table_name);
// //     }

// //     // Järjestellään sarakkeet vanhan logiikan mukaan
// //     const sorted_columns = [...columns];
// //     sorted_columns.sort((colA, colB) => {
// //         const a_card_element = data_types[colA]?.card_element || '';
// //         const b_card_element = data_types[colB]?.card_element || '';
// //         if (a_card_element && !b_card_element) return -1;
// //         if (!a_card_element && b_card_element) return 1;
// //         return 0;
// //     });

// //     // Katsotaan, löytyykö TAULULTA ylipäätään 'image'-roolia
// //     const tableHasImageRole = sorted_columns.some(col => data_types[col]?.card_element === 'image');

// //     // Käydään data läpi, rivi kerrallaan
// //     for (const row_item of data) {
// //         const card = document.createElement('div');
// //         card.classList.add('card');

// //         // Checkbox
// //         const checkbox = document.createElement('input');
// //         checkbox.type = 'checkbox';
// //         checkbox.classList.add('card_checkbox');
// //         checkbox.addEventListener('change', () => update_card_selection(card));
// //         card.appendChild(checkbox);

// //         // Luodaan sisällön container
// //         const content_div = document.createElement('div');
// //         content_div.classList.add('card_content');

// //         // Lisätään iso/pieni-luokka sen mukaan, onko taululla image-roolia
// //         if (tableHasImageRole) {
// //             content_div.classList.add('card_content_large');
// //         } else {
// //             content_div.classList.add('card_content_small');
// //         }

// //         // Kasaamme description-, details- ja keywords-dataa
// //         const details_entries = [];
// //         const description_entries = [];
// //         const keywords_list = [];

// //         // Etsimme headerin ekaa kirjainta (siemen avatarille)
// //         let header_first_letter = '';
// //         // Haetaan id
// //         const id_part = (row_item.id !== undefined)
// //             ? String(row_item.id)
// //             : 'unknown_id'; // tai esim. ''

// //         // Haetaan luontiaika
// //         const created_part = row_item.created
// //             || row_item.created_at
// //             || row_item.luontiaika
// //             || null;

// //         // Rakennetaan siemen
// //         let creation_seed;
// //         if (created_part) {
// //             creation_seed = `${id_part}_${created_part}`;
// //         } else {
// //             creation_seed = id_part;
// //         }

// //         // Poimitaan mahdollinen ensimmäinen header-kirjain
// //         for (const col of sorted_columns) {
// //             const role = data_types[col]?.card_element || '';
// //             if (role === 'header') {
// //                 const raw_val = row_item[col];
// //                 const val_str = (typeof raw_val === 'string')
// //                     ? raw_val
// //                     : String(raw_val ?? '');
// //                 const trimmed = val_str.trim();
// //                 if (trimmed) {
// //                     header_first_letter = trimmed[0];
// //                 }
// //             }
// //         }

// //         // Seurataan, löytyykö rivilta *oikeaa* image-roolia
// //         let found_image_for_this_row = false;

// //         // Käydään sarakkeet läpi
// //         for (const column of sorted_columns) {
// //             const raw_val = row_item[column];
// //             let val_str = '';
// //             if (raw_val !== null && raw_val !== undefined) {
// //                 val_str = (typeof raw_val === 'string') ? raw_val : String(raw_val);
// //             }

// //             const role = data_types[column]?.card_element || '';
// //             const show_key_on_card = data_types[column]?.show_key_on_card === true;

// //             const column_label = format_column_name(column);
// //             const final_text = show_key_on_card
// //                 ? `${column_label}: ${val_str}`
// //                 : val_str;

// //             // Onko description / details -rooli?
// //             const description_match = role.match(/^description(\d+)?$/);
// //             const details_match = role.match(/^details(\d+)?$/);

// //             if (description_match) {
// //                 let suffix_number = Number.MAX_SAFE_INTEGER;
// //                 if (description_match[1]) {
// //                     suffix_number = parseInt(description_match[1], 10);
// //                 }
// //                 if (val_str.trim()) {
// //                     description_entries.push({
// //                         suffix_number,
// //                         text: final_text
// //                     });
// //                 }
// //                 continue;
// //             }

// //             if (details_match) {
// //                 let suffix_number = Number.MAX_SAFE_INTEGER;
// //                 if (details_match[1]) {
// //                     suffix_number = parseInt(details_match[1], 10);
// //                 }
// //                 if (val_str.trim()) {
// //                     details_entries.push({
// //                         suffix_number,
// //                         text: final_text
// //                     });
// //                 }
// //                 continue;
// //             }

// //             if (role === 'keywords') {
// //                 if (val_str.trim()) {
// //                     keywords_list.push({
// //                         column,
// //                         text: final_text
// //                     });
// //                 }
// //                 continue;
// //             }

// //             // Jos rooli on image
// //             if (role === 'image') {
// //                 found_image_for_this_row = true;

// //                 const elem_div = document.createElement('div');
// //                 elem_div.classList.add('card_image');

// //                 // Käytetäänkö isoa (300px) vai pientä (140px)?
// //                 const useLargeSize = tableHasImageRole;

// //                 if (val_str.trim()) {
// //                     // On jokin URL
// //                     let image_src = val_str.trim();
// //                     // Varmistetaan polun alkumuoto
// //                     if (
// //                         !image_src.startsWith('http://') &&
// //                         !image_src.startsWith('https://') &&
// //                         !image_src.startsWith('./') &&
// //                         !image_src.startsWith('/')
// //                     ) {
// //                         image_src = 'media/' + image_src;
// //                     }
// //                     const img = document.createElement('img');
// //                     img.src = image_src;
// //                     img.alt = 'Kuva puuttuu';
// //                     img.style.width = useLargeSize ? '300px' : '140px';
// //                     img.style.height = useLargeSize ? '300px' : '140px';
// //                     img.style.objectFit = 'cover';
// //                     elem_div.appendChild(img);

// //                 } else {
// //                     // Arvo tyhjä -> luodaan avatar
// //                     const avatar = await create_seeded_avatar(creation_seed, header_first_letter, useLargeSize);
// //                     elem_div.appendChild(avatar);
// //                 }
// //                 content_div.appendChild(elem_div);
// //                 continue;
// //             }

// //             // Muiden roolien normaali käsittely
// //             const elem_div = document.createElement('div');
// //             switch (role) {
// //                 case 'header':
// //                     elem_div.classList.add('card_header');
// //                     elem_div.textContent = final_text;
// //                     content_div.appendChild(elem_div);
// //                     break;

// //                 case 'creation_spec':
// //                     elem_div.classList.add('card_creation_spec');
// //                     elem_div.textContent = final_text;
// //                     content_div.appendChild(elem_div);
// //                     break;

// //                 default:
// //                     if (val_str.trim()) {
// //                         elem_div.classList.add('card_details');
// //                         elem_div.textContent = final_text;
// //                         content_div.appendChild(elem_div);
// //                     }
// //                     break;
// //             }
// //         } // end for columns

// //         // Jos taululla on image-rooli, mutta tämän rivin sarakkeista ei löytynyt imagea:
// //         if (tableHasImageRole && !found_image_for_this_row) {
// //             const image_div = document.createElement('div');
// //             image_div.classList.add('card_image');

// //             // Iso avatar
// //             const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
// //             image_div.appendChild(avatar);
// //             content_div.appendChild(image_div);
// //         }

// //         // Jos taululla EI ole image-roolia lainkaan, mutta haluat silti pienen avatarin
// //         if (!tableHasImageRole) {
// //             const avatarDiv = document.createElement('div');
// //             avatarDiv.classList.add('card_image');
// //             const smallAvatar = await create_seeded_avatar(creation_seed, header_first_letter, false);
// //             avatarDiv.appendChild(smallAvatar);
// //             content_div.appendChild(avatarDiv);
// //         }

// //         // Lajitellaan description- ja details-entryt
// //         description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
// //         details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

// //         // Luo description-container
// //         // Luo description-container
// //         // Kutsu shortenContainer
// //         if (description_entries.length > 0) {
// //             const desc_container = document.createElement('div');
// //             desc_container.classList.add('card_description_container');

// //             for (const descObj of description_entries) {
// //                 const d = document.createElement('div');
// //                 d.classList.add('single_description_item');
// //                 d.textContent = descObj.text;
// //                 desc_container.appendChild(d);
// //             }

// //             // Nyt annetaan expandMode = 'callback'
// //             shortenContainer(desc_container, {
// //                 shortMaxHeight: '180px',
// //                 fullMaxHeight: '400px',
// //                 maxCharacters: 500,
// //                 expandMode: 'callback',

// //                 onExpand: ({ container, fullText, shortText }) => {
// //                     // Tässä haluamme näyttää *koko kortin* modaalissa, 
// //                     // tai vaihtoehtoisesti vain laajemman tekstin.
// //                     // Esimerkissä kloonaamme koko kortin ja annamme sen modaalille:

// //                     const clonedCard = card.cloneNode(true);
// //                     // Voit myös muokata clonedia, jos haluat erilaista esitystä modaalissa.

// //                     const { modal_overlay, modal } = createModal({
// //                         titleDataLangKey: 'card_details',   // tms
// //                         tableName: table_name,
// //                         contentElements: [clonedCard],
// //                         width: '70vw'
// //                     });
// //                     // Näytetään modal
// //                     showModal();

// //                     // Vaihdetaan linkin teksti "Pienennä" tms. – 
// //                     // jos halutaan sama linkki myös sulkemaan
// //                     const toggleLink = container.querySelector('.vanilla-shortener-toggle');
// //                     if (toggleLink) {
// //                         toggleLink.textContent = 'Sulje modal';
// //                     }

// //                     // Voit myös asettaa .expanded-luokan, jos haluat ulkoasuun muutoksia
// //                     container.classList.add('expanded');
// //                 },

// //                 onCollapse: ({ container }) => {
// //                     // Käyttäjä klikkasi “pienennä” -linkkiä
// //                     // -> Suljetaan modal (halutessa)
// //                     hideModal();

// //                     // Palautetaan linkin teksti
// //                     const toggleLink = container.querySelector('.vanilla-shortener-toggle');
// //                     if (toggleLink) {
// //                         toggleLink.textContent = 'Näytä kaikki';
// //                     }

// //                     // Poistetaan .expanded-luokka
// //                     container.classList.remove('expanded');
// //                 }
// //             });

// //             content_div.appendChild(desc_container);
// //         }

// //         // Luo keywords-container
// //         if (keywords_list.length > 0) {
// //             const kw_container = document.createElement('div');
// //             kw_container.classList.add('card_keywords_container');
// //             for (const kwObj of keywords_list) {
// //                 const k = document.createElement('div');
// //                 k.classList.add('single_keyword_item');
// //                 k.textContent = kwObj.text;
// //                 kw_container.appendChild(k);
// //             }
// //             content_div.appendChild(kw_container);
// //         }

// //         // Luo details-container
// //         if (details_entries.length > 0) {
// //             const details_container = document.createElement('div');
// //             details_container.classList.add('card_details_container');

// //             const detail_count = details_entries.length;
// //             const row_count = Math.ceil(detail_count / 2);
// //             details_container.style.display = 'grid';
// //             details_container.style.gridAutoFlow = 'column';
// //             details_container.style.gridTemplateColumns = '1fr 1fr';
// //             details_container.style.gridTemplateRows = `repeat(${row_count}, auto)`;
// //             details_container.style.gap = '0.5rem';

// //             for (const detailObj of details_entries) {
// //                 const detail_item = document.createElement('div');
// //                 detail_item.classList.add('single_detail_item');

// //                 if (detailObj.text.length > 160) {
// //                     const details_element = document.createElement('details');
// //                     const summary_element = document.createElement('summary');
					
// //                     // Otetaan ensimmäiset 160 merkkiä summaryyn
// //                     summary_element.textContent = detailObj.text.slice(0, 160);

// //                     // Loput merkit details-alueelle
// //                     const rest_of_text = detailObj.text.slice(160);
// //                     details_element.appendChild(summary_element);
// //                     details_element.appendChild(document.createTextNode(rest_of_text));
					
// //                     detail_item.appendChild(details_element);
// //                 } else {
// //                     detail_item.textContent = detailObj.text;
// //                 }

// //                 details_container.appendChild(detail_item);
// //             }
// //             content_div.appendChild(details_container);
// //         }

// //         // Lisätään content_div korttiin
// //         card.appendChild(content_div);

// //         // Lisätään kortti lopulliseen containeriin
// //         card_container.appendChild(card);
// //     } // end data-lenkki

// //     // Palautetaan korttikontti
// //     return card_container;
// // }


// // /**
// //  * Lisää annettuun card_containeriin lisää itemejä (kortteja) columns- ja data-listan perusteella.
// //  * HUOM: Tämä funktio on tässä yhä synkroninen, koska ei kutsu create_seeded_avataria.
// //  */
// // export function appendDataToCardView(card_container, columns, data, table_name) {
// //     // Haetaan data_types localStoragesta (samoin kuin create_card_view tekee)
// //     let data_types = {};
// //     try {
// //         data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
// //     } catch (e) {
// //         console.warn("could not parse data_types for table", table_name);
// //     }

// //     data.forEach(item => {
// //         const card = document.createElement('div');
// //         card.classList.add('card');

// //         // Asetetaan cardiin data-id attribuutti
// //         if (item.id !== undefined && item.id !== null) {
// //             card.setAttribute('data-id', item.id);
// //             console.log(`Lisätty kortti, data-id: ${item.id}`);
// //         }

// //         // Valintaruutu
// //         const checkbox = document.createElement('input');
// //         checkbox.type = 'checkbox';
// //         checkbox.classList.add('card_checkbox');
// //         checkbox.addEventListener('change', () => update_card_selection(card));
// //         card.appendChild(checkbox);

// //         // Sisältödivi
// //         const contentDiv = document.createElement('div');
// //         contentDiv.classList.add('card_content');

// //         columns.forEach((column) => {
// //             const pairDiv = document.createElement('div');
// //             pairDiv.classList.add('card_pair');

// //             const labelDiv = document.createElement('div');
// //             labelDiv.classList.add('card_label');

// //             const show_key_on_card = data_types[column]?.show_key_on_card === true;
// //             const formatted_label = format_column_name(column);

// //             // Jos show_key_on_card = true, näytetään "Label:"
// //             if (show_key_on_card) {
// //                 labelDiv.textContent = `${formatted_label}:`;
// //             } else {
// //                 labelDiv.textContent = '';
// //             }

// //             const valueDiv = document.createElement('div');
// //             valueDiv.classList.add('card_value');

// //             // Arvon muunto stringiksi
// //             if (Array.isArray(item[column])) {
// //                 valueDiv.textContent = item[column].join(', ');
// //             } else if (typeof item[column] === 'object' && item[column] !== null) {
// //                 valueDiv.textContent = JSON.stringify(item[column]);
// //             } else {
// //                 valueDiv.textContent = item[column] || '';
// //             }

// //             pairDiv.appendChild(labelDiv);
// //             pairDiv.appendChild(valueDiv);
// //             contentDiv.appendChild(pairDiv);
// //         });

// //         card.appendChild(contentDiv);
// //         card_container.appendChild(card);
// //     });
// // }


// // // // card_view.js

// // // import { update_card_selection } from '../selection.js';

// // // export async function create_seeded_avatar(seed_string, letter_for_avatar, useLargeSize = false) {
// // //     // Lasketaan seed_string -> SHA-256 (hex)
// // //     const msgUint8 = new TextEncoder().encode(seed_string);
// // //     const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
// // //     const hashArray = Array.from(new Uint8Array(hashBuffer));
// // //     const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

// // //     // Otetaan osa hashista numeriseen muotoon satunnaisuutta varten
// // //     const numericHashPart_for_color = parseInt(hashHex.slice(0, 8), 16);
// // //     const numericHashPart_for_radius = parseInt(hashHex.slice(8, 16), 16);
// // //     // console.log("hashes: " + numericHashPart_for_color, numericHashPart_for_radius);

// // //     // Määritetään maksimi merkkimäärä
// // //     const max_chars = 16;
// // //     let final_text = '?';
// // //     if (letter_for_avatar) {
// // //         if (letter_for_avatar.length > max_chars) {
// // //             final_text = letter_for_avatar.slice(0, max_chars) + '...';
// // //         } else {
// // //             final_text = letter_for_avatar;
// // //         }
// // //     }
// // //     const final_letter = final_text.toUpperCase();

// // //     // Taustavärin laskenta HSL-muodossa
// // //     const hue_value = numericHashPart_for_color % 360;
// // //     const saturation_value = 30;  // Tummahko
// // //     const lightness_value = 40;
// // //     const chosen_color_hsl = `hsl(${hue_value}, ${saturation_value}%, ${lightness_value}%)`;

// // //     // Border-radiaalin laskenta
// // //     const random_radius = (numericHashPart_for_radius % 30) + 1;
// // //     const chosen_border_radius = `${random_radius}%`;

// // //     // Fontit
// // //     const fonts = [
// // //         'Arial, sans-serif',
// // //         '"Times New Roman", Times, serif',
// // //         'Consolas, monospace',
// // //         'Verdana, Geneva, sans-serif',
// // //         '"Trebuchet MS", Helvetica, sans-serif',
// // //         'Georgia, serif',
// // //         '"Palatino Linotype", "Book Antiqua", Palatino, serif'
// // //     ];

// // //     const font_index = (numericHashPart_for_color >>> 8) % fonts.length;
// // //     // console.log('font index:', font_index);
// // //     const chosen_font = fonts[font_index];

// // //     // Jos haluamme ison 300x300 tai pienen 140x140
// // //     const containerSize = useLargeSize ? 300 : 120;
// // //     const avatarBoxSize = useLargeSize ? 220 : 120;
// // //     // (voit säätää arvoa haluamallasi tavalla)

// // //     // Container
// // //     const container_div = document.createElement('div');
// // //     container_div.style.width = containerSize + 'px';
// // //     container_div.style.height = containerSize + 'px';
// // //     container_div.style.display = 'flex';
// // //     container_div.style.alignItems = 'center';
// // //     container_div.style.justifyContent = 'center';
// // //     container_div.style.overflow = 'hidden';

// // //     // Avatar-elementti
// // //     const avatar_div = document.createElement('div');
// // //     avatar_div.textContent = final_letter;
// // //     avatar_div.style.display = 'flex';
// // //     avatar_div.style.alignItems = 'center';
// // //     avatar_div.style.justifyContent = 'center';

// // //     avatar_div.style.width = avatarBoxSize + 'px';
// // //     avatar_div.style.height = avatarBoxSize + 'px';
// // //     avatar_div.style.backgroundColor = chosen_color_hsl;
// // //     avatar_div.style.fontFamily = chosen_font;
// // //     avatar_div.style.fontWeight = 'bold';
// // //     avatar_div.style.fontSize = useLargeSize ? '7rem' : '4rem'; // pienempi fontti pienessä koossa
// // //     avatar_div.style.color = '#fff';
// // //     avatar_div.style.textShadow = '2px 2px 5px rgba(0, 0, 0, 0.5)';
// // //     avatar_div.style.borderRadius = chosen_border_radius;

// // //     container_div.appendChild(avatar_div);
// // //     return container_div;
// // // }


// // // // Apufunktio sarakenimen muuntamiseen
// // // function format_column_name(column) {
// // //     // Korvataan alaviivat välilyönneillä
// // //     const replaced = column.replace(/_/g, ' ');
// // //     // Ensimmäinen kirjain isoksi
// // //     return replaced.charAt(0).toUpperCase() + replaced.slice(1);
// // // }

// // // /**
// // //  * Asynkroninen create_card_view: rakentaa kortit data-taulukosta.
// // //  * NYT laajennettuna tukemaan myös description_1, description_2, details_1, details_2 jne.
// // //  * Numerolliset listaukset tulevat ensin nousevassa järjestyksessä, sitten numeroimaton "description"/"details".
// // //  */

// // // export async function create_card_view(columns, data, table_name) {
// // //     const card_container = document.createElement('div');
// // //     card_container.classList.add('card_container');

// // //     // Haetaan data_types localStoragesta
// // //     let data_types = {};
// // //     try {
// // //         data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
// // //     } catch (e) {
// // //         console.warn("could not parse data_types for table", table_name);
// // //     }

// // //     // Järjestellään sarakkeet vanhan logiikan mukaan
// // //     const sorted_columns = [...columns];
// // //     sorted_columns.sort((colA, colB) => {
// // //         const a_card_element = data_types[colA]?.card_element || '';
// // //         const b_card_element = data_types[colB]?.card_element || '';
// // //         if (a_card_element && !b_card_element) return -1;
// // //         if (!a_card_element && b_card_element) return 1;
// // //         return 0;
// // //     });

// // //     // Katsotaan, löytyykö TAULULTA ylipäätään 'image'-roolia
// // //     const tableHasImageRole = sorted_columns.some(col => data_types[col]?.card_element === 'image');

// // //     // Käydään data läpi, rivi kerrallaan
// // //     for (const row_item of data) {
// // //         const card = document.createElement('div');
// // //         card.classList.add('card');

// // //         // Checkbox
// // //         const checkbox = document.createElement('input');
// // //         checkbox.type = 'checkbox';
// // //         checkbox.classList.add('card_checkbox');
// // //         checkbox.addEventListener('change', () => update_card_selection(card));
// // //         card.appendChild(checkbox);

// // //         // Luodaan sisällön container
// // //         const content_div = document.createElement('div');
// // //         content_div.classList.add('card_content');

// // //         // Lisätään iso/pieni-luokka sen mukaan onko taululla image-rooli
// // //         if (tableHasImageRole) {
// // //             content_div.classList.add('card_content_large');
// // //         } else {
// // //             content_div.classList.add('card_content_small');
// // //         }

// // //         // Kasaamme description- ja details- ja keywords-dataa
// // //         const details_entries = [];
// // //         const description_entries = [];
// // //         const keywords_list = [];

// // //         // Etsimme headerin ekaa kirjainta (siemen avatarille)
// // //         let header_first_letter = '';
// // //         // Haetaan id osa
// // //         const id_part = (row_item.id !== undefined)
// // //             ? String(row_item.id)
// // //             : 'unknown_id'; // tai esim. ''

// // //         // Haetaan luontiaika
// // //         const created_part = row_item.created
// // //             || row_item.created_at
// // //             || row_item.luontiaika
// // //             || null;

// // //         // Rakennetaan siemen:
// // //         // Jos luontiaikaa ei löydy, käytetään vain id:tä
// // //         let creation_seed;
// // //         if (created_part) {
// // //             creation_seed = `${id_part}_${created_part}`;
// // //         } else {
// // //             creation_seed = id_part;
// // //         }

// // //         // Poimitaan mahdollinen ensimmäinen header-kirjain
// // //         for (const col of sorted_columns) {
// // //             const role = data_types[col]?.card_element || '';
// // //             if (role === 'header') {
// // //                 const raw_val = row_item[col];
// // //                 const val_str = (typeof raw_val === 'string')
// // //                     ? raw_val
// // //                     : String(raw_val ?? '');
// // //                 const trimmed = val_str.trim();
// // //                 if (trimmed) {
// // //                     header_first_letter = trimmed[0];
// // //                 }
// // //             }
// // //         }

// // //         // Seurataan, oliko tällä rivillä *oikeaa* image-roolia
// // //         let found_image_for_this_row = false;

// // //         // Käydään sarakkeet läpi
// // //         for (const column of sorted_columns) {
// // //             const raw_val = row_item[column];
// // //             let val_str = '';
// // //             if (raw_val !== null && raw_val !== undefined) {
// // //                 val_str = (typeof raw_val === 'string') ? raw_val : String(raw_val);
// // //             }

// // //             const role = data_types[column]?.card_element || '';
// // //             const show_key_on_card = data_types[column]?.show_key_on_card === true;

// // //             const column_label = format_column_name(column);
// // //             const final_text = show_key_on_card
// // //                 ? `${column_label}: ${val_str}`
// // //                 : val_str;

// // //             // Onko description / details -rooli?
// // //             const description_match = role.match(/^description(\d+)?$/);
// // //             const details_match = role.match(/^details(\d+)?$/);

// // //             if (description_match) {
// // //                 let suffix_number = Number.MAX_SAFE_INTEGER;
// // //                 if (description_match[1]) {
// // //                     suffix_number = parseInt(description_match[1], 10);
// // //                 }
// // //                 if (val_str.trim()) {
// // //                     description_entries.push({
// // //                         suffix_number,
// // //                         text: final_text
// // //                     });
// // //                 }
// // //                 continue;
// // //             }

// // //             if (details_match) {
// // //                 let suffix_number = Number.MAX_SAFE_INTEGER;
// // //                 if (details_match[1]) {
// // //                     suffix_number = parseInt(details_match[1], 10);
// // //                 }
// // //                 if (val_str.trim()) {
// // //                     details_entries.push({
// // //                         suffix_number,
// // //                         text: final_text
// // //                     });
// // //                 }
// // //                 continue;
// // //             }

// // //             if (role === 'keywords') {
// // //                 if (val_str.trim()) {
// // //                     keywords_list.push({
// // //                         column,
// // //                         text: final_text
// // //                     });
// // //                 }
// // //                 continue;
// // //             }

// // //             // Jos rooli on image
// // //             if (role === 'image') {
// // //                 found_image_for_this_row = true;

// // //                 const elem_div = document.createElement('div');
// // //                 elem_div.classList.add('card_image');

// // //                 // Käytetäänkö isoa (300px) vai pientä (140px)?
// // //                 const useLargeSize = tableHasImageRole;

// // //                 if (val_str.trim()) {
// // //                     // On jokin URL
// // //                     let image_src = val_str.trim();
// // //                     // Varmistetaan polun alkumuoto
// // //                     if (
// // //                         !image_src.startsWith('http://') &&
// // //                         !image_src.startsWith('https://') &&
// // //                         !image_src.startsWith('./') &&
// // //                         !image_src.startsWith('/')
// // //                     ) {
// // //                         image_src = 'media/' + image_src;
// // //                     }
// // //                     const img = document.createElement('img');
// // //                     img.src = image_src;
// // //                     img.alt = 'Kuva puuttuu';
// // //                     img.style.width = useLargeSize ? '300px' : '140px';
// // //                     img.style.height = useLargeSize ? '300px' : '140px';
// // //                     img.style.objectFit = 'cover';
// // //                     elem_div.appendChild(img);

// // //                 } else {
// // //                     // Arvo tyhjä -> luodaan avatar
// // //                     const avatar = await create_seeded_avatar(creation_seed, header_first_letter, useLargeSize);
// // //                     elem_div.appendChild(avatar);
// // //                 }
// // //                 content_div.appendChild(elem_div);
// // //                 continue;
// // //             }

// // //             // Muiden roolien normaali käsittely
// // //             const elem_div = document.createElement('div');
// // //             switch (role) {
// // //                 case 'header':
// // //                     elem_div.classList.add('card_header');
// // //                     elem_div.textContent = final_text;
// // //                     content_div.appendChild(elem_div);
// // //                     break;

// // //                 case 'creation_spec':
// // //                     elem_div.classList.add('card_creation_spec');
// // //                     elem_div.textContent = final_text;
// // //                     content_div.appendChild(elem_div);
// // //                     break;

// // //                 default:
// // //                     if (val_str.trim()) {
// // //                         elem_div.classList.add('card_details');
// // //                         elem_div.textContent = final_text;
// // //                         content_div.appendChild(elem_div);
// // //                     }
// // //                     break;
// // //             }
// // //         } // end for columns

// // //         // Jos taululla on image-rooli, mutta tämän rivin sarakkeista ei löytynyt imagea,
// // //         // voit halutessasi lisätä "tyhjän" placeholderin, joka pitää layoutin yhtenäisenä.
// // //         if (tableHasImageRole && !found_image_for_this_row) {
// // //             const image_div = document.createElement('div');
// // //             image_div.classList.add('card_image');
// // //             // Iso avatar
// // //             const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
// // //             image_div.appendChild(avatar);
// // //             content_div.appendChild(image_div);
// // //         }

// // //         // Jos taululla EI ole image-roolia lainkaan, mutta haluat silti pienen avatarin
// // //         // kaikille:
// // //         if (!tableHasImageRole) {
// // //             const avatarDiv = document.createElement('div');
// // //             avatarDiv.classList.add('card_image');
// // //             const smallAvatar = await create_seeded_avatar(creation_seed, header_first_letter, false);
// // //             avatarDiv.appendChild(smallAvatar);
// // //             content_div.appendChild(avatarDiv);
// // //         }

// // //         // Lajitellaan description- ja details- entryt
// // //         description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
// // //         details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

// // //         // Luo description-container
// // //         if (description_entries.length > 0) {
// // //             const desc_container = document.createElement('div');
// // //             desc_container.classList.add('card_description_container');
// // //             for (const descObj of description_entries) {
// // //                 const d = document.createElement('div');
// // //                 d.classList.add('single_description_item');
// // //                 d.textContent = descObj.text;
// // //                 desc_container.appendChild(d);
// // //             }
// // //             content_div.appendChild(desc_container);
// // //         }

// // //         // Luo keywords-container
// // //         if (keywords_list.length > 0) {
// // //             const kw_container = document.createElement('div');
// // //             kw_container.classList.add('card_keywords_container');
// // //             for (const kwObj of keywords_list) {
// // //                 const k = document.createElement('div');
// // //                 k.classList.add('single_keyword_item');
// // //                 k.textContent = kwObj.text;
// // //                 kw_container.appendChild(k);
// // //             }
// // //             content_div.appendChild(kw_container);
// // //         }

// // //         // Luo details-container
// // //         if (details_entries.length > 0) {
// // //             const details_container = document.createElement('div');
// // //             details_container.classList.add('card_details_container');

// // //             const detail_count = details_entries.length;
// // //             const row_count = Math.ceil(detail_count / 2);
// // //             details_container.style.display = 'grid';
// // //             details_container.style.gridAutoFlow = 'column';
// // //             details_container.style.gridTemplateColumns = '1fr 1fr';
// // //             details_container.style.gridTemplateRows = `repeat(${row_count}, auto)`;
// // //             details_container.style.gap = '0.5rem';

// // //             for (const detailObj of details_entries) {
// // //                 const detail_item = document.createElement('div');
// // //                 detail_item.classList.add('single_detail_item');

// // //                 if (detailObj.text.length > 160) {
// // //                     const details_element = document.createElement('details');
// // //                     const summary_element = document.createElement('summary');
					
// // //                     // Otetaan ensimmäiset 160 merkkiä summaryyn
// // //                     summary_element.textContent = detailObj.text.slice(0, 160);
					
// // //                     // Loput merkit details-alueelle
// // //                     const rest_of_text = detailObj.text.slice(160);
// // //                     details_element.appendChild(summary_element);
// // //                     details_element.appendChild(document.createTextNode(rest_of_text));
					
// // //                     detail_item.appendChild(details_element);
// // //                 } else {
// // //                     detail_item.textContent = detailObj.text;
// // //                 }

// // //                 details_container.appendChild(detail_item);
// // //             }
// // //             content_div.appendChild(details_container);
// // //         }

// // //         // Lisätään content_div korttiin
// // //         card.appendChild(content_div);

// // //         // Lisätään kortti lopulliseen containeriin
// // //         card_container.appendChild(card);
// // //     } // end data-lenkki

// // //     // Palautetaan korttikontti
// // //     return card_container;
// // // }


// // // // export async function create_card_view(columns, data, table_name) {
// // // //     const card_container = document.createElement('div');
// // // //     card_container.classList.add('card_container');

// // // //     // Haetaan data_types localStoragesta
// // // //     let data_types = {};
// // // //     try {
// // // //         data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
// // // //     } catch (e) {
// // // //         console.warn("could not parse data_types for table", table_name);
// // // //     }

// // // //     // Järjestellään sarakkeet vanhan logiikan mukaan
// // // //     const sorted_columns = [...columns];
// // // //     sorted_columns.sort((colA, colB) => {
// // // //         const a_card_element = data_types[colA]?.card_element || '';
// // // //         const b_card_element = data_types[colB]?.card_element || '';
// // // //         if (a_card_element && !b_card_element) return -1;
// // // //         if (!a_card_element && b_card_element) return 1;
// // // //         return 0;
// // // //     });

// // // //     // Katsotaan, löytyykö TAULULTA ylipäätään 'image'-roolia
// // // //     const tableHasImageRole = sorted_columns.some(col => data_types[col]?.card_element === 'image');

// // // //     // Käydään data läpi, rivi kerrallaan
// // // //     for (const row_item of data) {
// // // //         const card = document.createElement('div');
// // // //         card.classList.add('card');

// // // //         // Checkbox
// // // //         const checkbox = document.createElement('input');
// // // //         checkbox.type = 'checkbox';
// // // //         checkbox.classList.add('card_checkbox');
// // // //         checkbox.addEventListener('change', () => update_card_selection(card));
// // // //         card.appendChild(checkbox);

// // // //         // Luodaan sisällön container
// // // //         const content_div = document.createElement('div');
// // // //         content_div.classList.add('card_content');

// // // //         // Lisätään iso/pieni-luokka sen mukaan onko taululla image-rooli
// // // //         if (tableHasImageRole) {
// // // //             content_div.classList.add('card_content_large');
// // // //         } else {
// // // //             content_div.classList.add('card_content_small');
// // // //         }

// // // //         // Kasaamme description- ja details- ja keywords-dataa
// // // //         const details_entries = [];
// // // //         const description_entries = [];
// // // //         const keywords_list = [];

// // // //         // Etsimme headerin ekaa kirjainta (siemen avatarille)
// // // //         let header_first_letter = '';
// // // //         // Haetaan id osa
// // // //         const id_part = (row_item.id !== undefined)
// // // //             ? String(row_item.id)
// // // //             : 'unknown_id'; // tai esim. ''

// // // //         // Haetaan luontiaika
// // // //         const created_part = row_item.created
// // // //             || row_item.created_at
// // // //             || row_item.luontiaika
// // // //             || null;

// // // //         // Rakennetaan siemen:
// // // //         // Jos luontiaikaa ei löydy, käytetään vain id:tä
// // // //         let creation_seed;
// // // //         if (created_part) {
// // // //             creation_seed = `${id_part}_${created_part}`;
// // // //         } else {
// // // //             creation_seed = id_part;
// // // //         }


// // // //         // Poimitaan mahdollinen ensimmäinen header-kirjain
// // // //         for (const col of sorted_columns) {
// // // //             const role = data_types[col]?.card_element || '';
// // // //             if (role === 'header') {
// // // //                 const raw_val = row_item[col];
// // // //                 const val_str = (typeof raw_val === 'string')
// // // //                     ? raw_val
// // // //                     : String(raw_val ?? '');
// // // //                 const trimmed = val_str.trim();
// // // //                 if (trimmed) {
// // // //                     header_first_letter = trimmed[0];
// // // //                 }
// // // //             }
// // // //         }

// // // //         // Seurataan, oliko tällä rivillä *oikeaa* image-roolia
// // // //         let found_image_for_this_row = false;

// // // //         // Käydään sarakkeet läpi
// // // //         for (const column of sorted_columns) {
// // // //             const raw_val = row_item[column];
// // // //             let val_str = '';
// // // //             if (raw_val !== null && raw_val !== undefined) {
// // // //                 val_str = (typeof raw_val === 'string') ? raw_val : String(raw_val);
// // // //             }

// // // //             const role = data_types[column]?.card_element || '';
// // // //             const show_key_on_card = data_types[column]?.show_key_on_card === true;

// // // //             const column_label = format_column_name(column);
// // // //             const final_text = show_key_on_card
// // // //                 ? `${column_label}: ${val_str}`
// // // //                 : val_str;

// // // //             // Onko description / details -rooli?
// // // //             const description_match = role.match(/^description(\d+)?$/);
// // // //             const details_match = role.match(/^details(\d+)?$/);

// // // //             if (description_match) {
// // // //                 let suffix_number = Number.MAX_SAFE_INTEGER;
// // // //                 if (description_match[1]) {
// // // //                     suffix_number = parseInt(description_match[1], 10);
// // // //                 }
// // // //                 if (val_str.trim()) {
// // // //                     description_entries.push({
// // // //                         suffix_number,
// // // //                         text: final_text
// // // //                     });
// // // //                 }
// // // //                 continue;
// // // //             }

// // // //             if (details_match) {
// // // //                 let suffix_number = Number.MAX_SAFE_INTEGER;
// // // //                 if (details_match[1]) {
// // // //                     suffix_number = parseInt(details_match[1], 10);
// // // //                 }
// // // //                 if (val_str.trim()) {
// // // //                     details_entries.push({
// // // //                         suffix_number,
// // // //                         text: final_text
// // // //                     });
// // // //                 }
// // // //                 continue;
// // // //             }

// // // //             if (role === 'keywords') {
// // // //                 if (val_str.trim()) {
// // // //                     keywords_list.push({
// // // //                         column,
// // // //                         text: final_text
// // // //                     });
// // // //                 }
// // // //                 continue;
// // // //             }

// // // //             // Jos rooli on image
// // // //             if (role === 'image') {
// // // //                 found_image_for_this_row = true;

// // // //                 const elem_div = document.createElement('div');
// // // //                 elem_div.classList.add('card_image');

// // // //                 // Käytetäänkö isoa (300px) vai pientä (140px)?
// // // //                 const useLargeSize = tableHasImageRole;
// // // //                 // -> true jos taululla on image-rooli

// // // //                 if (val_str.trim()) {
// // // //                     // On jokin URL
// // // //                     let image_src = val_str.trim();
// // // //                     // Varmistetaan polun alkumuoto
// // // //                     if (
// // // //                         !image_src.startsWith('http://') &&
// // // //                         !image_src.startsWith('https://') &&
// // // //                         !image_src.startsWith('./') &&
// // // //                         !image_src.startsWith('/')
// // // //                     ) {
// // // //                         image_src = 'media/' + image_src;
// // // //                     }
// // // //                     const img = document.createElement('img');
// // // //                     img.src = image_src;
// // // //                     img.alt = 'Kuva puuttuu';
// // // //                     // Koko sen mukaan, onko iso vai pieni
// // // //                     img.style.width = useLargeSize ? '300px' : '140px';
// // // //                     img.style.height = useLargeSize ? '300px' : '140px';
// // // //                     img.style.objectFit = 'cover';
// // // //                     elem_div.appendChild(img);

// // // //                 } else {
// // // //                     // Arvo tyhjä -> luodaan avatar
// // // //                     const avatar = await create_seeded_avatar(creation_seed, header_first_letter, useLargeSize);
// // // //                     elem_div.appendChild(avatar);
// // // //                 }
// // // //                 content_div.appendChild(elem_div);
// // // //                 continue;
// // // //             }

// // // //             // Muiden roolien normaali käsittely
// // // //             const elem_div = document.createElement('div');
// // // //             switch (role) {
// // // //                 case 'header':
// // // //                     elem_div.classList.add('card_header');
// // // //                     elem_div.textContent = final_text;
// // // //                     content_div.appendChild(elem_div);
// // // //                     break;

// // // //                 case 'creation_spec':
// // // //                     elem_div.classList.add('card_creation_spec');
// // // //                     elem_div.textContent = final_text;
// // // //                     content_div.appendChild(elem_div);
// // // //                     break;

// // // //                 default:
// // // //                     if (val_str.trim()) {
// // // //                         elem_div.classList.add('card_details');
// // // //                         elem_div.textContent = final_text;
// // // //                         content_div.appendChild(elem_div);
// // // //                     }
// // // //                     break;
// // // //             }
// // // //         } // end for columns

// // // //         // Jos taululla on image-rooli, mutta tämän rivin sarakkeista ei löytynyt imagea,
// // // //         // voit halutessasi lisätä "tyhjän" placeholderin, joka pitää layoutin yhtenäisenä.
// // // //         if (tableHasImageRole && !found_image_for_this_row) {
// // // //             const image_div = document.createElement('div');
// // // //             image_div.classList.add('card_image');
// // // //             // Iso avatar
// // // //             const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
// // // //             image_div.appendChild(avatar);
// // // //             content_div.appendChild(image_div);
// // // //         }

// // // //         // Jos taululla EI ole image-roolia lainkaan, mutta haluat silti pienen avatarin
// // // //         // kaikille:
// // // //         // (voit halutessasi laittaa tämän if-lauseen,
// // // //         //  jos haluat aina pienen avatarin, kun "image" -roolia ei ole)
// // // //         if (!tableHasImageRole) {
// // // //             const avatarDiv = document.createElement('div');
// // // //             avatarDiv.classList.add('card_image');
// // // //             const smallAvatar = await create_seeded_avatar(creation_seed, header_first_letter, false);
// // // //             avatarDiv.appendChild(smallAvatar);
// // // //             content_div.appendChild(avatarDiv);
// // // //         }

// // // //         // Lajitellaan description- ja details- entryt
// // // //         description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
// // // //         details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

// // // //         // Luo description-container
// // // //         if (description_entries.length > 0) {
// // // //             const desc_container = document.createElement('div');
// // // //             desc_container.classList.add('card_description_container');
// // // //             for (const descObj of description_entries) {
// // // //                 const d = document.createElement('div');
// // // //                 d.classList.add('single_description_item');
// // // //                 d.textContent = descObj.text;
// // // //                 desc_container.appendChild(d);
// // // //             }
// // // //             content_div.appendChild(desc_container);
// // // //         }

// // // //         // Luo keywords-container
// // // //         if (keywords_list.length > 0) {
// // // //             const kw_container = document.createElement('div');
// // // //             kw_container.classList.add('card_keywords_container');
// // // //             for (const kwObj of keywords_list) {
// // // //                 const k = document.createElement('div');
// // // //                 k.classList.add('single_keyword_item');
// // // //                 k.textContent = kwObj.text;
// // // //                 kw_container.appendChild(k);
// // // //             }
// // // //             content_div.appendChild(kw_container);
// // // //         }

// // // //         // Luo details-container
// // // //         if (details_entries.length > 0) {
// // // //             const details_container = document.createElement('div');
// // // //             details_container.classList.add('card_details_container');

// // // //             const detail_count = details_entries.length;
// // // //             const row_count = Math.ceil(detail_count / 2);
// // // //             details_container.style.display = 'grid';
// // // //             details_container.style.gridAutoFlow = 'column';
// // // //             details_container.style.gridTemplateColumns = '1fr 1fr';
// // // //             details_container.style.gridTemplateRows = `repeat(${row_count}, auto)`;
// // // //             details_container.style.gap = '0.5rem';

// // // //             for (const detailObj of details_entries) {
// // // //                 const detail_item = document.createElement('div');
// // // //                 detail_item.classList.add('single_detail_item');
// // // //                 detail_item.textContent = detailObj.text;
// // // //                 details_container.appendChild(detail_item);
// // // //             }
// // // //             content_div.appendChild(details_container);
// // // //         }

// // // //         // Lisätään content_div korttiin
// // // //         card.appendChild(content_div);

// // // //         // Lisätään kortti lopulliseen containeriin
// // // //         card_container.appendChild(card);
// // // //     } // end data-lenkki

// // // //     // Palautetaan korttikontti
// // // //     return card_container;
// // // // }

// // // /**
// // //  * Lisää annettuun card_containeriin lisää itemejä (kortteja) columns- ja data-listan perusteella.
// // //  * HUOM: Tämä funktio on tässä yhä synkroninen, koska ei kutsu create_seeded_avataria.
// // //  */
// // // export function appendDataToCardView(card_container, columns, data, table_name) {
// // //     // Haetaan data_types localStoragesta (samoin kuin create_card_view tekee)
// // //     let data_types = {};
// // //     try {
// // //         data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
// // //     } catch (e) {
// // //         console.warn("could not parse data_types for table", table_name);
// // //     }

// // //     data.forEach(item => {
// // //         const card = document.createElement('div');
// // //         card.classList.add('card');

// // //         // Asetetaan cardiin data-id attribuutti
// // //         if (item.id !== undefined && item.id !== null) {
// // //             card.setAttribute('data-id', item.id);
// // //             console.log(`Lisätty kortti, data-id: ${item.id}`);
// // //         }

// // //         // Valintaruutu
// // //         const checkbox = document.createElement('input');
// // //         checkbox.type = 'checkbox';
// // //         checkbox.classList.add('card_checkbox');
// // //         checkbox.addEventListener('change', () => update_card_selection(card));
// // //         card.appendChild(checkbox);

// // //         // Sisältödivi
// // //         const contentDiv = document.createElement('div');
// // //         contentDiv.classList.add('card_content');

// // //         columns.forEach((column) => {
// // //             const pairDiv = document.createElement('div');
// // //             pairDiv.classList.add('card_pair');

// // //             const labelDiv = document.createElement('div');
// // //             labelDiv.classList.add('card_label');

// // //             const show_key_on_card = data_types[column]?.show_key_on_card === true;
// // //             const formatted_label = format_column_name(column);

// // //             // Jos show_key_on_card = true, näytetään "Label:"
// // //             if (show_key_on_card) {
// // //                 labelDiv.textContent = `${formatted_label}:`;
// // //             } else {
// // //                 labelDiv.textContent = '';
// // //             }

// // //             const valueDiv = document.createElement('div');
// // //             valueDiv.classList.add('card_value');

// // //             // Arvon muunto stringiksi
// // //             if (Array.isArray(item[column])) {
// // //                 valueDiv.textContent = item[column].join(', ');
// // //             } else if (typeof item[column] === 'object' && item[column] !== null) {
// // //                 valueDiv.textContent = JSON.stringify(item[column]);
// // //             } else {
// // //                 valueDiv.textContent = item[column] || '';
// // //             }

// // //             pairDiv.appendChild(labelDiv);
// // //             pairDiv.appendChild(valueDiv);
// // //             contentDiv.appendChild(pairDiv);
// // //         });

// // //         card.appendChild(contentDiv);
// // //         card_container.appendChild(card);
// // //     });
// // // }
