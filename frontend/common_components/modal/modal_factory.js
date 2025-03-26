// modal_factory.js

export function createModal({
    titleDataLangKey,
    titleDataLangKeyFallback,
    titlePlainText,
    tableName,
    contentElements,
    width = '600px',
    skipModalTitle = false // <-- Lisätty parametri
}) {
    // Luo modalin taustalla oleva overlay-elementti
    let modal_overlay = document.getElementById('custom_modal_overlay');
    if (!modal_overlay) {
        modal_overlay = document.createElement('div');
        modal_overlay.id = 'custom_modal_overlay';
        modal_overlay.classList.add('modal_overlay');

        // Lisää klikkauskuuntelija modaalin sulkemiseksi klikkaamalla ulkopuolelle
        modal_overlay.addEventListener('click', (event) => {
            if (event.target === modal_overlay) {
                hideModal();
            }
        });

        document.body.appendChild(modal_overlay);
    }

    // Luo modal-elementti
    let modal = document.getElementById('custom_modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'custom_modal';
        modal.classList.add('modal');
        modal_overlay.appendChild(modal);
    }

    // Tyhjennä modalin sisältö
    modal.replaceChildren();

    // Luo sulkemispainike
    const close_button = document.createElement('span');
    close_button.classList.add('modal_close_button');
    close_button.textContent = '×';
    close_button.addEventListener('click', hideModal);
    modal.appendChild(close_button);

    // Näytetään otsikko vain jos skipModalTitle ei ole päällä
    if (!skipModalTitle) {
        if (titleDataLangKey) {
            const modal_title = document.createElement('h2');
            let combined_key = titleDataLangKey;
            if (tableName) {
                combined_key += `+${tableName}`;
            }
            modal_title.setAttribute('data-lang-key', combined_key);

            if (titleDataLangKeyFallback) {
                modal_title.setAttribute('data-lang-key-fallback', titleDataLangKeyFallback);
            }
            modal.appendChild(modal_title);

        } else if (titlePlainText) {
            const modal_title = document.createElement('h2');
            modal_title.textContent = titlePlainText;
            modal.appendChild(modal_title);
        }
    }

    // Lisää sisältöelementit
    contentElements.forEach((element) => {
        modal.appendChild(element);
    });

    // Aseta modaalin oletusleveys
    modal.style.width = width;

    return { modal_overlay, modal };
}

export function showModal() {
    const modal_overlay = document.getElementById('custom_modal_overlay');
    if (modal_overlay) {
        modal_overlay.style.display = 'flex';
    }
}

export function hideModal() {
    const modal_overlay = document.getElementById('custom_modal_overlay');
    if (modal_overlay) {
        modal_overlay.style.display = 'none';
    }
}
