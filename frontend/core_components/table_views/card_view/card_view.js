// file: card_view.js
import { update_card_selection } from "../table_view/selection.js";
import { createImageElement, create_seeded_avatar } from "./card_layout.js";
import { open_big_card_modal } from "./open_big_card_modal.js";
import {
    createModal,
    showModal,
} from "../../../common_components/modal/modal_factory.js";
import {
    parseRoleString,
    createKeyValueElement,
    format_column_name,
} from "./card_helpers.js";
import { count_this_function } from "../../dev_tools/function_counter.js";
import { makeColumnClass } from "../../filterbar/column_visibility.js";

localStorage.setItem("hide_fields_on_cards", "false");

export async function appendDataToCardView(
    card_container,
    columns,
    data,
    table_name
) {
    let data_types =
        JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};

    for (const item of data) {
        const card = await createSingleCard(
            item,
            columns,
            table_name,
            data_types
        );
        card_container.appendChild(card);
    }
}

/**
 * Luo yhden kortin annetun rivin datasta *ja* lisää jokaiselle
 * sarakkeen mukaan nimetty luokka (`column_<table>_<column>`),
 * jotta column_visibility.js voi näyttää/piilottaa myös korttien
 * elementtejä.  Kaikkiin luotuihin elementteihin asetetaan myös
 * data-hide-field-on-card ("true"/"false") käyttäjän asetuksen mukaan.
 */
async function createSingleCard(row_item, columns, table_name, data_types) {
    /* --- FUNKTIOLASKURI ---------------------------------------- */
    count_this_function("createSingleCard");

    /* --- PIILOTUS-ASETUS --------------------------------------- */
    const hideFieldsOnCardsString =
        localStorage.getItem("hide_fields_on_cards") === "true" ? "true" : "false";
    const setHideDataset = (el) =>
        (el.dataset.hideFieldOnCard = hideFieldsOnCardsString);

    /* --- ADMIN-TARKISTUS --------------------------------------- */
    const isAdmin = localStorage.getItem("admin_mode") === "true";

    /* --- ULKOKUORI --------------------------------------------- */
    const card = document.createElement("div");
    card.classList.add("card");
    setHideDataset(card);                                      // ★
    if (row_item.id != null) card.dataset.id = row_item.id;

    /* --- VALINTARUUTU (vain admineille) ----------------------- */
    if (isAdmin) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.classList.add("card_checkbox");
        cb.addEventListener("change", () => update_card_selection(card));
        setHideDataset(cb);                                     // ★
        card.appendChild(cb);
    }

    /* --- SISÄISET RAKENTEET ----------------------------------- */
    const card_content_div = document.createElement("div");
    card_content_div.classList.add("card_content");
    setHideDataset(card_content_div);                           // ★

    const tableHasImageRole = columns.some((c) =>
        parseRoleString(data_types[c]?.card_element || "").baseRoles.includes(
            "image"
        )
    );
    card_content_div.classList.add(
        tableHasImageRole ? "card_content_large" : "card_content_small"
    );

    const card_body_div = document.createElement("div");
    card_body_div.classList.add("card_body");
    setHideDataset(card_body_div);                              // ★

    const card_image_content = document.createElement("div");
    card_image_content.classList.add("card_image_content");
    setHideDataset(card_image_content);                         // ★

    const card_text_content = document.createElement("div");
    card_text_content.classList.add("card_text_content");
    setHideDataset(card_text_content);                          // ★

    /* --- MUUTTUVIA APULISTOJA --------------------------------- */
    const description_entries = [];
    const details_entries     = [];
    const keywords_list       = [];
    /* ---------------------------------------------------------- */
    let header_first_letter = "";
    const creation_seed =
        String(row_item.id ?? "x") +
        "_" +
        (row_item.created || row_item.created_at || row_item.luontiaika || "");

    /* --- HEADERIN ENSIMMÄINEN KIRJAIN ------------------------- */
    columns.forEach((col) => {
        const { baseRoles } = parseRoleString(
            data_types[col]?.card_element || ""
        );
        if (baseRoles.includes("header")) {
            const v = row_item[col];
            if (v) header_first_letter = String(v).trim()[0] || "";
        }
    });

    /* --- HEADER- & USERNAME-ELEMENTIT JÄLKIKÄS. VARTEN -------- */
    let usernameElement = null;
    let headerElement   = null;
    let found_image_for_this_row = false;

    /* ===========================================================
       LÄPITSE SARAKKEET
       =========================================================== */
    for (const column of columns) {
        const raw_val = row_item[column];
        const val_str = raw_val != null ? String(raw_val) : "";

        if (data_types[column]?.show_value_on_card !== true) continue;

        const { baseRoles, hasLangKey } = parseRoleString(
            data_types[column]?.card_element || ""
        );
        const showKey   = data_types[column]?.show_key_on_card === true;
        const col_label = showKey ? format_column_name(column) : "";

        /* --- Sarakeluokka tälle kierrokselle ------------------- */
        const columnClass = makeColumnClass(table_name, column);

        /* --------------------------------------------------------
           0) ILMAN ROOLIA -> pelkkä key/value
           -------------------------------------------------------- */
        if (baseRoles.length === 0) {
            if (val_str.trim()) {
                const wrap = document.createElement("div");
                wrap.classList.add("card_pair", columnClass);
                setHideDataset(wrap);                            // ★
                wrap.appendChild(
                    createKeyValueElement(
                        col_label,
                        val_str,
                        column,
                        hasLangKey,
                        "card_value"
                    )
                );
                card_text_content.appendChild(wrap);
            }
            continue;
        }

        /* --------------------------------------------------------
           1) ROOLIKOHTAINEN KÄSITTELY
           -------------------------------------------------------- */
        for (const role of baseRoles) {
            if (/^hidden\d*$/.test(role)) continue;      // ohita hidden

            /* --- DESCRIPTION ---------------------------------- */
            if (/^description\d*$/.test(role) && val_str.trim()) {
                description_entries.push({
                    suffix_number:
                        parseInt(role.replace("description", "")) ||
                        Number.MAX_SAFE_INTEGER,
                    rawValue    : val_str,
                    label       : col_label,
                    hasLangKey,
                    column,
                    columnClass,
                });
                continue;
            }

            /* --- DETAILS LINK --------------------------------- */
            if (/^details_link\d*$/.test(role) && val_str.trim()) {
                details_entries.push({
                    suffix_number:
                        parseInt(role.replace("details_link", "")) ||
                        Number.MAX_SAFE_INTEGER,
                    rawValue    : val_str,
                    label       : col_label,
                    hasLangKey,
                    column,
                    columnClass,
                    isLink      : true,
                });
                continue;
            }

            /* --- DETAILS (plain) ------------------------------ */
            if (/^details\d*$/.test(role) && val_str.trim()) {
                details_entries.push({
                    suffix_number:
                        parseInt(role.replace("details", "")) ||
                        Number.MAX_SAFE_INTEGER,
                    rawValue    : val_str,
                    label       : col_label,
                    hasLangKey,
                    column,
                    columnClass,
                    isLink      : false,
                });
                continue;
            }

            /* --- KEYWORDS ------------------------------------- */
            if (role === "keywords" && val_str.trim()) {
                keywords_list.push({
                    column,
                    rawValue    : val_str,
                    label       : col_label,
                    hasLangKey,
                    columnClass,
                });
                continue;
            }

            /* --- IMAGE ---------------------------------------- */
            if (role === "image") {
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

            /* --- HEADER --------------------------------------- */
            if (role === "header") {
                headerElement = addHeaderElement(
                    val_str,
                    col_label,
                    column,
                    hasLangKey,
                    row_item,
                    table_name,
                    card_content_div
                );
                headerElement.classList.add(columnClass);
                setHideDataset(headerElement);                   // ★
                continue;
            }

            /* --- USERNAME ------------------------------------- */
            if (role === "username") {
                usernameElement = addUsernameElement(
                    val_str,
                    col_label,
                    column,
                    hasLangKey
                );
                usernameElement.classList.add(columnClass);
                setHideDataset(usernameElement);                 // ★
                continue;
            }

            /* --- MUUT (fallback) ------------------------------ */
            if (val_str.trim()) {
                const wrap = document.createElement("div");
                wrap.classList.add("card_pair", columnClass);
                setHideDataset(wrap);                            // ★
                wrap.appendChild(
                    createKeyValueElement(
                        col_label,
                        val_str,
                        column,
                        hasLangKey,
                        "card_details"
                    )
                );
                card_text_content.appendChild(wrap);
            }
        }
    } // for(column)

    /* ===========================================================
       KUVA-ROOLI PUUTTUU? -> AVATAR
       =========================================================== */
    if (tableHasImageRole && !found_image_for_this_row) {
        const imgDiv = document.createElement("div");
        imgDiv.classList.add("card_image");
        setHideDataset(imgDiv);                                  // ★
        imgDiv.appendChild(
            await create_seeded_avatar(creation_seed, header_first_letter, true)
        );
        card_image_content.appendChild(imgDiv);
    }
    if (!tableHasImageRole) {
        const imgDiv = document.createElement("div");
        imgDiv.classList.add("card_image");
        setHideDataset(imgDiv);                                  // ★
        imgDiv.appendChild(
            await create_seeded_avatar(
                creation_seed,
                header_first_letter,
                false
            )
        );
        card_image_content.appendChild(imgDiv);
    }

    /* === TEKSTIOSIOT (description, keywords, details) ========== */
    addDescriptionSection(
        description_entries,
        row_item,
        table_name,
        card_text_content
    );
    addKeywordsSection(keywords_list, row_item, table_name, card_text_content);
    addDetailsSection(details_entries, row_item, table_name, card_text_content);

    /* --- FOOTER ----------------------------------------------- */
    const footer_div = document.createElement("div");
    footer_div.classList.add("card_footer");
    setHideDataset(footer_div);                                  // ★

    if (usernameElement) {
        if (headerElement) {
            headerElement.appendChild(usernameElement);
        } else {
            footer_div.appendChild(usernameElement);
        }
    }

    if (isAdmin) {
        const moreBtn = document.createElement("button");
        moreBtn.dataset.langKey = "show_more";
        moreBtn.addEventListener("click", (e) => {
            e.preventDefault();
            open_big_card_modal(row_item, table_name);
        });
        setHideDataset(moreBtn);                                 // ★
        footer_div.appendChild(moreBtn);
    }

    /* --- KOKOAMINEN ------------------------------------------- */
    card_text_content.appendChild(footer_div);
    card_body_div.appendChild(card_image_content);
    card_body_div.appendChild(card_text_content);
    card_content_div.appendChild(card_body_div);
    card.appendChild(card_content_div);

    return card;
}
// /**
//  * Luo yhden kortin annetun rivin datasta *ja* lisää jokaiselle
//  * sarakkeen mukaan nimetty luokka (`column_<table>_<column>`),
//  * jotta column_visibility.js voi näyttää/piilottaa myös korttien
//  * elementtejä.
//  */
// async function createSingleCard(row_item, columns, table_name, data_types) {
//     /* --- FUNKTIOLASKURI -------------------------------------------- */
//     count_this_function("createSingleCard"); // ★ uusi

//     /* --- ADMIN-TARKISTUS ------------------------------------------- */
//     const isAdmin = localStorage.getItem("admin_mode") === "true";

//     /* --- ULKOKUORI -------------------------------------------------- */
//     const card = document.createElement("div");
//     card.classList.add("card");
//     if (row_item.id != null) card.dataset.id = row_item.id;

//     /* --- VALINTARUUTU (vain admineille) ---------------------------- */
//     if (isAdmin) {
//         const cb = document.createElement("input");
//         cb.type = "checkbox";
//         cb.classList.add("card_checkbox");
//         cb.addEventListener("change", () => update_card_selection(card));
//         card.appendChild(cb);
//     }

//     /* --- SISÄISET RAKENTEET --------------------------------------- */
//     const card_content_div = document.createElement("div");
//     card_content_div.classList.add("card_content");

//     const tableHasImageRole = columns.some((c) =>
//         parseRoleString(data_types[c]?.card_element || "").baseRoles.includes(
//             "image"
//         )
//     );
//     card_content_div.classList.add(
//         tableHasImageRole ? "card_content_large" : "card_content_small"
//     );

//     const card_body_div = document.createElement("div");
//     card_body_div.classList.add("card_body");
//     const card_image_content = document.createElement("div");
//     card_image_content.classList.add("card_image_content");
//     const card_text_content = document.createElement("div");
//     card_text_content.classList.add("card_text_content");

//     /* --- MUUTTUVIA APULISTOJA -------------------------------------- */
//     const description_entries = [];
//     const details_entries = [];
//     const keywords_list = [];

//     let header_first_letter = "";
//     const creation_seed =
//         String(row_item.id ?? "x") +
//         "_" +
//         (row_item.created || row_item.created_at || row_item.luontiaika || "");

//     /* --- HEADERIN ENSIMMÄINEN KIRJAIN ------------------------------ */
//     columns.forEach((col) => {
//         const { baseRoles } = parseRoleString(
//             data_types[col]?.card_element || ""
//         );
//         if (baseRoles.includes("header")) {
//             const v = row_item[col];
//             if (v) header_first_letter = String(v).trim()[0] || "";
//         }
//     });

//     /* --- TALLENNETAAN HEADER- JA USERNAME-ELEMENTIT MAHD. JÄLKIKÄSITT. */
//     let usernameElement = null;
//     let headerElement = null;
//     let found_image_for_this_row = false;

//     /* ================================================================
//        LÄPITSE SARAKKEET
//        ================================================================ */
//     for (const column of columns) {
//         const raw_val = row_item[column];
//         const val_str = raw_val != null ? String(raw_val) : "";

//         if (data_types[column]?.show_value_on_card !== true) continue;

//         const { baseRoles, hasLangKey } = parseRoleString(
//             data_types[column]?.card_element || ""
//         );
//         const showKey = data_types[column]?.show_key_on_card === true;
//         const col_label = showKey ? format_column_name(column) : "";

//         /* --- YHTEINEN sarakeluokka tälle kierrokselle -------------- */
//         const columnClass = makeColumnClass(table_name, column);

//         /* ------------------------------------------------------------
//            0) ILMAN ROOLIA  -> pelkkä key/value
//            ------------------------------------------------------------ */
//         if (baseRoles.length === 0) {
//             if (val_str.trim()) {
//                 const wrap = document.createElement("div");
//                 wrap.classList.add("card_pair", columnClass); // ★ lisätty
//                 wrap.appendChild(
//                     createKeyValueElement(
//                         col_label,
//                         val_str,
//                         column,
//                         hasLangKey,
//                         "card_value"
//                     )
//                 );
//                 card_text_content.appendChild(wrap);
//             }
//             continue;
//         }

//         /* ------------------------------------------------------------
//            1) ROOLIKOHTAINEN KÄSITTELY
//            ------------------------------------------------------------ */
//         for (const role of baseRoles) {
//             if (/^hidden\d*$/.test(role)) continue; // ohitetaan hidden-roolit

//             /* --- DESCRIPTION -------------------------------------- */
//             if (/^description\d*$/.test(role) && val_str.trim()) {
//                 description_entries.push({
//                     suffix_number:
//                         parseInt(role.replace("description", "")) ||
//                         Number.MAX_SAFE_INTEGER,
//                     rawValue: val_str,
//                     label: col_label,
//                     hasLangKey,
//                     column,
//                     columnClass, // ★ talteen näkymistä varten
//                 });
//                 continue;
//             }

//             /* --- DETAILS LINK ------------------------------------- */
//             if (/^details_link\d*$/.test(role) && val_str.trim()) {
//                 details_entries.push({
//                     suffix_number:
//                         parseInt(role.replace("details_link", "")) ||
//                         Number.MAX_SAFE_INTEGER,
//                     rawValue: val_str,
//                     label: col_label,
//                     hasLangKey,
//                     column,
//                     columnClass, // ★
//                     isLink: true,
//                 });
//                 continue;
//             }

//             /* --- DETAILS (plain) ---------------------------------- */
//             if (/^details\d*$/.test(role) && val_str.trim()) {
//                 details_entries.push({
//                     suffix_number:
//                         parseInt(role.replace("details", "")) ||
//                         Number.MAX_SAFE_INTEGER,
//                     rawValue: val_str,
//                     label: col_label,
//                     hasLangKey,
//                     column,
//                     columnClass, // ★
//                     isLink: false,
//                 });
//                 continue;
//             }

//             /* --- KEYWORDS ----------------------------------------- */
//             if (role === "keywords" && val_str.trim()) {
//                 keywords_list.push({
//                     column,
//                     rawValue: val_str,
//                     label: col_label,
//                     hasLangKey,
//                     columnClass, // ★
//                 });
//                 continue;
//             }

//             /* --- IMAGE -------------------------------------------- */
//             if (role === "image") {
//                 found_image_for_this_row = true;
//                 await addImageOrAvatar(
//                     val_str,
//                     tableHasImageRole,
//                     creation_seed,
//                     header_first_letter,
//                     card_image_content
//                 );
//                 continue;
//             }

//             /* --- HEADER ------------------------------------------- */
//             if (role === "header") {
//                 headerElement = addHeaderElement(
//                     val_str,
//                     col_label,
//                     column,
//                     hasLangKey,
//                     row_item,
//                     table_name,
//                     card_content_div
//                 );
//                 headerElement.classList.add(columnClass); // ★
//                 continue;
//             }

//             /* --- USERNAME ----------------------------------------- */
//             if (role === "username") {
//                 usernameElement = addUsernameElement(
//                     val_str,
//                     col_label,
//                     column,
//                     hasLangKey
//                 );
//                 usernameElement.classList.add(columnClass); // ★
//                 continue;
//             }

//             /* --- MUUT (jos jäi) ----------------------------------- */
//             if (val_str.trim()) {
//                 const wrap = document.createElement("div");
//                 wrap.classList.add("card_pair", columnClass); // ★
//                 wrap.appendChild(
//                     createKeyValueElement(
//                         col_label,
//                         val_str,
//                         column,
//                         hasLangKey,
//                         "card_details"
//                     )
//                 );
//                 card_text_content.appendChild(wrap);
//             }
//         }
//     } // --- for(column) ---

//     /* ================================================================
//        JOS EI KUVA-ROOLIA -> AVATAR
//        ================================================================ */
//     if (tableHasImageRole && !found_image_for_this_row) {
//         const imgDiv = document.createElement("div");
//         imgDiv.classList.add("card_image");
//         imgDiv.appendChild(
//             await create_seeded_avatar(creation_seed, header_first_letter, true)
//         );
//         card_image_content.appendChild(imgDiv);
//     }
//     if (!tableHasImageRole) {
//         const imgDiv = document.createElement("div");
//         imgDiv.classList.add("card_image");
//         imgDiv.appendChild(
//             await create_seeded_avatar(
//                 creation_seed,
//                 header_first_letter,
//                 false
//             )
//         );
//         card_image_content.appendChild(imgDiv);
//     }

//     /* === TEKSTIOSIOT (description, keywords, details) ============== */
//     addDescriptionSection(
//         description_entries,
//         row_item,
//         table_name,
//         card_text_content
//     );
//     addKeywordsSection(keywords_list, row_item, table_name, card_text_content);
//     addDetailsSection(details_entries, row_item, table_name, card_text_content);

//     /* --- FOOTER ---------------------------------------------------- */
//     const footer_div = document.createElement("div");
//     footer_div.classList.add("card_footer");

//     if (usernameElement) {
//         if (headerElement) {
//             headerElement.appendChild(usernameElement);
//         } else {
//             footer_div.appendChild(usernameElement);
//         }
//     }

//     if (isAdmin) {
//         const moreBtn = document.createElement("button");
//         moreBtn.dataset.langKey = "show_more";
//         moreBtn.addEventListener("click", (e) => {
//             e.preventDefault();
//             open_big_card_modal(row_item, table_name);
//         });
//         footer_div.appendChild(moreBtn);
//     }

//     /* --- KOKOAMINEN ------------------------------------------------ */
//     card_text_content.appendChild(footer_div);
//     card_body_div.appendChild(card_image_content);
//     card_body_div.appendChild(card_text_content);
//     card_content_div.appendChild(card_body_div);
//     card.appendChild(card_content_div);

//     return card;
// }

function addHeaderElement(
    val_str,
    label,
    column,
    hasLangKey,
    row_item,
    table_name,
    container
) {
    const headerDiv = document.createElement("div");
    headerDiv.classList.add("card_header");

    // --- card_pair + header_value -------------
    const pairDiv = document.createElement("div");
    pairDiv.classList.add("card_pair");

    const kvElem = createKeyValueElement(
        label, // näkyy vain jos show_key_on_card === true
        val_str, // raaka arvo
        column,
        hasLangKey, // jos true → data-lang-key attribuutti, ei tekstisisältöä
        "header_value" // css‑luokka arvolle
    );

    pairDiv.appendChild(kvElem);
    headerDiv.appendChild(pairDiv);

    headerDiv.style.whiteSpace = "pre-wrap";

    // --- klikillä isompi kortti ----------------
    headerDiv.addEventListener("click", (e) => {
        e.preventDefault();
        open_big_card_modal(row_item, table_name);
    });

    // liitetään korttiin ja palautetaan ref, jotta username voidaan liittää
    container.appendChild(headerDiv);
    return headerDiv;
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

/**
 * Lisää kortille kuvausosion.
 * Jokaiselle luodulle elementille asetetaan data-hide-field-on-card
 * merkkijonoksi "true" tai "false" riippuen siitä, löytyykö localStoragesta
 * hide_fields_on_cards === "true".
 */
function addDescriptionSection(
    description_entries,
    row_item,
    table_name,
    container
) {
    count_this_function("addDescriptionSection");

    if (description_entries.length === 0) return;

    /* Luetaan käyttäjän asetus kerran. */
    const hideFieldsOnCardsString =
        localStorage.getItem("hide_fields_on_cards") === "true" ? "true" : "false";

    /** Asettaa data-attribuutin elementille aina ("true" tai "false"). */
    function setHideDataset(targetElement) {
        targetElement.dataset.hideFieldOnCard = hideFieldsOnCardsString;
    }

    // Järjestys numeron mukaan
    description_entries.sort((a, b) => a.suffix_number - b.suffix_number);

    const desc_container = document.createElement("div");
    desc_container.classList.add("card_description_container");
    setHideDataset(desc_container);
    container.appendChild(desc_container);

    for (const descObj of description_entries) {
        const outerDiv = document.createElement("div");
        outerDiv.classList.add("single_description_item", descObj.columnClass); // ★
        setHideDataset(outerDiv);

        // Itse key/value-elementti
        const wrapper = createKeyValueElement(
            descObj.label,
            descObj.rawValue,
            descObj.column,
            descObj.hasLangKey,
            "description_value"
        );
        wrapper.classList.add(descObj.columnClass); // ★
        setHideDataset(wrapper);

        // “Näytä enemmän” + rivinvaihdot
        const valueDiv = wrapper.querySelector(
            `[data-column="${descObj.column}"]`
        );
        if (valueDiv) {
            valueDiv.style.whiteSpace = "pre-wrap";
            valueDiv.appendChild(document.createTextNode(" "));
            const showMoreLink = createShowMoreLink(row_item, table_name);
            showMoreLink.style.display = "none";
            valueDiv.appendChild(showMoreLink);
        }

        outerDiv.appendChild(wrapper);
        desc_container.appendChild(outerDiv);
    }
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

/**
 * Rakentaa avainsana-(keyword)-osion kortille.
 * Kaikkiin luotuihin elementteihin asetetaan data-hide-field-on-card:
 *  • "false" → saraketta EI saa piilottaa
 *  • "true"  → sarake voidaan piilottaa normaalisti
 */
function addKeywordsSection(keywords_list, row_item, table_name, container) {
    count_this_function("addKeywordsSection");

    if (keywords_list.length === 0) return;

    /* 0) Luetaan käyttäjän asetus kerran ------------------------- */
    const hideFieldsOnCardsString =
        localStorage.getItem("hide_fields_on_cards") === "true" ? "true" : "false";

    /* Apu: aseta attribuutti yhdellä rivillä --------------------- */
    const setHideDataset = (el) =>
        (el.dataset.hideFieldOnCard = hideFieldsOnCardsString);

    /* 1) Ulompi kontainer --------------------------------------- */
    const keywordsOuterContainer = document.createElement("div");
    keywordsOuterContainer.classList.add("card_keywords_container");
    keywordsOuterContainer.style.overflow = "hidden";
    setHideDataset(keywordsOuterContainer);
    container.appendChild(keywordsOuterContainer);

    /* 2) Muodostetaan litteä lista kaikista avainsanoista -------- */
    const allKeywordEntries = []; // { kwObj, word }
    for (const kwObj of keywords_list) {
        kwObj.rawValue
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((word) => allKeywordEntries.push({ kwObj, word }));
    }

    const keywordsToShow = allKeywordEntries.slice(0, 3);

    /* 3) Rakennetaan tag-elementit ------------------------------ */
    const tagEntriesForLayout = []; // { dom, width }
    for (const { kwObj, word } of keywordsToShow) {
        const tagDiv = document.createElement("div");
        tagDiv.style.backgroundColor = "var(--bg_color)";
        tagDiv.style.borderRadius = "10px";
        tagDiv.style.padding = "1px 3px";
        tagDiv.style.margin = "3px";
        tagDiv.style.display = "inline-block";
        tagDiv.style.whiteSpace = "nowrap";
        tagDiv.style.flexShrink = "0";
        tagDiv.classList.add(kwObj.columnClass); // ★
        setHideDataset(tagDiv);

        /* Sisältö (key/value) ------------------------------------ */
        let contentElement;
        if (!kwObj.hasLangKey && word.length > 100) {
            const shortened = word.slice(0, 100) + "...";
            contentElement = createKeyValueElement(
                kwObj.label,
                shortened,
                kwObj.column,
                kwObj.hasLangKey,
                "keyword_value"
            );
            const v = contentElement.querySelector(
                `[data-column="${kwObj.column}"]`
            );
            if (v) {
                v.appendChild(document.createTextNode(" "));
                v.appendChild(createShowMoreLink(row_item, table_name));
            }
        } else {
            contentElement = createKeyValueElement(
                kwObj.label,
                word,
                kwObj.column,
                kwObj.hasLangKey,
                "keyword_value"
            );
        }
        contentElement.classList.add(kwObj.columnClass); // ★
        setHideDataset(contentElement);

        tagDiv.appendChild(contentElement);
        keywordsOuterContainer.appendChild(tagDiv);
        tagEntriesForLayout.push({ dom: tagDiv, width: 0 });
    }

    /* 4) Leveys- ja resize-toimet (kuten ennen) ----------------- */
    tagEntriesForLayout.forEach(
        (e) => (e.width = e.dom.getBoundingClientRect().width)
    );

    function layoutTagsByAvailableWidth() {
        const available = keywordsOuterContainer.clientWidth;
        let used = 0;
        for (const { dom, width } of tagEntriesForLayout) {
            if (used + width <= available) {
                dom.style.display = "inline-block";
                used += width;
            } else {
                dom.style.display = "none";
            }
        }
    }

    layoutTagsByAvailableWidth();

    const resizeObserver = new ResizeObserver(layoutTagsByAvailableWidth);
    resizeObserver.observe(keywordsOuterContainer);

    const mutationObserver = new MutationObserver((muts) => {
        muts.forEach((mut) => {
            mut.removedNodes.forEach((node) => {
                if (node === keywordsOuterContainer) {
                    resizeObserver.disconnect();
                    mutationObserver.disconnect();
                }
            });
        });
    });
    mutationObserver.observe(container, { childList: true });
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

    details_container.appendChild(
        createDetailsTable(left_details, row_item, table_name)
    );
    details_container.appendChild(
        createDetailsTable(right_details, row_item, table_name)
    );

    container.appendChild(details_container);
}

/**
 * Luo <table>-elementin riveineen.
 * data-hide-field-on-card saa arvon "true" tai "false" sen mukaan,
 * löytyykö localStoragesta avain hide_fields_on_cards ja onko se "true".
 */
function createDetailsTable(detailsList, row_item, table_name) {
    count_this_function("createDetailsTable");

    /** Luetaan käyttäjän asetus ja muutetaan se merkkijonoksi "true"/"false". */
    const hideFieldsOnCardsString =
        localStorage.getItem("hide_fields_on_cards") === "true" ? "true" : "false";

    /** Asettaa data-attribuutin elementille aina ("true" tai "false"). */
    function setHideDataset(targetElement) {
        targetElement.dataset.hideFieldOnCard = hideFieldsOnCardsString;
    }

    const table = document.createElement("table");
    table.classList.add("card_table");

    detailsList.forEach((detailObj) => {
        /* TR ------------------------------------------------------ */
        const row = document.createElement("tr");
        row.classList.add(detailObj.columnClass);          // ★
        setHideDataset(row);

        /* KEY-solu ------------------------------------------------ */
        const key_cell = document.createElement("th");
        key_cell.dataset.langKey = detailObj.column;
        key_cell.classList.add(detailObj.columnClass);     // ★
        setHideDataset(key_cell);

        /* VALUE-solu --------------------------------------------- */
        const value_cell = document.createElement("td");
        value_cell.classList.add(detailObj.columnClass);   // ★
        setHideDataset(value_cell);

        /* ——— Arvon käsittely ——— */
        if (detailObj.isLink) {
            const linkValue = detailObj.rawValue.trim();
            if (linkValue.startsWith("<a ")) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(linkValue, "text/html");
                const anchor = doc.querySelector("a");
                const newLink = document.createElement("a");
                newLink.href   = anchor ? anchor.href : linkValue;
                newLink.target = "_blank";
                newLink.textContent = anchor
                    ? anchor.textContent || anchor.href
                    : linkValue;
                value_cell.appendChild(newLink);
            } else {
                const link = document.createElement("a");
                link.href   = linkValue;
                link.target = "_blank";
                link.textContent = linkValue;
                value_cell.appendChild(link);
            }
        } else if (!detailObj.hasLangKey && detailObj.rawValue.length > 80) {
            value_cell.textContent = detailObj.rawValue.slice(0, 80) + "... ";
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

export async function create_card_view(columns, data, table_name) {
    const card_container = document.createElement("div");
    card_container.classList.add("card_container");

    let data_types =
        JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};

    for (const row_item of data) {
        const card = await createSingleCard(
            row_item,
            columns,
            table_name,
            data_types
        );
        card_container.appendChild(card);
    }

    return card_container;
}

// // file: card_view.js
// import { update_card_selection } from "../table_view/selection.js";
// import { createImageElement, create_seeded_avatar } from "./card_layout.js";
// import { open_big_card_modal } from "./open_big_card_modal.js";
// import { createModal, showModal } from "../../../common_components/modal/modal_factory.js";
// import {
//     parseRoleString,
//     createKeyValueElement,
//     format_column_name,
// } from "./card_helpers.js";
// import { count_this_function } from "../../dev_tools/function_counter.js";
// import { makeColumnClass } from "../../filterbar/column_visibility.js";

// export async function appendDataToCardView(card_container, columns, data, table_name) {
//     let data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};

//     for (const item of data) {
//         const card = await createSingleCard(item, columns, table_name, data_types);
//         card_container.appendChild(card);
//     }
// }

// /**
//  * Luo yhden kortin annetun rivin datasta *ja* lisää jokaiselle
//  * sarakkeen mukaan nimetty luokka (`column_<table>_<column>`),
//  * jotta column_visibility.js voi näyttää/piilottaa myös korttien
//  * elementtejä.
//  */
// async function createSingleCard(
//     row_item,
//     columns,
//     table_name,
//     data_types
// ) {
//     /* --- FUNKTIOLASKURI -------------------------------------------- */
//     count_this_function("createSingleCard");                 // ★ uusi

//     /* --- ADMIN-TARKISTUS ------------------------------------------- */
//     const isAdmin = localStorage.getItem("admin_mode") === "true";

//     /* --- ULKOKUORI -------------------------------------------------- */
//     const card = document.createElement("div");
//     card.classList.add("card");
//     if (row_item.id != null) card.dataset.id = row_item.id;

//     /* --- VALINTARUUTU (vain admineille) ---------------------------- */
//     if (isAdmin) {
//         const cb = document.createElement("input");
//         cb.type = "checkbox";
//         cb.classList.add("card_checkbox");
//         cb.addEventListener("change", () => update_card_selection(card));
//         card.appendChild(cb);
//     }

//     /* --- SISÄISET RAKENTEET --------------------------------------- */
//     const card_content_div = document.createElement("div");
//     card_content_div.classList.add("card_content");

//     const tableHasImageRole = columns.some((c) =>
//         parseRoleString(data_types[c]?.card_element || "").baseRoles.includes("image")
//     );
//     card_content_div.classList.add(
//         tableHasImageRole ? "card_content_large" : "card_content_small"
//     );

//     const card_body_div      = document.createElement("div");
//     card_body_div.classList.add("card_body");
//     const card_image_content = document.createElement("div");
//     card_image_content.classList.add("card_image_content");
//     const card_text_content  = document.createElement("div");
//     card_text_content.classList.add("card_text_content");

//     /* --- MUUTTUVIA APULISTOJA -------------------------------------- */
//     const description_entries = [];
//     const details_entries     = [];
//     const keywords_list       = [];

//     let header_first_letter = "";
//     const creation_seed =
//         String(row_item.id ?? "x") + "_" +
//         (row_item.created || row_item.created_at || row_item.luontiaika || "");

//     /* --- HEADERIN ENSIMMÄINEN KIRJAIN ------------------------------ */
//     columns.forEach((col) => {
//         const { baseRoles } = parseRoleString(data_types[col]?.card_element || "");
//         if (baseRoles.includes("header")) {
//             const v = row_item[col];
//             if (v) header_first_letter = String(v).trim()[0] || "";
//         }
//     });

//     /* --- TALLENNETAAN HEADER- JA USERNAME-ELEMENTIT MAHD. JÄLKIKÄSITT. */
//     let usernameElement = null;
//     let headerElement   = null;
//     let found_image_for_this_row = false;

//     /* ================================================================
//        LÄPITSE SARAKKEET
//        ================================================================ */
//     for (const column of columns) {
//         const raw_val = row_item[column];
//         const val_str = raw_val != null ? String(raw_val) : "";

//         if (data_types[column]?.show_value_on_card !== true) continue;

//         const { baseRoles, hasLangKey } =
//             parseRoleString(data_types[column]?.card_element || "");
//         const showKey    = data_types[column]?.show_key_on_card === true;
//         const col_label  = showKey ? format_column_name(column) : "";

//         /* --- YHTEINEN sarakeluokka tälle kierrokselle -------------- */
//         const columnClass = makeColumnClass(table_name, column);

//         /* ------------------------------------------------------------
//            0) ILMAN ROOLIA  -> pelkkä key/value
//            ------------------------------------------------------------ */
//         if (baseRoles.length === 0) {
//             if (val_str.trim()) {
//                 const wrap = document.createElement("div");
//                 wrap.classList.add("card_pair", columnClass);      // ★ lisätty
//                 wrap.appendChild(
//                     createKeyValueElement(
//                         col_label,
//                         val_str,
//                         column,
//                         hasLangKey,
//                         "card_value"
//                     )
//                 );
//                 card_text_content.appendChild(wrap);
//             }
//             continue;
//         }

//         /* ------------------------------------------------------------
//            1) ROOLIKOHTAINEN KÄSITTELY
//            ------------------------------------------------------------ */
//         for (const role of baseRoles) {
//             if (/^hidden\d*$/.test(role)) continue; // ohitetaan hidden-roolit

//             /* --- DESCRIPTION -------------------------------------- */
//             if (/^description\d*$/.test(role) && val_str.trim()) {
//                 description_entries.push({
//                     suffix_number : parseInt(role.replace("description", "")) ||
//                                     Number.MAX_SAFE_INTEGER,
//                     rawValue      : val_str,
//                     label         : col_label,
//                     hasLangKey,
//                     column,
//                     columnClass   // ★ talteen näkymistä varten
//                 });
//                 continue;
//             }

//             /* --- DETAILS LINK ------------------------------------- */
//             if (/^details_link\d*$/.test(role) && val_str.trim()) {
//                 details_entries.push({
//                     suffix_number : parseInt(role.replace("details_link", "")) ||
//                                     Number.MAX_SAFE_INTEGER,
//                     rawValue      : val_str,
//                     label         : col_label,
//                     hasLangKey,
//                     column,
//                     columnClass,                // ★
//                     isLink        : true,
//                 });
//                 continue;
//             }

//             /* --- DETAILS (plain) ---------------------------------- */
//             if (/^details\d*$/.test(role) && val_str.trim()) {
//                 details_entries.push({
//                     suffix_number : parseInt(role.replace("details", "")) ||
//                                     Number.MAX_SAFE_INTEGER,
//                     rawValue      : val_str,
//                     label         : col_label,
//                     hasLangKey,
//                     column,
//                     columnClass,                // ★
//                     isLink        : false,
//                 });
//                 continue;
//             }

//             /* --- KEYWORDS ----------------------------------------- */
//             if (role === "keywords" && val_str.trim()) {
//                 keywords_list.push({
//                     column,
//                     rawValue    : val_str,
//                     label       : col_label,
//                     hasLangKey,
//                     columnClass                       // ★
//                 });
//                 continue;
//             }

//             /* --- IMAGE -------------------------------------------- */
//             if (role === "image") {
//                 found_image_for_this_row = true;
//                 await addImageOrAvatar(
//                     val_str,
//                     tableHasImageRole,
//                     creation_seed,
//                     header_first_letter,
//                     card_image_content
//                 );
//                 continue;
//             }

//             /* --- HEADER ------------------------------------------- */
//             if (role === "header") {
//                 headerElement = addHeaderElement(
//                     val_str,
//                     col_label,
//                     column,
//                     hasLangKey,
//                     row_item,
//                     table_name,
//                     card_content_div
//                 );
//                 headerElement.classList.add(columnClass);   // ★
//                 continue;
//             }

//             /* --- USERNAME ----------------------------------------- */
//             if (role === "username") {
//                 usernameElement = addUsernameElement(
//                     val_str,
//                     col_label,
//                     column,
//                     hasLangKey
//                 );
//                 usernameElement.classList.add(columnClass); // ★
//                 continue;
//             }

//             /* --- MUUT (jos jäi) ----------------------------------- */
//             if (val_str.trim()) {
//                 const wrap = document.createElement("div");
//                 wrap.classList.add("card_pair", columnClass);       // ★
//                 wrap.appendChild(
//                     createKeyValueElement(
//                         col_label,
//                         val_str,
//                         column,
//                         hasLangKey,
//                         "card_details"
//                     )
//                 );
//                 card_text_content.appendChild(wrap);
//             }
//         }
//     } // --- for(column) ---

//     /* ================================================================
//        JOS EI KUVA-ROOLIA -> AVATAR
//        ================================================================ */
//     if (tableHasImageRole && !found_image_for_this_row) {
//         const imgDiv = document.createElement("div");
//         imgDiv.classList.add("card_image");
//         imgDiv.appendChild(
//             await create_seeded_avatar(creation_seed, header_first_letter, true)
//         );
//         card_image_content.appendChild(imgDiv);
//     }
//     if (!tableHasImageRole) {
//         const imgDiv = document.createElement("div");
//         imgDiv.classList.add("card_image");
//         imgDiv.appendChild(
//             await create_seeded_avatar(creation_seed, header_first_letter, false)
//         );
//         card_image_content.appendChild(imgDiv);
//     }

//     /* === TEKSTIOSIOT (description, keywords, details) ============== */
//     addDescriptionSection(description_entries, row_item, table_name, card_text_content);
//     addKeywordsSection   (keywords_list,      row_item, table_name, card_text_content);
//     addDetailsSection    (details_entries,    row_item, table_name, card_text_content);

//     /* --- FOOTER ---------------------------------------------------- */
//     const footer_div = document.createElement("div");
//     footer_div.classList.add("card_footer");

//     if (usernameElement) {
//         if (headerElement) {
//             headerElement.appendChild(usernameElement);
//         } else {
//             footer_div.appendChild(usernameElement);
//         }
//     }

//     if (isAdmin) {
//         const moreBtn = document.createElement("button");
//         moreBtn.dataset.langKey = "show_more";
//         moreBtn.addEventListener("click", (e) => {
//             e.preventDefault();
//             open_big_card_modal(row_item, table_name);
//         });
//         footer_div.appendChild(moreBtn);
//     }

//     /* --- KOKOAMINEN ------------------------------------------------ */
//     card_text_content.appendChild(footer_div);
//     card_body_div.appendChild(card_image_content);
//     card_body_div.appendChild(card_text_content);
//     card_content_div.appendChild(card_body_div);
//     card.appendChild(card_content_div);

//     return card;
// }
// // async function createSingleCard(
// //     row_item,
// //     columns,
// //     table_name,
// //     data_types
// // ) {
// //     /* --- admin-tarkistus vain kerran ------------------- */
// //     const isAdmin = localStorage.getItem("admin_mode") === "true";

// //     /* --- ulkokuori ------------------------------------- */
// //     const card = document.createElement("div");
// //     card.classList.add("card");
// //     if (row_item.id != null) card.setAttribute("data-id", row_item.id);

// //     /* --- valintaruutu (vain admineille) ---------------- */
// //     if (isAdmin) {
// //         const cb = document.createElement("input");
// //         cb.type = "checkbox";
// //         cb.classList.add("card_checkbox");
// //         cb.addEventListener("change", () => update_card_selection(card));
// //         card.appendChild(cb);
// //     }

// //     /* --- pääosat -------------------------------------- */
// //     const card_content_div = document.createElement("div");
// //     card_content_div.classList.add("card_content");

// //     const tableHasImageRole = columns.some((col) =>
// //         parseRoleString(data_types[col]?.card_element || "").baseRoles.includes("image")
// //     );
// //     if (tableHasImageRole) {
// //         card_content_div.classList.add("card_content_large");
// //     } else {
// //         card_content_div.classList.add("card_content_small");
// //     }

// //     // --- rakenteen sisäiset divit ----------------------
// //     const card_body_div      = document.createElement("div");
// //     card_body_div.classList.add("card_body");

// //     const card_image_content = document.createElement("div");
// //     card_image_content.classList.add("card_image_content");

// //     const card_text_content  = document.createElement("div");
// //     card_text_content.classList.add("card_text_content");

// //     /* --- apumuuttujat --------------------------------- */
// //     const details_entries    = [];
// //     const description_entries = [];
// //     const keywords_list      = [];

// //     let header_first_letter  = "";
// //     const creation_seed      =
// //         String(row_item.id ?? "x") +
// //         "_" +
// //         (row_item.created || row_item.created_at || row_item.luontiaika || "");

// //     /* --- headerin ensimmäinen kirjain ----------------- */
// //     columns.forEach((col) => {
// //         const { baseRoles } = parseRoleString(data_types[col]?.card_element || "");
// //         if (baseRoles.includes("header")) {
// //             const v = row_item[col];
// //             if (v) header_first_letter = String(v).trim()[0] || "";
// //         }
// //     });

// //     /* --- elementit, joihin palataan myöhemmin ---------- */
// //     let usernameElement = null;
// //     let headerElement   = null;
// //     let found_image_for_this_row = false;

// //     /* --- läpikäynti kaikista sarakkeista --------------- */
// //     for (const column of columns) {
// //         const raw_val = row_item[column];
// //         const val_str = raw_val != null ? String(raw_val) : "";

// //         if (data_types[column]?.show_value_on_card !== true) continue;

// //         const { baseRoles, hasLangKey } =
// //             parseRoleString(data_types[column]?.card_element || "");
// //         const showKey    = data_types[column]?.show_key_on_card === true;
// //         const col_label  = showKey ? format_column_name(column) : "";

// //         /* ---------- rooliton: pelkkä key/value ---------- */
// //         if (baseRoles.length === 0) {
// //             if (val_str.trim()) {
// //                 const wrap = document.createElement("div");
// //                 wrap.classList.add("card_pair");
// //                 wrap.appendChild(
// //                     createKeyValueElement(
// //                         col_label,
// //                         val_str,
// //                         column,
// //                         hasLangKey,
// //                         "card_value"
// //                     )
// //                 );
// //                 card_text_content.appendChild(wrap);
// //             }
// //             continue;
// //         }

// //         /* ---------- rooleihin perustuva käsittely -------- */
// //         for (const role of baseRoles) {
// //             if (/^hidden\d*$/.test(role)) continue;

// //             if (/^description\d*$/.test(role) && val_str.trim()) {
// //                 description_entries.push({
// //                     suffix_number: parseInt(role.replace("description", "")) || Number.MAX_SAFE_INTEGER,
// //                     rawValue: val_str,
// //                     label: col_label,
// //                     hasLangKey,
// //                     column,
// //                 });
// //                 continue;
// //             }

// //             if (/^details_link\d*$/.test(role) && val_str.trim()) {
// //                 details_entries.push({
// //                     suffix_number: parseInt(role.replace("details_link", "")) || Number.MAX_SAFE_INTEGER,
// //                     rawValue: val_str,
// //                     label: col_label,
// //                     hasLangKey,
// //                     column,
// //                     isLink: true,
// //                 });
// //                 continue;
// //             }

// //             if (/^details\d*$/.test(role) && val_str.trim()) {
// //                 details_entries.push({
// //                     suffix_number: parseInt(role.replace("details", "")) || Number.MAX_SAFE_INTEGER,
// //                     rawValue: val_str,
// //                     label: col_label,
// //                     hasLangKey,
// //                     column,
// //                     isLink: false,
// //                 });
// //                 continue;
// //             }

// //             if (role === "keywords" && val_str.trim()) {
// //                 keywords_list.push({ column, rawValue: val_str, label: col_label, hasLangKey });
// //                 continue;
// //             }

// //             if (role === "image") {
// //                 found_image_for_this_row = true;
// //                 await addImageOrAvatar(
// //                     val_str,
// //                     tableHasImageRole,
// //                     creation_seed,
// //                     header_first_letter,
// //                     card_image_content
// //                 );
// //                 continue;
// //             }

// //             if (role === "header") {
// //                 headerElement = addHeaderElement(
// //                     val_str,
// //                     col_label,
// //                     column,
// //                     hasLangKey,
// //                     row_item,
// //                     table_name,
// //                     card_content_div
// //                 );
// //                 continue;
// //             }

// //             if (role === "username") {
// //                 usernameElement = addUsernameElement(
// //                     val_str,
// //                     col_label,
// //                     column,
// //                     hasLangKey
// //                 );
// //                 continue;
// //             }

// //             if (val_str.trim()) {
// //                 const wrap = document.createElement("div");
// //                 wrap.classList.add("card_pair");
// //                 wrap.appendChild(
// //                     createKeyValueElement(
// //                         col_label,
// //                         val_str,
// //                         column,
// //                         hasLangKey,
// //                         "card_details"
// //                     )
// //                 );
// //                 card_text_content.appendChild(wrap);
// //             }
// //         }
// //     }

// //     /* --- kuva / avatar, jos ei löytynyt varsinaista kuvaa */
// //     if (tableHasImageRole && !found_image_for_this_row) {
// //         const imgDiv = document.createElement("div");
// //         imgDiv.classList.add("card_image");
// //         imgDiv.appendChild(
// //             await create_seeded_avatar(creation_seed, header_first_letter, true)
// //         );
// //         card_image_content.appendChild(imgDiv);
// //     }
// //     if (!tableHasImageRole) {
// //         const imgDiv = document.createElement("div");
// //         imgDiv.classList.add("card_image");
// //         imgDiv.appendChild(
// //             await create_seeded_avatar(creation_seed, header_first_letter, false)
// //         );
// //         card_image_content.appendChild(imgDiv);
// //     }

// //     /* --- teksti-osiot (description, keywords, details) -- */
// //     addDescriptionSection(description_entries, row_item, table_name, card_text_content);
// //     addKeywordsSection   (keywords_list,      row_item, table_name, card_text_content);
// //     addDetailsSection    (details_entries,    row_item, table_name, card_text_content);

// //     /* --- footer --------------------------------------- */
// //     const footer_div = document.createElement("div");
// //     footer_div.classList.add("card_footer");

// //     if (usernameElement) {
// //         if (headerElement) {
// //             headerElement.appendChild(usernameElement);
// //         } else {
// //             footer_div.appendChild(usernameElement);
// //         }
// //     }

// //     /* Näytä “Näytä enemmän”-nappi vain admineille */
// //     if (isAdmin) {
// //         const moreBtn = document.createElement("button");
// //         moreBtn.setAttribute("data-lang-key", "show_more");
// //         moreBtn.addEventListener("click", (e) => {
// //             e.preventDefault();
// //             open_big_card_modal(row_item, table_name);
// //         });
// //         footer_div.appendChild(moreBtn);
// //     }

// //     /* --- kokoaminen ------------------------------------ */
// //     card_text_content.appendChild(footer_div);
// //     card_body_div.appendChild(card_image_content);
// //     card_body_div.appendChild(card_text_content);

// //     card_content_div.appendChild(card_body_div);
// //     card.appendChild(card_content_div);

// //     return card;
// // }

// function addHeaderElement(
//     val_str,
//     label,
//     column,
//     hasLangKey,
//     row_item,
//     table_name,
//     container
// ) {
//     const headerDiv = document.createElement("div");
//     headerDiv.classList.add("card_header");

//     // --- card_pair + header_value -------------
//     const pairDiv   = document.createElement("div");
//     pairDiv.classList.add("card_pair");

//     const kvElem = createKeyValueElement(
//         label,              // näkyy vain jos show_key_on_card === true
//         val_str,            // raaka arvo
//         column,
//         hasLangKey,         // jos true → data-lang-key attribuutti, ei tekstisisältöä
//         "header_value"      // css‑luokka arvolle
//     );

//     pairDiv.appendChild(kvElem);
//     headerDiv.appendChild(pairDiv);

//     headerDiv.style.whiteSpace = "pre-wrap";

//     // --- klikillä isompi kortti ----------------
//     headerDiv.addEventListener("click", (e) => {
//         e.preventDefault();
//         open_big_card_modal(row_item, table_name);
//     });

//     // liitetään korttiin ja palautetaan ref, jotta username voidaan liittää
//     container.appendChild(headerDiv);
//     return headerDiv;
// }
// /**
//  * Lisää username-elementin korttiin (username-roolia vastaava).
//  */
// function addUsernameElement(val_str, label, column, hasLangKey) {
//     const username_div = document.createElement("div");
//     username_div.classList.add("card_username");

//     // Luodaan ikoni ja teksti
//     const iconSvg = createUserIconSvg(); // kutsu apufunktiota

//     // Jos kieliavain
//     if (hasLangKey) {
//         username_div.setAttribute("data-lang-key", val_str);
//         username_div.appendChild(iconSvg);
//         // Teksti ei näy suoraan, jos lang-key:
//         // (jos haluat, voit laittaa fallback-tekstin)
//     } else {
//         // Asetetaan ikoni + teksti
//         username_div.appendChild(iconSvg);
//         username_div.appendChild(document.createTextNode(" " + val_str));
//     }

//     return username_div;
// }
// // Palauttaa pienen user-ikonin (svg)
// function createUserIconSvg() {
//     const svgNS = "http://www.w3.org/2000/svg";
//     const svg = document.createElementNS(svgNS, "svg");
//     // Aseta katseluikkuna (viewBox) vastaamaan ikonille sopivia arvoja.
//     // Tässä esimerkissä: 0..960 leveys, -960..0 korkeus (Material-lähtöinen koordinat.)
//     svg.setAttribute("viewBox", "0 -960 960 960");
//     svg.style.width = "24px"; // Säädä mielesi mukaan
//     svg.style.height = "24px"; // Säädä mielesi mukaan

//     const path = document.createElementNS(svgNS, "path");
//     path.setAttribute(
//         "d",
//         "M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T560-640q0-33-23.5-56.5T480-720q-33 0-56.5 23.5T400-640q0 33 23.5 56.5T480-560Z"
//     );
//     // Voit halutessasi lisätä myös fill-määrittelyn:
//     path.setAttribute("fill", "currentColor");

//     svg.appendChild(path);
//     return svg;
// }

// /**
//  * Lisää kuvan tai avatarin. Klikattaessa kuvaa avautuu isompana modaalissa.
//  */
// async function addImageOrAvatar(
//     val_str,
//     tableHasImageRole,
//     creation_seed,
//     header_first_letter,
//     imageContainer
// ) {
//     let foundImage = false;
//     const elem_div = document.createElement("div");
//     elem_div.classList.add("card_image");

//     const useLargeSize = tableHasImageRole;
//     if (val_str.trim()) {
//         foundImage = true;
//         let image_src = val_str.trim();

//         // Polun korjaus
//         if (
//             !image_src.startsWith("http://") &&
//             !image_src.startsWith("https://") &&
//             !image_src.startsWith("./") &&
//             !image_src.startsWith("/")
//         ) {
//             const match = image_src.match(/^(\d+)_(\d+)_(\d+)\.(\w+)$/);
//             if (match) {
//                 const mainTableId = match[1];
//                 const mainRowId = match[2];
//                 image_src = `/media/${mainTableId}/${mainRowId}/${image_src}`;
//             } else {
//                 image_src = "/media/" + image_src;
//             }
//         }

//         // Luodaan kuva
//         const blurredImageElement = createImageElement(image_src, useLargeSize);

//         // Lisätään klikkauskuuntelija, joka avaa modaalin
//         blurredImageElement.addEventListener("click", () => {
//             openImageModal(image_src);
//         });

//         elem_div.appendChild(blurredImageElement);
//     } else {
//         // Avatar
//         const avatar = await create_seeded_avatar(
//             creation_seed,
//             header_first_letter,
//             useLargeSize
//         );

//         // Lisätään silti klikkauskuuntelija, jos halutaan avata avatar isompana (valinnainen)
//         // avatar.addEventListener("click", () => {
//         //     openImageModal(someAvatarSrcIfWanted);
//         // });

//         elem_div.appendChild(avatar);
//     }

//     imageContainer.appendChild(elem_div);
//     return foundImage;
// }

// /**
//  * Luo/avaa modaalin, jossa kuva näkyy isompana.
//  */
// function openImageModal(image_src) {
//     // Luodaan kuvakomponentti modal-sisältöä varten
//     const bigImage = document.createElement("img");
//     bigImage.src = image_src;
//     bigImage.style.maxWidth = "100%";
//     bigImage.style.height = "auto";
//     bigImage.style.display = "block";
//     bigImage.style.margin = "0 auto";

//     // Käytetään valmista createModal-funktiota
//     const { modal_overlay, modal } = createModal({
//         // Halutessa voisi käyttää otsikkoa
//         // titlePlainText: "Kuva",
//         skipModalTitle: true,
//         contentElements: [bigImage],
//         width: "auto", // Salli sisällön leveyden mukainen koko
//     });

//     // Avaa modaalin
//     showModal();

//     // Halutessa voi logittaa
//     console.log("modal avattu klikatulle kuvalle");
// }

// function addDescriptionSection(
//     description_entries,
//     row_item,
//     table_name,
//     container
// ) {
//     if (description_entries.length === 0) return;

//     // Lajitellaan
//     description_entries.sort((a, b) => a.suffix_number - b.suffix_number);

//     const desc_container = document.createElement("div");
//     desc_container.classList.add("card_description_container");

//     for (const descObj of description_entries) {
//         const d = document.createElement("div");
//         d.classList.add("single_description_item");

//         // Luodaan elementti ilman merkkirajoitusta
//         const wrapper = createKeyValueElement(
//             descObj.label,
//             descObj.rawValue,
//             descObj.column,
//             descObj.hasLangKey,
//             "description_value"
//         );

//         // Lisätään "Näytä enemmän" -linkki ja varmistetaan rivinvaihtojen näkyminen
//         const valueDiv = wrapper.querySelector(
//             `[data-column="${descObj.column}"]`
//         );
//         if (valueDiv) {
//             // näytetään rivinvaihdot
//             valueDiv.style.whiteSpace = "pre-wrap";

//             valueDiv.appendChild(document.createTextNode(" "));
//             const showMoreLink = createShowMoreLink(row_item, table_name);
//             showMoreLink.style.display = "none"; // piilotetaan linkki aluksi
//             valueDiv.appendChild(showMoreLink);
//         }

//         d.appendChild(wrapper);
//         desc_container.appendChild(d);
//     }

//     container.appendChild(desc_container);
// }

// // Tarkistetaan DOMin latauksen jälkeen, onko teksti pidempi kuin kaksi riviä
// document.addEventListener("DOMContentLoaded", function () {
//     const descriptionValues = document.querySelectorAll(".description_value");
//     descriptionValues.forEach(function (valueDiv) {
//         const showMoreLink = valueDiv.querySelector(".show_more_link");
//         if (showMoreLink) {
//             const lineHeight = parseInt(
//                 window.getComputedStyle(valueDiv).lineHeight
//             );
//             const maxHeight = lineHeight * 2; // Kahden rivin korkeus
//             if (valueDiv.scrollHeight > maxHeight) {
//                 showMoreLink.style.display = "inline"; // Näytä linkki, jos teksti on pidempi
//             }
//         }
//     });
// });

// // keywords.js
// function addKeywordsSection(keywords_list, row_item, table_name, container) {
//     /* --- funktio-laskuri --------------------------------------------- */
//     count_this_function("addKeywordsSection");

//     /* --- ei avainsanoja => ei mitään --------------------------------- */
//     if (keywords_list.length === 0) return;

//     /* --- ulkoinen container ------------------------------------------ */
//     const keywordsOuterContainer = document.createElement("div");
//     keywordsOuterContainer.classList.add("card_keywords_container");
//     // keywordsOuterContainer.style.display    = "flex";
//     // keywordsOuterContainer.style.flexWrap   = "nowrap";
//     keywordsOuterContainer.style.overflow   = "hidden";
//     // keywordsOuterContainer.style.whiteSpace = "nowrap";
//     container.appendChild(keywordsOuterContainer);

//     /* ------------------------------------------------------------------
//        1) Litistetään kaikki avainsanat → helppo rajata kolmeen
//     ------------------------------------------------------------------ */
//     const allKeywordEntries = []; // { kwObj, word }

//     for (const kwObj of keywords_list) {
//         kwObj.rawValue
//             .split(",")
//             .map(s => s.trim())
//             .filter(Boolean)
//             .forEach(word => allKeywordEntries.push({ kwObj, word }));
//     }

//     const keywordsToShow        = allKeywordEntries.slice(0, 3);
//     const remainingKeywordCount = allKeywordEntries.length - keywordsToShow.length;

//     /* ------------------------------------------------------------------
//        2) Rakennetaan tagit avainsanoille
//     ------------------------------------------------------------------ */
//     const tagEntriesForLayout = []; // { dom, width }

//     for (const { kwObj, word } of keywordsToShow) {
//         const tagDiv = document.createElement("div");
//         tagDiv.style.backgroundColor = "var(--bg_color)";
//         tagDiv.style.borderRadius    = "10px";
//         tagDiv.style.padding         = "1px 3px";
//         tagDiv.style.margin          = "3px";
//         tagDiv.style.display         = "inline-block";
//         tagDiv.style.whiteSpace      = "nowrap";
//         tagDiv.style.flexShrink      = "0";

//         /* --- sisäteksti + mahdollinen 'Näytä enemmän' --------------- */
//         let contentElement;
//         if (!kwObj.hasLangKey && word.length > 100) {
//             const shortened = word.slice(0, 100) + "...";
//             contentElement = createKeyValueElement(
//                 kwObj.label,
//                 shortened,
//                 kwObj.column,
//                 kwObj.hasLangKey,
//                 "keyword_value"
//             );
//             const v = contentElement.querySelector(
//                 `[data-column="${kwObj.column}"]`
//             );
//             if (v) {
//                 v.appendChild(document.createTextNode(" "));
//                 v.appendChild(createShowMoreLink(row_item, table_name));
//             }
//         } else {
//             contentElement = createKeyValueElement(
//                 kwObj.label,
//                 word,
//                 kwObj.column,
//                 kwObj.hasLangKey,
//                 "keyword_value"
//             );
//         }

//         tagDiv.appendChild(contentElement);
//         keywordsOuterContainer.appendChild(tagDiv);
//         tagEntriesForLayout.push({ dom: tagDiv, width: 0 });
//     }

//     // /* ------------------------------------------------------------------
//     //    3) Lisätään “n lisää” -tagi samoin rakentein, jos tarpeen
//     // ------------------------------------------------------------------ */
//     // if (remainingKeywordCount > 0) {
//     //     const counterTagDiv = document.createElement("div");
//     //     counterTagDiv.style.backgroundColor = "var(--bg_color)";
//     //     counterTagDiv.style.borderRadius    = "10px";
//     //     counterTagDiv.style.padding         = "1px 3px";
//     //     counterTagDiv.style.margin          = "3px";
//     //     counterTagDiv.style.display         = "inline-block";
//     //     counterTagDiv.style.whiteSpace      = "nowrap";
//     //     counterTagDiv.style.flexShrink      = "0";

//     //     /* — sama elementtihierarkia kuin muillakin tageilla — */
//     //     const counterContent = createKeyValueElement(
//     //         "",                              // ei label-tekstiä
//     //         `${remainingKeywordCount} lisää`,
//     //         "keywords_static",               // sama column kuin muillakin
//     //         false,                           // hasLangKey
//     //         "keyword_value"
//     //     );

//     //     counterTagDiv.appendChild(counterContent);
//     //     keywordsOuterContainer.appendChild(counterTagDiv);
//     //     tagEntriesForLayout.push({ dom: counterTagDiv, width: 0 });
//     // }

//     /* ------------------------------------------------------------------
//        4) Välimuistitetaan leveydet (pakollinen reflow)
//     ------------------------------------------------------------------ */
//     tagEntriesForLayout.forEach(e => {
//         e.width = e.dom.getBoundingClientRect().width;
//     });

//     /* ------------------------------------------------------------------
//        5) Näkyvyysalgoritmi
//     ------------------------------------------------------------------ */
//     function layoutTagsByAvailableWidth() {
//         const available = keywordsOuterContainer.clientWidth;
//         let used        = 0;

//         for (const { dom, width } of tagEntriesForLayout) {
//             if (used + width <= available) {
//                 dom.style.display = "inline-block";
//                 used += width;
//             } else {
//                 dom.style.display = "none";
//             }
//         }
//     }

//     /* Ensimmäinen layout heti */
//     layoutTagsByAvailableWidth();

//     /* ------------------------------------------------------------------
//        6) ResizeObserver kontille
//     ------------------------------------------------------------------ */
//     const resizeObserver = new ResizeObserver(layoutTagsByAvailableWidth);
//     resizeObserver.observe(keywordsOuterContainer);

//     /* ------------------------------------------------------------------
//        7) Siivoa, kun kortti poistuu
//     ------------------------------------------------------------------ */
//     const mutationObserver = new MutationObserver(muts => {
//         muts.forEach(mut => {
//             mut.removedNodes.forEach(node => {
//                 if (node === keywordsOuterContainer) {
//                     resizeObserver.disconnect();
//                     mutationObserver.disconnect();
//                 }
//             });
//         });
//     });
//     mutationObserver.observe(container, { childList: true });
// }

// /**
//  * Lisää details-osiot korttiin (details ja details_link) ja välttää koodin toistamista.
//  */
// function addDetailsSection(details_entries, row_item, table_name, container) {
//     if (details_entries.length === 0) return;

//     details_entries.sort((a, b) => a.suffix_number - b.suffix_number);

//     const mid_point = Math.ceil(details_entries.length / 2);
//     const left_details = details_entries.slice(0, mid_point);
//     const right_details = details_entries.slice(mid_point);

//     const details_container = document.createElement("div");
//     details_container.classList.add("card_details_container");

//     details_container.appendChild(createDetailsTable(left_details, row_item, table_name));
//     details_container.appendChild(createDetailsTable(right_details, row_item, table_name));

//     container.appendChild(details_container);
// }

// /**
//  * Luo details-taulukon annetulle details-listalle.
//  */
// function createDetailsTable(detailsList, row_item, table_name) {
//     const table = document.createElement("table");
//     table.classList.add("card_table");

//     detailsList.forEach((detailObj) => {
//         const row = document.createElement("tr");

//         /* ---------- KEY ---------- */
//         const key_cell = document.createElement("th");
//         // Näytetään kieliavain‑attribuuttina
//         key_cell.setAttribute("data-lang-key", detailObj.column);

//         /* ---------- VALUE ---------- */
//         const value_cell = document.createElement("td");

//         if (detailObj.isLink) {
//             const linkValue = detailObj.rawValue.trim();

//             // Yritetään parsia <a> -elementti jos se on suoraan HTML:nä
//             if (linkValue.startsWith("<a ")) {
//                 const parser = new DOMParser();
//                 const doc = parser.parseFromString(linkValue, "text/html");
//                 const anchor = doc.querySelector("a");
//                 if (anchor) {
//                     const actualHref = anchor.getAttribute("href");
//                     const linkText = anchor.textContent || actualHref;
//                     const newLink = document.createElement("a");
//                     newLink.href = actualHref;
//                     newLink.target = "_blank";
//                     newLink.textContent = linkText;
//                     value_cell.appendChild(newLink);
//                 } else {
//                     const fallbackLink = document.createElement("a");
//                     fallbackLink.href = linkValue;
//                     fallbackLink.target = "_blank";
//                     fallbackLink.textContent = linkValue;
//                     value_cell.appendChild(fallbackLink);
//                 }
//             } else {
//                 const link = document.createElement("a");
//                 link.href = linkValue;
//                 link.target = "_blank";
//                 link.textContent = linkValue;
//                 value_cell.appendChild(link);
//             }
//         } else if (!detailObj.hasLangKey && detailObj.rawValue.length > 80) {
//             const truncatedText = detailObj.rawValue.slice(0, 80) + "...";
//             value_cell.textContent = truncatedText + " ";
//             value_cell.appendChild(createShowMoreLink(row_item, table_name));
//         } else {
//             value_cell.textContent = detailObj.rawValue;
//         }

//         row.appendChild(key_cell);
//         row.appendChild(value_cell);
//         table.appendChild(row);
//     });

//     return table;
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

// export async function create_card_view(columns, data, table_name) {
//     const card_container = document.createElement("div");
//     card_container.classList.add("card_container");

//     let data_types = JSON.parse(localStorage.getItem(`${table_name}_dataTypes`)) || {};

//     for (const row_item of data) {
//         const card = await createSingleCard(row_item, columns, table_name, data_types);
//         card_container.appendChild(card);
//     }

//     return card_container;
// }
