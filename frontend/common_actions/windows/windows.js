// windows.js
// ---- Yleinen funktio, joka tekee draggable-ikkunan ----
function create_draggable_window(window_id, title, content_callback) {
    // Tarkista, onko jo olemassa
    if (document.getElementById(window_id)) {
        // Voit esim. tuoda olemassa olevan ikkunan näkyviin uudelleen:
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

    // Asetetaan callbackin sisältö
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
        // Lasketaan offset, jottei ikkunan vasen yläkulma hyppää hiiren kohdalle
        offsetX = e.clientX - window_elem.offsetLeft;
        offsetY = e.clientY - window_elem.offsetTop;
        // Tuodaan ikkuna etualalle (z-index)
        window_elem.style.zIndex = '9999';
    });

    document.addEventListener('mousemove', (e) => {
        if (!is_down) return;
        e.preventDefault(); // estää tekstin valinnan ym.
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;
        // Rajoita halutessa ikkunan paikka ruudun sisälle:
        // if (newX < 0) newX = 0; 
        // if (newY < 0) newY = 0;
        window_elem.style.left = newX + 'px';
        window_elem.style.top = newY + 'px';
    });

    document.addEventListener('mouseup', () => {
        is_down = false;
    });

    return window_elem;
}

// // // // ---- 1) Ikkuna: "Tiedostojen lataus kantaan" ----
// // // export function open_file_struct_ud_window() {
// // //     create_draggable_window('db_upload_window', 'Tiedostojen lataus kantaan', (content_elem) => {
// // //         // Voit rakentaa haluamasi lomakkeen tai toiminnallisuuden sisään:
// // //         const instructions = document.createElement('p');
// // //         instructions.textContent = 'Valitse hakemisto tai tiedostot ja lataa tietokantaan.';
// // //         content_elem.appendChild(instructions);

// // //         // Voit lisätä esim. <input type="file" multiple> 
// // //         // tai linkin "Käynnistä tiedostojen indeksointi" -> fetch -> taustaprosessi
// // //         const file_input = document.createElement('input');
// // //         file_input.type = 'file';
// // //         file_input.multiple = true;
// // //         file_input.addEventListener('change', () => {
// // //             const files = file_input.files;
// // //             // Toteuta haluamasi tiedostojen käsittely
// // //             console.log('Valitut tiedostot:', files);
// // //         });
// // //         content_elem.appendChild(file_input);

// // //         const upload_btn = document.createElement('button');
// // //         upload_btn.textContent = 'Lähetä tiedostot kantaan';
// // //         upload_btn.addEventListener('click', () => {
// // //             console.log('Voit tässä kutsua fetch() -> /api/upload kansiorakenteen tallennukseen, tms.');
// // //             // ... tee haluamasi logiikka ...
// // //         });
// // //         content_elem.appendChild(upload_btn);
// // //     });
// // // }

// // // // ---- 2) Ikkuna: Chat ----
// // // import { create_code_chat_ui } from './common_actions/builder_chat.js';
// // // export function open_chat_window() {
// // //     create_draggable_window('code_chat_window', 'Koodichat', (content_elem) => {
// // //         // Hyödynnetään chatin luontifunktiota
// // //         // Parametrit: (chat_id, parent_element)
// // //         create_code_chat_ui('draggable_code_chat', content_elem);
// // //     });
// // // }
