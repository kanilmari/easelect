/**
 * draw_view_selector_buttons.js
 *
 * Luo uudet näkymäpainikkeet omaan diviin.
 * Näissä painikkeissa käytetään näkymäavaimia: 'normal', 'transposed', 'ticket'.
 */

import { refresh_table } from '../general_tables/gt_crud/gt_read/table_refresh_collector.js';
// import { load_table } from "../navigation/load_table.js"; // POISTETTU

/**
 * Luo uuden näkymävalitsimen annetulle taululle.
 */
export function createNewViewSelector(tableName, currentView) {
  const container = document.createElement('div');
  container.id = `${tableName}_newViewSelector`;
  container.classList.add('new-view-selector', 'view-selector-buttons');

  const normalButton = createNewViewButton('Lista', 'normal', tableName, currentView);
  const transposedButton = createNewViewButton('Vertailu', 'transposed', tableName, currentView);
  const ticketButton = createNewViewButton('Tiketti', 'ticket', tableName, currentView);

  container.appendChild(normalButton);
  container.appendChild(transposedButton);
  container.appendChild(ticketButton);

  return container;
}

function createNewViewButton(label, viewKey, tableName, currentView) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.classList.add('new-view-button');

  if (viewKey === currentView) {
    btn.classList.add('active');
    btn.style.fontWeight = 'bold';
  }

  btn.addEventListener('mouseenter', () => {
    btn.style.backgroundColor = 'var(--button_hover_bg_color)';
    btn.style.color = 'var(--button_hover_text_color)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.backgroundColor = 'var(--button_bg_color)';
    btn.style.color = 'var(--button_text_color)';
  });

  // Klikkauksessa tallennetaan näkymä localStorageen ja kutsutaan refresh_table
  btn.addEventListener('click', () => {
    localStorage.setItem(`${tableName}_view`, viewKey);
    refresh_table(tableName);
  });

  return btn;
}

export function createViewSelectorButtons(table_name, current_view) {
  const container = document.createElement('div');
  container.classList.add('view-selector-buttons');

  const tableButton = createOneViewButton('Taulunäkymä', 'table', table_name, current_view);
  const cardButton  = createOneViewButton('Korttinäkymä', 'card', table_name, current_view);
  const treeButton  = createOneViewButton('Puunäkymä', 'tree', table_name, current_view);

  container.appendChild(tableButton);
  container.appendChild(cardButton);
  container.appendChild(treeButton);

  return container;
}

function createOneViewButton(label, viewKey, table_name, current_view) {
  const btn = document.createElement('button');
  btn.textContent = label;

  btn.style.backgroundColor = 'var(--button_bg_color)';
  btn.style.color = 'var(--button_text_color)';
  btn.addEventListener('mouseenter', () => {
    btn.style.backgroundColor = 'var(--button_hover_bg_color)';
    btn.style.color = 'var(--button_hover_text_color)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.backgroundColor = 'var(--button_bg_color)';
    btn.style.color = 'var(--button_text_color)';
  });

  if (viewKey === current_view) {
    btn.style.fontWeight = 'bold';
  }

  btn.addEventListener('click', () => {
    localStorage.setItem(`${table_name}_view`, viewKey);
    // load_table(table_name); // POISTETTU
    refresh_table(table_name);
  });

  return btn;
}


// /**
//  * draw_view_selector_buttons.js 2025-03-15--18-35
//  *
//  * Luo uudet näkymäpainikkeet omaan diviin.
//  * Näissä painikkeissa käytetään näkymäavaimia: 'normal', 'transposed' ja 'ticket'.
//  *
//  * Esimerkin toiminnallisuus:
//  * - Tallennetaan valittu näkymä localStorageen (avaimella `${tableName}_view`)
//  * - Kutsutaan näkymän päivitysfunktiota, esim. load_table(tableName)
//  */

// import { load_table } from "../navigation/load_table.js"; // tai muu oma näkymänlatausfunktio

// /**
//  * Luo uuden näkymävalitsimen annetulle taululle.
//  *
//  * @param {string} tableName - Taulun nimi (käytetään myös localStoragen avaimena)
//  * @param {string} currentView - Tällä hetkellä aktiivinen näkymä, esim. 'normal'
//  * @returns {HTMLDivElement} Div, joka sisältää uudet näkymäpainikkeet.
//  */
// export function createNewViewSelector(tableName, currentView) {
//   const container = document.createElement('div');
//   container.id = `${tableName}_newViewSelector`;
//   container.classList.add('new-view-selector');
//   container.classList.add('view-selector-buttons');
//   // Voit lisätä tähän lisätyylitystä esim. display: flex, gap jne.

//   // Luodaan painikkeet: Normaali, Käänteinen ja Tiketti
//   const normalButton = createNewViewButton('Lista', 'normal', tableName, currentView);
//   const transposedButton = createNewViewButton('Vertailu', 'transposed', tableName, currentView);
//   const ticketButton = createNewViewButton('Tiketti', 'ticket', tableName, currentView);

//   container.appendChild(normalButton);
//   container.appendChild(transposedButton);
//   container.appendChild(ticketButton);

//   return container;
// }

// /**
//  * Luo yhden näkymäpainikkeen.
//  *
//  * @param {string} label - Näytettävä teksti painikkeessa
//  * @param {string} viewKey - Näkymän tunniste ('normal', 'transposed', 'ticket')
//  * @param {string} tableName - Taulun nimi, jota näkymä koskee
//  * @param {string} currentView - Tällä hetkellä aktiivinen näkymä
//  * @returns {HTMLButtonElement} Näkymäpainike
//  */
// function createNewViewButton(label, viewKey, tableName, currentView) {
//   const btn = document.createElement('button');
//   btn.textContent = label;
//   btn.classList.add('new-view-button');

//   // Korostetaan aktiivinen näkymä
//   if (viewKey === currentView) {
//     btn.classList.add('active');
//     btn.style.fontWeight = 'bold';
//   }

//   // Määritellään hover-tyylit (voit käyttää myös CSS:ää)
//   btn.addEventListener('mouseenter', () => {
//     btn.style.backgroundColor = 'var(--button_hover_bg_color)';
//     btn.style.color = 'var(--button_hover_text_color)';
//   });
//   btn.addEventListener('mouseleave', () => {
//     btn.style.backgroundColor = 'var(--button_bg_color)';
//     btn.style.color = 'var(--button_text_color)';
//   });

//   // Klikkauksessa tallennetaan näkymä localStorageen ja kutsutaan näkymän päivitysfunktiota
//   btn.addEventListener('click', () => {
//     localStorage.setItem(`${tableName}_view`, viewKey);
//     load_table(tableName);
//   });

//   return btn;
// }

// export function createViewSelectorButtons(table_name, current_view) {
//   const container = document.createElement('div');
//   container.classList.add('view-selector-buttons');
//   // Voit lisätä tähän haluamiasi CSS-tyylejä:
//   // esim. .view-selector-buttons { display: flex; gap: 0.5rem; }

//   // Luodaan kolme nappia
//   const tableButton = createOneViewButton('Taulunäkymä', 'table', table_name, current_view);
//   const cardButton = createOneViewButton('Korttinäkymä', 'card', table_name, current_view);
//   const treeButton = createOneViewButton('Puunäkymä', 'tree', table_name, current_view);

//   // Lisätään napit containeriin
//   container.appendChild(tableButton);
//   container.appendChild(cardButton);
//   container.appendChild(treeButton);

//   return container;
// }

// /**
//  * Apufunktio, joka tekee yhden näkymäpainikkeen (label + klikkaus).
//  * Näkymän vaihto toteutuu tallentamalla localStorageen ja kutsumalla load_table(table_name).
//  */
// function createOneViewButton(label, viewKey, table_name, current_view) {
//   const btn = document.createElement('button');
//   btn.textContent = label;

//   // Halutessasi voit kopioida saman hover-käsittelyn kuin entisessä "Näytä ▼" -napissa:
//   btn.style.backgroundColor = 'var(--button_bg_color)';
//   btn.style.color = 'var(--button_text_color)';
//   btn.addEventListener('mouseenter', () => {
//     btn.style.backgroundColor = 'var(--button_hover_bg_color)';
//     btn.style.color = 'var(--button_hover_text_color)';
//   });
//   btn.addEventListener('mouseleave', () => {
//     btn.style.backgroundColor = 'var(--button_bg_color)';
//     btn.style.color = 'var(--button_text_color)';
//   });

//   // Korostus, jos tämä nappi vastaa current_view:ia
//   if (viewKey === current_view) {
//     btn.style.fontWeight = 'bold';
//   }

//   // Klikattaessa päivitetään localStorage ja kutsutaan load_table
//   btn.addEventListener('click', () => {
//     localStorage.setItem(`${table_name}_view`, viewKey);
//     load_table(table_name); // HUOM: Varmista, että load_table on globaalisti saatavilla,
//     // tai tuo se importilla. Ks. huomio alla.
//   });

//   return btn;
// }