// admin_mode.js
// (poistettu suora setAdminMode()-kutsu tiedoston lopusta)

import { endpoint_router } from "../endpoints/endpoint_router.js";

export async function setAdminMode() {
    try {
        const data = await endpoint_router("fetchAdminMode", { method: "GET" });
        if (data && typeof data.admin_mode === "boolean") {
            localStorage.setItem(
                "admin_mode",
                data.admin_mode ? "true" : "false"
            );
            console.log("Admin_mode tallennettu:", data.admin_mode);
        } else {
            console.warn("admin_mode tietoa ei tullut");
        }
    } catch (err) {
        console.error("Virhe admin moden tarkistuksessa:", err);
    }
}

export function checkAdminMode() {
    const adminModeValue = localStorage.getItem("admin_mode");
    if (adminModeValue === null) {
        throw new Error("admin_mode not found in localStorage");
    }
    return adminModeValue === "true";
}