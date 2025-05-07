// draw_view_selector_buttons.js
/**
 * Yhdistetty funktio, joka osaa luoda minkä tahansa joukon näkymävalintanappeja
 * samasta rakenteesta:
 *    [ { label: "...", viewKey: "..."}, ... ]
 */
import { refreshTableUnified } from "../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js";
import { updateTabPathsForView } from "../navigation/tabs.js";

/**
 * Luo geneerisen näkymävalitsimen, jonka sisällä on annettu joukko nappeja.
 * @param {string} tableName        Taulun nimi
 * @param {string} currentView      Nykyinen näkymäavain (esim. "normal", "table", jne.)
 * @param {Array}  buttonList       Taulukko: [ { label, viewKey }, ... ]
 * @param {Array}  extraClasses     (Valinnainen) lista lisäluokkia containeriin, esim. ["new-view-selector"]
 */
export function createGenericViewSelector(
    tableName,
    currentView,
    buttonList = [],
    extraClasses = []
) {
    const container = document.createElement("div");
    container.classList.add("view-selector-buttons", ...extraClasses);

    buttonList.forEach(({ label, viewKey }) => {
        const btn = createGenericViewButton(
            label,
            viewKey,
            tableName,
            currentView
        );
        container.appendChild(btn);
    });

    return container;
}

/**
 * Yhdistetty nappifunktio, joka käyttää samaa logiikkaa riippumatta siitä,
 * onko kyse "normal"/"ticket"/"transposed" vai "table"/"card"/"tree".
 */
function createGenericViewButton(label, viewKey, tableName, currentView) {
    const btn = document.createElement("button");
    btn.textContent = label;

    // Anna kaikille sama perusluokka, halutessa voi myös lisätä muita
    btn.classList.add("unified-view-button");
    btn.classList.add("button");

    // Korostus, jos tämä on valittu näkymä
    if (viewKey === currentView) {
        btn.classList.add("active");
        btn.style.fontWeight = "bold";
    }

    // Hover-efektit
    btn.addEventListener("mouseenter", () => {
        btn.style.backgroundColor = "var(--button_hover_bg_color)";
        btn.style.color = "var(--button_hover_text_color)";
    });
    btn.addEventListener("mouseleave", () => {
        btn.style.backgroundColor = "var(--button_bg_color)";
        btn.style.color = "var(--button_text_color)";
    });

    // Klikattaessa tallennetaan localStorageen ja kutsutaan refresh
    btn.addEventListener("click", () => {
        console.log("createGenericViewButton calls refreshTableUnified");

        /* --- UUSI: lokitus korttinäkymän valinnasta hiirellä ---------- */
        if (viewKey === "card") {
            console.log(`[view-log] Korttinäkymä valittu taululle '${tableName}' (click)`);
        }

        localStorage.setItem(`${tableName}_view`, viewKey);
        applyViewStyling(tableName);
        refreshTableUnified(tableName);
    });

    return btn;
}

/**
 * applyViewStyling
 * ----------------
 * - Päivittää sivun ulkoasun ja lokittaa, jos korttinäkymä on aktiivinen.
 * - Piilottaa (.hidden) sarake-näytä/piilota-checkboksit korttinäkymässä
 *        ja näyttää ne muissa näkymissä.
 */
export function applyViewStyling(table_name) {
    const bodyContent = document.querySelector(".body_content");
    const bodyWrapper = document.querySelector(".body_wrapper");

    if (!bodyContent || !bodyWrapper) return;

    /* --- Selvitä valittu taulu ja näkymäavain ---------------------- */
    const selectedTable = localStorage.getItem("selected_table");
    if (selectedTable !== table_name) {
        bodyContent.style.maxWidth = "unset";
        bodyWrapper.style.display = "unset";
        bodyWrapper.style.justifyContent = "unset";
        updateTabPathsForView(table_name);
        return;
    }

    const storedViewKey = localStorage.getItem(`${table_name}_view`);

    /* --- PIILOTA / NÄYTÄ sarakkeiden checkboxit ------------------- */
    document.querySelectorAll(".column-visibility-toggle").forEach((el) => {
        if (storedViewKey === "card") {
            el.classList.add("hidden");
        } else {
            el.classList.remove("hidden");
        }
    });

    /* --- Max-width-asettelu (ennallaan) --------------------------- */
    if (!["table", "normal", "transposed"].includes(storedViewKey)) {
        bodyContent.style.maxWidth = "2560px";
    } else {
        bodyContent.style.maxWidth = "100%";
    }

    updateTabPathsForView(table_name);

    /* --- Lokitus korttinäkymästä ---------------------------------- */
    if (storedViewKey === "card") {
        console.log(
            `[view-log] Korttinäkymä aktiivinen taululle '${table_name}' (page-load/applyViewStyling)`
        );
    }
}
