// card_view.js

import { update_card_selection } from '../selection.js';

export async function create_seeded_avatar(seed_string, letter_for_avatar, useLargeSize = false) {
    // Lasketaan seed_string -> SHA-256 (hex)
    const msgUint8 = new TextEncoder().encode(seed_string);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Otetaan osa hashista numeriseen muotoon satunnaisuutta varten
    const numericHashPart_for_color = parseInt(hashHex.slice(0, 8), 16);
    const numericHashPart_for_radius = parseInt(hashHex.slice(8, 16), 16);
    // console.log("hashes: " + numericHashPart_for_color, numericHashPart_for_radius);

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
    // console.log('font index:', font_index);
    const chosen_font = fonts[font_index];

    // Jos haluamme ison 300x300 tai pienen 140x140
    const containerSize = useLargeSize ? 300 : 120;
    const avatarBoxSize = useLargeSize ? 220 : 120;
    // (voit säätää arvoa haluamallasi tavalla)

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
    avatar_div.style.fontSize = useLargeSize ? '7rem' : '4rem'; // pienempi fontti pienessä koossa
    avatar_div.style.color = '#fff';
    avatar_div.style.textShadow = '2px 2px 5px rgba(0, 0, 0, 0.5)';
    avatar_div.style.borderRadius = chosen_border_radius;

    container_div.appendChild(avatar_div);
    return container_div;
}


// Apufunktio sarakenimen muuntamiseen
function format_column_name(column) {
    // Korvataan alaviivat välilyönneillä
    const replaced = column.replace(/_/g, ' ');
    // Ensimmäinen kirjain isoksi
    return replaced.charAt(0).toUpperCase() + replaced.slice(1);
}

/**
 * Asynkroninen create_card_view: rakentaa kortit data-taulukosta.
 * NYT laajennettuna tukemaan myös description_1, description_2, details_1, details_2 jne.
 * Numerolliset listaukset tulevat ensin nousevassa järjestyksessä, sitten numeroimaton "description"/"details".
 */
export async function create_card_view(columns, data, table_name) {
    const card_container = document.createElement('div');
    card_container.classList.add('card_container');

    // Haetaan data_types localStoragesta
    let data_types = {};
    try {
        data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
    } catch (e) {
        console.warn("could not parse data_types for table", table_name);
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

        // Lisätään iso/pieni-luokka sen mukaan onko taululla image-rooli
        if (tableHasImageRole) {
            content_div.classList.add('card_content_large');
        } else {
            content_div.classList.add('card_content_small');
        }

        // Kasaamme description- ja details- ja keywords-dataa
        const details_entries = [];
        const description_entries = [];
        const keywords_list = [];

        // Etsimme headerin ekaa kirjainta (siemen avatarille)
        let header_first_letter = '';
        // Haetaan id osa
        const id_part = (row_item.id !== undefined)
            ? String(row_item.id)
            : 'unknown_id'; // tai esim. ''

        // Haetaan luontiaika
        const created_part = row_item.created
            || row_item.created_at
            || row_item.luontiaika
            || null;

        // Rakennetaan siemen:
        // Jos luontiaikaa ei löydy, käytetään vain id:tä
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
                const val_str = (typeof raw_val === 'string')
                    ? raw_val
                    : String(raw_val ?? '');
                const trimmed = val_str.trim();
                if (trimmed) {
                    header_first_letter = trimmed[0];
                }
            }
        }

        // Seurataan, oliko tällä rivillä *oikeaa* image-roolia
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

            // Onko description / details -rooli?
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

                // Käytetäänkö isoa (300px) vai pientä (140px)?
                const useLargeSize = tableHasImageRole;
                // -> true jos taululla on image-rooli

                if (val_str.trim()) {
                    // On jokin URL
                    let image_src = val_str.trim();
                    // Varmistetaan polun alkumuoto
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
                    // Koko sen mukaan, onko iso vai pieni
                    img.style.width = useLargeSize ? '300px' : '140px';
                    img.style.height = useLargeSize ? '300px' : '140px';
                    img.style.objectFit = 'cover';
                    elem_div.appendChild(img);

                } else {
                    // Arvo tyhjä -> luodaan avatar
                    const avatar = await create_seeded_avatar(creation_seed, header_first_letter, useLargeSize);
                    elem_div.appendChild(avatar);
                }
                content_div.appendChild(elem_div);
                continue;
            }

            // Muiden roolien normaali käsittely
            const elem_div = document.createElement('div');
            switch (role) {
                case 'header':
                    elem_div.classList.add('card_header');
                    elem_div.textContent = final_text;
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
        } // end for columns

        // Jos taululla on image-rooli, mutta tämän rivin sarakkeista ei löytynyt imagea,
        // voit halutessasi lisätä "tyhjän" placeholderin, joka pitää layoutin yhtenäisenä.
        if (tableHasImageRole && !found_image_for_this_row) {
            const image_div = document.createElement('div');
            image_div.classList.add('card_image');
            // Iso avatar
            const avatar = await create_seeded_avatar(creation_seed, header_first_letter, true);
            image_div.appendChild(avatar);
            content_div.appendChild(image_div);
        }

        // Jos taululla EI ole image-roolia lainkaan, mutta haluat silti pienen avatarin
        // kaikille:
        // (voit halutessasi laittaa tämän if-lauseen,
        //  jos haluat aina pienen avatarin, kun "image" -roolia ei ole)
        if (!tableHasImageRole) {
            const avatarDiv = document.createElement('div');
            avatarDiv.classList.add('card_image');
            const smallAvatar = await create_seeded_avatar(creation_seed, header_first_letter, false);
            avatarDiv.appendChild(smallAvatar);
            content_div.appendChild(avatarDiv);
        }

        // Lajitellaan description- ja details- entryt
        description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
        details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

        // Luo description-container
        if (description_entries.length > 0) {
            const desc_container = document.createElement('div');
            desc_container.classList.add('card_description_container');
            for (const descObj of description_entries) {
                const d = document.createElement('div');
                d.classList.add('single_description_item');
                d.textContent = descObj.text;
                desc_container.appendChild(d);
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
                detail_item.textContent = detailObj.text;
                details_container.appendChild(detail_item);
            }
            content_div.appendChild(details_container);
        }

        // Lisätään content_div korttiin
        card.appendChild(content_div);

        // Lisätään kortti lopulliseen containeriin
        card_container.appendChild(card);
    } // end data-lenkki

    // Palautetaan korttikontti
    return card_container;
}

/**
 * Lisää annettuun card_containeriin lisää itemejä (kortteja) columns- ja data-listan perusteella.
 * HUOM: Tämä funktio on tässä yhä synkroninen, koska ei kutsu create_seeded_avataria.
 */
export function appendDataToCardView(card_container, columns, data, table_name) {
    // Haetaan data_types localStoragesta (samoin kuin create_card_view tekee)
    let data_types = {};
    try {
        data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
    } catch (e) {
        console.warn("could not parse data_types for table", table_name);
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

            // Jos show_key_on_card = true, näytetään "Label:"
            if (show_key_on_card) {
                labelDiv.textContent = `${formatted_label}:`;
            } else {
                labelDiv.textContent = '';
            }

            const valueDiv = document.createElement('div');
            valueDiv.classList.add('card_value');

            // Arvon muunto stringiksi
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
