// auth_svg.js

import { getButtonState } from "../admin_tools/auth_modes.js";

var login_icon_svg = `
<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 -960 960 960" fill="var(--text_color)">
  <path d="M480-120v-80h280v-560H480v-80h280q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H480Zm-80-160-55-58 102-102H120v-80h327L345-622l55-58 200 200-200 200Z"/>
</svg>
`;

var logout_icon_svg = `
<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 -960 960 960" fill="var(--text_color)">
  <path d="m216-160-56-56 384-384H440v80h-80v-160h233q16 0 31 6t26 17l120 119q27 27 66 42t84 16v80q-62 0-112.5-19T718-476l-40-42-88 88 90 90-262 151-40-69 172-99-68-68-266 265Zm-96-280Zm-80-120m739-80q-33 0-57-23.5T698-720q0-33 24-56.5t57-23.5q33 0 57 23.5t24 56.5q0 33-24 56.5T779-640ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Z"/>
</svg>
`;

/**
 * Alustaa logout- tai login-napin (riippuen siitä, onko button_state "login" vai "logout").
 */
// auth_svg.js
export function initAuthSvg() {
    const container = document.querySelector(".auth-container");
    if (!container) {
        console.log("auth_svg.js: .auth-container elementtiä ei löytynyt!");
        return;
    }

    let buttonState;
    try {
        // Haetaan buttonState suoraan auth_modes.js:stä
        buttonState = getButtonState(); // Palauttaa "login" tai "logout"
    } catch (err) {
        console.warn("initAuthSvg: button_state puuttuu tai virhe haussa:", err);
        return;
    }

    // Valitaan oikea SVG
    const iconString = buttonState === "login" ? login_icon_svg : logout_icon_svg;

    // Muodostetaan DOMParserilla
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(iconString, "image/svg+xml");
    const parsedSvg = svgDoc.documentElement;

    // Luodaan itse nappi
    const theButton = document.createElement("button");
    theButton.id = buttonState === "login" ? "login_button" : "logout_button";

    // Lisätään SVG
    theButton.replaceChildren(parsedSvg);
    console.log("drawing button named: ", theButton.id);

    // Korvataan .auth-containerin sisältö
    container.replaceChildren(theButton);

    // Klikkaus → ohjataan /login- tai /logout‑reitille
    theButton.addEventListener("click", async () => {
        if (buttonState === "login") {
            window.location.assign("/login");
            return;
        }

        /* -------------- logout: tehdään mahdollisimman kattava puhdistus -------------- */
        try {
            // 1. Tyhjennetään localStorage ja sessionStorage
            localStorage.clear();
            sessionStorage.clear();

            // 2. Poistetaan mahdolliset Service Worker ‑välimuistit
            if ("caches" in window) {
                const cacheKeys = await caches.keys();
                await Promise.all(cacheKeys.map((key) => caches.delete(key)));
            }

            // 3. Yritetään tyhjentää omat evästeet (domain- ja path‑rajoitukset huomioiden)
            document.cookie
                .split(";")
                .forEach((cookie) => {
                    const eqPos = cookie.indexOf("=");
                    const name = eqPos > -1 ? cookie.substring(0, eqPos) : cookie;
                    // yksinkertainen poisto; lisäpolut kannattaa käsitellä back‑endissä
                    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
                });

            console.log("logout: localStorage, sessionStorage, caches ja evästeet tyhjennetty ✨");
        } catch (err) {
            console.warn("logout: siivous epäonnistui:", err);
        }

        /* --------------------------------------------------------------------------- */

        window.location.assign("/logout");
    });
}
