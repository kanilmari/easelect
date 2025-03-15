// lang_panel.js
// Täällä luodaan kielivalitsin HTML dynaamisesti ja 
// kytketään se käännöstoimintoihin, jotka tulevat lang.js-tiedostosta.

import { translatePage } from './lang.js';

var menuLanguageSVG = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86q54.5 54.5 86 127T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Zm0-82q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-104-16q-18-33-31.5-68.5T322-320H204q29 50 72.5 87t99.5 55Zm208 0q56-18 99.5-55t72.5-87H638q-9 38-22.5 73.5T584-178ZM170-400h136q-3-20-4.5-39.5T300-480q0-21 1.5-40.5T306-560H170q-5 20-7.5 39.5T160-480q0 21 2.5 40.5T170-400Zm216 0h188q3-20 4.5-39.5T580-480q0-21-1.5-40.5T574-560H386q-3 20-4.5 39.5T380-480q0 21 1.5 40.5T386-400Zm268 0h136q5-20 7.5-39.5T800-480q0-21-2.5-40.5T790-560H654q3 20 4.5 39.5T660-480q0 21-1.5 40.5T654-400Zm-16-240h118q-29-50-72.5-87T584-782q18 33 31.5 68.5T638-640Zm-234 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h118q9-38 22.5-73.5T376-782q-56 18-99.5 55T204-640Z"/></svg>';

document.addEventListener('DOMContentLoaded', function() {
  // Etsitään tyhjä div, johon kielivalitsin halutaan
  const language_selector_div = document.querySelector('.language-selection.menu-language-selection');
  if (!language_selector_div) {
    console.error('kielenvalitsimen elementtiä ei löytynyt.');
    return;
  }

  // Määritellään kielivaihtoehdot
  const languages = [
    { id: 'lang-en', value: 'en', label: 'English (US)', title: 'Show menus in English' },
    { id: 'lang-fi', value: 'fi', label: 'Finnish (Suomi)', title: 'Show menus in Finnish' },
    { id: 'lang-sv', value: 'sv', label: 'Swedish (Svenska)', title: 'Show menus in Swedish' },
    { id: 'lang-ch', value: 'ch', label: 'Chinese (中文)', title: 'Show menus in Chinese' },
  ];

  // Rakennetaan kielivalitsin HTML
  let generated_html = `
    <!-- Nappi, joka näyttää valitun kielen -->
    <button class="select-selected">${menuLanguageSVG} EN</button>
    <!-- Pudotusvalikko kielille -->
    <div class="select-items select-hide menu-language">
      <div class="section inner-select-area">
        <label class="marginbottom"><b>☰ Select menu language</b></label>
  `;
  // Radio-kentät
  languages.forEach(lang => {
    generated_html += `
      <div class="language-option">
        <input id="${lang.id}" type="radio" name="menu-lang" value="${lang.value}" title="${lang.title}">
        <label for="${lang.id}">${lang.label}</label>
      </div>
    `;
  });

  generated_html += `
      </div>
    </div>
  `;
  language_selector_div.innerHTML = generated_html;

  function toggleLanguagePanel(panel_to_toggle) {
    var items_div = panel_to_toggle.nextElementSibling;
    // Sulje kaikki muut kielipalkit
    document.querySelectorAll('.language-selection .select-items').forEach(function(other_items_div) {
      if (other_items_div !== items_div) {
        other_items_div.classList.add('select-hide');
        other_items_div.previousElementSibling.classList.remove('select-arrow-active');
      }
    });
    // Avaa tai sulje tämä palkki
    items_div.classList.toggle('select-hide');
    panel_to_toggle.classList.toggle('select-arrow-active');
  }

  const selected_div = language_selector_div.querySelector('.select-selected');
  selected_div.addEventListener('click', function() {
    toggleLanguagePanel(selected_div);
  });

  // Kun radion arvo muuttuu -> päivitetään nappi, käännetään sivu ja suljetaan valikko
  document.querySelectorAll('.menu-language-selection input[type="radio"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      localStorage.setItem('selectedLanguage', radio.value);
      updateMenuLanguageDisplay();
      translatePage(radio.value);
      const items_div = selected_div.nextElementSibling;
      items_div.classList.add('select-hide');
      selected_div.classList.remove('select-arrow-active');
    });
  });

  // Alustus: tarkistetaan localStoragesta valittu kieli, tai käytetään selaimen kieltä
  setDefaultMenuLanguage();
  updateMenuLanguageDisplay();

  // Lopuksi käännetään sivu suoraan tallennetulla kielellä, jos haluat
  var saved_lang = localStorage.getItem('selectedLanguage') || navigator.language.split('-')[0];
  translatePage(saved_lang);

  // Suljetaan valikko, jos klikataan sen ulkopuolelle
  document.addEventListener('click', function(event) {
    const is_click_inside = language_selector_div.contains(event.target);
    if (!is_click_inside) {
      const items_div = language_selector_div.querySelector('.select-items');
      if (items_div && !items_div.classList.contains('select-hide')) {
        items_div.classList.add('select-hide');
        selected_div.classList.remove('select-arrow-active');
      }
    }
  });
});

function setDefaultMenuLanguage() {
  var default_menu_lang = navigator.language.split('-')[0];
  var saved_lang = localStorage.getItem('selectedLanguage') || default_menu_lang;
  var menu_lang_radio = document.querySelector('.menu-language-selection input[type="radio"][value="' + saved_lang + '"]');
  if (menu_lang_radio) {
    menu_lang_radio.checked = true;
  }
}

export function updateMenuLanguageDisplay() {
  var selected_menu_language = document.querySelector('.menu-language-selection input[type="radio"]:checked')?.value;
  var display_element = document.querySelector('.menu-language-selection .select-selected');
  if (display_element) {
    display_element.innerHTML = menuLanguageSVG + '&#x2004;' + (getShortLanguageCode(selected_menu_language) + "&#x2009;" || "Select Menu Language");
  }
}

function getShortLanguageCode(language_code) {
  var short_codes = {
    'en': 'EN',
    'fi': 'FI',
    'sv': 'SV',
    'ch': 'CH'
  };
  return short_codes[language_code] || language_code;
}
