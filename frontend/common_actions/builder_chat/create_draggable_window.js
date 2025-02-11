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
  