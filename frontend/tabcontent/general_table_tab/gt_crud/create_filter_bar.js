/* create_filter_bar.js */

import { resetOffset } from '../../../common_actions/infinite_scroll/infinite_scroll.js';
import { applySort } from './gt_read/apply_sort.js';
import { filter_table } from './gt_read/filterbar/filter.js';
import { create_collapsible_section } from './collapsible_section.js';
import { create_chat_ui } from './chat.js'; // Huom! tuodaan nyt samasta tiedostosta
import { generate_table } from '../gt_crud/gt_read/view_table.js';

export function create_filter_bar(table_name, columns, data_types) {
  let filter_bar = document.getElementById(`${table_name}_filterBar`);
  if (!filter_bar) {
    filter_bar = document.createElement('div');
    filter_bar.id = `${table_name}_filterBar`;
    filter_bar.classList.add('filterBar'); // Koko korkeus, oikea reuna

    // 1) Hakukenttä yläreunaan
    const search_row = document.createElement('div');
    search_row.classList.add('filterBar-search-row');
    const global_search_input = document.createElement('input');
    global_search_input.type = 'text';
    global_search_input.placeholder = 'Hae jotain...';
    global_search_input.id = `${table_name}_global_search_input`;
    search_row.appendChild(global_search_input);
    filter_bar.appendChild(search_row);

    // 2) Välilehtipainikkeet (Sort+Filtterit / Chat)
    const tabs_row = document.createElement('div');
    tabs_row.classList.add('filterBar-tabs-row');
    const tab_button_sortfilter = document.createElement('button');
    tab_button_sortfilter.textContent = 'Suodata ja järjestä';

    const tab_button_chat = document.createElement('button');
    tab_button_chat.textContent = 'Chat';

    tabs_row.appendChild(tab_button_sortfilter);
    tabs_row.appendChild(tab_button_chat);
    filter_bar.appendChild(tabs_row);

    // 3) Sisältöalue
    const tabs_content_container = document.createElement('div');
    tabs_content_container.classList.add('tabs_content_container');

    // 3a) Sort+filter -container
    const sort_filter_section = document.createElement('div');
    sort_filter_section.classList.add('sort_filter_section');
    // oletuksena näkyvissä
    sort_filter_section.classList.remove('hidden');

    const top_sections = document.createElement('div');
    top_sections.classList.add('top-sections');

    // Sorttaus
    const sort_container = document.createElement('div');
    sort_container.classList.add('filterBar-section');

    const sort_label = document.createElement('label');
    sort_label.textContent = 'Sort by column:';
    sort_container.appendChild(sort_label);

    const sort_options_container = document.createElement('div');
    columns.forEach((column) => {
      const sort_button = document.createElement('button');
      sort_button.textContent = column;
      sort_button.addEventListener('click', () => {
        applySort(table_name, column);
      });
      sort_options_container.appendChild(sort_button);
    });
    sort_container.appendChild(sort_options_container);

    const sort_collapsible = create_collapsible_section('Sorttaus', sort_container, true);
    top_sections.appendChild(sort_collapsible);

    // Filter-kentät
    const filter_container = document.createElement('div');
    filter_container.classList.add('filterBar-section');

    columns.forEach((column) => {
      const filter_element = create_filter_element(column, data_types[column], table_name);
      filter_container.appendChild(filter_element);
    });

    const filter_collapsible = create_collapsible_section('Filtterit', filter_container, false);
    top_sections.appendChild(filter_collapsible);

    sort_filter_section.appendChild(top_sections);

    // 3b) Chat -container
    const chat_section = document.createElement('div');
    chat_section.classList.add('chat_section');
    // oletuksena piilossa
    chat_section.classList.add('hidden');

    // Chat UI
    create_chat_ui(table_name, chat_section);

    tab_button_sortfilter.classList.remove('tab-button-active');
    tab_button_chat.classList.add('tab-button-active');
    sort_filter_section.classList.add('hidden');
    chat_section.classList.remove('hidden');

    // Lisätään containeriin
    tabs_content_container.appendChild(sort_filter_section);
    tabs_content_container.appendChild(chat_section);

    filter_bar.appendChild(tabs_content_container);

    const table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
    if (!table_parts_container) {
      console.error(`error: container ${table_name}_table_parts_container not found for table: ${table_name}`);
      return;
    }
    table_parts_container.appendChild(filter_bar);

    // Tab-nappien klikkilogiikka
    tab_button_sortfilter.addEventListener('click', () => {
      tab_button_sortfilter.classList.add('tab-button-active');
      tab_button_chat.classList.remove('tab-button-active');
      sort_filter_section.classList.remove('hidden');
      chat_section.classList.add('hidden');
    });

    tab_button_chat.addEventListener('click', () => {
      tab_button_chat.classList.add('tab-button-active');
      tab_button_sortfilter.classList.remove('tab-button-active');
      chat_section.classList.remove('hidden');
      sort_filter_section.classList.add('hidden');
    });
  }
}

function create_filter_element(column, data_type, table_name) {
  const container = document.createElement('div');
  container.classList.add('input-group');

  let dt_string = 'text';
  if (data_type && data_type.data_type) {
    dt_string = data_type.data_type.toLowerCase();
  }

  // Jos sarake on openai_embedding, luodaan erikoiskenttä semanttiselle hakulauseelle
  if (column === 'openai_embedding') {
    // Luodaan text-kenttä, johon käyttäjä syöttää hakuterminsä
    const semantic_input = document.createElement('input');
    semantic_input.type = 'text';
    semantic_input.placeholder = 'Anna semanttinen hakusana... (Esim. \"Tiina leipoo\")';
    semantic_input.id = `${table_name}_filter_semantic_${column}`;

    // Kun käyttäjä kirjoittaa, kutsutaan semanttista hakua
    semantic_input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        // Kutsutaan semanttisen haun endpointia
        do_semantic_search(table_name, semantic_input.value);
      }
    });

    container.appendChild(semantic_input);

    const label = document.createElement('label');
    label.setAttribute('for', semantic_input.id);
    label.textContent = 'Semantic vector search';
    container.appendChild(label);

    return container;
  }

  // Muuten: normaali datatyyppilogiikka
  let input;
  switch (dt_string) {
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'numeric':
      input = document.createElement('input');
      input.type = 'number';
      input.placeholder = ' ';
      break;
    case 'boolean':
      input = document.createElement('select');
      container.classList.add('no-float');
      {
        const opt_all = document.createElement('option');
        opt_all.value = '';
        opt_all.textContent = 'All';
        input.appendChild(opt_all);

        const opt_true = document.createElement('option');
        opt_true.value = 'true';
        opt_true.textContent = 'True';
        input.appendChild(opt_true);

        const opt_false = document.createElement('option');
        opt_false.value = 'false';
        opt_false.textContent = 'False';
        input.appendChild(opt_false);
      }
      break;
    case 'date':
    case 'timestamp':
    case 'timestamp without time zone':
    case 'timestamp with time zone':
      input = document.createElement('input');
      input.type = 'date';
      input.placeholder = ' ';
      break;
    default:
      input = document.createElement('input');
      input.type = 'text';
      input.placeholder = ' ';
  }

  input.id = `${table_name}_filter_${column}`;
  input.addEventListener('input', () => {
    filter_table(table_name);
    resetOffset();
  });

  container.appendChild(input);

  const label = document.createElement('label');
  label.setAttribute('for', input.id);
  label.textContent = column;
  container.appendChild(label);

  return container;
}

// Tässä yksinkertainen semanttisen haun kutsu –
// todellisuus vaatii serveripuolen endpointin, joka hoitaa embedding + vektorikyselyn.
async function do_semantic_search(table_name, user_query) {
  console.log("Semanttinen haku, user_query:", user_query);
  if (!user_query.trim()) return;

  const url = `/api/get-results-vector?table=${encodeURIComponent(table_name)}&vector_query=${encodeURIComponent(user_query)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`vector search error (status ${resp.status})`);
    }
    const data = await resp.json();
    // data: { columns, data, types, ... }
    console.log("Semanttinen haku tulos:", data);
    // Päivitä taulu UI:hin
    update_table_ui(table_name, data);
  } catch (e) {
    console.error("do_semantic_search error:", e);
  }
}

export function update_table_ui(table_name, result) {
  // Oletetaan, että result on samaa muotoa kuin getResultsin palauttama JSON:
  // { columns: [...], data: [...], types: {...}, resultsPerLoad: ... }

  const { columns, data, types } = result;

  // Kutsutaan samaa generate_table-funktiota, joka
  // rakentaa/ päivityttää taulurivit DOM:iin
  generate_table(table_name, columns, data, types);
}
