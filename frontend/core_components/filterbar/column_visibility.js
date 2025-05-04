
/******************************************************************
 * column_visibility.js
 ******************************************************************/
import { count_this_function } from "../dev_tools/function_counter.js"; // säädä polku omaan projektiisi

// ---------- 0) Keskitetty luokkanimi-apu -------------------------
export function makeColumnClass(tableName, columnName) {
    count_this_function('makeColumnClass');
    // Poistetaan välilyönnit ja sulkeet
    const sanitizedTableName = String(tableName ?? '')
        .replace(/\s+/g, '')
        .replace(/[()]/g, '');
    const sanitizedColumnName = String(columnName ?? '')
        .replace(/\s+/g, '')
        .replace(/[()]/g, '');
    return `column_${sanitizedTableName}_${sanitizedColumnName}`;
}

// ---------- 1) localStorage-aput -----------------------------------------------------------------
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

export function applyColumnVisibility(tableName) {
    count_this_function("applyColumnVisibility");

    const hidden     = getHiddenColumns(tableName);
    const cleanTable = String(tableName ?? "").replace(/\s+/g, "");

    /* Apufunktio: palauttaa true, jos elementti EI SAA mennä piiloon. */
    function preventsHiding(el) {
        return el.dataset.hideFieldOnCard === "false";
    }

    /* 1) Poista 'hidden-column' niiltä, jotka pitää näyttää -------------------- */
    document
        .querySelectorAll(`.hidden-column[class*="column_${cleanTable}_"]`)
        .forEach((el) => {
            const colClass = [...el.classList].find((cls) =>
                cls.startsWith(`column_${cleanTable}_`)
            );
            if (!colClass) return;

            const trimmedCol = colClass.slice(`column_${cleanTable}_`.length);

            const stillHidden = Object.keys(hidden).some(
                (orig) => orig.replace(/\s+/g, "") === trimmedCol
            );

            /* Poistetaan 'hidden-column', jos
               a) sarakkeen ei enää pitäisi olla piilossa TAI
               b) data-hide-field-on-card="false" estää piilotuksen.
            */
            if (!stillHidden || preventsHiding(el)) {
                el.classList.remove("hidden-column");
            }
        });

    /* 2) Lisää 'hidden-column' niille sarakkeille, jotka pitää piilottaa -------- */
    Object.keys(hidden).forEach((origName) => {
        const cls = makeColumnClass(tableName, origName);
        document.querySelectorAll(`.${cls}`).forEach((el) => {
            /* Älä piilota, jos attribuutti estää sen. */
            if (preventsHiding(el)) return;
            el.classList.add("hidden-column");
        });
    });
}

export function shouldShowColumn(tableName, columnName) {
    const hidden = getHiddenColumns(tableName);
    return !hidden[columnName]; // true ⇢ näytetään
}

// ---------- 2) UI-rakentaja (B-ratkaisu) ---------------------------------------
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
