/* chat.js */

import { generate_table } from '../../../core_components/table_views/view_table.js';

// Mapit keskustelun hallintaan
let conversation_map = new Map();
let user_message_history_map = new Map();
let user_history_index_map = new Map();

/**
 * Avaa SSE-yhteyden GPT-keskustelua varten.
 */
function start_gpt_stream(table_name, user_message) {
    const conversation = conversation_map.get(table_name) || [];
    const conversation_json = JSON.stringify(conversation);
    const encoded_conversation = encodeURIComponent(conversation_json);

    const queryParams = new URLSearchParams({
        table_name: table_name,
        user_message: user_message,
        conversation: encoded_conversation
    }).toString();

    const url = `/openai_chat_stream_handler?${queryParams}`;
    const evtSource = new EventSource(url);

    let finalContent = "";
    let partial_bubble = null;
    let partial_text_elem = null;

    const chat_container = document.getElementById(`${table_name}_chat_container`);

    evtSource.addEventListener("chunk", (e) => {
        const chunk = e.data;
        if (!chunk.trim()) {
            return;
        }
        finalContent += chunk;
        if (!partial_bubble) {
            partial_bubble = document.createElement('div');
            partial_bubble.classList.add('chat-bubble', 'chat-bubble-assistant');
            partial_text_elem = document.createElement('div');
            partial_text_elem.classList.add('chat-text');
            partial_bubble.appendChild(partial_text_elem);

            if (chat_container) {
                chat_container.appendChild(partial_bubble);
            }
        }
        if (partial_text_elem) {
            partial_text_elem.textContent += chunk;
        }
        if (chat_container) {
            setTimeout(() => {
                chat_container.scrollTop = chat_container.scrollHeight;
            }, 0);
        }
    });

    evtSource.addEventListener("sql_result", (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.columns && data.rows) {
                console.log(`Immediate SELECT: ${data.columns.length} column(s), ${data.rows.length} row(s)`);
                console.table(data.rows);
                console.log('chat.js: start_gpt_stream kutsuu funktiota generate_table');
                generate_table(table_name, data.columns, data.rows, []);
            } else if (data.rows_affected !== undefined) {
                console.log(`Immediate exec OK. Rows affected: ${data.rows_affected}`);
            }
        } catch (err) {
            console.error("Error parsing SQL result:", err);
        }
    });

    // Tämäkään ei luo kahta erillistä chat kuplaa, vaan yhden:
    evtSource.addEventListener("done", (e) => {
        evtSource.close();

        // Poistetaan keskeneräinen partial-bubble, jos sellainen on
        if (partial_bubble && chat_container) {
            chat_container.removeChild(partial_bubble);
            partial_bubble = null;
            partial_text_elem = null;
        }

        try {
            // Jäsennetään JSON-vastaus
            const parsed = JSON.parse(e.data);
            const friendly = parsed.friendly_explanation || "(Ei selitystä saatavilla)";
            const pureSql = parsed.valid_sql || "";

            // 1. Näytetään ystävällinen selitys erillisenä viestinä
            if (friendly.trim()) {
                add_to_conversation(table_name, {
                    role: "assistant",
                    content: friendly
                });
                append_chat_message(table_name, "assistant", friendly, "");
            }

            // 2. Näytetään SQL-kysely erillisenä viestinä, jos sellainen on
            if (pureSql.trim()) {
                add_to_conversation(table_name, {
                    role: "assistant",
                    content: "SQL: " + pureSql
                });
                append_chat_message(table_name, "assistant", "Tässä on luomani SQL-kysely:", pureSql);
            }

        } catch (err) {
            console.error("JSON-parsing error:", err);
            // Fallback: näytetään raaka vastaus yhtenä viestinä, jos jäsentäminen epäonnistuu
            add_to_conversation(table_name, { role: "assistant", content: finalContent });
            append_chat_message(table_name, "assistant", finalContent, "");
        }

        // Varmistetaan, että chat vieritetään alas
        if (chat_container) {
            setTimeout(() => {
                chat_container.scrollTop = chat_container.scrollHeight;
            }, 0);
        }
    });


    evtSource.addEventListener("error", (e) => {
        console.error("sse error:", e);
        evtSource.close();
        append_chat_message(table_name, "error", "virhe SSE-yhteydessä", "");
    });

    evtSource.addEventListener("sql_mode_error", (e) => {
        const errMsg = e.data || "";
        console.error("sql_mode_error SSE:", errMsg);
        evtSource.close();

        // Tarkistetaan, onko syy se, että chat on vain luku -tilassa:
        if (errMsg.includes("select_only")) {
            // Käyttäjä yritti INSERT/UPDATE/DELETE, mutta config on read only
            append_chat_message(table_name, "error",
                "Unfortunately, we couldn't process your request. Please try again later.",
                ""
            );
        } else {
            // Näytetään joku yleisvirhe
            append_chat_message(table_name, "error", "Palvelin antoi virheen: " + errMsg, "");
        }
    });
}

/**
 * Avaa SSE-yhteyden vain SQL-lauseen ajamista varten. 
 * Tätä kutsutaan “Aja SQL” -napista confirmin jälkeen.
 */
function start_immediate_sql_sse(table_name, sql_code) {
    const queryParams = new URLSearchParams({
        table_name: table_name,
        run_sql: sql_code // TAI muu param. Palvelinpuolen pitää tunnistaa tämä
    }).toString();

    const url = `/openai_chat_stream_handler?${queryParams}`;
    const evtSource = new EventSource(url);

    let partial_bubble = null;
    let partial_text_elem = null;

    const chat_container = document.getElementById(`${table_name}_chat_container`);

    evtSource.addEventListener("chunk", (e) => {
        // esim. jos palvelin haluaa lähettää chunk -tyylistä dataa
        const chunk = e.data;
        if (!chunk.trim()) {
            return;
        }

        if (!partial_bubble) {
            partial_bubble = document.createElement('div');
            partial_bubble.classList.add('chat-bubble', 'chat-bubble-assistant');
            partial_text_elem = document.createElement('div');
            partial_text_elem.classList.add('chat-text');
            partial_bubble.appendChild(partial_text_elem);

            if (chat_container) {
                chat_container.appendChild(partial_bubble);
            }
        }
        if (partial_text_elem) {
            partial_text_elem.textContent += chunk;
        }
        if (chat_container) {
            setTimeout(() => {
                chat_container.scrollTop = chat_container.scrollHeight;
            }, 0);
        }
    });

    evtSource.addEventListener("sql_result", (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.columns && data.rows) {
                const info_msg = `Immediate SELECT: ${data.columns.length} column(s), ${data.rows.length} row(s)`;
                append_chat_message(table_name, "assistant", info_msg, "");
                generate_table(table_name, data.columns, data.rows, []);
            } else if (data.rows_affected !== undefined) {
                const info_msg = `Immediate exec OK. Rows affected: ${data.rows_affected}`;
                append_chat_message(table_name, "assistant", info_msg, "");
            }
        } catch (err) {
            console.error(err);
        }
    });

    evtSource.addEventListener("done", (e) => {
        console.log(e);
        evtSource.close();
        if (partial_bubble && chat_container) {
            chat_container.removeChild(partial_bubble);
        }
        partial_bubble = null;
        partial_text_elem = null;
    });

    evtSource.addEventListener("error", (e) => {
        console.error("sse sql error:", e);
        evtSource.close();
        append_chat_message(table_name, "error", "virhe SQL-SSE-yhteydessä", "");
    });
}

// ---- Chat UI:n luonti ----
export function create_chat_ui(table_name, parent_element) {
    if (!parent_element) {
        console.error(`error: parent_element puuttuu create_chat_ui-funktiolle (table: ${table_name})`);
        return;
    }
    if (document.getElementById(`${table_name}_chat_wrapper`)) {
        return;
    }

    const chat_ui_wrapper = document.createElement('div');
    chat_ui_wrapper.id = `${table_name}_chat_wrapper`;
    chat_ui_wrapper.classList.add('chat_wrapper');

    const chat_container_full = document.createElement('div');

    // const chat_title = document.createElement('h3');
    // chat_title.textContent = `Chat (taulu: ${table_name})`;
    // chat_container_full.appendChild(chat_title);

    const chat_container = document.createElement('div');
    chat_container.id = `${table_name}_chat_container`;
    chat_container.classList.add('chat_container');
    chat_container_full.appendChild(chat_container);

    const chat_input = document.createElement('input');
    chat_input.id = `${table_name}_chat_input`;
    chat_input.type = 'text';
    chat_input.placeholder = 'Kirjoita kysymys...';

    chat_input.addEventListener('keydown', (event) => {
        const user_history = user_message_history_map.get(table_name) || [];
        let user_history_index = user_history_index_map.get(table_name) || user_history.length;
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (user_history.length > 0) {
                user_history_index = Math.max(0, user_history_index - 1);
                chat_input.value = user_history[user_history_index] || '';
                user_history_index_map.set(table_name, user_history_index);
            }
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (user_history.length > 0) {
                user_history_index = Math.min(user_history.length, user_history_index + 1);
                if (user_history_index === user_history.length) {
                    chat_input.value = '';
                } else {
                    chat_input.value = user_history[user_history_index];
                }
                user_history_index_map.set(table_name, user_history_index);
            }
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const send_btn = document.getElementById(`${table_name}_chat_sendBtn`);
            if (send_btn) send_btn.click();
        }
    });

    const chat_send_btn = document.createElement('button');
    chat_send_btn.id = `${table_name}_chat_sendBtn`;
    chat_send_btn.textContent = 'Lähetä (SSE)';

    const clear_history_btn = document.createElement('button');
    clear_history_btn.textContent = 'Poista historia';
    clear_history_btn.addEventListener('click', () => {
        console.log(`poistetaan historia localStoragesta taululle: ${table_name}`);
        localStorage.removeItem(`gptChatConversation_${table_name}`);
        conversation_map.set(table_name, []);
        user_message_history_map.set(table_name, []);
        user_history_index_map.set(table_name, 0);

        if (chat_container) {
            chat_container.replaceChildren();
        }
    });

    const chat_input_row = document.createElement('div');
    chat_input_row.appendChild(chat_input);
    chat_input_row.appendChild(chat_send_btn);
    chat_input_row.appendChild(clear_history_btn);

    chat_container_full.appendChild(chat_input_row);
    chat_ui_wrapper.appendChild(chat_container_full);
    parent_element.appendChild(chat_ui_wrapper);

    // nappi -> SSE-linja
    chat_send_btn.addEventListener('click', () => {
        const user_message = chat_input.value.trim();
        if (!user_message) return;
        append_chat_message(table_name, 'user', user_message, '');
        add_to_conversation(table_name, { role: 'user', content: user_message });
        add_to_user_history(table_name, user_message);
        chat_input.value = '';
        start_gpt_stream(table_name, user_message);
    });

    load_conversation_from_local_storage(table_name);
}

// ----- Yleisviestin näyttäminen chatissa -----
export function append_chat_message(table_name, sender, friendly_explanation, sql_code) {
    const chat_container = document.getElementById(`${table_name}_chat_container`);
    if (!chat_container) return;

    const message_div = document.createElement('div');
    message_div.classList.add('chat-bubble');

    if (sender === 'user') {
        message_div.classList.add('chat-bubble-user');
    } else if (sender === 'assistant') {
        message_div.classList.add('chat-bubble-assistant');
    } else if (sender === 'error') {
        message_div.classList.add('chat-bubble-error');
    }

    const text_elem = document.createElement('div');
    text_elem.classList.add('chat-text');
    text_elem.textContent = friendly_explanation;
    message_div.appendChild(text_elem);

    // Jos haluat näyttää SQL:n ja ajaa sen SSE:llä
    if (sql_code && sql_code.trim() !== '') {
        const toggle_button = document.createElement('button');
        toggle_button.textContent = 'Näytä SQL-koodi';
        toggle_button.style.marginTop = '5px';
        toggle_button.style.fontSize = '0.9em';

        const sql_code_container = document.createElement('pre');
        sql_code_container.textContent = sql_code;
        sql_code_container.style.padding = '10px';
        sql_code_container.style.border = '1px solid var(--table_border_color)';
        sql_code_container.style.display = 'none';
        sql_code_container.style.overflowX = 'auto';

        toggle_button.addEventListener('click', () => {
            if (sql_code_container.style.display === 'none') {
                sql_code_container.style.display = 'block';
                toggle_button.textContent = 'Piilota SQL-koodi';
            } else {
                sql_code_container.style.display = 'none';
                toggle_button.textContent = 'Näytä SQL-koodi';
            }
        });

        message_div.appendChild(toggle_button);
        message_div.appendChild(sql_code_container);

        // Jos lause ei ala SELECT:llä, näytetään Aja SQL -nappi
        // Varmistus "Oletko varma...?" ennen ajoa
        const upper = sql_code.trim().toUpperCase();
        if (!upper.startsWith('SELECT')) {
            const execute_button = document.createElement('button');
            execute_button.textContent = 'Aja SQL';
            execute_button.style.marginTop = '5px';
            execute_button.style.marginLeft = '10px';
            execute_button.style.fontSize = '0.9em';

            execute_button.addEventListener('click', () => {
                const confirm_run = confirm('Oletko varma, että haluat ajaa tämän SQL-lauseen?');
                if (!confirm_run) {
                    return;
                }
                // Käytetään SSE:hen perustuvaa funktiota
                start_immediate_sql_sse(table_name, sql_code);
            });
            message_div.appendChild(execute_button);
        }
    }

    chat_container.appendChild(message_div);
    setTimeout(() => {
        chat_container.scrollTop = chat_container.scrollHeight;
    }, 0);
}

// Tallennus
function add_to_conversation(table_name, msg) {
    if (!conversation_map.has(table_name)) {
        conversation_map.set(table_name, []);
    }
    const conv = conversation_map.get(table_name);
    conv.push(msg);
    conversation_map.set(table_name, conv);
    save_conversation_to_local_storage(table_name);
}

function add_to_user_history(table_name, user_message) {
    if (!user_message_history_map.has(table_name)) {
        user_message_history_map.set(table_name, []);
    }
    const history = user_message_history_map.get(table_name);
    history.push(user_message);
    user_message_history_map.set(table_name, history);
    user_history_index_map.set(table_name, history.length);
}

function save_conversation_to_local_storage(table_name) {
    try {
        const conv = conversation_map.get(table_name) || [];
        localStorage.setItem(`gptChatConversation_${table_name}`, JSON.stringify(conv));
    } catch (e) {
        console.error('virhe tallennettaessa localStorageen:', e);
    }
}

function load_conversation_from_local_storage(table_name) {
    try {
        const stored_conv = localStorage.getItem(`gptChatConversation_${table_name}`);
        if (stored_conv) {
            const parsed = JSON.parse(stored_conv);
            conversation_map.set(table_name, parsed);

            const chat_container = document.getElementById(`${table_name}_chat_container`);
            if (!chat_container) return;
            chat_container.replaceChildren();

            parsed.forEach(msg => {
                if (msg.role === 'user') {
                    add_to_user_history(table_name, msg.content);
                }
                append_chat_message(table_name, msg.role, msg.content, '');
            });

            const user_history = user_message_history_map.get(table_name) || [];
            user_history_index_map.set(table_name, user_history.length);

        } else {
            // Aloitusviesti
            conversation_map.set(table_name, []);
            user_message_history_map.set(table_name, []);
            user_history_index_map.set(table_name, 0);

            append_chat_message(table_name, 'assistant', 'Hei, tervetuloa SSE-chatiin! 🤗 Kysy vapaasti...', '');
            const chat_container = document.getElementById(`${table_name}_chat_container`);
            if (chat_container) {
                const last_bubble = chat_container.lastElementChild;
                if (last_bubble) {
                    last_bubble.setAttribute('data-lang-key', 'chat_welcome_message');
                }
            }
        }
    } catch (e) {
        console.error('virhe ladattaessa localStoragesta:', e);
    }
}