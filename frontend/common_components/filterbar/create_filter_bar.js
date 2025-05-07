// create_filter_bar.js

import { resetOffset } from "../../core_components/infinite_scroll/infinite_scroll.js";
import {
    getUnifiedTableState,
    setUnifiedTableState,
    refreshTableUnified,
} from "../../core_components/general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js";

import { create_collapsible_section } from "../../common_components/collapsible-section/collapsible_section.js";

// Peruskäyttäjän nappi
import { createAddRowButton } from "../../core_components/general_tables/gt_toolbar/button_factory.js";

// Admin-ominaisuudet eriytettynä
import {
    appendAdminFeatures,
    appendChatUIIfAdmin,
} from "./create_filter_bar_admin.js";
import "./overlay_filter_bar_observer.js";

import { appendDataToView } from "../../core_components/infinite_scroll/infinite_scroll.js";
import {
    setColumnVisibility,
    getHiddenColumns,
    applyColumnVisibility,
} from "./column_visibility.js";
import { count_this_function } from "../../core_components/dev_tools/function_counter.js";

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
 * Luo "suodata & järjestä"-paneelin collapsible-kääreineen.
 * Tekstisuodattimet + additional_id piilotetaan oletuksena “Näytä enemmän”-napin taakse.
 */
function buildFilterSection(
    tableName,
    columns,
    dataTypes,
    showVisibilityToggle // ★ edelleen mukana
) {
    count_this_function("buildFilterSection"); // lokitus

    const categorized = {
        id: [],
        numeric: [],
        boolean: [],
        linked: [],
        text: [],
        date: [],
        additional_id: [],
    };

    /* --- luokittele sarakkeet ---------------------------------- */
    columns.forEach((col) => {
        const dtRaw = dataTypes[col];
        const actualType =
            typeof dtRaw === "object" && dtRaw?.data_type
                ? dtRaw.data_type
                : dtRaw;
        const category = determineColumnCategory(col, actualType);
        categorized[category].push(col);
    });

    /* --- näkyviin jätettävät pääfiltterit ----------------------- */
    const orderedMainFilters = [
        ...categorized.id,
        ...categorized.numeric,
        ...categorized.boolean,
        ...categorized.linked,
        ...categorized.date, // ← tekstisuodattimet poistettu tästä
    ];

    /* --- piilotettavat (tekstisuodattimet + additional_id) ------ */
    const hiddenColumns = [
        ...categorized.text,
        ...categorized.additional_id,
    ];

    /* --- pääcontainer ------------------------------------------ */
    const mainFilterContainer = document.createElement("div");
    mainFilterContainer.classList.add("combined-filter-sort-container");

    /* --- luodaan näkyvät rivit --------------------------------- */
    orderedMainFilters.forEach((col) => {
        createRowForColumn(
            mainFilterContainer,
            tableName,
            col,
            dataTypes[col],
            showVisibilityToggle
        );
    });

    /* --- “Näytä enemmän” -osio, jos piilotettavia on ----------- */
    if (hiddenColumns.length) {
        const additionalWrapper = document.createElement("div");
        additionalWrapper.style.display = "none";

        const additionalContainer = document.createElement("div");
        additionalContainer.classList.add("combined-filter-sort-container");

        hiddenColumns.forEach((col) => {
            createRowForColumn(
                additionalContainer,
                tableName,
                col,
                dataTypes[col],
                showVisibilityToggle
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

    /* --- wrapataan collapsible-komponenttiin ------------------- */
    return create_collapsible_section(
        "sort_and_filter",
        mainFilterContainer,
        true
    );
}
/* -----------------------------------------------------------------
 * 1) createRowForColumn  – nyt ottaa viidennen parametrin
 *    showVisibilityToggle, joka määrää luodaanko checkbox vai ei.
 * ----------------------------------------------------------------*/
function createRowForColumn(
    container,
    tableName,
    column,
    colType,
    showVisibilityToggle = true // ★ uusi oletusparametri
) {
    count_this_function("createRowForColumn");

    const row = document.createElement("div");
    row.classList.add("row-container");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = ".5rem";

    /* -------- 0) Näytä/piilota-checkbox -------- */
    if (showVisibilityToggle) {
        // ★ ehdollinen luonti
        const vis = document.createElement("input");
        vis.type = "checkbox";
        vis.classList.add("column-visibility-toggle");
        vis.title = "Näytä/piilota sarake";
        vis.checked = !getHiddenColumns(tableName)[column]; // true ⇢ näytetään
        vis.addEventListener("change", (e) => {
            setColumnVisibility(tableName, column, e.target.checked);
            applyColumnVisibility(tableName);
        });
        row.appendChild(vis);
    }

    /* -------- 1) Sorttipainike (↕/▲/▼) -------- */
    const sortButton = document.createElement("button");
    sortButton.setAttribute("data-sort-state", "none");
    sortButton.textContent = "\u21C5"; // ↕ (oletus)

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

        const cur = sortButton.getAttribute("data-sort-state");
        const next = cur === "none" ? "asc" : cur === "asc" ? "desc" : "none";
        sortButton.setAttribute("data-sort-state", next);
        sortButton.textContent =
            next === "asc" ? "\u25B2" : next === "desc" ? "\u25BC" : "\u21C5";

        const st = getUnifiedTableState(tableName);
        if (!st.sort) st.sort = { column: null, direction: null };

        if (next === "none") {
            st.sort.column = null;
            st.sort.direction = null;
        } else {
            st.sort.column = column;
            st.sort.direction = next === "asc" ? "ASC" : "DESC";
        }

        setUnifiedTableState(tableName, st);
        resetOffset();
        refreshTableUnified(tableName, { skipUrlParams: true });
    });
    row.appendChild(sortButton);

    /* -------- 2) Varsinainen filtterikenttä -------- */
    const filterElement = createFilterElement(tableName, column, colType);
    row.appendChild(filterElement);

    container.appendChild(row);
}

/* -----------------------------------------------------------
 *  Filttereiden luonti (syöttökenttä / select / range / …)
 * ---------------------------------------------------------*/
function createFilterElement(tableName, column, colType) {
    const container = document.createElement("div");
    container.classList.add("input-group");

    /* ----------------------------------------------------------
     *  Haetaan kerralla mahdolliset aiemmat filtterit tähän tauluun
     * -------------------------------------------------------- */
    const { filters: savedFilters = {} } = getUnifiedTableState(tableName);

    /* Pieni apuri: palauttaa arvon tai tyhjän jonon */
    const getSaved = (id) => (savedFilters.hasOwnProperty(id) ? savedFilters[id] : "");

    const dtString = (
        typeof colType === "object" && colType?.data_type
            ? colType.data_type
            : colType || ""
    ).toLowerCase();

    /* ---- 1) Semanttinen haku ------------------------------- */
    if (column === "openai_embedding") {
        const semanticInput = document.createElement("input");
        semanticInput.type = "text";
        semanticInput.placeholder = "Anna semanttinen hakusana...";
        semanticInput.id = `${tableName}_filter_semantic_${column}`;
        semanticInput.value = getSaved(semanticInput.id);   // ★ palautus

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

    /* ---- 2) Numero/päivä -alueet --------------------------- */
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

        /* ★ palautetaan aiemmat arvot (jos sellaiset on) */
        fromInput.value = getSaved(fromInput.id);
        toInput.value = getSaved(toInput.id);

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

    /* ---- 3) Boolean-select --------------------------------- */
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

        /* ★ palautus */
        select.value = getSaved(select.id);

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

    /* ---- 4) Tekstikenttä (oletus) --------------------------- */
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.placeholder = " ";
    textInput.id = `${tableName}_${column}`;

    /* ★ palautus */
    textInput.value = getSaved(textInput.id);

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

    /* --- Päätellään checkboxien näkyvyys --------------------------- */
    const hideFieldsOnCards =
        localStorage.getItem("hide_fields_on_cards") === "true";
    const showVisibilityToggle = !(currentView === "card" && hideFieldsOnCards); // true ⇒ näytä checkboxit

    /* ---------- 1) containerit & filterBar-elementti -------------- */
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

    /* ---------- 2) Otsikkorivi ----------------------------------- */
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

    /* ---------- 3) TopRow ---------------------------------------- */
    filterBar.appendChild(buildTopRow(tableName, adminMode, currentView));

    /* ---------- 4) Älykäs globaalihaku --------------------------- */
    filterBar.appendChild(buildSearchRow(tableName));

    /* ---------- 5) Filtterit ------------------------------------- */
    filterBar.appendChild(
        buildFilterSection(
            tableName,
            columns,
            dataTypes,
            showVisibilityToggle // ★ välitetään
        )
    );

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
