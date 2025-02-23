/**
 * draw_view_selector_buttons.js
 *
 * Luo uudet näkymäpainikkeet omaan diviin.
 * Näissä painikkeissa käytetään näkymäavaimia: 'normal', 'transposed' ja 'ticket'.
 *
 * Esimerkin toiminnallisuus:
 * - Tallennetaan valittu näkymä localStorageen (avaimella `${tableName}_view`)
 * - Kutsutaan näkymän päivitysfunktiota, esim. load_table(tableName)
 */

import { load_table } from "../../main_app/navigation/load_table.js"; // tai muu oma näkymänlatausfunktio

/**
 * Luo uuden näkymävalitsimen annetulle taululle.
 *
 * @param {string} tableName - Taulun nimi (käytetään myös localStoragen avaimena)
 * @param {string} currentView - Tällä hetkellä aktiivinen näkymä, esim. 'normal'
 * @returns {HTMLDivElement} Div, joka sisältää uudet näkymäpainikkeet.
 */
export function createNewViewSelector(tableName, currentView) {
  const container = document.createElement('div');
  container.id = `${tableName}_newViewSelector`;
  container.classList.add('new-view-selector');
  container.classList.add('view-selector-buttons');
  // Voit lisätä tähän lisätyylitystä esim. display: flex, gap jne.

  // Luodaan painikkeet: Normaali, Käänteinen ja Tiketti
  const normalButton = createNewViewButton('Lista', 'normal', tableName, currentView);
  const transposedButton = createNewViewButton('Vertailu', 'transposed', tableName, currentView);
  const ticketButton = createNewViewButton('Tiketti', 'ticket', tableName, currentView);

  container.appendChild(normalButton);
  container.appendChild(transposedButton);
  container.appendChild(ticketButton);

  return container;
}

/**
 * Luo yhden näkymäpainikkeen.
 *
 * @param {string} label - Näytettävä teksti painikkeessa
 * @param {string} viewKey - Näkymän tunniste ('normal', 'transposed', 'ticket')
 * @param {string} tableName - Taulun nimi, jota näkymä koskee
 * @param {string} currentView - Tällä hetkellä aktiivinen näkymä
 * @returns {HTMLButtonElement} Näkymäpainike
 */
function createNewViewButton(label, viewKey, tableName, currentView) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.classList.add('new-view-button');

  // Korostetaan aktiivinen näkymä
  if (viewKey === currentView) {
    btn.classList.add('active');
    btn.style.fontWeight = 'bold';
  }

  // Määritellään hover-tyylit (voit käyttää myös CSS:ää)
  btn.addEventListener('mouseenter', () => {
    btn.style.backgroundColor = 'var(--button_hover_bg_color)';
    btn.style.color = 'var(--button_hover_text_color)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.backgroundColor = 'var(--button_bg_color)';
    btn.style.color = 'var(--button_text_color)';
  });

  // Klikkauksessa tallennetaan näkymä localStorageen ja kutsutaan näkymän päivitysfunktiota
  btn.addEventListener('click', () => {
    localStorage.setItem(`${tableName}_view`, viewKey);
    load_table(tableName);
  });

  return btn;
}
