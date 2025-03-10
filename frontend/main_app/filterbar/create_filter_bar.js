// create_filter_bar.js

// 1) Tuodaan tarvittavat importit
import { resetOffset } from '../../logical_components/infinite_scroll/infinite_scroll.js';
import { applySort } from '../general_tables/gt_crud/gt_read/apply_sort.js';
import { filter_table } from './filter.js';
import { create_collapsible_section } from '../../logical_components/collapsible_section.js';
import { create_chat_ui } from '../../logical_components/ai_features/table_chat/chat.js';
import { generate_table } from '../../logical_components/table_views/view_table.js';
import { createViewSelectorButtons } from './draw_view_selector_buttons.js';
import {
  createAddRowButton,
  createDeleteSelectedButton,
  createColumnManagementButton
} from '../general_tables/gt_toolbar/button_factory.js';
import { createColumnVisibilityDropdown } from '../general_tables/gt_toolbar/column_visibility_dropdown.js';

// TUODAAN MYÖS UUSI VIEW-SELECTOR (halutessasi voit käyttää tätä tai jättää pois):
import { createNewViewSelector } from '../../logical_components/table_views/draw_view_selector_buttons.js';

/**
 * Kerää kaikkien ko. taulun filttereiden arvot ja tallentaa ne localStorageen.
 */
function saveFilters(tableName) {
  const filterElements = document.querySelectorAll(`[id^="${tableName}_filter_"]`);
  const filters = {};
  filterElements.forEach(elem => {
    filters[elem.id] = elem.value;
  });
  localStorage.setItem(`${tableName}_filters`, JSON.stringify(filters));
}

/**
 * Haetaan rivimäärä (esimerkkinä). Voit muokata tai poistaa tämän halutessasi.
 */
async function fetchRowCount(table_name) {
  try {
    const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
      method: 'GET',
      credentials: 'include'
    });
    if (!resp.ok) {
      throw new Error(`error (status: ${resp.status})`);
    }
    const data = await resp.json();
    if (data && typeof data.row_count === 'number') {
      return data.row_count;
    } else {
      throw new Error("row_count missing in response");
    }
  } catch (error) {
    console.error("virhe fetchRowCount-funktiossa:", error);
    return null;
  }
}

/**
 * Luokitellaan sarake haluttuun kategoriaan sarakkeen nimen ja data-tyypin perusteella.
 * (Voit säätää logiikkaa omaan makuusi.)
 */
function determineColumnCategory(column, data_type) {
  if (column === 'id') {
    return 'id';
  }
  const lowerCol = column.toLowerCase();
  if (lowerCol.endsWith('_id') || lowerCol.endsWith('_uid')) {
    return 'additional_id';
  }
  if (
    data_type === 'numeric' ||
    data_type === 'integer' ||
    data_type === 'bigint' ||
    data_type === 'smallint' ||
    data_type === 'real' ||
    data_type === 'double precision'
  ) {
    return 'numeric';
  }
  if (data_type === 'boolean') {
    return 'boolean';
  }
  if (lowerCol.endsWith('(linked)') || lowerCol.endsWith('(ln)')) {
    return 'linked';
  }
  if (
    data_type === 'date' ||
    data_type === 'timestamp' ||
    data_type === 'timestamp without time zone' ||
    data_type === 'timestamp with time zone'
  ) {
    return 'date';
  }
  return 'text';
}

/**
 * Luo suodatus-elementin kullekin sarakkeelle. 
 * Asettaa arvon localStoragesta, jos sellainen on tallennettuna.
 */
function create_filter_element(column, data_type, table_name) {
  const container = document.createElement('div');
  container.classList.add('input-group');

  // Luetaan localStoragen filtterit, jos on
  let storedFilters = {};
  const stored = localStorage.getItem(`${table_name}_filters`);
  if (stored) {
    try {
      storedFilters = JSON.parse(stored);
    } catch (err) {
      console.warn('Virhe parse:ssa table-filters:', err);
    }
  }

  let dt_string =
    typeof data_type === 'object' && data_type.data_type
      ? data_type.data_type.toLowerCase()
      : (data_type || '').toLowerCase();

  // Erikoistapaus: openai_embedding (esimerkkinä semanttinen haku)
  if (column === 'openai_embedding') {
    const semantic_input = document.createElement('input');
    semantic_input.type = 'text';
    semantic_input.placeholder = 'Anna semanttinen hakusana...';
    semantic_input.id = `${table_name}_filter_semantic_${column}`;

    // Jos localStoragessa oli tallennettuna arvo
    if (storedFilters[semantic_input.id]) {
      semantic_input.value = storedFilters[semantic_input.id];
    }

    semantic_input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
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

  // Määritellään input tai useampi sen mukaan, mitä tyyppiä sarake on
  let input;

  // Date/number -> min–max:
  if (
    [
      'integer',
      'bigint',
      'smallint',
      'numeric',
      'real',
      'double precision',
      'date',
      'timestamp',
      'timestamp without time zone',
      'timestamp with time zone'
    ].includes(dt_string)
  ) {
    const fromInput = document.createElement('input');
    const toInput = document.createElement('input');

    if (
      [
        'integer',
        'bigint',
        'smallint',
        'numeric',
        'real',
        'double precision'
      ].includes(dt_string)
    ) {
      fromInput.type = 'number';
      toInput.type = 'number';
      fromInput.placeholder = 'Min';
      toInput.placeholder = 'Max';
    } else {
      fromInput.type = 'date';
      toInput.type = 'date';
      fromInput.placeholder = 'From';
      toInput.placeholder = 'To';
    }

    fromInput.id = `${table_name}_filter_${column}_from`;
    toInput.id = `${table_name}_filter_${column}_to`;

    // Asetetaan localStoragen arvot
    if (storedFilters[fromInput.id]) {
      fromInput.value = storedFilters[fromInput.id];
    }
    if (storedFilters[toInput.id]) {
      toInput.value = storedFilters[toInput.id];
    }

    // Kuuntelijat
    [fromInput, toInput].forEach((inputField) => {
      inputField.addEventListener('input', () => {
        filter_table(table_name);
        resetOffset();
        saveFilters(table_name);
      });
      container.appendChild(inputField);
    });

    const label = document.createElement('label');
    label.textContent = column;
    container.appendChild(label);
  } else if (dt_string === 'boolean') {
    // Boolean-sarake -> <select>
    input = document.createElement('select');
    input.id = `${table_name}_filter_${column}`;
    container.classList.add('no-float');

    ['', 'true', 'false', 'empty'].forEach((val) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent =
        val === ''
          ? 'All'
          : val === 'empty'
          ? 'Empty'
          : val.charAt(0).toUpperCase() + val.slice(1);
      input.appendChild(opt);
    });

    // Jos localStoragessa on tallennettu arvo
    if (storedFilters[input.id]) {
      input.value = storedFilters[input.id];
    }

    input.addEventListener('input', () => {
      filter_table(table_name);
      resetOffset();
      saveFilters(table_name);
    });
    container.appendChild(input);

    const label = document.createElement('label');
    label.setAttribute('for', input.id);
    label.textContent = column;
    container.appendChild(label);
  } else {
    // Tekstikenttä
    input = document.createElement('input');
    input.type = 'text';
    input.placeholder = ' ';
    input.id = `${table_name}_filter_${column}`;

    // Asetetaan tallennettu arvo, jos sellainen on
    if (storedFilters[input.id]) {
      input.value = storedFilters[input.id];
    }

    input.addEventListener('input', () => {
      filter_table(table_name);
      resetOffset();
      saveFilters(table_name);
    });
    container.appendChild(input);

    const label = document.createElement('label');
    label.setAttribute('for', input.id);
    label.textContent = column;
    container.appendChild(label);
  }

  return container;
}

/**
 * Varsinainen semanttinen haku (esimerkki).
 */
async function do_semantic_search(table_name, user_query) {
  console.log('Semanttinen haku, user_query:', user_query);
  if (!user_query.trim()) return;

  const url = `/api/get-results-vector?table=${encodeURIComponent(
    table_name
  )}&vector_query=${encodeURIComponent(user_query)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`vector search error (status ${resp.status})`);
    }
    const data = await resp.json();
    console.log('Semanttinen haku tulos:', data);
    update_table_ui(table_name, data);
  } catch (e) {
    console.error('do_semantic_search error:', e);
  }
}

/**
 * Kutsutaan generate_table(...) ja laitetaan tulos readOnlyContaineriin (esim. päivityksen jälkeen).
 */
function showReadOnlyTable(table_name, columns, data, types) {
  const readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
  if (!readOnlyContainer) {
    console.error('Virhe: readOnlyContainer puuttuu!');
    return;
  }
  readOnlyContainer.innerHTML = '';
  const tableEl = generate_table(table_name, columns, data, types);
  if (tableEl) {
    readOnlyContainer.appendChild(tableEl);
  }
}

/**
 * Päivitetään taulu semanttisen haun tuloksilla (tai muilla tuloksilla).
 */
export function update_table_ui(table_name, result) {
  const { columns, data, types } = result;
  showReadOnlyTable(table_name, columns, data, types);
}

/**
 * Avataan SSE-yhteys /openai_embedding_stream_handler -reitille 
 * ja päivitetään konsolia / pientä logia.
 */
function embedAllData(table_name) {
  console.log(`Aloitetaan SSE: /openai_embedding_stream_handler?table_name=${table_name}`);
  
  // Voit luoda myös pienen log-divin, jos haluat näyttää lokit UI:ssa.
  const embedLogId = `${table_name}_embed_log`;
  let embedLog = document.getElementById(embedLogId);
  if (!embedLog) {
    embedLog = document.createElement('div');
    embedLog.id = embedLogId;
    embedLog.style.border = '1px solid var(--border_color)';
    embedLog.style.padding = '0.5rem';
    embedLog.style.maxHeight = '200px';
    embedLog.style.overflowY = 'auto';
    embedLog.style.marginTop = '0.5rem';
    const filterBar = document.getElementById(`${table_name}_filterBar`);
    if (filterBar) {
      filterBar.appendChild(embedLog);
    }
  }

  function appendLog(msg) {
    console.log(msg);
    const p = document.createElement('p');
    p.textContent = msg;
    embedLog.appendChild(p);
    embedLog.scrollTop = embedLog.scrollHeight;
  }

  const url = `/openai_embedding_stream_handler?table_name=${encodeURIComponent(table_name)}`;
  const evtSource = new EventSource(url);

  evtSource.addEventListener('progress', (e) => {
    appendLog(`[progress] ${e.data}`);
  });
  evtSource.addEventListener('error', (e) => {
    // Tämä on palvelimen lähettämä 'error'-event
    appendLog(`virhe serveriltä: ${e.data}`);
  });
  evtSource.addEventListener('done', (e) => {
    appendLog(`Valmis: ${e.data}`);
    evtSource.close();
  });

  // Mahdolliset verkko-/SSE-yhteyden virheet
  evtSource.onerror = (err) => {
    console.error('SSE transport error:', err);
    appendLog('virhe: SSE-yhteys katkesi tai ei onnistu');
    evtSource.close();
  };
}

/**
 * Pieni apufunktio luomaan "Embeditä data" -nappi
 */
function createEmbedButton(table_name) {
  const btn = document.createElement('button');
  btn.textContent = 'Luo embedding';
  btn.addEventListener('click', () => {
    embedAllData(table_name);
  });
  return btn;
}

/**
 * create_filter_bar:
 *  - Luo suodatuspalkin (filterBar) ja asettaa kentille arvot localStoragesta jo luontivaiheessa
 *  - Yläpuolen rivit: rivimäärä, CRUD-napit, jne.
 *  - Global-hakukenttä
 *  - Varsinaiset sarakefiltterit (min–max, boolean, tekstikenttä jne.)
 *  - Chat-nappula
 */
export function create_filter_bar(table_name, columns, data_types, current_view) {
  // 0) Luodaan tai haetaan table_parts_container
  let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
  if (!table_parts_container) {
    table_parts_container = document.createElement('div');
    table_parts_container.id = `${table_name}_table_parts_container`;
    document.body.appendChild(table_parts_container);
  }

  // 1) Luodaan filterBar, jos sitä ei vielä ole
  let filter_bar = document.getElementById(`${table_name}_filterBar`);
  if (!filter_bar) {
    filter_bar = document.createElement('div');
    filter_bar.id = `${table_name}_filterBar`;
    filter_bar.classList.add('filterBar');

    // 1a) Otsikko
    const title_container = document.createElement('div');
    const table_name_element = document.createElement('div');
    table_name_element.textContent = table_name;
    table_name_element.style.fontWeight = 'bold';
    table_name_element.style.fontSize = '20px';
    table_name_element.setAttribute('data-lang-key', table_name);
    table_name_element.title = table_name;
    title_container.appendChild(table_name_element);
    filter_bar.appendChild(title_container);

    // Lisätään taulun “aktuaalinen nimi” pienemmällä tekstillä // Säilytä tämä
    const small_table_name_div = document.createElement('div');
    small_table_name_div.textContent = table_name;
    title_container.appendChild(small_table_name_div);

    // 2) Yläpuolen rivit: rivimäärä, CRUD-napit ja näkymävalitsimet
    const top_row = document.createElement('div');
    top_row.classList.add('filterBar-top-row');

    // Rivimäärä ja CRUD-napit ensimmäiselle riville
    const first_line_div = document.createElement('div');
    first_line_div.classList.add('top-row-first-line');
    const row_count_element = document.createElement('span');
    row_count_element.textContent = 'Rows: ...';
    fetchRowCount(table_name).then((count) => {
      row_count_element.textContent = count !== null ? `Rows: ${count}` : 'Rows: ?';
    });
    first_line_div.appendChild(row_count_element);

    // CRUD-napit
    const button_container_div = document.createElement('div');
    button_container_div.classList.add('filterBar-button-container');
    button_container_div.appendChild(createAddRowButton(table_name));
    button_container_div.appendChild(createColumnManagementButton(table_name));
    button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

    // Sarakenäkyvyysdropdown (esimerkkinä vain table-näkymässä)
    if (current_view === 'table') {
      const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
      if (tableContainer) {
        const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
        if (columnVisibilityDropdown) {
          button_container_div.appendChild(columnVisibilityDropdown);
        }
      }
    }

    // *** Tässä luodaan varsinainen embed-nappi ***
    const embedBtn = createEmbedButton(table_name);
    button_container_div.appendChild(embedBtn);

    first_line_div.appendChild(button_container_div);
    top_row.appendChild(first_line_div);

    // Näkymävalitsimet toiselle riville
    const second_line_div = document.createElement('div');
    second_line_div.classList.add('top-row-second-line');
    second_line_div.appendChild(createViewSelectorButtons(table_name, current_view));
    // Uusi view-selector
    second_line_div.appendChild(createNewViewSelector(table_name, current_view));
    top_row.appendChild(second_line_div);

    filter_bar.appendChild(top_row);

    // 3) Global search -kenttä
    const search_row = document.createElement('div');
    search_row.classList.add('filterBar-search-row');
    const global_search_input = document.createElement('input');
    global_search_input.type = 'text';
    global_search_input.placeholder = 'Hae jotain...';
    global_search_input.id = `${table_name}_global_search_input`;

    // Aseta localStoragen arvo, jos on
    let stored = localStorage.getItem(`${table_name}_filters`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed[global_search_input.id]) {
          global_search_input.value = parsed[global_search_input.id];
        }
      } catch (err) {
        console.warn(`Virhe parse:ssa ${table_name}_filters:`, err);
      }
    }

    // Hakukentän live-haku
    global_search_input.addEventListener('input', () => {
      filter_table(table_name);
      resetOffset();
      saveFilters(table_name);
    });

    search_row.appendChild(global_search_input);
    filter_bar.appendChild(search_row);

    // 4) Varsinainen suodatus- ja järjestämispaneeli
    // Luokitellaan sarakkeet
    const categorizedCols = {
      id: [],
      numeric: [],
      boolean: [],
      linked: [],
      text: [],
      date: [],
      additional_id: []
    };

    columns.forEach((col) => {
      let dt = data_types[col];
      let actualType = dt && dt.data_type ? dt.data_type : dt;
      const category = determineColumnCategory(col, actualType);
      categorizedCols[category].push(col);
    });

    const orderedMainFilters = [
      ...categorizedCols.id,
      ...categorizedCols.numeric,
      ...categorizedCols.boolean,
      ...categorizedCols.linked,
      ...categorizedCols.text,
      ...categorizedCols.date
    ];
    const additionalIdColumns = categorizedCols.additional_id;

    const mainFilterContainer = document.createElement('div');
    mainFilterContainer.classList.add('combined-filter-sort-container');

    // Pieni apufunktio, joka luo rivin (sort-painike + syötekenttä) jokaiselle sarakkeelle
    function createRowForColumn(container, column) {
      const row_container = document.createElement('div');
      row_container.classList.add('row-container');

      // Lajittelupainike
      const sort_button = document.createElement('button');
      sort_button.setAttribute('data-sort-state', 'none');
      sort_button.innerHTML = '&#x21C5;';
      sort_button.addEventListener('click', () => {
        // Nollataan muut sort-painikkeet
        const allSortButtons = container.querySelectorAll('button[data-sort-state]');
        allSortButtons.forEach((btn) => {
          if (btn !== sort_button) {
            btn.setAttribute('data-sort-state', 'none');
            btn.innerHTML = '&#x21C5;';
          }
        });
        // Kierretaan sort-tila: none -> asc -> desc -> none
        let state = sort_button.getAttribute('data-sort-state');
        let newState;
        if (state === 'none') {
          newState = 'asc';
          sort_button.innerHTML = '&#9650;';
        } else if (state === 'asc') {
          newState = 'desc';
          sort_button.innerHTML = '&#9660;';
        } else {
          newState = 'none';
          sort_button.innerHTML = '&#x21C5;';
        }
        sort_button.setAttribute('data-sort-state', newState);
        applySort(table_name, column, newState);
      });

      // Varsinainen filtterikenttä
      const filter_element = create_filter_element(column, data_types[column], table_name);

      row_container.appendChild(sort_button);
      row_container.appendChild(filter_element);
      container.appendChild(row_container);
    }

    // Luodaan rivit
    orderedMainFilters.forEach((col) => {
      createRowForColumn(mainFilterContainer, col);
    });

    // Lisätään "additional_id" -sarakkeet ns. "näytä lisää" -osioon
    const additionalIdContainer = document.createElement('div');
    additionalIdContainer.classList.add('combined-filter-sort-container');
    additionalIdColumns.forEach((col) => {
      createRowForColumn(additionalIdContainer, col);
    });

    const filtersContainer = document.createElement('div');
    filtersContainer.classList.add('combined-filter-sort-container');
    filtersContainer.appendChild(mainFilterContainer);

    // Jos meillä on ID-sarakkeita tms. piilotettavia
    if (additionalIdColumns.length > 0) {
      const additionalWrapper = document.createElement('div');
      additionalWrapper.style.display = 'none';
      additionalWrapper.appendChild(additionalIdContainer);

      const moreButton = document.createElement('button');
      moreButton.setAttribute('data-lang-key', 'show_more');
      moreButton.textContent = 'Enemmän';
      moreButton.addEventListener('click', () => {
        if (additionalWrapper.style.display === 'none') {
          additionalWrapper.style.display = 'block';
          moreButton.setAttribute('data-lang-key', 'show_less');
          moreButton.textContent = 'Vähemmän';
        } else {
          additionalWrapper.style.display = 'none';
          moreButton.setAttribute('data-lang-key', 'show_more');
          moreButton.textContent = 'Enemmän';
        }
      });

      filtersContainer.appendChild(moreButton);
      filtersContainer.appendChild(additionalWrapper);
    }

    const combinedCollapsible = create_collapsible_section('Järjestä ja suodata', filtersContainer, true);
    filter_bar.appendChild(combinedCollapsible);

    // 5) Liitetään filter_bar DOM:iin
    table_parts_container.appendChild(filter_bar);

    // 6) Luodaan readOnlyContainer, jos sitä ei vielä ole
    let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
    if (!readOnlyContainer) {
      readOnlyContainer = document.createElement('div');
      readOnlyContainer.id = `${table_name}_readOnlyContainer`;
      readOnlyContainer.classList.add('readOnlyContainer');
      table_parts_container.appendChild(readOnlyContainer);
    }
  }

  // 7) Kelluva Chat-nappi (esimerkki)
  if (!document.getElementById(`${table_name}_floating_chat_button`)) {
    const chatButton = document.createElement('button');
    chatButton.id = `${table_name}_floating_chat_button`;
    chatButton.textContent = 'Chat';
    chatButton.classList.add('floating-chat-button');
    document.body.appendChild(chatButton);

    const chatContainer = document.createElement('div');
    chatContainer.id = `${table_name}_chat_wrapper`;
    chatContainer.classList.add('floating-chat-window');
    chatContainer.style.display = 'none';

    // Luodaan varsinainen chat UI
    create_chat_ui(table_name, chatContainer);
    document.body.appendChild(chatContainer);

    chatButton.addEventListener('click', () => {
      if (chatContainer.style.display === 'none' || chatContainer.style.display === '') {
        chatContainer.style.display = 'block';
      } else {
        chatContainer.style.display = 'none';
      }
    });
  }

  // HUOM: Emme enää kutsu "loadFilters(tableName)" suodattamaan uudestaan.
  // Nyt filtterien arvot asetettiin jo kenttiin suoraan create_filter_element -vaiheessa.
}


// // create_filter_bar.js

// // 1) Tuodaan tarvittavat importit
// import { resetOffset } from '../../logical_components/infinite_scroll/infinite_scroll.js';
// import { applySort } from '../gt_crud/gt_read/apply_sort.js';
// import { filter_table } from './filter.js';
// import { create_collapsible_section } from '../../logical_components/collapsible_section.js';
// import { create_chat_ui } from '../../logical_components/ai_features/table_chat/chat.js';
// import { generate_table } from '../../logical_components/table_views/view_table.js';
// import { createViewSelectorButtons } from './draw_view_selector_buttons.js';
// import {
//   createAddRowButton,
//   createDeleteSelectedButton,
//   createColumnManagementButton
// } from '../gt_toolbar/button_factory.js';
// import { createColumnVisibilityDropdown } from '../gt_toolbar/column_visibility_dropdown.js';

// // TUODAAN MYÖS UUSI VIEW-SELECTOR (halutessasi voit käyttää tätä tai jättää pois):
// import { createNewViewSelector } from '../../logical_components/table_views/draw_view_selector_buttons.js';

// /**
//  * Kerää kaikkien ko. taulun filttereiden arvot ja tallentaa ne localStorageen.
//  */
// function saveFilters(tableName) {
//   const filterElements = document.querySelectorAll(`[id^="${tableName}_filter_"]`);
//   const filters = {};
//   filterElements.forEach(elem => {
//     filters[elem.id] = elem.value;
//   });
//   localStorage.setItem(`${tableName}_filters`, JSON.stringify(filters));
// }

// /**
//  * Haetaan rivimäärä (esimerkkinä). Voit muokata tai poistaa tämän halutessasi.
//  */
// async function fetchRowCount(table_name) {
//   try {
//     const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
//       method: 'GET',
//       credentials: 'include'
//     });
//     if (!resp.ok) {
//       throw new Error(`error (status: ${resp.status})`);
//     }
//     const data = await resp.json();
//     if (data && typeof data.row_count === 'number') {
//       return data.row_count;
//     } else {
//       throw new Error("row_count missing in response");
//     }
//   } catch (error) {
//     console.error("virhe fetchRowCount-funktiossa:", error);
//     return null;
//   }
// }

// /**
//  * Luokitellaan sarake haluttuun kategoriaan sarakkeen nimen ja data-tyypin perusteella.
//  * (Voit säätää logiikkaa omaan makuusi.)
//  */
// function determineColumnCategory(column, data_type) {
//   if (column === 'id') {
//     return 'id';
//   }
//   const lowerCol = column.toLowerCase();
//   if (lowerCol.endsWith('_id') || lowerCol.endsWith('_uid')) {
//     return 'additional_id';
//   }
//   if (
//     data_type === 'numeric' ||
//     data_type === 'integer' ||
//     data_type === 'bigint' ||
//     data_type === 'smallint' ||
//     data_type === 'real' ||
//     data_type === 'double precision'
//   ) {
//     return 'numeric';
//   }
//   if (data_type === 'boolean') {
//     return 'boolean';
//   }
//   if (lowerCol.endsWith('(linked)') || lowerCol.endsWith('(ln)')) {
//     return 'linked';
//   }
//   if (
//     data_type === 'date' ||
//     data_type === 'timestamp' ||
//     data_type === 'timestamp without time zone' ||
//     data_type === 'timestamp with time zone'
//   ) {
//     return 'date';
//   }
//   return 'text';
// }

// /**
//  * Luo suodatus-elementin kullekin sarakkeelle. 
//  * Asettaa arvon localStoragesta, jos sellainen on tallennettuna.
//  */
// function create_filter_element(column, data_type, table_name) {
//   const container = document.createElement('div');
//   container.classList.add('input-group');

//   // Luetaan localStoragen filtterit, jos on
//   let storedFilters = {};
//   const stored = localStorage.getItem(`${table_name}_filters`);
//   if (stored) {
//     try {
//       storedFilters = JSON.parse(stored);
//     } catch (err) {
//       console.warn('Virhe parse:ssa table-filters:', err);
//     }
//   }

//   let dt_string =
//     typeof data_type === 'object' && data_type.data_type
//       ? data_type.data_type.toLowerCase()
//       : (data_type || '').toLowerCase();

//   // Erikoistapaus: openai_embedding (esimerkkinä semanttinen haku)
//   if (column === 'openai_embedding') {
//     const semantic_input = document.createElement('input');
//     semantic_input.type = 'text';
//     semantic_input.placeholder = 'Anna semanttinen hakusana...';
//     semantic_input.id = `${table_name}_filter_semantic_${column}`;

//     // Jos localStoragessa oli tallennettuna arvo
//     if (storedFilters[semantic_input.id]) {
//       semantic_input.value = storedFilters[semantic_input.id];
//     }

//     semantic_input.addEventListener('keypress', (e) => {
//       if (e.key === 'Enter') {
//         do_semantic_search(table_name, semantic_input.value);
//       }
//     });
//     container.appendChild(semantic_input);

//     const label = document.createElement('label');
//     label.setAttribute('for', semantic_input.id);
//     label.textContent = 'Semantic vector search';
//     container.appendChild(label);

//     return container;
//   }

//   // Määritellään input tai useampi sen mukaan, mitä tyyppiä sarake on
//   let input;

//   // Date/number -> min–max:
//   if (
//     [
//       'integer',
//       'bigint',
//       'smallint',
//       'numeric',
//       'real',
//       'double precision',
//       'date',
//       'timestamp',
//       'timestamp without time zone',
//       'timestamp with time zone'
//     ].includes(dt_string)
//   ) {
//     const fromInput = document.createElement('input');
//     const toInput = document.createElement('input');

//     if (
//       [
//         'integer',
//         'bigint',
//         'smallint',
//         'numeric',
//         'real',
//         'double precision'
//       ].includes(dt_string)
//     ) {
//       fromInput.type = 'number';
//       toInput.type = 'number';
//       fromInput.placeholder = 'Min';
//       toInput.placeholder = 'Max';
//     } else {
//       fromInput.type = 'date';
//       toInput.type = 'date';
//       fromInput.placeholder = 'From';
//       toInput.placeholder = 'To';
//     }

//     fromInput.id = `${table_name}_filter_${column}_from`;
//     toInput.id = `${table_name}_filter_${column}_to`;

//     // Asetetaan localStoragen arvot
//     if (storedFilters[fromInput.id]) {
//       fromInput.value = storedFilters[fromInput.id];
//     }
//     if (storedFilters[toInput.id]) {
//       toInput.value = storedFilters[toInput.id];
//     }

//     // Kuuntelijat
//     [fromInput, toInput].forEach((inputField) => {
//       inputField.addEventListener('input', () => {
//         filter_table(table_name);
//         resetOffset();
//         saveFilters(table_name);
//       });
//       container.appendChild(inputField);
//     });

//     const label = document.createElement('label');
//     label.textContent = column;
//     container.appendChild(label);
//   } else if (dt_string === 'boolean') {
//     // Boolean-sarake -> <select>
//     input = document.createElement('select');
//     input.id = `${table_name}_filter_${column}`;
//     container.classList.add('no-float');

//     ['', 'true', 'false', 'empty'].forEach((val) => {
//       const opt = document.createElement('option');
//       opt.value = val;
//       opt.textContent =
//         val === ''
//           ? 'All'
//           : val === 'empty'
//           ? 'Empty'
//           : val.charAt(0).toUpperCase() + val.slice(1);
//       input.appendChild(opt);
//     });

//     // Jos localStoragessa on tallennettu arvo
//     if (storedFilters[input.id]) {
//       input.value = storedFilters[input.id];
//     }

//     input.addEventListener('input', () => {
//       filter_table(table_name);
//       resetOffset();
//       saveFilters(table_name);
//     });
//     container.appendChild(input);

//     const label = document.createElement('label');
//     label.setAttribute('for', input.id);
//     label.textContent = column;
//     container.appendChild(label);
//   } else {
//     // Tekstikenttä
//     input = document.createElement('input');
//     input.type = 'text';
//     input.placeholder = ' ';
//     input.id = `${table_name}_filter_${column}`;

//     // Asetetaan tallennettu arvo, jos sellainen on
//     if (storedFilters[input.id]) {
//       input.value = storedFilters[input.id];
//     }

//     input.addEventListener('input', () => {
//       filter_table(table_name);
//       resetOffset();
//       saveFilters(table_name);
//     });
//     container.appendChild(input);

//     const label = document.createElement('label');
//     label.setAttribute('for', input.id);
//     label.textContent = column;
//     container.appendChild(label);
//   }

//   return container;
// }

// /**
//  * Varsinainen semanttinen haku (esimerkki).
//  */
// async function do_semantic_search(table_name, user_query) {
//   console.log('Semanttinen haku, user_query:', user_query);
//   if (!user_query.trim()) return;

//   const url = `/api/get-results-vector?table=${encodeURIComponent(
//     table_name
//   )}&vector_query=${encodeURIComponent(user_query)}`;
//   try {
//     const resp = await fetch(url);
//     if (!resp.ok) {
//       throw new Error(`vector search error (status ${resp.status})`);
//     }
//     const data = await resp.json();
//     console.log('Semanttinen haku tulos:', data);
//     update_table_ui(table_name, data);
//   } catch (e) {
//     console.error('do_semantic_search error:', e);
//   }
// }

// /**
//  * Kutsutaan generate_table(...) ja laitetaan tulos readOnlyContaineriin (esim. päivityksen jälkeen).
//  */
// function showReadOnlyTable(table_name, columns, data, types) {
//   const readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
//   if (!readOnlyContainer) {
//     console.error('Virhe: readOnlyContainer puuttuu!');
//     return;
//   }
//   readOnlyContainer.innerHTML = '';
//   const tableEl = generate_table(table_name, columns, data, types);
//   if (tableEl) {
//     readOnlyContainer.appendChild(tableEl);
//   }
// }

// /**
//  * Päivitetään taulu semanttisen haun tuloksilla (tai muilla tuloksilla).
//  */
// export function update_table_ui(table_name, result) {
//   const { columns, data, types } = result;
//   showReadOnlyTable(table_name, columns, data, types);
// }

// /**
//  * create_filter_bar:
//  *  - Luo suodatuspalkin (filterBar) ja asettaa kentille arvot localStoragesta jo luontivaiheessa
//  *  - Yläpuolen rivit: rivimäärä, CRUD-napit, jne.
//  *  - Global-hakukenttä
//  *  - Varsinaiset sarakefiltterit (min–max, boolean, tekstikenttä jne.)
//  *  - Chat-nappula
//  */
// export function create_filter_bar(table_name, columns, data_types, current_view) {
//   // 0) Luodaan tai haetaan table_parts_container
//   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
//   if (!table_parts_container) {
//     table_parts_container = document.createElement('div');
//     table_parts_container.id = `${table_name}_table_parts_container`;
//     document.body.appendChild(table_parts_container);
//   }

//   // 1) Luodaan filterBar, jos sitä ei vielä ole
//   let filter_bar = document.getElementById(`${table_name}_filterBar`);
//   if (!filter_bar) {
//     filter_bar = document.createElement('div');
//     filter_bar.id = `${table_name}_filterBar`;
//     filter_bar.classList.add('filterBar');

//     // 1a) Otsikko
//     const title_container = document.createElement('div');
//     const table_name_element = document.createElement('div');
//     table_name_element.textContent = table_name;
//     table_name_element.style.fontWeight = 'bold';
//     table_name_element.style.fontSize = '20px';
//     table_name_element.setAttribute('data-lang-key', table_name);
//     table_name_element.title = table_name;
//     title_container.appendChild(table_name_element);
//     filter_bar.appendChild(title_container);

//     // Lisätään taulun “aktuaalinen nimi” pienemmällä tekstillä // Säilytä tämä
//     const small_table_name_div = document.createElement('div');
//     small_table_name_div.textContent = table_name;
//     // small_table_name_div.style.fontSize = '12px';
//     title_container.appendChild(small_table_name_div);

//     // 2) Yläpuolen rivit: rivimäärä, CRUD-napit ja näkymävalitsimet
//     const top_row = document.createElement('div');
//     top_row.classList.add('filterBar-top-row');

//     // Rivimäärä ja CRUD-napit ensimmäiselle riville
//     const first_line_div = document.createElement('div');
//     first_line_div.classList.add('top-row-first-line');
//     const row_count_element = document.createElement('span');
//     row_count_element.textContent = 'Rows: ...';
//     fetchRowCount(table_name).then((count) => {
//       row_count_element.textContent = count !== null ? `Rows: ${count}` : 'Rows: ?';
//     });
//     first_line_div.appendChild(row_count_element);

//     // CRUD-napit
//     const button_container_div = document.createElement('div');
//     button_container_div.classList.add('filterBar-button-container');
//     button_container_div.appendChild(createAddRowButton(table_name));
//     button_container_div.appendChild(createColumnManagementButton(table_name));
//     button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

//     // Sarakenäkyvyysdropdown (esimerkkinä vain table-näkymässä)
//     if (current_view === 'table') {
//       const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
//       if (tableContainer) {
//         const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
//         if (columnVisibilityDropdown) {
//           button_container_div.appendChild(columnVisibilityDropdown);
//         }
//       }
//     }
//     first_line_div.appendChild(button_container_div);
//     top_row.appendChild(first_line_div);

//     // Näkymävalitsimet toiselle riville
//     const second_line_div = document.createElement('div');
//     second_line_div.classList.add('top-row-second-line');
//     second_line_div.appendChild(createViewSelectorButtons(table_name, current_view));
//     // Uusi view-selector
//     second_line_div.appendChild(createNewViewSelector(table_name, current_view));
//     top_row.appendChild(second_line_div);

//     filter_bar.appendChild(top_row);

//     // 3) Global search -kenttä
//     const search_row = document.createElement('div');
//     search_row.classList.add('filterBar-search-row');
//     const global_search_input = document.createElement('input');
//     global_search_input.type = 'text';
//     global_search_input.placeholder = 'Hae jotain...';
//     global_search_input.id = `${table_name}_global_search_input`;

//     // Aseta localStoragen arvo, jos on
//     let stored = localStorage.getItem(`${table_name}_filters`);
//     if (stored) {
//       try {
//         const parsed = JSON.parse(stored);
//         if (parsed[global_search_input.id]) {
//           global_search_input.value = parsed[global_search_input.id];
//         }
//       } catch (err) {
//         console.warn(`Virhe parse:ssa ${table_name}_filters:`, err);
//       }
//     }

//     // Hakukentän live-haku
//     global_search_input.addEventListener('input', () => {
//       filter_table(table_name);
//       resetOffset();
//       saveFilters(table_name);
//     });

//     search_row.appendChild(global_search_input);
//     filter_bar.appendChild(search_row);

//     // 4) Varsinainen suodatus- ja järjestämispaneeli
//     // Luokitellaan sarakkeet
//     const categorizedCols = {
//       id: [],
//       numeric: [],
//       boolean: [],
//       linked: [],
//       text: [],
//       date: [],
//       additional_id: []
//     };

//     columns.forEach((col) => {
//       let dt = data_types[col];
//       let actualType = dt && dt.data_type ? dt.data_type : dt;
//       const category = determineColumnCategory(col, actualType);
//       categorizedCols[category].push(col);
//     });

//     const orderedMainFilters = [
//       ...categorizedCols.id,
//       ...categorizedCols.numeric,
//       ...categorizedCols.boolean,
//       ...categorizedCols.linked,
//       ...categorizedCols.text,
//       ...categorizedCols.date
//     ];
//     const additionalIdColumns = categorizedCols.additional_id;

//     const mainFilterContainer = document.createElement('div');
//     mainFilterContainer.classList.add('combined-filter-sort-container');

//     // Pieni apufunktio, joka luo rivin (sort-painike + syötekenttä) jokaiselle sarakkeelle
//     function createRowForColumn(container, column) {
//       const row_container = document.createElement('div');
//       row_container.classList.add('row-container');

//       // Lajittelupainike
//       const sort_button = document.createElement('button');
//       sort_button.setAttribute('data-sort-state', 'none');
//       sort_button.innerHTML = '&#x21C5;';
//       sort_button.addEventListener('click', () => {
//         // Nollataan muut sort-painikkeet
//         const allSortButtons = container.querySelectorAll('button[data-sort-state]');
//         allSortButtons.forEach((btn) => {
//           if (btn !== sort_button) {
//             btn.setAttribute('data-sort-state', 'none');
//             btn.innerHTML = '&#x21C5;';
//           }
//         });
//         // Kierretaan sort-tila: none -> asc -> desc -> none
//         let state = sort_button.getAttribute('data-sort-state');
//         let newState;
//         if (state === 'none') {
//           newState = 'asc';
//           sort_button.innerHTML = '&#9650;';
//         } else if (state === 'asc') {
//           newState = 'desc';
//           sort_button.innerHTML = '&#9660;';
//         } else {
//           newState = 'none';
//           sort_button.innerHTML = '&#x21C5;';
//         }
//         sort_button.setAttribute('data-sort-state', newState);
//         applySort(table_name, column, newState);
//       });

//       // Varsinainen filtterikenttä
//       const filter_element = create_filter_element(column, data_types[column], table_name);

//       row_container.appendChild(sort_button);
//       row_container.appendChild(filter_element);
//       container.appendChild(row_container);
//     }

//     // Luodaan rivit
//     orderedMainFilters.forEach((col) => {
//       createRowForColumn(mainFilterContainer, col);
//     });

//     // Lisätään "additional_id" -sarakkeet ns. "näytä lisää" -osioon
//     const additionalIdContainer = document.createElement('div');
//     additionalIdContainer.classList.add('combined-filter-sort-container');
//     additionalIdColumns.forEach((col) => {
//       createRowForColumn(additionalIdContainer, col);
//     });

//     const filtersContainer = document.createElement('div');
//     filtersContainer.classList.add('combined-filter-sort-container');
//     filtersContainer.appendChild(mainFilterContainer);

//     // Jos meillä on ID-sarakkeita tms. piilotettavia
//     if (additionalIdColumns.length > 0) {
//       const additionalWrapper = document.createElement('div');
//       additionalWrapper.style.display = 'none';
//       additionalWrapper.appendChild(additionalIdContainer);

//       const moreButton = document.createElement('button');
//       moreButton.setAttribute('data-lang-key', 'show_more');
//       moreButton.textContent = 'Enemmän';
//       moreButton.addEventListener('click', () => {
//         if (additionalWrapper.style.display === 'none') {
//           additionalWrapper.style.display = 'block';
//           moreButton.setAttribute('data-lang-key', 'show_less');
//           moreButton.textContent = 'Vähemmän';
//         } else {
//           additionalWrapper.style.display = 'none';
//           moreButton.setAttribute('data-lang-key', 'show_more');
//           moreButton.textContent = 'Enemmän';
//         }
//       });

//       filtersContainer.appendChild(moreButton);
//       filtersContainer.appendChild(additionalWrapper);
//     }

//     const combinedCollapsible = create_collapsible_section('Järjestä ja suodata', filtersContainer, true);
//     filter_bar.appendChild(combinedCollapsible);

//     // 5) Liitetään filter_bar DOM:iin
//     table_parts_container.appendChild(filter_bar);

//     // 6) Luodaan readOnlyContainer, jos sitä ei vielä ole
//     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
//     if (!readOnlyContainer) {
//       readOnlyContainer = document.createElement('div');
//       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
//       readOnlyContainer.classList.add('readOnlyContainer');
//       table_parts_container.appendChild(readOnlyContainer);
//     }
//   }

//   // 7) Kelluva Chat-nappi (esimerkki)
//   if (!document.getElementById(`${table_name}_floating_chat_button`)) {
//     const chatButton = document.createElement('button');
//     chatButton.id = `${table_name}_floating_chat_button`;
//     chatButton.textContent = 'Chat';
//     chatButton.classList.add('floating-chat-button');
//     document.body.appendChild(chatButton);

//     const chatContainer = document.createElement('div');
//     chatContainer.id = `${table_name}_chat_wrapper`;
//     chatContainer.classList.add('floating-chat-window');
//     chatContainer.style.display = 'none';

//     // Luodaan varsinainen chat UI
//     create_chat_ui(table_name, chatContainer);
//     document.body.appendChild(chatContainer);

//     chatButton.addEventListener('click', () => {
//       if (chatContainer.style.display === 'none' || chatContainer.style.display === '') {
//         chatContainer.style.display = 'block';
//       } else {
//         chatContainer.style.display = 'none';
//       }
//     });
//   }

//   // HUOM: Emme enää kutsu "loadFilters(tableName)" suodattamaan uudestaan.
//   // Nyt filtterien arvot asetettiin jo kenttiin suoraan create_filter_element -vaiheessa.
// }


// // // create_filter_bar.js

// // // 1) Tuodaan tarvittavat importit
// // import { resetOffset } from '../../logical_components/infinite_scroll/infinite_scroll.js';
// // import { applySort } from '../gt_crud/gt_read/apply_sort.js';
// // import { filter_table } from './filter.js';
// // import { create_collapsible_section } from '../../logical_components/collapsible_section.js';
// // import { create_chat_ui } from '../../logical_components/ai_features/table_chat/chat.js';
// // import { generate_table } from '../../logical_components/table_views/view_table.js';
// // import { createViewSelectorButtons } from './draw_view_selector_buttons.js';
// // import {
// //   createAddRowButton,
// //   createDeleteSelectedButton,
// //   createColumnManagementButton
// // } from '../gt_toolbar/button_factory.js';
// // import { createColumnVisibilityDropdown } from '../gt_toolbar/column_visibility_dropdown.js';

// // // TUODAAN MYÖS UUSI VIEW-SELECTOR (halutessasi voit käyttää tätä tai jättää pois):
// // import { createNewViewSelector } from '../../logical_components/table_views/draw_view_selector_buttons.js';

// // /**
// //  * Kerää kaikkien ko. taulun filttereiden arvot ja tallentaa ne localStorageen.
// //  */
// // function saveFilters(tableName) {
// //   const filterElements = document.querySelectorAll(`[id^="${tableName}_filter_"]`);
// //   const filters = {};
// //   filterElements.forEach(elem => {
// //     filters[elem.id] = elem.value;
// //   });
// //   localStorage.setItem(`${tableName}_filters`, JSON.stringify(filters));
// // }

// // /**
// //  * Haetaan rivimäärä (esimerkkinä). Voit muokata tai poistaa tämän halutessasi.
// //  */
// // async function fetchRowCount(table_name) {
// //   try {
// //     const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
// //       method: 'GET',
// //       credentials: 'include'
// //     });
// //     if (!resp.ok) {
// //       throw new Error(`error (status: ${resp.status})`);
// //     }
// //     const data = await resp.json();
// //     if (data && typeof data.row_count === 'number') {
// //       return data.row_count;
// //     } else {
// //       throw new Error("row_count missing in response");
// //     }
// //   } catch (error) {
// //     console.error("virhe fetchRowCount-funktiossa:", error);
// //     return null;
// //   }
// // }

// // /**
// //  * Luokitellaan sarake haluttuun kategoriaan sarakkeen nimen ja data-tyypin perusteella.
// //  * (Voit säätää logiikkaa omaan makuusi.)
// //  */
// // function determineColumnCategory(column, data_type) {
// //   if (column === 'id') {
// //     return 'id';
// //   }
// //   const lowerCol = column.toLowerCase();
// //   if (lowerCol.endsWith('_id') || lowerCol.endsWith('_uid')) {
// //     return 'additional_id';
// //   }
// //   if (data_type === 'numeric' || data_type === 'integer' || data_type === 'bigint'
// //       || data_type === 'smallint' || data_type === 'real' || data_type === 'double precision') {
// //     return 'numeric';
// //   }
// //   if (data_type === 'boolean') {
// //     return 'boolean';
// //   }
// //   if (lowerCol.endsWith('(linked)') || lowerCol.endsWith('(ln)')) {
// //     return 'linked';
// //   }
// //   if (data_type === 'date' || data_type === 'timestamp'
// //       || data_type === 'timestamp without time zone'
// //       || data_type === 'timestamp with time zone') {
// //     return 'date';
// //   }
// //   return 'text';
// // }

// // /**
// //  * Luo suodatus-elementin kullekin sarakkeelle. 
// //  * Asettaa arvon localStoragesta, jos sellainen on tallennettuna.
// //  */
// // function create_filter_element(column, data_type, table_name) {
// //   const container = document.createElement('div');
// //   container.classList.add('input-group');

// //   // Luetaan localStoragen filtterit, jos ei vielä luettu
// //   let storedFilters = {};
// //   const stored = localStorage.getItem(`${table_name}_filters`);
// //   if (stored) {
// //     try {
// //       storedFilters = JSON.parse(stored);
// //     } catch (err) {
// //       console.warn('Virhe parse:ssa table-filters:', err);
// //     }
// //   }

// //   let dt_string = typeof data_type === 'object' && data_type.data_type 
// //     ? data_type.data_type.toLowerCase()
// //     : (data_type || '').toLowerCase();

// //   // Erikoistapaus: openai_embedding (esimerkkinä semanttinen haku)
// //   if (column === 'openai_embedding') {
// //     const semantic_input = document.createElement('input');
// //     semantic_input.type = 'text';
// //     semantic_input.placeholder = 'Anna semanttinen hakusana...';
// //     semantic_input.id = `${table_name}_filter_semantic_${column}`;

// //     // Jos localStoragessa oli tallennettuna arvo
// //     if (storedFilters[semantic_input.id]) {
// //       semantic_input.value = storedFilters[semantic_input.id];
// //     }

// //     semantic_input.addEventListener('keypress', (e) => {
// //       if (e.key === 'Enter') {
// //         do_semantic_search(table_name, semantic_input.value);
// //       }
// //     });
// //     container.appendChild(semantic_input);

// //     const label = document.createElement('label');
// //     label.setAttribute('for', semantic_input.id);
// //     label.textContent = 'Semantic vector search';
// //     container.appendChild(label);

// //     return container;
// //   }

// //   // Määritellään input tai useampi sen mukaan, mitä tyyppiä sarake on
// //   let input;

// //   // Date/number -> min–max:
// //   if (
// //     ['integer','bigint','smallint','numeric','real','double precision','date',
// //      'timestamp','timestamp without time zone','timestamp with time zone']
// //     .includes(dt_string)
// //   ) {
// //     const fromInput = document.createElement('input');
// //     const toInput = document.createElement('input');

// //     if (['integer','bigint','smallint','numeric','real','double precision'].includes(dt_string)) {
// //       fromInput.type = 'number';
// //       toInput.type = 'number';
// //       fromInput.placeholder = 'Min';
// //       toInput.placeholder = 'Max';
// //     } else {
// //       fromInput.type = 'date';
// //       toInput.type = 'date';
// //       fromInput.placeholder = 'From';
// //       toInput.placeholder = 'To';
// //     }

// //     fromInput.id = `${table_name}_filter_${column}_from`;
// //     toInput.id = `${table_name}_filter_${column}_to`;

// //     // Asetetaan localStoragen arvot
// //     if (storedFilters[fromInput.id]) {
// //       fromInput.value = storedFilters[fromInput.id];
// //     }
// //     if (storedFilters[toInput.id]) {
// //       toInput.value = storedFilters[toInput.id];
// //     }

// //     // Kuuntelijat
// //     [fromInput, toInput].forEach(inputField => {
// //       inputField.addEventListener('input', () => {
// //         filter_table(table_name);
// //         resetOffset();
// //         saveFilters(table_name);
// //       });
// //       container.appendChild(inputField);
// //     });

// //     const label = document.createElement('label');
// //     label.textContent = column;
// //     container.appendChild(label);

// //   } else if (dt_string === 'boolean') {
// //     // Boolean-sarake -> <select>
// //     input = document.createElement('select');
// //     input.id = `${table_name}_filter_${column}`;
// //     container.classList.add('no-float');
  
// //     ['', 'true', 'false', 'empty'].forEach(val => {
// //       const opt = document.createElement('option');
// //       opt.value = val;
// //       opt.textContent =
// //         val === ''      ? 'All'   :
// //         val === 'empty' ? 'Empty' :
// //                           val.charAt(0).toUpperCase() + val.slice(1);
// //       input.appendChild(opt);
// //     });
  
// //     // Jos localStoragessa on tallennettu arvo
// //     if (storedFilters[input.id]) {
// //       input.value = storedFilters[input.id];
// //     }

// //     input.addEventListener('input', () => {
// //       filter_table(table_name);
// //       resetOffset();
// //       saveFilters(table_name);
// //     });
// //     container.appendChild(input);
  
// //     const label = document.createElement('label');
// //     label.setAttribute('for', input.id);
// //     label.textContent = column;
// //     container.appendChild(label);

// //   } else {
// //     // Tekstikenttä
// //     input = document.createElement('input');
// //     input.type = 'text';
// //     input.placeholder = ' ';
// //     input.id = `${table_name}_filter_${column}`;

// //     // Asetetaan tallennettu arvo, jos sellainen on
// //     if (storedFilters[input.id]) {
// //       input.value = storedFilters[input.id];
// //     }

// //     input.addEventListener('input', () => {
// //       filter_table(table_name);
// //       resetOffset();
// //       saveFilters(table_name);
// //     });
// //     container.appendChild(input);

// //     const label = document.createElement('label');
// //     label.setAttribute('for', input.id);
// //     label.textContent = column;
// //     container.appendChild(label);
// //   }

// //   return container;
// // }

// // /**
// //  * Varsinainen semanttinen haku (esimerkki).
// //  */
// // async function do_semantic_search(table_name, user_query) {
// //   console.log("Semanttinen haku, user_query:", user_query);
// //   if (!user_query.trim()) return;

// //   const url = `/api/get-results-vector?table=${encodeURIComponent(table_name)}&vector_query=${encodeURIComponent(user_query)}`;
// //   try {
// //     const resp = await fetch(url);
// //     if (!resp.ok) {
// //       throw new Error(`vector search error (status ${resp.status})`);
// //     }
// //     const data = await resp.json();
// //     console.log("Semanttinen haku tulos:", data);
// //     update_table_ui(table_name, data);
// //   } catch (e) {
// //     console.error("do_semantic_search error:", e);
// //   }
// // }

// // /**
// //  * Kutsutaan generate_table(...) ja laitetaan tulos readOnlyContaineriin (esim. päivityksen jälkeen).
// //  */
// // function showReadOnlyTable(table_name, columns, data, types) {
// //   const readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// //   if (!readOnlyContainer) {
// //     console.error('Virhe: readOnlyContainer puuttuu!');
// //     return;
// //   }
// //   readOnlyContainer.innerHTML = '';
// //   const tableEl = generate_table(table_name, columns, data, types);
// //   if (tableEl) {
// //     readOnlyContainer.appendChild(tableEl);
// //   }
// // }

// // /**
// //  * Päivitetään taulu semanttisen haun tuloksilla (tai muilla tuloksilla).
// //  */
// // export function update_table_ui(table_name, result) {
// //   const { columns, data, types } = result;
// //   showReadOnlyTable(table_name, columns, data, types);
// // }

// // /**
// //  * create_filter_bar:
// //  *  - Luo suodatuspalkin (filterBar) ja asettaa kentille arvot localStoragesta jo luontivaiheessa
// //  *  - Yläpuolen rivit: rivimäärä, CRUD-napit, jne.
// //  *  - Global-hakukenttä
// //  *  - Varsinaiset sarakefiltterit (min–max, boolean, tekstikenttä jne.)
// //  *  - Chat-nappula
// //  */
// // export function create_filter_bar(table_name, columns, data_types, current_view) {
// //   // 0) Luodaan tai haetaan table_parts_container
// //   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// //   if (!table_parts_container) {
// //     table_parts_container = document.createElement('div');
// //     table_parts_container.id = `${table_name}_table_parts_container`;
// //     document.body.appendChild(table_parts_container);
// //   }

// //   // 1) Luodaan filterBar, jos sitä ei vielä ole
// //   let filter_bar = document.getElementById(`${table_name}_filterBar`);
// //   if (!filter_bar) {
// //     filter_bar = document.createElement('div');
// //     filter_bar.id = `${table_name}_filterBar`;
// //     filter_bar.classList.add('filterBar');

// //     // 1a) Otsikko
// //     const title_container = document.createElement('div');
// //     const table_name_element = document.createElement('div');
// //     table_name_element.textContent = table_name;
// //     table_name_element.style.fontWeight = 'bold';
// //     table_name_element.style.fontSize = '20px';
// //     table_name_element.setAttribute('data-lang-key', table_name);
// //     table_name_element.title = table_name;
// //     title_container.appendChild(table_name_element);
// //     filter_bar.appendChild(title_container);

// //     // 2) Yläpuolen rivit: rivimäärä, CRUD-napit ja näkymävalitsimet
// //     const top_row = document.createElement('div');
// //     top_row.classList.add('filterBar-top-row');

// //     // Rivimäärä ja CRUD-napit ensimmäiselle riville
// //     const first_line_div = document.createElement('div');
// //     first_line_div.classList.add('top-row-first-line');
// //     const row_count_element = document.createElement('span');
// //     row_count_element.textContent = "Rows: ...";
// //     fetchRowCount(table_name).then(count => {
// //       row_count_element.textContent = count !== null ? `Rows: ${count}` : 'Rows: ?';
// //     });
// //     first_line_div.appendChild(row_count_element);

// //     // CRUD-napit
// //     const button_container_div = document.createElement('div');
// //     button_container_div.classList.add('filterBar-button-container');
// //     button_container_div.appendChild(createAddRowButton(table_name));
// //     button_container_div.appendChild(createColumnManagementButton(table_name));
// //     button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

// //     // Sarakenäkyvyysdropdown (esimerkkinä vain table-näkymässä)
// //     if (current_view === 'table') {
// //       const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// //       if (tableContainer) {
// //         const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
// //         if (columnVisibilityDropdown) {
// //           button_container_div.appendChild(columnVisibilityDropdown);
// //         }
// //       }
// //     }
// //     first_line_div.appendChild(button_container_div);
// //     top_row.appendChild(first_line_div);

// //     // Näkymävalitsimet toiselle riville
// //     const second_line_div = document.createElement('div');
// //     second_line_div.classList.add('top-row-second-line');
// //     second_line_div.appendChild(createViewSelectorButtons(table_name, current_view));
// //     // Uusi view-selector
// //     second_line_div.appendChild(createNewViewSelector(table_name, current_view));
// //     top_row.appendChild(second_line_div);

// //     filter_bar.appendChild(top_row);

// //     // 3) Global search -kenttä
// //     const search_row = document.createElement('div');
// //     search_row.classList.add('filterBar-search-row');
// //     const global_search_input = document.createElement('input');
// //     global_search_input.type = 'text';
// //     global_search_input.placeholder = 'Hae jotain...';
// //     global_search_input.id = `${table_name}_global_search_input`;

// //     // Aseta localStoragen arvo, jos on
// //     let stored = localStorage.getItem(`${table_name}_filters`);
// //     if (stored) {
// //       try {
// //         const parsed = JSON.parse(stored);
// //         if (parsed[global_search_input.id]) {
// //           global_search_input.value = parsed[global_search_input.id];
// //         }
// //       } catch (err) {
// //         console.warn(`Virhe parse:ssa ${table_name}_filters:`, err);
// //       }
// //     }

// //     // Hakukentän live-haku
// //     global_search_input.addEventListener('input', () => {
// //       filter_table(table_name);
// //       resetOffset();
// //       saveFilters(table_name);
// //     });

// //     search_row.appendChild(global_search_input);
// //     filter_bar.appendChild(search_row);

// //     // 4) Varsinainen suodatus- ja järjestämispaneeli
// //     // Luokitellaan sarakkeet
// //     const categorizedCols = {
// //       id: [],
// //       numeric: [],
// //       boolean: [],
// //       linked: [],
// //       text: [],
// //       date: [],
// //       additional_id: []
// //     };

// //     columns.forEach(col => {
// //       let dt = data_types[col];
// //       let actualType = dt && dt.data_type ? dt.data_type : dt;
// //       const category = determineColumnCategory(col, actualType);
// //       categorizedCols[category].push(col);
// //     });

// //     const orderedMainFilters = [
// //       ...categorizedCols.id,
// //       ...categorizedCols.numeric,
// //       ...categorizedCols.boolean,
// //       ...categorizedCols.linked,
// //       ...categorizedCols.text,
// //       ...categorizedCols.date
// //     ];
// //     const additionalIdColumns = categorizedCols.additional_id;

// //     const mainFilterContainer = document.createElement('div');
// //     mainFilterContainer.classList.add('combined-filter-sort-container');

// //     // Pieni apufunktio, joka luo rivin (sort-painike + syötekenttä) jokaiselle sarakkeelle
// //     function createRowForColumn(container, column) {
// //       const row_container = document.createElement('div');
// //       row_container.classList.add('row-container');

// //       // Lajittelupainike
// //       const sort_button = document.createElement('button');
// //       sort_button.setAttribute('data-sort-state', 'none');
// //       sort_button.innerHTML = '&#x21C5;';
// //       sort_button.addEventListener('click', () => {
// //         // Nollataan muut sort-painikkeet
// //         const allSortButtons = container.querySelectorAll('button[data-sort-state]');
// //         allSortButtons.forEach(btn => {
// //           if (btn !== sort_button) {
// //             btn.setAttribute('data-sort-state', 'none');
// //             btn.innerHTML = '&#x21C5;';
// //           }
// //         });
// //         // Kierretaan sort-tila: none -> asc -> desc -> none
// //         let state = sort_button.getAttribute('data-sort-state');
// //         let newState;
// //         if (state === 'none') {
// //           newState = 'asc';
// //           sort_button.innerHTML = '&#9650;';
// //         } else if (state === 'asc') {
// //           newState = 'desc';
// //           sort_button.innerHTML = '&#9660;';
// //         } else {
// //           newState = 'none';
// //           sort_button.innerHTML = '&#x21C5;';
// //         }
// //         sort_button.setAttribute('data-sort-state', newState);
// //         applySort(table_name, column, newState);
// //       });

// //       // Varsinainen filtterikenttä
// //       const filter_element = create_filter_element(column, data_types[column], table_name);

// //       row_container.appendChild(sort_button);
// //       row_container.appendChild(filter_element);
// //       container.appendChild(row_container);
// //     }

// //     // Luodaan rivit
// //     orderedMainFilters.forEach(col => {
// //       createRowForColumn(mainFilterContainer, col);
// //     });

// //     // Lisätään "additional_id" -sarakkeet ns. "näytä lisää" -osioon
// //     const additionalIdContainer = document.createElement('div');
// //     additionalIdContainer.classList.add('combined-filter-sort-container');
// //     additionalIdColumns.forEach(col => {
// //       createRowForColumn(additionalIdContainer, col);
// //     });

// //     const filtersContainer = document.createElement('div');
// //     filtersContainer.classList.add('combined-filter-sort-container');
// //     filtersContainer.appendChild(mainFilterContainer);

// //     // Jos meillä on ID-sarakkeita tms. piilotettavia
// //     if (additionalIdColumns.length > 0) {
// //       const additionalWrapper = document.createElement('div');
// //       additionalWrapper.style.display = 'none';
// //       additionalWrapper.appendChild(additionalIdContainer);

// //       const moreButton = document.createElement('button');
// //       moreButton.setAttribute('data-lang-key', 'show_more');
// //       moreButton.textContent = 'Enemmän';
// //       moreButton.addEventListener('click', () => {
// //         if (additionalWrapper.style.display === 'none') {
// //           additionalWrapper.style.display = 'block';
// //           moreButton.setAttribute('data-lang-key', 'show_less');
// //           moreButton.textContent = 'Vähemmän';
// //         } else {
// //           additionalWrapper.style.display = 'none';
// //           moreButton.setAttribute('data-lang-key', 'show_more');
// //           moreButton.textContent = 'Enemmän';
// //         }
// //       });

// //       filtersContainer.appendChild(moreButton);
// //       filtersContainer.appendChild(additionalWrapper);
// //     }

// //     const combinedCollapsible = create_collapsible_section('Järjestä ja suodata', filtersContainer, true);
// //     filter_bar.appendChild(combinedCollapsible);

// //     // 5) Liitetään filter_bar DOM:iin
// //     table_parts_container.appendChild(filter_bar);

// //     // 6) Luodaan readOnlyContainer, jos sitä ei vielä ole
// //     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// //     if (!readOnlyContainer) {
// //       readOnlyContainer = document.createElement('div');
// //       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// //       readOnlyContainer.classList.add('readOnlyContainer');
// //       table_parts_container.appendChild(readOnlyContainer);
// //     }
// //   }

// //   // 7) Kelluva Chat-nappi (esimerkki)
// //   if (!document.getElementById(`${table_name}_floating_chat_button`)) {
// //     const chatButton = document.createElement('button');
// //     chatButton.id = `${table_name}_floating_chat_button`;
// //     chatButton.textContent = 'Chat';
// //     chatButton.classList.add('floating-chat-button');
// //     document.body.appendChild(chatButton);

// //     const chatContainer = document.createElement('div');
// //     chatContainer.id = `${table_name}_chat_wrapper`;
// //     chatContainer.classList.add('floating-chat-window');
// //     chatContainer.style.display = 'none';

// //     // Luodaan varsinainen chat UI
// //     create_chat_ui(table_name, chatContainer);
// //     document.body.appendChild(chatContainer);

// //     chatButton.addEventListener('click', () => {
// //       if (chatContainer.style.display === 'none' || chatContainer.style.display === '') {
// //         chatContainer.style.display = 'block';
// //       } else {
// //         chatContainer.style.display = 'none';
// //       }
// //     });
// //   }
// //   // HUOM: Emme enää kutsu "loadFilters(tableName)" suodattamaan uudestaan.
// //   // Nyt filtterien arvot asetettiin jo kenttiin suoraan create_filter_element -vaiheessa.
// // }

// // // // create_filter_bar.js

// // // // 1) Tuodaan tarvittavat importit
// // // import { resetOffset } from '../../logical_components/infinite_scroll/infinite_scroll.js';
// // // import { applySort } from '../gt_crud/gt_read/apply_sort.js';
// // // import { filter_table } from './filter.js';
// // // import { create_collapsible_section } from '../../logical_components/collapsible_section.js';
// // // import { create_chat_ui } from '../../logical_components/ai_features/table_chat/chat.js';
// // // import { generate_table } from '../../logical_components/table_views/view_table.js';
// // // import { createViewSelectorButtons } from './draw_view_selector_buttons.js';
// // // import {
// // //   createAddRowButton,
// // //   createDeleteSelectedButton,
// // //   createColumnManagementButton
// // // } from '../gt_toolbar/button_factory.js';
// // // import { createColumnVisibilityDropdown } from '../gt_toolbar/column_visibility_dropdown.js';

// // // // TUODAAN MYÖS UUSI VIEW-SELECTOR:
// // // import { createNewViewSelector } from '../../logical_components/table_views/draw_view_selector_buttons.js';

// // // // Uusi tallennusfunktio: kerää kaikki suodattimet ja tallentaa ne localStorageen
// // // function saveFilters(tableName) {
// // //   const filterElements = document.querySelectorAll(`[id^="${tableName}_filter_"]`);
// // //   const filters = {};
// // //   filterElements.forEach(elem => {
// // //     filters[elem.id] = elem.value;
// // //   });
// // //   localStorage.setItem(`${tableName}_filters`, JSON.stringify(filters));
// // // }

// // // /**
// // //  * Haetaan rivimäärä.
// // //  */
// // // async function fetchRowCount(table_name) {
// // //   try {
// // //     const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
// // //       method: 'GET',
// // //       credentials: 'include'
// // //     });
// // //     if (!resp.ok) {
// // //       throw new Error(`error (status: ${resp.status})`);
// // //     }
// // //     const data = await resp.json();
// // //     if (data && typeof data.row_count === 'number') {
// // //       return data.row_count;
// // //     } else {
// // //       throw new Error("row_count missing in response");
// // //     }
// // //   } catch (error) {
// // //     console.error("virhe fetchRowCount-funktiossa:", error);
// // //     return null;
// // //   }
// // // }

// // // /**
// // //  * Luokitellaan sarake haluttuun kategoriaan sarakkeen nimen ja data-tyypin perusteella.
// // //  */
// // // function determineColumnCategory(column, data_type) {
// // //   if (column === 'id') {
// // //     return 'id';
// // //   }
// // //   const lowerCol = column.toLowerCase();
// // //   if (lowerCol.endsWith('_id') || lowerCol.endsWith('_uid')) {
// // //     return 'additional_id';
// // //   }
// // //   if (data_type === 'numeric' || data_type === 'integer' || data_type === 'bigint'
// // //       || data_type === 'smallint' || data_type === 'real' || data_type === 'double precision') {
// // //     return 'numeric';
// // //   }
// // //   if (data_type === 'boolean') {
// // //     return 'boolean';
// // //   }
// // //   if (lowerCol.endsWith('(linked)') || lowerCol.endsWith('(ln)')) {
// // //     return 'linked';
// // //   }
// // //   if (data_type === 'date' || data_type === 'timestamp'
// // //       || data_type === 'timestamp without time zone'
// // //       || data_type === 'timestamp with time zone') {
// // //     return 'date';
// // //   }
// // //   return 'text';
// // // }

// // // /**
// // //  * create_filter_bar:
// // //  *  - Taulun nimi, rivimäärä, CRUD-napit, sarakenäkyvyysdropdown ja näkymänapit
// // //  *  - Hakukenttä sekä suodatus- ja järjestämispaneeli (ilman välilehtiä)
// // //  *  - Chat toteutetaan erillisenä kelluvana painikkeena, joka avaa kelluvan keskusteluikkunan
// // //  */
// // // export function create_filter_bar(table_name, columns, data_types, current_view) {
// // //   // 0) Haetaan tai luodaan yleiskontti
// // //   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// // //   if (!table_parts_container) {
// // //     table_parts_container = document.createElement('div');
// // //     table_parts_container.id = `${table_name}_table_parts_container`;
// // //     document.body.appendChild(table_parts_container);
// // //   }

// // //   // 1) Luodaan filterBar, jos sitä ei vielä ole.
// // //   let filter_bar = document.getElementById(`${table_name}_filterBar`);
// // //   if (!filter_bar) {
// // //     filter_bar = document.createElement('div');
// // //     filter_bar.id = `${table_name}_filterBar`;
// // //     filter_bar.classList.add('filterBar');

// // //     // 1a) Otsikko
// // //     const title_container = document.createElement('div');
// // //     const table_name_element = document.createElement('div');
// // //     table_name_element.textContent = table_name;
// // //     table_name_element.style.fontWeight = 'bold';
// // //     table_name_element.style.fontSize = '20px';
// // //     table_name_element.setAttribute('data-lang-key', table_name);
// // //     table_name_element.title = table_name;
// // //     title_container.appendChild(table_name_element);
// // //     filter_bar.appendChild(title_container);

// // //     // 2) Yläpuolen rivit: rivimäärä, CRUD-napit ja näkymävalitsimet
// // //     const top_row = document.createElement('div');
// // //     top_row.classList.add('filterBar-top-row');

// // //     // Rivimäärä ja CRUD-napit ensimmäiselle riville
// // //     const first_line_div = document.createElement('div');
// // //     first_line_div.classList.add('top-row-first-line');
// // //     const row_count_element = document.createElement('span');
// // //     row_count_element.textContent = "Rows: ...";
// // //     fetchRowCount(table_name).then(count => {
// // //       row_count_element.textContent = count !== null ? `Rows: ${count}` : 'Rows: ?';
// // //     });
// // //     first_line_div.appendChild(row_count_element);

// // //     const button_container_div = document.createElement('div');
// // //     button_container_div.classList.add('filterBar-button-container');
// // //     button_container_div.appendChild(createAddRowButton(table_name));
// // //     button_container_div.appendChild(createColumnManagementButton(table_name));
// // //     button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

// // //     // Sarakenäkyvyysdropdown vain table-näkymälle
// // //     if (current_view === 'table') {
// // //       const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // //       if (tableContainer) {
// // //         const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
// // //         if (columnVisibilityDropdown) {
// // //           button_container_div.appendChild(columnVisibilityDropdown);
// // //         }
// // //       }
// // //     }
// // //     first_line_div.appendChild(button_container_div);
// // //     top_row.appendChild(first_line_div);

// // //     // Näkymävalitsimet toiselle riville
// // //     const second_line_div = document.createElement('div');
// // //     second_line_div.classList.add('top-row-second-line');
// // //     second_line_div.appendChild(createViewSelectorButtons(table_name, current_view));
// // //     second_line_div.appendChild(createNewViewSelector(table_name, current_view));
// // //     top_row.appendChild(second_line_div);

// // //     filter_bar.appendChild(top_row);

// // //     // 3) Hakukenttä
// // //     const search_row = document.createElement('div');
// // //     search_row.classList.add('filterBar-search-row');
// // //     const global_search_input = document.createElement('input');
// // //     global_search_input.type = 'text';
// // //     global_search_input.placeholder = 'Hae jotain...';
// // //     global_search_input.id = `${table_name}_global_search_input`;
// // //     search_row.appendChild(global_search_input);
// // //     filter_bar.appendChild(search_row);

// // //     // 4) Suodatus- ja järjestämispaneeli (ilman välilehtiä)
// // //     // Luokitellaan sarakkeet
// // //     const categorizedCols = {
// // //       id: [],
// // //       numeric: [],
// // //       boolean: [],
// // //       linked: [],
// // //       text: [],
// // //       date: [],
// // //       additional_id: []
// // //     };

// // //     columns.forEach(col => {
// // //       let dt = data_types[col];
// // //       let actualType = dt && dt.data_type ? dt.data_type : dt;
// // //       const category = determineColumnCategory(col, actualType);
// // //       categorizedCols[category].push(col);
// // //     });

// // //     const orderedMainFilters = [
// // //       ...categorizedCols.id,
// // //       ...categorizedCols.numeric,
// // //       ...categorizedCols.boolean,
// // //       ...categorizedCols.linked,
// // //       ...categorizedCols.text,
// // //       ...categorizedCols.date
// // //     ];
// // //     const additionalIdColumns = categorizedCols.additional_id;

// // //     const mainFilterContainer = document.createElement('div');
// // //     mainFilterContainer.classList.add('combined-filter-sort-container');

// // //     function createRowForColumn(container, column) {
// // //       const row_container = document.createElement('div');
// // //       row_container.classList.add('row-container');

// // //       // Lajittelupainike
// // //       const sort_button = document.createElement('button');
// // //       sort_button.setAttribute('data-sort-state', 'none');
// // //       sort_button.innerHTML = '&#x21C5;';
// // //       sort_button.addEventListener('click', () => {
// // //         const allSortButtons = container.querySelectorAll('button[data-sort-state]');
// // //         allSortButtons.forEach(btn => {
// // //           if (btn !== sort_button) {
// // //             btn.setAttribute('data-sort-state', 'none');
// // //             btn.innerHTML = '&#x21C5;';
// // //           }
// // //         });
// // //         let state = sort_button.getAttribute('data-sort-state');
// // //         let newState;
// // //         if (state === 'none') {
// // //           newState = 'asc';
// // //           sort_button.innerHTML = '&#9650;';
// // //         } else if (state === 'asc') {
// // //           newState = 'desc';
// // //           sort_button.innerHTML = '&#9660;';
// // //         } else {
// // //           newState = 'none';
// // //           sort_button.innerHTML = '&#x21C5;';
// // //         }
// // //         sort_button.setAttribute('data-sort-state', newState);
// // //         applySort(table_name, column, newState);
// // //       });

// // //       const filter_element = create_filter_element(column, data_types[column], table_name);
// // //       row_container.appendChild(sort_button);
// // //       row_container.appendChild(filter_element);
// // //       container.appendChild(row_container);
// // //     }

// // //     orderedMainFilters.forEach(col => {
// // //       createRowForColumn(mainFilterContainer, col);
// // //     });

// // //     const additionalIdContainer = document.createElement('div');
// // //     additionalIdContainer.classList.add('combined-filter-sort-container');
// // //     additionalIdColumns.forEach(col => {
// // //       createRowForColumn(additionalIdContainer, col);
// // //     });

// // //     const filtersContainer = document.createElement('div');
// // //     filtersContainer.classList.add('combined-filter-sort-container');
// // //     filtersContainer.appendChild(mainFilterContainer);

// // //     if (additionalIdColumns.length > 0) {
// // //       const additionalWrapper = document.createElement('div');
// // //       additionalWrapper.style.display = 'none';
// // //       additionalWrapper.appendChild(additionalIdContainer);

// // //       const moreButton = document.createElement('button');
// // //       moreButton.setAttribute('data-lang-key', 'show_more');
// // //       moreButton.textContent = 'Enemmän';
// // //       moreButton.addEventListener('click', () => {
// // //         if (additionalWrapper.style.display === 'none') {
// // //           additionalWrapper.style.display = 'block';
// // //           moreButton.setAttribute('data-lang-key', 'show_less');
// // //           moreButton.textContent = 'Vähemmän';
// // //         } else {
// // //           additionalWrapper.style.display = 'none';
// // //           moreButton.setAttribute('data-lang-key', 'show_more');
// // //           moreButton.textContent = 'Enemmän';
// // //         }
// // //       });

// // //       filtersContainer.appendChild(moreButton);
// // //       filtersContainer.appendChild(additionalWrapper);
// // //     }

// // //     const combinedCollapsible = create_collapsible_section('Järjestä ja suodata', filtersContainer, true);
// // //     filter_bar.appendChild(combinedCollapsible);

// // //     // 5) Liitetään filter_bar DOM:iin
// // //     table_parts_container.appendChild(filter_bar);

// // //     // 6) Luodaan readOnlyContainer, jos sitä ei vielä ole
// // //     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // //     if (!readOnlyContainer) {
// // //       readOnlyContainer = document.createElement('div');
// // //       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// // //       readOnlyContainer.classList.add('readOnlyContainer');
// // //       table_parts_container.appendChild(readOnlyContainer);
// // //     }

// // //     // 7) Hakukentän "live-haku"
// // //     global_search_input.addEventListener('input', () => {
// // //       filter_table(table_name);
// // //       resetOffset();
// // //       saveFilters(table_name);
// // //     });
// // //   }
// // //   // Floating Chat Button and Window (luodaan, jos ei vielä ole)
// // //   if (!document.getElementById(`${table_name}_floating_chat_button`)) {
// // //     const chatButton = document.createElement('button');
// // //     chatButton.id = `${table_name}_floating_chat_button`;
// // //     chatButton.textContent = 'Chat';
// // //     chatButton.classList.add('floating-chat-button');
// // //     document.body.appendChild(chatButton);

// // //     // Vain YKSI chat-kontaineri:
// // //     const chatContainer = document.createElement('div');
// // //     chatContainer.id = `${table_name}_chat_wrapper`;
// // //     // Sama luokka, jonka haluat kelluvan (floating)
// // //     chatContainer.classList.add('floating-chat-window');
// // //     // Aluksi piilotettuna:
// // //     chatContainer.style.display = 'none';

// // //     // Luodaan chat UI suoraan tähän samaan diviin
// // //     create_chat_ui(table_name, chatContainer);

// // //     document.body.appendChild(chatContainer);

// // //     chatButton.addEventListener('click', () => {
// // //       if (chatContainer.style.display === 'none' || chatContainer.style.display === '') {
// // //         chatContainer.style.display = 'block';
// // //       } else {
// // //         chatContainer.style.display = 'none';
// // //       }
// // //     });
// // //   }
// // //   loadFilters(table_name);
// // // }

// // // /**
// // //  * Luo suodatus-elementin kullekin sarakkeelle.
// // //  */
// // // function create_filter_element(column, data_type, table_name) {
// // //   const container = document.createElement('div');
// // //   container.classList.add('input-group');

// // //   let dt_string = typeof data_type === 'object' && data_type.data_type 
// // //     ? data_type.data_type.toLowerCase()
// // //     : (data_type || '').toLowerCase();

// // //   if (column === 'openai_embedding') {
// // //     const semantic_input = document.createElement('input');
// // //     semantic_input.type = 'text';
// // //     semantic_input.placeholder = 'Anna semanttinen hakusana...';
// // //     semantic_input.id = `${table_name}_filter_semantic_${column}`;
// // //     semantic_input.addEventListener('keypress', (e) => {
// // //       if (e.key === 'Enter') {
// // //         do_semantic_search(table_name, semantic_input.value);
// // //       }
// // //     });
// // //     container.appendChild(semantic_input);

// // //     const label = document.createElement('label');
// // //     label.setAttribute('for', semantic_input.id);
// // //     label.textContent = 'Semantic vector search';
// // //     container.appendChild(label);

// // //     return container;
// // //   }

// // //   let input;

// // //   if (
// // //     ['integer','bigint','smallint','numeric','real','double precision','date',
// // //      'timestamp','timestamp without time zone','timestamp with time zone']
// // //     .includes(dt_string)
// // //   ) {
// // //     const fromInput = document.createElement('input');
// // //     const toInput = document.createElement('input');

// // //     if (['integer','bigint','smallint','numeric','real','double precision'].includes(dt_string)) {
// // //       fromInput.type = 'number';
// // //       toInput.type = 'number';
// // //       fromInput.placeholder = 'Min';
// // //       toInput.placeholder = 'Max';
// // //     } else {
// // //       fromInput.type = 'date';
// // //       toInput.type = 'date';
// // //       fromInput.placeholder = 'From';
// // //       toInput.placeholder = 'To';
// // //     }

// // //     fromInput.id = `${table_name}_filter_${column}_from`;
// // //     toInput.id = `${table_name}_filter_${column}_to`;

// // //     [fromInput, toInput].forEach(inputField => {
// // //       inputField.addEventListener('input', () => {
// // //         filter_table(table_name);
// // //         resetOffset();
// // //         saveFilters(table_name);
// // //       });
// // //     });

// // //     container.appendChild(fromInput);
// // //     container.appendChild(toInput);

// // //     const label = document.createElement('label');
// // //     label.textContent = column;
// // //     container.appendChild(label);

// // //   } else if (dt_string === 'boolean') {
// // //     input = document.createElement('select');
// // //     input.id = `${table_name}_filter_${column}`;
// // //     container.classList.add('no-float');
  
// // //     ['', 'true', 'false', 'empty'].forEach(val => {
// // //       const opt = document.createElement('option');
// // //       opt.value = val;
// // //       opt.textContent =
// // //         val === ''      ? 'All'   :
// // //         val === 'empty' ? 'Empty' :
// // //                           val.charAt(0).toUpperCase() + val.slice(1);
// // //       input.appendChild(opt);
// // //     });
  
// // //     input.addEventListener('input', () => {
// // //       filter_table(table_name);
// // //       resetOffset();
// // //       saveFilters(table_name);
// // //     });
// // //     container.appendChild(input);
  
// // //     const label = document.createElement('label');
// // //     label.setAttribute('for', input.id);
// // //     label.textContent = column;
// // //     container.appendChild(label);
// // //   } else {
// // //     input = document.createElement('input');
// // //     input.type = 'text';
// // //     input.placeholder = ' ';
// // //     input.id = `${table_name}_filter_${column}`;
// // //     input.addEventListener('input', () => {
// // //       filter_table(table_name);
// // //       resetOffset();
// // //       saveFilters(table_name);
// // //     });
// // //     container.appendChild(input);

// // //     const label = document.createElement('label');
// // //     label.setAttribute('for', input.id);
// // //     label.textContent = column;
// // //     container.appendChild(label);
// // //   }

// // //   return container;
// // // }

// // // /**
// // //  * Kutsuu server-puoleista "vektorihakua" ja päivittää UI:n
// // //  */
// // // async function do_semantic_search(table_name, user_query) {
// // //   console.log("Semanttinen haku, user_query:", user_query);
// // //   if (!user_query.trim()) return;

// // //   const url = `/api/get-results-vector?table=${encodeURIComponent(table_name)}&vector_query=${encodeURIComponent(user_query)}`;
// // //   try {
// // //     const resp = await fetch(url);
// // //     if (!resp.ok) {
// // //       throw new Error(`vector search error (status ${resp.status})`);
// // //     }
// // //     const data = await resp.json();
// // //     console.log("Semanttinen haku tulos:", data);
// // //     update_table_ui(table_name, data);
// // //   } catch (e) {
// // //     console.error("do_semantic_search error:", e);
// // //   }
// // // }

// // // /**
// // //  * update_table_ui: päivittää taulun samaan tapaan kuin getResults
// // //  */
// // // export function update_table_ui(table_name, result) {
// // //   const { columns, data, types } = result;
// // //   showReadOnlyTable(table_name, columns, data, types);
// // // }

// // // /**
// // //  * showReadOnlyTable: generoi taulun ja laittaa sen readOnlyContaineriin
// // //  */
// // // function showReadOnlyTable(table_name, columns, data, types) {
// // //   const readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // //   if (!readOnlyContainer) {
// // //     console.error('Virhe: readOnlyContainer puuttuu!');
// // //     return;
// // //   }
// // //   readOnlyContainer.innerHTML = '';
// // //   const tableEl = generate_table(table_name, columns, data, types);
// // //   if (tableEl) {
// // //     readOnlyContainer.appendChild(tableEl);
// // //   }
// // // }

// // // export async function loadFilters(tableName) {
// // //   console.log('loadFilters: ', tableName);
// // //   const storedFilters = localStorage.getItem(`${tableName}_filters`);
// // //   if (storedFilters) {
// // //     const filters = JSON.parse(storedFilters);
// // //     for (const [id, value] of Object.entries(filters)) {
// // //       const elem = document.getElementById(id);
// // //       if (elem) {
// // //         elem.value = value;
// // //       }
// // //     }
// // //     // // Käynnistetään suodatus vain, jos triggerFiltering on true.
// // //     // if (triggerFiltering) {
// // //     //   setTimeout(() => {
// // //     //     filter_table(tableName);
// // //     //   }, 3000);
// // //     // }
// // //   }
// // // }

// // // // // create_filter_bar.js

// // // // // 1) Tuodaan tarvittavat importit
// // // // import { resetOffset } from '../../logical_components/infinite_scroll/infinite_scroll.js';
// // // // import { applySort } from '../gt_crud/gt_read/apply_sort.js';
// // // // import { filter_table } from './filter.js';
// // // // import { create_collapsible_section } from '../../logical_components/collapsible_section.js';
// // // // import { create_chat_ui } from '../../logical_components/ai_features/table_chat/chat.js';
// // // // import { generate_table } from '../../logical_components/table_views/view_table.js';
// // // // import { createViewSelectorButtons } from './draw_view_selector_buttons.js';
// // // // import {
// // // //   createAddRowButton,
// // // //   createDeleteSelectedButton,
// // // //   createColumnManagementButton
// // // // } from '../gt_toolbar/button_factory.js';
// // // // import { createColumnVisibilityDropdown } from '../gt_toolbar/column_visibility_dropdown.js';

// // // // // TUODAAN MYÖS UUSI VIEW-SELECTOR:
// // // // import { createNewViewSelector } from '../../logical_components/table_views/draw_view_selector_buttons.js';

// // // // /**
// // // //  * Haetaan rivimäärä.
// // // //  */
// // // // async function fetchRowCount(table_name) {
// // // //   try {
// // // //     const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
// // // //       method: 'GET',
// // // //       credentials: 'include'
// // // //     });
// // // //     if (!resp.ok) {
// // // //       throw new Error(`error (status: ${resp.status})`);
// // // //     }
// // // //     const data = await resp.json();
// // // //     if (data && typeof data.row_count === 'number') {
// // // //       return data.row_count;
// // // //     } else {
// // // //       throw new Error("row_count missing in response");
// // // //     }
// // // //   } catch (error) {
// // // //     console.error("virhe fetchRowCount-funktiossa:", error);
// // // //     return null;
// // // //   }
// // // // }

// // // // /**
// // // //  * Luokitellaan sarake haluttuun kategoriaan sarakkeen nimen ja data-tyypin perusteella.
// // // //  */
// // // // function determineColumnCategory(column, data_type) {
// // // //   if (column === 'id') {
// // // //     return 'id';
// // // //   }
// // // //   const lowerCol = column.toLowerCase();
// // // //   if (lowerCol.endsWith('_id') || lowerCol.endsWith('_uid')) {
// // // //     return 'additional_id';
// // // //   }
// // // //   if (data_type === 'numeric' || data_type === 'integer' || data_type === 'bigint'
// // // //       || data_type === 'smallint' || data_type === 'real' || data_type === 'double precision') {
// // // //     return 'numeric';
// // // //   }
// // // //   if (data_type === 'boolean') {
// // // //     return 'boolean';
// // // //   }
// // // //   if (lowerCol.endsWith('(linked)') || lowerCol.endsWith('(ln)')) {
// // // //     return 'linked';
// // // //   }
// // // //   if (data_type === 'date' || data_type === 'timestamp'
// // // //       || data_type === 'timestamp without time zone'
// // // //       || data_type === 'timestamp with time zone') {
// // // //     return 'date';
// // // //   }
// // // //   return 'text';
// // // // }

// // // // /**
// // // //  * create_filter_bar:
// // // //  *  - Taulun nimi, rivimäärä, CRUD-napit, sarakenäkyvyysdropdown ja näkymänapit
// // // //  *  - Hakukenttä sekä suodatus- ja järjestämispaneeli (ilman välilehtiä)
// // // //  *  - Chat toteutetaan erillisenä kelluvana painikkeena, joka avaa kelluvan keskusteluikkunan
// // // //  */
// // // // export function create_filter_bar(table_name, columns, data_types, current_view) {
// // // //   // 0) Haetaan tai luodaan yleiskontti
// // // //   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// // // //   if (!table_parts_container) {
// // // //     table_parts_container = document.createElement('div');
// // // //     table_parts_container.id = `${table_name}_table_parts_container`;
// // // //     document.body.appendChild(table_parts_container);
// // // //   }

// // // //   // 1) Luodaan filterBar, jos sitä ei vielä ole.
// // // //   let filter_bar = document.getElementById(`${table_name}_filterBar`);
// // // //   if (!filter_bar) {
// // // //     filter_bar = document.createElement('div');
// // // //     filter_bar.id = `${table_name}_filterBar`;
// // // //     filter_bar.classList.add('filterBar');

// // // //     // 1a) Otsikko
// // // //     const title_container = document.createElement('div');
// // // //     const table_name_element = document.createElement('div');
// // // //     table_name_element.textContent = table_name;
// // // //     table_name_element.style.fontWeight = 'bold';
// // // //     table_name_element.style.fontSize = '20px';
// // // //     table_name_element.setAttribute('data-lang-key', table_name);
// // // //     table_name_element.title = table_name;
// // // //     title_container.appendChild(table_name_element);
// // // //     filter_bar.appendChild(title_container);

// // // //     // 2) Yläpuolen rivit: rivimäärä, CRUD-napit ja näkymävalitsimet
// // // //     const top_row = document.createElement('div');
// // // //     top_row.classList.add('filterBar-top-row');

// // // //     // Rivimäärä ja CRUD-napit ensimmäiselle riville
// // // //     const first_line_div = document.createElement('div');
// // // //     first_line_div.classList.add('top-row-first-line');
// // // //     const row_count_element = document.createElement('span');
// // // //     row_count_element.textContent = "Rows: ...";
// // // //     fetchRowCount(table_name).then(count => {
// // // //       row_count_element.textContent = count !== null ? `Rows: ${count}` : 'Rows: ?';
// // // //     });
// // // //     first_line_div.appendChild(row_count_element);

// // // //     const button_container_div = document.createElement('div');
// // // //     button_container_div.classList.add('filterBar-button-container');
// // // //     button_container_div.appendChild(createAddRowButton(table_name));
// // // //     button_container_div.appendChild(createColumnManagementButton(table_name));
// // // //     button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

// // // //     // Sarakenäkyvyysdropdown vain table-näkymälle
// // // //     if (current_view === 'table') {
// // // //       const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // //       if (tableContainer) {
// // // //         const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
// // // //         if (columnVisibilityDropdown) {
// // // //           button_container_div.appendChild(columnVisibilityDropdown);
// // // //         }
// // // //       }
// // // //     }
// // // //     first_line_div.appendChild(button_container_div);
// // // //     top_row.appendChild(first_line_div);

// // // //     // Näkymävalitsimet toiselle riville
// // // //     const second_line_div = document.createElement('div');
// // // //     second_line_div.classList.add('top-row-second-line');
// // // //     second_line_div.appendChild(createViewSelectorButtons(table_name, current_view));
// // // //     second_line_div.appendChild(createNewViewSelector(table_name, current_view));
// // // //     top_row.appendChild(second_line_div);

// // // //     filter_bar.appendChild(top_row);

// // // //     // 3) Hakukenttä
// // // //     const search_row = document.createElement('div');
// // // //     search_row.classList.add('filterBar-search-row');
// // // //     const global_search_input = document.createElement('input');
// // // //     global_search_input.type = 'text';
// // // //     global_search_input.placeholder = 'Hae jotain...';
// // // //     global_search_input.id = `${table_name}_global_search_input`;
// // // //     search_row.appendChild(global_search_input);
// // // //     filter_bar.appendChild(search_row);

// // // //     // 4) Suodatus- ja järjestämispaneeli (ilman välilehtiä)
// // // //     // Luokitellaan sarakkeet
// // // //     const categorizedCols = {
// // // //       id: [],
// // // //       numeric: [],
// // // //       boolean: [],
// // // //       linked: [],
// // // //       text: [],
// // // //       date: [],
// // // //       additional_id: []
// // // //     };

// // // //     columns.forEach(col => {
// // // //       let dt = data_types[col];
// // // //       let actualType = dt && dt.data_type ? dt.data_type : dt;
// // // //       const category = determineColumnCategory(col, actualType);
// // // //       categorizedCols[category].push(col);
// // // //     });

// // // //     const orderedMainFilters = [
// // // //       ...categorizedCols.id,
// // // //       ...categorizedCols.numeric,
// // // //       ...categorizedCols.boolean,
// // // //       ...categorizedCols.linked,
// // // //       ...categorizedCols.text,
// // // //       ...categorizedCols.date
// // // //     ];
// // // //     const additionalIdColumns = categorizedCols.additional_id;

// // // //     const mainFilterContainer = document.createElement('div');
// // // //     mainFilterContainer.classList.add('combined-filter-sort-container');

// // // //     function createRowForColumn(container, column) {
// // // //       const row_container = document.createElement('div');
// // // //       row_container.classList.add('row-container');

// // // //       // Lajittelupainike
// // // //       const sort_button = document.createElement('button');
// // // //       sort_button.setAttribute('data-sort-state', 'none');
// // // //       sort_button.innerHTML = '&#x21C5;';
// // // //       sort_button.addEventListener('click', () => {
// // // //         const allSortButtons = container.querySelectorAll('button[data-sort-state]');
// // // //         allSortButtons.forEach(btn => {
// // // //           if (btn !== sort_button) {
// // // //             btn.setAttribute('data-sort-state', 'none');
// // // //             btn.innerHTML = '&#x21C5;';
// // // //           }
// // // //         });
// // // //         let state = sort_button.getAttribute('data-sort-state');
// // // //         let newState;
// // // //         if (state === 'none') {
// // // //           newState = 'asc';
// // // //           sort_button.innerHTML = '&#9650;';
// // // //         } else if (state === 'asc') {
// // // //           newState = 'desc';
// // // //           sort_button.innerHTML = '&#9660;';
// // // //         } else {
// // // //           newState = 'none';
// // // //           sort_button.innerHTML = '&#x21C5;';
// // // //         }
// // // //         sort_button.setAttribute('data-sort-state', newState);
// // // //         applySort(table_name, column, newState);
// // // //       });

// // // //       const filter_element = create_filter_element(column, data_types[column], table_name);
// // // //       row_container.appendChild(sort_button);
// // // //       row_container.appendChild(filter_element);
// // // //       container.appendChild(row_container);
// // // //     }

// // // //     orderedMainFilters.forEach(col => {
// // // //       createRowForColumn(mainFilterContainer, col);
// // // //     });

// // // //     const additionalIdContainer = document.createElement('div');
// // // //     additionalIdContainer.classList.add('combined-filter-sort-container');
// // // //     additionalIdColumns.forEach(col => {
// // // //       createRowForColumn(additionalIdContainer, col);
// // // //     });

// // // //     const filtersContainer = document.createElement('div');
// // // //     filtersContainer.classList.add('combined-filter-sort-container');
// // // //     filtersContainer.appendChild(mainFilterContainer);

// // // //     if (additionalIdColumns.length > 0) {
// // // //       const additionalWrapper = document.createElement('div');
// // // //       additionalWrapper.style.display = 'none';
// // // //       additionalWrapper.appendChild(additionalIdContainer);

// // // //       const moreButton = document.createElement('button');
// // // //       moreButton.setAttribute('data-lang-key', 'show_more');
// // // //       moreButton.textContent = 'Enemmän';
// // // //       moreButton.addEventListener('click', () => {
// // // //         if (additionalWrapper.style.display === 'none') {
// // // //           additionalWrapper.style.display = 'block';
// // // //           moreButton.setAttribute('data-lang-key', 'show_less');
// // // //           moreButton.textContent = 'Vähemmän';
// // // //         } else {
// // // //           additionalWrapper.style.display = 'none';
// // // //           moreButton.setAttribute('data-lang-key', 'show_more');
// // // //           moreButton.textContent = 'Enemmän';
// // // //         }
// // // //       });

// // // //       filtersContainer.appendChild(moreButton);
// // // //       filtersContainer.appendChild(additionalWrapper);
// // // //     }

// // // //     const combinedCollapsible = create_collapsible_section('Järjestä ja suodata', filtersContainer, true);
// // // //     filter_bar.appendChild(combinedCollapsible);

// // // //     // 5) Liitetään filter_bar DOM:iin
// // // //     table_parts_container.appendChild(filter_bar);

// // // //     // 6) Luodaan readOnlyContainer, jos sitä ei vielä ole
// // // //     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // //     if (!readOnlyContainer) {
// // // //       readOnlyContainer = document.createElement('div');
// // // //       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// // // //       readOnlyContainer.classList.add('readOnlyContainer');
// // // //       table_parts_container.appendChild(readOnlyContainer);
// // // //     }

// // // //     // 7) Hakukentän "live-haku"
// // // //     global_search_input.addEventListener('input', () => {
// // // //       filter_table(table_name);
// // // //       resetOffset();
// // // //     });
// // // //   }
// // // // // Floating Chat Button and Window (luodaan, jos ei vielä ole)
// // // // if (!document.getElementById(`${table_name}_floating_chat_button`)) {
// // // //   const chatButton = document.createElement('button');
// // // //   chatButton.id = `${table_name}_floating_chat_button`;
// // // //   chatButton.textContent = 'Chat';
// // // //   chatButton.classList.add('floating-chat-button');
// // // //   document.body.appendChild(chatButton);

// // // //   // Vain YKSI chat-kontaineri:
// // // //   const chatContainer = document.createElement('div');
// // // //   chatContainer.id = `${table_name}_chat_wrapper`;
// // // //   // Sama luokka, jonka haluat kelluvan (floating)
// // // //   chatContainer.classList.add('floating-chat-window');
// // // //   // Aluksi piilotettuna:
// // // //   chatContainer.style.display = 'none';

// // // //   // Luodaan chat UI suoraan tähän samaan diviin
// // // //   create_chat_ui(table_name, chatContainer);

// // // //   document.body.appendChild(chatContainer);

// // // //   chatButton.addEventListener('click', () => {
// // // //     if (chatContainer.style.display === 'none' || chatContainer.style.display === '') {
// // // //       chatContainer.style.display = 'block';
// // // //     } else {
// // // //       chatContainer.style.display = 'none';
// // // //     }
// // // //   });
// // // // }
// // // // }

// // // // /**
// // // //  * Luo suodatus-elementin kullekin sarakkeelle.
// // // //  */
// // // // function create_filter_element(column, data_type, table_name) {
// // // //   const container = document.createElement('div');
// // // //   container.classList.add('input-group');

// // // //   let dt_string = typeof data_type === 'object' && data_type.data_type 
// // // //     ? data_type.data_type.toLowerCase()
// // // //     : (data_type || '').toLowerCase();

// // // //   if (column === 'openai_embedding') {
// // // //     const semantic_input = document.createElement('input');
// // // //     semantic_input.type = 'text';
// // // //     semantic_input.placeholder = 'Anna semanttinen hakusana...';
// // // //     semantic_input.id = `${table_name}_filter_semantic_${column}`;
// // // //     semantic_input.addEventListener('keypress', (e) => {
// // // //       if (e.key === 'Enter') {
// // // //         do_semantic_search(table_name, semantic_input.value);
// // // //       }
// // // //     });
// // // //     container.appendChild(semantic_input);

// // // //     const label = document.createElement('label');
// // // //     label.setAttribute('for', semantic_input.id);
// // // //     label.textContent = 'Semantic vector search';
// // // //     container.appendChild(label);

// // // //     return container;
// // // //   }

// // // //   let input;

// // // //   if (
// // // //     ['integer','bigint','smallint','numeric','real','double precision','date',
// // // //      'timestamp','timestamp without time zone','timestamp with time zone']
// // // //     .includes(dt_string)
// // // //   ) {
// // // //     const fromInput = document.createElement('input');
// // // //     const toInput = document.createElement('input');

// // // //     if (['integer','bigint','smallint','numeric','real','double precision'].includes(dt_string)) {
// // // //       fromInput.type = 'number';
// // // //       toInput.type = 'number';
// // // //       fromInput.placeholder = 'Min';
// // // //       toInput.placeholder = 'Max';
// // // //     } else {
// // // //       fromInput.type = 'date';
// // // //       toInput.type = 'date';
// // // //       fromInput.placeholder = 'From';
// // // //       toInput.placeholder = 'To';
// // // //     }

// // // //     fromInput.id = `${table_name}_filter_${column}_from`;
// // // //     toInput.id = `${table_name}_filter_${column}_to`;

// // // //     [fromInput, toInput].forEach(inputField => {
// // // //       inputField.addEventListener('input', () => {
// // // //         filter_table(table_name);
// // // //         resetOffset();
// // // //       });
// // // //     });

// // // //     container.appendChild(fromInput);
// // // //     container.appendChild(toInput);

// // // //     const label = document.createElement('label');
// // // //     label.textContent = column;
// // // //     container.appendChild(label);

// // // //   } else if (dt_string === 'boolean') {
// // // //     input = document.createElement('select');
// // // //     input.id = `${table_name}_filter_${column}`;  // Lisätty id
// // // //     container.classList.add('no-float');
  
// // // //     ['', 'true', 'false', 'empty'].forEach(val => {
// // // //       const opt = document.createElement('option');
// // // //       opt.value = val;
// // // //       opt.textContent =
// // // //         val === ''      ? 'All'   :
// // // //         val === 'empty' ? 'Empty' :
// // // //                           val.charAt(0).toUpperCase() + val.slice(1);
// // // //       input.appendChild(opt);
// // // //     });
  
// // // //     input.addEventListener('input', () => {
// // // //       filter_table(table_name);
// // // //       resetOffset();
// // // //     });
// // // //     container.appendChild(input);
  
// // // //     const label = document.createElement('label');
// // // //     label.setAttribute('for', input.id);
// // // //     label.textContent = column;
// // // //     container.appendChild(label);
// // // //   } else {
// // // //     input = document.createElement('input');
// // // //     input.type = 'text';
// // // //     input.placeholder = ' ';
// // // //     input.id = `${table_name}_filter_${column}`;
// // // //     input.addEventListener('input', () => {
// // // //       filter_table(table_name);
// // // //       resetOffset();
// // // //     });
// // // //     container.appendChild(input);

// // // //     const label = document.createElement('label');
// // // //     label.setAttribute('for', input.id);
// // // //     label.textContent = column;
// // // //     container.appendChild(label);
// // // //   }

// // // //   return container;
// // // // }

// // // // /**
// // // //  * Kutsuu server-puoleista "vektorihakua" ja päivittää UI:n
// // // //  */
// // // // async function do_semantic_search(table_name, user_query) {
// // // //   console.log("Semanttinen haku, user_query:", user_query);
// // // //   if (!user_query.trim()) return;

// // // //   const url = `/api/get-results-vector?table=${encodeURIComponent(table_name)}&vector_query=${encodeURIComponent(user_query)}`;
// // // //   try {
// // // //     const resp = await fetch(url);
// // // //     if (!resp.ok) {
// // // //       throw new Error(`vector search error (status ${resp.status})`);
// // // //     }
// // // //     const data = await resp.json();
// // // //     console.log("Semanttinen haku tulos:", data);
// // // //     update_table_ui(table_name, data);
// // // //   } catch (e) {
// // // //     console.error("do_semantic_search error:", e);
// // // //   }
// // // // }

// // // // /**
// // // //  * update_table_ui: päivittää taulun samaan tapaan kuin getResults
// // // //  */
// // // // export function update_table_ui(table_name, result) {
// // // //   const { columns, data, types } = result;
// // // //   showReadOnlyTable(table_name, columns, data, types);
// // // // }

// // // // /**
// // // //  * showReadOnlyTable: generoi taulun ja laittaa sen readOnlyContaineriin
// // // //  */
// // // // function showReadOnlyTable(table_name, columns, data, types) {
// // // //   const readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // //   if (!readOnlyContainer) {
// // // //     console.error('Virhe: readOnlyContainer puuttuu!');
// // // //     return;
// // // //   }
// // // //   readOnlyContainer.innerHTML = '';
// // // //   const tableEl = generate_table(table_name, columns, data, types);
// // // //   if (tableEl) {
// // // //     readOnlyContainer.appendChild(tableEl);
// // // //   }
// // // // }