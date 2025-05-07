// collapsible_section.js
import { count_this_function } from '../../core_components/dev_tools/function_counter.js';

export function create_collapsible_section(title_translation_key, content_element, start_open = false) {
    count_this_function('create_collapsible_section');

    const wrapper = document.createElement('div');
    wrapper.classList.add('collapsible-section');

    /* ---------- Header ---------- */
    const header = document.createElement('div');
    header.classList.add('collapsible-header');

    /* ---------- Title + nappi ---------- */
    const title_span = document.createElement('span');
    // aseta käännösavain attribuuttina – ei näkyvää tekstiä
    title_span.setAttribute('data-lang-key', title_translation_key);
    header.appendChild(title_span);

    const toggle_button = document.createElement('button');
    toggle_button.textContent = start_open ? 'Sulje' : 'Avaa';
    toggle_button.classList.add('button');
    header.appendChild(toggle_button);

    /* ---------- Sisältö ---------- */
    content_element.classList.add('collapsible-content');
    if (!start_open) {
        content_element.classList.add('hidden');
        header.classList.add('collapsed');
    } else if (title_translation_key.includes('Chat') && start_open) {
        // Jos tämä on chat-osio ja se on auki, lisää blur filter-bariin
        setTimeout(() => {
            const filter_bar = wrapper.closest('.filterBar');
            if (filter_bar) {
                filter_bar.classList.add('filter-blur');
            }
        }, 0);
    }

    let is_open = start_open;
    toggle_button.addEventListener('click', () => {
        const is_chat_section = title_translation_key.includes('Chat');

        if (is_open) {
            content_element.classList.add('hidden');
            header.classList.add('collapsed');
            toggle_button.textContent = 'Avaa';
            is_open = false;

            // Poista blur filter-barista kun chat suljetaan
            if (is_chat_section) {
                const filter_bar = wrapper.closest('.filterBar');
                if (filter_bar) {
                    filter_bar.classList.remove('filter-blur');
                }
            }
        } else {
            content_element.classList.remove('hidden');
            header.classList.remove('collapsed');
            toggle_button.textContent = 'Sulje';
            is_open = true;

            // Lisää blur filter-bariin kun chat avataan
            if (is_chat_section) {
                const filter_bar = wrapper.closest('.filterBar');
                if (filter_bar) {
                    filter_bar.classList.add('filter-blur');
                }
            }
        }
    });

    wrapper.appendChild(header);
    wrapper.appendChild(content_element);
    return wrapper;
}
