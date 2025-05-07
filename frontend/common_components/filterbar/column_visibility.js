/******************************************************************
 * column_visibility.js
 ******************************************************************/
import { count_this_function } from "../../core_components/dev_tools/function_counter.js"; // säädä polku omaan projektiisi

// ---------- 0) Keskitetty luokkanimi-apu --------------------------------------
export function makeColumnClass(tableName, columnName) {
    count_this_function('makeColumnClass');
    //if length tablename < 1 error
    if (!tableName || tableName.length < 1) {
        console.error("tableName is empty");
        return "";
    }
    // Poistetaan välilyönnit ja sulkeet
    const sanitizedTableName = String(tableName ?? '')
        .replace(/\s+/g, '')
        .replace(/[()]/g, '');
    const sanitizedColumnName = String(columnName ?? '')
        .replace(/\s+/g, '')
        .replace(/[()]/g, '');
    return `column_${sanitizedTableName}_${sanitizedColumnName}`;
}

// ---------- 1) localStorage-aput ----------------------------------------------
export function getHiddenColumns(tableName) {
    count_this_function("getHiddenColumns");
    const raw = localStorage.getItem(`${tableName}_hide_columns`);
    try {
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

export function setColumnVisibility(tableName, columnName, shouldShow) {
    count_this_function("setColumnVisibility");
    const cur = getHiddenColumns(tableName);
    if (shouldShow) delete cur[columnName];
    else cur[columnName] = true;
    localStorage.setItem(`${tableName}_hide_columns`, JSON.stringify(cur));

    // 🔔 lähetä ilmoitus kaikille kiinnostuneille:
    window.dispatchEvent(
        new CustomEvent("column_visibility_changed", { detail: { tableName } })
    );

    // Päivitä näkymä heti myös tässä kontekstissa
    applyColumnVisibility(tableName);
}

/* ---------- 2) CSP-nonce-apu ------------------------------------------------- */
function getCspNonce() {
    count_this_function("getCspNonce");

    /* 1) Yritä lukea nykyisen <script>-tägisi nonce --------------- */
    const fromCurrentScript =
        document.currentScript?.nonce ||
        document.currentScript?.getAttribute("nonce");

    if (fromCurrentScript) return fromCurrentScript;

    /* 2) Seuraavaksi etsitään ensimmäinen <script nonce="…"> ----- */
    const fromAnyScript =
        document.querySelector("script[nonce]")?.getAttribute("nonce");

    if (fromAnyScript) return fromAnyScript;

    /* 3) Viimeinen ja luotettavin – <meta name="csp-nonce"> -------- */
    const fromMeta =
        document.querySelector('meta[name="csp-nonce"]')?.getAttribute("content");

    if (fromMeta) return fromMeta;

    /* 4) Jos noncea ei löytynyt, palautetaan tyhjä merkkijono ------ */
    return "";
}

/* ---------- 3) Luo / hae <style> ja lisää nonce, jos sellainen löytyi -------- */
function ensureHiddenStylesElement(tableName) {
    count_this_function("ensureHiddenStylesElement");
    const styleId = `${tableName}_hidden_columns_styles`;
    let styleEl   = document.getElementById(styleId);

    if (!styleEl) {
        styleEl    = document.createElement("style");
        styleEl.id = styleId;

        const nonce = getCspNonce();
        if (nonce) styleEl.setAttribute("nonce", nonce);

        document.head.appendChild(styleEl);
    }
    return styleEl;
}

/* ---------- 4) NÄKYMÄN PÄIVITYS --------------------------------------------- */
export function applyColumnVisibility(tableName) {
    count_this_function("applyColumnVisibility");

    const hiddenMap      = getHiddenColumns(tableName);
    const cleanTableName = String(tableName ?? "").replace(/\s+/g, "");

    /* 0) Siivoa vanhat 'hidden-column'-luokat (legacy-tuki) ------------------ */
    document
        .querySelectorAll(".hidden-column")
        .forEach((el) => el.classList.remove("hidden-column"));

    /* 1) Generoi CSS-säännöt kaikille piilotettaville sarakkeille ------------- */
    const cssRules = Object.keys(hiddenMap)
        .map((originalColumnName) => {
            const cls = makeColumnClass(tableName, originalColumnName);
            // Älä piilota, jos data-hide-field-on-card="false"
            return `.${cls}:not([data-hide-field-on-card="false"]) { display: none !important; }`;
        })
        .join("\n");

    /* 2) Päivitä <style>-elementin sisältö ----------------------------------- */
    const styleEl = ensureHiddenStylesElement(cleanTableName);
    styleEl.textContent = cssRules;
}

export function shouldShowColumn(tableName, columnName) {
    const hidden = getHiddenColumns(tableName);
    return !hidden[columnName]; // true ⇢ näytetään
}

// ---------- 5) UI-rakentaja ---------------------------------------------------
export function buildColumnSelector(tableName, allColumns) {
    count_this_function("buildColumnSelector");

    const wrapper = document.createElement("div");
    wrapper.classList.add("column-selector-wrapper");

    const label = document.createElement("label");
    label.textContent = "Sarakkeet:";
    label.style.fontWeight = "bold";
    wrapper.appendChild(label);

    const select = document.createElement("select");
    select.multiple = true;
    select.size = Math.min(8, allColumns.length);
    select.id = `${tableName}_column_selector`;
    select.classList.add("column-selector");
    wrapper.appendChild(select);

    const hiddenMap = getHiddenColumns(tableName);

    allColumns.forEach((col) => {
        const opt = document.createElement("option");
        opt.value = col;
        opt.textContent = col;
        opt.selected = !hiddenMap[col]; // selected ⇢ näkyy
        select.appendChild(opt);
    });

    // Päivitä valinnan muuttuessa
    select.addEventListener("change", () => {
        // Kaikki optionit jotka eivät ole selected → piiloon
        for (const optionEl of select.options) {
            setColumnVisibility(tableName, optionEl.value, optionEl.selected);
        }
        // (applyColumnVisibility kutsutaan jo setColumnVisibilityssä)
    });

    return wrapper;
}

