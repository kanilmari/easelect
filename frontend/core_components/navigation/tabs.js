// tabs.js
import { handle_all_navigation } from "./navigation.js";
import { custom_views } from "./custom_views.js";
import { count_this_function } from "../dev_tools/function_counter.js";

// Polkujen perusmuuttujat
const INACTIVE_PATH =
    // "M 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 Z";
    "M 247 0 L 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 L 247 63 L 247 0 Z";

const ACTIVE_PATH =
    "M 250 0 L 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 L 250 63 L 250 0 Z";

const NARROW_BUTTON_PATH =
    "M 193 14 L 193 14 A 7 7 0 0 0 186 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 186 56 A 7 7 0 0 0 193 49 L 193 49 L 193 14 Z";

const BUTTON_PATH =
    // "M 245 14 A 7 7 0 0 0 238 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 238 56 A 7 7 0 0 0 245 49 Z";
    "M 245 14 L 245 14 A 7 7 0 0 0 238 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 238 56 A 7 7 0 0 0 245 49 L 245 49 L 245 14 Z";

// Kolme siirrettävää SVG-polkua
const SERVICE_CATALOG_PATH =
    "M120-120v-560h160v-160h400v320h160v400H520v-160h-80v160H120Zm80-80h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 480h80v-80h-80v80Zm0-160h80v-80h-80v80Z";

const CREATE_PATH = "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z";

const ABOUT_PATH =
    "M478-240q21 0 35.5-14.5T528-290q0-21-14.5-35.5T478-340q-21 0-35.5 14.5T428-290q0 21 14.5 35.5T478-240Zm-36-154h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-12 37.5T506-526q-44 39-54 59t-10 73Zm38 314q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z";

const USER_PATH =
    "M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T560-640q0-33-23.5-56.5T480-720q-33 0-56.5 23.5T400-640q0 33 23.5 56.5T480-560Zm0-80Zm0 400Z";

const USERS_PATH =
    "M0-240v-63q0-43 44-70t116-27q13 0 25 .5t23 2.5q-14 21-21 44t-7 48v65H0Zm240 0v-65q0-32 17.5-58.5T307-410q32-20 76.5-30t96.5-10q53 0 97.5 10t76.5 30q32 20 49 46.5t17 58.5v65H240Zm540 0v-65q0-26-6.5-49T754-397q11-2 22.5-2.5t23.5-.5q72 0 116 26.5t44 70.5v63H780Zm-455-80h311q-10-20-55.5-35T480-370q-55 0-100.5 15T325-320ZM160-440q-33 0-56.5-23.5T80-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T160-440Zm640 0q-33 0-56.5-23.5T720-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T800-440Zm-320-40q-50 0-85-35t-35-85q0-51 35-85.5t85-34.5q51 0 85.5 34.5T600-600q0 50-34.5 85T480-480Zm0-80q17 0 28.5-11.5T520-600q0-17-11.5-28.5T480-640q-17 0-28.5 11.5T440-600q0 17 11.5 28.5T480-560Zm1 240Zm-1-280Z";

const REGISTER_PATH =
    "M720-400v-120H600v-80h120v-120h80v120h120v80H800v120h-80Zm-360-80q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM40-160v-112q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v112H40Zm80-80h480v-32q0-11-5.5-20T580-306q-54-27-109-40.5T360-360q-56 0-111 13.5T140-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T440-640q0-33-23.5-56.5T360-720q-33 0-56.5 23.5T280-640q0 33 23.5 56.5T360-560Zm0-80Zm0 400Z";

const LOGIN_PATH =
    "M480-120v-80h280v-560H480v-80h280q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H480Zm-80-160-55-58 102-102H120v-80h327L345-622l55-58 200 200-200 200Z";

const LOGOUT_PATH =
    "m216-160-56-56 384-384H440v80h-80v-160h233q16 0 31 6t26 17l120 119q27 27 66 42t84 16v80q-62 0-112.5-19T718-476l-40-42-88 88 90 90-262 151-40-69 172-99-68-68-266 265Zm-96-280Zm-80-120m739-80q-33 0-57-23.5T698-720q0-33 24-56.5t57-23.5q33 0 57 23.5t24 56.5q0 33-24 56.5T779-640ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Z";

// tabs.js
/** User friendly tabs **/
// Imports and SVG paths defined already...

// Välilehtien tiedot
const tabsData = [
    {
        id: "service_catalog",
        text: "Browse",
        langKey: "browse",
        svgPath: SERVICE_CATALOG_PATH,
        adminTab: false,
    },
    {
        id: "create",
        text: "Create",
        langKey: "create",
        svgPath: CREATE_PATH,
        adminTab: true,
    },
    {
        userContent: true,
        id: "user",
        text: "Account",
        langKey: "account",
        svgPath: USER_PATH,
        adminTab: true,
    },
    {
        userContent: true,
        id: "auth_users",
        text: "Users",
        langKey: "users",
        svgPath: USERS_PATH,
        adminTab: false,
    },
    {
        nonUserContent: true,
        id: "register",
        text: "Register",
        langKey: "register",
        svgPath: REGISTER_PATH,
        adminTab: true,
    },
    {
        nonUserContent: true,
        id: "login",
        text: "Login",
        langKey: "login",
        svgPath: LOGIN_PATH,
        adminTab: true,
    },
    {
        userContent: true,
        id: "logout",
        text: "Logout",
        langKey: "logout",
        svgPath: LOGOUT_PATH,
        alwaysNarrowButton: true,
        adminTab: true,
    },
    {
        id: "about",
        text: "About",
        langKey: "about",
        svgPath: ABOUT_PATH,
        adminTab: false,
    },
];

const container = document.getElementById("navmenu");
const isAdmin   = localStorage.getItem("admin_mode") === "true";

// Tarkistetaan löytyikö container
if (!container) {
    console.error("container not found 🤔");
    console.log("Ei voitu luoda navmenua 🙃");
} else {
    tabsData.forEach((tabData) => {
        if (tabData.adminTab && !isAdmin) return;

        const tabButton = document.createElement("button");
        tabButton.classList.add("navtablinks");
        tabButton.setAttribute("data-id", tabData.id);
        if (tabData.langKey) {
            tabButton.setAttribute("data-lang-key", tabData.langKey);
        }
        tabButton.onclick = () => openNavTab(tabData.id);

        createSVGTabButton(tabButton, tabData.text, tabData.svgPath);
        container.appendChild(tabButton);
    });
}

function createSVGTabButton(tabElement, buttonText, iconPathD) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg   = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width",  "250");
    svg.setAttribute("height", "63");
    svg.setAttribute("viewBox", "-2 0 250 63");
    svg.classList.add("svg-container");

    const outlinePath = document.createElementNS(svgNS, "path");
    outlinePath.setAttribute("d", INACTIVE_PATH);
    outlinePath.setAttribute("stroke",       "var(--border_color)");
    outlinePath.setAttribute("stroke-width", "2");
    outlinePath.setAttribute("fill",         "var(--bg_color_blended_2)");
    svg.appendChild(outlinePath);

    const iconPath = document.createElementNS(svgNS, "path");
    iconPath.setAttribute("d",   iconPathD);
    iconPath.setAttribute("fill","var(--text_color)");
    iconPath.setAttribute(
        "transform",
        "scale(0.03, 0.03) translate(350, 1500)"
    );
    svg.appendChild(iconPath);

    tabElement.appendChild(svg);

    const textSpan = document.createElement("span");
    textSpan.classList.add("tab_button_text");
    textSpan.innerText = buttonText;
    tabElement.appendChild(textSpan);
}

/**
 * Avaa nav-välilehden ja päivittää ulkoasun.
 * @param {string}  tableName                 – taulun / näkymän nimi
 * @param {Object}  [options]
 * @param {boolean} [options.skipNavigation]  – ohita varsinainen navigointi
 */
export async function openNavTab(tableName, options = {}) {
    count_this_function("openNavTab");

    const { skipNavigation = false } = options;

    /* 1) Varsinainen navigaatio taulun/välinäkymän sisään ---------------- */
    if (!skipNavigation) {
        await handle_all_navigation(tableName, custom_views);
    }

    /* 2) Päivitetään tab-painikkeiden .active-luokat --------------------- */
    const allTabButtons = document.getElementsByClassName("navtablinks");
    for (let i = 0; i < allTabButtons.length; i++) {
        allTabButtons[i].classList.remove("active");
    }
    const clickedButton = document.querySelector(
        `.navtablinks[data-id="${tableName}"]`
    );
    if (clickedButton) {
        clickedButton.classList.add("active");
    }

    /* 3) Päivitetään SVG-polut / visuaalinen tila ----------------------- */
    updateTabPathsForView(tableName);
}

async function animatePath(pathElement, newD, newFill) {
    pathElement.setAttribute("d",   newD);
    pathElement.setAttribute("fill", newFill);
}

export async function updateTabPathsForView(tableName) {
    const storedViewKey = localStorage.getItem(`${tableName}_view`) || "";
    const isCardView    = storedViewKey === "card";

    const allTabButtons = document.querySelectorAll(".navtablinks");
    allTabButtons.forEach((btn) => {
        const isActive = btn.classList.contains("active");
        const svgPaths = btn.querySelectorAll("svg path");
        if (!svgPaths[0]) return;   // turva

        const outlinePath = svgPaths[0];

        if (isCardView) {
            const navTabs = document.querySelector(".navtabs");
            if (navTabs) navTabs.style.right = "";

            if (isActive) {
                animatePath(outlinePath, ACTIVE_PATH, "var(--bg_color_2)");
            } else {
                animatePath(outlinePath, INACTIVE_PATH, "var(--bg_color_blended_2)");
            }
        } else {
            if (isAdmin) {
                const navTabs = document.querySelector(".navtabs");
                if (navTabs) navTabs.style.right = "-15px";

                if (isActive) {
                    animatePath(outlinePath, BUTTON_PATH, "var(--bg_color_2)");
                } else {
                    animatePath(outlinePath, BUTTON_PATH, "var(--bg_color_blended_2)");
                }
            }
        }
    });
}

// const container = document.getElementById("navmenu");
// const isAdmin = localStorage.getItem("admin_mode") === "true";
// // Tarkistetaan löytyikö container
// if (!container) {
//     console.error("container not found 🤔");
//     console.log("Ei voitu luoda navmenua 🙃");
// } else {
//     tabsData.forEach((tabData) => {
//         if (tabData.adminTab && !isAdmin) return;
//         const tabButton = document.createElement("button");
//         tabButton.classList.add("navtablinks");
//         tabButton.setAttribute("data-id", tabData.id);
//         if (tabData.langKey) {
//             tabButton.setAttribute("data-lang-key", tabData.langKey);
//         }
//         tabButton.onclick = () => openNavTab(tabData.id);
//         createSVGTabButton(tabButton, tabData.text, tabData.svgPath);
//         container.appendChild(tabButton);
//     });
// }

// function createSVGTabButton(tabElement, buttonText, iconPathD) {
//     const svgNS = "http://www.w3.org/2000/svg";
//     const svg = document.createElementNS(svgNS, "svg");
//     svg.setAttribute("width", "250");
//     svg.setAttribute("height", "63");
//     svg.setAttribute("viewBox", "-2 0 250 63");
//     svg.classList.add("svg-container");

//     const outlinePath = document.createElementNS(svgNS, "path");
//     outlinePath.setAttribute("d", INACTIVE_PATH);
//     outlinePath.setAttribute("stroke", "var(--border_color)");
//     outlinePath.setAttribute("stroke-width", "2");
//     outlinePath.setAttribute("fill", "var(--bg_color_blended_2)");
//     svg.appendChild(outlinePath);

//     const iconPath = document.createElementNS(svgNS, "path");
//     iconPath.setAttribute("d", iconPathD);
//     iconPath.setAttribute("fill", "var(--text_color)");
//     iconPath.setAttribute(
//         "transform",
//         "scale(0.03, 0.03) translate(350, 1500)"
//     );
//     svg.appendChild(iconPath);

//     tabElement.appendChild(svg);

//     const textSpan = document.createElement("span");
//     textSpan.classList.add("tab_button_text");
//     textSpan.innerText = buttonText;
//     tabElement.appendChild(textSpan);
// }

// export async function openNavTab(tableName) {
//     // console.log(`Tab "${tableName}" clicked.`);
//     // handle_all_navigation(tableName, custom_views);

//     // const allTabButtons = document.getElementsByClassName("navtablinks");
//     // for (let i = 0; i < allTabButtons.length; i++) {
//     //     allTabButtons[i].classList.remove("active");
//     // }

//     // const clickedButton = document.querySelector(
//     //     `.navtablinks[data-id="${tableName}"]`
//     // );
//     // if (clickedButton) {
//     //     clickedButton.classList.add("active");
//     // }

//     // updateTabPathsForView(tableName);
// }

// async function animatePath(pathElement, newD, newFill) {
//     pathElement.setAttribute("d", newD);
//     pathElement.setAttribute("fill", newFill);
// }

// export async function updateTabPathsForView(tableName) {
//     const storedViewKey = localStorage.getItem(`${tableName}_view`) || "";
//     const isCardView = storedViewKey === "card";

//     const allTabButtons = document.querySelectorAll(".navtablinks");
//     allTabButtons.forEach((btn) => {
//         const isActive = btn.classList.contains("active");
//         const svgPaths = btn.querySelectorAll("svg path");
//         if (!svgPaths[0]) {
//             return;
//         }
//         const outlinePath = svgPaths[0];

//         if (isCardView) {
//             const navTabs = document.querySelector(".navtabs");
//             if (navTabs) {
//                 navTabs.style.right = "";
//             }
//             if (isActive) {
//                 animatePath(outlinePath, ACTIVE_PATH, "var(--bg_color_2)");
//             } else {
//                 animatePath(
//                     outlinePath,
//                     INACTIVE_PATH,
//                     "var(--bg_color_blended_2)"
//                 );
//             }
//         } else {
//             if (isAdmin) {
//                 const navTabs = document.querySelector(".navtabs");
//                 if (navTabs) {
//                     navTabs.style.right = "-15px";
//                 }
//                 if (isActive) {
//                     animatePath(outlinePath, BUTTON_PATH, "var(--bg_color_2)");
//                 } else {
//                     animatePath(
//                         outlinePath,
//                         BUTTON_PATH,
//                         "var(--bg_color_blended_2)"
//                     );
//                 }
//             }
//         }
//     });
// }