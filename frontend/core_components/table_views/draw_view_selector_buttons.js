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
        localStorage.setItem(`${tableName}_view`, viewKey);
        applyViewStyling(tableName);
        refreshTableUnified(tableName);
    });

    return btn;
}

/**
 * applyViewStyling (sama kuin aiemmin, ei koskettu).
 */
export function applyViewStyling(table_name) {
    const bodyContent = document.querySelector(".body_content");
    const bodyWrapper = document.querySelector(".body_wrapper");

    if (!bodyContent || !bodyWrapper) {
        return;
    }

    // Tarkistetaan, onko localStoragen selected_table sama
    const selectedTable = localStorage.getItem("selected_table");
    if (selectedTable !== table_name) {
        bodyContent.style.maxWidth = "unset";
        bodyWrapper.style.display = "unset";
        bodyWrapper.style.justifyContent = "unset";
        updateTabPathsForView(table_name);
        return;
    }

    const storedViewKey = localStorage.getItem(`${table_name}_view`);

    // Asetetaan transitionit: voit laajentaa näitä jos haluat animointia myös muihin ominaisuuksiin
    bodyContent.style.transition =
        "max-width 0.3s ease-in-out";

    if (!["table", "normal", "transposed"].includes(storedViewKey)) {
        bodyContent.style.maxWidth = "2560px";

        // const navTabs = document.querySelector(".navtabs");
        // if (navTabs) {
        //     navTabs.style.right = "";
        // }
    } else {
        // Käytetään "100%" korvaamaan "unset", jotta animaatio toimii
        bodyContent.style.maxWidth = "100%";
        // bodyContent.style.maxWidth = "max-content";
        // bodyWrapper.style.display = "";

        // const navTabs = document.querySelector(".navtabs");
        // if (navTabs) {
        //     navTabs.style.right = "-15px";
        // }
    }
    // const storedViewKey = localStorage.getItem(`${table_name}_view`);
    // if (storedViewKey === "card") {
    //     bodyContent.style.maxWidth = "2560px";
    //     bodyContent.style.margin = "auto";
    //     bodyWrapper.style.justifyContent = "center";
    //     const navTabs = document.querySelector(".navtabs");
    //     if (navTabs) {
    //         navTabs.style.right = "";
    //     }
    // } else {
    //     bodyContent.style.maxWidth = "unset";
    //     bodyWrapper.style.display = "unset";
    //     bodyWrapper.style.justifyContent = "unset";
    //     const navTabs = document.querySelector(".navtabs");
    //     if (navTabs) {
    //         navTabs.style.right = "-15px";
    //     }
    // }

    updateTabPathsForView(table_name);
}
