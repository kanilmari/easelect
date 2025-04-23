// collapsible_section.js
export function create_collapsible_section(title_text, content_element, start_open = false) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('collapsible-section');

    // Header
    const header = document.createElement('div');
    header.classList.add('collapsible-header');

    // Title + nappi
    const title = document.createElement('span');
    title.textContent = title_text;
    header.appendChild(title);

    const toggle_button = document.createElement('button');
    toggle_button.textContent = start_open ? 'Sulje' : 'Avaa';
    toggle_button.classList.add('button');
    header.appendChild(toggle_button);

    // Sisältö
    content_element.classList.add('collapsible-content');
    if (!start_open) {
        content_element.classList.add('hidden');
        header.classList.add('collapsed');
    } else if (title_text.includes('Chat') && start_open) {
        // Jos tämä on chat-osio ja se on auki, lisää blur filter-bariin
        setTimeout(() => {
            const filterBar = wrapper.closest('.filterBar');
            if (filterBar) {
                filterBar.classList.add('filter-blur');
            }
        }, 0);
    }

    let is_open = start_open;
    toggle_button.addEventListener('click', () => {
        // Tarkista onko tämä chat-osio
        const isChat = title_text.includes('Chat');
        
        if (is_open) {
            content_element.classList.add('hidden');
            header.classList.add('collapsed');
            toggle_button.textContent = 'Avaa';
            is_open = false;
            
            // Poista blur filter-barista kun chat suljetaan
            if (isChat) {
                const filterBar = wrapper.closest('.filterBar');
                if (filterBar) {
                    filterBar.classList.remove('filter-blur');
                }
            }
        } else {
            content_element.classList.remove('hidden');
            header.classList.remove('collapsed');
            toggle_button.textContent = 'Sulje';
            is_open = true;
            
            // Lisää blur filter-bariin kun chat avataan
            if (isChat) {
                const filterBar = wrapper.closest('.filterBar');
                if (filterBar) {
                    filterBar.classList.add('filter-blur');
                }
            }
        }
    });

    wrapper.appendChild(header);
    wrapper.appendChild(content_element);
    return wrapper;
}