// navigation.js

import { get_load_info } from './nav_utils.js';

const MAX_RECENT_TABS = 5;

/**
 * Luo navigaation collapsible-otsikot ja niihin napit.
 * 
 * Nyt jokaisen napin klikkauksessa kutsutaan suoraan handle_all_navigation(...).
 */
export function create_navigation_buttons(custom_views) {
  const nav_container = document.getElementById('navContainer');
  nav_container.innerHTML = '';

  // Ryhmitellään custom_viewit group-kentän mukaan
  const custom_views_by_group = {};
  custom_views.forEach(view => {
    if (!custom_views_by_group[view.group]) {
      custom_views_by_group[view.group] = [];
    }
    custom_views_by_group[view.group].push(view);
  });

  // Luodaan collapsible-painike kullekin ryhmälle
  for (const [group_name, views] of Object.entries(custom_views_by_group)) {
    const heading = document.createElement('button');
    heading.classList.add('collapsible');
    heading.dataset.group = group_name;
    heading.dataset.langKey = group_name;  // kielikäännöstä varten
    heading.textContent = group_name;      // fallback-teksti

    nav_container.appendChild(heading);

    // Ryhmän sisältödivi
    const content_div = document.createElement('div');
    content_div.className = 'content';
    nav_container.appendChild(content_div);

    // Luodaan jokaiselle view:lle varsinainen nappi
    views.forEach(view => {
      const button = document.createElement('button');
      button.classList.add('navigation_buttons', 'general_button_nav');
      button.textContent = view.name;
      button.dataset.langKey = view.name; 
      // Tallennetaan ryhmä, jotta voidaan myöhemmin merkitä collapsible-otsikko
      button.dataset.group = group_name;

      // Tärkeä muutos: Kutsutaan handle_all_navigation sen sijaan että
      // suoraan kutsuttaisiin entistä handle_navigation-funktiota.
      button.addEventListener('click', async function() {
        await handle_all_navigation(view.name, custom_views);
      });

      content_div.appendChild(button);
    });
  }

  // Collapsible-otsikoiden auki/kiinni logiikka
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

/**
 * Tämä on entinen handle_navigation, uudella nimellä.
 * Täällä on kaikki välilehtien aktiivisuuden, recently viewed -listojen
 * ja containerien piilottamis-/näyttämislogiikka.
 */
export async function performNavigation(data_lang_key, container_id, load_function, groupName) {
  console.log('Navigating to:', data_lang_key);
  console.log('Container ID:', container_id);
  console.log('Load function:', load_function);
  console.log('Group name:', groupName);

  // 1) Poistetaan edelliseltä aktiiviselta nappilta .active
  const old_active_button = document.querySelector('.general_button_nav.active');
  if (old_active_button) {
    const old_key = old_active_button.dataset.langKey;
    update_recently_viewed_list(old_key);
    old_active_button.classList.remove('active');
  }

  // 2) Lisätään klikatun tabin "recently viewed" -listaan
  update_recently_viewed_list(data_lang_key);

  // 3) Merkitään klikatusta napista .active, muilta poistetaan
  const navigation_buttons = document.querySelectorAll('.general_button_nav');
  navigation_buttons.forEach(button => {
    if (button.dataset.langKey === data_lang_key) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });

  // 4) Piilotetaan kaikki containerit
  const all_containers = document.querySelectorAll('#tabs_container > .content_div');
  all_containers.forEach(container_element => {
    container_element.classList.add('hidden');
  });

  // 5) Ladataan, jos ei vielä ladattu
  let container_element = document.getElementById(container_id);
  if (!container_element) {
    await load_function();
    container_element = document.getElementById(container_id);
  } else if (!container_element.hasChildNodes()) {
    await load_function();
  }
  container_element.classList.remove('hidden');

  // 6) Merkitään ryhmän otsikkoon .child-active
  update_active_heading(groupName);

  // 7) Päivitetään .recently_viewed -status
  update_recently_viewed_status();
}

/**
 * Tämä on se uusi "ylätason" funktio, joka yhdistää get_load_info + performNavigation.
 * Kutsutaan muualta aina, kun halutaan navigoida tiettyyn tauluun/näkymään.
 */
export async function handle_all_navigation(name, customViews) {
  // 1) Selvitetään, onko kyseessä custom_view vai normaali taulu
  const { loadFunction, containerId } = get_load_info(name, customViews);

  // 2) Etsitään halutessa groupName, jos se on relevanttia
  let groupName = null;
  const foundView = customViews.find(v => v.name === name);
  if (foundView && foundView.group) {
    groupName = foundView.group;
  }

  // 3) Kutsutaan entistä "handle_navigation" -funktiota (nyt nimellä performNavigation)
  await performNavigation(name, containerId, loadFunction, groupName);

  // 4) Tallennetaan localStorageen valinta
  localStorage.setItem('selected_table', name);
}

/**
 * Seuraavat funktiot ovat entisiä apufunktioita 'handle_navigation' -funktion sisältä.
 */
function update_recently_viewed_list(tab_key) {
  const rv_list_str = localStorage.getItem('recently_viewed_tabs');
  let rv_list = rv_list_str ? JSON.parse(rv_list_str) : [];

  rv_list = rv_list.filter(key => key !== tab_key);
  rv_list.unshift(tab_key);

  while (rv_list.length > MAX_RECENT_TABS) {
    rv_list.pop();
  }
  localStorage.setItem('recently_viewed_tabs', JSON.stringify(rv_list));
}

function remove_from_recently_viewed(tab_key) {
  const rv_list_str = localStorage.getItem('recently_viewed_tabs');
  if (!rv_list_str) return;
  
  let rv_list = JSON.parse(rv_list_str);
  rv_list = rv_list.filter(key => key !== tab_key);
  localStorage.setItem('recently_viewed_tabs', JSON.stringify(rv_list));
}

function update_recently_viewed_status() {
  const navigation_buttons = document.querySelectorAll('.general_button_nav');
  const rv_list_str = localStorage.getItem('recently_viewed_tabs');

  if (!rv_list_str) {
    // Poistetaan kaikilta "recently_viewed" -luokka
    navigation_buttons.forEach(button => {
      button.classList.remove('recently_viewed');
      button.removeAttribute('title');
    });
  } else {
    const rv_list = JSON.parse(rv_list_str);
    navigation_buttons.forEach(button => {
      const button_key = button.dataset.langKey;
      const is_active = button.classList.contains('active');
      if (rv_list.includes(button_key) && !is_active) {
        button.classList.add('recently_viewed');
        button.setAttribute('title', 'Recently viewed (right-click to clear)');
        button.addEventListener(
          'contextmenu',
          function(evt) {
            evt.preventDefault();
            remove_from_recently_viewed(button_key);
            update_recently_viewed_status();
          },
          { once: true }
        );
      } else {
        button.classList.remove('recently_viewed');
        button.removeAttribute('title');
      }
    });
  }

  // Lisätään / poistetaan .child-rv collapsible-otsikoista
  const groups_with_rv = new Set();
  navigation_buttons.forEach(button => {
    if (button.classList.contains('recently_viewed')) {
      groups_with_rv.add(button.dataset.group);
    }
  });

  const all_headings = document.querySelectorAll('.collapsible');
  all_headings.forEach(heading => {
    heading.classList.remove('child-rv');
  });
  groups_with_rv.forEach(g => {
    const heading = document.querySelector(`.collapsible[data-group="${g}"]`);
    if (heading && !heading.classList.contains('child-active')) {
      heading.classList.add('child-rv');
    }
  });
}

function update_active_heading(groupName) {
  const all_headings = document.querySelectorAll('.collapsible');
  all_headings.forEach(heading => heading.classList.remove('child-active'));

  const active_heading = document.querySelector(`.collapsible[data-group="${groupName}"]`);
  if (active_heading) {
    active_heading.classList.add('child-active');
  }
}
