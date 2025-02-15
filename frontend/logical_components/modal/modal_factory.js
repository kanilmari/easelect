// modal_factory.js

export function createModal({ titleDataLangKey, tableName, contentElements, width = '600px' }) {
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
    modal.innerHTML = '';

    // Luo sulkemispainike
    const close_button = document.createElement('span');
    close_button.classList.add('modal_close_button');
    close_button.innerHTML = '&times;';
    close_button.addEventListener('click', hideModal);
    modal.appendChild(close_button);

    // Otsikko (jos titleDataLangKey on annettu)
    if (titleDataLangKey) {
        const modal_title = document.createElement('h2');

        // Jos tableName on annettu, lisätään plus-merkki mukaan
        let combined_key = titleDataLangKey;
        if (tableName) {
            combined_key += `+${tableName}`;
        }

        modal_title.setAttribute('data-lang-key', combined_key);
        modal.appendChild(modal_title);
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

// export function createModal({ titleDataLangKey, contentElements, width = '600px' }) {
//     // Luo modalin taustalla oleva overlay-elementti
//     let modal_overlay = document.getElementById('custom_modal_overlay');
//     if (!modal_overlay) {
//         modal_overlay = document.createElement('div');
//         modal_overlay.id = 'custom_modal_overlay';
//         modal_overlay.classList.add('modal_overlay');

//         // Lisää klikkauskuuntelija modaalin sulkemiseksi klikkaamalla ulkopuolelle
//         modal_overlay.addEventListener('click', (event) => {
//             if (event.target === modal_overlay) {
//                 hideModal();
//             }
//         });

//         document.body.appendChild(modal_overlay);
//     }

//     // Luo modal-elementti
//     let modal = document.getElementById('custom_modal');
//     if (!modal) {
//         modal = document.createElement('div');
//         modal.id = 'custom_modal';
//         modal.classList.add('modal');
//         modal_overlay.appendChild(modal);
//     }

//     // Tyhjennä modalin sisältö
//     modal.innerHTML = '';

//     // Luo sulkemispainike
//     const close_button = document.createElement('span');
//     close_button.classList.add('modal_close_button');
//     close_button.innerHTML = '&times;';
//     close_button.addEventListener('click', hideModal);
//     modal.appendChild(close_button);

//     // Luo otsikko data-lang-key-arvon mukaan
//     if (titleDataLangKey) {
//         const modal_title = document.createElement('h2');
//         modal_title.setAttribute('data-lang-key', titleDataLangKey);
//         modal.appendChild(modal_title);
//     }

//     // Lisää sisältöelementit
//     contentElements.forEach((element) => {
//         modal.appendChild(element);
//     });

//     // Aseta modaalin oletusleveys
//     modal.style.width = width;

//     return { modal_overlay, modal };
// }

// export function showModal() {
//     const modal_overlay = document.getElementById('custom_modal_overlay');
//     if (modal_overlay) {
//         modal_overlay.style.display = 'flex';
//     }
// }

// export function hideModal() {
//     const modal_overlay = document.getElementById('custom_modal_overlay');
//     if (modal_overlay) {
//         modal_overlay.style.display = 'none';
//     }
// }