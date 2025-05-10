// create_filter_bar.js

// Peruskäyttäjän nappi
import { createAddRowButton } from "../../core_components/general_tables/gt_toolbar/button_factory.js";
import { appendAdminFeatures, appendChatUIIfAdmin } from "./create_filter_bar_admin.js";
import { appendDataToView } from "../../core_components/infinite_scroll/infinite_scroll.js";
import { count_this_function } from "../../core_components/dev_tools/function_counter.js";
import { buildFilterSection } from "./generate_actual_filters.js";
import "./overlay_filter_bar_observer.js";
/* ===========================================================
 *  Yleiset muuttujat ja apurit
 * =========================================================*/

// Kynnysarvo, jonka alapuolella filterBar piilotetaan automaattisesti
const FILTERBAR_WIDTH_THRESHOLD = 1600;

// Komponentin näkyvyystila
let filterBarVisible = true;

/**
 * Hakee taulun metatiedot: rivimäärän + PostGIS-statuksen
 * Palauttaa:
 *   {
 *     rowCount:    number|null,
 *     hasGeo:      boolean,            // onko suoria tai FK-geom-viitteitä
 *     geomColumns: string[],           // tämän taulun geometry-sarakkeet
 *     geomSources: string[],           // viittauksen päässä olevat taulut, joissa geometry
 *   }
 */
async function fetchTableMeta(tableName) {
    // 🔢 funktiolaskuri (ohjeidesi mukaisesti)
    count_this_function("fetchTableMeta");

    try {
        const resp = await fetch(
            `/api/get-row-count?table=${encodeURIComponent(tableName)}`,
            {
                method: "GET",
                credentials: "include",
            }
        );
        if (!resp.ok) {
            throw new Error(`error (status: ${resp.status})`);
        }

        const {
            row_count: rowCount,
            has_geo: hasGeo = false,
            geom_columns: geomColumns = [],
            geom_sources: geomSources = [],
        } = await resp.json();

        return {
            rowCount:   typeof rowCount === "number" ? rowCount : null,
            hasGeo:     Boolean(hasGeo),
            geomColumns,
            geomSources,
        };
    } catch (err) {
        console.error("virhe fetchTableMeta-funktiossa:", err);
        return {
            rowCount:   null,
            hasGeo:     false,
            geomColumns: [],
            geomSources: [],
        };
    }
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

// function buildSearchRow(tableName) {
//     // laske funktiokutsut
//     count_this_function("buildSearchRow");

//     /* -----------------------------------------------------------
//      *  Älykäs globaali haku – historialla ja palautuksella
//      * ---------------------------------------------------------*/

//     /* ---------- Kääre ---------- */
//     const wrapper = document.createElement("div");
//     wrapper.classList.add("filterBar-wrapper");

//     /* ---------- Vasemman puolen pino ---------- */
//     const leftColumn = document.createElement("div");
//     leftColumn.classList.add("filterBar-left"); // CSS: flex, column

//     /* ---------- Rivi 1: haku ---------- */
//     const searchRow = document.createElement("div");
//     searchRow.classList.add("filterBar-search-row");

//     const globalSearchInput = document.createElement("input");
//     globalSearchInput.type = "text";
//     globalSearchInput.placeholder = "Hae älykkäästi...";
//     globalSearchInput.id = `${tableName}_global_intelligent_search_input`;
//     globalSearchInput.classList.add("global-search-input");

//     searchRow.appendChild(globalSearchInput);

//     /* ---------- Rivi 2: sijaintivalinta ---------- */
//     const locationRow = document.createElement("div");
//     locationRow.classList.add("filterBar-location-row");

//     const useLocationCheckbox = document.createElement("input");
//     useLocationCheckbox.type = "checkbox";
//     useLocationCheckbox.id = `${tableName}_use_location_checkbox`;

//     const useLocationLabel = document.createElement("label");
//     useLocationLabel.setAttribute("for", useLocationCheckbox.id);
//     useLocationLabel.textContent = "Use my location";

//     locationRow.appendChild(useLocationCheckbox);
//     locationRow.appendChild(useLocationLabel);

//     /* ---------- Oikean reunan hakunappi ---------- */
//     const globalSearchButton = document.createElement("button");
//     globalSearchButton.classList.add("global-search-button");
//     globalSearchButton.title = "Hae";
//     globalSearchButton.innerHTML =
//         '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">' +
//         '<path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM10 14a4 4 0 110-8 4 4 0 010 8z"/>' +
//         "</svg>";

//     /* ---------- Kokoa vasen pino ---------- */
//     leftColumn.appendChild(searchRow);

//     // lisää sijaintirivi vain, jos tarvitaan
//     if (shouldRenderLocationCheckbox(tableName)) {
//         leftColumn.appendChild(locationRow);
//     }

//     /* ---------- Lisää lapset kääreeseen ---------- */
//     wrapper.appendChild(leftColumn);
//     wrapper.appendChild(globalSearchButton);

//     /* ---------- localStorage-avaimet ---------- */
//     const STORAGE_KEY_HISTORY   = `int_search_history_${tableName}`;
//     const STORAGE_KEY_DRAFT     = `int_search_draft_${tableName}`;
//     const STORAGE_KEY_LOCATION  = `int_search_use_location_${tableName}`;

//     /* ---------- Historia & luonnos ---------- */
//     let history = [];
//     try {
//         history = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
//     } catch {
//         history = [];
//     }
//     const savedDraft = localStorage.getItem(STORAGE_KEY_DRAFT);
//     if (savedDraft !== null) {
//         globalSearchInput.value = savedDraft;
//     } else if (history.length) {
//         globalSearchInput.value = history[history.length - 1];
//     }

//     /* ---------- Sijaintivalinnan palautus ---------- */
//     if (useLocationCheckbox && localStorage.getItem(STORAGE_KEY_LOCATION) !== null) {
//         useLocationCheckbox.checked = localStorage.getItem(STORAGE_KEY_LOCATION) === "true";
//     }

//     /* ---------- Tilan muuttujat ---------- */
//     let historyIndex = null;
//     let currentDraft = "";

//     /* ---------- Hakutoiminto ---------- */
//     function commitSearch() {
//         const query = globalSearchInput.value.trim();
//         if (!query) return;

//         const useLocation = useLocationCheckbox ? useLocationCheckbox.checked : false;

//         do_intelligent_search(tableName, query, { useLocation });

//         if (history[history.length - 1] !== query) history.push(query);
//         localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history.slice(-50)));
//         localStorage.removeItem(STORAGE_KEY_DRAFT);
//         historyIndex = null;
//     }

//     /* ---------- Tapahtumankäsittelijät ---------- */
//     globalSearchInput.addEventListener("input", () => {
//         localStorage.setItem(STORAGE_KEY_DRAFT, globalSearchInput.value);
//     });

//     if (useLocationCheckbox) {
//         useLocationCheckbox.addEventListener("change", () => {
//             localStorage.setItem(STORAGE_KEY_LOCATION, useLocationCheckbox.checked);
//         });
//     }

//     globalSearchButton.addEventListener("click", commitSearch);
//     globalSearchInput.addEventListener("keypress", (e) => {
//         if (e.key === "Enter") commitSearch();
//     });

//     globalSearchInput.addEventListener("keydown", (e) => {
//         if (e.key === "ArrowUp") {
//             if (!history.length) return;
//             if (historyIndex === null) {
//                 currentDraft = globalSearchInput.value;
//                 historyIndex = history.length - 1;
//             } else if (historyIndex > 0) {
//                 historyIndex -= 1;
//             }
//             globalSearchInput.value = history[historyIndex];
//             e.preventDefault();
//         } else if (e.key === "ArrowDown") {
//             if (historyIndex === null) return;
//             if (historyIndex < history.length - 1) {
//                 historyIndex += 1;
//                 globalSearchInput.value = history[historyIndex];
//             } else {
//                 historyIndex = null;
//                 globalSearchInput.value = currentDraft;
//             }
//             e.preventDefault();
//         }
//     });

//     return wrapper;
// }
/**
 * Näyttää jo luodun sijaintirivin, jos se on piilotettuna.
 */
function showLocationRow(tableName) {
    const locRow = document.getElementById(`${tableName}_location_row`);
    if (locRow && locRow.style.display === "none") {
        locRow.style.display = "flex";   // tai "block" oman CSS-mieltymyksen mukaan
    }
}

/**
 * Luo hakupalkin (globaali haku + sijaintivalinta).
 */
function buildSearchRow(tableName) {
    // 🔢 funktiolaskuri
    count_this_function("buildSearchRow");

    /* ---------- Kääre ---------- */
    const wrapper = document.createElement("div");
    wrapper.classList.add("filterBar-wrapper");

    /* ---------- Vasemman puolen pino ---------- */
    const leftColumn = document.createElement("div");
    leftColumn.classList.add("filterBar-left"); // CSS: flex, column

    /* ---------- Rivi 1: haku ---------- */
    const searchRow = document.createElement("div");
    searchRow.classList.add("filterBar-search-row");

    const globalSearchInput = document.createElement("input");
    globalSearchInput.type = "text";
    globalSearchInput.placeholder = "Hae älykkäästi...";
    globalSearchInput.id = `${tableName}_global_intelligent_search_input`;
    globalSearchInput.classList.add("global-search-input");

    searchRow.appendChild(globalSearchInput);

    /* ---------- Rivi 2: sijaintivalinta ---------- */
    const locationRow = document.createElement("div");
    locationRow.classList.add("filterBar-location-row");
    locationRow.id = `${tableName}_location_row`;

    const useLocationCheckbox = document.createElement("input");
    useLocationCheckbox.type = "checkbox";
    useLocationCheckbox.id = `${tableName}_use_location_checkbox`;

    const useLocationLabel = document.createElement("label");
    useLocationLabel.setAttribute("for", useLocationCheckbox.id);
    useLocationLabel.textContent = "Use my location";

    locationRow.appendChild(useLocationCheckbox);
    locationRow.appendChild(useLocationLabel);

    /* --- piilotetaan jos paikkatieto ei vielä tunnettu --- */
    if (!shouldRenderLocationCheckbox(tableName)) {
        locationRow.style.display = "none";
    }

    /* ---------- Oikean reunan hakunappi ---------- */
    const globalSearchButton = document.createElement("button");
    globalSearchButton.classList.add("global-search-button");
    globalSearchButton.title = "Hae";
    globalSearchButton.innerHTML =
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">' +
        '<path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM10 14a4 4 0 110-8 4 4 0 010 8z"/>' +
        "</svg>";

    /* ---------- Kokoa vasen pino ---------- */
    leftColumn.appendChild(searchRow);
    leftColumn.appendChild(locationRow);        // → lisätään aina (voi olla hidden)

    /* ---------- Lisää lapset kääreeseen ---------- */
    wrapper.appendChild(leftColumn);
    wrapper.appendChild(globalSearchButton);

    /* ---------- localStorage-avaimet ---------- */
    const STORAGE_KEY_HISTORY   = `int_search_history_${tableName}`;
    const STORAGE_KEY_DRAFT     = `int_search_draft_${tableName}`;
    const STORAGE_KEY_LOCATION  = `int_search_use_location_${tableName}`;

    /* ---------- Historia & luonnos ---------- */
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
    } catch {
        history = [];
    }
    const savedDraft = localStorage.getItem(STORAGE_KEY_DRAFT);
    if (savedDraft !== null) {
        globalSearchInput.value = savedDraft;
    } else if (history.length) {
        globalSearchInput.value = history[history.length - 1];
    }

    /* ---------- Sijaintivalinnan palautus ---------- */
    if (useLocationCheckbox && localStorage.getItem(STORAGE_KEY_LOCATION) !== null) {
        useLocationCheckbox.checked = localStorage.getItem(STORAGE_KEY_LOCATION) === "true";
    }

    /* ---------- Tilan muuttujat ---------- */
    let historyIndex = null;
    let currentDraft = "";

    /* ---------- Hakutoiminto ---------- */
    function commitSearch() {
        const query = globalSearchInput.value.trim();
        if (!query) return;

        const useLocation = useLocationCheckbox ? useLocationCheckbox.checked : false;

        do_intelligent_search(tableName, query, { useLocation });

        if (history[history.length - 1] !== query) history.push(query);
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history.slice(-50)));
        localStorage.removeItem(STORAGE_KEY_DRAFT);
        historyIndex = null;
    }

    /* ---------- Tapahtumankäsittelijät ---------- */
    globalSearchInput.addEventListener("input", () => {
        localStorage.setItem(STORAGE_KEY_DRAFT, globalSearchInput.value);
    });

    if (useLocationCheckbox) {
        useLocationCheckbox.addEventListener("change", () => {
            localStorage.setItem(STORAGE_KEY_LOCATION, useLocationCheckbox.checked);
        });
    }

    globalSearchButton.addEventListener("click", commitSearch);
    globalSearchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") commitSearch();
    });

    globalSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "ArrowUp") {
            if (!history.length) return;
            if (historyIndex === null) {
                currentDraft = globalSearchInput.value;
                historyIndex = history.length - 1;
            } else if (historyIndex > 0) {
                historyIndex -= 1;
            }
            globalSearchInput.value = history[historyIndex];
            e.preventDefault();
        } else if (e.key === "ArrowDown") {
            if (historyIndex === null) return;
            if (historyIndex < history.length - 1) {
                historyIndex += 1;
                globalSearchInput.value = history[historyIndex];
            } else {
                historyIndex = null;
                globalSearchInput.value = currentDraft;
            }
            e.preventDefault();
        }
    });

    return wrapper;
}

/* ===========================================================
 *  Välimuisti taulukoiden metatiedoille (rowCount + geo-info)
 * =========================================================*/
const tableMetaCache = {};      // ★ tallennetaan { [tableName]: { rowCount, hasGeo, … } }

/* ===========================================================
 *  Päivitetty: shouldRenderLocationCheckbox
 *  Näyttää "Use my location" -valinnan vain, jos taulussa
 *  (tai sen FK-viitteissä) on paikkatietoa.
 * =========================================================*/
function shouldRenderLocationCheckbox(tableName) {
    return tableMetaCache[tableName]?.hasGeo === true;
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

async function update_table_ui(tableName, incoming) {
    // 🧮 lokitus
    count_this_function("update_table_ui");

    /* -------------------------------------------------------------
     * 0. Siivotaan sisääntulevat arvot null-turvallisiksi
     * ----------------------------------------------------------- */
    const inColumns = Array.isArray(incoming?.columns) ? incoming.columns : [];
    const inData    = Array.isArray(incoming?.data)    ? incoming.data    : [];

    const cache = _ongoingSearchResults[tableName];

    /* -------------------------------------------------------------
     * 1. Ensimmäinen erä (tekstihaku) – korvaa nykyinen data
     * ----------------------------------------------------------- */
    if (!cache) {
        _ongoingSearchResults[tableName] = {
            columns: inColumns,
            data:    [...inData],      // kopio -> sisäinen välimuisti
            types:   incoming?.types || {},
        };
        appendDataToView(tableName, inData, false);      // append=false ⇒ korvaa
        return;
    }

    /* -------------------------------------------------------------
     * 2. Toinen erä (semanttinen) – lisää vain uudet rivit
     * ----------------------------------------------------------- */
    const primaryKey   = cache.columns.includes("header") ? "header" : null;
    const existingKeys = new Set(
        cache.data.map(row =>
            primaryKey ? row[primaryKey] : JSON.stringify(row)
        )
    );

    const newRows = inData.filter(row => {
        const key = primaryKey ? row[primaryKey] : JSON.stringify(row);
        return !existingKeys.has(key);
    });

    if (newRows.length) {
        cache.data.push(...newRows);
        appendDataToView(tableName, newRows, true);      // append=true ⇒ lisää
    }

    /* -------------------------------------------------------------
     * 3. Päivitä metatiedot vain jos uutta tuli
     * ----------------------------------------------------------- */
    if (inColumns.length) cache.columns = inColumns;
    if (incoming?.types)  cache.types   = incoming.types;
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
    const showVisibilityToggle =
        !(currentView === "card" && hideFieldsOnCards); // true ⇒ näytä checkboxit

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

    /* ---------- 2a) HAE METATIEDOT yhdellä kutsulla ---------- */
    fetchTableMeta(tableName)
        .then((meta) => {
            const { rowCount, hasGeo } = meta;
            // Talleta cacheen → shouldRenderLocationCheckbox käyttää
            tableMetaCache[tableName] = meta;

            /* ----- Näytä rivimäärä ----- */
            const theNumber = rowCount ?? "?";
            rowCountElement.textContent = `${theNumber} `;
            const resultsText = document.createElement("span");
            resultsText.setAttribute(
                "data-lang-key",
                rowCount === 1 ? "result" : "results"
            );
            resultsText.textContent = rowCount === 1 ? "result" : "results";
            rowCountElement.appendChild(resultsText);

            /* ----- (Valinnainen) pieni kartta-ikoni otsikkoon ----- */
            if (hasGeo) {
                const geoIcon = document.createElement("span");
                geoIcon.innerHTML = "🗺️";
                geoIcon.title = "Contains geospatial data";
                geoIcon.style.marginLeft = "0.25rem";
                rowCountElement.parentElement?.prepend(geoIcon);

                /* 💡 UUSI: kun metassa on geo-dataa, näytä sijaintirivi */
                showLocationRow(tableName);
            }
        })
        .catch((err) => {
            console.error("virhe fetchTableMeta-kutsussa:", err);
        });

    const toggleButton = document.createElement("button");
    toggleButton.classList.add("hide_filter_bar_button");
    toggleButton.title = "Piilota tai näytä suodatuspalkki";
    toggleButton.innerHTML =
        '<svg viewBox="0 -960 960 960" width="24" height="24" fill="var(--text_color)"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5-23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm440-80h120v-560H640v560Zm-80 0v-560H200v560h360Zm80 0h120-120Z"/></svg>';

    const titleRow = buildTitleRow(tableName, rowCountElement, toggleButton);
    filterBar.appendChild(titleRow);

    /* ---------- 3) TopRow ---------------------------------------- */
    filterBar.appendChild(buildTopRow(tableName, adminMode, currentView));

    /* ---------- 4) Älykäs globaalihaku --------------------------- */
    filterBar.appendChild(buildSearchRow(tableName)); // locationRow on ensin hidden, näytetään myöhemmin

    /* ---------- 5) Filtterit ------------------------------------- */
    filterBar.appendChild(
        buildFilterSection(
            tableName,
            columns,
            dataTypes,
            showVisibilityToggle
        )
    );

    /* ---------- 6) Näytä/piilota-nappula ---------- */
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

    /* ---------- 7) Admin-chat UI ---------- */
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
// export function create_filter_bar(tableName, columns, dataTypes, currentView) {
//     const adminMode = localStorage.getItem("admin_mode") === "true";

//     /* --- Päätellään checkboxien näkyvyys --------------------------- */
//     const hideFieldsOnCards =
//         localStorage.getItem("hide_fields_on_cards") === "true";
//     const showVisibilityToggle =
//         !(currentView === "card" && hideFieldsOnCards); // true ⇒ näytä checkboxit

//     /* ---------- 1) containerit & filterBar-elementti -------------- */
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

//     /* ---------- 2) Otsikkorivi ----------------------------------- */
//     const rowCountElement = document.createElement("span");
//     rowCountElement.textContent = "... ";

//     /* ---------- 2a) HAE METATIEDOT yhdellä kutsulla ---------- */
//     fetchTableMeta(tableName)                              // ★ vanha fetchRowCount -> fetchTableMeta
//         .then((meta) => {
//             const { rowCount, hasGeo } = meta;
//             // Talleta cacheen → shouldRenderLocationCheckbox käyttää
//             tableMetaCache[tableName] = meta;              // ★
//             /* ----- Näytä rivimäärä ----- */
//             const theNumber = rowCount ?? "?";
//             rowCountElement.textContent = `${theNumber} `;
//             const resultsText = document.createElement("span");
//             resultsText.setAttribute(
//                 "data-lang-key",
//                 rowCount === 1 ? "result" : "results"
//             );
//             resultsText.textContent = rowCount === 1 ? "result" : "results";
//             rowCountElement.appendChild(resultsText);

//             /* ----- (Valinnainen) pieni kartta-ikoni otsikkoon ----- */
//             if (hasGeo) {
//                 const geoIcon = document.createElement("span");
//                 geoIcon.innerHTML = "🗺️";
//                 geoIcon.title = "Contains geospatial data";
//                 geoIcon.style.marginLeft = "0.25rem";
//                 rowCountElement.parentElement?.prepend(geoIcon);
//             }
//         })
//         .catch((err) => {
//             console.error("virhe fetchTableMeta-kutsussa:", err);
//         });

//     const toggleButton = document.createElement("button");
//     toggleButton.classList.add("hide_filter_bar_button");
//     toggleButton.title = "Piilota tai näytä suodatuspalkki";
//     toggleButton.innerHTML =
//         '<svg viewBox="0 -960 960 960" width="24" height="24" fill="var(--text_color)"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5-23.5T840-760v560q0 33-23.5-56.5T760-120H200Zm440-80h120v-560H640v560Zm-80 0v-560H200v560h360Zm80 0h120-120Z"/></svg>';

//     const titleRow = buildTitleRow(tableName, rowCountElement, toggleButton);
//     filterBar.appendChild(titleRow);

//     /* ---------- 3) TopRow ---------------------------------------- */
//     filterBar.appendChild(buildTopRow(tableName, adminMode, currentView));

//     /* ---------- 4) Älykäs globaalihaku --------------------------- */
//     filterBar.appendChild(buildSearchRow(tableName));      // shouldRenderLocationCheckbox katsoo cacheen

//     /* ---------- 5) Filtterit ------------------------------------- */
//     filterBar.appendChild(
//         buildFilterSection(
//             tableName,
//             columns,
//             dataTypes,
//             showVisibilityToggle // ★ välitetään
//         )
//     );

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
