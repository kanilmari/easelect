import { load_table } from "../navigation/load_table.js";

/**
 * Luo kolme painiketta (Taulu, Kortti, Puu) suoraan näkyviin,
 * korvaten entisen "Näytä ▼" -dropdownin. Jokainen nappi:
 *  - Tallentaa valinnan localStorageen
 *  - Kutsuu load_table(table_name) päivittämään näkymän
 *
 * @param {string} table_name  - Minkä taulun näkymää vaihdetaan
 * @param {string} current_view - Esim. 'table', 'card', 'tree'
 * @returns {HTMLDivElement}   - Div, jossa on kolme nappia
 */

export function createViewSelectorButtons(table_name, current_view) {
  const container = document.createElement('div');
  container.classList.add('view-selector-buttons');
  // Voit lisätä tähän haluamiasi CSS-tyylejä:
  // esim. .view-selector-buttons { display: flex; gap: 0.5rem; }

  // Luodaan kolme nappia
  const tableButton = createOneViewButton('Taulunäkymä', 'table', table_name, current_view);
  const cardButton = createOneViewButton('Korttinäkymä', 'card', table_name, current_view);
  const treeButton = createOneViewButton('Puunäkymä', 'tree', table_name, current_view);

  // Lisätään napit containeriin
  container.appendChild(tableButton);
  container.appendChild(cardButton);
  container.appendChild(treeButton);

  return container;
}

/**
 * Apufunktio, joka tekee yhden näkymäpainikkeen (label + klikkaus).
 * Näkymän vaihto toteutuu tallentamalla localStorageen ja kutsumalla load_table(table_name).
 */
function createOneViewButton(label, viewKey, table_name, current_view) {
  const btn = document.createElement('button');
  btn.textContent = label;

  // Halutessasi voit kopioida saman hover-käsittelyn kuin entisessä "Näytä ▼" -napissa:
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

  // Korostus, jos tämä nappi vastaa current_view:ia
  if (viewKey === current_view) {
    btn.style.fontWeight = 'bold';
  }

  // Klikattaessa päivitetään localStorage ja kutsutaan load_table
  btn.addEventListener('click', () => {
    localStorage.setItem(`${table_name}_view`, viewKey);
    load_table(table_name); // HUOM: Varmista, että load_table on globaalisti saatavilla,
    // tai tuo se importilla. Ks. huomio alla.
  });

  return btn;
}
