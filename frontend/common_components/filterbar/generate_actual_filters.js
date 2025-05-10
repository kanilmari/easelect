// generate_actual_filters.js
import { setColumnVisibility, getHiddenColumns, applyColumnVisibility } from "./column_visibility.js";
import { getUnifiedTableState, setUnifiedTableState, refreshTableUnified } from "../../core_components/general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js";
import { count_this_function } from "../../core_components/dev_tools/function_counter.js";
import { resetOffset } from "../../core_components/infinite_scroll/infinite_scroll.js";
import { create_collapsible_section } from "../../common_components/collapsible-section/collapsible_section.js";

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

export {
    determineColumnCategory,
    createRowForColumn,
    buildFilterSection,
    createFilterElement
};
