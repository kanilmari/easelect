// file: card_view.js
import { update_card_selection } from "../table_view/selection.js";
import { createImageElement, create_seeded_avatar } from "./card_layout.js";
import { open_big_card_modal } from "./open_big_card_modal.js";
import { createModal, showModal } from "../../../common_components/modal/modal_factory.js";
import {
    parseRoleString,
    createKeyValueElement,
    format_column_name,
} from "./card_helpers.js";

/**
 * Lisää annettuun card_containeriin itemejä (kortteja) columns- ja data-listan perusteella.
 * Nyt label (avain) ja value (arvo) erotellaan aina omiin diveihin,
 * mutta show_key_on_card -asetuksen mukaan labelin saa myös piiloon.
 * show_value_on_card-asetus puolestaan määrittää, näytetäänkö itse arvo lainkaan.
 */
export function appendDataToCardView(
    card_container,
    columns,
    data,
    table_name
) {
    let data_types = {};
    try {
        data_types =
            JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
    } catch (error) {
        console.warn(
            "card_view.js: could not parse data_types for table",
            table_name,
            error
        );
    }

    data.forEach((item) => {
        const card = document.createElement("div");
        card.classList.add("card");

        // Asetetaan cardiin data-id attribuutti
        if (item.id !== undefined && item.id !== null) {
            card.setAttribute("data-id", item.id);
        } else {
            console.log("card_view.js: appendDataToCardView(); ei data-id:tä");
        }

        // Valintaruutu
        if (localStorage.getItem("admin_mode") === "true") {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.classList.add("card_checkbox");
            checkbox.addEventListener("change", () =>
                update_card_selection(card)
            );
            card.appendChild(checkbox);
        }

        // Sisältödivi
        const contentDiv = document.createElement("div");
        contentDiv.classList.add("card_content");

        columns.forEach((column) => {
            // Tarkistetaan show_value_on_card
            const showValueOnCard =
                data_types[column]?.show_value_on_card === true;
            if (!showValueOnCard) {
                // Jos arvoa ei haluta näyttää lainkaan, ohitetaan koko pair
                return;
            }

            const pairDiv = document.createElement("div");
            pairDiv.classList.add("card_pair");

            // show_key_on_card vain labelille
            const labelDiv = document.createElement("div");
            labelDiv.classList.add("card_label");
            const showKeyOnCard = data_types[column]?.show_key_on_card === true;
            const formatted_label = format_column_name(column);
            labelDiv.textContent = showKeyOnCard ? formatted_label : "";

            const valueDiv = document.createElement("div");
            valueDiv.classList.add("card_value");

            if (Array.isArray(item[column])) {
                valueDiv.textContent = item[column].join(", ");
                valueDiv.style.whiteSpace = "pre-wrap";
            } else if (
                typeof item[column] === "object" &&
                item[column] !== null
            ) {
                valueDiv.textContent = JSON.stringify(item[column], null, 2);
                valueDiv.style.whiteSpace = "pre-wrap";
            } else {
                const txt = item[column] || "";
                valueDiv.textContent = txt;
                valueDiv.style.whiteSpace = "pre-wrap";
            }

            pairDiv.appendChild(labelDiv);
            pairDiv.appendChild(valueDiv);
            contentDiv.appendChild(pairDiv);
        });

        card.appendChild(contentDiv);
        card_container.appendChild(card);
    });
}

/* OLETUS: seuraavat funktiot on joko olemassa tai tuotava muualta:
   - parseRoleString
   - createKeyValueElement
   - createImageElement
   - create_seeded_avatar
   - createShowMoreLink
   - format_column_name
   - open_big_card_modal
   - update_card_selection
*/

/**
 * Lisää header-elementin korttiin (header-roolia vastaava).
 */
function addHeaderElement(
    val_str,
    label,
    column,
    hasLangKey,
    row_item,
    table_name,
    container
) {
    const elem_div = document.createElement("div");
    elem_div.classList.add("card_header");

    if (hasLangKey) {
        elem_div.setAttribute("data-lang-key", val_str);
    } else {
        const wrapper = document.createElement("div");
        wrapper.classList.add("card_pair");
        const kvElem = createKeyValueElement(
            label,
            val_str,
            column,
            hasLangKey,
            "header_value"
        );
        wrapper.appendChild(kvElem);
        elem_div.appendChild(wrapper);
        elem_div.style.whiteSpace = "pre-wrap";
    }

    // Klikkauksen käsittely
    elem_div.addEventListener("click", (e) => {
        e.preventDefault();
        open_big_card_modal(row_item, table_name);
    });

    container.appendChild(elem_div);
}

/**
 * Lisää username-elementin korttiin (username-roolia vastaava).
 */
function addUsernameElement(val_str, label, column, hasLangKey) {
    const username_div = document.createElement("div");
    username_div.classList.add("card_username");

    // Luodaan ikoni ja teksti
    const iconSvg = createUserIconSvg(); // kutsu apufunktiota

    // Jos kieliavain
    if (hasLangKey) {
        username_div.setAttribute("data-lang-key", val_str);
        username_div.appendChild(iconSvg);
        // Teksti ei näy suoraan, jos lang-key:
        // (jos haluat, voit laittaa fallback-tekstin)
    } else {
        // Asetetaan ikoni + teksti
        username_div.appendChild(iconSvg);
        username_div.appendChild(document.createTextNode(" " + val_str));
    }

    return username_div;
}
// Palauttaa pienen user-ikonin (svg)
function createUserIconSvg() {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    // Aseta katseluikkuna (viewBox) vastaamaan ikonille sopivia arvoja.
    // Tässä esimerkissä: 0..960 leveys, -960..0 korkeus (Material-lähtöinen koordinat.)
    svg.setAttribute("viewBox", "0 -960 960 960");
    svg.style.width = "24px"; // Säädä mielesi mukaan
    svg.style.height = "24px"; // Säädä mielesi mukaan

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute(
        "d",
        "M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T560-640q0-33-23.5-56.5T480-720q-33 0-56.5 23.5T400-640q0 33 23.5 56.5T480-560Z"
    );
    // Voit halutessasi lisätä myös fill-määrittelyn:
    path.setAttribute("fill", "currentColor");

    svg.appendChild(path);
    return svg;
}

/**
 * Lisää kuvan tai avatarin. Klikattaessa kuvaa avautuu isompana modaalissa.
 */
async function addImageOrAvatar(
    val_str,
    tableHasImageRole,
    creation_seed,
    header_first_letter,
    imageContainer
) {
    let foundImage = false;
    const elem_div = document.createElement("div");
    elem_div.classList.add("card_image");

    const useLargeSize = tableHasImageRole;
    if (val_str.trim()) {
        foundImage = true;
        let image_src = val_str.trim();

        // Polun korjaus
        if (
            !image_src.startsWith("http://") &&
            !image_src.startsWith("https://") &&
            !image_src.startsWith("./") &&
            !image_src.startsWith("/")
        ) {
            const match = image_src.match(/^(\d+)_(\d+)_(\d+)\.(\w+)$/);
            if (match) {
                const mainTableId = match[1];
                const mainRowId = match[2];
                image_src = `/media/${mainTableId}/${mainRowId}/${image_src}`;
            } else {
                image_src = "/media/" + image_src;
            }
        }

        // Luodaan kuva
        const blurredImageElement = createImageElement(image_src, useLargeSize);

        // Lisätään klikkauskuuntelija, joka avaa modaalin
        blurredImageElement.addEventListener("click", () => {
            openImageModal(image_src);
        });

        elem_div.appendChild(blurredImageElement);
    } else {
        // Avatar
        const avatar = await create_seeded_avatar(
            creation_seed,
            header_first_letter,
            useLargeSize
        );

        // Lisätään silti klikkauskuuntelija, jos halutaan avata avatar isompana (valinnainen)
        // avatar.addEventListener("click", () => {
        //     openImageModal(someAvatarSrcIfWanted);
        // });

        elem_div.appendChild(avatar);
    }

    imageContainer.appendChild(elem_div);
    return foundImage;
}

/**
 * Luo/avaa modaalin, jossa kuva näkyy isompana.
 */
function openImageModal(image_src) {
    // Luodaan kuvakomponentti modal-sisältöä varten
    const bigImage = document.createElement("img");
    bigImage.src = image_src;
    bigImage.style.maxWidth = "100%";
    bigImage.style.height = "auto";
    bigImage.style.display = "block";
    bigImage.style.margin = "0 auto";

    // Käytetään valmista createModal-funktiota
    const { modal_overlay, modal } = createModal({
        // Halutessa voisi käyttää otsikkoa
        // titlePlainText: "Kuva",
        skipModalTitle: true,
        contentElements: [bigImage],
        width: "auto", // Salli sisällön leveyden mukainen koko
    });

    // Avaa modaalin
    showModal();

    // Halutessa voi logittaa
    console.log("modal avattu klikatulle kuvalle"); 
}


function addDescriptionSection(
    description_entries,
    row_item,
    table_name,
    container
) {
    if (description_entries.length === 0) return;

    // Lajitellaan
    description_entries.sort((a, b) => a.suffix_number - b.suffix_number);

    const desc_container = document.createElement("div");
    desc_container.classList.add("card_description_container");

    for (const descObj of description_entries) {
        const d = document.createElement("div");
        d.classList.add("single_description_item");

        // Luodaan elementti ilman merkkirajoitusta
        const wrapper = createKeyValueElement(
            descObj.label,
            descObj.rawValue,
            descObj.column,
            descObj.hasLangKey,
            "description_value"
        );

        // Lisätään "Näytä enemmän" -linkki
        const valueDiv = wrapper.querySelector(
            '[data-column="' + descObj.column + '"]'
        );
        if (valueDiv) {
            valueDiv.appendChild(document.createTextNode(" "));
            const showMoreLink = createShowMoreLink(row_item, table_name);
            showMoreLink.style.display = "none"; // Piilotetaan linkki aluksi
            valueDiv.appendChild(showMoreLink);
        }

        d.appendChild(wrapper);
        desc_container.appendChild(d);
    }

    container.appendChild(desc_container);
}

// Tarkistetaan DOMin latauksen jälkeen, onko teksti pidempi kuin kaksi riviä
document.addEventListener("DOMContentLoaded", function () {
    const descriptionValues = document.querySelectorAll(".description_value");
    descriptionValues.forEach(function (valueDiv) {
        const showMoreLink = valueDiv.querySelector(".show_more_link");
        if (showMoreLink) {
            const lineHeight = parseInt(
                window.getComputedStyle(valueDiv).lineHeight
            );
            const maxHeight = lineHeight * 2; // Kahden rivin korkeus
            if (valueDiv.scrollHeight > maxHeight) {
                showMoreLink.style.display = "inline"; // Näytä linkki, jos teksti on pidempi
            }
        }
    });
});

// sama tiedosto: addKeywordsSection.js
// tiedosto: addKeywordsSection.js

function addKeywordsSection(keywords_list, row_item, table_name, container) {
    if (keywords_list.length === 0) return;

    const kw_container = document.createElement("div");
    kw_container.classList.add("card_keywords_container");
    kw_container.style.display = "flex";
    kw_container.style.flexWrap = "nowrap";
    kw_container.style.overflow = "hidden";
    kw_container.style.whiteSpace = "nowrap";

    // Rakennetaan avainsanat 
    function renderKeywords() {
        kw_container.innerHTML = "";
        const addedKeywords = [];
        let jättänytPois = false;
    
        // Avainsanojen lisäyslooppi (sama kuin alkuperäisessä koodissa)
        for (const kwObj of keywords_list) {
            const splittedKeywords = kwObj.rawValue
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
    
            for (const singleKeyword of splittedKeywords) {
                const k = document.createElement("div");
                k.style.backgroundColor = "var(--bg_color)";
                k.style.borderRadius = "10px";
                k.style.padding = "1px 3px";
                k.style.margin = "3px";
                k.style.display = "inline-block";
                k.style.whiteSpace = "nowrap";
                k.style.flexShrink = "0";
    
                if (!kwObj.hasLangKey && singleKeyword.length > 100) {
                    const shortText = singleKeyword.slice(0, 100) + "...";
                    const wrapper = createKeyValueElement(
                        kwObj.label,
                        shortText,
                        kwObj.column,
                        kwObj.hasLangKey,
                        "keyword_value"
                    );
                    const valueDiv = wrapper.querySelector(
                        '[data-column="' + kwObj.column + '"]'
                    );
                    if (valueDiv) {
                        valueDiv.appendChild(document.createTextNode(" "));
                        valueDiv.appendChild(
                            createShowMoreLink(row_item, table_name)
                        );
                    }
                    k.appendChild(wrapper);
                } else {
                    const wrapper = createKeyValueElement(
                        kwObj.label,
                        singleKeyword,
                        kwObj.column,
                        kwObj.hasLangKey,
                        "keyword_value"
                    );
                    k.appendChild(wrapper);
                }
    
                kw_container.appendChild(k);
                addedKeywords.push(k);
    
                if (kw_container.scrollWidth > kw_container.clientWidth) {
                    kw_container.removeChild(k);
                    addedKeywords.pop();
                    jättänytPois = true;
                    break;
                }
            }
            if (kw_container.scrollWidth > kw_container.clientWidth) {
                break;
            }
        }
    
        const totalKeywords = keywords_list.reduce(
            (acc, kwObj) => acc + kwObj.rawValue.split(",").filter(Boolean).length,
            0
        );
    }

    // Debounce-käsittelijä
    let resizeTimer = null;
    function onResize() {
        if (resizeTimer) {
            clearTimeout(resizeTimer);
        }
        // Odotetaan hetki ennen uudelleenrivitystä
        resizeTimer = setTimeout(() => {
            renderKeywords();
        }, 50);
    }

    // Kutsutaan ensin
    renderKeywords();

    // Kuunnellaan ikkunan resize
    window.addEventListener("resize", onResize);

    // Lopuksi lisätään container
    container.appendChild(kw_container);
}


/**
 * Lisää details-osiot korttiin (details ja details_link) ja välttää koodin toistamista.
 */
function addDetailsSection(details_entries, row_item, table_name, container) {
    if (details_entries.length === 0) return;

    details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

    const mid_point = Math.ceil(details_entries.length / 2);
    const left_details = details_entries.slice(0, mid_point);
    const right_details = details_entries.slice(mid_point);

    const details_container = document.createElement("div");
    details_container.classList.add("card_details_container");

    details_container.appendChild(createDetailsTable(left_details, row_item, table_name));
    details_container.appendChild(createDetailsTable(right_details, row_item, table_name));

    container.appendChild(details_container);
}

/**
 * Luo details-taulukon annetulle details-listalle.
 */
function createDetailsTable(detailsList, row_item, table_name) {
    const table = document.createElement("table");
    table.classList.add("card_table");

    detailsList.forEach((detailObj) => {
        const row = document.createElement("tr");
        const key_cell = document.createElement("th");
        key_cell.textContent = detailObj.label;

        const value_cell = document.createElement("td");

        if (detailObj.isLink) {
            const linkValue = detailObj.rawValue.trim();

            // Yritetään parsia <a> -elementti jos se on suoraan HTML:nä
            if (linkValue.startsWith("<a ")) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(linkValue, "text/html");
                const anchor = doc.querySelector("a");
                if (anchor) {
                    const actualHref = anchor.getAttribute("href");
                    const linkText = anchor.textContent || actualHref;
                    const newLink = document.createElement("a");
                    newLink.href = actualHref;
                    newLink.target = "_blank";
                    newLink.textContent = linkText;
                    value_cell.appendChild(newLink);
                } else {
                    // Jos parsinta epäonnistuu, luodaan linkki suoraan
                    const fallbackLink = document.createElement("a");
                    fallbackLink.href = linkValue;
                    fallbackLink.target = "_blank";
                    fallbackLink.textContent = linkValue;
                    value_cell.appendChild(fallbackLink);
                }
            } else {
                // Muuten luodaan linkki raakadatan perusteella
                const link = document.createElement("a");
                link.href = linkValue;
                link.target = "_blank";
                link.textContent = linkValue;
                value_cell.appendChild(link);
            }

        } else if (!detailObj.hasLangKey && detailObj.rawValue.length > 80) {
            const truncatedText = detailObj.rawValue.slice(0, 80) + "...";
            value_cell.textContent = truncatedText + " ";
            value_cell.appendChild(createShowMoreLink(row_item, table_name));
        } else {
            value_cell.textContent = detailObj.rawValue;
        }

        row.appendChild(key_cell);
        row.appendChild(value_cell);
        table.appendChild(row);
    });

    return table;
}

function createShowMoreLink(row_item, table_name) {
    const link = document.createElement("a");
    link.href = "#";
    link.classList.add("show_more_link");
    link.setAttribute("data-lang-key", "show_more");
    link.addEventListener("click", (e) => {
        e.preventDefault();
        open_big_card_modal(row_item, table_name);
    });
    return link;
}

/**
 * Asynkroninen create_card_view: rakentaa kortit data-taulukosta.
 * Roolit: header, image, description, details, keywords, username,
 * details_link, kieliavain "lang-key" jne.
 *
 * show_key_on_card = piilottaako labelin,
 * show_value_on_card = piilottaako arvon.
 */
export async function create_card_view(columns, data, table_name) {
    const card_container = document.createElement("div");
    card_container.classList.add("card_container");

    let data_types = {};
    try {
        data_types =
            JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
    } catch (error) {
        console.warn("could not parse data_types for table", table_name, error);
    }

    // Järjestellään sarakkeet roolien perusteella
    const sorted_columns = [...columns];
    sorted_columns.sort((colA, colB) => {
        const a_card_element = data_types[colA]?.card_element || "";
        const b_card_element = data_types[colB]?.card_element || "";
        if (a_card_element && !b_card_element) return -1;
        if (!a_card_element && b_card_element) return 1;
        return 0;
    });

    // Tarkistetaan, onko image-roolia
    const tableHasImageRole = sorted_columns.some((col) => {
        const { baseRoles } = parseRoleString(
            data_types[col]?.card_element || ""
        );
        return baseRoles.includes("image");
    });

    // Käydään data-rivit läpi
    for (const row_item of data) {
        const card = document.createElement("div");
        card.classList.add("card");

        if (row_item.id !== undefined && row_item.id !== null) {
            card.setAttribute("data-id", row_item.id);
        } else {
            console.log("card_view.js: create_card_view(); ei data-id:tä");
        }

        // Checkbox
        if (localStorage.getItem("admin_mode") === "true") {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.classList.add("card_checkbox");
            checkbox.addEventListener("change", () =>
                update_card_selection(card)
            );
            card.appendChild(checkbox);
        }

        // Kortin pääosat
        const card_content_div = document.createElement("div");
        card_content_div.classList.add("card_content");

        const card_image_content = document.createElement("div");
        card_image_content.classList.add("card_image_content");

        const card_text_content = document.createElement("div");
        card_text_content.classList.add("card_text_content");

        if (tableHasImageRole) {
            card_content_div.classList.add("card_content_large");
        } else {
            card_content_div.classList.add("card_content_small");
        }

        // Kasaamme dataa erilaisiin listohin
        const details_entries = [];
        const description_entries = [];
        const keywords_list = [];

        let header_first_letter = "";
        const id_part = row_item.id !== undefined ? String(row_item.id) : "x";
        const created_part =
            row_item.created ||
            row_item.created_at ||
            row_item.luontiaika ||
            null;
        const creation_seed = created_part
            ? `${id_part}_${created_part}`
            : id_part;

        // Haetaan headerin eka kirjain
        for (const col of sorted_columns) {
            const roleFull = data_types[col]?.card_element || "";
            const { baseRoles } = parseRoleString(roleFull);
            if (baseRoles.includes("header")) {
                const raw_val = row_item[col];
                const val_str =
                    typeof raw_val === "string"
                        ? raw_val
                        : String(raw_val ?? "");
                if (val_str.trim()) {
                    header_first_letter = val_str.trim()[0];
                }
            }
        }

        let found_image_for_this_row = false;
        // Voidaan väliaikaisesti tallettaa username-elementti
        let usernameElement = null;

        // Käydään sarakkeet
        for (const column of sorted_columns) {
            const raw_val = row_item[column];
            let val_str = "";
            if (raw_val !== null && raw_val !== undefined) {
                val_str =
                    typeof raw_val === "string" ? raw_val : String(raw_val);
            }

            // show_value_on_card?
            if (data_types[column]?.show_value_on_card !== true) {
                continue;
            }

            const roleFull = data_types[column]?.card_element || "";
            const { baseRoles, hasLangKey } = parseRoleString(roleFull);
            const showKeyOnCard = data_types[column]?.show_key_on_card === true;
            const column_label = showKeyOnCard
                ? format_column_name(column)
                : "";

            // Ei roolia -> tavallinen teksti
            if (baseRoles.length === 0) {
                if (val_str.trim()) {
                    const wrapper = document.createElement("div");
                    wrapper.classList.add("card_pair");
                    const kvElem = createKeyValueElement(
                        column_label,
                        val_str,
                        column,
                        hasLangKey,
                        "card_value"
                    );
                    wrapper.appendChild(kvElem);
                    card_text_content.appendChild(wrapper);
                }
                continue;
            }

            // Käsitellään kukin rooli
            for (const singleRole of baseRoles) {
                if (/^hidden(\d+)?$/.test(singleRole)) {
                    continue;
                }
                if (/^description(\d+)?$/.test(singleRole) && val_str.trim()) {
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
                        column,
                    });
                    continue;
                }
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
                        column,
                        isLink: false,
                    });
                    continue;
                }
                if (/^details_link(\d+)?$/.test(singleRole) && val_str.trim()) {
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
                        isLink: true,
                    });
                    continue;
                }
                if (singleRole === "keywords" && val_str.trim()) {
                    keywords_list.push({
                        column,
                        rawValue: val_str,
                        label: column_label,
                        hasLangKey,
                    });
                    continue;
                }
                if (singleRole === "image") {
                    found_image_for_this_row = true;
                    await addImageOrAvatar(
                        val_str,
                        tableHasImageRole,
                        creation_seed,
                        header_first_letter,
                        card_image_content
                    );
                    continue;
                }
                if (singleRole === "header") {
                    addHeaderElement(
                        val_str,
                        column_label,
                        column,
                        hasLangKey,
                        row_item,
                        table_name,
                        card_text_content
                    );
                    continue;
                }
                if (singleRole === "username") {
                    // Luodaan elementti, mutta EI lisätä heti text_contentiin
                    usernameElement = addUsernameElement(
                        val_str,
                        column_label,
                        column,
                        hasLangKey
                    );
                    continue;
                }
                // Tuntematon rooli -> lisätään perus tekstikenttänä
                if (val_str.trim()) {
                    const wrapper = document.createElement("div");
                    wrapper.classList.add("card_pair");
                    const kvElem = createKeyValueElement(
                        column_label,
                        val_str,
                        column,
                        hasLangKey,
                        "card_details"
                    );
                    wrapper.appendChild(kvElem);
                    card_text_content.appendChild(wrapper);
                }
            }
        }

        // Jos taulussa on image-rooli, mutta ei kuvadataa -> avatar isona
        if (tableHasImageRole && !found_image_for_this_row) {
            const image_div = document.createElement("div");
            image_div.classList.add("card_image");
            const avatar = await create_seeded_avatar(
                creation_seed,
                header_first_letter,
                true
            );
            image_div.appendChild(avatar);
            card_image_content.appendChild(image_div);
        }
        // Ei image-roolia -> pieni avatar
        if (!tableHasImageRole) {
            const avatarDiv = document.createElement("div");
            avatarDiv.classList.add("card_image");
            const smallAvatar = await create_seeded_avatar(
                creation_seed,
                header_first_letter,
                false
            );
            avatarDiv.appendChild(smallAvatar);
            card_image_content.appendChild(avatarDiv);
        }

        // Lisätään description-osat
        addDescriptionSection(
            description_entries,
            row_item,
            table_name,
            card_text_content
        );
        // Lisätään keywords-osat
        addKeywordsSection(
            keywords_list,
            row_item,
            table_name,
            card_text_content
        );
        // Lisätään details-osat
        addDetailsSection(
            details_entries,
            row_item,
            table_name,
            card_text_content
        );

        // Footer
        const footer_div = document.createElement("div");
        footer_div.classList.add("card_footer");

        // Jos meillä on usernameElement, lisätään se footerin vasemmalle
        if (usernameElement) {
            footer_div.appendChild(usernameElement);
        }

        const footer_button = document.createElement("button");
        footer_button.setAttribute("data-lang-key", "show_more");
        footer_button.addEventListener("click", (e) => {
            e.preventDefault();
            open_big_card_modal(row_item, table_name);
        });
        // Lisätään nappi footerin "oikealle"
        footer_div.appendChild(footer_button);

        card_text_content.appendChild(footer_div);

        card_content_div.appendChild(card_image_content);
        card_content_div.appendChild(card_text_content);
        card.appendChild(card_content_div);
        card_container.appendChild(card);
    }

    return card_container;
}

// // file: card_view.js
// import { update_card_selection } from "../table_view/selection.js";
// import { createImageElement, create_seeded_avatar } from "./card_layout.js";
// import { open_big_card_modal } from "./open_big_card_modal.js";
// import {
//     parseRoleString,
//     createKeyValueElement,
//     format_column_name,
// } from "./card_helpers.js";

// /**
//  * Lisää annettuun card_containeriin itemejä (kortteja) columns- ja data-listan perusteella.
//  * Nyt label (avain) ja value (arvo) erotellaan aina omiin diveihin,
//  * mutta show_key_on_card -asetuksen mukaan labelin saa myös piiloon.
//  * show_value_on_card-asetus puolestaan määrittää, näytetäänkö itse arvo lainkaan.
//  */
// export function appendDataToCardView(
//     card_container,
//     columns,
//     data,
//     table_name
// ) {
//     let data_types = {};
//     try {
//         data_types =
//             JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
//     } catch (error) {
//         console.warn(
//             "card_view.js: could not parse data_types for table",
//             table_name,
//             error
//         );
//     }

//     data.forEach((item) => {
//         const card = document.createElement("div");
//         card.classList.add("card");

//         // Asetetaan cardiin data-id attribuutti
//         if (item.id !== undefined && item.id !== null) {
//             card.setAttribute("data-id", item.id);
//         } else {
//             console.log("card_view.js: appendDataToCardView(); ei data-id:tä");
//         }

//         // Valintaruutu
//         const checkbox = document.createElement("input");
//         checkbox.type = "checkbox";
//         checkbox.classList.add("card_checkbox");
//         checkbox.addEventListener("change", () => update_card_selection(card));
//         card.appendChild(checkbox);

//         // Sisältödivi
//         const contentDiv = document.createElement("div");
//         contentDiv.classList.add("card_content");

//         columns.forEach((column) => {
//             // Tarkistetaan show_value_on_card
//             const showValueOnCard =
//                 data_types[column]?.show_value_on_card === true;
//             if (!showValueOnCard) {
//                 // Jos arvoa ei haluta näyttää lainkaan, ohitetaan koko pair
//                 return;
//             }

//             const pairDiv = document.createElement("div");
//             pairDiv.classList.add("card_pair");

//             // show_key_on_card vain labelille
//             const labelDiv = document.createElement("div");
//             labelDiv.classList.add("card_label");
//             const showKeyOnCard = data_types[column]?.show_key_on_card === true;
//             const formatted_label = format_column_name(column);
//             labelDiv.textContent = showKeyOnCard ? formatted_label : "";

//             const valueDiv = document.createElement("div");
//             valueDiv.classList.add("card_value");

//             if (Array.isArray(item[column])) {
//                 valueDiv.textContent = item[column].join(", ");
//                 valueDiv.style.whiteSpace = "pre-wrap";
//             } else if (
//                 typeof item[column] === "object" &&
//                 item[column] !== null
//             ) {
//                 valueDiv.textContent = JSON.stringify(item[column], null, 2);
//                 valueDiv.style.whiteSpace = "pre-wrap";
//             } else {
//                 const txt = item[column] || "";
//                 valueDiv.textContent = txt;
//                 valueDiv.style.whiteSpace = "pre-wrap";
//             }

//             pairDiv.appendChild(labelDiv);
//             pairDiv.appendChild(valueDiv);
//             contentDiv.appendChild(pairDiv);
//         });

//         card.appendChild(contentDiv);
//         card_container.appendChild(card);
//     });
// }

// /**
//  * Asynkroninen create_card_view: rakentaa kortit data-taulukosta.
//  * Roolit: header, image, description, details, keywords, username,
//  * details_link, kieliavain "lang-key" jne.
//  *
//  * show_key_on_card = piilottaako labelin,
//  * show_value_on_card = piilottaako arvon.
//  */
// export async function create_card_view(columns, data, table_name) {
//     const card_container = document.createElement("div");
//     card_container.classList.add("card_container");

//     let data_types = {};
//     try {
//         data_types =
//             JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};
//     } catch (error) {
//         console.warn("could not parse data_types for table", table_name, error);
//     }

//     // Järjestellään sarakkeet roolien perusteella
//     const sorted_columns = [...columns];
//     sorted_columns.sort((colA, colB) => {
//         const a_card_element = data_types[colA]?.card_element || "";
//         const b_card_element = data_types[colB]?.card_element || "";
//         if (a_card_element && !b_card_element) return -1;
//         if (!a_card_element && b_card_element) return 1;
//         return 0;
//     });

//     // Katsotaan, löytyykö taululta 'image'-roolia
//     const tableHasImageRole = sorted_columns.some((col) => {
//         const { baseRoles } = parseRoleString(
//             data_types[col]?.card_element || ""
//         );
//         return baseRoles.includes("image");
//     });

//     // Käydään data-rivit läpi
//     for (const row_item of data) {
//         const card = document.createElement("div");
//         card.classList.add("card");

//         if (row_item.id !== undefined && row_item.id !== null) {
//             card.setAttribute("data-id", row_item.id);
//         } else {
//             console.log("card_view.js: create_card_view(); ei data-id:tä");
//         }

//         // Checkbox
//         const checkbox = document.createElement("input");
//         checkbox.type = "checkbox";
//         checkbox.classList.add("card_checkbox");
//         checkbox.addEventListener("change", () => update_card_selection(card));
//         card.appendChild(checkbox);

//         // Sisällön container
//         const card_content_div = document.createElement("div");
//         card_content_div.classList.add("card_content");
//         if (tableHasImageRole) {
//             card_content_div.classList.add("card_content_large");
//         } else {
//             card_content_div.classList.add("card_content_small");
//         }

//         // Koontilistat
//         const details_entries = [];
//         const description_entries = [];
//         const keywords_list = [];

//         // Headerin eka kirjain avatarille
//         let header_first_letter = "";
//         const id_part =
//             row_item.id !== undefined ? String(row_item.id) : "unknown_id";

//         // Haetaan luontiaika (seed)
//         const created_part =
//             row_item.created ||
//             row_item.created_at ||
//             row_item.luontiaika ||
//             null;
//         let creation_seed;
//         if (created_part) {
//             creation_seed = `${id_part}_${created_part}`;
//         } else {
//             creation_seed = id_part;
//         }

//         // Poimitaan mahdollinen ensimmäinen header-kirjain
//         for (const col of sorted_columns) {
//             const roleFull = data_types[col]?.card_element || "";
//             const { baseRoles } = parseRoleString(roleFull);
//             if (baseRoles.includes("header")) {
//                 const raw_val = row_item[col];
//                 const val_str =
//                     typeof raw_val === "string"
//                         ? raw_val
//                         : String(raw_val ?? "");
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
//             let val_str = "";
//             if (raw_val !== null && raw_val !== undefined) {
//                 val_str =
//                     typeof raw_val === "string" ? raw_val : String(raw_val);
//             }

//             // Uusi logiikka: kunnioitetaan show_value_on_card
//             const showValueOnCard =
//                 data_types[column]?.show_value_on_card === true;
//             if (!showValueOnCard) {
//                 // Emme näytä arvoa lainkaan
//                 continue;
//             }

//             const roleFull = data_types[column]?.card_element || "";
//             const { baseRoles, hasLangKey } = parseRoleString(roleFull);

//             // show_key_on_card ohjaa vain labelin näkyvyyttä
//             const showKeyOnCard = data_types[column]?.show_key_on_card === true;
//             const column_label = showKeyOnCard
//                 ? format_column_name(column)
//                 : "";

//             // Jos ei rooleja, tulkitaan tavallisena tekstinä
//             if (baseRoles.length === 0) {
//                 if (val_str.trim()) {
//                     const wrapper = document.createElement("div");
//                     wrapper.classList.add("card_pair");
//                     const kvElem = createKeyValueElement(
//                         column_label,
//                         val_str,
//                         column,
//                         hasLangKey,
//                         "card_value"
//                     );
//                     wrapper.appendChild(kvElem);
//                     card_content_div.appendChild(wrapper);
//                 }
//                 continue;
//             }

//             // Käsitellään kukin rooli
//             for (const singleRole of baseRoles) {
//                 // hidden
//                 if (/^hidden(\d+)?$/.test(singleRole) && val_str.trim()) {
//                     // Ei näytetä eikä tallenneta
//                     continue;
//                 }

//                 // description
//                 if (/^description(\d+)?$/.test(singleRole) && val_str.trim()) {
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
//                         column,
//                     });
//                     continue;
//                 }

//                 // details
//                 //  -- poistettu "if (!showKeyOnCard) continue;" täältä
//                 if (/^details(\d+)?$/.test(singleRole) && val_str.trim()) {
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
//                         column,
//                         isLink: false,
//                     });
//                     continue;
//                 }

//                 // details_link
//                 //  -- poistettu "if (!showKeyOnCard) continue;" täältäkin
//                 if (/^details_link(\d+)?$/.test(singleRole) && val_str.trim()) {
//                     let suffix_number = Number.MAX_SAFE_INTEGER;
//                     const match = singleRole.match(/^details_link(\d+)?$/);
//                     if (match && match[1]) {
//                         suffix_number = parseInt(match[1], 10);
//                     }
//                     details_entries.push({
//                         suffix_number,
//                         rawValue: val_str,
//                         label: column_label,
//                         hasLangKey,
//                         column,
//                         isLink: true,
//                     });
//                     continue;
//                 }

//                 // keywords
//                 if (singleRole === "keywords" && val_str.trim()) {
//                     keywords_list.push({
//                         column,
//                         rawValue: val_str,
//                         label: column_label,
//                         hasLangKey,
//                     });
//                     continue;
//                 }

//                 // image
//                 if (singleRole === "image") {
//                     found_image_for_this_row = true;
//                     const elem_div = document.createElement("div");
//                     elem_div.classList.add("card_image");

//                     const useLargeSize = tableHasImageRole;
//                     if (val_str.trim()) {
//                         let image_src = val_str.trim();
//                         // Polun korjaus
//                         if (
//                             !image_src.startsWith("http://") &&
//                             !image_src.startsWith("https://") &&
//                             !image_src.startsWith("./") &&
//                             !image_src.startsWith("/")
//                         ) {
//                             const match = image_src.match(
//                                 /^(\d+)_(\d+)_(\d+)\.(\w+)$/
//                             );
//                             if (match) {
//                                 const mainTableId = match[1];
//                                 const mainRowId = match[2];
//                                 image_src = `/media/${mainTableId}/${mainRowId}/${image_src}`;
//                             } else {
//                                 image_src = "/media/" + image_src;
//                             }
//                         }
//                         const blurredImageElement = createImageElement(
//                             image_src,
//                             useLargeSize
//                         );
//                         elem_div.appendChild(blurredImageElement);
//                     } else {
//                         // Avatar
//                         const avatar = await create_seeded_avatar(
//                             creation_seed,
//                             header_first_letter,
//                             useLargeSize
//                         );
//                         elem_div.appendChild(avatar);
//                     }
//                     card_content_div.appendChild(elem_div);
//                     continue;
//                 }

//                 // header
//                 if (singleRole === "header") {
//                     const elem_div = document.createElement("div");
//                     elem_div.classList.add("card_header");
//                     if (hasLangKey) {
//                         elem_div.setAttribute("data-lang-key", val_str);
//                     } else {
//                         // Avain–arvo -erittely, piilotetaan avain jos showKeyOnCard=false
//                         const wrapper = document.createElement("div");
//                         wrapper.classList.add("card_pair");
//                         const kvElem = createKeyValueElement(
//                             column_label,
//                             val_str,
//                             column,
//                             hasLangKey,
//                             "header_value"
//                         );
//                         wrapper.appendChild(kvElem);
//                         elem_div.appendChild(wrapper);
//                         elem_div.style.whiteSpace = "pre-wrap";
//                     }
//                     elem_div.addEventListener("click", (e) => {
//                         e.preventDefault();
//                         open_big_card_modal(row_item, table_name);
//                     });
//                     card_content_div.appendChild(elem_div);
//                     continue;
//                 }

//                 // username
//                 if (singleRole === "username") {
//                     const elem_div = document.createElement("div");
//                     elem_div.classList.add("card_username");
//                     if (hasLangKey) {
//                         elem_div.setAttribute("data-lang-key", val_str);
//                     } else {
//                         // Aina avain–arvo -erittely
//                         const wrapper = document.createElement("div");
//                         wrapper.classList.add("card_pair");
//                         const kvElem = createKeyValueElement(
//                             column_label,
//                             val_str,
//                             column,
//                             hasLangKey,
//                             "username_value"
//                         );
//                         wrapper.appendChild(kvElem);
//                         elem_div.appendChild(wrapper);
//                         elem_div.style.whiteSpace = "pre-wrap";
//                     }
//                     card_content_div.appendChild(elem_div);
//                     continue;
//                 }

//                 // jokin tuntematon rooli => perus tekstikenttä avain-arvo -erottelulla
//                 if (val_str.trim()) {
//                     const wrapper = document.createElement("div");
//                     wrapper.classList.add("card_pair");

//                     const kvElem = createKeyValueElement(
//                         column_label,
//                         val_str,
//                         column,
//                         hasLangKey,
//                         "card_details"
//                     );
//                     wrapper.appendChild(kvElem);

//                     card_content_div.appendChild(wrapper);
//                 }
//             }
//         }

//         // Jos taululla on image-rooli, mutta ei kuvadataa -> avatar
//         if (tableHasImageRole && !found_image_for_this_row) {
//             const image_div = document.createElement("div");
//             image_div.classList.add("card_image");
//             const avatar = await create_seeded_avatar(
//                 creation_seed,
//                 header_first_letter,
//                 true
//             );
//             image_div.appendChild(avatar);
//             card_content_div.appendChild(image_div);
//         }

//         // Jos taululla EI ole image-roolia -> pieni avatar
//         if (!tableHasImageRole) {
//             const avatarDiv = document.createElement("div");
//             avatarDiv.classList.add("card_image");
//             const smallAvatar = await create_seeded_avatar(
//                 creation_seed,
//                 header_first_letter,
//                 false
//             );
//             avatarDiv.appendChild(smallAvatar);
//             card_content_div.appendChild(avatarDiv);
//         }

//         // Lajitellaan ja lisätään description-entries
//         description_entries.sort((a, b) => a.suffix_number - b.suffix_number);
//         if (description_entries.length > 0) {
//             const desc_container = document.createElement("div");
//             desc_container.classList.add("card_description_container");

//             for (const descObj of description_entries) {
//                 const d = document.createElement("div");
//                 d.classList.add("single_description_item");

//                 if (!descObj.hasLangKey) {
//                     const rawLength = descObj.rawValue.length;
//                     if (rawLength > 500) {
//                         const shortText =
//                             descObj.rawValue.slice(0, 500) + "...";
//                         const wrapper = createKeyValueElement(
//                             descObj.label,
//                             shortText,
//                             descObj.column,
//                             descObj.hasLangKey,
//                             "description_value"
//                         );

//                         // Linkki heti lyhennetyn tekstin jatkoksi
//                         const valueDiv = wrapper.querySelector(
//                             '[data-column="' + descObj.column + '"]'
//                         );
//                         if (valueDiv) {
//                             valueDiv.appendChild(document.createTextNode(" "));
//                             valueDiv.appendChild(
//                                 createShowMoreLink(row_item, table_name)
//                             );
//                         }
//                         d.appendChild(wrapper);
//                     } else {
//                         const wrapper = createKeyValueElement(
//                             descObj.label,
//                             descObj.rawValue,
//                             descObj.column,
//                             descObj.hasLangKey,
//                             "description_value"
//                         );
//                         d.appendChild(wrapper);
//                     }
//                 } else {
//                     const wrapper = createKeyValueElement(
//                         descObj.label,
//                         descObj.rawValue,
//                         descObj.column,
//                         descObj.hasLangKey,
//                         "description_value"
//                     );
//                     d.appendChild(wrapper);
//                 }
//                 desc_container.appendChild(d);
//             }
//             card_content_div.appendChild(desc_container);
//         }

//         // keywords-list
//         if (keywords_list.length > 0) {
//             const kw_container = document.createElement("div");
//             kw_container.classList.add("card_keywords_container");
//             for (const kwObj of keywords_list) {
//                 const k = document.createElement("div");
//                 k.classList.add("single_keyword_item");

//                 // Jos ei kieliavain, lyhennetään pitkät keywordit ja näytetään “Näytä lisää”
//                 if (!kwObj.hasLangKey && kwObj.rawValue.length > 160) {
//                     const shortText = kwObj.rawValue.slice(0, 160) + "...";
//                     const wrapper = createKeyValueElement(
//                         kwObj.label,
//                         shortText,
//                         kwObj.column,
//                         kwObj.hasLangKey,
//                         "keyword_value"
//                     );

//                     const valueDiv = wrapper.querySelector(
//                         '[data-column="' + kwObj.column + '"]'
//                     );
//                     if (valueDiv) {
//                         valueDiv.appendChild(document.createTextNode(" "));
//                         valueDiv.appendChild(
//                             createShowMoreLink(row_item, table_name)
//                         );
//                     }
//                     k.appendChild(wrapper);
//                 } else {
//                     // Näytetään koko keyword
//                     const wrapper = createKeyValueElement(
//                         kwObj.label,
//                         kwObj.rawValue,
//                         kwObj.column,
//                         kwObj.hasLangKey,
//                         "keyword_value"
//                     );
//                     k.appendChild(wrapper);
//                 }

//                 kw_container.appendChild(k);
//             }
//             card_content_div.appendChild(kw_container);
//         }

//         // Käsitellään details-entries (nyt myös details_link -merkinnät)
//         details_entries.sort((a, b) => a.suffix_number - b.suffix_number);
//         if (details_entries.length > 0) {
//             // Jaetaan yksityiskohdat kahteen osaan
//             const mid_point = Math.ceil(details_entries.length / 2);
//             const left_details = details_entries.slice(0, mid_point);
//             const right_details = details_entries.slice(mid_point);

//             // Luodaan vasen taulukko
//             const left_table = document.createElement("table");
//             left_table.classList.add("card_table");

//             left_details.forEach((detailObj) => {
//                 const row = document.createElement("tr");

//                 const key_cell = document.createElement("th");
//                 key_cell.textContent = detailObj.label;

//                 const value_cell = document.createElement("td");
//                 if (detailObj.isLink) {
//                     const link = document.createElement("a");
//                     link.href = detailObj.rawValue.trim();
//                     link.target = "_blank";
//                     link.textContent = detailObj.rawValue.trim();
//                     value_cell.appendChild(link);
//                 } else if (
//                     !detailObj.hasLangKey &&
//                     detailObj.rawValue.length > 80
//                 ) {
//                     const truncatedText =
//                         detailObj.rawValue.slice(0, 80) + "...";
//                     value_cell.textContent = truncatedText + " ";
//                     value_cell.appendChild(
//                         createShowMoreLink(row_item, table_name)
//                     );
//                 } else {
//                     value_cell.textContent = detailObj.rawValue;
//                 }

//                 row.appendChild(key_cell);
//                 row.appendChild(value_cell);
//                 left_table.appendChild(row);
//             });

//             // Luodaan oikea taulukko
//             const right_table = document.createElement("table");
//             right_table.classList.add("card_table");

//             right_details.forEach((detailObj) => {
//                 const row = document.createElement("tr");

//                 const key_cell = document.createElement("th");
//                 key_cell.textContent = detailObj.label;

//                 const value_cell = document.createElement("td");
//                 if (detailObj.isLink) {
//                     const link = document.createElement("a");
//                     link.href = detailObj.rawValue.trim();
//                     link.target = "_blank";
//                     link.textContent = detailObj.rawValue.trim();
//                     value_cell.appendChild(link);
//                 } else if (
//                     !detailObj.hasLangKey &&
//                     detailObj.rawValue.length > 80
//                 ) {
//                     const truncatedText =
//                         detailObj.rawValue.slice(0, 80) + "...";
//                     value_cell.textContent = truncatedText + " ";
//                     value_cell.appendChild(
//                         createShowMoreLink(row_item, table_name)
//                     );
//                 } else {
//                     value_cell.textContent = detailObj.rawValue;
//                 }

//                 row.appendChild(key_cell);
//                 row.appendChild(value_cell);
//                 right_table.appendChild(row);
//             });

//             // Luodaan kontti, joka pitää taulukot vierekkäin
//             const details_container = document.createElement("div");
//             details_container.classList.add("card_details_container");

//             details_container.appendChild(left_table);
//             details_container.appendChild(right_table);
//             card_content_div.appendChild(details_container);
//         }

//         // Kortin footer
//         const footer_div = document.createElement("div");
//         footer_div.classList.add("card_footer");

//         const footer_button = document.createElement("button");
//         footer_button.textContent = "Avaa modal";
//         footer_button.addEventListener("click", (e) => {
//             e.preventDefault();
//             open_big_card_modal(row_item, table_name);
//         });
//         footer_div.appendChild(footer_button);

//         card_content_div.appendChild(footer_div);
//         card.appendChild(card_content_div);
//         card_container.appendChild(card);
//     }

//     return card_container;
// }

// function createShowMoreLink(row_item, table_name) {
//     const link = document.createElement("a");
//     link.href = "#";
//     link.classList.add("show_more_link");
//     link.setAttribute("data-lang-key", "show_more");
//     link.addEventListener("click", (e) => {
//         e.preventDefault();
//         open_big_card_modal(row_item, table_name);
//     });
//     return link;
// }