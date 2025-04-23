// create_filter_bar_admin.js

// 1) Voit tuoda tarvittavat importit täältä,
//    esimerkiksi massapoiston, sarakehallinnan ja "embed"-napin tai sen logiikan.
import {
    createDeleteSelectedButton,
    createColumnManagementButton,
} from "../general_tables/gt_toolbar/button_factory.js";
import {
    createGenericViewSelector
} from "../table_views/draw_view_selector_buttons.js";
import { create_chat_ui } from "../../common_components/ai_features/table_chat/chat.js";
import { create_collapsible_section } from "../../common_components/collapsible-section/collapsible_section.js";

/**
 * SSE-yhteyden avaava funktio, joka asuu nyt admin-tiedostossa,
 * koska yleensä vain admin haluaa/voi ajaa tämän.
 */
function embedAllData(table_name) {
    console.log(
        `Aloitetaan SSE: /openai_embedding_stream_handler?table_name=${table_name}`
    );

    const embedLogId = `${table_name}_embed_log`;
    let embedLog = document.getElementById(embedLogId);
    if (!embedLog) {
        embedLog = document.createElement("div");
        embedLog.id = embedLogId;
        embedLog.style.border = "1px solid var(--border_color)";
        embedLog.style.padding = "0.5rem";
        embedLog.style.maxHeight = "200px";
        embedLog.style.overflowY = "auto";
        embedLog.style.marginTop = "0.5rem";
        const filterBar = document.getElementById(`${table_name}_filterBar`);
        if (filterBar) {
            filterBar.appendChild(embedLog);
        }
    }

    function appendLog(msg) {
        console.log(msg);
        const p = document.createElement("p");
        p.textContent = msg;
        embedLog.appendChild(p);
        embedLog.scrollTop = embedLog.scrollHeight;
    }

    const url = `/openai_embedding_stream_handler?table_name=${encodeURIComponent(
        table_name
    )}`;
    const evtSource = new EventSource(url);

    evtSource.addEventListener("progress", (e) => {
        appendLog(`[progress] ${e.data}`);
    });
    evtSource.addEventListener("error", (e) => {
        appendLog(`virhe serveriltä: ${e.data}`);
    });
    evtSource.addEventListener("done", (e) => {
        appendLog(`Valmis: ${e.data}`);
        evtSource.close();
    });

    evtSource.onerror = (err) => {
        console.error("SSE transport error:", err);
        appendLog("virhe: SSE-yhteys katkesi tai ei onnistu");
        evtSource.close();
    };
}

/**
 * Apunappi, jonka ainoana tarkoituksena on käynnistää edellä oleva embedAllData-funktio.
 */
function createEmbedButton(table_name) {
    const btn = document.createElement("button");
    btn.textContent = "Luo embedding";
    btn.addEventListener("click", () => {
        embedAllData(table_name);
    });
    return btn;
}

/**
 * Luodaan näkymänvalintanapit vain adminille.
 */
function createAdminViewButtons(table_name, current_view) {
    const adminViewButtons = [
        { label: "Taulunäkymä",   viewKey: "table" },
        { label: "Korttinäkymä", viewKey: "card" },
        { label: "Puunäkymä",    viewKey: "tree" },
        { label: "Lista",        viewKey: "normal" },
        { label: "Vertailu",     viewKey: "transposed" },
        { label: "Tiketti",      viewKey: "ticket" },
    ];

    return createGenericViewSelector(
        table_name,
        current_view,
        adminViewButtons
    );
}


/**
 * Jos localStoragessa on admin_mode = 'true', lisätään myös nämä ominaisuudet.
 * Nyt annamme funktiolle erikseen managementButtonsContainerin ja viewSelectorContainerin.
 */
export function appendAdminFeatures(table_name, managementButtonsContainer, viewSelectorContainer, current_view) {
    const admin_mode = localStorage.getItem("admin_mode") === "true";
    if (!admin_mode) {
        console.log("Admin mode ei päällä, skipataan admin-napit ☺");
        return;
    }

    // 1) Massapoisto
    managementButtonsContainer.appendChild(createDeleteSelectedButton(table_name, current_view));

    // 2) Sarakehallinta
    managementButtonsContainer.appendChild(createColumnManagementButton(table_name));

    // 3) "Embeditä data" -nappi
    managementButtonsContainer.appendChild(createEmbedButton(table_name));

    // 4) Näkymänvalintanapit erilliseen konttiin
    const viewSelector = createAdminViewButtons(table_name, current_view);
    viewSelectorContainer.appendChild(viewSelector);
}


export function appendChatUIIfAdmin(table_name, filter_bar) {
    const admin_mode = localStorage.getItem("admin_mode") === "true";
    if (!admin_mode) return;

    const chatContainerDiv = document.createElement("div");
    create_chat_ui(table_name, chatContainerDiv);
    const chatCollapsible = create_collapsible_section(
        "Chat – " + table_name,
        chatContainerDiv,
        false
    );
    filter_bar.appendChild(chatCollapsible);
    
}
