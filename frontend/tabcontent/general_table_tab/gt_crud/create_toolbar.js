// create_toolbar.js

import {
    createAddRowButton,
    createDeleteSelectedButton,
    createViewSelectorDropdown,
    createColumnVisibilityDropdownButton,
    createColumnManagementButton
} from '../headerbuttons/button_factory.js';

import { delete_selected_items } from './gt_delete/delete_rows.js';

// Jos haluat joskus avata GPT-lause-funktioita:
// import { open_prompt_modal_for_table } from '../../../common_actions/openai/openai_sql_modal.js';

function insertWbrForUnderscores(str) {
    return str.replaceAll("_", "_<wbr>");
}

async function fetchRowCount(table_name) {
    try {
        const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
            method: 'GET',
            credentials: 'include'
        });
        if (!resp.ok) {
            throw new Error(`error (status: ${resp.status})`);
        }
        const data = await resp.json();
        if (data && typeof data.row_count === 'number') {
            return data.row_count;
        } else {
            throw new Error("row_count missing in response");
        }
    } catch (error) {
        console.error("virhe fetchRowCount-funktiossa:", error);
        return null;
    }
}

/**
 * Luo / päivittää toolbarin annettua taulua varten.
 */
export function createToolbar(table_name, current_view) {
    let toolbar = document.getElementById(`${table_name}_toolbar`);
    const table_parts_container = document.getElementById(`${table_name}_table_parts_container`);

    if (!table_parts_container) {
        console.error(`Taulun parts-konttia ${table_name}_table_parts_container ei löydy.`);
        return;
    }

    if (toolbar) {
        // Päivitetään olemassaolevaa toolbaria...
        // (Siirrä tai hae napit täältä, jos haluat muokata niitä dynaamisesti)
    } else {
        // Luodaan toolbar ensimmäistä kertaa
        toolbar = document.createElement('div');
        toolbar.id = `${table_name}_toolbar`;
        toolbar.classList.add('toolbar');

        // Otsikko
        const langKeyElement = document.createElement('div');
        langKeyElement.setAttribute('data-lang-key', table_name);
        langKeyElement.innerHTML = insertWbrForUnderscores(table_name);
        langKeyElement.style.fontWeight = 'bold';
        toolbar.appendChild(langKeyElement);

        // Näytön nimi monospace-fontilla
        const tableNameText = document.createElement('div');
        tableNameText.innerHTML = insertWbrForUnderscores(table_name);
        tableNameText.style.fontSize = '14px';
        tableNameText.style.fontFamily = 'monospace';
        toolbar.appendChild(tableNameText);

        // Rivilaskuri
        const rowCountElement = document.createElement('div');
        rowCountElement.classList.add(`${table_name}_row_count`);
        rowCountElement.textContent = "Rows: ...";
        toolbar.appendChild(rowCountElement);

        fetchRowCount(table_name).then(count => {
            if (count !== null) {
                rowCountElement.textContent = `Rows: ${count}`;
            } else {
                rowCountElement.textContent = 'Rows: ?';
            }
        });

        // Näkymävalikko
        const viewSelector = createViewSelectorDropdown(table_name, current_view);
        toolbar.appendChild(viewSelector);

        // Lisää rivi
        toolbar.appendChild(createAddRowButton(table_name));

        // Kenttien hallinta
        toolbar.appendChild(createColumnManagementButton(table_name));

        // Poista valitut
        const deleteBtn = createDeleteSelectedButton(table_name, current_view);
        toolbar.appendChild(deleteBtn);

        // Sarakenäkyvyys-dropdown vain table-näkymälle
        if (current_view === 'table') {
            const columnVisibilityDropdown = createColumnVisibilityDropdownButton(table_parts_container);
            if (columnVisibilityDropdown) {
                toolbar.appendChild(columnVisibilityDropdown);
            }
        }


        // OpenAI Embedding -nappi
        const openaiEmbeddingButton = document.createElement('button');
        openaiEmbeddingButton.textContent = 'OpenAI-Embed';
        openaiEmbeddingButton.classList.add('openai_embedding_button');
        openaiEmbeddingButton.addEventListener('click', () => {
            console.log("Aloitetaan embedding SSE:", table_name);
            const evtSource = new EventSource(`/openai_embedding_stream_handler?table_name=${table_name}`);

            evtSource.addEventListener("progress", (event) => {
                console.log("SSE progress:", event.data);
                // Voit näyttää nämä esim. jossain log-ikkunassa
            });

            evtSource.addEventListener("error", (event) => {
                console.error("SSE error:", event);
                // Joissain tapauksissa event.data voi olla tyhjä
            });

            evtSource.addEventListener("done", (event) => {
                console.log("SSE done:", event.data);
                evtSource.close();
                // Halutessasi hae uudelleen rivimäärä:
                // fetchRowCount(table_name).then(...) ...
            });
        });
        toolbar.appendChild(openaiEmbeddingButton);


        // Lisätään toolbar DOM-puuhun
        table_parts_container.insertBefore(toolbar, table_parts_container.firstChild);
    }
}

/**
 * Yksinkertainen apu, jos haluamme korvata eventListenerin
 * "on the fly" kadottamatta sen ulkonäköä.
 */
export function replaceEventListener(element, event, newListener) {
    if (!element) return;
    const oldElement = element.cloneNode(true);
    element.parentNode.replaceChild(oldElement, element);
    oldElement.addEventListener(event, newListener);
}
