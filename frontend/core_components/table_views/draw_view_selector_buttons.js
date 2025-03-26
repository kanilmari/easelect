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
        const btn = createGenericViewButton(label, viewKey, tableName, currentView);
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
    if (storedViewKey === "card") {
        bodyContent.style.maxWidth = "2560px";
        bodyContent.style.margin = "auto";
        bodyWrapper.style.justifyContent = "center";
        const navTabs = document.querySelector(".navtabs");
        if (navTabs) {
            navTabs.style.right = "";
        }
    } else {
        bodyContent.style.maxWidth = "unset";
        bodyWrapper.style.display = "unset";
        bodyWrapper.style.justifyContent = "unset";
        const navTabs = document.querySelector(".navtabs");
        if (navTabs) {
            navTabs.style.right = "-15px";
        }
    }

    updateTabPathsForView(table_name);
}

// // draw_view_selector_buttons.js
// /**
//  * Luo uudet näkymäpainikkeet omaan diviin.
//  * Näissä painikkeissa käytetään näkymäavaimia: 'normal', 'transposed', 'ticket'.
//  */

// import { refreshTableUnified } from '../general_tables/gt_1_row_crud/gt_1_2_row_read/table_refresh_collector.js';
// import { updateTabPathsForView } from '../navigation/tabs.js';
// /**
//  * Luo uuden näkymävalitsimen annetulle taululle.
//  */
// export function createNewViewSelector(tableName, currentView) {
//     const container = document.createElement('div');
//     container.id = `${tableName}_newViewSelector`;
//     container.classList.add('new-view-selector', 'view-selector-buttons');

//     const normalButton = createNewViewButton('Lista', 'normal', tableName, currentView);
//     const transposedButton = createNewViewButton('Vertailu', 'transposed', tableName, currentView);
//     const ticketButton = createNewViewButton('Tiketti', 'ticket', tableName, currentView);

//     container.appendChild(normalButton);
//     container.appendChild(transposedButton);
//     container.appendChild(ticketButton);

//     return container;
// }

// function createNewViewButton(label, viewKey, tableName, currentView) {
//     const btn = document.createElement('button');
//     btn.textContent = label;
//     btn.classList.add('new-view-button');

//     if (viewKey === currentView) {
//         btn.classList.add('active');
//         btn.style.fontWeight = 'bold';
//     }

//     btn.addEventListener('mouseenter', () => {
//         btn.style.backgroundColor = 'var(--button_hover_bg_color)';
//         btn.style.color = 'var(--button_hover_text_color)';
//     });
//     btn.addEventListener('mouseleave', () => {
//         btn.style.backgroundColor = 'var(--button_bg_color)';
//         btn.style.color = 'var(--button_text_color)';
//     });

//     // Klikkauksessa tallennetaan näkymä localStorageen ja kutsutaan refreshTableUnified
//     btn.addEventListener('click', () => {
//         console.log('createNewViewButton calls refreshTableUnified');
//         localStorage.setItem(`${tableName}_view`, viewKey);
//         applyViewStyling(tableName);
//         refreshTableUnified(tableName);
//     });

//     return btn;
// }

// export function createViewSelectorButtons(table_name, current_view) {
//     const container = document.createElement('div');
//     container.classList.add('view-selector-buttons');

//     const tableButton = createOneViewButton('Taulunäkymä', 'table', table_name, current_view);
//     const cardButton = createOneViewButton('Korttinäkymä', 'card', table_name, current_view);
//     const treeButton = createOneViewButton('Puunäkymä', 'tree', table_name, current_view);

//     container.appendChild(tableButton);
//     container.appendChild(cardButton);
//     container.appendChild(treeButton);

//     return container;
// }

// function createOneViewButton(label, viewKey, table_name, current_view) {
//     const btn = document.createElement('button');
//     btn.textContent = label;

//     btn.style.backgroundColor = 'var(--button_bg_color)';
//     btn.style.color = 'var(--button_text_color)';
//     btn.addEventListener('mouseenter', () => {
//         btn.style.backgroundColor = 'var(--button_hover_bg_color)';
//         btn.style.color = 'var(--button_hover_text_color)';
//     });
//     btn.addEventListener('mouseleave', () => {
//         btn.style.backgroundColor = 'var(--button_bg_color)';
//         btn.style.color = 'var(--button_text_color)';
//     });

//     if (viewKey === current_view) {
//         btn.style.fontWeight = 'bold';
//     }

//     btn.addEventListener('click', () => {
//         localStorage.setItem(`${table_name}_view`, viewKey);

//         console.log('createOneViewButton kutsuu refreshTableUnified');
//         applyViewStyling(table_name);

//         refreshTableUnified(table_name);
//     });

//     return btn;
// }

// export function applyViewStyling(table_name) {
//     const bodyContent = document.querySelector('.body_content');
//     const bodyWrapper = document.querySelector('.body_wrapper');

//     if (!bodyContent || !bodyWrapper) {
//         // console.log('Kohde-elementtejä ei löydy, ei voida soveltaa tyylimuutoksia 🤔');
//         return;
//     }

//     // Tarkistetaan, vastaako localStoragen selected_table annettua table_name
//     const selectedTable = localStorage.getItem('selected_table');
//     if (selectedTable !== table_name) {
//         // console.log('selected_table ' + selectedTable + ' ei vastaa table_name ' + table_name + ', palautetaan oletustyylit! 😉');
//         bodyContent.style.maxWidth = 'unset';
//         bodyWrapper.style.display = 'unset';
//         bodyWrapper.style.justifyContent = 'unset';

//         // Päivitetään myös tab-polut
//         updateTabPathsForView(table_name);
//         return;
//     }

//     // Haetaan localStorage-avain <table_name>_view
//     const storedViewKey = localStorage.getItem(`${table_name}_view`);

//     if (storedViewKey === 'card') {
//         // console.log('Korttinäkymä valittu 😄');
//         bodyContent.style.maxWidth = '2560px';
//         bodyContent.style.margin = 'auto';
//         bodyWrapper.style.justifyContent = 'center';

//         // Jos on card, poistetaan navtabs-elementiltä left-asetus
//         const navTabs = document.querySelector('.navtabs');
//         if (navTabs) {
//             navTabs.style.right = '';
//         }
//     } else {
//         // console.log('Palataan oletusnäkymään 🤗');
//         bodyContent.style.maxWidth = 'unset';
//         bodyWrapper.style.display = 'unset';
//         bodyWrapper.style.justifyContent = 'unset';

//         // Jos view ei ole card, asetetaan left = 15px
//         const navTabs = document.querySelector('.navtabs');
//         if (navTabs) {
//             navTabs.style.right = '-15px';
//         }
//     }

//     // Päivitetään tab-nappien polut (button path vs. tab path)
//     updateTabPathsForView(table_name);
// }