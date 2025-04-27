// create_filter_bar.js

import { resetOffset } from "../infinite_scroll/infinite_scroll.js";
import {
    getUnifiedTableState,
    setUnifiedTableState,
    refreshTableUnified,
} from "../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js";

import { create_collapsible_section } from "../../common_components/collapsible-section/collapsible_section.js";
import { generate_table } from "../table_views/view_table.js";

// Peruskäyttäjän nappi
import { createAddRowButton } from "../general_tables/gt_toolbar/button_factory.js";

// Admin-ominaisuudet eriytettynä
import {
    appendAdminFeatures,
    appendChatUIIfAdmin,
} from "./create_filter_bar_admin.js";
import "./overlay_filter_bar_observer.js";

import { appendDataToView } from "../infinite_scroll/infinite_scroll.js";

/* ===========================================================
 *  Yleiset muuttujat ja apurit
 * =========================================================*/

// Kynnysarvo, jonka alapuolella filterBar piilotetaan automaattisesti
const FILTERBAR_WIDTH_THRESHOLD = 1600;

// Komponentin näkyvyystila
let filterBarVisible = true;

// --- Apufunktio rivimäärän hakuun ----------------------------------------
async function fetchRowCount(tableName) {
    try {
        const resp = await fetch(`/api/get-row-count?table=${tableName}`, {
            method: "GET",
            credentials: "include",
        });
        if (!resp.ok) throw new Error(`error (status: ${resp.status})`);
        const { row_count: rowCount } = await resp.json();
        return typeof rowCount === "number" ? rowCount : null;
    } catch (err) {
        console.error("virhe fetchRowCount-funktiossa:", err);
        return null;
    }
}

// --- Sarakkeen luokittelu ------------------------------------------------
function determineColumnCategory(column, dataType) {
    if (column === "id") return "id";

    const lowerCol = column.toLowerCase();
    if (lowerCol.endsWith("_id") || lowerCol.endsWith("_uid"))
        return "additional_id";

    const numericTypes = [
        "numeric",
        "integer",
        "bigint",
        "smallint",
        "real",
        "double precision",
    ];

    if (numericTypes.includes(dataType)) return "numeric";
    if (dataType === "boolean") return "boolean";
    if (lowerCol.endsWith("(linked)") || lowerCol.endsWith("(ln)"))
        return "linked";

    const dateTypes = [
        "date",
        "timestamp",
        "timestamp without time zone",
        "timestamp with time zone",
    ];

    if (dateTypes.includes(dataType)) return "date";
    return "text";
}

/* ===========================================================
 *  UI‑rakentajat pieninä funktioina
 * =========================================================*/

/**
 * Luo tai hakee table-kohtaisen pääcontainerin.
 */
function ensureTableContainers(tableName) {
    let tablePartsContainer = document.getElementById(
        `${tableName}_table_parts_container`
    );
    if (!tablePartsContainer) {
        tablePartsContainer = document.createElement("div");
        tablePartsContainer.id = `${tableName}_table_parts_container`;
        document.body.appendChild(tablePartsContainer);
    }
    return tablePartsContainer;
}

/**
 * Luo otsikko‑ ja toggle‑rivin (nimi + rivimäärä + piilota/avaa‑nappi).
 */
function buildTitleRow(tableName, rowCountElement, toggleButton) {
    const titleContainer = document.createElement("div");
    titleContainer.classList.add("filterBar-title-container");
    titleContainer.style.display = "flex";
    titleContainer.style.justifyContent = "space-between";
    titleContainer.style.alignItems = "baseline";

    // --- vasen puoli: taulun nimi
    const tableNameWrapper = document.createElement("div");
    const tableNameElement = document.createElement("div");
    tableNameElement.textContent = tableName;
    tableNameElement.style.fontWeight = "bold";
    tableNameElement.style.fontSize = "20px";
    tableNameElement.setAttribute("data-lang-key", tableName);
    tableNameElement.title = tableName;
    tableNameWrapper.appendChild(tableNameElement);

    // --- oikea puoli: rivimäärä + nappi
    const rightWrapper = document.createElement("div");
    rightWrapper.style.display = "flex";
    rightWrapper.style.alignItems = "center";
    rightWrapper.style.gap = "0.5rem";

    rightWrapper.appendChild(rowCountElement);
    rightWrapper.appendChild(toggleButton);

    titleContainer.appendChild(tableNameWrapper);
    titleContainer.appendChild(rightWrapper);

    return titleContainer;
}

/**
 * Luo top_row‑elementin, joka sisältää:
 *  1) peruskäyttäjän napit
 *  2) (valinnaisesti) admin-napit ja näkymävalitsimen
 */
function buildTopRow(tableName, adminMode, currentView) {
    const existing = document.getElementById(`${tableName}_filterBar_top_row`);
    if (existing) return existing; // luotu jo aiemmin

    const topRow = document.createElement("div");
    topRow.id = `${tableName}_filterBar_top_row`;
    topRow.classList.add("filterBar-top-row");

    /* ---------- Rivi 1: peruskäyttäjän napit ---------- */
    const firstLine = document.createElement("div");
    firstLine.classList.add("top-row-first-line");

    const userButtonsContainer = document.createElement("div");
    userButtonsContainer.classList.add("filterBar-button-container");
    userButtonsContainer.appendChild(createAddRowButton(tableName));

    firstLine.appendChild(userButtonsContainer);
    topRow.appendChild(firstLine);

    /* ---------- Rivi 2: admin ---------- */
    if (adminMode) {
        const secondLine = document.createElement("div");
        secondLine.classList.add("top-row-second-line");

        const adminButtonsContainer = document.createElement("div");
        adminButtonsContainer.classList.add("management-buttons");

        const viewSelectorContainer = document.createElement("div");

        secondLine.appendChild(adminButtonsContainer);
        secondLine.appendChild(viewSelectorContainer);
        topRow.appendChild(secondLine);

        appendAdminFeatures(
            tableName,
            adminButtonsContainer,
            viewSelectorContainer,
            currentView
        );
    }

    return topRow;
}

/* -----------------------------------------------------------
 *  Älykäs globaali haku – historialla ja palautuksella
 * ---------------------------------------------------------*/
function buildSearchRow(tableName) {
    const row = document.createElement("div");
    row.classList.add("filterBar-search-row");

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Hae älykkäästi...";
    input.id = `${tableName}_global_intelligent_search_input`;
    input.classList.add("global-search-input");

    const button = document.createElement("button");
    button.classList.add("global-search-button");
    button.title = "Hae";
    button.innerHTML =
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM10 14a4 4 0 110-8 4 4 0 010 8z"/></svg>';

    const STORAGE_KEY_HISTORY = `int_search_history_${tableName}`;
    const STORAGE_KEY_DRAFT = `int_search_draft_${tableName}`;

    let history = [];
    try {
        history = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
    } catch {
        history = [];
    }

    // Aseta viimeisin haku inputtiin, ellei käyttäjällä ole draftia tallessa.
    const savedDraft = localStorage.getItem(STORAGE_KEY_DRAFT);
    if (savedDraft !== null) {
        input.value = savedDraft;
    } else if (history.length) {
        input.value = history[history.length - 1];
    }

    let historyIndex = null; // null = ei selaa historiaa, muuten indeksi historiotaulukossa
    let currentDraft = ""; // mitä käyttäjä kirjoitti ennen nuolinavigointia

    function commitSearch() {
        const query = input.value.trim();
        if (!query) return;
        do_intelligent_search(tableName, query);
        // päivitä historia, poista duplikaatit peräkkäin
        if (history[history.length - 1] !== query) history.push(query);
        localStorage.setItem(
            STORAGE_KEY_HISTORY,
            JSON.stringify(history.slice(-50))
        ); // säilytä max 50
        localStorage.removeItem(STORAGE_KEY_DRAFT);
        historyIndex = null;
    }

    // Tallenna draft reaaliajassa, jotta reload säilyttää
    input.addEventListener("input", () => {
        localStorage.setItem(STORAGE_KEY_DRAFT, input.value);
    });

    button.addEventListener("click", commitSearch);
    input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") commitSearch();
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowUp") {
            if (history.length === 0) return;
            if (historyIndex === null) {
                currentDraft = input.value;
                historyIndex = history.length - 1;
            } else if (historyIndex > 0) {
                historyIndex -= 1;
            }
            input.value = history[historyIndex];
            e.preventDefault();
        } else if (e.key === "ArrowDown") {
            if (historyIndex === null) return; // ei selaa
            if (historyIndex < history.length - 1) {
                historyIndex += 1;
                input.value = history[historyIndex];
            } else {
                // Paluu luonnokseen
                historyIndex = null;
                input.value = currentDraft;
            }
            e.preventDefault();
        }
    });

    row.appendChild(input);
    row.appendChild(button);
    return row;
}

/**
 * Luo "suodata & järjestä"‑paneelin collapsible‑kääreineen.
 */
function buildFilterSection(tableName, columns, dataTypes) {
    const categorized = {
        id: [],
        numeric: [],
        boolean: [],
        linked: [],
        text: [],
        date: [],
        additional_id: [],
    };

    columns.forEach((col) => {
        const dtRaw = dataTypes[col];
        const actualType =
            typeof dtRaw === "object" && dtRaw?.data_type
                ? dtRaw.data_type
                : dtRaw;
        const category = determineColumnCategory(col, actualType);
        categorized[category].push(col);
    });

    const orderedMainFilters = [
        ...categorized.id,
        ...categorized.numeric,
        ...categorized.boolean,
        ...categorized.linked,
        ...categorized.text,
        ...categorized.date,
    ];
    const additionalIdColumns = categorized.additional_id;

    // --- pääfiltterit
    const mainFilterContainer = document.createElement("div");
    mainFilterContainer.classList.add("combined-filter-sort-container");

    orderedMainFilters.forEach((col) => {
        createRowForColumn(mainFilterContainer, tableName, col, dataTypes[col]);
    });

    // --- additional_id piiloon
    if (additionalIdColumns.length) {
        const additionalWrapper = document.createElement("div");
        additionalWrapper.style.display = "none";

        const additionalContainer = document.createElement("div");
        additionalContainer.classList.add("combined-filter-sort-container");

        additionalIdColumns.forEach((col) => {
            createRowForColumn(
                additionalContainer,
                tableName,
                col,
                dataTypes[col]
            );
        });

        additionalWrapper.appendChild(additionalContainer);

        const moreBtn = document.createElement("button");
        moreBtn.setAttribute("data-lang-key", "show_more");
        moreBtn.textContent = "Enemmän";
        moreBtn.addEventListener("click", () => {
            const isHidden = additionalWrapper.style.display === "none";
            additionalWrapper.style.display = isHidden ? "block" : "none";
            moreBtn.setAttribute(
                "data-lang-key",
                isHidden ? "show_less" : "show_more"
            );
            moreBtn.textContent = isHidden ? "Vähemmän" : "Enemmän";
        });

        mainFilterContainer.appendChild(moreBtn);
        mainFilterContainer.appendChild(additionalWrapper);
    }

    return create_collapsible_section(
        "Järjestä ja suodata",
        mainFilterContainer,
        true
    );
}

/* -----------------------------------------------------------
 *  Yksittäisen filter/sort‑rivielementin generointi
 * ---------------------------------------------------------*/
function createRowForColumn(container, tableName, column, colType) {
    const row = document.createElement("div");
    row.classList.add("row-container");

    // Sorttipainike (↕/▲/▼)
    const sortButton = document.createElement("button");
    sortButton.setAttribute("data-sort-state", "none");
    sortButton.textContent = "\u21C5"; // default ↕

    const currentState = getUnifiedTableState(tableName);
    if (currentState.sort?.column === column && currentState.sort?.direction) {
        const isAsc = currentState.sort.direction.toLowerCase() === "asc";
        sortButton.setAttribute("data-sort-state", isAsc ? "asc" : "desc");
        sortButton.textContent = isAsc ? "\u25B2" : "\u25BC"; // ▲ / ▼
    }

    sortButton.addEventListener("click", () => {
        container.querySelectorAll("button[data-sort-state]").forEach((btn) => {
            if (btn !== sortButton) {
                btn.setAttribute("data-sort-state", "none");
                btn.textContent = "\u21C5";
            }
        });

        const currentStateValue = sortButton.getAttribute("data-sort-state");
        let newState;
        if (currentStateValue === "none") newState = "asc";
        else if (currentStateValue === "asc") newState = "desc";
        else newState = "none";

        sortButton.setAttribute("data-sort-state", newState);
        sortButton.textContent =
            newState === "asc"
                ? "\u25B2"
                : newState === "desc"
                ? "\u25BC"
                : "\u21C5";

        const st = getUnifiedTableState(tableName);
        if (!st.sort) st.sort = { column: null, direction: null };

        if (newState === "none") {
            st.sort.column = null;
            st.sort.direction = null;
        } else {
            st.sort.column = column;
            st.sort.direction = newState === "asc" ? "ASC" : "DESC";
        }

        setUnifiedTableState(tableName, st);
        resetOffset();
        refreshTableUnified(tableName, { skipUrlParams: true });
    });

    // Varsinainen filtterikenttä
    const filterElement = createFilterElement(tableName, column, colType);

    row.appendChild(sortButton);
    row.appendChild(filterElement);
    container.appendChild(row);
}

/* -----------------------------------------------------------
 *  Filttereiden luonti (syöttökenttä / select / range / …)
 * ---------------------------------------------------------*/
function createFilterElement(tableName, column, colType) {
    const container = document.createElement("div");
    container.classList.add("input-group");

    const dtString = (
        typeof colType === "object" && colType?.data_type
            ? colType.data_type
            : colType || ""
    ).toLowerCase();

    /* ---- 1) Semanttinen haku ----------------------------------------- */
    if (column === "openai_embedding") {
        const semanticInput = document.createElement("input");
        semanticInput.type = "text";
        semanticInput.placeholder = "Anna semanttinen hakusana...";
        semanticInput.id = `${tableName}_filter_semantic_${column}`;

        semanticInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter")
                do_semantic_search(tableName, semanticInput.value);
        });

        container.appendChild(semanticInput);
        const label = document.createElement("label");
        label.setAttribute("data-lang-key", "semantic_vector_search");
        label.setAttribute("for", semanticInput.id);
        container.appendChild(label);
        return container;
    }

    /* ---- 2) Numero/päivä -alueet ------------------------------------ */
    const numericOrDateTypes = [
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
    ];

    if (numericOrDateTypes.includes(dtString)) {
        const baseId = `${tableName}_${column}`;
        const fromInput = document.createElement("input");
        const toInput = document.createElement("input");

        if (numericOrDateTypes.slice(0, 6).includes(dtString)) {
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

        fromInput.id = `${baseId}_from`;
        toInput.id = `${baseId}_to`;

        fromInput.addEventListener("input", () =>
            updateFilterAndRefresh(tableName, fromInput.id, fromInput.value)
        );
        toInput.addEventListener("input", () =>
            updateFilterAndRefresh(tableName, toInput.id, toInput.value)
        );

        container.appendChild(fromInput);
        container.appendChild(toInput);

        const label = document.createElement("label");
        label.setAttribute("data-lang-key", column);
        container.appendChild(label);
        return container;
    }

    /* ---- 3) Boolean‑select ------------------------------------------ */
    if (dtString === "boolean") {
        const select = document.createElement("select");
        select.id = `${tableName}_${column}`;

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

        select.addEventListener("input", () =>
            updateFilterAndRefresh(tableName, select.id, select.value)
        );

        container.appendChild(select);
        const label = document.createElement("label");
        label.setAttribute("for", select.id);
        label.setAttribute("data-lang-key", column);
        container.appendChild(label);
        return container;
    }

    /* ---- 4) Tekstikenttä (oletus) ------------------------------------ */
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.placeholder = " ";
    textInput.id = `${tableName}_${column}`;

    textInput.addEventListener("input", () =>
        updateFilterAndRefresh(tableName, textInput.id, textInput.value)
    );

    container.appendChild(textInput);
    const label = document.createElement("label");
    label.setAttribute("for", textInput.id);
    label.setAttribute("data-lang-key", column);
    container.appendChild(label);
    return container;
}

const _ongoingSearchResults = {};
/* ===========================================================
 *  Älykäs haku – /intelligent-results  (stream-versio)
 * =========================================================*/
async function do_intelligent_search(tableName, userQuery) {
    if (!userQuery.trim()) return;

    // Nollaa välimuisti uuden haun alussa
    _ongoingSearchResults[tableName] = null;

    const url =
        `/api/get-intelligent-results?stream=1` +
        `&table=${encodeURIComponent(tableName)}` +
        `&query=${encodeURIComponent(userQuery)}`;

    try {
        const resp = await fetch(url, {
            headers: { Accept: "application/x-ndjson" },
        });
        if (!resp.ok)
            throw new Error(`intelligent search error (status ${resp.status})`);

        const reader = resp.body.getReader();
        const textDecoder = new TextDecoder();
        let partialBuffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            partialBuffer += textDecoder.decode(value, { stream: true });
            const lines = partialBuffer.split("\n");
            partialBuffer = lines.pop(); // Viimeinen voi olla vajaa

            for (const line of lines) {
                if (!line.trim()) continue;
                const parsed = JSON.parse(line);
                console.log(`Processing search stage: ${parsed.stage}`); // Valinnainen lokitus
                await update_table_ui(tableName, parsed);
            }
        }
    } catch (e) {
        console.error("do_intelligent_search (stream) error:", e);
    }
}

/* ===========================================================
 *  Semanttinen haku (säilytetty entisellään)
 * =========================================================*/
async function do_semantic_search(tableName, userQuery) {
    if (!userQuery.trim()) return;
    const url = `/api/get-results-vector?table=${encodeURIComponent(
        tableName
    )}&vector_query=${encodeURIComponent(userQuery)}`;
    try {
        const resp = await fetch(url);
        if (!resp.ok)
            throw new Error(`vector search error (status ${resp.status})`);
        const data = await resp.json();
        // Lisää embeddaus-tulokset dynaamisesti
        appendDataToView(tableName, data.data, true); // append = true
    } catch (e) {
        console.error("do_semantic_search error:", e);
    }
}

/* ===========================================================
 *  Apuri: readOnly‑containerin varmistus
 *  (lisää tämä esim. heti ensureTableContainers‑funktion jälkeen)
 * =========================================================*/
function ensureReadOnlyContainer(tableName) {
    let container = document.getElementById(`${tableName}_readOnlyContainer`);
    if (!container) {
        // luo puuttuva container samaan paikkaan, jossa muu taulun sisältökin on
        const tablePartsContainer = ensureTableContainers(tableName);
        container = document.createElement("div");
        container.id = `${tableName}_readOnlyContainer`;
        container.classList.add("scrollable_content", "readOnlyContainer");
        tablePartsContainer.prepend(container); // tai appendChild, jos mieluummin listan loppuun
    }
    return container;
}

/* ===========================================================
 *  Table‑UI päivitys (ja readOnly render)
 * =========================================================*/
async function showReadOnlyTable(tableName, columns, data, types) {
    const container = ensureReadOnlyContainer(tableName);
    container.replaceChildren();

    // Tarkista, onko data tyhjä
    if (!data || data.length === 0) {
        const noDataMessage = document.createElement("p");
        noDataMessage.textContent = "Ei tuloksia.";
        container.appendChild(noDataMessage);
        return;
    }

    const tableElement = await generate_table(tableName, columns, data, types);
    if (tableElement) {
        container.appendChild(tableElement);
    } else {
        console.warn(
            "showReadOnlyTable: generate_table ei palauttanut elementtiä"
        );
    }
}

export async function update_table_ui(tableName, incoming) {
    const cache = _ongoingSearchResults[tableName];

    /* ------------------------------------------------------------
     * 1. Jos tämä on ensimmäinen erä (tekstipohjainen haku) → tallenna & näytä
     * ---------------------------------------------------------- */
    if (!cache) {
        _ongoingSearchResults[tableName] = {
            columns: incoming.columns,
            data: [...incoming.data],
            types: incoming.types,
        };
        // Näytä tulokset korvaamalla nykyinen data
        appendDataToView(tableName, incoming.data, false); // append = false korvaa datan
        return;
    }

    /* ------------------------------------------------------------
     * 2. Merge – lisätään vain uudet rivit (embeddaus-haku)
     * ---------------------------------------------------------- */
    const primaryKey = cache.columns.includes("header") ? "header" : null;
    const existingKeys = new Set(
        cache.data.map((row) =>
            primaryKey ? row[primaryKey] : JSON.stringify(row)
        )
    );

    const newRows = incoming.data.filter((row) => {
        const key = primaryKey ? row[primaryKey] : JSON.stringify(row);
        return !existingKeys.has(key);
    });

    if (newRows.length > 0) {
        cache.data.push(...newRows);
        // Lisää uudet rivit näkymään (embeddaus-tulokset)
        appendDataToView(tableName, newRows, true); // append = true lisää datan
    }

    // Päivitä tyypit/kolumnit, jos embeddaus-erä toi tarkemmat tiedot
    cache.columns = incoming.columns || cache.columns;
    cache.types = incoming.types || cache.types;
}

/* ===========================================================
 *  Yhdistetty filtterin päivitys + taulun refresh
 * =========================================================*/
function updateFilterAndRefresh(tableName, colKey, value) {
    console.log("%cupdateFilterAndRefresh", "color:#2196F3;font-weight:bold;", {
        tableName,
        colKey,
        value,
    });

    const state = getUnifiedTableState(tableName);
    if (!state.filters) state.filters = {};

    if (value === "") delete state.filters[colKey];
    else state.filters[colKey] = value;

    setUnifiedTableState(tableName, state);
    resetOffset();
    refreshTableUnified(tableName, { skipUrlParams: true });
}

/* ===========================================================
 *  Näytä/piilota filterBar
 * =========================================================*/
function setFilterBarVisibility(
    filterBarElement,
    tablePartsContainer,
    showBtn,
    isVisible
) {
    if (isVisible) {
        filterBarElement.classList.remove("hidden");
        tablePartsContainer.style.gridTemplateColumns = "auto 450px";
        showBtn.style.display = "none";
    } else {
        filterBarElement.classList.add("hidden");
        tablePartsContainer.style.gridTemplateColumns = "auto 0px";
        showBtn.style.display = "block";
    }
    filterBarVisible = isVisible;
    updateShowFilterBarButtonPosition(tablePartsContainer, showBtn);
}

function updateShowFilterBarButtonPosition(tablePartsContainer, showBtn) {
    const visibleScrollable = tablePartsContainer.querySelector(
        ".scrollable_content:not([style*='display: none'])"
    );
    if (!visibleScrollable) return;

    const hasScroll =
        visibleScrollable.scrollHeight > visibleScrollable.clientHeight;
    if (hasScroll) {
        const scrollbarWidth =
            visibleScrollable.offsetWidth - visibleScrollable.clientWidth;
        showBtn.style.right = `${
            scrollbarWidth === 0 ? 17 : scrollbarWidth + 10
        }px`;
    } else {
        showBtn.style.right = "10px";
    }
}

function checkWindowWidth(tableName) {
    const filterBar = document.getElementById(`${tableName}_filterBar`);
    const tablePartsContainer = document.getElementById(
        `${tableName}_table_parts_container`
    );
    if (!filterBar || !tablePartsContainer) return;

    const showBtn = tablePartsContainer.querySelector(
        ".show_filter_bar_button"
    );

    if (window.innerWidth < FILTERBAR_WIDTH_THRESHOLD) {
        filterBar.classList.add("hidden");
        tablePartsContainer.style.gridTemplateColumns = "auto 0px";
        filterBarVisible = false;
        if (showBtn) showBtn.style.display = "block";
    } else {
        filterBar.classList.remove("hidden");
        tablePartsContainer.style.gridTemplateColumns = "auto 450px";
        filterBarVisible = true;
        if (showBtn) showBtn.style.display = "none";
    }

    updateShowFilterBarButtonPosition(tablePartsContainer, showBtn);
}

/* ===========================================================
 *  PUBLIC API: create_filter_bar
 * =========================================================*/
export function create_filter_bar(tableName, columns, dataTypes, currentView) {
    const adminMode = localStorage.getItem("admin_mode") === "true";

    // 1) containerit & filterBar‑elementti
    const tablePartsContainer = ensureTableContainers(tableName);
    let filterBar = document.getElementById(`${tableName}_filterBar`);
    if (!filterBar) {
        filterBar = document.createElement("div");
        filterBar.id = `${tableName}_filterBar`;
        filterBar.classList.add("filterBar");
        tablePartsContainer.appendChild(filterBar);
    } else {
        return; // jo olemassa
    }

    /* ---------- 2) Otsikkorivi ---------- */
    const rowCountElement = document.createElement("span");
    rowCountElement.textContent = "... ";
    fetchRowCount(tableName).then((cnt) => {
        const theNumber = cnt ?? "?";
        rowCountElement.textContent = `${theNumber} `;
        const resultsText = document.createElement("span");
        resultsText.setAttribute(
            "data-lang-key",
            cnt === 1 ? "result" : "results"
        );
        resultsText.textContent = cnt === 1 ? "result" : "results";
        rowCountElement.appendChild(resultsText);
    });

    const toggleButton = document.createElement("button");
    toggleButton.classList.add("hide_filter_bar_button");
    toggleButton.title = "Piilota tai näytä suodatuspalkki";
    toggleButton.innerHTML =
        '<svg viewBox="0 -960 960 960" width="24" height="24" fill="var(--text_color)"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm440-80h120v-560H640v560Zm-80 0v-560H200v560h360Zm80 0h120-120Z"/></svg>';

    const titleRow = buildTitleRow(tableName, rowCountElement, toggleButton);
    filterBar.appendChild(titleRow);

    /* ---------- 3) TopRow ---------- */
    filterBar.appendChild(buildTopRow(tableName, adminMode, currentView));

    /* ---------- 4) Älykäs globaalihaku ---------- */
    filterBar.appendChild(buildSearchRow(tableName));

    /* ---------- 5) Filtterit ---------- */
    filterBar.appendChild(buildFilterSection(tableName, columns, dataTypes));

    /* ---------- 6) Näytä/piilota‑nappula ---------- */
    const showFilterBarButton = document.createElement("button");
    showFilterBarButton.classList.add("show_filter_bar_button");
    showFilterBarButton.style.position = "absolute";
    showFilterBarButton.style.top = "10px";
    showFilterBarButton.style.right = "0px";
    showFilterBarButton.style.display = "none";
    showFilterBarButton.innerHTML = toggleButton.innerHTML;

    showFilterBarButton.addEventListener("click", () =>
        setFilterBarVisibility(
            filterBar,
            tablePartsContainer,
            showFilterBarButton,
            true
        )
    );
    toggleButton.addEventListener("click", () =>
        setFilterBarVisibility(
            filterBar,
            tablePartsContainer,
            showFilterBarButton,
            !filterBarVisible
        )
    );

    tablePartsContainer.appendChild(showFilterBarButton);

    /* ---------- 7) Admin‑chat UI ---------- */
    appendChatUIIfAdmin(tableName, filterBar);

    /* ---------- 8) Responsiiviset handlerit ---------- */
    window.addEventListener("resize", () => {
        checkWindowWidth(tableName);
        updateShowFilterBarButtonPosition(
            tablePartsContainer,
            showFilterBarButton
        );
    });

    document.addEventListener("click", (e) => {
        if (
            window.innerWidth < 1000 &&
            filterBarVisible &&
            !filterBar.contains(e.target) &&
            !showFilterBarButton.contains(e.target)
        ) {
            setFilterBarVisibility(
                filterBar,
                tablePartsContainer,
                showFilterBarButton,
                false
            );
        }
    });

    /* ---------- 9) Alustava leveystarkastus ---------- */
    checkWindowWidth(tableName);
}


// // create_filter_bar.js

// import { resetOffset } from "../infinite_scroll/infinite_scroll.js";
// import {
//     getUnifiedTableState,
//     setUnifiedTableState,
//     refreshTableUnified,
// } from "../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js";

// import { create_collapsible_section } from "../../common_components/collapsible-section/collapsible_section.js";
// import { generate_table } from "../table_views/view_table.js";

// // Peruskäyttäjän nappi
// import { createAddRowButton } from "../general_tables/gt_toolbar/button_factory.js";

// // Admin-ominaisuudet eriytettynä
// import {
//     appendAdminFeatures,
//     appendChatUIIfAdmin,
// } from "./create_filter_bar_admin.js";
// import "./overlay_filter_bar_observer.js";

// /* ===========================================================
//  *  Yleiset muuttujat ja apurit
//  * =========================================================*/

// // Kynnysarvo, jonka alapuolella filterBar piilotetaan automaattisesti
// const FILTERBAR_WIDTH_THRESHOLD = 1600;

// // Komponentin näkyvyystila
// let filterBarVisible = true;

// // --- Apufunktio rivimäärän hakuun ----------------------------------------
// async function fetchRowCount(tableName) {
//     try {
//         const resp = await fetch(`/api/get-row-count?table=${tableName}`, {
//             method: "GET",
//             credentials: "include",
//         });
//         if (!resp.ok) throw new Error(`error (status: ${resp.status})`);
//         const { row_count: rowCount } = await resp.json();
//         return typeof rowCount === "number" ? rowCount : null;
//     } catch (err) {
//         console.error("virhe fetchRowCount-funktiossa:", err);
//         return null;
//     }
// }

// // --- Sarakkeen luokittelu ------------------------------------------------
// function determineColumnCategory(column, dataType) {
//     if (column === "id") return "id";

//     const lowerCol = column.toLowerCase();
//     if (lowerCol.endsWith("_id") || lowerCol.endsWith("_uid"))
//         return "additional_id";

//     const numericTypes = [
//         "numeric",
//         "integer",
//         "bigint",
//         "smallint",
//         "real",
//         "double precision",
//     ];

//     if (numericTypes.includes(dataType)) return "numeric";
//     if (dataType === "boolean") return "boolean";
//     if (lowerCol.endsWith("(linked)") || lowerCol.endsWith("(ln)"))
//         return "linked";

//     const dateTypes = [
//         "date",
//         "timestamp",
//         "timestamp without time zone",
//         "timestamp with time zone",
//     ];

//     if (dateTypes.includes(dataType)) return "date";
//     return "text";
// }

// /* ===========================================================
//  *  UI‑rakentajat pieninä funktioina
//  * =========================================================*/

// /**
//  * Luo tai hakee table-kohtaisen pääcontainerin.
//  */
// function ensureTableContainers(tableName) {
//     let tablePartsContainer = document.getElementById(
//         `${tableName}_table_parts_container`
//     );
//     if (!tablePartsContainer) {
//         tablePartsContainer = document.createElement("div");
//         tablePartsContainer.id = `${tableName}_table_parts_container`;
//         document.body.appendChild(tablePartsContainer);
//     }
//     return tablePartsContainer;
// }

// /**
//  * Luo otsikko‑ ja toggle‑rivin (nimi + rivimäärä + piilota/avaa‑nappi).
//  */
// function buildTitleRow(tableName, rowCountElement, toggleButton) {
//     const titleContainer = document.createElement("div");
//     titleContainer.classList.add("filterBar-title-container");
//     titleContainer.style.display = "flex";
//     titleContainer.style.justifyContent = "space-between";
//     titleContainer.style.alignItems = "baseline";

//     // --- vasen puoli: taulun nimi
//     const tableNameWrapper = document.createElement("div");
//     const tableNameElement = document.createElement("div");
//     tableNameElement.textContent = tableName;
//     tableNameElement.style.fontWeight = "bold";
//     tableNameElement.style.fontSize = "20px";
//     tableNameElement.setAttribute("data-lang-key", tableName);
//     tableNameElement.title = tableName;
//     tableNameWrapper.appendChild(tableNameElement);

//     // --- oikea puoli: rivimäärä + nappi
//     const rightWrapper = document.createElement("div");
//     rightWrapper.style.display = "flex";
//     rightWrapper.style.alignItems = "center";
//     rightWrapper.style.gap = "0.5rem";

//     rightWrapper.appendChild(rowCountElement);
//     rightWrapper.appendChild(toggleButton);

//     titleContainer.appendChild(tableNameWrapper);
//     titleContainer.appendChild(rightWrapper);

//     return titleContainer;
// }

// /**
//  * Luo top_row‑elementin, joka sisältää:
//  *  1) peruskäyttäjän napit
//  *  2) (valinnaisesti) admin-napit ja näkymävalitsimen
//  */
// function buildTopRow(tableName, adminMode, currentView) {
//     const existing = document.getElementById(`${tableName}_filterBar_top_row`);
//     if (existing) return existing; // luotu jo aiemmin

//     const topRow = document.createElement("div");
//     topRow.id = `${tableName}_filterBar_top_row`;
//     topRow.classList.add("filterBar-top-row");

//     /* ---------- Rivi 1: peruskäyttäjän napit ---------- */
//     const firstLine = document.createElement("div");
//     firstLine.classList.add("top-row-first-line");

//     const userButtonsContainer = document.createElement("div");
//     userButtonsContainer.classList.add("filterBar-button-container");
//     userButtonsContainer.appendChild(createAddRowButton(tableName));

//     firstLine.appendChild(userButtonsContainer);
//     topRow.appendChild(firstLine);

//     /* ---------- Rivi 2: admin ---------- */
//     if (adminMode) {
//         const secondLine = document.createElement("div");
//         secondLine.classList.add("top-row-second-line");

//         const adminButtonsContainer = document.createElement("div");
//         adminButtonsContainer.classList.add("management-buttons");

//         const viewSelectorContainer = document.createElement("div");

//         secondLine.appendChild(adminButtonsContainer);
//         secondLine.appendChild(viewSelectorContainer);
//         topRow.appendChild(secondLine);

//         appendAdminFeatures(
//             tableName,
//             adminButtonsContainer,
//             viewSelectorContainer,
//             currentView
//         );
//     }

//     return topRow;
// }

// /* -----------------------------------------------------------
//  *  Älykäs globaali haku – historialla ja palautuksella
//  * ---------------------------------------------------------*/
// function buildSearchRow(tableName) {
//     const row = document.createElement("div");
//     row.classList.add("filterBar-search-row");

//     const input = document.createElement("input");
//     input.type = "text";
//     input.placeholder = "Hae älykkäästi...";
//     input.id = `${tableName}_global_intelligent_search_input`;
//     input.classList.add("global-search-input");

//     const button = document.createElement("button");
//     button.classList.add("global-search-button");
//     button.title = "Hae";
//     button.innerHTML =
//         '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM10 14a4 4 0 110-8 4 4 0 010 8z"/></svg>';

//     const STORAGE_KEY_HISTORY = `int_search_history_${tableName}`;
//     const STORAGE_KEY_DRAFT = `int_search_draft_${tableName}`;

//     let history = [];
//     try {
//         history = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
//     } catch {
//         history = [];
//     }

//     // Aseta viimeisin haku inputtiin, ellei käyttäjällä ole draftia tallessa.
//     const savedDraft = localStorage.getItem(STORAGE_KEY_DRAFT);
//     if (savedDraft !== null) {
//         input.value = savedDraft;
//     } else if (history.length) {
//         input.value = history[history.length - 1];
//     }

//     let historyIndex = null; // null = ei selaa historiaa, muuten indeksi historiotaulukossa
//     let currentDraft = ""; // mitä käyttäjä kirjoitti ennen nuolinavigointia

//     function commitSearch() {
//         const query = input.value.trim();
//         if (!query) return;
//         do_intelligent_search(tableName, query);
//         // päivitä historia, poista duplikaatit peräkkäin
//         if (history[history.length - 1] !== query) history.push(query);
//         localStorage.setItem(
//             STORAGE_KEY_HISTORY,
//             JSON.stringify(history.slice(-50))
//         ); // säilytä max 50
//         localStorage.removeItem(STORAGE_KEY_DRAFT);
//         historyIndex = null;
//     }

//     // Tallenna draft reaaliajassa, jotta reload säilyttää
//     input.addEventListener("input", () => {
//         localStorage.setItem(STORAGE_KEY_DRAFT, input.value);
//     });

//     button.addEventListener("click", commitSearch);
//     input.addEventListener("keypress", (e) => {
//         if (e.key === "Enter") commitSearch();
//     });

//     input.addEventListener("keydown", (e) => {
//         if (e.key === "ArrowUp") {
//             if (history.length === 0) return;
//             if (historyIndex === null) {
//                 currentDraft = input.value;
//                 historyIndex = history.length - 1;
//             } else if (historyIndex > 0) {
//                 historyIndex -= 1;
//             }
//             input.value = history[historyIndex];
//             e.preventDefault();
//         } else if (e.key === "ArrowDown") {
//             if (historyIndex === null) return; // ei selaa
//             if (historyIndex < history.length - 1) {
//                 historyIndex += 1;
//                 input.value = history[historyIndex];
//             } else {
//                 // Paluu luonnokseen
//                 historyIndex = null;
//                 input.value = currentDraft;
//             }
//             e.preventDefault();
//         }
//     });

//     row.appendChild(input);
//     row.appendChild(button);
//     return row;
// }

// /**
//  * Luo "suodata & järjestä"‑paneelin collapsible‑kääreineen.
//  */
// function buildFilterSection(tableName, columns, dataTypes) {
//     const categorized = {
//         id: [],
//         numeric: [],
//         boolean: [],
//         linked: [],
//         text: [],
//         date: [],
//         additional_id: [],
//     };

//     columns.forEach((col) => {
//         const dtRaw = dataTypes[col];
//         const actualType =
//             typeof dtRaw === "object" && dtRaw?.data_type
//                 ? dtRaw.data_type
//                 : dtRaw;
//         const category = determineColumnCategory(col, actualType);
//         categorized[category].push(col);
//     });

//     const orderedMainFilters = [
//         ...categorized.id,
//         ...categorized.numeric,
//         ...categorized.boolean,
//         ...categorized.linked,
//         ...categorized.text,
//         ...categorized.date,
//     ];
//     const additionalIdColumns = categorized.additional_id;

//     // --- pääfiltterit
//     const mainFilterContainer = document.createElement("div");
//     mainFilterContainer.classList.add("combined-filter-sort-container");

//     orderedMainFilters.forEach((col) => {
//         createRowForColumn(mainFilterContainer, tableName, col, dataTypes[col]);
//     });

//     // --- additional_id piiloon
//     if (additionalIdColumns.length) {
//         const additionalWrapper = document.createElement("div");
//         additionalWrapper.style.display = "none";

//         const additionalContainer = document.createElement("div");
//         additionalContainer.classList.add("combined-filter-sort-container");

//         additionalIdColumns.forEach((col) => {
//             createRowForColumn(
//                 additionalContainer,
//                 tableName,
//                 col,
//                 dataTypes[col]
//             );
//         });

//         additionalWrapper.appendChild(additionalContainer);

//         const moreBtn = document.createElement("button");
//         moreBtn.setAttribute("data-lang-key", "show_more");
//         moreBtn.textContent = "Enemmän";
//         moreBtn.addEventListener("click", () => {
//             const isHidden = additionalWrapper.style.display === "none";
//             additionalWrapper.style.display = isHidden ? "block" : "none";
//             moreBtn.setAttribute(
//                 "data-lang-key",
//                 isHidden ? "show_less" : "show_more"
//             );
//             moreBtn.textContent = isHidden ? "Vähemmän" : "Enemmän";
//         });

//         mainFilterContainer.appendChild(moreBtn);
//         mainFilterContainer.appendChild(additionalWrapper);
//     }

//     return create_collapsible_section(
//         "Järjestä ja suodata",
//         mainFilterContainer,
//         true
//     );
// }

// /* -----------------------------------------------------------
//  *  Yksittäisen filter/sort‑rivielementin generointi
//  * ---------------------------------------------------------*/
// function createRowForColumn(container, tableName, column, colType) {
//     const row = document.createElement("div");
//     row.classList.add("row-container");

//     // Sorttipainike (↕/▲/▼)
//     const sortButton = document.createElement("button");
//     sortButton.setAttribute("data-sort-state", "none");
//     sortButton.textContent = "\u21C5"; // default ↕

//     const currentState = getUnifiedTableState(tableName);
//     if (currentState.sort?.column === column && currentState.sort?.direction) {
//         const isAsc = currentState.sort.direction.toLowerCase() === "asc";
//         sortButton.setAttribute("data-sort-state", isAsc ? "asc" : "desc");
//         sortButton.textContent = isAsc ? "\u25B2" : "\u25BC"; // ▲ / ▼
//     }

//     sortButton.addEventListener("click", () => {
//         container.querySelectorAll("button[data-sort-state]").forEach((btn) => {
//             if (btn !== sortButton) {
//                 btn.setAttribute("data-sort-state", "none");
//                 btn.textContent = "\u21C5";
//             }
//         });

//         const currentStateValue = sortButton.getAttribute("data-sort-state");
//         let newState;
//         if (currentStateValue === "none") newState = "asc";
//         else if (currentStateValue === "asc") newState = "desc";
//         else newState = "none";

//         sortButton.setAttribute("data-sort-state", newState);
//         sortButton.textContent =
//             newState === "asc"
//                 ? "\u25B2"
//                 : newState === "desc"
//                 ? "\u25BC"
//                 : "\u21C5";

//         const st = getUnifiedTableState(tableName);
//         if (!st.sort) st.sort = { column: null, direction: null };

//         if (newState === "none") {
//             st.sort.column = null;
//             st.sort.direction = null;
//         } else {
//             st.sort.column = column;
//             st.sort.direction = newState === "asc" ? "ASC" : "DESC";
//         }

//         setUnifiedTableState(tableName, st);
//         resetOffset();
//         refreshTableUnified(tableName, { skipUrlParams: true });
//     });

//     // Varsinainen filtterikenttä
//     const filterElement = createFilterElement(tableName, column, colType);

//     row.appendChild(sortButton);
//     row.appendChild(filterElement);
//     container.appendChild(row);
// }

// /* -----------------------------------------------------------
//  *  Filttereiden luonti (syöttökenttä / select / range / …)
//  * ---------------------------------------------------------*/
// function createFilterElement(tableName, column, colType) {
//     const container = document.createElement("div");
//     container.classList.add("input-group");

//     const dtString = (
//         typeof colType === "object" && colType?.data_type
//             ? colType.data_type
//             : colType || ""
//     ).toLowerCase();

//     /* ---- 1) Semanttinen haku ----------------------------------------- */
//     if (column === "openai_embedding") {
//         const semanticInput = document.createElement("input");
//         semanticInput.type = "text";
//         semanticInput.placeholder = "Anna semanttinen hakusana...";
//         semanticInput.id = `${tableName}_filter_semantic_${column}`;

//         semanticInput.addEventListener("keypress", (e) => {
//             if (e.key === "Enter")
//                 do_semantic_search(tableName, semanticInput.value);
//         });

//         container.appendChild(semanticInput);
//         const label = document.createElement("label");
//         label.setAttribute("data-lang-key", "semantic_vector_search");
//         label.setAttribute("for", semanticInput.id);
//         container.appendChild(label);
//         return container;
//     }

//     /* ---- 2) Numero/päivä -alueet ------------------------------------ */
//     const numericOrDateTypes = [
//         "integer",
//         "bigint",
//         "smallint",
//         "numeric",
//         "real",
//         "double precision",
//         "date",
//         "timestamp",
//         "timestamp without time zone",
//         "timestamp with time zone",
//     ];

//     if (numericOrDateTypes.includes(dtString)) {
//         const baseId = `${tableName}_${column}`;
//         const fromInput = document.createElement("input");
//         const toInput = document.createElement("input");

//         if (numericOrDateTypes.slice(0, 6).includes(dtString)) {
//             fromInput.type = "number";
//             toInput.type = "number";
//             fromInput.placeholder = "Min";
//             toInput.placeholder = "Max";
//         } else {
//             fromInput.type = "date";
//             toInput.type = "date";
//             fromInput.placeholder = "From";
//             toInput.placeholder = "To";
//         }

//         fromInput.id = `${baseId}_from`;
//         toInput.id = `${baseId}_to`;

//         fromInput.addEventListener("input", () =>
//             updateFilterAndRefresh(tableName, fromInput.id, fromInput.value)
//         );
//         toInput.addEventListener("input", () =>
//             updateFilterAndRefresh(tableName, toInput.id, toInput.value)
//         );

//         container.appendChild(fromInput);
//         container.appendChild(toInput);

//         const label = document.createElement("label");
//         label.setAttribute("data-lang-key", column);
//         container.appendChild(label);
//         return container;
//     }

//     /* ---- 3) Boolean‑select ------------------------------------------ */
//     if (dtString === "boolean") {
//         const select = document.createElement("select");
//         select.id = `${tableName}_${column}`;

//         ["", "true", "false", "empty"].forEach((val) => {
//             const opt = document.createElement("option");
//             opt.value = val;
//             opt.textContent =
//                 val === ""
//                     ? "All"
//                     : val === "empty"
//                     ? "Empty"
//                     : val.charAt(0).toUpperCase() + val.slice(1);
//             select.appendChild(opt);
//         });

//         select.addEventListener("input", () =>
//             updateFilterAndRefresh(tableName, select.id, select.value)
//         );

//         container.appendChild(select);
//         const label = document.createElement("label");
//         label.setAttribute("for", select.id);
//         label.setAttribute("data-lang-key", column);
//         container.appendChild(label);
//         return container;
//     }

//     /* ---- 4) Tekstikenttä (oletus) ------------------------------------ */
//     const textInput = document.createElement("input");
//     textInput.type = "text";
//     textInput.placeholder = " ";
//     textInput.id = `${tableName}_${column}`;

//     textInput.addEventListener("input", () =>
//         updateFilterAndRefresh(tableName, textInput.id, textInput.value)
//     );

//     container.appendChild(textInput);
//     const label = document.createElement("label");
//     label.setAttribute("for", textInput.id);
//     label.setAttribute("data-lang-key", column);
//     container.appendChild(label);
//     return container;
// }

// const _ongoingSearchResults = {};
// /* ===========================================================
//  *  Älykäs haku – /intelligent-results  (stream-versio)
//  * =========================================================*/
// async function do_intelligent_search(tableName, userQuery) {
//     if (!userQuery.trim()) return;

//     // A) Nollaa välimuisti uuden haun alussa
//     _ongoingSearchResults[tableName] = null;

//     const url =
//         `/api/get-intelligent-results?stream=1` +
//         `&table=${encodeURIComponent(tableName)}` +
//         `&query=${encodeURIComponent(userQuery)}`;

//     try {
//         const resp = await fetch(url, {
//             headers: { Accept: "application/x-ndjson" },
//         });
//         if (!resp.ok)
//             throw new Error(`intelligent search error (status ${resp.status})`);

//         const reader = resp.body.getReader();
//         const textDecoder = new TextDecoder();
//         let partialBuffer = "";

//         while (true) {
//             const { value, done } = await reader.read();
//             if (done) break;

//             partialBuffer += textDecoder.decode(value, { stream: true });
//             const lines = partialBuffer.split("\n");
//             partialBuffer = lines.pop(); // viimeinen voi olla vajaa

//             for (const line of lines) {
//                 if (!line.trim()) continue;
//                 const parsed = JSON.parse(line);

//                 // Välitetään kaikki erät samaan fuun
//                 await update_table_ui(tableName, parsed);
//             }
//         }
//     } catch (e) {
//         console.error("do_intelligent_search (stream) error:", e);
//     }
// }

// /* ===========================================================
//  *  Semanttinen haku (säilytetty entisellään)
//  * =========================================================*/
// async function do_semantic_search(tableName, userQuery) {
//     if (!userQuery.trim()) return;
//     const url = `/api/get-results-vector?table=${encodeURIComponent(
//         tableName
//     )}&vector_query=${encodeURIComponent(userQuery)}`;
//     try {
//         const resp = await fetch(url);
//         if (!resp.ok)
//             throw new Error(`vector search error (status ${resp.status})`);
//         const data = await resp.json();
//         await update_table_ui(tableName, data);
//     } catch (e) {
//         console.error("do_semantic_search error:", e);
//     }
// }

// /* ===========================================================
//  *  Apuri: readOnly‑containerin varmistus
//  *  (lisää tämä esim. heti ensureTableContainers‑funktion jälkeen)
//  * =========================================================*/
// function ensureReadOnlyContainer(tableName) {
//     let container = document.getElementById(`${tableName}_readOnlyContainer`);
//     if (!container) {
//         // luo puuttuva container samaan paikkaan, jossa muu taulun sisältökin on
//         const tablePartsContainer = ensureTableContainers(tableName);
//         container = document.createElement("div");
//         container.id = `${tableName}_readOnlyContainer`;
//         container.classList.add("scrollable_content", "readOnlyContainer");
//         tablePartsContainer.prepend(container); // tai appendChild, jos mieluummin listan loppuun
//     }
//     return container;
// }

// /* ===========================================================
//  *  Table‑UI päivitys (ja readOnly render)
//  * =========================================================*/
// async function showReadOnlyTable(tableName, columns, data, types) {
//     const container = ensureReadOnlyContainer(tableName);
//     container.replaceChildren();

//     // Tarkista, onko data tyhjä
//     if (!data || data.length === 0) {
//         const noDataMessage = document.createElement("p");
//         noDataMessage.textContent = "Ei tuloksia.";
//         container.appendChild(noDataMessage);
//         return;
//     }

//     const tableElement = await generate_table(tableName, columns, data, types);
//     if (tableElement) {
//         container.appendChild(tableElement);
//     } else {
//         console.warn(
//             "showReadOnlyTable: generate_table ei palauttanut elementtiä"
//         );
//     }
// }

// export async function update_table_ui(tableName, incoming) {
//     const cache = _ongoingSearchResults[tableName];

//     /* ------------------------------------------------------------
//      * 1. Jos tämä on ensimmäinen erä → tallenna & renderöi sellaisenaan
//      * ---------------------------------------------------------- */
//     if (!cache) {
//         _ongoingSearchResults[tableName] = {
//             columns: incoming.columns,
//             data: [...incoming.data],
//             types: incoming.types,
//         };
//         await showReadOnlyTable(
//             tableName,
//             incoming.columns,
//             incoming.data,
//             incoming.types
//         );
//         return;
//     }

//     /* ------------------------------------------------------------
//      * 2. Merge – lisätään vain NE rivit, joita ei jo ole
//      *    Oletetaan, että ensisijainen avain on 'header'-sarake;
//      *    ellei löydy, käytetään rivin JSON-stringiä.
//      * ---------------------------------------------------------- */
//     const primaryKey = cache.columns.includes("header") ? "header" : null;
//     const existingKeys = new Set(
//         cache.data.map((row) =>
//             primaryKey ? row[primaryKey] : JSON.stringify(row)
//         )
//     );

//     for (const row of incoming.data) {
//         const key = primaryKey ? row[primaryKey] : JSON.stringify(row);
//         if (!existingKeys.has(key)) {
//             cache.data.push(row);
//             existingKeys.add(key);
//         }
//     }

//     // Päivitä tyypit/kolumnit, jos AI-erä toi tarkemmat tyypit
//     cache.columns = incoming.columns || cache.columns;
//     cache.types = incoming.types || cache.types;

//     /* ------------------------------------------------------------
//      * 3. Renderöi yhdistetty tulos – vanha sisältö korvautuu,
//      *    mutta vain YHDEN kerran, joten mitään “välityhjää” ei synny
//      * ---------------------------------------------------------- */
//     await showReadOnlyTable(tableName, cache.columns, cache.data, cache.types);
// }

// /* ===========================================================
//  *  Yhdistetty filtterin päivitys + taulun refresh
//  * =========================================================*/
// function updateFilterAndRefresh(tableName, colKey, value) {
//     console.log("%cupdateFilterAndRefresh", "color:#2196F3;font-weight:bold;", {
//         tableName,
//         colKey,
//         value,
//     });

//     const state = getUnifiedTableState(tableName);
//     if (!state.filters) state.filters = {};

//     if (value === "") delete state.filters[colKey];
//     else state.filters[colKey] = value;

//     setUnifiedTableState(tableName, state);
//     resetOffset();
//     refreshTableUnified(tableName, { skipUrlParams: true });
// }

// /* ===========================================================
//  *  Näytä/piilota filterBar
//  * =========================================================*/
// function setFilterBarVisibility(
//     filterBarElement,
//     tablePartsContainer,
//     showBtn,
//     isVisible
// ) {
//     if (isVisible) {
//         filterBarElement.classList.remove("hidden");
//         tablePartsContainer.style.gridTemplateColumns = "auto 450px";
//         showBtn.style.display = "none";
//     } else {
//         filterBarElement.classList.add("hidden");
//         tablePartsContainer.style.gridTemplateColumns = "auto 0px";
//         showBtn.style.display = "block";
//     }
//     filterBarVisible = isVisible;
//     updateShowFilterBarButtonPosition(tablePartsContainer, showBtn);
// }

// function updateShowFilterBarButtonPosition(tablePartsContainer, showBtn) {
//     const visibleScrollable = tablePartsContainer.querySelector(
//         ".scrollable_content:not([style*='display: none'])"
//     );
//     if (!visibleScrollable) return;

//     const hasScroll =
//         visibleScrollable.scrollHeight > visibleScrollable.clientHeight;
//     if (hasScroll) {
//         const scrollbarWidth =
//             visibleScrollable.offsetWidth - visibleScrollable.clientWidth;
//         showBtn.style.right = `${
//             scrollbarWidth === 0 ? 17 : scrollbarWidth + 10
//         }px`;
//     } else {
//         showBtn.style.right = "10px";
//     }
// }

// function checkWindowWidth(tableName) {
//     const filterBar = document.getElementById(`${tableName}_filterBar`);
//     const tablePartsContainer = document.getElementById(
//         `${tableName}_table_parts_container`
//     );
//     if (!filterBar || !tablePartsContainer) return;

//     const showBtn = tablePartsContainer.querySelector(
//         ".show_filter_bar_button"
//     );

//     if (window.innerWidth < FILTERBAR_WIDTH_THRESHOLD) {
//         filterBar.classList.add("hidden");
//         tablePartsContainer.style.gridTemplateColumns = "auto 0px";
//         filterBarVisible = false;
//         if (showBtn) showBtn.style.display = "block";
//     } else {
//         filterBar.classList.remove("hidden");
//         tablePartsContainer.style.gridTemplateColumns = "auto 450px";
//         filterBarVisible = true;
//         if (showBtn) showBtn.style.display = "none";
//     }

//     updateShowFilterBarButtonPosition(tablePartsContainer, showBtn);
// }

// /* ===========================================================
//  *  PUBLIC API: create_filter_bar
//  * =========================================================*/
// export function create_filter_bar(tableName, columns, dataTypes, currentView) {
//     const adminMode = localStorage.getItem("admin_mode") === "true";

//     // 1) containerit & filterBar‑elementti
//     const tablePartsContainer = ensureTableContainers(tableName);
//     let filterBar = document.getElementById(`${tableName}_filterBar`);
//     if (!filterBar) {
//         filterBar = document.createElement("div");
//         filterBar.id = `${tableName}_filterBar`;
//         filterBar.classList.add("filterBar");
//         tablePartsContainer.appendChild(filterBar);
//     } else {
//         return; // jo olemassa
//     }

//     /* ---------- 2) Otsikkorivi ---------- */
//     const rowCountElement = document.createElement("span");
//     rowCountElement.textContent = "... ";
//     fetchRowCount(tableName).then((cnt) => {
//         const theNumber = cnt ?? "?";
//         rowCountElement.textContent = `${theNumber} `;
//         const resultsText = document.createElement("span");
//         resultsText.setAttribute(
//             "data-lang-key",
//             cnt === 1 ? "result" : "results"
//         );
//         resultsText.textContent = cnt === 1 ? "result" : "results";
//         rowCountElement.appendChild(resultsText);
//     });

//     const toggleButton = document.createElement("button");
//     toggleButton.classList.add("hide_filter_bar_button");
//     toggleButton.title = "Piilota tai näytä suodatuspalkki";
//     toggleButton.innerHTML =
//         '<svg viewBox="0 -960 960 960" width="24" height="24" fill="var(--text_color)"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm440-80h120v-560H640v560Zm-80 0v-560H200v560h360Zm80 0h120-120Z"/></svg>';

//     const titleRow = buildTitleRow(tableName, rowCountElement, toggleButton);
//     filterBar.appendChild(titleRow);

//     /* ---------- 3) TopRow ---------- */
//     filterBar.appendChild(buildTopRow(tableName, adminMode, currentView));

//     /* ---------- 4) Älykäs globaalihaku ---------- */
//     filterBar.appendChild(buildSearchRow(tableName));

//     /* ---------- 5) Filtterit ---------- */
//     filterBar.appendChild(buildFilterSection(tableName, columns, dataTypes));

//     /* ---------- 6) Näytä/piilota‑nappula ---------- */
//     const showFilterBarButton = document.createElement("button");
//     showFilterBarButton.classList.add("show_filter_bar_button");
//     showFilterBarButton.style.position = "absolute";
//     showFilterBarButton.style.top = "10px";
//     showFilterBarButton.style.right = "0px";
//     showFilterBarButton.style.display = "none";
//     showFilterBarButton.innerHTML = toggleButton.innerHTML;

//     showFilterBarButton.addEventListener("click", () =>
//         setFilterBarVisibility(
//             filterBar,
//             tablePartsContainer,
//             showFilterBarButton,
//             true
//         )
//     );
//     toggleButton.addEventListener("click", () =>
//         setFilterBarVisibility(
//             filterBar,
//             tablePartsContainer,
//             showFilterBarButton,
//             !filterBarVisible
//         )
//     );

//     tablePartsContainer.appendChild(showFilterBarButton);

//     /* ---------- 7) Admin‑chat UI ---------- */
//     appendChatUIIfAdmin(tableName, filterBar);

//     /* ---------- 8) Responsiiviset handlerit ---------- */
//     window.addEventListener("resize", () => {
//         checkWindowWidth(tableName);
//         updateShowFilterBarButtonPosition(
//             tablePartsContainer,
//             showFilterBarButton
//         );
//     });

//     document.addEventListener("click", (e) => {
//         if (
//             window.innerWidth < 1000 &&
//             filterBarVisible &&
//             !filterBar.contains(e.target) &&
//             !showFilterBarButton.contains(e.target)
//         ) {
//             setFilterBarVisibility(
//                 filterBar,
//                 tablePartsContainer,
//                 showFilterBarButton,
//                 false
//             );
//         }
//     });

//     /* ---------- 9) Alustava leveystarkastus ---------- */
//     checkWindowWidth(tableName);
// }

// // // create_filter_bar.js

// // import { resetOffset } from "../infinite_scroll/infinite_scroll.js";
// // import {
// //     getUnifiedTableState,
// //     setUnifiedTableState,
// //     refreshTableUnified,
// // } from "../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js";

// // import { create_collapsible_section } from "../../common_components/collapsible-section/collapsible_section.js";
// // import { generate_table } from "../table_views/view_table.js";

// // // Peruskäyttäjän nappi
// // import { createAddRowButton } from "../general_tables/gt_toolbar/button_factory.js";

// // // Admin-ominaisuudet eriytettynä
// // import {
// //     appendAdminFeatures,
// //     appendChatUIIfAdmin,
// // } from "./create_filter_bar_admin.js";
// // import "./overlay_filter_bar_observer.js";

// // // Määritellään kynnysarvo
// // const FILTERBAR_WIDTH_THRESHOLD = 1600;

// // // Alustetaan suodatuspalkin näkyvyystila
// // let filterBarVisible = true;

// // /**
// //  * Haetaan rivimäärä (esimerkkinä).
// //  */
// // async function fetchRowCount(table_name) {
// //     try {
// //         const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
// //             method: "GET",
// //             credentials: "include",
// //         });
// //         if (!resp.ok) {
// //             throw new Error(`error (status: ${resp.status})`);
// //         }
// //         const data = await resp.json();
// //         if (data && typeof data.row_count === "number") {
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
// //  * Luokitellaan sarake (esimerkki).
// //  */
// // function determineColumnCategory(column, data_type) {
// //     if (column === "id") {
// //         return "id";
// //     }
// //     const lowerCol = column.toLowerCase();
// //     if (lowerCol.endsWith("_id") || lowerCol.endsWith("_uid")) {
// //         return "additional_id";
// //     }
// //     if (
// //         data_type === "numeric" ||
// //         data_type === "integer" ||
// //         data_type === "bigint" ||
// //         data_type === "smallint" ||
// //         data_type === "real" ||
// //         data_type === "double precision"
// //     ) {
// //         return "numeric";
// //     }
// //     if (data_type === "boolean") {
// //         return "boolean";
// //     }
// //     if (lowerCol.endsWith("(linked)") || lowerCol.endsWith("(ln)")) {
// //         return "linked";
// //     }
// //     if (
// //         data_type === "date" ||
// //         data_type === "timestamp" ||
// //         data_type === "timestamp without time zone" ||
// //         data_type === "timestamp with time zone"
// //     ) {
// //         return "date";
// //     }
// //     return "text";
// // }

// // /**
// //  * Päivittää unified‑tilan filter‑osaa ja kutsuu refreshTableUnified.
// //  */
// // function updateFilterAndRefresh(tableName, colKey, value) {
// //     // 🔍 Debug‑loki:
// //     console.log("%cupdateFilterAndRefresh", "color:#2196F3;font-weight:bold;", {
// //         tableName,
// //         colKey,
// //         value,
// //     });

// //     const currentState = getUnifiedTableState(tableName);

// //     if (!currentState.filters) currentState.filters = {};

// //     if (value === "") {
// //         delete currentState.filters[colKey];
// //     } else {
// //         currentState.filters[colKey] = value;
// //     }

// //     setUnifiedTableState(tableName, currentState);
// //     resetOffset();
// //     refreshTableUnified(tableName, { skipUrlParams: true });
// // }

// // /**
// //  * Semanttinen haku (esimerkki).
// //  */
// // async function do_semantic_search(table_name, user_query) {
// //     console.log("Semanttinen haku, user_query:", user_query);
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
// //         console.log("Semanttinen haku tulos:", data);
// //         update_table_ui(table_name, data);
// //     } catch (e) {
// //         console.error("do_semantic_search error:", e);
// //     }
// // }

// // /**
// //  * Luo/näyttää varsinaisen taulun.
// //  */
// // async function showReadOnlyTable(table_name, columns, data, types) {
// //     const readOnlyContainer = document.getElementById(
// //         `${table_name}_readOnlyContainer`
// //     );
// //     if (!readOnlyContainer) {
// //         console.error("Virhe: readOnlyContainer puuttuu!");
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
// //  * Luodaan suodatuspalkki (filterBar), joka sisältää:
// //  *  - Taulun nimen ja rivimäärän
// //  *  - Peruskäyttäjän CRUD-napit (Add Row)
// //  *  - Sarakenäkyvyysnapin (esim. vain table-näkymässä)
// //  *  - Admin-napit omassa rivissään (viewSelector, massapoisto, embedding jne.)
// //  *  - (Mahd. global search ja muuta)
// //  *  - PIILOTA/NÄYTÄ-painikkeen oikeaan yläkulmaan.
// //  */
// // export function create_filter_bar(
// //     table_name,
// //     columns,
// //     data_types,
// //     current_view
// // ) {
// //     const admin_mode = localStorage.getItem("admin_mode") === "true";
// //     /* ---------- 0) Containerit ---------- */
// //     let table_parts_container =
// //         document.getElementById(`${table_name}_table_parts_container`) ??
// //         (() => {
// //             const div = document.createElement("div");
// //             div.id = `${table_name}_table_parts_container`;
// //             document.body.appendChild(div);
// //             return div;
// //         })();

// //     /* ---------- 1) Luodaan filterBar, jos puuttuu ---------- */
// //     let filter_bar = document.getElementById(`${table_name}_filterBar`);
// //     if (!filter_bar) {
// //         filter_bar = document.createElement("div");
// //         filter_bar.id = `${table_name}_filterBar`;
// //         filter_bar.classList.add("filterBar");

// //         /* =================================================== */
// //         /* 1a) Ylhäinen otsikkorivi + toggle‑nappi             */
// //         /* =================================================== */

// //         const title_container = document.createElement("div");
// //         title_container.style.display = "flex";
// //         title_container.style.justifyContent = "space-between";
// //         title_container.style.alignItems = "baseline";
// //         title_container.classList.add("filterBar-title-container");

// //         /* vasen puoli: nimi */
// //         const left_part = document.createElement("div");
// //         const table_name_element = document.createElement("div");
// //         table_name_element.textContent = table_name;
// //         table_name_element.style.fontWeight = "bold";
// //         table_name_element.style.fontSize = "20px";
// //         table_name_element.setAttribute("data-lang-key", table_name);
// //         table_name_element.title = table_name;
// //         left_part.appendChild(table_name_element);
// //         const small_table_name_div = document.createElement("div");
// //         small_table_name_div.textContent = table_name;
// //         if (admin_mode) {
// //             left_part.appendChild(small_table_name_div);
// //         }

// //         /* oikea puoli: rivimäärä + nappi */
// //         const topRightContainer = document.createElement("div");
// //         topRightContainer.style.display = "flex";
// //         topRightContainer.style.alignItems = "center";
// //         topRightContainer.style.gap = "0.5rem";

// //         const row_count_element = document.createElement("span");
// //         row_count_element.textContent = "... ";
// //         fetchRowCount(table_name).then((count) => {
// //             const theNumber = count ?? "?";
// //             row_count_element.textContent = `${theNumber} `;
// //             const resultsText = document.createElement("span");
// //             resultsText.setAttribute(
// //                 "data-lang-key",
// //                 count === 1 ? "result" : "results"
// //             );
// //             resultsText.textContent = count === 1 ? "result" : "results";
// //             row_count_element.appendChild(resultsText);
// //         });

// //         const toggleButton = document.createElement("button");
// //         toggleButton.classList.add("hide_filter_bar_button");
// //         toggleButton.title = "Piilota tai näytä suodatuspalkki";
// //         toggleButton.innerHTML =
// //             '<svg viewBox="0 -960 960 960" width="24" height="24" fill="var(--text_color)"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm440-80h120v-560H640v560Zm-80 0v-560H200v560h360Zm80 0h120-120Z"/></svg>';

// //         /* ---------- uusi, paljon pelkistetympi näkyvyysfunktio ---------- */
// //         function setFilterBarVisibility(isVisible) {
// //             if (isVisible) {
// //                 filter_bar.classList.remove("hidden");
// //                 table_parts_container.style.gridTemplateColumns = "auto 450px";
// //                 showFilterBarButton.style.display = "none";
// //             } else {
// //                 filter_bar.classList.add("hidden");
// //                 table_parts_container.style.gridTemplateColumns = "auto 0px";
// //                 showFilterBarButton.style.display = "block";
// //             }
// //             filterBarVisible = isVisible;
// //             updateShowFilterBarButtonPosition(
// //                 table_parts_container,
// //                 showFilterBarButton
// //             );
// //         }

// //         toggleButton.addEventListener("click", () =>
// //             setFilterBarVisibility(!filterBarVisible)
// //         );

// //         topRightContainer.appendChild(row_count_element);
// //         topRightContainer.appendChild(toggleButton);
// //         title_container.appendChild(left_part);
// //         title_container.appendChild(topRightContainer);
// //         filter_bar.appendChild(title_container);

// //         // 2) Luodaan top_row ja sen sisään kaksi riviä:
// //         //    - Rivi 1: peruskäyttäjän nappi + (tarvittaessa) sarakenäkyvyys
// //         //    - Rivi 2: admin-napit ja näkymävalitsin erillisinä kontteina

// //         const top_row = document.createElement("div");
// //         top_row.classList.add("filterBar-top-row");

// //         // --- Rivi 1: peruskäyttäjälle ---
// //         const first_line_div = document.createElement("div");
// //         first_line_div.classList.add("top-row-first-line");

// //         const user_buttons_container = document.createElement("div");
// //         user_buttons_container.classList.add("filterBar-button-container");

// //         // "Lisää rivi" -nappi
// //         if (admin_mode) {
// //             const top_row = document.createElement("div");
// //             top_row.classList.add("filterBar-top-row");

// //             // --- Rivi 1: peruskäyttäjälle ---
// //             const first_line_div = document.createElement("div");
// //             first_line_div.classList.add("top-row-first-line");

// //             const user_buttons_container = document.createElement("div");
// //             user_buttons_container.classList.add("filterBar-button-container");

// //             // "Lisää rivi" -nappi
// //             user_buttons_container.appendChild(createAddRowButton(table_name));

// //             first_line_div.appendChild(user_buttons_container);
// //             top_row.appendChild(first_line_div);

// //             // --- Rivi 2: admin-napit + näkymävalitsin (sisarkontteina) ---
// //             const second_line_div = document.createElement("div");
// //             second_line_div.classList.add("top-row-second-line");

// //             const adminButtonsContainer = document.createElement("div");
// //             adminButtonsContainer.classList.add("management-buttons");

// //             const viewSelectorContainer = document.createElement("div");

// //             second_line_div.appendChild(adminButtonsContainer);
// //             second_line_div.appendChild(viewSelectorContainer);

// //             appendAdminFeatures(
// //                 table_name,
// //                 adminButtonsContainer,
// //                 viewSelectorContainer,
// //                 current_view
// //             );

// //             top_row.appendChild(second_line_div);
// //             filter_bar.appendChild(top_row);
// //         }

// //         // 3) Global search -kenttä
// //         const search_row = document.createElement("div");
// //         search_row.classList.add("filterBar-search-row");
// //         const global_search_input = document.createElement("input");
// //         global_search_input.type = "text";
// //         global_search_input.placeholder = "Hae jotain...";
// //         global_search_input.id = `${table_name}_global_search_input`;
// //         global_search_input.classList.add("global-search-input");

// //         // Luetaan unified-tilasta
// //         const currentState = getUnifiedTableState(table_name);
// //         if (
// //             currentState.filters &&
// //             currentState.filters[global_search_input.id]
// //         ) {
// //             global_search_input.value =
// //                 currentState.filters[global_search_input.id];
// //         }

// //         // Hakukentän live-haku -> päivitetään unified-tila
// //         global_search_input.addEventListener("input", () => {
// //             updateFilterAndRefresh(
// //                 table_name,
// //                 global_search_input.id,
// //                 global_search_input.value
// //             );
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
// //             additional_id: [],
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
// //             ...categorizedCols.date,
// //         ];
// //         const additionalIdColumns = categorizedCols.additional_id;

// //         const mainFilterContainer = document.createElement("div");
// //         mainFilterContainer.classList.add("combined-filter-sort-container");

// //         function createRowForColumn(container, column) {
// //             const row_container = document.createElement("div");
// //             row_container.classList.add("row-container");

// //             const sort_button = document.createElement("button");
// //             sort_button.setAttribute("data-sort-state", "none");
// //             sort_button.textContent = "\u21C5"; // ↕ default

// //             // Jos unified-tilassa on sorttaus
// //             if (
// //                 currentState.sort &&
// //                 currentState.sort.column === column &&
// //                 currentState.sort.direction
// //             ) {
// //                 if (currentState.sort.direction.toLowerCase() === "asc") {
// //                     sort_button.setAttribute("data-sort-state", "asc");
// //                     sort_button.textContent = "\u25B2"; // ▲
// //                 } else {
// //                     sort_button.setAttribute("data-sort-state", "desc");
// //                     sort_button.textContent = "\u25BC"; // ▼
// //                 }
// //             }

// //             sort_button.addEventListener("click", () => {
// //                 // Nollataan muut painikkeet
// //                 const allSortButtons = container.querySelectorAll(
// //                     "button[data-sort-state]"
// //                 );
// //                 allSortButtons.forEach((btn) => {
// //                     if (btn !== sort_button) {
// //                         btn.setAttribute("data-sort-state", "none");
// //                         btn.textContent = "\u21C5";
// //                     }
// //                 });

// //                 let currentStateValue =
// //                     sort_button.getAttribute("data-sort-state");
// //                 let newState;
// //                 if (currentStateValue === "none") {
// //                     newState = "asc";
// //                     sort_button.textContent = "\u25B2";
// //                 } else if (currentStateValue === "asc") {
// //                     newState = "desc";
// //                     sort_button.textContent = "\u25BC";
// //                 } else {
// //                     newState = "none";
// //                     sort_button.textContent = "\u21C5";
// //                 }
// //                 sort_button.setAttribute("data-sort-state", newState);

// //                 const st = getUnifiedTableState(table_name);
// //                 if (newState === "none") {
// //                     st.sort.column = null;
// //                     st.sort.direction = null;
// //                 } else {
// //                     st.sort.column = column;
// //                     st.sort.direction = newState === "asc" ? "ASC" : "DESC";
// //                 }
// //                 setUnifiedTableState(table_name, st);

// //                 resetOffset();
// //                 refreshTableUnified(table_name, { skipUrlParams: true });
// //             });

// //             // Varsinainen filtterikenttä
// //             const filter_element = create_filter_element(
// //                 table_name,
// //                 column,
// //                 data_types[column]
// //             );
// //             row_container.appendChild(sort_button);
// //             row_container.appendChild(filter_element);
// //             container.appendChild(row_container);
// //         }

// //         function create_filter_element(table_name, column, colType) {
// //             const container = document.createElement("div");
// //             container.classList.add("input-group");

// //             const dt_string = (
// //                 typeof colType === "object" && colType?.data_type
// //                     ? colType.data_type
// //                     : colType || ""
// //             ).toLowerCase();

// //             /* ---- 1) Semanttinen haku (embedding) ---------------------------- */
// //             if (column === "openai_embedding") {
// //                 const semanticInput = document.createElement("input");
// //                 semanticInput.type = "text";
// //                 semanticInput.placeholder = "Anna semanttinen hakusana...";
// //                 semanticInput.id = `${table_name}_filter_semantic_${column}`;

// //                 const state = getUnifiedTableState(table_name);
// //                 if (state.filters?.[semanticInput.id]) {
// //                     semanticInput.value = state.filters[semanticInput.id];
// //                 }

// //                 semanticInput.addEventListener("keypress", (e) => {
// //                     if (e.key === "Enter") {
// //                         do_semantic_search(table_name, semanticInput.value);
// //                     }
// //                 });

// //                 container.appendChild(semanticInput);

// //                 const label = document.createElement("label");
// //                 label.setAttribute("for", semanticInput.id);
// //                 label.setAttribute("data-lang-key", "semantic_vector_search");
// //                 container.appendChild(label);

// //                 return container; // ← palautus
// //             }

// //             /* ---- 2) Numero- ja päiväalueet --------------------------------- */
// //             const isNumericOrDate = [
// //                 "integer",
// //                 "bigint",
// //                 "smallint",
// //                 "numeric",
// //                 "real",
// //                 "double precision",
// //                 "date",
// //                 "timestamp",
// //                 "timestamp without time zone",
// //                 "timestamp with time zone",
// //             ].includes(dt_string);

// //             if (isNumericOrDate) {
// //                 const baseId = `${table_name}_${column}`;
// //                 const fromInput = document.createElement("input");
// //                 const toInput = document.createElement("input");

// //                 if (
// //                     [
// //                         "integer",
// //                         "bigint",
// //                         "smallint",
// //                         "numeric",
// //                         "real",
// //                         "double precision",
// //                     ].includes(dt_string)
// //                 ) {
// //                     fromInput.type = "number";
// //                     toInput.type = "number";
// //                     fromInput.placeholder = "Min";
// //                     toInput.placeholder = "Max";
// //                 } else {
// //                     fromInput.type = "date";
// //                     toInput.type = "date";
// //                     fromInput.placeholder = "From";
// //                     toInput.placeholder = "To";
// //                 }

// //                 fromInput.id = `${baseId}_from`;
// //                 toInput.id = `${baseId}_to`;

// //                 const state = getUnifiedTableState(table_name);
// //                 if (state.filters?.[fromInput.id])
// //                     fromInput.value = state.filters[fromInput.id];
// //                 if (state.filters?.[toInput.id])
// //                     toInput.value = state.filters[toInput.id];

// //                 fromInput.addEventListener("input", () =>
// //                     updateFilterAndRefresh(
// //                         table_name,
// //                         fromInput.id,
// //                         fromInput.value
// //                     )
// //                 );
// //                 toInput.addEventListener("input", () =>
// //                     updateFilterAndRefresh(
// //                         table_name,
// //                         toInput.id,
// //                         toInput.value
// //                     )
// //                 );

// //                 container.appendChild(fromInput);
// //                 container.appendChild(toInput);

// //                 const label = document.createElement("label");
// //                 label.setAttribute("data-lang-key", column);
// //                 container.appendChild(label);

// //                 return container; // ← kriittinen palautus (fix!)
// //             }

// //             /* ---- 3) Boolean‑select ----------------------------------------- */
// //             if (dt_string === "boolean") {
// //                 const select = document.createElement("select");
// //                 select.id = `${table_name}_${column}`;

// //                 ["", "true", "false", "empty"].forEach((val) => {
// //                     const opt = document.createElement("option");
// //                     opt.value = val;
// //                     opt.textContent =
// //                         val === ""
// //                             ? "All"
// //                             : val === "empty"
// //                             ? "Empty"
// //                             : val.charAt(0).toUpperCase() + val.slice(1);
// //                     select.appendChild(opt);
// //                 });

// //                 const state = getUnifiedTableState(table_name);
// //                 if (state.filters?.[select.id])
// //                     select.value = state.filters[select.id];

// //                 select.addEventListener("input", () =>
// //                     updateFilterAndRefresh(table_name, select.id, select.value)
// //                 );

// //                 container.appendChild(select);

// //                 const label = document.createElement("label");
// //                 label.setAttribute("for", select.id);
// //                 label.setAttribute("data-lang-key", column);
// //                 container.appendChild(label);

// //                 return container;
// //             }

// //             /* ---- 4) Tekstikenttä (default) --------------------------------- */
// //             const textInput = document.createElement("input");
// //             textInput.type = "text";
// //             textInput.placeholder = " ";
// //             textInput.id = `${table_name}_${column}`;

// //             const state = getUnifiedTableState(table_name);
// //             if (state.filters?.[textInput.id])
// //                 textInput.value = state.filters[textInput.id];

// //             textInput.addEventListener("input", () =>
// //                 updateFilterAndRefresh(
// //                     table_name,
// //                     textInput.id,
// //                     textInput.value
// //                 )
// //             );

// //             container.appendChild(textInput);

// //             const label = document.createElement("label");
// //             label.setAttribute("for", textInput.id);
// //             label.setAttribute("data-lang-key", column);
// //             container.appendChild(label);

// //             return container;
// //         }

// //         // Luodaan filtterikentät
// //         orderedMainFilters.forEach((col) => {
// //             createRowForColumn(mainFilterContainer, col);
// //         });

// //         // Lisätään "additional_id" -sarakkeet "näytä lisää" -osioon
// //         const additionalIdContainer = document.createElement("div");
// //         additionalIdContainer.classList.add("combined-filter-sort-container");

// //         additionalIdColumns.forEach((col) => {
// //             createRowForColumn(additionalIdContainer, col);
// //         });

// //         const filtersContainer = document.createElement("div");
// //         filtersContainer.classList.add("combined-filter-sort-container");
// //         filtersContainer.appendChild(mainFilterContainer);

// //         if (additionalIdColumns.length > 0) {
// //             const additionalWrapper = document.createElement("div");
// //             additionalWrapper.style.display = "none";
// //             additionalWrapper.appendChild(additionalIdContainer);

// //             const moreButton = document.createElement("button");
// //             moreButton.setAttribute("data-lang-key", "show_more");
// //             moreButton.textContent = "Enemmän";
// //             moreButton.addEventListener("click", () => {
// //                 if (additionalWrapper.style.display === "none") {
// //                     additionalWrapper.style.display = "block";
// //                     moreButton.setAttribute("data-lang-key", "show_less");
// //                     moreButton.textContent = "Vähemmän";
// //                 } else {
// //                     additionalWrapper.style.display = "none";
// //                     moreButton.setAttribute("data-lang-key", "show_more");
// //                     moreButton.textContent = "Enemmän";
// //                 }
// //             });

// //             filtersContainer.appendChild(moreButton);
// //             filtersContainer.appendChild(additionalWrapper);
// //         }

// //         const combinedCollapsible = create_collapsible_section(
// //             "Järjestä ja suodata",
// //             filtersContainer,
// //             true
// //         );
// //         filter_bar.appendChild(combinedCollapsible);

// //         // Luo nappi suodatuspalkin näyttämiseksi
// //         const showFilterBarButton = document.createElement("button");
// //         showFilterBarButton.classList.add("show_filter_bar_button");
// //         showFilterBarButton.style.position = "absolute";
// //         showFilterBarButton.style.top = "10px";
// //         showFilterBarButton.style.right = "0px";
// //         showFilterBarButton.style.display = "none";
// //         showFilterBarButton.innerHTML =
// //             '<svg viewBox="0 -960 960 960" width="24" height="24" fill="var(--text_color)"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm440-80h120v-560H640v560Zm-80 0v-560H200v560h360Zm80 0h120-120Z"/></svg>';

// //         showFilterBarButton.addEventListener("click", () =>
// //             setFilterBarVisibility(true)
// //         );

// //         table_parts_container.appendChild(showFilterBarButton);
// //         appendChatUIIfAdmin(table_name, filter_bar);
// //         table_parts_container.appendChild(filter_bar);

// //         /* 4) readOnlyContainer, ruudun leveys, skriptit jne.  */
// //         /*    (identtiset alkuperäisen kanssa, jätetty pois)   */

// //         /* ---------- Ikkunan koon muutokset ---------- */
// //         window.addEventListener("resize", () => {
// //             checkWindowWidth(table_name);
// //             updateShowFilterBarButtonPosition(
// //                 table_parts_container,
// //                 showFilterBarButton
// //             );
// //         });

// //         /* ---------- Klikkaus taustan puolelle ---------- */
// //         document.addEventListener("click", (event) => {
// //             if (
// //                 window.innerWidth < 1000 &&
// //                 filterBarVisible &&
// //                 !filter_bar.contains(event.target) &&
// //                 !showFilterBarButton.contains(event.target)
// //             ) {
// //                 setFilterBarVisibility(false);
// //             }
// //         });
// //     }
// // }

// // // --- Uusi funktio nappulan sijainnin päivitykseen ---
// // function updateShowFilterBarButtonPosition(
// //     table_parts_container,
// //     showFilterBarButton
// // ) {
// //     const visibleScrollableContent = table_parts_container.querySelector(
// //         ".scrollable_content:not([style*='display: none'])"
// //     );
// //     if (!visibleScrollableContent) {
// //         console.warn("Ei löytynyt näkyvää scrollable_content-elementtiä");
// //         return;
// //     }

// //     const hasVerticalScroll =
// //         visibleScrollableContent.scrollHeight >
// //         visibleScrollableContent.clientHeight;

// //     if (hasVerticalScroll) {
// //         // Lasketaan scrollbaari leveyden erotuksena offsetWidth - clientWidth
// //         const scrollbarWidth =
// //             visibleScrollableContent.offsetWidth -
// //             visibleScrollableContent.clientWidth;

// //         if (scrollbarWidth === 0) {
// //             // Scrollbaari voi olla overlay-tyyppinen (ei "vie tilaa")
// //             showFilterBarButton.style.right = "17px";
// //             console.log(
// //                 "Scrollbar havaittu, mutta leveys on 0px (overlay?), nappi siirretään n px vasemmalle 😊"
// //             );
// //         } else {
// //             // Normaali scrollbaari, lisätään 10px "tyhjää" nappulan ja scrollbarin väliin
// //             showFilterBarButton.style.right = `${scrollbarWidth + 10}px`;
// //             console.log(
// //                 `Scrollbar havaittu leveydellä ${scrollbarWidth}px, nappi siirretään ${
// //                     scrollbarWidth + 10
// //                 }px vasemmalle 😊`
// //             );
// //         }
// //     } else {
// //         // Ei scrollattavaa sisältöä → nappi 10px oikeasta reunasta
// //         showFilterBarButton.style.right = "10px";
// //         console.log("Ei scrollbaria, nappi on oikeassa reunassa (10px) 😊");
// //     }
// // }

// // function checkWindowWidth(table_name) {
// //     const filter_bar = document.getElementById(`${table_name}_filterBar`);
// //     const table_parts_container = document.getElementById(
// //         `${table_name}_table_parts_container`
// //     );
// //     if (!filter_bar || !table_parts_container) return;

// //     const showFilterBarButton = table_parts_container.querySelector(
// //         ".show_filter_bar_button"
// //     );
// //     if (window.innerWidth < FILTERBAR_WIDTH_THRESHOLD) {
// //         filter_bar.classList.add("hidden");
// //         table_parts_container.style.gridTemplateColumns = "auto 0px";
// //         filterBarVisible = false;
// //         showFilterBarButton && (showFilterBarButton.style.display = "block");
// //     } else {
// //         filter_bar.classList.remove("hidden");
// //         table_parts_container.style.gridTemplateColumns = "auto 450px";
// //         filterBarVisible = true;
// //         showFilterBarButton && (showFilterBarButton.style.display = "none");
// //     }
// //     updateShowFilterBarButtonPosition(
// //         table_parts_container,
// //         showFilterBarButton
// //     );
// // }
