// lang_panel.js
// Täällä luodaan kielivalitsin HTML dynaamisesti ja 
// kytketään se käännöstoimintoihin, jotka tulevat lang.js-tiedostosta. ☺

import { translatePage } from './lang.js';

// Tämä SVG-kuvake näytetään kielivalitsimen napissa
var menuLanguageSVG = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86q54.5 54.5 86 127T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Zm0-82q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-104-16q-18-33-31.5-68.5T322-320H204q29 50 72.5 87t99.5 55Zm208 0q56-18 99.5-55t72.5-87H638q-9 38-22.5 73.5T584-178ZM170-400h136q-3-20-4.5-39.5T300-480q0-21 1.5-40.5T306-560H170q-5 20-7.5 39.5T160-480q0 21 2.5 40.5T170-400Zm216 0h188q3-20 4.5-39.5T580-480q0-21-1.5-40.5T574-560H386q-3 20-4.5 39.5T380-480q0 21 1.5 40.5T386-400Zm268 0h136q5-20 7.5-39.5T800-480q0-21-2.5-40.5T790-560H654q3 20 4.5 39.5T660-480q0 21-1.5 40.5T654-400Zm-16-240h118q-29-50-72.5-87T584-782q18 33 31.5 68.5T638-640Zm-234 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h118q9-38 22.5-73.5T376-782q-56 18-99.5 55T204-640Z"/></svg>';

// Määritellään kielivaihtoehdot
const languages = [
  { id: 'lang-en', value: 'en', label: 'English (US)', title: 'Show menus in English' },
  { id: 'lang-fi', value: 'fi', label: 'Finnish (Suomi)', title: 'Show menus in Finnish' },
  { id: 'lang-sv', value: 'sv', label: 'Swedish (Svenska)', title: 'Show menus in Swedish' },
  { id: 'lang-ch', value: 'ch', label: 'Chinese (中文)', title: 'Show menus in Chinese' },
];

document.addEventListener('DOMContentLoaded', function() {
  const languageSelectorDiv = document.querySelector('.language-selection.menu-language-selection');
  if (!languageSelectorDiv) {
    console.error('kielenvalitsimen elementtiä ei löytynyt.');
    return;
  }

  // Luodaan kielivalitsin-nappi:
  let languageButton = document.createElement('button');
  languageButton.classList.add('language-button');

  // Lisätään SVG ja teksti napin sisään turvallisesti
  {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(menuLanguageSVG, 'image/svg+xml');
    const svgElement = svgDoc.documentElement; 
    languageButton.appendChild(svgElement);
    languageButton.appendChild(document.createTextNode(' EN'));
  }

  // Liitetään nappi valikkoon
  languageSelectorDiv.appendChild(languageButton);

  // Luodaan kelluva paneeli
  let floatingPanel = document.createElement('div');
  floatingPanel.classList.add('floating-language-panel', 'hidden');
  
  // Rakennetaan paneelin sisältö turvallisesti:
  let panelContent = document.createElement('div');
  panelContent.classList.add('panel-content');

  // "Valitse kieli" -otsikko
  {
    let labelElement = document.createElement('label');
    let boldElement = document.createElement('b');
    boldElement.textContent = 'Valitse kieli';
    labelElement.appendChild(boldElement);
    panelContent.appendChild(labelElement);
  }

  // Kielioptiot
  languages.forEach(lang => {
    let languageOptionDiv = document.createElement('div');
    languageOptionDiv.classList.add('language-option');

    let inputElement = document.createElement('input');
    inputElement.id = lang.id;
    inputElement.type = 'radio';
    inputElement.name = 'menu-lang';
    inputElement.value = lang.value;
    inputElement.title = lang.title;

    let labelLang = document.createElement('label');
    labelLang.setAttribute('for', lang.id);
    labelLang.textContent = lang.label;

    languageOptionDiv.appendChild(inputElement);
    languageOptionDiv.appendChild(labelLang);
    panelContent.appendChild(languageOptionDiv);
  });

  // Lisätään paneelin sisältö paneliin ja sitten bodyyn
  floatingPanel.appendChild(panelContent);
  document.body.appendChild(floatingPanel);

  // Haetaan juuri lisätyt elementit
  const radioInputs = floatingPanel.querySelectorAll('input[name="menu-lang"]');

  // Napin klikkaus avaa/sulkee paneelin
  languageButton.addEventListener('click', function() {
    toggleLanguagePanel();
  });

  // Radioille tapahtumankuuntelijat: kieli vaihtuu -> tallennus, sivun käännös, paneelin sulku
  radioInputs.forEach(function(radio) {
    radio.addEventListener('change', function() {
      localStorage.setItem('selectedLanguage', radio.value);
      updateMenuLanguageDisplay();
      translatePage(radio.value);
      floatingPanel.classList.add('hidden');
    });
  });

  // Asetetaan oletuskieli
  setDefaultMenuLanguage();
  updateMenuLanguageDisplay();

  // Käännetään sivu tallennetulla kielellä
  let savedLang = localStorage.getItem('selectedLanguage') || navigator.language.split('-')[0];
  translatePage(savedLang);

  // Suljetaan paneeli klikatessa ulkopuolelle
  document.addEventListener('click', function(event) {
    if (!languageSelectorDiv.contains(event.target) && !floatingPanel.contains(event.target)) {
      if (!floatingPanel.classList.contains('hidden')) {
        floatingPanel.classList.add('hidden');
      }
    }
  });

  // Tämä funktio näyttää/piilottaa paneelin, 
  // ja asettaa sen sijainnin napin alle.
  function toggleLanguagePanel() {
    // Suljetaan muut vastaavat paneelit (jos on)
    document.querySelectorAll('.floating-language-panel').forEach((panel) => {
      if (panel !== floatingPanel) {
        panel.classList.add('hidden');
      }
    });
    // Sijainnin laskenta
    positionPanelBelowButton();
    floatingPanel.classList.toggle('hidden');
  }

  // Sijoitetaan paneeli napin alapuolelle
  function positionPanelBelowButton() {
    let buttonRect = languageButton.getBoundingClientRect();
    floatingPanel.style.position = 'absolute';
    floatingPanel.style.zIndex = '9999';
    floatingPanel.style.background = 'var(--bg_color_2)';
    floatingPanel.style.border = '1px solid var(--border_color)';
    floatingPanel.style.borderRadius = '4px';
    floatingPanel.style.boxShadow = 'var(--box-shadow)';
    floatingPanel.style.padding = '20px';
    floatingPanel.style.top = (window.scrollY + buttonRect.bottom) + 'px';
    floatingPanel.style.left = (window.scrollX + buttonRect.left) + 'px';
  }
});

// Asetetaan oletuskieli localStoragen tai selaimen mukaan
function setDefaultMenuLanguage() {
  let defaultLang = navigator.language.split('-')[0];
  let savedLang = localStorage.getItem('selectedLanguage') || defaultLang;
  let matchingRadio = document.querySelector(`.floating-language-panel input[value="${savedLang}"]`);
  if (matchingRadio) {
    matchingRadio.checked = true;
  }
}

// Päivittää valitun kielen tekstin buttoniin
export function updateMenuLanguageDisplay() {
  let selectedLanguage = document.querySelector('.floating-language-panel input[type="radio"]:checked')?.value;
  let buttonElement = document.querySelector('.language-selection .language-button');
  if (buttonElement) {
    // Tyhjennetään vanha sisältö
    while (buttonElement.firstChild) {
      buttonElement.removeChild(buttonElement.firstChild);
    }

    // Parsitaan ja lisätään SVG
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(menuLanguageSVG, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;
    buttonElement.appendChild(svgElement);

    // Välilyönti & kielikoodi
    buttonElement.appendChild(document.createTextNode('\u2004'));  // &#x2004;
    let shortLangCode = getShortLanguageCode(selectedLanguage) || 'Select Menu Language';
    buttonElement.appendChild(document.createTextNode(shortLangCode + '\u2009')); // &#x2009;
  }
}

// Palauttaa lyhyen koodin, esim. 'EN'
function getShortLanguageCode(languageCode) {
  const shortCodes = {
    'en': 'EN',
    'fi': 'FI',
    'sv': 'SV',
    'ch': 'CH'
  };
  return shortCodes[languageCode] || languageCode;
}


// // lang_panel.js
// // Täällä luodaan kielivalitsin HTML dynaamisesti ja 
// // kytketään se käännöstoimintoihin, jotka tulevat lang.js-tiedostosta. ☺

// import { translatePage } from './lang.js';

// // Tämä SVG-kuvake näytetään kielivalitsimen napissa
// var menuLanguageSVG = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86q54.5 54.5 86 127T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Zm0-82q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-104-16q-18-33-31.5-68.5T322-320H204q29 50 72.5 87t99.5 55Zm208 0q56-18 99.5-55t72.5-87H638q-9 38-22.5 73.5T584-178ZM170-400h136q-3-20-4.5-39.5T300-480q0-21 1.5-40.5T306-560H170q-5 20-7.5 39.5T160-480q0 21 2.5 40.5T170-400Zm216 0h188q3-20 4.5-39.5T580-480q0-21-1.5-40.5T574-560H386q-3 20-4.5 39.5T380-480q0 21 1.5 40.5T386-400Zm268 0h136q5-20 7.5-39.5T800-480q0-21-2.5-40.5T790-560H654q3 20 4.5 39.5T660-480q0 21-1.5 40.5T654-400Zm-16-240h118q-29-50-72.5-87T584-782q18 33 31.5 68.5T638-640Zm-234 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h118q9-38 22.5-73.5T376-782q-56 18-99.5 55T204-640Z"/></svg>';

// // Määritellään kielivaihtoehdot
// const languages = [
//   { id: 'lang-en', value: 'en', label: 'English (US)', title: 'Show menus in English' },
//   { id: 'lang-fi', value: 'fi', label: 'Finnish (Suomi)', title: 'Show menus in Finnish' },
//   { id: 'lang-sv', value: 'sv', label: 'Swedish (Svenska)', title: 'Show menus in Swedish' },
//   { id: 'lang-ch', value: 'ch', label: 'Chinese (中文)', title: 'Show menus in Chinese' },
// ];

// document.addEventListener('DOMContentLoaded', function() {
//   // Etsitään elementti, johon napin halutaan kuuluvan
//   const languageSelectorDiv = document.querySelector('.language-selection.menu-language-selection');
//   if (!languageSelectorDiv) {
//     console.error('kielenvalitsimen elementtiä ei löytynyt.');
//     return;
//   }

//   // Luodaan kielivalitsin-nappi, jonka alla "kelluva" paneli näytetään
//   let buttonHTML = `
//     <button class="language-button">
//       ${menuLanguageSVG} EN
//     </button>
//   `;
//   languageSelectorDiv.innerHTML = buttonHTML;

//   // Luodaan kelluva paneeli (div) dokumenttitason juureen, jotta se on gridin ulkopuolella
//   let floatingPanel = document.createElement('div');
//   floatingPanel.classList.add('floating-language-panel', 'hidden');

//   // Rakennetaan paneelin sisältö
//   let panelHTML = `
//     <div class="panel-content">
//       <label><b>Valitse kieli</b></label>
//   `;
//   languages.forEach(lang => {
//     panelHTML += `
//       <div class="language-option">
//         <input id="${lang.id}" type="radio" name="menu-lang" value="${lang.value}" title="${lang.title}">
//         <label for="${lang.id}">${lang.label}</label>
//       </div>
//     `;
//   });
//   panelHTML += `</div>`;
//   floatingPanel.innerHTML = panelHTML;

//   // Lisätään paneeli <body>-elementtiin
//   document.body.appendChild(floatingPanel);

//   // Haetaan juuri lisätyt elementit
//   const languageButton = languageSelectorDiv.querySelector('.language-button');
//   const radioInputs = floatingPanel.querySelectorAll('input[name="menu-lang"]');

//   // Napin klikkaus avaa/sulkee kelluvan paneelin
//   languageButton.addEventListener('click', function() {
//     toggleLanguagePanel();
//   });

//   // Radioille tapahtumankuuntelijat: kieli vaihtuu -> tallennus, sivun käännös, paneelin sulku
//   radioInputs.forEach(function(radio) {
//     radio.addEventListener('change', function() {
//       localStorage.setItem('selectedLanguage', radio.value);
//       updateMenuLanguageDisplay();
//       translatePage(radio.value);
//       floatingPanel.classList.add('hidden');
//     });
//   });

//   // Asetetaan oletuskieli
//   setDefaultMenuLanguage();
//   updateMenuLanguageDisplay();

//   // Käännetään sivu tallennetulla kielellä
//   let savedLang = localStorage.getItem('selectedLanguage') || navigator.language.split('-')[0];
//   translatePage(savedLang);

//   // Suljetaan paneeli, jos klikataan sen ulkopuolelle
//   document.addEventListener('click', function(event) {
//     if (!languageSelectorDiv.contains(event.target) && !floatingPanel.contains(event.target)) {
//       if (!floatingPanel.classList.contains('hidden')) {
//         floatingPanel.classList.add('hidden');
//       }
//     }
//   });

//   // Tämä funktio näyttää/piilottaa paneelin, 
//   // ja asettaa sen sijainnin napin alle.
//   function toggleLanguagePanel() {
//     // Suljetaan kaikki muut vastaavat paneelit (jos sellaisia on)
//     document.querySelectorAll('.floating-language-panel').forEach((panel) => {
//       if (panel !== floatingPanel) {
//         panel.classList.add('hidden');
//       }
//     });
//     // Sijainnin laskenta
//     positionPanelBelowButton();
//     floatingPanel.classList.toggle('hidden');
//   }

//   // Sijoitetaan paneeli napin alapuolelle
//   function positionPanelBelowButton() {
//     let buttonRect = languageButton.getBoundingClientRect();
//     floatingPanel.style.position = 'absolute';
//     floatingPanel.style.zIndex = '9999';
//     floatingPanel.style.background = 'var(--bg_color_2)';
//     floatingPanel.style.border = '1px solid var(--border_color)';
//     floatingPanel.style.borderRadius = '4px';
//     floatingPanel.style.boxShadow = 'var(--box-shadow)';
//     floatingPanel.style.padding = '20px';
//     floatingPanel.style.top = (window.scrollY + buttonRect.bottom) + 'px';
//     floatingPanel.style.left = (window.scrollX + buttonRect.left) + 'px';
//   }
// });

// // Asetetaan oletuskieli localStoragen tai selaimen mukaan
// function setDefaultMenuLanguage() {
//   let defaultLang = navigator.language.split('-')[0];
//   let savedLang = localStorage.getItem('selectedLanguage') || defaultLang;
//   let matchingRadio = document.querySelector(`.floating-language-panel input[value="${savedLang}"]`);
//   if (matchingRadio) {
//     matchingRadio.checked = true;
//   }
// }

// // Päivittää valitun kielen tekstin buttoniin
// export function updateMenuLanguageDisplay() {
//     let selectedLanguage = document.querySelector('.floating-language-panel input[type="radio"]:checked')?.value;
//     let buttonElement = document.querySelector('.language-selection .language-button');
//     if (buttonElement) {
//       buttonElement.innerHTML = menuLanguageSVG + '&#x2004;' 
//         + (getShortLanguageCode(selectedLanguage) + "&#x2009;" || "Select Menu Language");
//     }
//   }

// // Palauttaa lyhyen koodin, esim. 'EN'
// function getShortLanguageCode(languageCode) {
//   const shortCodes = {
//     'en': 'EN',
//     'fi': 'FI',
//     'sv': 'SV',
//     'ch': 'CH'
//   };
//   return shortCodes[languageCode] || languageCode;
// }