// create_filter_bar.js (peruskäyttäjän ja adminin yhteinen runko)

import { resetOffset } from "../infinite_scroll/infinite_scroll.js";
import {
    getUnifiedTableState,
    setUnifiedTableState,
    refreshTableUnified,
} from "../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js";

import { create_collapsible_section } from "../../common_components/collapsible-section/collapsible_section.js";
import { create_chat_ui } from "../../common_components/ai_features/table_chat/chat.js";
import { generate_table } from "../table_views/view_table.js";

// Peruskäyttäjän nappi
import { createAddRowButton } from "../general_tables/gt_toolbar/button_factory.js";

// Admin-ominaisuudet eriytettynä
import { appendAdminFeatures } from "./create_filter_bar_admin.js";

import { createColumnVisibilityDropdown } from "../general_tables/gt_toolbar/column_visibility_dropdown.js";

/**
 * Haetaan rivimäärä (esimerkkinä).
 */
async function fetchRowCount(table_name) {
    try {
        const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
            method: "GET",
            credentials: "include",
        });
        if (!resp.ok) {
            throw new Error(`error (status: ${resp.status})`);
        }
        const data = await resp.json();
        if (data && typeof data.row_count === "number") {
            return data.row_count;
        } else {
            throw new Error("row_count missing in response");
        }
    } catch (error) {
        console.error("virhe fetchRowCount-funktiossa:", error);
        return null;
    }
}

/**
 * Luokitellaan sarake (esimerkki).
 */
function determineColumnCategory(column, data_type) {
    if (column === "id") {
        return "id";
    }
    const lowerCol = column.toLowerCase();
    if (lowerCol.endsWith("_id") || lowerCol.endsWith("_uid")) {
        return "additional_id";
    }
    if (
        data_type === "numeric" ||
        data_type === "integer" ||
        data_type === "bigint" ||
        data_type === "smallint" ||
        data_type === "real" ||
        data_type === "double precision"
    ) {
        return "numeric";
    }
    if (data_type === "boolean") {
        return "boolean";
    }
    if (lowerCol.endsWith("(linked)") || lowerCol.endsWith("(ln)")) {
        return "linked";
    }
    if (
        data_type === "date" ||
        data_type === "timestamp" ||
        data_type === "timestamp without time zone" ||
        data_type === "timestamp with time zone"
    ) {
        return "date";
    }
    return "text";
}

/**
 * Päivittää unified-tilan filter-osaa ja kutsuu refreshTableUnified.
 */
function updateFilterAndRefresh(tableName, colKey, value) {
    const currentState = getUnifiedTableState(tableName);

    if (!currentState.filters) {
        currentState.filters = {};
    }
    if (value === "") {
        delete currentState.filters[colKey];
    } else {
        currentState.filters[colKey] = value;
    }

    setUnifiedTableState(tableName, currentState);
    resetOffset();
    refreshTableUnified(tableName, { skipUrlParams: true });
}

/**
 * Semanttinen haku (esimerkki).
 */
async function do_semantic_search(table_name, user_query) {
    console.log("Semanttinen haku, user_query:", user_query);
    if (!user_query.trim()) return;

    const url = `/api/get-results-vector?table=${encodeURIComponent(
        table_name
    )}&vector_query=${encodeURIComponent(user_query)}`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`vector search error (status ${resp.status})`);
        }
        const data = await resp.json();
        console.log("Semanttinen haku tulos:", data);
        update_table_ui(table_name, data);
    } catch (e) {
        console.error("do_semantic_search error:", e);
    }
}

/**
 * Luo/näyttää varsinaisen taulun.
 */
async function showReadOnlyTable(table_name, columns, data, types) {
    const readOnlyContainer = document.getElementById(
        `${table_name}_readOnlyContainer`
    );
    if (!readOnlyContainer) {
        console.error("Virhe: readOnlyContainer puuttuu!");
        return;
    }
    readOnlyContainer.replaceChildren();
    await generate_table(table_name, columns, data, types);
}

/**
 * Päivittää taulun semanttisen haun tuloksilla.
 */
export async function update_table_ui(table_name, result) {
    const { columns, data, types } = result;
    await showReadOnlyTable(table_name, columns, data, types);
}

/**
 * Luodaan suodatuspalkki (filterBar), joka sisältää:
 *  - Taulun nimen ja rivimäärän
 *  - Peruskäyttäjän CRUD-napit (Add Row)
 *  - Sarakenäkyvyysnapin (esim. vain table-näkymässä)
 *  - Admin-napit omassa rivissään (viewSelector, massapoisto, embedding jne.)
 *  - (Mahd. global search ja muuta)
 */
export function create_filter_bar(table_name, columns, data_types, current_view) {
    // 0) Haetaan tai luodaan table_parts_container
    let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
    if (!table_parts_container) {
        table_parts_container = document.createElement("div");
        table_parts_container.id = `${table_name}_table_parts_container`;
        document.body.appendChild(table_parts_container);
    }

    // 1) Luodaan filterBar, jos sitä ei vielä ole
    let filter_bar = document.getElementById(`${table_name}_filterBar`);
    if (!filter_bar) {
        filter_bar = document.createElement("div");
        filter_bar.id = `${table_name}_filterBar`;
        filter_bar.classList.add("filterBar");

        // 1a) Ylin rivirakenne: taulun otsikko + rivimäärä
        const title_container = document.createElement("div");
        title_container.style.display = "flex";
        title_container.style.justifyContent = "space-between";
        title_container.style.alignItems = "baseline";

        // Vasen puoli: taulun nimi
        const left_part = document.createElement("div");
        const table_name_element = document.createElement("div");
        table_name_element.textContent = table_name;
        table_name_element.style.fontWeight = "bold";
        table_name_element.style.fontSize = "20px";
        table_name_element.setAttribute("data-lang-key", table_name);
        table_name_element.title = table_name;
        left_part.appendChild(table_name_element);

        // Pienemmällä fontilla sama nimi (esimerkki)
        const small_table_name_div = document.createElement("div");
        small_table_name_div.textContent = table_name;
        left_part.appendChild(small_table_name_div);

        // Oikea puoli: rivimäärä
        const row_count_element = document.createElement("span");
        row_count_element.textContent = "... ";

        fetchRowCount(table_name).then((count) => {
            const theNumber = count !== null ? count : "?";
            row_count_element.textContent = theNumber + " ";
        
            const resultsText = document.createElement("span");
        
            // Tarkistetaan, onko tuloksia yksi vai useampia
            if (count === 1) {
                resultsText.setAttribute("data-lang-key", "result");
                resultsText.textContent = "result";
            } else {
                resultsText.setAttribute("data-lang-key", "results");
                resultsText.textContent = "results";
            }
        
            row_count_element.appendChild(resultsText);
        });
        
        title_container.appendChild(left_part);
        title_container.appendChild(row_count_element);
        filter_bar.appendChild(title_container);

        // 2) Luodaan top_row ja sen sisään kaksi riviä:
        //    - Rivi 1: peruskäyttäjän nappi + (tarvittaessa) sarakenäkyvyys
        //    - Rivi 2: admin-napit ja näkymävalitsin erillisinä kontteina

        const top_row = document.createElement("div");
        top_row.classList.add("filterBar-top-row");

        // --- Rivi 1: peruskäyttäjälle ---
        const first_line_div = document.createElement("div");
        first_line_div.classList.add("top-row-first-line");

        const user_buttons_container = document.createElement("div");
        user_buttons_container.classList.add("filterBar-button-container");

        // "Lisää rivi" -nappi
        user_buttons_container.appendChild(createAddRowButton(table_name));

        // Sarakenäkyvyys vain table-näkymässä
        if (current_view === "table") {
            const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
            if (tableContainer) {
                const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
                if (columnVisibilityDropdown) {
                    user_buttons_container.appendChild(columnVisibilityDropdown);
                }
            }
        }

        first_line_div.appendChild(user_buttons_container);
        top_row.appendChild(first_line_div);

        // --- Rivi 2: admin-napit + näkymävalitsin (sisarkontteina) ---
        const second_line_div = document.createElement("div");
        second_line_div.classList.add("top-row-second-line");

        // Admin-napit omaan konttiinsa
        const adminButtonsContainer = document.createElement("div");
        adminButtonsContainer.classList.add("management-buttons");

        // Näkymävalitsimen kontti
        const viewSelectorContainer = document.createElement("div");
        // viewSelectorContainer.classList.add("view-selector-buttons");

        second_line_div.appendChild(adminButtonsContainer);
        second_line_div.appendChild(viewSelectorContainer);

        // Kutsutaan admin-ominaisuudet, annetaan kaksi erillistä konttia
        appendAdminFeatures(table_name, adminButtonsContainer, viewSelectorContainer, current_view);

        top_row.appendChild(second_line_div);
        filter_bar.appendChild(top_row);

        // 3) Global search -kenttä
        const search_row = document.createElement("div");
        search_row.classList.add("filterBar-search-row");
        const global_search_input = document.createElement("input");
        global_search_input.type = "text";
        global_search_input.placeholder = "Hae jotain...";
        global_search_input.id = `${table_name}_global_search_input`;
        //classlist add
        global_search_input.classList.add("global-search-input");

        // Luetaan unified-tilasta
        const currentState = getUnifiedTableState(table_name);
        if (
            currentState.filters &&
            currentState.filters[global_search_input.id]
        ) {
            global_search_input.value =
                currentState.filters[global_search_input.id];
        }

        // Hakukentän live-haku -> päivitetään unified-tila
        global_search_input.addEventListener("input", () => {
            updateFilterAndRefresh(
                table_name,
                global_search_input.id,
                global_search_input.value
            );
        });

        search_row.appendChild(global_search_input);
        filter_bar.appendChild(search_row);

        // 4) Varsinainen suodatus- ja järjestämispaneeli
        const categorizedCols = {
            id: [],
            numeric: [],
            boolean: [],
            linked: [],
            text: [],
            date: [],
            additional_id: [],
        };

        columns.forEach((col) => {
            let dt = data_types[col];
            let actualType = dt && dt.data_type ? dt.data_type : dt;
            const category = determineColumnCategory(col, actualType);
            categorizedCols[category].push(col);
        });

        const orderedMainFilters = [
            ...categorizedCols.id,
            ...categorizedCols.numeric,
            ...categorizedCols.boolean,
            ...categorizedCols.linked,
            ...categorizedCols.text,
            ...categorizedCols.date,
        ];
        const additionalIdColumns = categorizedCols.additional_id;

        const mainFilterContainer = document.createElement("div");
        mainFilterContainer.classList.add("combined-filter-sort-container");

        function createRowForColumn(container, column) {
            const row_container = document.createElement("div");
            row_container.classList.add("row-container");

            const sort_button = document.createElement("button");
            sort_button.setAttribute("data-sort-state", "none");
            sort_button.textContent = "\u21C5"; // ↕ default

            // Jos unified-tilassa on sorttaus
            if (
                currentState.sort &&
                currentState.sort.column === column &&
                currentState.sort.direction
            ) {
                if (currentState.sort.direction.toLowerCase() === "asc") {
                    sort_button.setAttribute("data-sort-state", "asc");
                    sort_button.textContent = "\u25B2"; // ▲
                } else {
                    sort_button.setAttribute("data-sort-state", "desc");
                    sort_button.textContent = "\u25BC"; // ▼
                }
            }

            sort_button.addEventListener("click", () => {
                // Nollataan muut painikkeet
                const allSortButtons = container.querySelectorAll(
                    "button[data-sort-state]"
                );
                allSortButtons.forEach((btn) => {
                    if (btn !== sort_button) {
                        btn.setAttribute("data-sort-state", "none");
                        btn.textContent = "\u21C5";
                    }
                });

                let currentStateValue =
                    sort_button.getAttribute("data-sort-state");
                let newState;
                if (currentStateValue === "none") {
                    newState = "asc";
                    sort_button.textContent = "\u25B2";
                } else if (currentStateValue === "asc") {
                    newState = "desc";
                    sort_button.textContent = "\u25BC";
                } else {
                    newState = "none";
                    sort_button.textContent = "\u21C5";
                }
                sort_button.setAttribute("data-sort-state", newState);

                const st = getUnifiedTableState(table_name);
                if (newState === "none") {
                    st.sort.column = null;
                    st.sort.direction = null;
                } else {
                    st.sort.column = column;
                    st.sort.direction = newState === "asc" ? "ASC" : "DESC";
                }
                setUnifiedTableState(table_name, st);

                resetOffset();
                refreshTableUnified(table_name, { skipUrlParams: true });
            });

            // Varsinainen filtterikenttä
            const filter_element = create_filter_element(
                table_name,
                column,
                data_types[column]
            );
            row_container.appendChild(sort_button);
            row_container.appendChild(filter_element);
            container.appendChild(row_container);
        }

        function create_filter_element(table_name, column, colType) {
            const container = document.createElement("div");
            container.classList.add("input-group");

            const dt_string =
                typeof colType === "object" && colType.data_type
                    ? colType.data_type.toLowerCase()
                    : (colType || "").toLowerCase();

            // Jos haluat special-case "openai_embedding" -> semanttinen haku
            if (column === "openai_embedding") {
                const semantic_input = document.createElement("input");
                semantic_input.type = "text";
                semantic_input.placeholder = "Anna semanttinen hakusana...";
                semantic_input.id = `${table_name}_filter_semantic_${column}`;

                const st = getUnifiedTableState(table_name);
                if (st.filters && st.filters[semantic_input.id]) {
                    semantic_input.value = st.filters[semantic_input.id];
                }

                semantic_input.addEventListener("keypress", (e) => {
                    if (e.key === "Enter") {
                        do_semantic_search(table_name, semantic_input.value);
                    }
                });
                container.appendChild(semantic_input);

                // Label ilman tekstiä, mutta data-lang-key:ksi laitetaan haluttu avain
                const label = document.createElement("label");
                label.setAttribute("for", semantic_input.id);
                label.setAttribute("data-lang-key", "semantic_vector_search");
                container.appendChild(label);
                return container;
            }

            // Numeriikkaa tai päivämäärää -> min–max
            if (
                [
                    "integer",
                    "bigint",
                    "smallint",
                    "numeric",
                    "real",
                    "double precision",
                    "date",
                    "timestamp",
                    "timestamp without time zone",
                    "timestamp with time zone",
                ].includes(dt_string)
            ) {
                const fromInput = document.createElement("input");
                const toInput = document.createElement("input");

                if (
                    [
                        "integer",
                        "bigint",
                        "smallint",
                        "numeric",
                        "real",
                        "double precision",
                    ].includes(dt_string)
                ) {
                    fromInput.type = "number";
                    toInput.type = "number";
                    fromInput.placeholder = "Min";
                    toInput.placeholder = "Max";
                } else {
                    fromInput.type = "date";
                    toInput.type = "date";
                    fromInput.placeholder = "From";
                    toInput.placeholder = "To";
                }
                fromInput.id = `${column}_from`;
                toInput.id = `${column}_to`;

                const st = getUnifiedTableState(table_name);
                if (st.filters && st.filters[fromInput.id]) {
                    fromInput.value = st.filters[fromInput.id];
                }
                if (st.filters && st.filters[toInput.id]) {
                    toInput.value = st.filters[toInput.id];
                }

                fromInput.addEventListener("input", () => {
                    updateFilterAndRefresh(
                        table_name,
                        fromInput.id,
                        fromInput.value
                    );
                });
                toInput.addEventListener("input", () => {
                    updateFilterAndRefresh(
                        table_name,
                        toInput.id,
                        toInput.value
                    );
                });

                container.appendChild(fromInput);
                container.appendChild(toInput);

                // Label ilman näkyvää tekstiä, mutta data-lang-key:
                const label = document.createElement("label");
                label.setAttribute("data-lang-key", column);
                container.appendChild(label);
            } else if (dt_string === "boolean") {
                const select = document.createElement("select");
                select.id = `${column}`;
                ["", "true", "false", "empty"].forEach((val) => {
                    const opt = document.createElement("option");
                    opt.value = val;
                    opt.textContent =
                        val === ""
                            ? "All"
                            : val === "empty"
                            ? "Empty"
                            : val.charAt(0).toUpperCase() + val.slice(1);
                    select.appendChild(opt);
                });

                const st = getUnifiedTableState(table_name);
                if (st.filters && st.filters[select.id]) {
                    select.value = st.filters[select.id];
                }

                select.addEventListener("input", () => {
                    updateFilterAndRefresh(table_name, select.id, select.value);
                });

                container.appendChild(select);

                // Label ilman tekstiä; data-lang-key = column
                const label = document.createElement("label");
                label.setAttribute("for", select.id);
                label.setAttribute("data-lang-key", column);
                container.appendChild(label);
            } else {
                // Tekstikenttä
                const input = document.createElement("input");
                input.type = "text";
                input.placeholder = " ";
                input.id = `${column}`;

                const st = getUnifiedTableState(table_name);
                if (st.filters && st.filters[input.id]) {
                    input.value = st.filters[input.id];
                }

                input.addEventListener("input", () => {
                    updateFilterAndRefresh(table_name, input.id, input.value);
                });
                container.appendChild(input);

                // Label ilman tekstiä; data-lang-key = column
                const label = document.createElement("label");
                label.setAttribute("for", input.id);
                label.setAttribute("data-lang-key", column);
                container.appendChild(label);
            }
            return container;
        }

        // Luodaan filtterikentät
        orderedMainFilters.forEach((col) => {
            createRowForColumn(mainFilterContainer, col);
        });

        // Lisätään "additional_id" -sarakkeet "näytä lisää" -osioon
        const additionalIdContainer = document.createElement("div");
        additionalIdContainer.classList.add("combined-filter-sort-container");

        additionalIdColumns.forEach((col) => {
            createRowForColumn(additionalIdContainer, col);
        });

        const filtersContainer = document.createElement("div");
        filtersContainer.classList.add("combined-filter-sort-container");
        filtersContainer.appendChild(mainFilterContainer);

        if (additionalIdColumns.length > 0) {
            const additionalWrapper = document.createElement("div");
            additionalWrapper.style.display = "none";
            additionalWrapper.appendChild(additionalIdContainer);

            const moreButton = document.createElement("button");
            moreButton.setAttribute("data-lang-key", "show_more");
            moreButton.textContent = "Enemmän";
            moreButton.addEventListener("click", () => {
                if (additionalWrapper.style.display === "none") {
                    additionalWrapper.style.display = "block";
                    moreButton.setAttribute("data-lang-key", "show_less");
                    moreButton.textContent = "Vähemmän";
                } else {
                    additionalWrapper.style.display = "none";
                    moreButton.setAttribute("data-lang-key", "show_more");
                    moreButton.textContent = "Enemmän";
                }
            });

            filtersContainer.appendChild(moreButton);
            filtersContainer.appendChild(additionalWrapper);
        }

        const combinedCollapsible = create_collapsible_section(
            "Järjestä ja suodata",
            filtersContainer,
            true
        );
        filter_bar.appendChild(combinedCollapsible);

        // Kiinnitetty chat-osio collapsible
        const chatContainerDiv = document.createElement("div");
        create_chat_ui(table_name, chatContainerDiv);
        const chatCollapsible = create_collapsible_section(
            "Chat – " + table_name,
            chatContainerDiv,
            false
        );
        filter_bar.appendChild(chatCollapsible);

        // 5) Liitetään filter_bar DOM:iin
        table_parts_container.appendChild(filter_bar);

        // 6) Luodaan readOnlyContainer, jos sitä ei vielä ole
        let readOnlyContainer = document.getElementById(
            `${table_name}_readOnlyContainer`
        );
        if (!readOnlyContainer) {
            readOnlyContainer = document.createElement("div");
            readOnlyContainer.id = `${table_name}_readOnlyContainer`;
            readOnlyContainer.classList.add("readOnlyContainer");
            table_parts_container.appendChild(readOnlyContainer);
        }
    }
}


// // create_filter_bar.js (peruskäyttäjän ja adminin yhteinen runko)

// import { resetOffset } from "../infinite_scroll/infinite_scroll.js";
// import {
//     getUnifiedTableState,
//     setUnifiedTableState,
//     refreshTableUnified,
// } from "../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js";

// import { create_collapsible_section } from "../../common_components/collapsible-section/collapsible_section.js";
// import { create_chat_ui } from "../../common_components/ai_features/table_chat/chat.js";
// import { generate_table } from "../table_views/view_table.js";

// // Peruskäyttäjän nappi
// import { createAddRowButton } from "../general_tables/gt_toolbar/button_factory.js";

// // Admin-ominaisuudet eriytettynä
// import { appendAdminFeatures } from "./create_filter_bar_admin.js";

// import { createColumnVisibilityDropdown } from "../general_tables/gt_toolbar/column_visibility_dropdown.js";

// /**
//  * Haetaan rivimäärä (esimerkkinä).
//  */
// async function fetchRowCount(table_name) {
//     try {
//         const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
//             method: "GET",
//             credentials: "include",
//         });
//         if (!resp.ok) {
//             throw new Error(`error (status: ${resp.status})`);
//         }
//         const data = await resp.json();
//         if (data && typeof data.row_count === "number") {
//             return data.row_count;
//         } else {
//             throw new Error("row_count missing in response");
//         }
//     } catch (error) {
//         console.error("virhe fetchRowCount-funktiossa:", error);
//         return null;
//     }
// }

// /**
//  * Luokitellaan sarake (esimerkki).
//  */
// function determineColumnCategory(column, data_type) {
//     if (column === "id") {
//         return "id";
//     }
//     const lowerCol = column.toLowerCase();
//     if (lowerCol.endsWith("_id") || lowerCol.endsWith("_uid")) {
//         return "additional_id";
//     }
//     if (
//         data_type === "numeric" ||
//         data_type === "integer" ||
//         data_type === "bigint" ||
//         data_type === "smallint" ||
//         data_type === "real" ||
//         data_type === "double precision"
//     ) {
//         return "numeric";
//     }
//     if (data_type === "boolean") {
//         return "boolean";
//     }
//     if (lowerCol.endsWith("(linked)") || lowerCol.endsWith("(ln)")) {
//         return "linked";
//     }
//     if (
//         data_type === "date" ||
//         data_type === "timestamp" ||
//         data_type === "timestamp without time zone" ||
//         data_type === "timestamp with time zone"
//     ) {
//         return "date";
//     }
//     return "text";
// }

// /**
//  * Päivittää unified-tilan filter-osaa ja kutsuu refreshTableUnified.
//  */
// function updateFilterAndRefresh(tableName, colKey, value) {
//     const currentState = getUnifiedTableState(tableName);

//     if (!currentState.filters) {
//         currentState.filters = {};
//     }
//     if (value === "") {
//         delete currentState.filters[colKey];
//     } else {
//         currentState.filters[colKey] = value;
//     }

//     setUnifiedTableState(tableName, currentState);
//     resetOffset();
//     refreshTableUnified(tableName, { skipUrlParams: true });
// }

// /**
//  * Semanttinen haku (esimerkki).
//  */
// async function do_semantic_search(table_name, user_query) {
//     console.log("Semanttinen haku, user_query:", user_query);
//     if (!user_query.trim()) return;

//     const url = `/api/get-results-vector?table=${encodeURIComponent(
//         table_name
//     )}&vector_query=${encodeURIComponent(user_query)}`;
//     try {
//         const resp = await fetch(url);
//         if (!resp.ok) {
//             throw new Error(`vector search error (status ${resp.status})`);
//         }
//         const data = await resp.json();
//         console.log("Semanttinen haku tulos:", data);
//         update_table_ui(table_name, data);
//     } catch (e) {
//         console.error("do_semantic_search error:", e);
//     }
// }

// /**
//  * Luo/näyttää varsinaisen taulun.
//  */
// async function showReadOnlyTable(table_name, columns, data, types) {
//     const readOnlyContainer = document.getElementById(
//         `${table_name}_readOnlyContainer`
//     );
//     if (!readOnlyContainer) {
//         console.error("Virhe: readOnlyContainer puuttuu!");
//         return;
//     }
//     readOnlyContainer.replaceChildren();
//     await generate_table(table_name, columns, data, types);
// }

// /**
//  * Päivittää taulun semanttisen haun tuloksilla.
//  */
// export async function update_table_ui(table_name, result) {
//     const { columns, data, types } = result;
//     await showReadOnlyTable(table_name, columns, data, types);
// }

// /**
//  * Luodaan suodatuspalkki (filterBar), joka sisältää:
//  *  - Taulun nimen ja rivimäärän
//  *  - Peruskäyttäjän CRUD-napit (Add Row)
//  *  - Sarakenäkyvyysnapin (esim. vain table-näkymässä)
//  *  - Admin-napit omassa rivissään (viewSelector, massapoisto, embedding jne.)
//  *  - (Mahd. global search ja muuta)
//  */
// export function create_filter_bar(table_name, columns, data_types, current_view) {
//     // 0) Haetaan tai luodaan table_parts_container
//     let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
//     if (!table_parts_container) {
//         table_parts_container = document.createElement("div");
//         table_parts_container.id = `${table_name}_table_parts_container`;
//         document.body.appendChild(table_parts_container);
//     }

//     // 1) Luodaan filterBar, jos sitä ei vielä ole
//     let filter_bar = document.getElementById(`${table_name}_filterBar`);
//     if (!filter_bar) {
//         filter_bar = document.createElement("div");
//         filter_bar.id = `${table_name}_filterBar`;
//         filter_bar.classList.add("filterBar");

//         // 1a) Ylin rivirakenne: taulun otsikko + rivimäärä
//         const title_container = document.createElement("div");
//         title_container.style.display = "flex";
//         title_container.style.justifyContent = "space-between";
//         title_container.style.alignItems = "baseline";

//         // Vasen puoli: taulun nimi
//         const left_part = document.createElement("div");
//         const table_name_element = document.createElement("div");
//         table_name_element.textContent = table_name;
//         table_name_element.style.fontWeight = "bold";
//         table_name_element.style.fontSize = "20px";
//         table_name_element.setAttribute("data-lang-key", table_name);
//         table_name_element.title = table_name;
//         left_part.appendChild(table_name_element);

//         // Pienemmällä fontilla sama nimi (esimerkki)
//         const small_table_name_div = document.createElement("div");
//         small_table_name_div.textContent = table_name;
//         left_part.appendChild(small_table_name_div);

//         // Oikea puoli: rivimäärä
//         const row_count_element = document.createElement("span");
//         row_count_element.textContent = "... ";

//         fetchRowCount(table_name).then((count) => {
//             const theNumber = count !== null ? count : "?";
//             row_count_element.textContent = theNumber + " ";
        
//             const resultsText = document.createElement("span");
        
//             // Tarkistetaan, onko tuloksia yksi vai useampia
//             if (count === 1) {
//                 resultsText.setAttribute("data-lang-key", "result");
//                 resultsText.textContent = "result";
//             } else {
//                 resultsText.setAttribute("data-lang-key", "results");
//                 resultsText.textContent = "results";
//             }
        
//             row_count_element.appendChild(resultsText);
//         });
        

//         title_container.appendChild(left_part);
//         title_container.appendChild(row_count_element);
//         filter_bar.appendChild(title_container);

//         // 2) Luodaan top_row ja sen sisään kaksi riviä:
//         //    - Rivi 1: peruskäyttäjän nappi + (tarvittaessa) sarakenäkyvyys
//         //    - Rivi 2: admin-napit ja näkymävalitsin erillisinä kontteina

//         const top_row = document.createElement("div");
//         top_row.classList.add("filterBar-top-row");

//         // --- Rivi 1: peruskäyttäjälle ---
//         const first_line_div = document.createElement("div");
//         first_line_div.classList.add("top-row-first-line");

//         const user_buttons_container = document.createElement("div");
//         user_buttons_container.classList.add("filterBar-button-container");

//         // "Lisää rivi" -nappi
//         user_buttons_container.appendChild(createAddRowButton(table_name));

//         // Sarakenäkyvyys vain table-näkymässä
//         if (current_view === "table") {
//             const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
//             if (tableContainer) {
//                 const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
//                 if (columnVisibilityDropdown) {
//                     user_buttons_container.appendChild(columnVisibilityDropdown);
//                 }
//             }
//         }

//         first_line_div.appendChild(user_buttons_container);
//         top_row.appendChild(first_line_div);

//         // --- Rivi 2: admin-napit + näkymävalitsin (sisarkontteina) ---
//         const second_line_div = document.createElement("div");
//         second_line_div.classList.add("top-row-second-line");

//         // Admin-napit omaan konttiinsa
//         const adminButtonsContainer = document.createElement("div");
//         adminButtonsContainer.classList.add("management-buttons");

//         // Näkymävalitsimen kontti
//         const viewSelectorContainer = document.createElement("div");
//         // viewSelectorContainer.classList.add("view-selector-buttons");

//         second_line_div.appendChild(adminButtonsContainer);
//         second_line_div.appendChild(viewSelectorContainer);

//         // Kutsutaan admin-ominaisuudet, annetaan kaksi erillistä konttia
//         appendAdminFeatures(table_name, adminButtonsContainer, viewSelectorContainer, current_view);

//         top_row.appendChild(second_line_div);
//         filter_bar.appendChild(top_row);

//         // 3) Global search -kenttä
//         const search_row = document.createElement("div");
//         search_row.classList.add("filterBar-search-row");
//         const global_search_input = document.createElement("input");
//         global_search_input.type = "text";
//         global_search_input.placeholder = "Hae jotain...";
//         global_search_input.id = `${table_name}_global_search_input`;

//         // Luetaan unified-tilasta
//         const currentState = getUnifiedTableState(table_name);
//         if (
//             currentState.filters &&
//             currentState.filters[global_search_input.id]
//         ) {
//             global_search_input.value =
//                 currentState.filters[global_search_input.id];
//         }

//         // Hakukentän live-haku -> päivitetään unified-tila
//         global_search_input.addEventListener("input", () => {
//             updateFilterAndRefresh(
//                 table_name,
//                 global_search_input.id,
//                 global_search_input.value
//             );
//         });

//         search_row.appendChild(global_search_input);
//         filter_bar.appendChild(search_row);

//         // 4) Varsinainen suodatus- ja järjestämispaneeli
//         const categorizedCols = {
//             id: [],
//             numeric: [],
//             boolean: [],
//             linked: [],
//             text: [],
//             date: [],
//             additional_id: [],
//         };

//         columns.forEach((col) => {
//             let dt = data_types[col];
//             let actualType = dt && dt.data_type ? dt.data_type : dt;
//             const category = determineColumnCategory(col, actualType);
//             categorizedCols[category].push(col);
//         });

//         const orderedMainFilters = [
//             ...categorizedCols.id,
//             ...categorizedCols.numeric,
//             ...categorizedCols.boolean,
//             ...categorizedCols.linked,
//             ...categorizedCols.text,
//             ...categorizedCols.date,
//         ];
//         const additionalIdColumns = categorizedCols.additional_id;

//         const mainFilterContainer = document.createElement("div");
//         mainFilterContainer.classList.add("combined-filter-sort-container");

//         function createRowForColumn(container, column) {
//             const row_container = document.createElement("div");
//             row_container.classList.add("row-container");

//             const sort_button = document.createElement("button");
//             sort_button.setAttribute("data-sort-state", "none");
//             sort_button.textContent = "\u21C5"; // ↕ default

//             // Jos unified-tilassa on sorttaus
//             if (
//                 currentState.sort &&
//                 currentState.sort.column === column &&
//                 currentState.sort.direction
//             ) {
//                 if (currentState.sort.direction.toLowerCase() === "asc") {
//                     sort_button.setAttribute("data-sort-state", "asc");
//                     sort_button.textContent = "\u25B2"; // ▲
//                 } else {
//                     sort_button.setAttribute("data-sort-state", "desc");
//                     sort_button.textContent = "\u25BC"; // ▼
//                 }
//             }

//             sort_button.addEventListener("click", () => {
//                 // Nollataan muut painikkeet
//                 const allSortButtons = container.querySelectorAll(
//                     "button[data-sort-state]"
//                 );
//                 allSortButtons.forEach((btn) => {
//                     if (btn !== sort_button) {
//                         btn.setAttribute("data-sort-state", "none");
//                         btn.textContent = "\u21C5";
//                     }
//                 });

//                 let currentStateValue =
//                     sort_button.getAttribute("data-sort-state");
//                 let newState;
//                 if (currentStateValue === "none") {
//                     newState = "asc";
//                     sort_button.textContent = "\u25B2";
//                 } else if (currentStateValue === "asc") {
//                     newState = "desc";
//                     sort_button.textContent = "\u25BC";
//                 } else {
//                     newState = "none";
//                     sort_button.textContent = "\u21C5";
//                 }
//                 sort_button.setAttribute("data-sort-state", newState);

//                 const st = getUnifiedTableState(table_name);
//                 if (newState === "none") {
//                     st.sort.column = null;
//                     st.sort.direction = null;
//                 } else {
//                     st.sort.column = column;
//                     st.sort.direction = newState === "asc" ? "ASC" : "DESC";
//                 }
//                 setUnifiedTableState(table_name, st);

//                 resetOffset();
//                 refreshTableUnified(table_name, { skipUrlParams: true });
//             });

//             // Varsinainen filtterikenttä
//             const filter_element = create_filter_element(
//                 table_name,
//                 column,
//                 data_types[column]
//             );
//             row_container.appendChild(sort_button);
//             row_container.appendChild(filter_element);
//             container.appendChild(row_container);
//         }

//         function create_filter_element(table_name, column, colType) {
//             const container = document.createElement("div");
//             container.classList.add("input-group");

//             const dt_string =
//                 typeof colType === "object" && colType.data_type
//                     ? colType.data_type.toLowerCase()
//                     : (colType || "").toLowerCase();

//             // Jos haluat special-case "openai_embedding" -> semanttinen haku
//             if (column === "openai_embedding") {
//                 const semantic_input = document.createElement("input");
//                 semantic_input.type = "text";
//                 semantic_input.placeholder = "Anna semanttinen hakusana...";
//                 semantic_input.id = `${table_name}_filter_semantic_${column}`;

//                 const st = getUnifiedTableState(table_name);
//                 if (st.filters && st.filters[semantic_input.id]) {
//                     semantic_input.value = st.filters[semantic_input.id];
//                 }

//                 semantic_input.addEventListener("keypress", (e) => {
//                     if (e.key === "Enter") {
//                         do_semantic_search(table_name, semantic_input.value);
//                     }
//                 });
//                 container.appendChild(semantic_input);

//                 const label = document.createElement("label");
//                 label.setAttribute("for", semantic_input.id);
//                 label.textContent = "Semantic vector search";
//                 container.appendChild(label);
//                 return container;
//             }

//             // Numeriikkaa tai päivämäärää -> min–max
//             if (
//                 [
//                     "integer",
//                     "bigint",
//                     "smallint",
//                     "numeric",
//                     "real",
//                     "double precision",
//                     "date",
//                     "timestamp",
//                     "timestamp without time zone",
//                     "timestamp with time zone",
//                 ].includes(dt_string)
//             ) {
//                 const fromInput = document.createElement("input");
//                 const toInput = document.createElement("input");

//                 if (
//                     [
//                         "integer",
//                         "bigint",
//                         "smallint",
//                         "numeric",
//                         "real",
//                         "double precision",
//                     ].includes(dt_string)
//                 ) {
//                     fromInput.type = "number";
//                     toInput.type = "number";
//                     fromInput.placeholder = "Min";
//                     toInput.placeholder = "Max";
//                 } else {
//                     fromInput.type = "date";
//                     toInput.type = "date";
//                     fromInput.placeholder = "From";
//                     toInput.placeholder = "To";
//                 }
//                 fromInput.id = `${column}_from`;
//                 toInput.id = `${column}_to`;

//                 const st = getUnifiedTableState(table_name);
//                 if (st.filters && st.filters[fromInput.id]) {
//                     fromInput.value = st.filters[fromInput.id];
//                 }
//                 if (st.filters && st.filters[toInput.id]) {
//                     toInput.value = st.filters[toInput.id];
//                 }

//                 fromInput.addEventListener("input", () => {
//                     updateFilterAndRefresh(
//                         table_name,
//                         fromInput.id,
//                         fromInput.value
//                     );
//                 });
//                 toInput.addEventListener("input", () => {
//                     updateFilterAndRefresh(
//                         table_name,
//                         toInput.id,
//                         toInput.value
//                     );
//                 });

//                 container.appendChild(fromInput);
//                 container.appendChild(toInput);

//                 const label = document.createElement("label");
//                 label.textContent = column;
//                 container.appendChild(label);
//             } else if (dt_string === "boolean") {
//                 const select = document.createElement("select");
//                 select.id = `${column}`;
//                 ["", "true", "false", "empty"].forEach((val) => {
//                     const opt = document.createElement("option");
//                     opt.value = val;
//                     opt.textContent =
//                         val === ""
//                             ? "All"
//                             : val === "empty"
//                             ? "Empty"
//                             : val.charAt(0).toUpperCase() + val.slice(1);
//                     select.appendChild(opt);
//                 });

//                 const st = getUnifiedTableState(table_name);
//                 if (st.filters && st.filters[select.id]) {
//                     select.value = st.filters[select.id];
//                 }

//                 select.addEventListener("input", () => {
//                     updateFilterAndRefresh(table_name, select.id, select.value);
//                 });

//                 container.appendChild(select);
//                 const label = document.createElement("label");
//                 label.setAttribute("for", select.id);
//                 label.textContent = column;
//                 container.appendChild(label);
//             } else {
//                 // Tekstikenttä
//                 const input = document.createElement("input");
//                 input.type = "text";
//                 input.placeholder = " ";
//                 input.id = `${column}`;

//                 const st = getUnifiedTableState(table_name);
//                 if (st.filters && st.filters[input.id]) {
//                     input.value = st.filters[input.id];
//                 }

//                 input.addEventListener("input", () => {
//                     updateFilterAndRefresh(table_name, input.id, input.value);
//                 });
//                 container.appendChild(input);

//                 const label = document.createElement("label");
//                 label.setAttribute("for", input.id);
//                 label.textContent = column;
//                 container.appendChild(label);
//             }
//             return container;
//         }

//         // Luodaan filtterikentät
//         orderedMainFilters.forEach((col) => {
//             createRowForColumn(mainFilterContainer, col);
//         });

//         // Lisätään "additional_id" -sarakkeet "näytä lisää" -osioon
//         const additionalIdContainer = document.createElement("div");
//         additionalIdContainer.classList.add("combined-filter-sort-container");

//         additionalIdColumns.forEach((col) => {
//             createRowForColumn(additionalIdContainer, col);
//         });

//         const filtersContainer = document.createElement("div");
//         filtersContainer.classList.add("combined-filter-sort-container");
//         filtersContainer.appendChild(mainFilterContainer);

//         if (additionalIdColumns.length > 0) {
//             const additionalWrapper = document.createElement("div");
//             additionalWrapper.style.display = "none";
//             additionalWrapper.appendChild(additionalIdContainer);

//             const moreButton = document.createElement("button");
//             moreButton.setAttribute("data-lang-key", "show_more");
//             moreButton.textContent = "Enemmän";
//             moreButton.addEventListener("click", () => {
//                 if (additionalWrapper.style.display === "none") {
//                     additionalWrapper.style.display = "block";
//                     moreButton.setAttribute("data-lang-key", "show_less");
//                     moreButton.textContent = "Vähemmän";
//                 } else {
//                     additionalWrapper.style.display = "none";
//                     moreButton.setAttribute("data-lang-key", "show_more");
//                     moreButton.textContent = "Enemmän";
//                 }
//             });

//             filtersContainer.appendChild(moreButton);
//             filtersContainer.appendChild(additionalWrapper);
//         }

//         const combinedCollapsible = create_collapsible_section(
//             "Järjestä ja suodata",
//             filtersContainer,
//             true
//         );
//         filter_bar.appendChild(combinedCollapsible);

//         // Kiinnitetty chat-osio collapsible
//         const chatContainerDiv = document.createElement("div");
//         create_chat_ui(table_name, chatContainerDiv);
//         const chatCollapsible = create_collapsible_section(
//             "Chat – " + table_name,
//             chatContainerDiv,
//             false
//         );
//         filter_bar.appendChild(chatCollapsible);

//         // 5) Liitetään filter_bar DOM:iin
//         table_parts_container.appendChild(filter_bar);

//         // 6) Luodaan readOnlyContainer, jos sitä ei vielä ole
//         let readOnlyContainer = document.getElementById(
//             `${table_name}_readOnlyContainer`
//         );
//         if (!readOnlyContainer) {
//             readOnlyContainer = document.createElement("div");
//             readOnlyContainer.id = `${table_name}_readOnlyContainer`;
//             readOnlyContainer.classList.add("readOnlyContainer");
//             table_parts_container.appendChild(readOnlyContainer);
//         }
//     }
// }


// // create_filter_bar.js

// // 1) Tuodaan tarvittavat importit
// import { resetOffset } from "../infinite_scroll/infinite_scroll.js";
// import {
//     getUnifiedTableState,
//     setUnifiedTableState,
//     refreshTableUnified,
// } from "../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js";

// import { create_collapsible_section } from "../../common_components/collapsible-section/collapsible_section.js";
// import { create_chat_ui } from "../../common_components/ai_features/table_chat/chat.js";
// import { generate_table } from "../table_views/view_table.js";
// import {
//     createViewSelectorButtons,
//     createNewViewSelector,
// } from "../table_views/draw_view_selector_buttons.js";
// import {
//     createAddRowButton,
//     createDeleteSelectedButton,
//     createColumnManagementButton,
// } from "../general_tables/gt_toolbar/button_factory.js";
// import { createColumnVisibilityDropdown } from "../general_tables/gt_toolbar/column_visibility_dropdown.js";

// /**
//  * Haetaan rivimäärä (esimerkkinä). Voit muokata tai poistaa tämän halutessasi.
//  */
// async function fetchRowCount(table_name) {
//     try {
//         const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
//             method: "GET",
//             credentials: "include",
//         });
//         if (!resp.ok) {
//             throw new Error(`error (status: ${resp.status})`);
//         }
//         const data = await resp.json();
//         if (data && typeof data.row_count === "number") {
//             return data.row_count;
//         } else {
//             throw new Error("row_count missing in response");
//         }
//     } catch (error) {
//         console.error("virhe fetchRowCount-funktiossa:", error);
//         return null;
//     }
// }

// /**
//  * Luokitellaan sarake haluttuun kategoriaan sarakkeen nimen ja data-tyypin perusteella.
//  */
// function determineColumnCategory(column, data_type) {
//     if (column === "id") {
//         return "id";
//     }
//     const lowerCol = column.toLowerCase();
//     if (lowerCol.endsWith("_id") || lowerCol.endsWith("_uid")) {
//         return "additional_id";
//     }
//     if (
//         data_type === "numeric" ||
//         data_type === "integer" ||
//         data_type === "bigint" ||
//         data_type === "smallint" ||
//         data_type === "real" ||
//         data_type === "double precision"
//     ) {
//         return "numeric";
//     }
//     if (data_type === "boolean") {
//         return "boolean";
//     }
//     if (lowerCol.endsWith("(linked)") || lowerCol.endsWith("(ln)")) {
//         return "linked";
//     }
//     if (
//         data_type === "date" ||
//         data_type === "timestamp" ||
//         data_type === "timestamp without time zone" ||
//         data_type === "timestamp with time zone"
//     ) {
//         return "date";
//     }
//     return "text";
// }

// /**
//  * Päivittää unified-tilan filter-osaa (esim. "col_from", "col_to" jne.) ja kutsuu refreshTableUnified.
//  */
// function updateFilterAndRefresh(tableName, colKey, value) {
//     // Haetaan nykyinen tila
//     const currentState = getUnifiedTableState(tableName);

//     // Päivitetään filter-kenttä
//     if (!currentState.filters) {
//         currentState.filters = {};
//     }
//     // Jos value on tyhjä, poistetaan
//     if (value === "") {
//         delete currentState.filters[colKey];
//     } else {
//         currentState.filters[colKey] = value;
//     }

//     // Tallennus
//     setUnifiedTableState(tableName, currentState);

//     // Nollataan offset
//     resetOffset();

//     // Päivitetään taulu
//     refreshTableUnified(tableName, { skipUrlParams: true });
// }

// /**
//  * Varsinainen semanttinen haku (esimerkki).
//  */
// async function do_semantic_search(table_name, user_query) {
//     console.log("Semanttinen haku, user_query:", user_query);
//     if (!user_query.trim()) return;

//     const url = `/api/get-results-vector?table=${encodeURIComponent(
//         table_name
//     )}&vector_query=${encodeURIComponent(user_query)}`;
//     try {
//         const resp = await fetch(url);
//         if (!resp.ok) {
//             throw new Error(`vector search error (status ${resp.status})`);
//         }
//         const data = await resp.json();
//         console.log("Semanttinen haku tulos:", data);
//         update_table_ui(table_name, data);
//     } catch (e) {
//         console.error("do_semantic_search error:", e);
//     }
// }

// /**
//  * Kutsutaan generate_table(...) ja päivitetään readOnlyContainer taulun sisällöllä.
//  */
// async function showReadOnlyTable(table_name, columns, data, types) {
//     const readOnlyContainer = document.getElementById(
//         `${table_name}_readOnlyContainer`
//     );
//     if (!readOnlyContainer) {
//         console.error("Virhe: readOnlyContainer puuttuu!");
//         return;
//     }
//     readOnlyContainer.replaceChildren();
//     await generate_table(table_name, columns, data, types);
// }

// /**
//  * Päivittää taulun semanttisen haun tuloksilla.
//  */
// export async function update_table_ui(table_name, result) {
//     const { columns, data, types } = result;
//     await showReadOnlyTable(table_name, columns, data, types);
// }

// /**
//  * Avataan SSE-yhteys /openai_embedding_stream_handler -reitille
//  * ja päivitetään konsolia / pientä logia.
//  */
// function embedAllData(table_name) {
//     console.log(
//         `Aloitetaan SSE: /openai_embedding_stream_handler?table_name=${table_name}`
//     );

//     const embedLogId = `${table_name}_embed_log`;
//     let embedLog = document.getElementById(embedLogId);
//     if (!embedLog) {
//         embedLog = document.createElement("div");
//         embedLog.id = embedLogId;
//         embedLog.style.border = "1px solid var(--border_color)";
//         embedLog.style.padding = "0.5rem";
//         embedLog.style.maxHeight = "200px";
//         embedLog.style.overflowY = "auto";
//         embedLog.style.marginTop = "0.5rem";
//         const filterBar = document.getElementById(`${table_name}_filterBar`);
//         if (filterBar) {
//             filterBar.appendChild(embedLog);
//         }
//     }

//     function appendLog(msg) {
//         console.log(msg);
//         const p = document.createElement("p");
//         p.textContent = msg;
//         embedLog.appendChild(p);
//         embedLog.scrollTop = embedLog.scrollHeight;
//     }

//     const url = `/openai_embedding_stream_handler?table_name=${encodeURIComponent(
//         table_name
//     )}`;
//     const evtSource = new EventSource(url);

//     evtSource.addEventListener("progress", (e) => {
//         appendLog(`[progress] ${e.data}`);
//     });
//     evtSource.addEventListener("error", (e) => {
//         appendLog(`virhe serveriltä: ${e.data}`);
//     });
//     evtSource.addEventListener("done", (e) => {
//         appendLog(`Valmis: ${e.data}`);
//         evtSource.close();
//     });

//     evtSource.onerror = (err) => {
//         console.error("SSE transport error:", err);
//         appendLog("virhe: SSE-yhteys katkesi tai ei onnistu");
//         evtSource.close();
//     };
// }

// /**
//  * Pieni apufunktio luomaan "Embeditä data" -nappi
//  */
// function createEmbedButton(table_name) {
//     const btn = document.createElement("button");
//     btn.textContent = "Luo embedding";
//     btn.addEventListener("click", () => {
//         embedAllData(table_name);
//     });
//     return btn;
// }

// /**
//  * create_filter_bar:
//  *  - Luo suodatuspalkin (filterBar) ja asettaa kentille arvot unified-tilasta (tai localStoragesta) jo luontivaiheessa
//  *  - Yläpuolen rivit: rivimäärä, CRUD-napit, jne.
//  *  - Global-hakukenttä
//  *  - Varsinaiset sarakefiltterit (min–max, boolean, tekstikenttä jne.)
//  *  - Kiinnitetty chat-osion collapsible filterBarin sisälle
//  */
// export function create_filter_bar(
//     table_name,
//     columns,
//     data_types,
//     current_view
// ) {
//     // 0) Luodaan tai haetaan table_parts_container
//     let table_parts_container = document.getElementById(
//         `${table_name}_table_parts_container`
//     );
//     if (!table_parts_container) {
//         table_parts_container = document.createElement("div");
//         table_parts_container.id = `${table_name}_table_parts_container`;
//         document.body.appendChild(table_parts_container);
//     }

//     // 1) Luodaan filterBar, jos sitä ei vielä ole
//     let filter_bar = document.getElementById(`${table_name}_filterBar`);
//     if (!filter_bar) {
//         filter_bar = document.createElement("div");
//         filter_bar.id = `${table_name}_filterBar`;
//         filter_bar.classList.add("filterBar");

//         // 1a) Otsikko + rivimäärä samaan vaakariviin
//         const title_container = document.createElement("div");

//         // Lisätään flex-asettelu, jolloin taulun nimi vasemmalle ja rivimäärä oikealle
//         title_container.style.display = "flex";
//         title_container.style.justifyContent = "space-between";
//         title_container.style.alignItems = "baseline"; // Mieltymys, voit säätää

//         // Vasen puoli: varsinainen taulun nimi
//         const left_part = document.createElement("div");
//         const table_name_element = document.createElement("div");
//         table_name_element.textContent = table_name;
//         table_name_element.style.fontWeight = "bold";
//         table_name_element.style.fontSize = "20px";
//         table_name_element.setAttribute("data-lang-key", table_name);
//         table_name_element.title = table_name;
//         left_part.appendChild(table_name_element);

//         // Pienemmällä fontilla sama nimi (esimerkkinä)
//         const small_table_name_div = document.createElement("div");
//         small_table_name_div.textContent = table_name;
//         left_part.appendChild(small_table_name_div);

//         // Oikea puoli: rivimäärä
//         const row_count_element = document.createElement("span");
//         row_count_element.textContent = "... "; // Alkuarvo, esim. "..."

//         fetchRowCount(table_name).then((count) => {
//             const theNumber = count !== null ? count : "?";

//             // Tyhjennetään aiempi textContent ja luodaan lapsielementit
//             row_count_element.textContent = theNumber + " ";

//             const resultsText = document.createElement("span");
//             resultsText.setAttribute("data-lang-key", "results");
//             resultsText.textContent = "results";

//             row_count_element.appendChild(resultsText);
//         });

//         // Appendataan osat title_containerille
//         title_container.appendChild(left_part);
//         title_container.appendChild(row_count_element);

//         // Liitetään se filter_bariin
//         filter_bar.appendChild(title_container);

//         // 2) Yläpuolen rivit: CRUD-napit ja näkymävalitsimet
//         const top_row = document.createElement("div");
//         top_row.classList.add("filterBar-top-row");

//         // Rivimäärä poistettu täältä – on nyt otsikon rivillä

//         // CRUD-napit jne. pysyvät tässä
//         const first_line_div = document.createElement("div");
//         first_line_div.classList.add("top-row-first-line");

//         // CRUD-napit
//         const button_container_div = document.createElement("div");
//         button_container_div.classList.add("filterBar-button-container");
//         button_container_div.appendChild(createAddRowButton(table_name));
//         button_container_div.appendChild(
//             createColumnManagementButton(table_name)
//         );
//         button_container_div.appendChild(
//             createDeleteSelectedButton(table_name, current_view)
//         );

//         // Sarakenäkyvyysdropdown (esimerkkinä vain table-näkymässä)
//         if (current_view === "table") {
//             const tableContainer = document.getElementById(
//                 `${table_name}_readOnlyContainer`
//             );
//             if (tableContainer) {
//                 const columnVisibilityDropdown =
//                     createColumnVisibilityDropdown(tableContainer);
//                 if (columnVisibilityDropdown) {
//                     button_container_div.appendChild(columnVisibilityDropdown);
//                 }
//             }
//         }

//         // Embed-nappi
//         const embedBtn = createEmbedButton(table_name);
//         button_container_div.appendChild(embedBtn);

//         first_line_div.appendChild(button_container_div);
//         top_row.appendChild(first_line_div);

//         // Näkymävalitsimet toiselle riville
//         const second_line_div = document.createElement("div");
//         second_line_div.classList.add("top-row-second-line");
//         second_line_div.appendChild(
//             createViewSelectorButtons(table_name, current_view)
//         );
//         second_line_div.appendChild(
//             createNewViewSelector(table_name, current_view)
//         );
//         top_row.appendChild(second_line_div);

//         filter_bar.appendChild(top_row);

//         // 3) Global search -kenttä
//         const search_row = document.createElement("div");
//         search_row.classList.add("filterBar-search-row");
//         const global_search_input = document.createElement("input");
//         global_search_input.type = "text";
//         global_search_input.placeholder = "Hae jotain...";
//         global_search_input.id = `${table_name}_global_search_input`;

//         // Luetaan unified-tilasta (jos halutaan tukea "global_search_input" suoraan)
//         const currentState = getUnifiedTableState(table_name);
//         if (
//             currentState.filters &&
//             currentState.filters[global_search_input.id]
//         ) {
//             global_search_input.value =
//                 currentState.filters[global_search_input.id];
//         }

//         // Hakukentän live-haku -> päivitetään unified-tila
//         global_search_input.addEventListener("input", () => {
//             updateFilterAndRefresh(
//                 table_name,
//                 global_search_input.id,
//                 global_search_input.value
//             );
//         });

//         search_row.appendChild(global_search_input);
//         filter_bar.appendChild(search_row);

//         // 4) Varsinainen suodatus- ja järjestämispaneeli
//         const categorizedCols = {
//             id: [],
//             numeric: [],
//             boolean: [],
//             linked: [],
//             text: [],
//             date: [],
//             additional_id: [],
//         };

//         columns.forEach((col) => {
//             let dt = data_types[col];
//             let actualType = dt && dt.data_type ? dt.data_type : dt;
//             const category = determineColumnCategory(col, actualType);
//             categorizedCols[category].push(col);
//         });

//         const orderedMainFilters = [
//             ...categorizedCols.id,
//             ...categorizedCols.numeric,
//             ...categorizedCols.boolean,
//             ...categorizedCols.linked,
//             ...categorizedCols.text,
//             ...categorizedCols.date,
//         ];
//         const additionalIdColumns = categorizedCols.additional_id;

//         const mainFilterContainer = document.createElement("div");
//         mainFilterContainer.classList.add("combined-filter-sort-container");

//         function createRowForColumn(container, column) {
//             const row_container = document.createElement("div");
//             row_container.classList.add("row-container");

//             // Lajittelupainike
//             const sort_button = document.createElement("button");
//             sort_button.setAttribute("data-sort-state", "none");
//             sort_button.textContent = "\u21C5"; // ↕ default

//             // Jos unified-tilassa on sorttaus
//             if (
//                 currentState.sort &&
//                 currentState.sort.column === column &&
//                 currentState.sort.direction
//             ) {
//                 if (currentState.sort.direction.toLowerCase() === "asc") {
//                     sort_button.setAttribute("data-sort-state", "asc");
//                     sort_button.textContent = "\u25B2"; // ▲
//                 } else {
//                     sort_button.setAttribute("data-sort-state", "desc");
//                     sort_button.textContent = "\u25BC"; // ▼
//                 }
//             }

//             sort_button.addEventListener("click", () => {
//                 // Nollataan muut painikkeet
//                 const allSortButtons = container.querySelectorAll(
//                     "button[data-sort-state]"
//                 );
//                 allSortButtons.forEach((btn) => {
//                     if (btn !== sort_button) {
//                         btn.setAttribute("data-sort-state", "none");
//                         btn.textContent = "\u21C5";
//                     }
//                 });

//                 let currentStateValue =
//                     sort_button.getAttribute("data-sort-state");
//                 let newState;
//                 if (currentStateValue === "none") {
//                     newState = "asc";
//                     sort_button.textContent = "\u25B2";
//                 } else if (currentStateValue === "asc") {
//                     newState = "desc";
//                     sort_button.textContent = "\u25BC";
//                 } else {
//                     newState = "none";
//                     sort_button.textContent = "\u21C5";
//                 }
//                 sort_button.setAttribute("data-sort-state", newState);

//                 const st = getUnifiedTableState(table_name);
//                 if (newState === "none") {
//                     st.sort.column = null;
//                     st.sort.direction = null;
//                 } else {
//                     st.sort.column = column;
//                     st.sort.direction = newState === "asc" ? "ASC" : "DESC";
//                 }
//                 setUnifiedTableState(table_name, st);

//                 resetOffset();
//                 refreshTableUnified(table_name, { skipUrlParams: true });
//             });

//             // Varsinainen filtterikenttä
//             const filter_element = create_filter_element(
//                 table_name,
//                 column,
//                 data_types[column]
//             );
//             row_container.appendChild(sort_button);
//             row_container.appendChild(filter_element);
//             container.appendChild(row_container);
//         }

//         function create_filter_element(table_name, column, colType) {
//             const container = document.createElement("div");
//             container.classList.add("input-group");

//             const dt_string =
//                 typeof colType === "object" && colType.data_type
//                     ? colType.data_type.toLowerCase()
//                     : (colType || "").toLowerCase();

//             // Jos haluat special-case "openai_embedding" -> semanttinen haku
//             if (column === "openai_embedding") {
//                 const semantic_input = document.createElement("input");
//                 semantic_input.type = "text";
//                 semantic_input.placeholder = "Anna semanttinen hakusana...";
//                 semantic_input.id = `${table_name}_filter_semantic_${column}`;

//                 // Alustus unifyed-tilasta
//                 const st = getUnifiedTableState(table_name);
//                 if (st.filters && st.filters[semantic_input.id]) {
//                     semantic_input.value = st.filters[semantic_input.id];
//                 }

//                 semantic_input.addEventListener("keypress", (e) => {
//                     if (e.key === "Enter") {
//                         do_semantic_search(table_name, semantic_input.value);
//                     }
//                 });
//                 container.appendChild(semantic_input);

//                 const label = document.createElement("label");
//                 label.setAttribute("for", semantic_input.id);
//                 label.textContent = "Semantic vector search";
//                 container.appendChild(label);
//                 return container;
//             }

//             // Numeriikkaa tai päivämäärää -> min–max
//             if (
//                 [
//                     "integer",
//                     "bigint",
//                     "smallint",
//                     "numeric",
//                     "real",
//                     "double precision",
//                     "date",
//                     "timestamp",
//                     "timestamp without time zone",
//                     "timestamp with time zone",
//                 ].includes(dt_string)
//             ) {
//                 const fromInput = document.createElement("input");
//                 const toInput = document.createElement("input");

//                 if (
//                     [
//                         "integer",
//                         "bigint",
//                         "smallint",
//                         "numeric",
//                         "real",
//                         "double precision",
//                     ].includes(dt_string)
//                 ) {
//                     fromInput.type = "number";
//                     toInput.type = "number";
//                     fromInput.placeholder = "Min";
//                     toInput.placeholder = "Max";
//                 } else {
//                     fromInput.type = "date";
//                     toInput.type = "date";
//                     fromInput.placeholder = "From";
//                     toInput.placeholder = "To";
//                 }
//                 fromInput.id = `${column}_from`;
//                 toInput.id = `${column}_to`;

//                 const st = getUnifiedTableState(table_name);
//                 if (st.filters && st.filters[fromInput.id]) {
//                     fromInput.value = st.filters[fromInput.id];
//                 }
//                 if (st.filters && st.filters[toInput.id]) {
//                     toInput.value = st.filters[toInput.id];
//                 }

//                 fromInput.addEventListener("input", () => {
//                     updateFilterAndRefresh(
//                         table_name,
//                         fromInput.id,
//                         fromInput.value
//                     );
//                 });
//                 toInput.addEventListener("input", () => {
//                     updateFilterAndRefresh(
//                         table_name,
//                         toInput.id,
//                         toInput.value
//                     );
//                 });

//                 container.appendChild(fromInput);
//                 container.appendChild(toInput);

//                 const label = document.createElement("label");
//                 label.textContent = column;
//                 container.appendChild(label);
//             } else if (dt_string === "boolean") {
//                 const select = document.createElement("select");
//                 select.id = `${column}`;
//                 ["", "true", "false", "empty"].forEach((val) => {
//                     const opt = document.createElement("option");
//                     opt.value = val;
//                     opt.textContent =
//                         val === ""
//                             ? "All"
//                             : val === "empty"
//                             ? "Empty"
//                             : val.charAt(0).toUpperCase() + val.slice(1);
//                     select.appendChild(opt);
//                 });

//                 const st = getUnifiedTableState(table_name);
//                 if (st.filters && st.filters[select.id]) {
//                     select.value = st.filters[select.id];
//                 }

//                 select.addEventListener("input", () => {
//                     updateFilterAndRefresh(table_name, select.id, select.value);
//                 });

//                 container.appendChild(select);
//                 const label = document.createElement("label");
//                 label.setAttribute("for", select.id);
//                 label.textContent = column;
//                 container.appendChild(label);
//             } else {
//                 // Tekstikenttä
//                 const input = document.createElement("input");
//                 input.type = "text";
//                 input.placeholder = " ";
//                 input.id = `${column}`;

//                 const st = getUnifiedTableState(table_name);
//                 if (st.filters && st.filters[input.id]) {
//                     input.value = st.filters[input.id];
//                 }

//                 input.addEventListener("input", () => {
//                     updateFilterAndRefresh(table_name, input.id, input.value);
//                 });
//                 container.appendChild(input);

//                 const label = document.createElement("label");
//                 label.setAttribute("for", input.id);
//                 label.textContent = column;
//                 container.appendChild(label);
//             }
//             return container;
//         }

//         orderedMainFilters.forEach((col) => {
//             createRowForColumn(mainFilterContainer, col);
//         });

//         // Lisätään "additional_id" -sarakkeet "näytä lisää" -osioon
//         const additionalIdContainer = document.createElement("div");
//         additionalIdContainer.classList.add("combined-filter-sort-container");

//         additionalIdColumns.forEach((col) => {
//             createRowForColumn(additionalIdContainer, col);
//         });

//         const filtersContainer = document.createElement("div");
//         filtersContainer.classList.add("combined-filter-sort-container");
//         filtersContainer.appendChild(mainFilterContainer);

//         if (additionalIdColumns.length > 0) {
//             const additionalWrapper = document.createElement("div");
//             additionalWrapper.style.display = "none";
//             additionalWrapper.appendChild(additionalIdContainer);

//             const moreButton = document.createElement("button");
//             moreButton.setAttribute("data-lang-key", "show_more");
//             moreButton.textContent = "Enemmän";
//             moreButton.addEventListener("click", () => {
//                 if (additionalWrapper.style.display === "none") {
//                     additionalWrapper.style.display = "block";
//                     moreButton.setAttribute("data-lang-key", "show_less");
//                     moreButton.textContent = "Vähemmän";
//                 } else {
//                     additionalWrapper.style.display = "none";
//                     moreButton.setAttribute("data-lang-key", "show_more");
//                     moreButton.textContent = "Enemmän";
//                 }
//             });

//             filtersContainer.appendChild(moreButton);
//             filtersContainer.appendChild(additionalWrapper);
//         }

//         const combinedCollapsible = create_collapsible_section(
//             "Järjestä ja suodata",
//             filtersContainer,
//             true
//         );
//         filter_bar.appendChild(combinedCollapsible);

//         // Kiinnitetty chat-osio collapsible
//         const chatContainerDiv = document.createElement("div");
//         create_chat_ui(table_name, chatContainerDiv);
//         const chatCollapsible = create_collapsible_section(
//             "Chat – " + table_name,
//             chatContainerDiv,
//             false
//         );
//         filter_bar.appendChild(chatCollapsible);

//         // 5) Liitetään filter_bar DOM:iin
//         table_parts_container.appendChild(filter_bar);

//         // 6) Luodaan readOnlyContainer, jos sitä ei vielä ole
//         let readOnlyContainer = document.getElementById(
//             `${table_name}_readOnlyContainer`
//         );
//         if (!readOnlyContainer) {
//             readOnlyContainer = document.createElement("div");
//             readOnlyContainer.id = `${table_name}_readOnlyContainer`;
//             readOnlyContainer.classList.add("readOnlyContainer");
//             table_parts_container.appendChild(readOnlyContainer);
//         }
//     }
// }

// // // create_filter_bar.js

// // // 1) Tuodaan tarvittavat importit
// // import { resetOffset } from '../infinite_scroll/infinite_scroll.js';
// // import {
// //     getUnifiedTableState,
// //     setUnifiedTableState,
// //     refreshTableUnified
// // } from '../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js';

// // import { create_collapsible_section } from '../../common_components/collapsible-section/collapsible_section.js';
// // import { create_chat_ui } from '../../common_components/ai_features/table_chat/chat.js';
// // import { generate_table } from '../table_views/view_table.js';
// // import { createViewSelectorButtons, createNewViewSelector } from '../table_views/draw_view_selector_buttons.js';
// // import {
// //     createAddRowButton,
// //     createDeleteSelectedButton,
// //     createColumnManagementButton
// // } from '../general_tables/gt_toolbar/button_factory.js';
// // import { createColumnVisibilityDropdown } from '../general_tables/gt_toolbar/column_visibility_dropdown.js';

// // /**
// //  * Haetaan rivimäärä (esimerkkinä). Voit muokata tai poistaa tämän halutessasi.
// //  */
// // async function fetchRowCount(table_name) {
// //     try {
// //         const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
// //             method: 'GET',
// //             credentials: 'include'
// //         });
// //         if (!resp.ok) {
// //             throw new Error(`error (status: ${resp.status})`);
// //         }
// //         const data = await resp.json();
// //         if (data && typeof data.row_count === 'number') {
// //             return data.row_count;
// //         } else {
// //             throw new Error("row_count missing in response");
// //         }
// //     } catch (error) {
// //         console.error("virhe fetchRowCount-funktiossa:", error);
// //         return null;
// //     }
// // }

// // /**
// //  * Luokitellaan sarake haluttuun kategoriaan sarakkeen nimen ja data-tyypin perusteella.
// //  */
// // function determineColumnCategory(column, data_type) {
// //     if (column === 'id') {
// //         return 'id';
// //     }
// //     const lowerCol = column.toLowerCase();
// //     if (lowerCol.endsWith('_id') || lowerCol.endsWith('_uid')) {
// //         return 'additional_id';
// //     }
// //     if (
// //         data_type === 'numeric' ||
// //         data_type === 'integer' ||
// //         data_type === 'bigint' ||
// //         data_type === 'smallint' ||
// //         data_type === 'real' ||
// //         data_type === 'double precision'
// //     ) {
// //         return 'numeric';
// //     }
// //     if (data_type === 'boolean') {
// //         return 'boolean';
// //     }
// //     if (lowerCol.endsWith('(linked)') || lowerCol.endsWith('(ln)')) {
// //         return 'linked';
// //     }
// //     if (
// //         data_type === 'date' ||
// //         data_type === 'timestamp' ||
// //         data_type === 'timestamp without time zone' ||
// //         data_type === 'timestamp with time zone'
// //     ) {
// //         return 'date';
// //     }
// //     return 'text';
// // }

// // /**
// //  * Päivittää unified-tilan filter-osaa (esim. "col_from", "col_to" jne.) ja kutsuu refreshTableUnified.
// //  */
// // function updateFilterAndRefresh(tableName, colKey, value) {
// //     // Haetaan nykyinen tila
// //     const currentState = getUnifiedTableState(tableName);

// //     // Päivitetään filter-kenttä
// //     if (!currentState.filters) {
// //         currentState.filters = {};
// //     }
// //     // Jos value on tyhjä, poistetaan
// //     if (value === '') {
// //         delete currentState.filters[colKey];
// //     } else {
// //         currentState.filters[colKey] = value;
// //     }

// //     // Tallennus
// //     setUnifiedTableState(tableName, currentState);

// //     // Nollataan offset
// //     resetOffset();

// //     // Päivitetään taulu
// //     refreshTableUnified(tableName, { skipUrlParams: true });
// // }

// // /**
// //  * Varsinainen semanttinen haku (esimerkki).
// //  */
// // async function do_semantic_search(table_name, user_query) {
// //     console.log('Semanttinen haku, user_query:', user_query);
// //     if (!user_query.trim()) return;

// //     const url = `/api/get-results-vector?table=${encodeURIComponent(
// //         table_name
// //     )}&vector_query=${encodeURIComponent(user_query)}`;
// //     try {
// //         const resp = await fetch(url);
// //         if (!resp.ok) {
// //             throw new Error(`vector search error (status ${resp.status})`);
// //         }
// //         const data = await resp.json();
// //         console.log('Semanttinen haku tulos:', data);
// //         update_table_ui(table_name, data);
// //     } catch (e) {
// //         console.error('do_semantic_search error:', e);
// //     }
// // }

// // /**
// //  * Kutsutaan generate_table(...) ja päivitetään readOnlyContainer taulun sisällöllä.
// //  */
// // async function showReadOnlyTable(table_name, columns, data, types) {
// //     const readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// //     if (!readOnlyContainer) {
// //         console.error('Virhe: readOnlyContainer puuttuu!');
// //         return;
// //     }
// //     readOnlyContainer.replaceChildren();
// //     await generate_table(table_name, columns, data, types);
// // }

// // /**
// //  * Päivittää taulun semanttisen haun tuloksilla.
// //  */
// // export async function update_table_ui(table_name, result) {
// //     const { columns, data, types } = result;
// //     await showReadOnlyTable(table_name, columns, data, types);
// // }

// // /**
// //  * Avataan SSE-yhteys /openai_embedding_stream_handler -reitille
// //  * ja päivitetään konsolia / pientä logia.
// //  */
// // function embedAllData(table_name) {
// //     console.log(`Aloitetaan SSE: /openai_embedding_stream_handler?table_name=${table_name}`);

// //     const embedLogId = `${table_name}_embed_log`;
// //     let embedLog = document.getElementById(embedLogId);
// //     if (!embedLog) {
// //         embedLog = document.createElement('div');
// //         embedLog.id = embedLogId;
// //         embedLog.style.border = '1px solid var(--border_color)';
// //         embedLog.style.padding = '0.5rem';
// //         embedLog.style.maxHeight = '200px';
// //         embedLog.style.overflowY = 'auto';
// //         embedLog.style.marginTop = '0.5rem';
// //         const filterBar = document.getElementById(`${table_name}_filterBar`);
// //         if (filterBar) {
// //             filterBar.appendChild(embedLog);
// //         }
// //     }

// //     function appendLog(msg) {
// //         console.log(msg);
// //         const p = document.createElement('p');
// //         p.textContent = msg;
// //         embedLog.appendChild(p);
// //         embedLog.scrollTop = embedLog.scrollHeight;
// //     }

// //     const url = `/openai_embedding_stream_handler?table_name=${encodeURIComponent(table_name)}`;
// //     const evtSource = new EventSource(url);

// //     evtSource.addEventListener('progress', (e) => {
// //         appendLog(`[progress] ${e.data}`);
// //     });
// //     evtSource.addEventListener('error', (e) => {
// //         appendLog(`virhe serveriltä: ${e.data}`);
// //     });
// //     evtSource.addEventListener('done', (e) => {
// //         appendLog(`Valmis: ${e.data}`);
// //         evtSource.close();
// //     });

// //     evtSource.onerror = (err) => {
// //         console.error('SSE transport error:', err);
// //         appendLog('virhe: SSE-yhteys katkesi tai ei onnistu');
// //         evtSource.close();
// //     };
// // }

// // /**
// //  * Pieni apufunktio luomaan "Embeditä data" -nappi
// //  */
// // function createEmbedButton(table_name) {
// //     const btn = document.createElement('button');
// //     btn.textContent = 'Luo embedding';
// //     btn.addEventListener('click', () => {
// //         embedAllData(table_name);
// //     });
// //     return btn;
// // }

// // /**
// //  * create_filter_bar:
// //  *  - Luo suodatuspalkin (filterBar) ja asettaa kentille arvot unified-tilasta (tai localStoragesta) jo luontivaiheessa
// //  *  - Yläpuolen rivit: rivimäärä, CRUD-napit, jne.
// //  *  - Global-hakukenttä
// //  *  - Varsinaiset sarakefiltterit (min–max, boolean, tekstikenttä jne.)
// //  *  - Kiinnitetty chat-osion collapsible filterBarin sisälle
// //  */
// // export function create_filter_bar(table_name, columns, data_types, current_view) {
// //     // 0) Luodaan tai haetaan table_parts_container
// //     let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// //     if (!table_parts_container) {
// //         table_parts_container = document.createElement('div');
// //         table_parts_container.id = `${table_name}_table_parts_container`;
// //         document.body.appendChild(table_parts_container);
// //     }

// //     // 1) Luodaan filterBar, jos sitä ei vielä ole
// //     let filter_bar = document.getElementById(`${table_name}_filterBar`);
// //     if (!filter_bar) {
// //         filter_bar = document.createElement('div');
// //         filter_bar.id = `${table_name}_filterBar`;
// //         filter_bar.classList.add('filterBar');

// //         // 1a) Otsikko
// //         const title_container = document.createElement('div');
// //         const table_name_element = document.createElement('div');
// //         table_name_element.textContent = table_name;
// //         table_name_element.style.fontWeight = 'bold';
// //         table_name_element.style.fontSize = '20px';
// //         table_name_element.setAttribute('data-lang-key', table_name);
// //         table_name_element.title = table_name;
// //         title_container.appendChild(table_name_element);

// //         // Lisätään taulun “aktuaalinen nimi” pienemmällä tekstillä
// //         const small_table_name_div = document.createElement('div');
// //         small_table_name_div.textContent = table_name;
// //         title_container.appendChild(small_table_name_div);

// //         filter_bar.appendChild(title_container);

// //         // 2) Yläpuolen rivit: rivimäärä, CRUD-napit ja näkymävalitsimet
// //         const top_row = document.createElement('div');
// //         top_row.classList.add('filterBar-top-row');

// //         // Rivimäärä ja CRUD-napit ensimmäiselle riville
// //         const first_line_div = document.createElement('div');
// //         first_line_div.classList.add('top-row-first-line');
// //         const row_count_element = document.createElement('span');
// //         row_count_element.textContent = 'Rows: ...';
// //         fetchRowCount(table_name).then((count) => {
// //             row_count_element.textContent = count !== null ? `Rows: ${count}` : 'Rows: ?';
// //         });
// //         first_line_div.appendChild(row_count_element);

// //         // CRUD-napit
// //         const button_container_div = document.createElement('div');
// //         button_container_div.classList.add('filterBar-button-container');
// //         button_container_div.appendChild(createAddRowButton(table_name));
// //         button_container_div.appendChild(createColumnManagementButton(table_name));
// //         button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

// //         // Sarakenäkyvyysdropdown (esimerkkinä vain table-näkymässä)
// //         if (current_view === 'table') {
// //             const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// //             if (tableContainer) {
// //                 const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
// //                 if (columnVisibilityDropdown) {
// //                     button_container_div.appendChild(columnVisibilityDropdown);
// //                 }
// //             }
// //         }

// //         // Embed-nappi
// //         const embedBtn = createEmbedButton(table_name);
// //         button_container_div.appendChild(embedBtn);

// //         first_line_div.appendChild(button_container_div);
// //         top_row.appendChild(first_line_div);

// //         // Näkymävalitsimet toiselle riville
// //         const second_line_div = document.createElement('div');
// //         second_line_div.classList.add('top-row-second-line');
// //         second_line_div.appendChild(createViewSelectorButtons(table_name, current_view));
// //         second_line_div.appendChild(createNewViewSelector(table_name, current_view));
// //         top_row.appendChild(second_line_div);

// //         filter_bar.appendChild(top_row);

// //         // 3) Global search -kenttä
// //         const search_row = document.createElement('div');
// //         search_row.classList.add('filterBar-search-row');
// //         const global_search_input = document.createElement('input');
// //         global_search_input.type = 'text';
// //         global_search_input.placeholder = 'Hae jotain...';
// //         global_search_input.id = `${table_name}_global_search_input`;

// //         // Luetaan unified-tilasta (jos halutaan tukea "global_search_input" suoraan)
// //         const currentState = getUnifiedTableState(table_name);
// //         if (currentState.filters && currentState.filters[global_search_input.id]) {
// //             global_search_input.value = currentState.filters[global_search_input.id];
// //         }

// //         // Hakukentän live-haku -> päivitetään unified-tila
// //         global_search_input.addEventListener('input', () => {
// //             updateFilterAndRefresh(table_name, global_search_input.id, global_search_input.value);
// //         });

// //         search_row.appendChild(global_search_input);
// //         filter_bar.appendChild(search_row);

// //         // 4) Varsinainen suodatus- ja järjestämispaneeli
// //         const categorizedCols = {
// //             id: [],
// //             numeric: [],
// //             boolean: [],
// //             linked: [],
// //             text: [],
// //             date: [],
// //             additional_id: []
// //         };

// //         columns.forEach((col) => {
// //             let dt = data_types[col];
// //             let actualType = dt && dt.data_type ? dt.data_type : dt;
// //             const category = determineColumnCategory(col, actualType);
// //             categorizedCols[category].push(col);
// //         });

// //         const orderedMainFilters = [
// //             ...categorizedCols.id,
// //             ...categorizedCols.numeric,
// //             ...categorizedCols.boolean,
// //             ...categorizedCols.linked,
// //             ...categorizedCols.text,
// //             ...categorizedCols.date
// //         ];
// //         const additionalIdColumns = categorizedCols.additional_id;

// //         const mainFilterContainer = document.createElement('div');
// //         mainFilterContainer.classList.add('combined-filter-sort-container');

// //         function createRowForColumn(container, column) {
// //             const row_container = document.createElement('div');
// //             row_container.classList.add('row-container');

// //             // Lajittelupainike
// //             const sort_button = document.createElement('button');
// //             sort_button.setAttribute('data-sort-state', 'none');
// //             sort_button.textContent = '\u21C5'; // ↅ

// //             // Jos unified-tilassa on sorttaus
// //             if (
// //                 currentState.sort &&
// //                 currentState.sort.column === column &&
// //                 currentState.sort.direction
// //             ) {
// //                 if (currentState.sort.direction.toLowerCase() === 'asc') {
// //                     sort_button.setAttribute('data-sort-state', 'asc');
// //                     sort_button.textContent = '\u25B2'; // ▲
// //                 } else {
// //                     sort_button.setAttribute('data-sort-state', 'desc');
// //                     sort_button.textContent = '\u25BC'; // ▼
// //                 }
// //             }

// //             sort_button.addEventListener('click', () => {
// //                 // Nollataan muut painikkeet
// //                 const allSortButtons = container.querySelectorAll('button[data-sort-state]');
// //                 allSortButtons.forEach((btn) => {
// //                     if (btn !== sort_button) {
// //                         btn.setAttribute('data-sort-state', 'none');
// //                         btn.textContent = '\u21C5';
// //                     }
// //                 });

// //                 let currentStateValue = sort_button.getAttribute('data-sort-state');
// //                 let newState;
// //                 if (currentStateValue === 'none') {
// //                     newState = 'asc';
// //                     sort_button.textContent = '\u25B2';
// //                 } else if (currentStateValue === 'asc') {
// //                     newState = 'desc';
// //                     sort_button.textContent = '\u25BC';
// //                 } else {
// //                     newState = 'none';
// //                     sort_button.textContent = '\u21C5';
// //                 }
// //                 sort_button.setAttribute('data-sort-state', newState);

// //                 const st = getUnifiedTableState(table_name);
// //                 if (newState === 'none') {
// //                     st.sort.column = null;
// //                     st.sort.direction = null;
// //                 } else {
// //                     st.sort.column = column;
// //                     st.sort.direction = (newState === 'asc') ? 'ASC' : 'DESC';
// //                 }
// //                 setUnifiedTableState(table_name, st);

// //                 resetOffset();
// //                 refreshTableUnified(table_name, { skipUrlParams: true });
// //             });

// //             // Varsinainen filtterikenttä
// //             const filter_element = create_filter_element(table_name, column, data_types[column]);
// //             row_container.appendChild(sort_button);
// //             row_container.appendChild(filter_element);
// //             container.appendChild(row_container);
// //         }

// //         function create_filter_element(table_name, column, colType) {
// //             const container = document.createElement('div');
// //             container.classList.add('input-group');

// //             const dt_string = (typeof colType === 'object' && colType.data_type)
// //                 ? colType.data_type.toLowerCase()
// //                 : (colType || '').toLowerCase();

// //             // Jos haluat special-case "openai_embedding" -> semanttinen haku
// //             if (column === 'openai_embedding') {
// //                 const semantic_input = document.createElement('input');
// //                 semantic_input.type = 'text';
// //                 semantic_input.placeholder = 'Anna semanttinen hakusana...';
// //                 semantic_input.id = `${table_name}_filter_semantic_${column}`;

// //                 // Alustus unifyed-tilasta
// //                 const st = getUnifiedTableState(table_name);
// //                 if (st.filters && st.filters[semantic_input.id]) {
// //                     semantic_input.value = st.filters[semantic_input.id];
// //                 }

// //                 semantic_input.addEventListener('keypress', (e) => {
// //                     if (e.key === 'Enter') {
// //                         do_semantic_search(table_name, semantic_input.value);
// //                     }
// //                 });
// //                 container.appendChild(semantic_input);

// //                 const label = document.createElement('label');
// //                 label.setAttribute('for', semantic_input.id);
// //                 label.textContent = 'Semantic vector search';
// //                 container.appendChild(label);
// //                 return container;
// //             }

// //             // Numeriikkaa tai päivämäärää -> min–max
// //             if ([
// //                 'integer',
// //                 'bigint',
// //                 'smallint',
// //                 'numeric',
// //                 'real',
// //                 'double precision',
// //                 'date',
// //                 'timestamp',
// //                 'timestamp without time zone',
// //                 'timestamp with time zone'
// //             ].includes(dt_string)) {
// //                 const fromInput = document.createElement('input');
// //                 const toInput = document.createElement('input');

// //                 if ([
// //                     'integer',
// //                     'bigint',
// //                     'smallint',
// //                     'numeric',
// //                     'real',
// //                     'double precision'
// //                 ].includes(dt_string)) {
// //                     fromInput.type = 'number';
// //                     toInput.type = 'number';
// //                     fromInput.placeholder = 'Min';
// //                     toInput.placeholder = 'Max';
// //                 } else {
// //                     fromInput.type = 'date';
// //                     toInput.type = 'date';
// //                     fromInput.placeholder = 'From';
// //                     toInput.placeholder = 'To';
// //                 }
// //                 fromInput.id = `${column}_from`;
// //                 toInput.id = `${column}_to`;

// //                 const st = getUnifiedTableState(table_name);
// //                 if (st.filters && st.filters[fromInput.id]) {
// //                     fromInput.value = st.filters[fromInput.id];
// //                 }
// //                 if (st.filters && st.filters[toInput.id]) {
// //                     toInput.value = st.filters[toInput.id];
// //                 }

// //                 fromInput.addEventListener('input', () => {
// //                     updateFilterAndRefresh(table_name, fromInput.id, fromInput.value);
// //                 });
// //                 toInput.addEventListener('input', () => {
// //                     updateFilterAndRefresh(table_name, toInput.id, toInput.value);
// //                 });

// //                 container.appendChild(fromInput);
// //                 container.appendChild(toInput);

// //                 const label = document.createElement('label');
// //                 label.textContent = column;
// //                 container.appendChild(label);
// //             }
// //             else if (dt_string === 'boolean') {
// //                 const select = document.createElement('select');
// //                 select.id = `${column}`;
// //                 ['', 'true', 'false', 'empty'].forEach(val => {
// //                     const opt = document.createElement('option');
// //                     opt.value = val;
// //                     opt.textContent = (val === '') ? 'All'
// //                         : (val === 'empty') ? 'Empty'
// //                             : val.charAt(0).toUpperCase() + val.slice(1);
// //                     select.appendChild(opt);
// //                 });

// //                 const st = getUnifiedTableState(table_name);
// //                 if (st.filters && st.filters[select.id]) {
// //                     select.value = st.filters[select.id];
// //                 }

// //                 select.addEventListener('input', () => {
// //                     updateFilterAndRefresh(table_name, select.id, select.value);
// //                 });

// //                 container.appendChild(select);
// //                 const label = document.createElement('label');
// //                 label.setAttribute('for', select.id);
// //                 label.textContent = column;
// //                 container.appendChild(label);
// //             }
// //             else {
// //                 // Tekstikenttä
// //                 const input = document.createElement('input');
// //                 input.type = 'text';
// //                 input.placeholder = ' ';
// //                 input.id = `${column}`;

// //                 const st = getUnifiedTableState(table_name);
// //                 if (st.filters && st.filters[input.id]) {
// //                     input.value = st.filters[input.id];
// //                 }

// //                 input.addEventListener('input', () => {
// //                     updateFilterAndRefresh(table_name, input.id, input.value);
// //                 });
// //                 container.appendChild(input);

// //                 const label = document.createElement('label');
// //                 label.setAttribute('for', input.id);
// //                 label.textContent = column;
// //                 container.appendChild(label);
// //             }
// //             return container;
// //         }

// //         orderedMainFilters.forEach(col => {
// //             createRowForColumn(mainFilterContainer, col);
// //         });

// //         // Lisätään "additional_id" -sarakkeet "näytä lisää" -osioon
// //         const additionalIdContainer = document.createElement('div');
// //         additionalIdContainer.classList.add('combined-filter-sort-container');

// //         additionalIdColumns.forEach(col => {
// //             createRowForColumn(additionalIdContainer, col);
// //         });

// //         const filtersContainer = document.createElement('div');
// //         filtersContainer.classList.add('combined-filter-sort-container');
// //         filtersContainer.appendChild(mainFilterContainer);

// //         if (additionalIdColumns.length > 0) {
// //             const additionalWrapper = document.createElement('div');
// //             additionalWrapper.style.display = 'none';
// //             additionalWrapper.appendChild(additionalIdContainer);

// //             const moreButton = document.createElement('button');
// //             moreButton.setAttribute('data-lang-key', 'show_more');
// //             moreButton.textContent = 'Enemmän';
// //             moreButton.addEventListener('click', () => {
// //                 if (additionalWrapper.style.display === 'none') {
// //                     additionalWrapper.style.display = 'block';
// //                     moreButton.setAttribute('data-lang-key', 'show_less');
// //                     moreButton.textContent = 'Vähemmän';
// //                 } else {
// //                     additionalWrapper.style.display = 'none';
// //                     moreButton.setAttribute('data-lang-key', 'show_more');
// //                     moreButton.textContent = 'Enemmän';
// //                 }
// //             });

// //             filtersContainer.appendChild(moreButton);
// //             filtersContainer.appendChild(additionalWrapper);
// //         }

// //         const combinedCollapsible = create_collapsible_section('Järjestä ja suodata', filtersContainer, true);
// //         filter_bar.appendChild(combinedCollapsible);

// //         // Kiinnitetty chat-osio collapsible
// //         const chatContainerDiv = document.createElement('div');
// //         create_chat_ui(table_name, chatContainerDiv);
// //         const chatCollapsible = create_collapsible_section('Chat – ' + table_name, chatContainerDiv, false);
// //         filter_bar.appendChild(chatCollapsible);

// //         // 5) Liitetään filter_bar DOM:iin
// //         table_parts_container.appendChild(filter_bar);

// //         // 6) Luodaan readOnlyContainer, jos sitä ei vielä ole
// //         let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// //         if (!readOnlyContainer) {
// //             readOnlyContainer = document.createElement('div');
// //             readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// //             readOnlyContainer.classList.add('readOnlyContainer');
// //             table_parts_container.appendChild(readOnlyContainer);
// //         }
// //     }
// // }

// // // // create_filter_bar.js

// // // // 1) Tuodaan tarvittavat importit
// // // import { resetOffset } from '../infinite_scroll/infinite_scroll.js';
// // // import {
// // //     getUnifiedTableState,
// // //     setUnifiedTableState,
// // //     refreshTableUnified
// // // } from '../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js';
// // // // (vaihda polku omasi mukaan!)

// // // import { create_collapsible_section } from '../../common_components/collapsible_section.js';
// // // import { create_chat_ui } from '../../common_components/ai_features/table_chat/chat.js';
// // // import { generate_table } from '../table_views/view_table.js';
// // // import { createViewSelectorButtons, createNewViewSelector } from '../table_views/draw_view_selector_buttons.js';
// // // import {
// // //     createAddRowButton,
// // //     createDeleteSelectedButton,
// // //     createColumnManagementButton
// // // } from '../general_tables/gt_toolbar/button_factory.js';
// // // import { createColumnVisibilityDropdown } from '../general_tables/gt_toolbar/column_visibility_dropdown.js';

// // // /**
// // //  * Haetaan rivimäärä (esimerkkinä). Voit muokata tai poistaa tämän halutessasi.
// // //  */
// // // async function fetchRowCount(table_name) {
// // //     try {
// // //         const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
// // //             method: 'GET',
// // //             credentials: 'include'
// // //         });
// // //         if (!resp.ok) {
// // //             throw new Error(`error (status: ${resp.status})`);
// // //         }
// // //         const data = await resp.json();
// // //         if (data && typeof data.row_count === 'number') {
// // //             return data.row_count;
// // //         } else {
// // //             throw new Error("row_count missing in response");
// // //         }
// // //     } catch (error) {
// // //         console.error("virhe fetchRowCount-funktiossa:", error);
// // //         return null;
// // //     }
// // // }

// // // /**
// // //  * Luokitellaan sarake haluttuun kategoriaan sarakkeen nimen ja data-tyypin perusteella.
// // //  * (Voit säätää logiikkaa omaan makuusi.)
// // //  */
// // // function determineColumnCategory(column, data_type) {
// // //     if (column === 'id') {
// // //         return 'id';
// // //     }
// // //     const lowerCol = column.toLowerCase();
// // //     if (lowerCol.endsWith('_id') || lowerCol.endsWith('_uid')) {
// // //         return 'additional_id';
// // //     }
// // //     if (
// // //         data_type === 'numeric' ||
// // //         data_type === 'integer' ||
// // //         data_type === 'bigint' ||
// // //         data_type === 'smallint' ||
// // //         data_type === 'real' ||
// // //         data_type === 'double precision'
// // //     ) {
// // //         return 'numeric';
// // //     }
// // //     if (data_type === 'boolean') {
// // //         return 'boolean';
// // //     }
// // //     if (lowerCol.endsWith('(linked)') || lowerCol.endsWith('(ln)')) {
// // //         return 'linked';
// // //     }
// // //     if (
// // //         data_type === 'date' ||
// // //         data_type === 'timestamp' ||
// // //         data_type === 'timestamp without time zone' ||
// // //         data_type === 'timestamp with time zone'
// // //     ) {
// // //         return 'date';
// // //     }
// // //     return 'text';
// // // }

// // // /**
// // //  * Päivittää unified-tilan filter-osaa (esim. "col_from", "col_to" jne.) ja kutsuu refreshTableUnified.
// // //  */
// // // function updateFilterAndRefresh(tableName, colKey, value) {
// // //     // Haetaan nykyinen tila
// // //     const currentState = getUnifiedTableState(tableName);

// // //     // Päivitetään filter-kenttä
// // //     if (!currentState.filters) {
// // //         currentState.filters = {};
// // //     }
// // //     // Jos value on tyhjä, haluatko poistaa sen? Vai tallentaa tyhjän?
// // //     // Oletuksena jos value = '', poistetaan
// // //     if (value === '') {
// // //         delete currentState.filters[colKey];
// // //     } else {
// // //         currentState.filters[colKey] = value;
// // //     }

// // //     // Tallennus
// // //     // console.log('create_filter_bar.js: updateFilterAndRefresh kutsuu funktiota setUnifiedTableState arvoilla:', tableName, currentState);
// // //     setUnifiedTableState(tableName, currentState);

// // //     // Nollataan offset
// // //     resetOffset();

// // //     // Päivitetään taulu
// // //     refreshTableUnified(tableName, { skipUrlParams: true });
// // // }

// // // /**
// // //  * Varsinainen semanttinen haku (esimerkki).
// // //  */
// // // async function do_semantic_search(table_name, user_query) {
// // //     console.log('Semanttinen haku, user_query:', user_query);
// // //     if (!user_query.trim()) return;

// // //     const url = `/api/get-results-vector?table=${encodeURIComponent(
// // //         table_name
// // //     )}&vector_query=${encodeURIComponent(user_query)}`;
// // //     try {
// // //         const resp = await fetch(url);
// // //         if (!resp.ok) {
// // //             throw new Error(`vector search error (status ${resp.status})`);
// // //         }
// // //         const data = await resp.json();
// // //         console.log('Semanttinen haku tulos:', data);
// // //         update_table_ui(table_name, data);
// // //     } catch (e) {
// // //         console.error('do_semantic_search error:', e);
// // //     }
// // // }

// // // /**
// // //  * Kutsutaan generate_table(...) ja päivitetään readOnlyContainer taulun sisällöllä.
// // //  */
// // // async function showReadOnlyTable(table_name, columns, data, types) {
// // //     const readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // //     if (!readOnlyContainer) {
// // //         console.error('Virhe: readOnlyContainer puuttuu!');
// // //         return;
// // //     }
// // //     readOnlyContainer.replaceChildren();
// // //     // console.log('create_filter_bar.js: showReadOnlyTable kutsuu funktiota generate_table');
// // //     // Odotetaan, että generate_table hoitaa DOM-päivitykset
// // //     await generate_table(table_name, columns, data, types);
// // // }

// // // /**
// // //  * Päivittää taulun semanttisen haun tuloksilla.
// // //  */
// // // export async function update_table_ui(table_name, result) {
// // //     const { columns, data, types } = result;
// // //     await showReadOnlyTable(table_name, columns, data, types);
// // // }

// // // /**
// // //  * Avataan SSE-yhteys /openai_embedding_stream_handler -reitille
// // //  * ja päivitetään konsolia / pientä logia.
// // //  */
// // // function embedAllData(table_name) {
// // //     console.log(`Aloitetaan SSE: /openai_embedding_stream_handler?table_name=${table_name}`);

// // //     const embedLogId = `${table_name}_embed_log`;
// // //     let embedLog = document.getElementById(embedLogId);
// // //     if (!embedLog) {
// // //         embedLog = document.createElement('div');
// // //         embedLog.id = embedLogId;
// // //         embedLog.style.border = '1px solid var(--border_color)';
// // //         embedLog.style.padding = '0.5rem';
// // //         embedLog.style.maxHeight = '200px';
// // //         embedLog.style.overflowY = 'auto';
// // //         embedLog.style.marginTop = '0.5rem';
// // //         const filterBar = document.getElementById(`${table_name}_filterBar`);
// // //         if (filterBar) {
// // //             filterBar.appendChild(embedLog);
// // //         }
// // //     }

// // //     function appendLog(msg) {
// // //         console.log(msg);
// // //         const p = document.createElement('p');
// // //         p.textContent = msg;
// // //         embedLog.appendChild(p);
// // //         embedLog.scrollTop = embedLog.scrollHeight;
// // //     }

// // //     const url = `/openai_embedding_stream_handler?table_name=${encodeURIComponent(table_name)}`;
// // //     const evtSource = new EventSource(url);

// // //     evtSource.addEventListener('progress', (e) => {
// // //         appendLog(`[progress] ${e.data}`);
// // //     });
// // //     evtSource.addEventListener('error', (e) => {
// // //         appendLog(`virhe serveriltä: ${e.data}`);
// // //     });
// // //     evtSource.addEventListener('done', (e) => {
// // //         appendLog(`Valmis: ${e.data}`);
// // //         evtSource.close();
// // //     });

// // //     evtSource.onerror = (err) => {
// // //         console.error('SSE transport error:', err);
// // //         appendLog('virhe: SSE-yhteys katkesi tai ei onnistu');
// // //         evtSource.close();
// // //     };
// // // }

// // // /**
// // //  * Pieni apufunktio luomaan "Embeditä data" -nappi
// // //  */
// // // function createEmbedButton(table_name) {
// // //     const btn = document.createElement('button');
// // //     btn.textContent = 'Luo embedding';
// // //     btn.addEventListener('click', () => {
// // //         embedAllData(table_name);
// // //     });
// // //     return btn;
// // // }

// // // /**
// // //  * create_filter_bar:
// // //  *  - Luo suodatuspalkin (filterBar) ja asettaa kentille arvot unified-tilasta (tai localStoragesta) jo luontivaiheessa
// // //  *  - Yläpuolen rivit: rivimäärä, CRUD-napit, jne.
// // //  *  - Global-hakukenttä
// // //  *  - Varsinaiset sarakefiltterit (min–max, boolean, tekstikenttä jne.)
// // //  *  - Chat-nappula
// // //  */
// // // export function create_filter_bar(table_name, columns, data_types, current_view) {
// // //     // 0) Luodaan tai haetaan table_parts_container
// // //     let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// // //     if (!table_parts_container) {
// // //         table_parts_container = document.createElement('div');
// // //         table_parts_container.id = `${table_name}_table_parts_container`;
// // //         document.body.appendChild(table_parts_container);
// // //     }

// // //     // 1) Luodaan filterBar, jos sitä ei vielä ole
// // //     let filter_bar = document.getElementById(`${table_name}_filterBar`);
// // //     if (!filter_bar) {
// // //         filter_bar = document.createElement('div');
// // //         filter_bar.id = `${table_name}_filterBar`;
// // //         filter_bar.classList.add('filterBar');

// // //         // 1a) Otsikko
// // //         const title_container = document.createElement('div');
// // //         const table_name_element = document.createElement('div');
// // //         table_name_element.textContent = table_name;
// // //         table_name_element.style.fontWeight = 'bold';
// // //         table_name_element.style.fontSize = '20px';
// // //         table_name_element.setAttribute('data-lang-key', table_name);
// // //         table_name_element.title = table_name;
// // //         title_container.appendChild(table_name_element);
// // //         filter_bar.appendChild(title_container);

// // //         // Lisätään taulun “aktuaalinen nimi” pienemmällä tekstillä
// // //         const small_table_name_div = document.createElement('div');
// // //         small_table_name_div.textContent = table_name;
// // //         title_container.appendChild(small_table_name_div);

// // //         // 2) Yläpuolen rivit: rivimäärä, CRUD-napit ja näkymävalitsimet
// // //         const top_row = document.createElement('div');
// // //         top_row.classList.add('filterBar-top-row');

// // //         // Rivimäärä ja CRUD-napit ensimmäiselle riville
// // //         const first_line_div = document.createElement('div');
// // //         first_line_div.classList.add('top-row-first-line');
// // //         const row_count_element = document.createElement('span');
// // //         row_count_element.textContent = 'Rows: ...';
// // //         fetchRowCount(table_name).then((count) => {
// // //             row_count_element.textContent = count !== null ? `Rows: ${count}` : 'Rows: ?';
// // //         });
// // //         first_line_div.appendChild(row_count_element);

// // //         // CRUD-napit
// // //         const button_container_div = document.createElement('div');
// // //         button_container_div.classList.add('filterBar-button-container');
// // //         button_container_div.appendChild(createAddRowButton(table_name));
// // //         button_container_div.appendChild(createColumnManagementButton(table_name));
// // //         button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

// // //         // Sarakenäkyvyysdropdown (esimerkkinä vain table-näkymässä)
// // //         if (current_view === 'table') {
// // //             const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // //             if (tableContainer) {
// // //                 const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
// // //                 if (columnVisibilityDropdown) {
// // //                     button_container_div.appendChild(columnVisibilityDropdown);
// // //                 }
// // //             }
// // //         }

// // //         // *** Tässä luodaan varsinainen embed-nappi ***
// // //         const embedBtn = createEmbedButton(table_name);
// // //         button_container_div.appendChild(embedBtn);

// // //         first_line_div.appendChild(button_container_div);
// // //         top_row.appendChild(first_line_div);

// // //         // Näkymävalitsimet toiselle riville
// // //         const second_line_div = document.createElement('div');
// // //         second_line_div.classList.add('top-row-second-line');
// // //         second_line_div.appendChild(createViewSelectorButtons(table_name, current_view));
// // //         second_line_div.appendChild(createNewViewSelector(table_name, current_view));
// // //         top_row.appendChild(second_line_div);

// // //         filter_bar.appendChild(top_row);

// // //         // 3) Global search -kenttä
// // //         const search_row = document.createElement('div');
// // //         search_row.classList.add('filterBar-search-row');
// // //         const global_search_input = document.createElement('input');
// // //         global_search_input.type = 'text';
// // //         global_search_input.placeholder = 'Hae jotain...';
// // //         global_search_input.id = `${table_name}_global_search_input`;

// // //         // Luetaan unified-tilasta, jos halutaan tukea "global_search_input" suoraan
// // //         const currentState = getUnifiedTableState(table_name);
// // //         if (currentState.filters && currentState.filters[global_search_input.id]) {
// // //             global_search_input.value = currentState.filters[global_search_input.id];
// // //         }

// // //         // Hakukentän live-haku -> päivitetään unified-tila
// // //         global_search_input.addEventListener('input', () => {
// // //             updateFilterAndRefresh(table_name, global_search_input.id, global_search_input.value);
// // //         });

// // //         search_row.appendChild(global_search_input);
// // //         filter_bar.appendChild(search_row);

// // //         // 4) Varsinainen suodatus- ja järjestämispaneeli
// // //         const categorizedCols = {
// // //             id: [],
// // //             numeric: [],
// // //             boolean: [],
// // //             linked: [],
// // //             text: [],
// // //             date: [],
// // //             additional_id: []
// // //         };

// // //         columns.forEach((col) => {
// // //             let dt = data_types[col];
// // //             let actualType = dt && dt.data_type ? dt.data_type : dt;
// // //             const category = determineColumnCategory(col, actualType);
// // //             categorizedCols[category].push(col);
// // //         });

// // //         const orderedMainFilters = [
// // //             ...categorizedCols.id,
// // //             ...categorizedCols.numeric,
// // //             ...categorizedCols.boolean,
// // //             ...categorizedCols.linked,
// // //             ...categorizedCols.text,
// // //             ...categorizedCols.date
// // //         ];
// // //         const additionalIdColumns = categorizedCols.additional_id;

// // //         const mainFilterContainer = document.createElement('div');
// // //         mainFilterContainer.classList.add('combined-filter-sort-container');

// // //         function createRowForColumn(container, column) {
// // //             const row_container = document.createElement('div');
// // //             row_container.classList.add('row-container');

// // //             // Lajittelupainike
// // //             const sort_button = document.createElement('button');
// // //             sort_button.setAttribute('data-sort-state', 'none');
// // //             sort_button.textContent = '\u21C5'; // ↅ (ylempi ja alempi nuoli)

// // //             // Katsotaan, onko currentState:ssa jo jokin sort päällä tälle sarakkeelle
// // //             if (
// // //                 currentState.sort &&
// // //                 currentState.sort.column === column &&
// // //                 currentState.sort.direction
// // //             ) {
// // //                 if (currentState.sort.direction.toLowerCase() === 'asc') {
// // //                     sort_button.setAttribute('data-sort-state', 'asc');
// // //                     sort_button.textContent = '\u25B2'; // ▲
// // //                 } else {
// // //                     sort_button.setAttribute('data-sort-state', 'desc');
// // //                     sort_button.textContent = '\u25BC'; // ▼
// // //                 }
// // //             }

// // //             sort_button.addEventListener('click', () => {
// // //                 // Nollataan muut painikkeet
// // //                 const allSortButtons = container.querySelectorAll('button[data-sort-state]');
// // //                 allSortButtons.forEach((btn) => {
// // //                     if (btn !== sort_button) {
// // //                         btn.setAttribute('data-sort-state', 'none');
// // //                         btn.textContent = '\u21C5'; // ↅ
// // //                     }
// // //                 });

// // //                 let currentStateValue = sort_button.getAttribute('data-sort-state');
// // //                 let newState;
// // //                 if (currentStateValue === 'none') {
// // //                     newState = 'asc';
// // //                     sort_button.textContent = '\u25B2'; // ▲
// // //                 } else if (currentStateValue === 'asc') {
// // //                     newState = 'desc';
// // //                     sort_button.textContent = '\u25BC'; // ▼
// // //                 } else {
// // //                     // jos oli desc, siirrytään 'none'
// // //                     newState = 'none';
// // //                     sort_button.textContent = '\u21C5'; // ↅ
// // //                 }
// // //                 sort_button.setAttribute('data-sort-state', newState);

// // //                 // Päivitetään unified-tilaan
// // //                 const st = getUnifiedTableState(table_name);
// // //                 if (newState === 'none') {
// // //                     // Poistetaan sorttaus
// // //                     st.sort.column = null;
// // //                     st.sort.direction = null;
// // //                 } else {
// // //                     st.sort.column = column;
// // //                     st.sort.direction = (newState === 'asc') ? 'ASC' : 'DESC';
// // //                 }
// // //                 // console.log('create_filter_bar.js: createRowForColumn kutsuu funktiota setUnifiedTableState arvoilla:', table_name, st);
// // //                 setUnifiedTableState(table_name, st);

// // //                 // Nollataan offset, päivitetään taulu
// // //                 resetOffset();
// // //                 refreshTableUnified(table_name, { skipUrlParams: true });
// // //             });

// // //             // Varsinainen filtterikenttä
// // //             const filter_element = create_filter_element(table_name, column, data_types[column]);
// // //             row_container.appendChild(sort_button);
// // //             row_container.appendChild(filter_element);
// // //             container.appendChild(row_container);
// // //         }

// // //         /**
// // //          * Luo filtterielementin (min–max, bool, tekstikenttä, tms.)
// // //          * mutta käyttää unifyed-tilaa tallennuksessa.
// // //          */
// // //         function create_filter_element(table_name, column, colType) {
// // //             const container = document.createElement('div');
// // //             container.classList.add('input-group');

// // //             const dt_string = (typeof colType === 'object' && colType.data_type)
// // //                 ? colType.data_type.toLowerCase()
// // //                 : (colType || '').toLowerCase();

// // //             // Jos haluat vielä special-case "openai_embedding" -> semanttinen haku
// // //             if (column === 'openai_embedding') {
// // //                 const semantic_input = document.createElement('input');
// // //                 semantic_input.type = 'text';
// // //                 semantic_input.placeholder = 'Anna semanttinen hakusana...';
// // //                 semantic_input.id = `${table_name}_filter_semantic_${column}`;

// // //                 // Alustus unifyed-tilasta
// // //                 const st = getUnifiedTableState(table_name);
// // //                 if (st.filters && st.filters[semantic_input.id]) {
// // //                     semantic_input.value = st.filters[semantic_input.id];
// // //                 }

// // //                 semantic_input.addEventListener('keypress', (e) => {
// // //                     if (e.key === 'Enter') {
// // //                         do_semantic_search(table_name, semantic_input.value);
// // //                     }
// // //                 });
// // //                 container.appendChild(semantic_input);

// // //                 const label = document.createElement('label');
// // //                 label.setAttribute('for', semantic_input.id);
// // //                 label.textContent = 'Semantic vector search';
// // //                 container.appendChild(label);
// // //                 return container;
// // //             }

// // //             // Muut tapaukset
// // //             if (['integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision', 'date', 'timestamp', 'timestamp without time zone', 'timestamp with time zone'].includes(dt_string)) {
// // //                 // min–max
// // //                 const fromInput = document.createElement('input');
// // //                 const toInput = document.createElement('input');

// // //                 if (['integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision'].includes(dt_string)) {
// // //                     fromInput.type = 'number';
// // //                     toInput.type = 'number';
// // //                     fromInput.placeholder = 'Min';
// // //                     toInput.placeholder = 'Max';
// // //                 } else {
// // //                     fromInput.type = 'date';
// // //                     toInput.type = 'date';
// // //                     fromInput.placeholder = 'From';
// // //                     toInput.placeholder = 'To';
// // //                 }
// // //                 fromInput.id = `${column}_from`;
// // //                 toInput.id = `${column}_to`;

// // //                 // Alustus unifyed-tilasta
// // //                 const st = getUnifiedTableState(table_name);
// // //                 if (st.filters && st.filters[fromInput.id]) {
// // //                     fromInput.value = st.filters[fromInput.id];
// // //                 }
// // //                 if (st.filters && st.filters[toInput.id]) {
// // //                     toInput.value = st.filters[toInput.id];
// // //                 }

// // //                 fromInput.addEventListener('input', () => {
// // //                     updateFilterAndRefresh(table_name, fromInput.id, fromInput.value);
// // //                 });
// // //                 toInput.addEventListener('input', () => {
// // //                     updateFilterAndRefresh(table_name, toInput.id, toInput.value);
// // //                 });

// // //                 container.appendChild(fromInput);
// // //                 container.appendChild(toInput);

// // //                 const label = document.createElement('label');
// // //                 label.textContent = column;
// // //                 container.appendChild(label);
// // //             }
// // //             else if (dt_string === 'boolean') {
// // //                 const select = document.createElement('select');
// // //                 select.id = `${column}`;
// // //                 ['', 'true', 'false', 'empty'].forEach(val => {
// // //                     const opt = document.createElement('option');
// // //                     opt.value = val;
// // //                     opt.textContent = (val === '') ? 'All'
// // //                         : (val === 'empty') ? 'Empty'
// // //                             : val.charAt(0).toUpperCase() + val.slice(1);
// // //                     select.appendChild(opt);
// // //                 });

// // //                 // unifyed-tila
// // //                 const st = getUnifiedTableState(table_name);
// // //                 if (st.filters && st.filters[select.id]) {
// // //                     select.value = st.filters[select.id];
// // //                 }

// // //                 select.addEventListener('input', () => {
// // //                     updateFilterAndRefresh(table_name, select.id, select.value);
// // //                 });

// // //                 container.appendChild(select);
// // //                 const label = document.createElement('label');
// // //                 label.setAttribute('for', select.id);
// // //                 label.textContent = column;
// // //                 container.appendChild(label);
// // //             }
// // //             else {
// // //                 // Tekstikenttä
// // //                 const input = document.createElement('input');
// // //                 input.type = 'text';
// // //                 input.placeholder = ' ';
// // //                 input.id = `${column}`;

// // //                 // unifyed-tila
// // //                 const st = getUnifiedTableState(table_name);
// // //                 if (st.filters && st.filters[input.id]) {
// // //                     input.value = st.filters[input.id];
// // //                 }

// // //                 input.addEventListener('input', () => {
// // //                     updateFilterAndRefresh(table_name, input.id, input.value);
// // //                 });
// // //                 container.appendChild(input);

// // //                 const label = document.createElement('label');
// // //                 label.setAttribute('for', input.id);
// // //                 label.textContent = column;
// // //                 container.appendChild(label);
// // //             }
// // //             return container;
// // //         }

// // //         // Rakennetaan mainFilterContainer
// // //         orderedMainFilters.forEach(col => {
// // //             createRowForColumn(mainFilterContainer, col);
// // //         });

// // //         // Lisätään "additional_id" -sarakkeet "näytä lisää" -osioon
// // //         const additionalIdContainer = document.createElement('div');
// // //         additionalIdContainer.classList.add('combined-filter-sort-container');

// // //         additionalIdColumns.forEach(col => {
// // //             createRowForColumn(additionalIdContainer, col);
// // //         });

// // //         const filtersContainer = document.createElement('div');
// // //         filtersContainer.classList.add('combined-filter-sort-container');
// // //         filtersContainer.appendChild(mainFilterContainer);

// // //         if (additionalIdColumns.length > 0) {
// // //             const additionalWrapper = document.createElement('div');
// // //             additionalWrapper.style.display = 'none';
// // //             additionalWrapper.appendChild(additionalIdContainer);

// // //             const moreButton = document.createElement('button');
// // //             moreButton.setAttribute('data-lang-key', 'show_more');
// // //             moreButton.textContent = 'Enemmän';
// // //             moreButton.addEventListener('click', () => {
// // //                 if (additionalWrapper.style.display === 'none') {
// // //                     additionalWrapper.style.display = 'block';
// // //                     moreButton.setAttribute('data-lang-key', 'show_less');
// // //                     moreButton.textContent = 'Vähemmän';
// // //                 } else {
// // //                     additionalWrapper.style.display = 'none';
// // //                     moreButton.setAttribute('data-lang-key', 'show_more');
// // //                     moreButton.textContent = 'Enemmän';
// // //                 }
// // //             });

// // //             filtersContainer.appendChild(moreButton);
// // //             filtersContainer.appendChild(additionalWrapper);
// // //         }

// // //         const combinedCollapsible = create_collapsible_section('Järjestä ja suodata', filtersContainer, true);
// // //         filter_bar.appendChild(combinedCollapsible);

// // //         // 5) Liitetään filter_bar DOM:iin
// // //         table_parts_container.appendChild(filter_bar);

// // //         // 6) Luodaan readOnlyContainer, jos sitä ei vielä ole
// // //         let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // //         if (!readOnlyContainer) {
// // //             readOnlyContainer = document.createElement('div');
// // //             readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// // //             readOnlyContainer.classList.add('readOnlyContainer');
// // //             table_parts_container.appendChild(readOnlyContainer);
// // //         }
// // //     }

// // //     // 7) Kelluva Chat-nappi (esimerkki)
// // //     if (!document.getElementById(`${table_name}_floating_chat_button`)) {
// // //         const chatButton = document.createElement('button');
// // //         chatButton.id = `${table_name}_floating_chat_button`;
// // //         chatButton.textContent = 'Chat';
// // //         chatButton.classList.add('floating-chat-button');
// // //         document.body.appendChild(chatButton);

// // //         const chatContainer = document.createElement('div');
// // //         chatContainer.id = `${table_name}_chat_wrapper`;
// // //         chatContainer.classList.add('floating-chat-window');
// // //         chatContainer.style.display = 'none';

// // //         // Luodaan varsinainen chat UI
// // //         create_chat_ui(table_name, chatContainer);
// // //         document.body.appendChild(chatContainer);

// // //         chatButton.addEventListener('click', () => {
// // //             if (chatContainer.style.display === 'none' || chatContainer.style.display === '') {
// // //                 chatContainer.style.display = 'block';
// // //             } else {
// // //                 chatContainer.style.display = 'none';
// // //             }
// // //         });
// // //     }
// // // }
