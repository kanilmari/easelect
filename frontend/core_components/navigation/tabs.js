// tabs.js
import { handle_all_navigation } from "./navigation.js";
import { custom_views } from "./custom_views.js";

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
    },
    {
        id: "create",
        text: "Create",
        langKey: "create",
        svgPath: CREATE_PATH,
    },
    {
        userContent: true,
        id: "user",
        text: "Account",
        langKey: "account",
        svgPath: USER_PATH,
    },
    {
        userContent: true,
        id: "auth_users",
        text: "Users",
        langKey: "users",
        svgPath: USERS_PATH,
    },
    {
        nonUserContent: true,
        id: "register",
        text: "Register",
        langKey: "register",
        svgPath: REGISTER_PATH,
    },
    {
        nonUserContent: true,
        id: "login",
        text: "Login",
        langKey: "login",
        svgPath: LOGIN_PATH,
    },
    {
        userContent: true,
        id: "logout",
        text: "Logout",
        langKey: "logout",
        svgPath: LOGOUT_PATH,
        alwaysNarrowButton: true,
    },
    {
        id: "about",
        text: "About",
        langKey: "about",
        svgPath: ABOUT_PATH,
    },
];

// nimiehdotus: navmenu.js

const container = document.getElementById("navmenu");

// Tarkistetaan löytyikö container
if (!container) {
    console.error("container not found 🤔");
    console.log("Ei voitu luoda navmenua 🙃");
} else {
    tabsData.forEach((tabData) => {
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
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "250");
    svg.setAttribute("height", "63");
    svg.setAttribute("viewBox", "-2 0 250 63");
    svg.classList.add("svg-container");

    const outlinePath = document.createElementNS(svgNS, "path");
    outlinePath.setAttribute("d", INACTIVE_PATH);
    outlinePath.setAttribute("stroke", "var(--border_color)");
    outlinePath.setAttribute("stroke-width", "2");
    outlinePath.setAttribute("fill", "var(--blended_bg_2)");
    svg.appendChild(outlinePath);

    const iconPath = document.createElementNS(svgNS, "path");
    iconPath.setAttribute("d", iconPathD);
    iconPath.setAttribute("fill", "var(--text_color)");
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

export async function openNavTab(tableName) {
    console.log(`Tab "${tableName}" clicked.`);
    handle_all_navigation(tableName, custom_views);

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

    updateTabPathsForView(tableName);
}

async function animatePath(pathElement, newD, newFill) {
    pathElement.setAttribute("d", newD);
    pathElement.setAttribute("fill", newFill);
}

export async function updateTabPathsForView(tableName) {
    const storedViewKey = localStorage.getItem(`${tableName}_view`) || "";
    const isCardView = storedViewKey === "card";

    const allTabButtons = document.querySelectorAll(".navtablinks");
    allTabButtons.forEach((btn) => {
        const isActive = btn.classList.contains("active");
        const svgPaths = btn.querySelectorAll("svg path");
        if (!svgPaths[0]) {
            return;
        }
        const outlinePath = svgPaths[0];

        if (isCardView) {
            const navTabs = document.querySelector(".navtabs");
            if (navTabs) {
                navTabs.style.right = "";
            }
            if (isActive) {
                animatePath(outlinePath, ACTIVE_PATH, "var(--bg_color_text)");
            } else {
                animatePath(outlinePath, INACTIVE_PATH, "var(--blended_bg_2)");
            }
        } else {
            const navTabs = document.querySelector(".navtabs");
            if (navTabs) {
                navTabs.style.right = "-15px";
            }
            if (isActive) {
                animatePath(outlinePath, BUTTON_PATH, "var(--bg_color_text)");
            } else {
                animatePath(outlinePath, BUTTON_PATH, "var(--blended_bg_2)");
            }
        }
    });
}

// import { handle_all_navigation } from '../navigation/navigation.js';

// // Polkujen perusmuuttujat
// const INACTIVE_PATH =
//     // "M 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 Z";
//     "M 247 0 L 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 L 247 63 L 247 0 Z";

// const ACTIVE_PATH =
//     "M 250 0 L 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 L 250 63 L 250 0 Z";
// const BUTTON_INACTIVE_PATH =
//     // "M 245 14 A 7 7 0 0 0 238 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 238 56 A 7 7 0 0 0 245 49 Z";
//     "M 245 14 L 245 14 A 7 7 0 0 0 238 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 238 56 A 7 7 0 0 0 245 49 L 245 49 L 245 14 Z";
// const BUTTON_ACTIVE_PATH = BUTTON_INACTIVE_PATH;

// // Välilehtien tiedot
// const tabsData = [
//     {
//         id: "service_catalog",
//         text: "Browse",
//         langKey: "browse",
//         svgPath:
//             "M120-120v-560h160v-160h400v320h160v400H520v-160h-80v160H120Zm80-80h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 480h80v-80h-80v80Zm0-160h80v-80h-80v80Z",
//     },
//     {
//         id: "create",
//         text: "Create",
//         langKey: "create",
//         svgPath: "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z",
//     },
//     {
//         id: "about",
//         text: "About",
//         langKey: "about",
//         svgPath:
//             "M478-240q21 0 35.5-14.5T528-290q0-21-14.5-35.5T478-340q-21 0-35.5 14.5T428-290q0 21 14.5 35.5T478-240Zm-36-154h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-12 37.5T506-526q-44 39-54 59t-10 73Zm38 314q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z",
//     },
// ];

// const container = document.getElementById("navmenu");

// tabsData.forEach((tabData) => {
//     const tabButton = document.createElement("button");
//     tabButton.classList.add("navtablinks");
//     tabButton.setAttribute("data-id", tabData.id);
//     if (tabData.langKey) {
//         tabButton.setAttribute("data-lang-key", tabData.langKey);
//     }
//     tabButton.onclick = () => openNavTab(tabData.id);
//     createSVGTabButton(tabButton, tabData.text, tabData.svgPath);
//     container.appendChild(tabButton);
// });

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
//     outlinePath.setAttribute("fill", "var(--blended_bg_2)");
//     svg.appendChild(outlinePath);

//     const iconPath = document.createElementNS(svgNS, "path");
//     iconPath.setAttribute("d", iconPathD);
//     iconPath.setAttribute("fill", "var(--text_color)");
//     iconPath.setAttribute("transform", "scale(0.03, 0.03) translate(350, 1500)");
//     svg.appendChild(iconPath);

//     tabElement.appendChild(svg);

//     const textSpan = document.createElement("span");
//     textSpan.classList.add("tab_button_text");
//     textSpan.innerText = buttonText;
//     tabElement.appendChild(textSpan);
// }

// function openNavTab(tableName) {
//     console.log(`Tab "${tableName}" clicked.`);
//     handle_all_navigation(tableName);

//     const allTabButtons = document.getElementsByClassName("navtablinks");
//     for (let i = 0; i < allTabButtons.length; i++) {
//         allTabButtons[i].classList.remove("active");
//     }

//     const clickedButton = document.querySelector(`.navtablinks[data-id="${tableName}"]`);
//     if (clickedButton) {
//         clickedButton.classList.add("active");
//     }

//     updateTabPathsForView(tableName);
// }

// async function animatePath(pathElement, newD, newFill) {
//     pathElement.setAttribute("d", newD);
//     pathElement.setAttribute("fill", newFill);
// }

// export async function updateTabPathsForView(tableName) {
//     const storedViewKey = localStorage.getItem(`${tableName}_view`) || '';
//     const isCardView = (storedViewKey === 'card');

//     const allTabButtons = document.querySelectorAll(".navtablinks");
//     allTabButtons.forEach((btn) => {
//         const isActive = btn.classList.contains("active");
//         const svgPaths = btn.querySelectorAll("svg path");
//         if (!svgPaths[0]) {
//             return;
//         }
//         const outlinePath = svgPaths[0];

//         if (isCardView) {
//             if (isActive) {
//                 animatePath(outlinePath, ACTIVE_PATH, "var(--bg_color_text)");
//             } else {
//                 animatePath(outlinePath, INACTIVE_PATH, "var(--blended_bg_2)");
//             }
//         } else {
//             if (isActive) {
//                 animatePath(outlinePath, BUTTON_ACTIVE_PATH, "var(--bg_color_text)");
//             } else {
//                 animatePath(outlinePath, BUTTON_INACTIVE_PATH, "var(--blended_bg_2)");
//             }
//         }
//     });
// }

// // // tabs.js
// // import { handle_all_navigation } from '../navigation/navigation.js';

// // // Polkujen perusmuuttujat
// // const INACTIVE_PATH =
// //     "M 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 Z";
// // const ACTIVE_PATH =
// //     "M 250 0 L 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 L 250 63 L 250 0 Z";
// // const BUTTON_INACTIVE_PATH =
// //     "M 245 14 A 7 7 0 0 0 238 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 238 56 A 7 7 0 0 0 245 49 Z";
// // const BUTTON_ACTIVE_PATH = BUTTON_INACTIVE_PATH;

// // // Välilehtien tiedot
// // const tabsData = [
// //     {
// //         id: "service_catalog",
// //         text: "Browse",
// //         langKey: "browse",
// //         svgPath:
// //             "M120-120v-560h160v-160h400v320h160v400H520v-160h-80v160H120Zm80-80h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 480h80v-80h-80v80Zm0-160h80v-80h-80v80Z",
// //     },
// //     {
// //         id: "create",
// //         text: "Create",
// //         langKey: "create",
// //         svgPath: "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z",
// //     },
// //     {
// //         id: "about",
// //         text: "About",
// //         langKey: "about",
// //         svgPath:
// //             "M478-240q21 0 35.5-14.5T528-290q0-21-14.5-35.5T478-340q-21 0-35.5 14.5T428-290q0 21 14.5 35.5T478-240Zm-36-154h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-12 37.5T506-526q-44 39-54 59t-10 73Zm38 314q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z",
// //     },
// // ];

// // // Kontaineri, johon napit luodaan
// // const container = document.getElementById("navmenu");

// // // Luodaan nappi jokaiselle tabille
// // tabsData.forEach((tabData) => {
// //     const tabButton = document.createElement("button");
// //     tabButton.classList.add("navtablinks");
// //     tabButton.setAttribute("data-id", tabData.id);
// //     if (tabData.langKey) {
// //         tabButton.setAttribute("data-lang-key", tabData.langKey);
// //     }

// //     // Klikkaus -> openNavTab (vain tabData.id parametrina)
// //     tabButton.onclick = () => openNavTab(tabData.id);

// //     // Luodaan SVG+teksti tälle napille
// //     createSVGTabButton(tabButton, tabData.text, tabData.svgPath);

// //     // Lisätään DOM:iin
// //     container.appendChild(tabButton);
// // });

// // /**
// //  * Luodaan yhden nappulan SVG + teksti
// //  */
// // function createSVGTabButton(tabElement, buttonText, iconPathD) {
// //     const svgNS = "http://www.w3.org/2000/svg";
// //     const svg = document.createElementNS(svgNS, "svg");
// //     svg.setAttribute("width", "250");
// //     svg.setAttribute("height", "63");
// //     svg.setAttribute("viewBox", "-2 0 250 63");
// //     svg.classList.add("svg-container");

// //     // Lähtökohtainen polku: (käytämme INACTIVE_PATH oletuksena)
// //     const outlinePath = document.createElementNS(svgNS, "path");
// //     outlinePath.setAttribute("d", INACTIVE_PATH);
// //     outlinePath.setAttribute("stroke", "var(--border_color)");
// //     outlinePath.setAttribute("stroke-width", "2");
// //     outlinePath.setAttribute("fill", "var(--blended_bg_2)");
// //     svg.appendChild(outlinePath);

// //     // Ikoni
// //     const iconPath = document.createElementNS(svgNS, "path");
// //     iconPath.setAttribute("d", iconPathD);
// //     iconPath.setAttribute("fill", "var(--text_color)");
// //     iconPath.setAttribute("transform", "scale(0.03, 0.03) translate(350, 1500)");
// //     svg.appendChild(iconPath);

// //     // Liitetään SVG napille
// //     tabElement.appendChild(svg);

// //     // Tekstielementti
// //     const textSpan = document.createElement("span");
// //     textSpan.classList.add("tab_button_text");
// //     textSpan.innerText = buttonText;
// //     tabElement.appendChild(textSpan);
// // }

// // /**
// //  * Ajetaan kun käyttäjä klikkaa välilehteä.
// //  * Kutsutaan ohjausnavigaatiota ja merkitään aktiivinen nappi.
// //  */
// // function openNavTab(tableName) {
// //     console.log(`Tab "${tableName}" clicked.`);
// //     handle_all_navigation(tableName);

// //     // Poistetaan active kaikilta
// //     const allTabButtons = document.getElementsByClassName("navtablinks");
// //     for (let i = 0; i < allTabButtons.length; i++) {
// //         allTabButtons[i].classList.remove("active");
// //     }

// //     // Merkataan klikatun napin .active
// //     const clickedButton = document.querySelector(`.navtablinks[data-id="${tableName}"]`);
// //     if (clickedButton) {
// //         clickedButton.classList.add("active");
// //     }

// //     // Päivitetään polut (korttinäkymä vs. button)
// //     updateTabPathsForView(tableName);
// // }

// // /**
// //  * Päivitetään kaikkien tab-nappien polut sen perusteella,
// //  * onko ko. tableName:lle valittuna 'card' vai jokin muu view.
// //  */
// // export async function updateTabPathsForView(tableName) {
// //     const storedViewKey = localStorage.getItem(`${tableName}_view`) || '';
// //     const isCardView = (storedViewKey === 'card');
// //     const allTabButtons = document.querySelectorAll(".navtablinks");

// //     allTabButtons.forEach((btn) => {
// //         const isActive = btn.classList.contains("active");
// //         const svgPaths = btn.querySelectorAll("svg path");
// //         if (!svgPaths[0]) {
// //             return;
// //         }
// //         const outlinePath = svgPaths[0];

// //         if (isCardView) {
// //             // Korttinäkymässä animoidaan polku
// //             if (isActive) {
// //                 outlinePath.setAttribute("fill", "var(--bg_color_text)"); // Asetetaan täyttö heti, CSS hoitaa siirtymän
// //                 animatePathTab(outlinePath, 0, 1, 300); // Animoidaan inaktiivisesta aktiiviseen
// //             } else {
// //                 outlinePath.setAttribute("fill", "var(--blended_bg_2)");
// //                 animatePathTab(outlinePath, 1, 0, 300); // Animoidaan aktiivisesta inaktiiviseen
// //             }
// //         } else {
// //             // Button-näkymässä asetetaan polku heti, vain täyttö animoidaan CSS:llä
// //             outlinePath.setAttribute("d", BUTTON_INACTIVE_PATH);
// //             outlinePath.setAttribute("fill", isActive ? "var(--bg_color_text)" : "var(--blended_bg_2)");
// //         }
// //     });
// // }

// // // Apufunktio polun interpolointiin
// // function getTabPath(t) {
// //     const x = 247 + 3 * t; // x interpoloi välillä 247–250
// //     return `M ${x} 0 L 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 L ${x} 63 L ${x} 0 Z`;
// // }

// // // Animointifunktio polulle
// // function animatePathTab(pathElement, startT, endT, duration) {
// //     const startTime = performance.now();

// //     function step(currentTime) {
// //         const elapsed = currentTime - startTime;
// //         const progress = Math.min(elapsed / duration, 1); // 0–1
// //         const t = startT + (endT - startT) * progress;
// //         const newD = getTabPath(t);
// //         pathElement.setAttribute("d", newD);

// //         if (progress < 1) {
// //             requestAnimationFrame(step);
// //         }
// //     }

// //     requestAnimationFrame(step);
// // }

// // // // tabs.js
// // // import { handle_all_navigation } from '../navigation/navigation.js';

// // // // Polkujen perusmuuttujat
// // // const INACTIVE_PATH =
// // //     "M 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 Z";
// // // const ACTIVE_PATH =
// // //     "M 250 0 L 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 L 250 63 L 250 0 Z";
// // // const BUTTON_INACTIVE_PATH =
// // //     "M 245 14 A 7 7 0 0 0 238 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 238 56 A 7 7 0 0 0 245 49 Z";
// // // // Voit halutessasi lisätä erillisen buttonin active-polun,
// // // // mutta yksinkertaisuuden vuoksi käytetään nyt samaa
// // // // polkua active/epäaktiiviseen – vain fill muuttuu.
// // // const BUTTON_ACTIVE_PATH = BUTTON_INACTIVE_PATH;

// // // // Välilehtien tiedot
// // // const tabsData = [
// // //     {
// // //         id: "service_catalog",
// // //         text: "Browse",
// // //         langKey: "browse",
// // //         svgPath:
// // //             "M120-120v-560h160v-160h400v320h160v400H520v-160h-80v160H120Zm80-80h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 480h80v-80h-80v80Zm0-160h80v-80h-80v80Z",
// // //     },
// // //     {
// // //         id: "create",
// // //         text: "Create",
// // //         langKey: "create",
// // //         svgPath: "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z",
// // //     },
// // //     {
// // //         id: "about",
// // //         text: "About",
// // //         langKey: "about",
// // //         svgPath:
// // //             "M478-240q21 0 35.5-14.5T528-290q0-21-14.5-35.5T478-340q-21 0-35.5 14.5T428-290q0 21 14.5 35.5T478-240Zm-36-154h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-12 37.5T506-526q-44 39-54 59t-10 73Zm38 314q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z",
// // //     },
// // // ];

// // // // Kontaineri, johon napit luodaan
// // // const container = document.getElementById("navmenu");

// // // // Luodaan nappi jokaiselle tabille
// // // tabsData.forEach((tabData) => {
// // //     const tabButton = document.createElement("button");
// // //     tabButton.classList.add("navtablinks");
// // //     tabButton.setAttribute("data-id", tabData.id);
// // //     if (tabData.langKey) {
// // //         tabButton.setAttribute("data-lang-key", tabData.langKey);
// // //     }

// // //     // Klikkaus -> openNavTab (vain tabData.id parametrina)
// // //     tabButton.onclick = () => openNavTab(tabData.id);

// // //     // Luodaan SVG+teksti tälle napille
// // //     createSVGTabButton(tabButton, tabData.text, tabData.svgPath);

// // //     // Lisätään DOM:iin
// // //     container.appendChild(tabButton);
// // // });

// // // /**
// // //  * Luodaan yhden nappulan SVG + teksti
// // //  */
// // // function createSVGTabButton(tabElement, buttonText, iconPathD) {
// // //     const svgNS = "http://www.w3.org/2000/svg";
// // //     const svg = document.createElementNS(svgNS, "svg");
// // //     svg.setAttribute("width", "250");
// // //     svg.setAttribute("height", "63");
// // //     svg.setAttribute("viewBox", "-2 0 250 63");
// // //     svg.classList.add("svg-container");

// // //     // Lähtökohtainen polku: (käytämme INACTIVE_PATH oletuksena)
// // //     const outlinePath = document.createElementNS(svgNS, "path");
// // //     outlinePath.setAttribute("d", INACTIVE_PATH);
// // //     outlinePath.setAttribute("stroke", "var(--border_color)");
// // //     outlinePath.setAttribute("stroke-width", "2");
// // //     outlinePath.setAttribute("fill", "var(--blended_bg_2)");
// // //     svg.appendChild(outlinePath);

// // //     // Ikoni
// // //     const iconPath = document.createElementNS(svgNS, "path");
// // //     iconPath.setAttribute("d", iconPathD);
// // //     iconPath.setAttribute("fill", "var(--text_color)");
// // //     iconPath.setAttribute("transform", "scale(0.03, 0.03) translate(350, 1500)");
// // //     svg.appendChild(iconPath);

// // //     // Liitetään SVG napille
// // //     tabElement.appendChild(svg);

// // //     // Tekstielementti
// // //     const textSpan = document.createElement("span");
// // //     textSpan.classList.add("tab_button_text");
// // //     textSpan.innerText = buttonText;
// // //     tabElement.appendChild(textSpan);
// // // }

// // // /**
// // //  * Ajetaan kun käyttäjä klikkaa välilehteä.
// // //  * Kutsutaan ohjausnavigaatiota ja merkitään aktiivinen nappi.
// // //  */
// // // function openNavTab(tableName) {
// // //     console.log(`Tab "${tableName}" clicked.`);
// // //     handle_all_navigation(tableName);

// // //     // Poistetaan active kaikilta
// // //     const allTabButtons = document.getElementsByClassName("navtablinks");
// // //     for (let i = 0; i < allTabButtons.length; i++) {
// // //         allTabButtons[i].classList.remove("active");
// // //     }

// // //     // Merkataan klikatun napin .active
// // //     const clickedButton = document.querySelector(`.navtablinks[data-id="${tableName}"]`);
// // //     if (clickedButton) {
// // //         clickedButton.classList.add("active");
// // //     }

// // //     // Päivitetään polut (korttinäkymä vs. button)
// // //     // Huom. Asetetaan no_delay = true => viive = 0
// // //     updateTabPathsForView(tableName, true);
// // // }

// // // /**
// // //  * Päivitetään kaikkien tab-nappien polut sen perusteella,
// // //  * onko ko. tableName:lle valittuna 'card' vai jokin muu view.
// // //  * (Poistettu SMIL-animointi, jotta inline style -ongelma vältetään CSP-asetuksilla.)
// // //  */
// // // // updateTabPathsForView.js
// // // export async function updateTabPathsForView(tableName, no_delay = false) {
// // //     const storedViewKey = localStorage.getItem(`${tableName}_view`) || '';
// // //     const isCardView = (storedViewKey === 'card');

// // //     // Apufunktio, jossa annetaan viive ennen uusien arvojen asettamista
// // //     async function animatePath(pathElement, newD, newFill, duration = 0) {
// // //         // Jos no_delay on true, yli­kirjoitetaan viive
// // //         if (no_delay) {
// // //             duration = 0;
// // //         }
// // //         const oldD = pathElement.getAttribute("d");
// // //         const oldFill = pathElement.getAttribute("fill");
// // //         if (oldD === newD && oldFill === newFill) {
// // //             // Ei muutosta => ei tarvitse päivittää 😀
// // //             return;
// // //         }
// // //         // odotetaan
// // //         setTimeout(() => {
// // //             pathElement.setAttribute("d", newD);
// // //             pathElement.setAttribute("fill", newFill);
// // //             // console.log('kestää kestää...');
// // //         }, duration);
// // //     }

// // //     // Käydään läpi jokainen tab-nappi
// // //     const allTabButtons = document.querySelectorAll(".navtablinks");
// // //     allTabButtons.forEach((btn) => {
// // //         const isActive = btn.classList.contains("active");
// // //         const svgPaths = btn.querySelectorAll("svg path");
// // //         if (!svgPaths[0]) {
// // //             return;
// // //         }
// // //         // 1. polku (outline) on se, joka vaihtuu
// // //         const outlinePath = svgPaths[0];

// // //         if (isCardView) {
// // //             // Korttinäkymässä tab-tyylinen polku
// // //             if (isActive) {
// // //                 animatePath(outlinePath, ACTIVE_PATH, "var(--bg_color_text)", 250);
// // //             } else {
// // //                 animatePath(outlinePath, INACTIVE_PATH, "var(--blended_bg_2)", 250);
// // //             }
// // //         } else {
// // //             // Muu näkymä => button-tyylinen polku
// // //             if (isActive) {
// // //                 animatePath(outlinePath, BUTTON_ACTIVE_PATH, "var(--bg_color_text)", 50);
// // //             } else {
// // //                 animatePath(outlinePath, BUTTON_INACTIVE_PATH, "var(--blended_bg_2)", 50);
// // //             }
// // //         }
// // //     });
// // // }
// // // // /**
// // // //  * Päivitetään kaikkien tab-nappien polut sen perusteella,
// // // //  * onko ko. tableName:lle valittuna 'card' vai jokin muu view.
// // // //  */
// // // // export function updateTabPathsForView(tableName) {
// // // //     const storedViewKey = localStorage.getItem(`${tableName}_view`) || '';
// // // //     const isCardView = (storedViewKey === 'card');

// // // //     // Haetaan kaikki tab-napit ja käydään läpi
// // // //     const allTabButtons = document.querySelectorAll(".navtablinks");
// // // //     allTabButtons.forEach((btn) => {
// // // //         const isActive = btn.classList.contains("active");
// // // //         const svgPaths = btn.querySelectorAll("svg path");

// // // //         if (!svgPaths[0]) return;  // 1. polku on outline

// // // //         if (isCardView) {
// // // //             // Korttinäkymässä käytä tab-tyylistä polkua
// // // //             if (isActive) {
// // // //                 svgPaths[0].setAttribute("d", ACTIVE_PATH);
// // // //                 svgPaths[0].setAttribute("fill", "var(--bg_color_text)");
// // // //             } else {
// // // //                 svgPaths[0].setAttribute("d", INACTIVE_PATH);
// // // //                 svgPaths[0].setAttribute("fill", "var(--blended_bg_2)");
// // // //             }
// // // //         } else {
// // // //             // Jos view EI ole 'card', käytetään button-tyylistä polkua
// // // //             if (isActive) {
// // // //                 svgPaths[0].setAttribute("d", BUTTON_ACTIVE_PATH);
// // // //                 svgPaths[0].setAttribute("fill", "var(--bg_color_text)");
// // // //             } else {
// // // //                 svgPaths[0].setAttribute("d", BUTTON_INACTIVE_PATH);
// // // //                 svgPaths[0].setAttribute("fill", "var(--blended_bg_2)");
// // // //             }
// // // //         }
// // // //     });
// // // // }

// // // // import { handle_all_navigation } from '../navigation/navigation.js';
// // // // // Välilehtien tiedot (voit lisätä/poistaa omia)
// // // // const tabsData = [
// // // //     {
// // // //         id: "service_catalog",
// // // //         text: "Browse",
// // // //         langKey: "browse",
// // // //         svgPath:
// // // //             "M120-120v-560h160v-160h400v320h160v400H520v-160h-80v160H120Zm80-80h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 480h80v-80h-80v80Zm0-160h80v-80h-80v80Z",
// // // //     },
// // // //     {
// // // //         id: "create",
// // // //         text: "Create",
// // // //         langKey: "create",
// // // //         svgPath: "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z",
// // // //     },
// // // //     {
// // // //         id: "about",
// // // //         text: "About",
// // // //         langKey: "about",
// // // //         svgPath:
// // // //             "M478-240q21 0 35.5-14.5T528-290q0-21-14.5-35.5T478-340q-21 0-35.5 14.5T428-290q0 21 14.5 35.5T478-240Zm-36-154h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-12 37.5T506-526q-44 39-54 59t-10 73Zm38 314q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z",
// // // //     },
// // // // ];

// // // // //   {
// // // // //         id: "settings-content",
// // // // //         text: "Settings",
// // // // //         langKey: "settings",
// // // // //         svgPath: "m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"
// // // // //     },
// // // // //     {
// // // // //         userContent: true,
// // // // //         id: "user",
// // // // //         text: "User",
// // // // //         langKey: "user",
// // // // //         svgPath: "M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T560-640q0-33-23.5-56.5T480-720q-33 0-56.5 23.5T400-640q0 33 23.5 56.5T480-560Zm0-80Zm0 400Z"
// // // // //     },
// // // // //     {
// // // // //         userContent: true,
// // // // //         id: "logout",
// // // // //         text: "Logout",
// // // // //         langKey: "logout",
// // // // //         svgPath: "m216-160-56-56 384-384H440v80h-80v-160h233q16 0 31 6t26 17l120 119q27 27 66 42t84 16v80q-62 0-112.5-19T718-476l-40-42-88 88 90 90-262 151-40-69 172-99-68-68-266 265Zm-96-280Zm-80-120m739-80q-33 0-57-23.5T698-720q0-33 24-56.5t57-23.5q33 0 57 23.5t24 56.5q0 33-24 56.5T779-640ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Z"
// // // // //     },
// // // // //     {
// // // // //         nonUserContent: true,
// // // // //         id: "register",
// // // // //         text: "Register",
// // // // //         langKey: "register",
// // // // //         svgPath: "M720-400v-120H600v-80h120v-120h80v120h120v80H800v120h-80Zm-360-80q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM40-160v-112q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v112H40Zm80-80h480v-32q0-11-5.5-20T580-306q-54-27-109-40.5T360-360q-56 0-111 13.5T140-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T440-640q0-33-23.5-56.5T360-720q-33 0-56.5 23.5T280-640q0 33 23.5 56.5T360-560Zm0-80Zm0 400Z"
// // // // //     },
// // // // //     {
// // // // //         nonUserContent: true,
// // // // //         id: "login",
// // // // //         text: "Login",
// // // // //         langKey: "login",
// // // // //         svgPath: "M480-120v-80h280v-560H480v-80h280q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H480Zm-80-160-55-58 102-102H120v-80h327L345-622l55-58 200 200-200 200Z"
// // // // //     },

// // // // // Kontaineri, johon napit luodaan
// // // // const container = document.getElementById("navmenu");

// // // // // Polut: epäaktiivinen ja aktiivinen outline
// // // // const INACTIVE_PATH =
// // // //     "M 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 Z";
// // // // const ACTIVE_PATH =
// // // //     "M 250 0 L 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 L 250 63 L 250 0 Z";
// // // // const BUTTON_PATH =
// // // //     "M 9 7 L 231 7 A 7 7 0 0 1 238 14 L 238 49 A 7 7 0 0 1 231 56 L 9 56 A 7 7 0 0 1 2 49 L 2 14 A 7 7 0 0 1 9 7 Z"

// // // // // Luodaan jokaiselle tabille nappi
// // // // tabsData.forEach((tabData) => {
// // // //     const tabButton = document.createElement("button");
// // // //     tabButton.classList.add("navtablinks");
// // // //     tabButton.setAttribute("data-id", tabData.id);
// // // //     if (tabData.langKey) {
// // // //         tabButton.setAttribute("data-lang-key", tabData.langKey);
// // // //     }

// // // //     // Klikkaus -> kutsutaan openNavTab (vain tabData.id parametrina)
// // // //     tabButton.onclick = () => openNavTab(tabData.id);

// // // //     // Luodaan SVG+teksti tälle napille
// // // //     createSVGTabButton(tabButton, tabData.text, tabData.svgPath);

// // // //     // Lisätään DOM:iin
// // // //     container.appendChild(tabButton);
// // // // });

// // // // /**
// // // //  * Funktio, joka luo yhden SVG-painikkeen (outline + ikoni + teksti)
// // // //  */
// // // // function createSVGTabButton(tabElement, buttonText, iconPathD) {
// // // //     const svgNS = "http://www.w3.org/2000/svg";

// // // //     // Luodaan SVG-elementti
// // // //     const svg = document.createElementNS(svgNS, "svg");
// // // //     svg.setAttribute("width", "250");
// // // //     svg.setAttribute("height", "63");
// // // //     svg.setAttribute("viewBox", "-2 0 250 63");
// // // //     svg.classList.add("svg-container");

// // // //     // Taustan outline-polkuelementti
// // // //     const outlinePath = document.createElementNS(svgNS, "path");
// // // //     outlinePath.setAttribute("d", INACTIVE_PATH);
// // // //     outlinePath.setAttribute("stroke", "var(--border_color)");
// // // //     outlinePath.setAttribute("stroke-width", "2");
// // // //     outlinePath.setAttribute("fill", "var(--blended_bg_2)");
// // // //     svg.appendChild(outlinePath);

// // // //     // Ikonin polku
// // // //     const iconPath = document.createElementNS(svgNS, "path");
// // // //     iconPath.setAttribute("d", iconPathD);
// // // //     iconPath.setAttribute("fill", "var(--text_color)");
// // // //     // Esimerkki transformista:
// // // //     iconPath.setAttribute("transform", "scale(0.03, 0.03) translate(350, 1500)");
// // // //     svg.appendChild(iconPath);

// // // //     // Lisätään SVG napille
// // // //     tabElement.appendChild(svg);

// // // //     // Lisätään näkyvä teksti
// // // //     const textSpan = document.createElement("span");
// // // //     textSpan.classList.add("tab_button_text");
// // // //     textSpan.innerText = buttonText;
// // // //     tabElement.appendChild(textSpan);
// // // // }

// // // // /**
// // // //  * Klikattaessa muutetaan edellinen aktiivinen napin polku "epäaktiiviseksi"
// // // //  * ja asetetaan klikatulle napille "aktiivinen" polku, sekä merkintä active-luokasta.
// // // //  */
// // // // function openNavTab(table_name) {
// // // //     console.log(`Tab "${table_name}" clicked.`);
// // // //     handle_all_navigation(table_name);

// // // //     // Poistetaan active kaikilta napeilta
// // // //     const allTabButtons = document.getElementsByClassName("navtablinks");
// // // //     for (let i = 0; i < allTabButtons.length; i++) {
// // // //         allTabButtons[i].classList.remove("active");
// // // //         const svgPaths = allTabButtons[i].querySelectorAll("svg path");
// // // //         if (svgPaths[0]) {
// // // //             svgPaths[0].setAttribute("d", INACTIVE_PATH);
// // // //             svgPaths[0].setAttribute("fill", "var(--blended_bg_2)");
// // // //         }
// // // //     }

// // // //     // Aktivoidaan klikatun napin polku
// // // //     const clickedButton = document.querySelector(
// // // //         `.navtablinks[data-id="${table_name}"]`
// // // //     );
// // // //     if (clickedButton) {
// // // //         clickedButton.classList.add("active");
// // // //         const svgPaths = clickedButton.querySelectorAll("svg path");
// // // //         if (svgPaths[0]) {
// // // //             svgPaths[0].setAttribute("d", ACTIVE_PATH);
// // // //             svgPaths[0].setAttribute("fill", "var(--bg_color_text)");
// // // //         }
// // // //     }
// // // // }
// // // // // /* ------------------------------------------------------ */
// // // // // /*               tabs.js (muokattu)                       */
// // // // // /* ------------------------------------------------------ */

// // // // // // Säilytä tämä:
// // // // // // svgPath.setAttribute('d', "M 186 0 L 183 0 A 7 7 0 0 1 176 7 L 9 7 A 7 7 0 0 0 2 14 L 2 39 A 7 7 0 0 0 9 46 L 176 46 A 7 7 0 0 1 183 53 L 186 53 L 186 0 Z"); // Example active path
// // // // // // svgPath.setAttribute('d', "M 250 0 L 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 44 A 7 7 0 0 0 9 51 L 240 51 A 7 7 0 0 1 247 58 L 250 58 L 250 0 Z");
// // // // // // svgPath.setAttribute('d', "M 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 44 A 7 7 0 0 0 9 51 L 240 51 A 7 7 0 0 1 247 58 Z");
// // // // // // Säilytä tämä:
// // // // // // svgPath.setAttribute('d', "M 183 0 A 7 7 0 0 1 176 7 L 9 7 A 7 7 0 0 0 2 14 L 2 39 A 7 7 0 0 0 9 46 L 176 46 A 7 7 0 0 1 183 53 Z");

// // // // // const svgTransform = 'scale(0.03, 0.03) translate(350, 1500)';
// // // // // const tabsData = [
// // // // //     {
// // // // //         id: "browse",
// // // // //         text: "Browse services",
// // // // //         langKey: "services",
// // // // //         svgPath: 'M120-120v-560h160v-160h400v320h160v400H520v-160h-80v160H120Zm80-80h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 480h80v-80h-80v80Zm0-160h80v-80h-80v80Z'
// // // // //     },
// // // // //     {
// // // // //         id: "create",
// // // // //         text: "Add a new service",
// // // // //         langKey: "create",
// // // // //         svgPath: "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"
// // // // //     },
// // // // //     // Jos haluat myös questions-välilehden, ota tämä käyttöön
// // // // //     // {
// // // // //     //     id: "questions",
// // // // //     //     text: "Questions",
// // // // //     //     langKey: "questions",
// // // // //     //     svgPath: "M560-360q17 0 29.5-12.5T602-402q0-17-12.5-29.5T560-444q-17 0-29.5 12.5T518-402q0 17 12.5 29.5T560-360Zm-30-128h60q0-29 6-42.5t28-35.5q30-30 40-48.5t10-43.5q0-45-31.5-73.5T560-760q-41 0-71.5 23T446-676l54 22q9-25 24.5-37.5T560-704q24 0 39 13.5t15 36.5q0 14-8 26.5T578-596q-33 29-40.5 45.5T530-488ZM320-240q-33 0-56.5-23.5T240-320v-480q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H320Zm0-80h480v-480H320v480ZM160-80q-33 0-56.5-23.5T80-160v-560h80v560h560v80H160Zm160-720v480-480Z"
// // // // //     // },
// // // // //     {
// // // // //         id: "settings-content",
// // // // //         text: "Settings",
// // // // //         langKey: "settings",
// // // // //         svgPath: "m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"
// // // // //     },
// // // // //     {
// // // // //         userContent: true,
// // // // //         id: "user",
// // // // //         text: "User",
// // // // //         langKey: "user",
// // // // //         svgPath: "M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T560-640q0-33-23.5-56.5T480-720q-33 0-56.5 23.5T400-640q0 33 23.5 56.5T480-560Zm0-80Zm0 400Z"
// // // // //     },
// // // // //     {
// // // // //         userContent: true,
// // // // //         id: "logout",
// // // // //         text: "Logout",
// // // // //         langKey: "logout",
// // // // //         svgPath: "m216-160-56-56 384-384H440v80h-80v-160h233q16 0 31 6t26 17l120 119q27 27 66 42t84 16v80q-62 0-112.5-19T718-476l-40-42-88 88 90 90-262 151-40-69 172-99-68-68-266 265Zm-96-280Zm-80-120m739-80q-33 0-57-23.5T698-720q0-33 24-56.5t57-23.5q33 0 57 23.5t24 56.5q0 33-24 56.5T779-640ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Z"
// // // // //     },
// // // // //     {
// // // // //         nonUserContent: true,
// // // // //         id: "register",
// // // // //         text: "Register",
// // // // //         langKey: "register",
// // // // //         svgPath: "M720-400v-120H600v-80h120v-120h80v120h120v80H800v120h-80Zm-360-80q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM40-160v-112q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v112H40Zm80-80h480v-32q0-11-5.5-20T580-306q-54-27-109-40.5T360-360q-56 0-111 13.5T140-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T440-640q0-33-23.5-56.5T360-720q-33 0-56.5 23.5T280-640q0 33 23.5 56.5T360-560Zm0-80Zm0 400Z"
// // // // //     },
// // // // //     {
// // // // //         nonUserContent: true,
// // // // //         id: "login",
// // // // //         text: "Login",
// // // // //         langKey: "login",
// // // // //         svgPath: "M480-120v-80h280v-560H480v-80h280q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H480Zm-80-160-55-58 102-102H120v-80h327L345-622l55-58 200 200-200 200Z"
// // // // //     },
// // // // //     {
// // // // //         id: "about",
// // // // //         text: "About",
// // // // //         langKey: "about",
// // // // //         svgPath: "M478-240q21 0 35.5-14.5T528-290q0-21-14.5-35.5T478-340q-21 0-35.5 14.5T428-290q0 21 14.5 35.5T478-240Zm-36-154h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-12 37.5T506-526q-44 39-54 59t-10 73Zm38 314q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"
// // // // //     }
// // // // // ];

// // // // // // Set userContent and nonUserContent to localStorage
// // // // // const userContentIds = tabsData
// // // // //     .filter(tab => tab.userContent)
// // // // //     .map(tab => tab.id);

// // // // // const nonUserContentIds = tabsData
// // // // //     .filter(tab => tab.nonUserContent)
// // // // //     .map(tab => tab.id);

// // // // // // Yhdistä nonUserContentIds ja userContentIds yhdeksi nonContentIds-taulukoksi
// // // // // const nonContentIds = [...userContentIds, ...nonUserContentIds];

// // // // // // Tallenna yhdistetty lista localStorageen
// // // // // localStorage.setItem('nonContentIds', JSON.stringify(nonContentIds));

// // // // // // Luodaan kaikki tabipainikkeet navmenu-kontaineriin
// // // // // const container = document.getElementById('navmenu');
// // // // // const createButton = document.getElementById('createDynamicTab');
// // // // // let dynamicTabCount = 0;

// // // // // // Luodaan tab-painikkeet
// // // // // tabsData.forEach(tabData => {
// // // // //     const tabButton = document.createElement('button');
// // // // //     tabButton.classList.add('navtablinks', 'tab_button');
// // // // //     tabButton.setAttribute('data-id', tabData.id);

// // // // //     if (tabData.userContent) {
// // // // //         tabButton.classList.add('hidden');
// // // // //         tabButton.setAttribute('data-show-only-while-logged-in', 'true');
// // // // //     } else if (tabData.nonUserContent) {
// // // // //         tabButton.classList.add('hidden');
// // // // //         tabButton.setAttribute('data-show-only-while-logged-out', 'true');
// // // // //     }

// // // // //     tabButton.setAttribute('data-lang-key', tabData.langKey);
// // // // //     tabButton.onmousedown = (event) => openNavTab(event, tabData.id);
// // // // //     tabButton.ontouchstart = (event) => openNavTab(event, tabData.id);

// // // // //     // Lisää uusi ikoni polku: tabData.svgPath
// // // // //     createSVGTabButton(tabButton, tabData.text, tabData.svgPath, svgTransform);
// // // // //     container.appendChild(tabButton);
// // // // // });

// // // // // // Mahdollisuus luoda dynaaminen tab nappia painamalla
// // // // // if (createButton) {
// // // // //     createButton.addEventListener('click', () => {
// // // // //         dynamicTabCount++;
// // // // //         createOrOpenDynamicTab("dynamicTab" + dynamicTabCount, "Dynamic Tab #" + dynamicTabCount);
// // // // //     });
// // // // // }

// // // // // /**
// // // // //  * Luo tai avaa dynaamisesti luodun välilehden.
// // // // //  */
// // // // // function createOrOpenDynamicTab(tabId, tabText) {
// // // // //     // Katso onko välilehti jo luotu
// // // // //     if (document.getElementById(tabId)) {
// // // // //         openNavTab(null, tabId);
// // // // //         return;
// // // // //     }

// // // // //     const svgPath = "M320-280q17 0 28.5-11.5T360-320q0-17-11.5-28.5T320-360q-17 0-28.5 11.5T280-320q0 17 11.5 28.5T320-280Zm0-160q17 0 28.5-11.5T360-480q0-17-11.5-28.5T320-520q-17 0-28.5 11.5T280-480q0 17 11.5 28.5T320-440Zm0-160q17 0 28.5-11.5T360-640q0-17-11.5-28.5T320-680q-17 0-28.5 11.5T280-640q0 17 11.5 28.5T320-600Zm120 320h240v-80H440v80Zm0-160h240v-80H440v80Zm0-160h240v-80H440v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z";

// // // // //     // Luo nappi
// // // // //     const tabButton = document.createElement('button');
// // // // //     tabButton.classList.add('navtablinks', 'tab_button');
// // // // //     tabButton.setAttribute('data-id', tabId);
// // // // //     tabButton.onmousedown = (event) => openNavTab(event, tabId);
// // // // //     tabButton.ontouchstart = (event) => openNavTab(event, tabId);

// // // // //     createSVGTabButton(tabButton, tabText, svgPath, svgTransform, true);
// // // // //     container.appendChild(tabButton);

// // // // //     // Luo tab-sisältö
// // // // //     const tabContent = document.createElement('div');
// // // // //     tabContent.id = tabId;
// // // // //     tabContent.classList.add('tab-content-wrapper');
// // // // //     tabContent.innerText = `Content for ${tabText}`;
// // // // //     document.body.appendChild(tabContent);

// // // // //     // Avaa uusi välilehti
// // // // //     openNavTab(null, tabId);
// // // // // }

// // // // // /**
// // // // //  * Luo SVG-painike
// // // // //  */
// // // // // function createSVGTabButton(tabElement, buttonText, svgPath, svgTransform, isClosable = false) {
// // // // //     const svgNS = "http://www.w3.org/2000/svg";

// // // // //     // Luodaan SVG
// // // // //     const svg = document.createElementNS(svgNS, "svg");
// // // // //     svg.setAttribute("width", "250");
// // // // //     svg.setAttribute("height", "63");
// // // // //     svg.setAttribute("viewBox", "-2 0 250 63");
// // // // //     svg.classList.add('svg-container');

// // // // //     // Polku tabin "taustalle" (outline) - tässä demossa vain esimerkkinä
// // // // //     const outlinePath = document.createElementNS(svgNS, "path");
// // // // //     outlinePath.setAttribute("stroke", "var(--border_color, #333)");
// // // // //     outlinePath.setAttribute("stroke-width", "2");
// // // // //     // Outline esimerkki - voit halutessasi muokata
// // // // //     outlinePath.setAttribute("d", "M 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 Z");
// // // // //     outlinePath.setAttribute("fill", "none");

// // // // //     svg.appendChild(outlinePath);

// // // // //     // Ikonipolku
// // // // //     const iconPath = document.createElementNS(svgNS, "path");
// // // // //     iconPath.setAttribute("d", svgPath);
// // // // //     iconPath.setAttribute("fill", "var(--text_color, #000)");

// // // // //     // Sovelletaan annettua transformia
// // // // //     if (svgTransform) {
// // // // //         iconPath.setAttribute("transform", svgTransform);
// // // // //     } else {
// // // // //         iconPath.setAttribute("transform", "translate(10, 10)");
// // // // //     }

// // // // //     svg.appendChild(iconPath);
// // // // //     tabElement.appendChild(svg);

// // // // //     // Teksti
// // // // //     const buttonTextElement = document.createElement("span");
// // // // //     buttonTextElement.classList.add("tab_button_text");
// // // // //     buttonTextElement.innerText = buttonText;
// // // // //     tabElement.appendChild(buttonTextElement);

// // // // //     // Sulje-painike (vain dynaamisissa)
// // // // //     if (isClosable) {
// // // // //         const closeButton = document.createElement("button");
// // // // //         closeButton.classList.add("close-tab");
// // // // //         closeButton.innerHTML = "&times;";
// // // // //         closeButton.onclick = () => {
// // // // //             const tabId = tabElement.getAttribute('data-id');
// // // // //             const tabContent = document.getElementById(tabId);
// // // // //             if (tabContent) tabContent.remove();
// // // // //             tabElement.remove();
// // // // //         };
// // // // //         tabElement.appendChild(closeButton);
// // // // //     }
// // // // // }

// // // // // /**
// // // // //  * Avaa välilehti
// // // // //  */
// // // // // function openNavTab(evt, tabName, isDynamic = false, updateHistory = true) {
// // // // //     console.log(`openNavTab kutsuttu.`);

// // // // //     if (tabName === "defaultTabId") {
// // // // //         console.log('Opening default tab');
// // // // //         tabName = "browse";
// // // // //     }

// // // // //     // Jos tabName on "login", erikoiskäsittely (esimerkkitapaus)
// // // // //     if (tabName === 'login') {
// // // // //         var loginContent = document.getElementById('login');
// // // // //         if (loginContent) {
// // // // //             loginContent.style.display = "block";
// // // // //         }
// // // // //     }

// // // // //     // Piilota kaikki .tab-content-wrapper
// // // // //     var tabcontents = document.getElementsByClassName("tab-content-wrapper");
// // // // //     for (var i = 0; i < tabcontents.length; i++) {
// // // // //         tabcontents[i].style.display = "none";
// // // // //     }

// // // // //     // Poista active-luokka kaikilta tab-painikkeilta, aseta SVG polku takaisin
// // // // //     var tablinks = document.getElementsByClassName("navtablinks");
// // // // //     for (var j = 0; j < tablinks.length; j++) {
// // // // //         tablinks[j].classList.remove("active");
// // // // //         var svgPath = tablinks[j].querySelector('svg path');
// // // // //         if (svgPath) {
// // // // //             // Palauta 'inactive' polku
// // // // //             svgPath.setAttribute('d', "M 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 Z");
// // // // //             svgPath.setAttribute('fill', 'var(--bg_color_2, #aaa)');
// // // // //         }
// // // // //     }

// // // // //     // Tarkista onko tab-sisältö olemassa
// // // // //     var selectedContent = document.getElementById(tabName);
// // // // //     if (!selectedContent && isDynamic) {
// // // // //         createOrOpenDynamicTab(tabName, tabName);
// // // // //         return;
// // // // //     }

// // // // //     if (!selectedContent) {
// // // // //         console.warn(`Tab content for "${tabName}" not found.`);
// // // // //         return;
// // // // //     }

// // // // //     // Näytä haluttu sisältö
// // // // //     selectedContent.style.display = "block";

// // // // //     // Aseta valitun tabin nappi "active"
// // // // //     var activeTabLink = document.querySelector('.navtablinks[data-id="' + tabName + '"]');
// // // // //     console.log(`Välilehtinappia "${tabName}" klikattiin.`);
// // // // //     if (activeTabLink) {
// // // // //         activeTabLink.classList.add("active");
// // // // //         var svgPath = activeTabLink.querySelector('svg path');

// // // // //         if (svgPath) {
// // // // //             // Aseta 'active' polku
// // // // //             svgPath.setAttribute('d', "M 250 0 L 247 0 A 7 7 0 0 1 240 7 L 9 7 A 7 7 0 0 0 2 14 L 2 49 A 7 7 0 0 0 9 56 L 240 56 A 7 7 0 0 1 247 63 L 250 63 L 250 0 Z");
// // // // //             svgPath.setAttribute('fill', 'var(--bg_color_2, #ddd)');
// // // // //         }
// // // // //     }

// // // // //     // Tallenna localStorageen avattu tab
// // // // //     localStorage.setItem('lastOpenedTab', tabName);

// // // // //     // Päivitetään historiatieto (paitsi jos popstate)
// // // // //     if (updateHistory && (!evt || evt.type !== "popstate")) {
// // // // //         // history.pushState({ tab: tabName }, "", tabName);
// // // // //     }

// // // // //     // Jos ei ole "nonContentIds":n sisällä, talletetaan "lastOpenedContentTab"
// // // // //     if (!nonContentIds.includes(tabName)) {
// // // // //         localStorage.setItem('lastOpenedContentTab', tabName);
// // // // //     }
// // // // // }

// // // // // // popstate-eväntiin reagointi
// // // // // window.addEventListener('popstate', function (event) {
// // // // //     if (event.state && event.state.tab) {
// // // // //         openNavTab(event, event.state.tab);
// // // // //     }
// // // // // });

// // // // // // Julkistetaan funktio
// // // // // window.openNavTab = openNavTab;

// // // // // /**
// // // // //  * Tehdään reittikäsittely sivun latauksessa
// // // // //  */
// // // // // function handleRoute() {
// // // // //     const path = window.location.pathname.substring(1);
// // // // //     const hash = window.location.hash.substring(1);
// // // // //     let tabName = path || hash || "browse"; // Oletus "browse"

// // // // //     // Esimerkki: jos vaaditaan kirjautuminen
// // // // //     // Oletuksena false, joten ei rajoitteita
// // // // //     const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
// // // // //     const requireLogin = localStorage.getItem('requireLogin') === 'true';

// // // // //     if (requireLogin && !isLoggedIn) {
// // // // //         // ohjaa login-tabille
// // // // //         openNavTab(null, 'login', false, false);
// // // // //         return;
// // // // //     }

// // // // //     if (path === "") {
// // // // //         // Tyhjä polku -> avaa oletustab, älä päivitä URL:ää
// // // // //         openNavTab(null, tabName, false, false);
// // // // //         return;
// // // // //     }

// // // // //     openNavTab(null, tabName, false);
// // // // // }

// // // // // // Placeholder, koska koodi viittaa window.fetchAssets
// // // // // window.fetchAssets = function(page) {
// // // // //     console.log("fetchAssets called with page:", page, "(demo-funktio).");
// // // // // };

// // // // // // Sivu on ladattu -> käynnistä
// // // // // document.addEventListener('DOMContentLoaded', function () {
// // // // //     // Esimerkin vuoksi
// // // // //     window.page = 1;
// // // // //     window.fetchAssets(window.page);

// // // // //     // Käsitellään reitti
// // // // //     handleRoute();
// // // // // });
