// coder_chat.js
import { createContentFromData } from './chat_functions.js';
import { create_draggable_window } from './create_draggable_window.js';

/* ----------------------------------------
   SSE-koodichatin logiikka
---------------------------------------- */

// Pidämme yhä nämä mapit tallentamaan keskusteluhistorian
let conversation_map_code = new Map();
let user_message_history_map_code = new Map();
let user_history_index_map_code = new Map();

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

	// Poista historia -nappi
	const clear_history_btn = document.createElement('button');
	clear_history_btn.textContent = 'Poista historia';
	clear_history_btn.addEventListener('click', () => {
		localStorage.removeItem(`codeChatConversation_${chat_id}`);
		conversation_map_code.set(chat_id, []);
		user_message_history_map_code.set(chat_id, []);
		user_history_index_map_code.set(chat_id, 0);
		chat_container.innerHTML = '';
		console.log(`[clear_history_btn] Chat history cleared for chat_id=${chat_id}`);
	});

	const buttons_container = document.createElement('div');
	buttons_container.classList.add('buttons_container');
	buttons_container.appendChild(chat_send_btn);
	buttons_container.appendChild(clear_history_btn);

	// Luodaan div, johon textarea ja napit laitetaan
	const bottom_chat_controls = document.createElement('div');
	bottom_chat_controls.classList.add('bottom_chat_controls');
	bottom_chat_controls.appendChild(chat_input);
	bottom_chat_controls.appendChild(buttons_container);

	chat_container_full.appendChild(bottom_chat_controls);
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


/**
 * Käynnistää SSE-yhteyden serveriin.
 * Nyt käsittelemme erikseen chunk_main / chunk_summary / done_main / done_summary.
 */
function start_code_editor_stream(chat_id, user_message) {
	console.log("[start_code_editor_stream] chat_id=", chat_id, " user_message=", user_message);

	const conversation = conversation_map_code.get(chat_id) || [];
	const conversation_json = JSON.stringify(conversation);

	const encoded_conversation = encodeURIComponent(conversation_json);
	const url = `/openai_code_editor_stream_handler?user_message=${encodeURIComponent(user_message)}&conversation=${encoded_conversation}`;
	console.log("[start_code_editor_stream] SSE URL =", url);

	const evtSource = new EventSource(url);

	// Tallennetaan väliaikaiset tekstit
	let finalContentMain = "";
	let finalContentSummary = "";

	// Luodaan "bubble" (DOM-elementti) vain jos oikeasti alkaa tulla chunkia
	let partialBubbleMain = null;
	let partialTextElemMain = null;

	let partialBubbleSummary = null;
	let partialTextElemSummary = null;

	const chat_container = document.getElementById(`${chat_id}_chat_container`);

	/** Helper: lisää chunk text "partial"-kuplaan tai luo se, jos puuttuu */
	function appendChunkToPartialBubble(bubbleRef, textElemRef, bubbleClass, chunkText) {
		if (!bubbleRef) {
			const newBubble = document.createElement('div');
			newBubble.classList.add('chat-bubble', bubbleClass, 'partial-bubble');

			const newTextElem = document.createElement('div');
			newTextElem.classList.add('chat-text');

			newBubble.appendChild(newTextElem);
			chat_container.appendChild(newBubble);

			bubbleRef = newBubble;
			textElemRef = newTextElem;
		}
		textElemRef.textContent += chunkText;

		// Scrollaa alas
		setTimeout(() => {
			chat_container.scrollTop = chat_container.scrollHeight;
		}, 0);

		return [bubbleRef, textElemRef];
	}

	/** Helper: finalize bubble - älä poista DOMista, vain muuta ID ja rooli */
    function finalizeBubble(bubbleRef, textElemRef, finalText, chatRole) {
        if (!bubbleRef) return;

        // Käytetään createContentFromData, jotta <details> / <summary> -rakenteet syntyvät
        const parsedHtml = createContentFromData(finalText);
        textElemRef.innerHTML = parsedHtml;

        // Poistetaan "partial-bubble" class
        bubbleRef.classList.remove('partial-bubble');

        // Lisätään rooli-luokka (jos halutaan erotella)
        if (chatRole === 'assistant_summary') {
            bubbleRef.classList.add('chat-bubble-assistant-summary');
        } else if (chatRole === 'assistant') {
            bubbleRef.classList.add('chat-bubble-assistant');
        }

        // Tallennetaan viesti conversationiin
        add_to_conversation_code(chat_id, { role: chatRole, content: finalText });
    }
	// ----------- chunk_main -----------
	evtSource.addEventListener("chunk_main", (e) => {
		const chunk = e.data;
		// console.log("[chunk_main] event received:", chunk);
		if (!chunk.trim()) return;

		finalContentMain += chunk;
		[partialBubbleMain, partialTextElemMain] = appendChunkToPartialBubble(
			partialBubbleMain,
			partialTextElemMain,
			'chat-bubble-assistant', // or 'chat-bubble-assistant-main'
			chunk
		);
	});

	// ----------- chunk_summary -----------
	evtSource.addEventListener("chunk_summary", (e) => {
		const chunk = e.data;
		// console.log("[chunk_summary] event received:", chunk);
		if (!chunk.trim()) return;

		finalContentSummary += chunk;
		[partialBubbleSummary, partialTextElemSummary] = appendChunkToPartialBubble(
			partialBubbleSummary,
			partialTextElemSummary,
			'chat-bubble-assistant-summary',
			chunk
		);
	});

	// ----------- done_main -----------
	evtSource.addEventListener("done_main", (e) => {
		// console.log("[done_main] event received:", e.data);
		// Jos finalContentMain on tyhjä, käytetään e.data
		let finalText = finalContentMain.trim();
		if (!finalText && e.data) {
			finalText = e.data.trim();
		}
		finalizeBubble(partialBubbleMain, partialTextElemMain, finalText, 'assistant');
		partialBubbleMain = null;
		partialTextElemMain = null;
	});

	// ----------- done_summary -----------
	evtSource.addEventListener("done_summary", (e) => {
		// console.log("[done_summary] event received:", e.data);
		let finalText = finalContentSummary.trim();
		if (!finalText && e.data) {
			finalText = e.data.trim();
		}
		finalizeBubble(partialBubbleSummary, partialTextElemSummary, finalText, 'assistant_summary');
		partialBubbleSummary = null;
		partialTextElemSummary = null;
	});

	// ----------- done (fallback) e was never used? -----------
	// evtSource.addEventListener("done", (e) => {
	// 	// console.log("[done] event received:", e.data);
	// 	evtSource.close();
	// 	// Halutessasi voit vain sulkea SSE-yhteyden, 
	// 	// muttet poistaa kuplia: partialBubbleMain, partialBubbleSummary 
	// 	// ovat voineet jo finalisoitua
	// });

	// ----------- error -----------
	evtSource.addEventListener("error", (e) => {
		console.error("[start_code_editor_stream] sse error:", e);
		evtSource.close();
		append_chat_message_code(chat_id, "error", "virhe SSE-yhteydessä");
	});
}

/** 
 * Luo chat-kuplan 
 */
function append_chat_message_code(chat_id, sender, text) {
	// text = text.replace(/\\n/g, '\n');
	text = text.replace(/\\\\n/g, '\n'); 

	const chat_container = document.getElementById(`${chat_id}_chat_container`);
	if (!chat_container) return;

	console.log("[append_chat_message_code] sender=", sender, " text length=", text.length);

	const bubble = document.createElement('div');
	bubble.classList.add('chat-bubble');

	if (sender === 'user') {
		bubble.classList.add('chat-bubble-user');
	} else if (sender === 'assistant') {
		bubble.classList.add('chat-bubble-assistant');
	} else if (sender === 'assistant_summary') {
		bubble.classList.add('chat-bubble-assistant-summary');
	} else if (sender === 'error') {
		bubble.classList.add('chat-bubble-error');
	}

	const text_elem = document.createElement('div');
	text_elem.classList.add('chat-text');

	// Käytämme createContentFromData-funktiota 
	const htmlContent = createContentFromData(text);
	text_elem.innerHTML = htmlContent;

	bubble.appendChild(text_elem);
	chat_container.appendChild(bubble);

	setTimeout(() => {
		chat_container.scrollTop = chat_container.scrollHeight;
	}, 0);
}

/** Tallentaa viestin conversation_map_codeen, ja päivittää localStorage */
function add_to_conversation_code(chat_id, msg) {
	if (!conversation_map_code.has(chat_id)) {
		conversation_map_code.set(chat_id, []);
	}
	const conv = conversation_map_code.get(chat_id);
	conv.push(msg);
	conversation_map_code.set(chat_id, conv);
	save_conversation_to_local_storage_code(chat_id);
}

/** Tallentaa käyttäjän syötteen historian, jotta Up/Down-nuolilla voi selata */
function add_to_user_history_code(chat_id, user_message) {
	if (!user_message_history_map_code.has(chat_id)) {
		user_message_history_map_code.set(chat_id, []);
	}
	const history = user_message_history_map_code.get(chat_id);
	history.push(user_message);
	user_message_history_map_code.set(chat_id, history);
	user_history_index_map_code.set(chat_id, history.length);
}

/** Tallennus localStorageen */
function save_conversation_to_local_storage_code(chat_id) {
	try {
		const conv = conversation_map_code.get(chat_id) || [];
		console.log(`[save_conversation_to_local_storage_code] storing conversation for chat_id=${chat_id}, length=${conv.length}`);
		localStorage.setItem(`codeChatConversation_${chat_id}`, JSON.stringify(conv));
	} catch (e) {
		console.error('error storing codeChat to localStorage:', e);
	}
}

/** Lataa entinen historia localStoragesta (jos on) ja piirtää sen. */
function load_conversation_from_local_storage_code(chat_id) {
	try {
		const stored_conv = localStorage.getItem(`codeChatConversation_${chat_id}`);
		if (!stored_conv) {
			conversation_map_code.set(chat_id, []);
			user_message_history_map_code.set(chat_id, []);
			user_history_index_map_code.set(chat_id, 0);
			append_chat_message_code(chat_id, 'assistant', 'Tervetuloa koodi-SSE-chattiin! 🏗️');
			console.log(`[load_conversation_from_local_storage_code] no stored conversation found for chat_id=${chat_id}`);
			return;
		}
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

		console.log(`[load_conversation_from_local_storage_code] loaded conversation for chat_id=${chat_id}, length=${parsed.length}`);
	} catch (e) {
		console.error('error loading codeChat from localStorage:', e);
	}
}

/* ----------------------------------------
   Yhdistetty ikkuna: Chat + tiedostorakenne
---------------------------------------- */
export function open_code_chat_and_file_structure_window() {
	create_draggable_window('combined_code_chat_window', 'Koodichat   File-rakenteen päivitys', (content_elem) => {
		// Lisätään chat UI
		create_code_chat_ui('draggable_code_chat', content_elem);

		// Luodaan "päivitä file-structure" -osio
		const separator = document.createElement('hr');
		content_elem.appendChild(separator);

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