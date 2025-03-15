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
