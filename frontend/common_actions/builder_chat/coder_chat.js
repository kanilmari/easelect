// coder_chat.js
import { createContentFromData } from './chat_functions.js';
/* ----------------------------------------
   1) Draggable-ikkunan luontifunktio
---------------------------------------- */
export function create_draggable_window(window_id, title, content_callback) {
  // Tarkista, onko jo olemassa
  if (document.getElementById(window_id)) {
      // Palautetaan vanha ikkuna näkyviin
      const existing_window = document.getElementById(window_id);
      existing_window.style.display = 'grid';
      return existing_window;
  }
  
  // Luodaan pääelementti
  const window_elem = document.createElement('div');
  window_elem.classList.add('draggable-window');
  window_elem.id = window_id;

  // Otsikkopalkki
  const header_elem = document.createElement('div');
  header_elem.classList.add('draggable-window-header');
  header_elem.innerHTML = `<span>${title}</span>`;

  // Sulkunappi
  const close_btn = document.createElement('button');
  close_btn.textContent = '×';
  close_btn.classList.add('draggable-window-close-btn');
  close_btn.addEventListener('click', () => {
      window_elem.remove();
  });
  header_elem.appendChild(close_btn);

  // Sisältöalue
  const content_elem = document.createElement('div');
  content_elem.classList.add('draggable-window-content');

  // Käytetään callbackia sisällön täyttöön
  if (typeof content_callback === 'function') {
      content_callback(content_elem);
  }

  // Liitetään DOMiin
  window_elem.appendChild(header_elem);
  window_elem.appendChild(content_elem);
  document.body.appendChild(window_elem);

  // --- Draggable-toiminnallisuuden logiikka ---
  let offsetX = 0;
  let offsetY = 0;
  let is_down = false;

  header_elem.addEventListener('mousedown', (e) => {
      is_down = true;
      offsetX = e.clientX - window_elem.offsetLeft;
      offsetY = e.clientY - window_elem.offsetTop;
      // Tuodaan ikkuna etualalle
      window_elem.style.zIndex = '9999';
  });

  document.addEventListener('mousemove', (e) => {
      if (!is_down) return;
      e.preventDefault(); // estää tekstin valinnan
      let newX = e.clientX - offsetX;
      let newY = e.clientY - offsetY;
      window_elem.style.left = newX + 'px';
      window_elem.style.top = newY + 'px';
  });

  document.addEventListener('mouseup', () => {
      is_down = false;
  });

  return window_elem;
}


/* ----------------------------------------
 2) SSE-koodichatin logiikka
---------------------------------------- */

let conversation_map_code = new Map();
let user_message_history_map_code = new Map();
let user_history_index_map_code = new Map();

function start_code_editor_stream(chat_id, user_message) {
  const conversation = conversation_map_code.get(chat_id) || [];
  const conversation_json = JSON.stringify(conversation);
  const encoded_conversation = encodeURIComponent(conversation_json);

  // Kutsutaan SSE-handleriä:
  const url = `/openai_code_editor_stream_handler?user_message=${encodeURIComponent(user_message)}&conversation=${encoded_conversation}`;
  const evtSource = new EventSource(url);

  let finalContent = "";
  let partial_bubble = null;
  let partial_text_elem = null;

  const chat_container = document.getElementById(`${chat_id}_chat_container`);

  evtSource.addEventListener("chunk", (e) => {
    console.log("chunk event received: ", e.data); // <- debug
    const chunk = e.data;
    if (!chunk.trim()) return;
    finalContent += chunk;

    if (!partial_bubble) {
      partial_bubble = document.createElement('div');
      partial_bubble.classList.add('chat-bubble', 'chat-bubble-assistant');

      partial_text_elem = document.createElement('div');
      partial_text_elem.classList.add('chat-text');
      partial_bubble.appendChild(partial_text_elem);

      chat_container.appendChild(partial_bubble);
    }
    partial_text_elem.textContent += chunk;

    //odotetaan n ms
    setTimeout(() => {
      chat_container.scrollTop = chat_container.scrollHeight;
    }, 0);
  });

  evtSource.addEventListener("done", (e) => {
    evtSource.close();
    // Poistetaan streamauksen aikainen "partial" bubble
    if (partial_bubble && chat_container) {
      chat_container.removeChild(partial_bubble);
      partial_bubble = null;
      partial_text_elem = null;
    }
    // Nyt finalContent sisältää kaikki chunkit
    let final_text = finalContent.trim();
    // Jos finalContent on tyhjä, käytetään SSE:n "done"-eventin dataa
    if (!final_text) {
      final_text = e.data;
    }
    // Lisätään lopullinen viesti chat-lokiin
    add_to_conversation_code(chat_id, { role: "assistant", content: final_text });
    append_chat_message_code(chat_id, "assistant", final_text);
  });

  evtSource.addEventListener("error", (e) => {
    console.error("sse error:", e);
    evtSource.close();
    append_chat_message_code(chat_id, "error", "virhe SSE-yhteydessä");
  });
}

export function create_code_chat_ui(chat_id, parent_element) {
  if (!parent_element) {
    console.error(`error: parent_element puuttuu create_code_chat_ui-funktiolle (id: ${chat_id})`);
    return;
  }
  if (document.getElementById(`${chat_id}_chat_wrapper`)) {
    return;
  }

  const chat_ui_wrapper = document.createElement('div');
  chat_ui_wrapper.id = `${chat_id}_chat_wrapper`;
  chat_ui_wrapper.classList.add('chat_wrapper');

  const chat_container_full = document.createElement('div');
  const chat_title = document.createElement('h3');
  chat_title.textContent = `Koodichat (id: ${chat_id})`;
  chat_container_full.appendChild(chat_title);

  const chat_container = document.createElement('div');
  chat_container.id = `${chat_id}_chat_container`;
  chat_container.classList.add('chat_container');
  chat_container_full.appendChild(chat_container);

  // Syötekenttä
  const chat_input = document.createElement('textarea');
  chat_input.id = `${chat_id}_chat_input`;
  chat_input.placeholder = 'Anna ohje koodin luontiin...';

  chat_input.addEventListener('keydown', (event) => {
    const user_history = user_message_history_map_code.get(chat_id) || [];
    let user_history_index = user_history_index_map_code.get(chat_id) || user_history.length;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (user_history.length > 0) {
        user_history_index = Math.max(0, user_history_index - 1);
        chat_input.value = user_history[user_history_index] || '';
        user_history_index_map_code.set(chat_id, user_history_index);
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
        user_history_index_map_code.set(chat_id, user_history_index);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const send_btn = document.getElementById(`${chat_id}_chat_sendBtn`);
      if (send_btn) send_btn.click();
    }
  });

  // Lähetysnappi
  const chat_send_btn = document.createElement('button');
  chat_send_btn.id = `${chat_id}_chat_sendBtn`;
  chat_send_btn.textContent = 'Lähetä (koodi-SSE)';

  // Poista historia
  const clear_history_btn = document.createElement('button');
  clear_history_btn.textContent = 'Poista historia';
  clear_history_btn.addEventListener('click', () => {
    localStorage.removeItem(`codeChatConversation_${chat_id}`);
    conversation_map_code.set(chat_id, []);
    user_message_history_map_code.set(chat_id, []);
    user_history_index_map_code.set(chat_id, 0);
    chat_container.innerHTML = '';
  });

  // Napit konttiin
  const buttons_container = document.createElement('div');
  buttons_container.classList.add('buttons_container');
  buttons_container.appendChild(chat_send_btn);
  buttons_container.appendChild(clear_history_btn);
  chat_container_full.appendChild(chat_input);
  chat_container_full.appendChild(buttons_container);

  chat_ui_wrapper.appendChild(chat_container_full);
  parent_element.appendChild(chat_ui_wrapper);

  chat_send_btn.addEventListener('click', () => {
    const user_message = chat_input.value.trim();
    if (!user_message) return;
    append_chat_message_code(chat_id, 'user', user_message);
    add_to_conversation_code(chat_id, { role: 'user', content: user_message });
    add_to_user_history_code(chat_id, user_message);
    chat_input.value = '';
    start_code_editor_stream(chat_id, user_message);
  });

  load_conversation_from_local_storage_code(chat_id);
}

function append_chat_message_code(chat_id, sender, text) {
  text = text.replace(/\\n/g, '\n');

  const chat_container = document.getElementById(`${chat_id}_chat_container`);
  if (!chat_container) return;

  const bubble = document.createElement('div');
  bubble.classList.add('chat-bubble');

  if (sender === 'user') {
    bubble.classList.add('chat-bubble-user');
  } else if (sender === 'assistant') {
    bubble.classList.add('chat-bubble-assistant');
  } else if (sender === 'error') {
    bubble.classList.add('chat-bubble-error');
  }

  const text_elem = document.createElement('div');
  text_elem.classList.add('chat-text');
  
  // Käytä nyt createContentFromData-funktiota textContentin sijaan:
  const htmlContent = createContentFromData(text);
  text_elem.innerHTML = htmlContent;
  
  bubble.appendChild(text_elem);
  chat_container.appendChild(bubble);

  //odotetaan n ms
  setTimeout(() => {
    chat_container.scrollTop = chat_container.scrollHeight;
  }, 0);
}

function add_to_conversation_code(chat_id, msg) {
  if (!conversation_map_code.has(chat_id)) {
    conversation_map_code.set(chat_id, []);
  }
  const conv = conversation_map_code.get(chat_id);
  conv.push(msg);
  conversation_map_code.set(chat_id, conv);
  save_conversation_to_local_storage_code(chat_id);
}

function add_to_user_history_code(chat_id, user_message) {
  if (!user_message_history_map_code.has(chat_id)) {
    user_message_history_map_code.set(chat_id, []);
  }
  const history = user_message_history_map_code.get(chat_id);
  history.push(user_message);
  user_message_history_map_code.set(chat_id, history);
  user_history_index_map_code.set(chat_id, history.length);
}

function save_conversation_to_local_storage_code(chat_id) {
  try {
    const conv = conversation_map_code.get(chat_id) || [];
    localStorage.setItem(`codeChatConversation_${chat_id}`, JSON.stringify(conv));
  } catch (e) {
    console.error('error storing codeChat to localStorage:', e);
  }
}

function load_conversation_from_local_storage_code(chat_id) {
  try {
    const stored_conv = localStorage.getItem(`codeChatConversation_${chat_id}`);
    if (!stored_conv) {
      // Luodaan tyhjä + tervetuloviesti
      conversation_map_code.set(chat_id, []);
      user_message_history_map_code.set(chat_id, []);
      user_history_index_map_code.set(chat_id, 0);
      append_chat_message_code(chat_id, 'assistant', 'Tervetuloa koodi-SSE-chattiin! 🏗️');
      return;
    }
    // Muutoin parse
    const parsed = JSON.parse(stored_conv);
    conversation_map_code.set(chat_id, parsed);

    const chat_container = document.getElementById(`${chat_id}_chat_container`);
    if (!chat_container) return;
    chat_container.innerHTML = '';

    parsed.forEach(msg => {
      if (msg.role === 'user') {
        add_to_user_history_code(chat_id, msg.content);
      }
      append_chat_message_code(chat_id, msg.role, msg.content);
    });

    const user_history = user_message_history_map_code.get(chat_id) || [];
    user_history_index_map_code.set(chat_id, user_history.length);

  } catch (e) {
    console.error('error loading codeChat from localStorage:', e);
  }
}


/* ----------------------------------------
 3) Yhdistetty ikkuna: Chat + tiedostorakenne
---------------------------------------- */

/** Avaa draggable-ikkunan, jossa on sekä koodichat että file-structure-päivitys */
export function open_code_chat_and_file_structure_window() {
  create_draggable_window('combined_code_chat_window', 'Koodichat   File-rakenteen päivitys', (content_elem) => {
    // Lisätään chat UI
    create_code_chat_ui('draggable_code_chat', content_elem);

    // Luodaan "päivitä file-structure" -osio
    const separator = document.createElement('hr');
    content_elem.appendChild(separator);

    // const instructions = document.createElement('p');
    // instructions.textContent = 'Päivitä tiedostorakenne suoraan palvelimella painamalla nappia.';
    // content_elem.appendChild(instructions);

    const update_btn = document.createElement('button');
    update_btn.textContent = 'Päivitä file-structure';
    update_btn.addEventListener('click', async () => {
      console.log('Pyydetään serveriä päivittämään file-rakenne...');
      try {
        const res = await fetch('/api/refresh_file_structure', { method: 'POST' });
        if (!res.ok) {
          const errTxt = await res.text();
          throw new Error(`virhe: ${res.status} - ${errTxt}`);
        }
        const serverReply = await res.text();
        console.log('Palvelimen vastaus:', serverReply);
        alert('File-rakenne päivitetty. ' + serverReply);
      } catch (err) {
        console.error('päivitys epäonnistui:', err);
        alert('File-rakenteen päivitys epäonnistui, tarkista konsoli.');
      }
    });

    const buttons_container = content_elem.querySelector('.buttons_container');
    if (buttons_container) {
      buttons_container.appendChild(update_btn);
    }
  });
}
