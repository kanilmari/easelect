// auth_modes.js

import { count_this_function } from "../dev_tools/function_counter.js";
import { endpoint_router } from "../endpoints/endpoint_router.js";

export async function setAuthModes() {
    count_this_function("setAuthModes");
    try {
        // Haetaan /api/auth-modes (tai jokin vastaava reitti, joka palauttaa { admin_mode: bool, needs_button: "login"|"logout" })
        const data = await endpoint_router("fetchAuthModes", { method: "GET" });

        console.log('admin_mode:', data.admin_mode, 'needs_button:', data.needs_button);
        // data.admin_mode oletetaan booleaniksi
        if (data && typeof data.admin_mode === "boolean") {
            localStorage.setItem("admin_mode", data.admin_mode ? "true" : "false");
        } else {
            console.warn("admin_mode tietoa ei saatu tai se ei ole boolean.");
        }

        // data.needs_button on "login" tai "logout"
        if (data && typeof data.needs_button === "string") {
            localStorage.setItem("button_state", data.needs_button); 
        } else {
            console.warn("needs_button tietoa ei saatu tai se ei ole merkkijono.");
        }

        console.log("Auth modes tallennettu:", data);
        
    } catch (err) {
        console.error("Virhe auth modes -tarkistuksessa:", err);
    }
}

// Palauttaa true/false sen mukaan, onko admin_mode päällä
export function checkAdminMode() {
    const adminModeValue = localStorage.getItem("admin_mode");
    if (adminModeValue === null) {
        throw new Error("admin_mode not found in localStorage");
    }
    return adminModeValue === "true";
}

// Palauttaa "login" tai "logout" (tai heittää virheen, jos arvoa ei ole)
export function getButtonState() {
    const buttonState = localStorage.getItem("button_state");
    if (!buttonState) {
        throw new Error("button_state not found in localStorage");
    }
    return buttonState; // "login" tai "logout"
}