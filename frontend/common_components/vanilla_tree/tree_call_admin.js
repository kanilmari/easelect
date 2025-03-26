// tree_call_admin.js

import { render_tree } from "./vanilla_tree.js";
import { custom_views } from "../../core_components/admin_tools/custom_views.js";
import { handle_all_navigation } from "../../core_components/navigation/navigation.js";

/**
 * Kutsutaan vain, jos ollaan admin-tilassa. Luo ja piirtää puut, sekä hoitaa mm. drag-and-dropin.
 */
export async function initializeTreeCallAdmin() {
    // Tarkistetaan admin_mode localStoragesta
    const adminMode = localStorage.getItem("admin_mode") === "true";
    if (!adminMode) {
        console.log("Ei admin-tilassa, lopetetaan tree_call_admin.js");
        return;
    }

    // Drag-and-drop -funktio
    async function enable_drag_and_drop_for_folders_and_tables() {
        // Etsitään kaikki .node-elementit (#nav_tree)
        const all_nodes = document.querySelectorAll("#nav_tree .node");

        all_nodes.forEach((node_element) => {
            // Onko kansio
            const isFolder = node_element.getAttribute("data-is-folder") === "true";
            // Kantatietueen dbId
            const dbIdStr = node_element.getAttribute("data-db-id");

            // 1) Asetetaan raahattavuus
            node_element.setAttribute("draggable", "true");

            // 2) dragstart
            node_element.addEventListener("dragstart", (event) => {
                event.stopPropagation();
                event.dataTransfer.effectAllowed = "move";

                // Asetetaan data: node_db_id & node_type
                event.dataTransfer.setData("node_db_id", dbIdStr);
                event.dataTransfer.setData("node_type", isFolder ? "folder" : "table");

                console.log("[dragstart]", {
                    dbIdStr,
                    type: isFolder ? "folder" : "table",
                });
            });

            // 3) dragover
            node_element.addEventListener("dragover", (event) => {
                event.stopPropagation();
                // Pudotus sallitaan vain, jos *tämä* node on kansio
                if (isFolder) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                }
            });

            // 4) drop
            node_element.addEventListener("drop", async (event) => {
                event.stopPropagation();
                if (!isFolder) return; // Ei kansio -> ei tee mitään
                event.preventDefault();

                // Haetaan dataTransfer
                const draggedNodeDbIdStr = event.dataTransfer.getData("node_db_id");
                const draggedNodeType = event.dataTransfer.getData("node_type");

                // Kohdekansion db-id
                const targetFolderDbIdStr = node_element.getAttribute("data-db-id");

                // Jos yritetään pudottaa kansiota itseensä
                if (
                    draggedNodeDbIdStr === targetFolderDbIdStr &&
                    draggedNodeType === "folder"
                ) {
                    alert("Ei voi pudottaa kansiota itseensä!");
                    return;
                }

                // Muunnetaan numeroksi
                const draggedIdNum = parseInt(draggedNodeDbIdStr, 10);
                const folderIdNum = parseInt(targetFolderDbIdStr, 10);

                // Lähetetään POST /api/update-folder
                try {
                    const response = await fetch("/api/update-folder", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            item_id: draggedIdNum,
                            item_type: draggedNodeType,
                            new_folder_id: folderIdNum,
                        }),
                    });

                    if (response.ok) {
                        console.log("Tieto siirrettiin onnistuneesti!");
                        // location.reload(); // jos halutaan päivittää näkymä
                    } else {
                        const text = await response.text();
                        console.error("Virhe pudotuksessa:", text);
                        alert("Virhe siirrossa:\n" + text);
                    }
                } catch (err) {
                    console.error("Virhe fetchissä:", err);
                    alert("Virhe siirrossa (fetch-error): " + err.message);
                }
            });
        });
    }

    // Haetaan puun data
    try {
        const response = await fetch("/api/tree_data");
        if (!response.ok) {
            throw new Error("Virhe datan haussa");
        }
        const data = await response.json();

        // Tallennetaan koko vastaus localStorageen
        localStorage.setItem("full_tree_data", JSON.stringify(data));
        console.log("all tree data in local storage: ", data);

        // Kerätään taulujen table_uid + default_view_name
        const tableSpecsMap = {};
        data.nodes.forEach((node) => {
            if (node.table_uid) {
                tableSpecsMap[node.name] = {
                    table_uid: node.table_uid,
                    default_view_name: node.default_view_name,
                };
            }
        });
        localStorage.setItem("table_specs", JSON.stringify(tableSpecsMap));

        // 1) Piirretään puu
        await render_tree(data.nodes, {
            container_id: "nav_tree",
            id_suffix: "_nav",
            render_mode: "button",
            checkbox_mode: "none",
            use_icons: false,
            populate_checkbox_selection: false,
            max_recursion_depth: 32,
            tree_model: "flat",
            initial_open_level: 0,
            show_node_count: false,
            show_search: true,
            use_data_lang_key: true,
            button_action_function: async (nodeData) => {
                await handle_all_navigation(nodeData.name, custom_views);
                localStorage.setItem("selected_table", nodeData.name);
            },
        });

        // 2) Drag & drop
        await enable_drag_and_drop_for_folders_and_tables();

        // 3) Piirretään toinen puu (checkbox)
        await render_tree(data.nodes, {
            container_id: "table_selector_tree",
            id_suffix: "_table_rights",
            render_mode: "checkbox",
            checkbox_mode: "all",
            use_icons: false,
            populate_checkbox_selection: false,
            max_recursion_depth: 32,
            tree_model: "flat",
            initial_open_level: 1,
            show_node_count: true,
            show_search: true,
            use_data_lang_key: true,
        });
    } catch (error) {
        console.error("Virhe:", error);
    }
}

// // tree_call_admin.js

// import { render_tree } from "./vanilla_tree.js";
// import { custom_views } from "../../core_components/admin_tools/custom_views.js";
// import { handle_all_navigation } from "../../core_components/navigation/navigation.js";

// document.addEventListener("DOMContentLoaded", () => {
//     async function enable_drag_and_drop_for_folders_and_tables() {
//         // console.log('Enabling drag and drop for folders and tables');

//         // Etsitään kaikki .node-elementit puun sisältä (#nav_tree ID:n alta)
//         const all_nodes = document.querySelectorAll("#nav_tree .node");

//         all_nodes.forEach((node_element) => {
//             // Luetaan data-is-folder="true|false"
//             const isFolder =
//                 node_element.getAttribute("data-is-folder") === "true";
//             // Luetaan varsinainen kantarivin dbId
//             const dbIdStr = node_element.getAttribute("data-db-id");

//             // 1) Asetetaan raahattavuus kaikille solmuille
//             node_element.setAttribute("draggable", "true");

//             // 2) dragstart
//             node_element.addEventListener("dragstart", (event) => {
//                 // Estetään kupliminen, jotta ylimmän tason (vanhemman) .node ei nappaa dragstartia
//                 event.stopPropagation();

//                 // Varmuuden vuoksi: kerromme selaimelle, että haluamme move-efektin
//                 event.dataTransfer.effectAllowed = "move";

//                 // Asetetaan data: node_db_id & node_type
//                 event.dataTransfer.setData("node_db_id", dbIdStr);
//                 event.dataTransfer.setData(
//                     "node_type",
//                     isFolder ? "folder" : "table"
//                 );

//                 console.log("[dragstart]", {
//                     dbIdStr,
//                     type: isFolder ? "folder" : "table",
//                 });
//             });

//             // 3) dragover
//             node_element.addEventListener("dragover", (event) => {
//                 // Estetään kupliminen
//                 event.stopPropagation();

//                 // Pudotus sallitaan vain, jos *tämä* node on kansio
//                 if (isFolder) {
//                     event.preventDefault();
//                     event.dataTransfer.dropEffect = "move";
//                 }
//             });

//             // 4) drop
//             node_element.addEventListener("drop", async (event) => {
//                 // Estetään kupliminen
//                 event.stopPropagation();

//                 // Jos ei ole kansio, emme tee pudotusta
//                 if (!isFolder) return;
//                 event.preventDefault();

//                 // Haetaan dataTransferiin aiemmin tallennettuja arvoja
//                 const draggedNodeDbIdStr =
//                     event.dataTransfer.getData("node_db_id");
//                 const draggedNodeType = event.dataTransfer.getData("node_type");

//                 // Tämän solmun (kansion) db-id
//                 const targetFolderDbIdStr =
//                     node_element.getAttribute("data-db-id");

//                 // Vältetään pudottamasta kansiota itseensä
//                 if (
//                     draggedNodeDbIdStr === targetFolderDbIdStr &&
//                     draggedNodeType === "folder"
//                 ) {
//                     alert("Ei voi pudottaa kansiota itseensä!");
//                     return;
//                 }

//                 // Muunnetaan numeroksi
//                 const draggedIdNum = parseInt(draggedNodeDbIdStr, 10);
//                 const folderIdNum = parseInt(targetFolderDbIdStr, 10);

//                 // Lähetetään POST /api/update-folder
//                 try {
//                     const response = await fetch("/api/update-folder", {
//                         method: "POST",
//                         headers: { "Content-Type": "application/json" },
//                         body: JSON.stringify({
//                             item_id: draggedIdNum,
//                             item_type: draggedNodeType,
//                             new_folder_id: folderIdNum,
//                         }),
//                     });

//                     if (response.ok) {
//                         console.log("Tieto siirrettiin onnistuneesti!");
//                         // Jos haluat päivittää puun uudelleen:
//                         // location.reload();
//                     } else {
//                         const text = await response.text();
//                         console.error("Virhe pudotuksessa:", text);
//                         alert("Virhe siirrossa:\n" + text);
//                     }
//                 } catch (err) {
//                     console.error("Virhe fetchissä:", err);
//                     alert("Virhe siirrossa (fetch-error): " + err.message);
//                 }
//             });
//         });
//     }

//     fetch("/api/tree_data")
//         .then((response) => {
//             if (!response.ok) {
//                 throw new Error("Virhe datan haussa");
//             }
//             return response.json();
//         })
//         .then(async (data) => {
//             // *** UUSI KOODI: tallennetaan koko vastaus localStorageen
//             localStorage.setItem("full_tree_data", JSON.stringify(data));
//             console.log("all tree data in local storage: ", data);

//             // *** UUSI KOODI: kerätään taulujen table_uid + default_view_name ja tallennetaan localStorageen
//             const tableSpecsMap = {};
//             data.nodes.forEach((node) => {
//                 if (node.table_uid) {
//                     tableSpecsMap[node.name] = {
//                         table_uid: node.table_uid,
//                         default_view_name: node.default_view_name,
//                     };
//                 }
//             });
//             localStorage.setItem("table_specs", JSON.stringify(tableSpecsMap));

//             // 1) Piirretään admin-nappipuu (huom! parametrina data.nodes)
//             await render_tree(data.nodes, {
//                 container_id: "nav_tree",
//                 id_suffix: "_nav",
//                 render_mode: "button",
//                 checkbox_mode: "none",
//                 use_icons: false,
//                 populate_checkbox_selection: false,
//                 max_recursion_depth: 32,
//                 tree_model: "flat",
//                 initial_open_level: 0,
//                 show_node_count: false,
//                 show_search: true,
//                 use_data_lang_key: true,
//                 button_action_function: async (nodeData) => {
//                     await handle_all_navigation(nodeData.name, custom_views);
//                     localStorage.setItem("selected_table", nodeData.name);
//                 },
//             });

//             // 2) Kun puu on valmis, otetaan drag & drop käyttöön
//             await enable_drag_and_drop_for_folders_and_tables();

//             // 3) Piirretään toinen puu "table_selector_tree" checkbox-tilalla (jälleen data.nodes)
//             await render_tree(data.nodes, {
//                 container_id: "table_selector_tree",
//                 id_suffix: "_table_rights",
//                 render_mode: "checkbox",
//                 checkbox_mode: "all",
//                 use_icons: false,
//                 populate_checkbox_selection: false,
//                 max_recursion_depth: 32,
//                 tree_model: "flat",
//                 initial_open_level: 1,
//                 show_node_count: true,
//                 show_search: true,
//                 use_data_lang_key: true,
//             });
//         })
//         .catch((error) => {
//             console.error("Virhe:", error);
//         });
// });
