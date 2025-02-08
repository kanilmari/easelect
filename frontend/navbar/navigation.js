// navigation.js

export function create_navigation_buttons(custom_views) {
    const nav_container = document.getElementById('navContainer');
    nav_container.innerHTML = '';

    // Ryhmitellään custom_viewit niiden group-kentän mukaan
    const custom_views_by_group = {};
    custom_views.forEach(view => {
        if (!custom_views_by_group[view.group]) {
            custom_views_by_group[view.group] = [];
        }
        custom_views_by_group[view.group].push(view);
    });

    for (const [group_name, views] of Object.entries(custom_views_by_group)) {
        const heading = document.createElement('button');
        heading.className = 'collapsible';
        heading.textContent = group_name;
        nav_container.appendChild(heading);

        const content_div = document.createElement('div');
        content_div.className = 'content';
        nav_container.appendChild(content_div);

        views.forEach(view => {
            const button = document.createElement('button');
            // Käytetään esim. "general_button_nav" -luokkaa, jos haluat
            button.className = 'navigation_buttons general_button_nav';
            button.textContent = view.name;
            button.dataset.langKey = view.name;

            button.addEventListener('click', function () {
                handle_navigation(view.name, view.containerId, view.loadFunction);
                localStorage.setItem('selected_table', view.name);
            });
            content_div.appendChild(button);
        });
    }

    const collapsibles = document.getElementsByClassName('collapsible');
    for (let i = 0; i < collapsibles.length; i++) {
        collapsibles[i].addEventListener('click', function () {
            this.classList.toggle('opened');
            const content = this.nextElementSibling;
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
            } else {
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        });
    }
}

// Määritellään, kuinka monta välilehteä halutaan merkitä "recently_viewed" -luokalla.
// Voit muuttaa esim. 12:een halutessasi.
const MAX_RECENT_TABS = 5;

// Apufunktio: lisää tabKeyn listan kärkeen, poistaa duplikaatit
// ja rajoittaa listan pituuden enintään MAX_RECENT_TABS:iin
function update_recently_viewed_list(tab_key) {
    // Haetaan jo olemassa oleva lista localStoragesta
    const rv_list_str = localStorage.getItem('recently_viewed_tabs');
    let rv_list = rv_list_str ? JSON.parse(rv_list_str) : [];

    // Poistetaan mahdollinen vanha esiintymä listasta
    rv_list = rv_list.filter(key => key !== tab_key);

    // Lisätään eteen
    rv_list.unshift(tab_key);

    // Rajataan listan pituus
    while (rv_list.length > MAX_RECENT_TABS) {
        rv_list.pop();
    }

    // Tallennetaan takaisin
    localStorage.setItem('recently_viewed_tabs', JSON.stringify(rv_list));
}

// Apufunktio: poistetaan tabKey listasta
function remove_from_recently_viewed(tab_key) {
    const rv_list_str = localStorage.getItem('recently_viewed_tabs');
    if (!rv_list_str) return;  // Ei mitään poistettavaa

    let rv_list = JSON.parse(rv_list_str);
    rv_list = rv_list.filter(key => key !== tab_key);
    localStorage.setItem('recently_viewed_tabs', JSON.stringify(rv_list));
}

// Tämä funktio päivittää DOM-nappien rv-luokat sen mukaan, mitkä tabit on listassa.
// Jos nappi on "active", jätämme sen ilman rv-luokkaa.
// Lisäksi annamme tooltipin "Recently viewed" + (oikeaklikkaus = "Clear").
function update_recently_viewed_status() {
    const navigation_buttons = document.querySelectorAll('#nav_tree .general_button_nav');
    const rv_list_str = localStorage.getItem('recently_viewed_tabs');

    // Jos ei ole listaa, poistetaan kaikilta rv-luokka ja tooltip
    if (!rv_list_str) {
        navigation_buttons.forEach(button => {
            button.classList.remove('recently_viewed');
            button.removeAttribute('title');
        });
        return;
    }

    const rv_list = JSON.parse(rv_list_str);

    navigation_buttons.forEach(button => {
        const button_key = button.getAttribute('data-lang-key');
        const is_active = button.classList.contains('active');
        
        // Jos nappi on rv-listassa muttei ole active, annamme rv-luokan ja tooltipin
        if (rv_list.includes(button_key) && !is_active) {
            button.classList.add('recently_viewed');
            button.setAttribute('title', 'Recently viewed (right-click to clear)');
            
            // Lisätään oikeaklikkaukseen "Clear" -toiminto.
            // Huom: jotta emme lisäisi tuplana, voit halutessasi
            // ensin poistaa entisen kuuntelijan tai käyttää passiivista once-tyyppistä ratkaisua.
            button.addEventListener('contextmenu', function (evt) {
                evt.preventDefault();
                remove_from_recently_viewed(button_key);
                update_recently_viewed_status();
            }, { once: true }); 
            // { once: true } poistaa kuuntelijan heti ekalla kerralla.
            // Jos haluat, että voi klikkailla useamman kerran, poista { once: true }
            // ja tee jokin muu varmistus, ettet rekisteröi samoja kuuntelijoita loputtomasti.

        } else {
            // Jos nappi ei ole rv-listassa tai on active, poistetaan rv-luokka ja title
            button.classList.remove('recently_viewed');
            button.removeAttribute('title');
        }
    });
}

// --- Navigointilogiikka:
export async function handle_navigation(data_lang_key, container_id, load_function) {
    // Etsitään vanha aktiivinen nappi
    const old_active_button = document.querySelector('#nav_tree .general_button_nav.active');
    if (old_active_button) {
        // Tallennetaan se viimeksi avattuihin
        const old_key = old_active_button.getAttribute('data-lang-key');
        update_recently_viewed_list(old_key);

        // Poistetaan active-luokka
        old_active_button.classList.remove('active');
    }

    // Uusi (klikattu) tab myös listan kärkeen
    update_recently_viewed_list(data_lang_key);

    // Päivitetään active-luokat
    const navigation_buttons = document.querySelectorAll('#nav_tree .general_button_nav');
    navigation_buttons.forEach(button => {
        const button_key = button.getAttribute('data-lang-key');
        if (button_key === data_lang_key) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // Päivitetään rv-luokka vasta lopuksi
    update_recently_viewed_status();

    // Piilotetaan kaikki content_divit
    const all_containers = document.querySelectorAll('#tabs_container > .content_div');
    all_containers.forEach(container_element => {
        container_element.classList.add('hidden');
    });

    // Tarkistetaan, onko container jo olemassa ja ladattu
    let container_element = document.getElementById(container_id);
    if (!container_element) {
        await load_function();
        container_element = document.getElementById(container_id);
    } else if (!container_element.hasChildNodes()) {
        await load_function();
    }

    // Näytetään valittu container
    container_element.classList.remove('hidden');
}
