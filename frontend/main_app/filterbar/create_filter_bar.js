// create_filter_bar.js

// 1) Tuodaan tarvittavat importit
import { resetOffset } from '../../logical_components/infinite_scroll/infinite_scroll.js';
import { applySort } from '../gt_crud/gt_read/apply_sort.js';
import { filter_table } from './filter.js';
import { create_collapsible_section } from '../../logical_components/collapsible_section.js';
import { create_chat_ui } from '../../logical_components/ai_features/table_chat/chat.js';
import { generate_table } from '../../logical_components/table_views/view_table.js';
import { createViewSelectorButtons } from './draw_view_selector_buttons.js';
import {
  createAddRowButton,
  createDeleteSelectedButton,
  createColumnManagementButton
} from '../gt_toolbar/button_factory.js';
import { createColumnVisibilityDropdown } from '../gt_toolbar/column_visibility_dropdown.js';

// TUODAAN MYÖS UUSI VIEW-SELECTOR:
import { createNewViewSelector } from '../../logical_components/table_views/draw_view_selector_buttons.js';

/**
 * Haetaan rivimäärä.
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
 */
function determineColumnCategory(column, data_type) {
  if (column === 'id') {
    return 'id';
  }
  const lowerCol = column.toLowerCase();
  if (lowerCol.endsWith('_id') || lowerCol.endsWith('_uid')) {
    return 'additional_id';
  }
  if (data_type === 'numeric' || data_type === 'integer' || data_type === 'bigint'
      || data_type === 'smallint' || data_type === 'real' || data_type === 'double precision') {
    return 'numeric';
  }
  if (data_type === 'boolean') {
    return 'boolean';
  }
  if (lowerCol.endsWith('(linked)') || lowerCol.endsWith('(ln)')) {
    return 'linked';
  }
  if (data_type === 'date' || data_type === 'timestamp'
      || data_type === 'timestamp without time zone'
      || data_type === 'timestamp with time zone') {
    return 'date';
  }
  return 'text';
}

/**
 * create_filter_bar:
 *  - Taulun nimi, rivimäärä, CRUD-napit, sarakenäkyvyysdropdown ja näkymänapit
 *  - Hakukenttä sekä suodatus- ja järjestämispaneeli (ilman välilehtiä)
 *  - Chat toteutetaan erillisenä kelluvana painikkeena, joka avaa kelluvan keskusteluikkunan
 */
export function create_filter_bar(table_name, columns, data_types, current_view) {
  // 0) Haetaan tai luodaan yleiskontti
  let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
  if (!table_parts_container) {
    table_parts_container = document.createElement('div');
    table_parts_container.id = `${table_name}_table_parts_container`;
    document.body.appendChild(table_parts_container);
  }

  // 1) Luodaan filterBar, jos sitä ei vielä ole.
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

    // 2) Yläpuolen rivit: rivimäärä, CRUD-napit ja näkymävalitsimet
    const top_row = document.createElement('div');
    top_row.classList.add('filterBar-top-row');

    // Rivimäärä ja CRUD-napit ensimmäiselle riville
    const first_line_div = document.createElement('div');
    first_line_div.classList.add('top-row-first-line');
    const row_count_element = document.createElement('span');
    row_count_element.textContent = "Rows: ...";
    fetchRowCount(table_name).then(count => {
      row_count_element.textContent = count !== null ? `Rows: ${count}` : 'Rows: ?';
    });
    first_line_div.appendChild(row_count_element);

    const button_container_div = document.createElement('div');
    button_container_div.classList.add('filterBar-button-container');
    button_container_div.appendChild(createAddRowButton(table_name));
    button_container_div.appendChild(createColumnManagementButton(table_name));
    button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

    // Sarakenäkyvyysdropdown vain table-näkymälle
    if (current_view === 'table') {
      const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
      if (tableContainer) {
        const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
        if (columnVisibilityDropdown) {
          button_container_div.appendChild(columnVisibilityDropdown);
        }
      }
    }
    first_line_div.appendChild(button_container_div);
    top_row.appendChild(first_line_div);

    // Näkymävalitsimet toiselle riville
    const second_line_div = document.createElement('div');
    second_line_div.classList.add('top-row-second-line');
    second_line_div.appendChild(createViewSelectorButtons(table_name, current_view));
    second_line_div.appendChild(createNewViewSelector(table_name, current_view));
    top_row.appendChild(second_line_div);

    filter_bar.appendChild(top_row);

    // 3) Hakukenttä
    const search_row = document.createElement('div');
    search_row.classList.add('filterBar-search-row');
    const global_search_input = document.createElement('input');
    global_search_input.type = 'text';
    global_search_input.placeholder = 'Hae jotain...';
    global_search_input.id = `${table_name}_global_search_input`;
    search_row.appendChild(global_search_input);
    filter_bar.appendChild(search_row);

    // 4) Suodatus- ja järjestämispaneeli (ilman välilehtiä)
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

    columns.forEach(col => {
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

    function createRowForColumn(container, column) {
      const row_container = document.createElement('div');
      row_container.classList.add('row-container');

      // Lajittelupainike
      const sort_button = document.createElement('button');
      sort_button.setAttribute('data-sort-state', 'none');
      sort_button.innerHTML = '&#x21C5;';
      sort_button.addEventListener('click', () => {
        const allSortButtons = container.querySelectorAll('button[data-sort-state]');
        allSortButtons.forEach(btn => {
          if (btn !== sort_button) {
            btn.setAttribute('data-sort-state', 'none');
            btn.innerHTML = '&#x21C5;';
          }
        });
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

      const filter_element = create_filter_element(column, data_types[column], table_name);
      row_container.appendChild(sort_button);
      row_container.appendChild(filter_element);
      container.appendChild(row_container);
    }

    orderedMainFilters.forEach(col => {
      createRowForColumn(mainFilterContainer, col);
    });

    const additionalIdContainer = document.createElement('div');
    additionalIdContainer.classList.add('combined-filter-sort-container');
    additionalIdColumns.forEach(col => {
      createRowForColumn(additionalIdContainer, col);
    });

    const filtersContainer = document.createElement('div');
    filtersContainer.classList.add('combined-filter-sort-container');
    filtersContainer.appendChild(mainFilterContainer);

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

    // 7) Hakukentän "live-haku"
    global_search_input.addEventListener('input', () => {
      filter_table(table_name);
      resetOffset();
    });
  }
// Floating Chat Button and Window (luodaan, jos ei vielä ole)
if (!document.getElementById(`${table_name}_floating_chat_button`)) {
  const chatButton = document.createElement('button');
  chatButton.id = `${table_name}_floating_chat_button`;
  chatButton.textContent = 'Chat';
  chatButton.classList.add('floating-chat-button');
  document.body.appendChild(chatButton);

  // Vain YKSI chat-kontaineri:
  const chatContainer = document.createElement('div');
  chatContainer.id = `${table_name}_chat_wrapper`;
  // Sama luokka, jonka haluat kelluvan (floating)
  chatContainer.classList.add('floating-chat-window');
  // Aluksi piilotettuna:
  chatContainer.style.display = 'none';

  // Luodaan chat UI suoraan tähän samaan diviin
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
}
//   // Floating Chat Button and Window (luodaan, jos ei vielä ole)
//   if (!document.getElementById(`${table_name}_floating_chat_button`)) {
//     const chatButton = document.createElement('button');
//     chatButton.id = `${table_name}_floating_chat_button`;
//     chatButton.textContent = 'Chat';
//     chatButton.classList.add('floating-chat-button');
//     document.body.appendChild(chatButton);

//     const chatWindow = document.createElement('div');
//     chatWindow.id = `${table_name}_floating_chat_window`;
//     chatWindow.classList.add('floating-chat-window');
//     chatWindow.style.display = 'none';
//     // Alustetaan chat UI tähän konttiin
//     create_chat_ui(table_name, chatWindow);
//     document.body.appendChild(chatWindow);

//     chatButton.addEventListener('click', () => {
//       if (chatWindow.style.display === 'none' || chatWindow.style.display === '') {
//         chatWindow.style.display = 'block';
//       } else {
//         chatWindow.style.display = 'none';
//       }
//     });
//   }
// }

/**
 * Luo suodatus-elementin kullekin sarakkeelle.
 */
function create_filter_element(column, data_type, table_name) {
  const container = document.createElement('div');
  container.classList.add('input-group');

  let dt_string = typeof data_type === 'object' && data_type.data_type 
    ? data_type.data_type.toLowerCase()
    : (data_type || '').toLowerCase();

  if (column === 'openai_embedding') {
    const semantic_input = document.createElement('input');
    semantic_input.type = 'text';
    semantic_input.placeholder = 'Anna semanttinen hakusana...';
    semantic_input.id = `${table_name}_filter_semantic_${column}`;
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

  let input;

  if (
    ['integer','bigint','smallint','numeric','real','double precision','date',
     'timestamp','timestamp without time zone','timestamp with time zone']
    .includes(dt_string)
  ) {
    const fromInput = document.createElement('input');
    const toInput = document.createElement('input');

    if (['integer','bigint','smallint','numeric','real','double precision'].includes(dt_string)) {
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

    [fromInput, toInput].forEach(inputField => {
      inputField.addEventListener('input', () => {
        filter_table(table_name);
        resetOffset();
      });
    });

    container.appendChild(fromInput);
    container.appendChild(toInput);

    const label = document.createElement('label');
    label.textContent = column;
    container.appendChild(label);

  } else if (dt_string === 'boolean') {
    input = document.createElement('select');
    container.classList.add('no-float');

    ['', 'true', 'false', 'empty'].forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent =
        val === ''      ? 'All'   :
        val === 'empty' ? 'Empty' :
                          val.charAt(0).toUpperCase() + val.slice(1);
      input.appendChild(opt);
    });

    input.addEventListener('input', () => {
      filter_table(table_name);
      resetOffset();
    });
    container.appendChild(input);

    const label = document.createElement('label');
    label.setAttribute('for', input.id || '');
    label.textContent = column;
    container.appendChild(label);

  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.placeholder = ' ';
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
  }

  return container;
}

/**
 * Kutsuu server-puoleista "vektorihakua" ja päivittää UI:n
 */
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
    console.log("Semanttinen haku tulos:", data);
    update_table_ui(table_name, data);
  } catch (e) {
    console.error("do_semantic_search error:", e);
  }
}

/**
 * update_table_ui: päivittää taulun samaan tapaan kuin getResults
 */
export function update_table_ui(table_name, result) {
  const { columns, data, types } = result;
  showReadOnlyTable(table_name, columns, data, types);
}

/**
 * showReadOnlyTable: generoi taulun ja laittaa sen readOnlyContaineriin
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

// // TUODAAN MYÖS UUSI VIEW-SELECTOR:
// import { createNewViewSelector } from '../../logical_components/table_views/draw_view_selector_buttons.js';

// /**
//  * Haetaan rivimäärä.
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
//  *
//  * Palauttaa jonkin seuraavista arvoista:
//  * - "id"
//  * - "numeric"
//  * - "boolean"
//  * - "linked"        (teksti, joka päättyy (linked) tai (ln))
//  * - "text"
//  * - "date"
//  * - "additional_id" (sarake loppuu _id tai _uid, mutta ei ole "id" itsessään)
//  */
// function determineColumnCategory(column, data_type) {
//   // Erikoistapaus: varsinainen "id"-sarake ensimmäiseksi
//   if (column === 'id') {
//     return 'id';
//   }

//   // Tarkistetaan loput:
//   const lowerCol = column.toLowerCase();

//   // Päättyykö _id tai _uid (mutta sarake ei ole "id" yksinään)
//   if (lowerCol.endsWith('_id') || lowerCol.endsWith('_uid')) {
//     return 'additional_id';
//   }

//   // Jos data_type viittaa numeerisiin (huom. "numeric" on esimerkki; sovella projektin logiikkaa)
//   if (data_type === 'numeric' || data_type === 'integer' || data_type === 'bigint'
//       || data_type === 'smallint' || data_type === 'real' || data_type === 'double precision') {
//     return 'numeric';
//   }

//   // Jos data_type on boolean
//   if (data_type === 'boolean') {
//     return 'boolean';
//   }

//   // Jos teksti, joka loppuu (linked) tai (ln)
//   if (lowerCol.endsWith('(linked)') || lowerCol.endsWith('(ln)')) {
//     return 'linked';
//   }

//   // Jos data_type on päivämäärä
//   // (huom. projektin mukaiset date/timestamp -tyypit listattava sen mukaan, mitä data_types voi palauttaa)
//   if (data_type === 'date' || data_type === 'timestamp'
//       || data_type === 'timestamp without time zone'
//       || data_type === 'timestamp with time zone') {
//     return 'date';
//   }

//   // Oletuksena "text"
//   return 'text';
// }

// /**
//  * create_filter_bar:
//  *  - Taulun nimi
//  *  - Rivimäärä
//  *  - CRUD-napit
//  *  - Sarakenäkyvyysdropdown (vain table-näkymälle)
//  *  - AI-Embedding -nappi
//  *  - Näkymänapit (Taulu / Kortti / Puu)
//  *  - (UUSI) Kolme erilaista näkymää: normal, transposed, ticket
//  *  - Hakukenttä
//  *  - Suodatus+Järjestä / Chat -välilehdet
//  *
//  * Lisäksi luodaan sisardivi (readOnlyContainer), johon taulu sijoitetaan.
//  */
// export function create_filter_bar(table_name, columns, data_types, current_view) {
//   // 0) Haetaan tai luodaan yleiskontti
//   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
//   if (!table_parts_container) {
//     table_parts_container = document.createElement('div');
//     table_parts_container.id = `${table_name}_table_parts_container`;
//     document.body.appendChild(table_parts_container);
//   }

//   // 1) Luodaan filterBar, jos sitä ei vielä ole.
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

//     // 2) Yläpuolen rivit: rivimäärä, CRUD-napit ja näkymävalitsimet
//     const top_row = document.createElement('div');
//     top_row.classList.add('filterBar-top-row');

//     // Rivimäärä ja CRUD-napit ensimmäiselle riville
//     const first_line_div = document.createElement('div');
//     first_line_div.classList.add('top-row-first-line');
//     const row_count_element = document.createElement('span');
//     row_count_element.textContent = "Rows: ...";
//     fetchRowCount(table_name).then(count => {
//       row_count_element.textContent = count !== null ? `Rows: ${count}` : 'Rows: ?';
//     });
//     first_line_div.appendChild(row_count_element);

//     const button_container_div = document.createElement('div');
//     button_container_div.classList.add('filterBar-button-container');
//     button_container_div.appendChild(createAddRowButton(table_name));
//     button_container_div.appendChild(createColumnManagementButton(table_name));
//     button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

//     // Sarakenäkyvyysdropdown vain table-näkymälle
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
//     second_line_div.appendChild(createNewViewSelector(table_name, current_view));
//     top_row.appendChild(second_line_div);

//     filter_bar.appendChild(top_row);

//     // 3) Hakukenttä
//     const search_row = document.createElement('div');
//     search_row.classList.add('filterBar-search-row');
//     const global_search_input = document.createElement('input');
//     global_search_input.type = 'text';
//     global_search_input.placeholder = 'Hae jotain...';
//     global_search_input.id = `${table_name}_global_search_input`;
//     search_row.appendChild(global_search_input);
//     filter_bar.appendChild(search_row);

//     // 4) Tab-napit: "Suodata ja järjestä" ja "Chat"
//     const tabs_row = document.createElement('div');
//     tabs_row.classList.add('filterBar-tabs-row');
//     const tab_button_sortfilter = document.createElement('button');
//     tab_button_sortfilter.textContent = 'Suodata ja järjestä';
//     const tab_button_chat = document.createElement('button');
//     tab_button_chat.textContent = 'Chat';
//     tabs_row.appendChild(tab_button_sortfilter);
//     tabs_row.appendChild(tab_button_chat);
//     filter_bar.appendChild(tabs_row);

//     // 5) Tabien sisältö: Suodatus+Järjestä -osio ja Chat-osio
//     const tabs_content_container = document.createElement('div');
//     tabs_content_container.classList.add('tabs_content_container');

//     // 5a) Sort/filter -section
//     const sort_filter_section = document.createElement('div');
//     sort_filter_section.classList.add('sort_filter_section');

//     // ----------------------------------------------------------
//     // Uusi logiikka: luokitellaan sarakkeet determineColumnCategory-funktiolla
//     // ----------------------------------------------------------
//     const categorizedCols = {
//       id: [],
//       numeric: [],
//       boolean: [],
//       linked: [],
//       text: [],
//       date: [],
//       additional_id: []
//     };

//     columns.forEach(col => {
//       // Yritetään lukea data-tyyppi suoraan data_types[col], jos se on objekti, katso .data_type
//       let dt = data_types[col];
//       // Joissain tapauksissa data_types[col] voi olla suoraan merkkijono, toisissa obj. 
//       // Sovita projektin logiikan mukaan:
//       let actualType = dt && dt.data_type ? dt.data_type : dt; // jos data_types[col] on {data_type: "jotain"}
//       const category = determineColumnCategory(col, actualType);
//       categorizedCols[category].push(col);
//     });

//     // Luodaan haluttu lopullinen järjestys
//     // 1) id
//     // 2) numeric
//     // 3) boolean
//     // 4) linked
//     // 5) text
//     // 6) date
//     // -> Loput (additional_id) napin taakse
//     const orderedMainFilters = [
//       ...categorizedCols.id,
//       ...categorizedCols.numeric,
//       ...categorizedCols.boolean,
//       ...categorizedCols.linked,
//       ...categorizedCols.text,
//       ...categorizedCols.date
//     ];

//     const additionalIdColumns = categorizedCols.additional_id;

//     // Kontaineri pääsuodattimille
//     const mainFilterContainer = document.createElement('div');
//     mainFilterContainer.classList.add('combined-filter-sort-container');

//     // Pieni apufunktio suodatusrivin luomiseen
//     function createRowForColumn(container, column) {
//       const row_container = document.createElement('div');
//       row_container.classList.add('row-container');

//       // Lajittelupainike
//       const sort_button = document.createElement('button');
//       sort_button.setAttribute('data-sort-state', 'none');
//       sort_button.innerHTML = '&#x21C5;'; // Kaksoisnuoli
//       sort_button.addEventListener('click', () => {
//         // Nollataan muiden napit samassa kontissa
//         const allSortButtons = container.querySelectorAll('button[data-sort-state]');
//         allSortButtons.forEach(btn => {
//           if (btn !== sort_button) {
//             btn.setAttribute('data-sort-state', 'none');
//             btn.innerHTML = '&#x21C5;';
//           }
//         });
//         let state = sort_button.getAttribute('data-sort-state');
//         let newState;
//         if (state === 'none') {
//           newState = 'asc';
//           sort_button.innerHTML = '&#9650;'; // Nuoli ylöspäin
//         } else if (state === 'asc') {
//           newState = 'desc';
//           sort_button.innerHTML = '&#9660;'; // Nuoli alaspäin
//         } else {
//           newState = 'none';
//           sort_button.innerHTML = '&#x21C5;';
//         }
//         sort_button.setAttribute('data-sort-state', newState);
//         applySort(table_name, column, newState);
//       });

//       // Suodatusinput
//       const filter_element = create_filter_element(column, data_types[column], table_name);

//       row_container.appendChild(sort_button);
//       row_container.appendChild(filter_element);
//       container.appendChild(row_container);
//     }

//     // Lisätään pääsuodattimet haluttuun järjestykseen
//     orderedMainFilters.forEach(col => {
//       createRowForColumn(mainFilterContainer, col);
//     });

//     // Lisä-id-kentät kootaan napin taakse
//     const additionalIdContainer = document.createElement('div');
//     additionalIdContainer.classList.add('combined-filter-sort-container');
//     additionalIdColumns.forEach(col => {
//       createRowForColumn(additionalIdContainer, col);
//     });

//     // Varsinainen suodatin-näkymän container
//     const filtersContainer = document.createElement('div');
//     filtersContainer.classList.add('combined-filter-sort-container');
//     filtersContainer.appendChild(mainFilterContainer);

//     if (additionalIdColumns.length > 0) {
//       const additionalWrapper = document.createElement('div');
//       additionalWrapper.style.display = 'none'; // Piilotettu aluksi
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

//     // Kääritään collapsible-osioon
//     const combinedCollapsible = create_collapsible_section('Järjestä ja suodata', filtersContainer, true);
//     sort_filter_section.appendChild(combinedCollapsible);

//     // 5b) Chat-osio
//     const chat_section = document.createElement('div');
//     chat_section.classList.add('chat_section', 'hidden');
//     create_chat_ui(table_name, chat_section);

//     // Alussa aktivoidaan suodatus+järjestä -välilehti
//     tab_button_sortfilter.classList.add('tab-button-active');
//     sort_filter_section.classList.remove('hidden');
//     chat_section.classList.add('hidden');

//     tabs_content_container.appendChild(sort_filter_section);
//     tabs_content_container.appendChild(chat_section);
//     filter_bar.appendChild(tabs_content_container);

//     // 6) Liitetään filter_bar DOM:iin
//     table_parts_container.appendChild(filter_bar);

//     // 7) Luodaan readOnlyContainer, jos sitä ei vielä ole
//     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
//     if (!readOnlyContainer) {
//       readOnlyContainer = document.createElement('div');
//       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
//       readOnlyContainer.classList.add('readOnlyContainer');
//       table_parts_container.appendChild(readOnlyContainer);
//     }

//     // 8) Välilehtien klikkaustapahtumat
//     tab_button_sortfilter.addEventListener('click', () => {
//       tab_button_sortfilter.classList.add('tab-button-active');
//       tab_button_chat.classList.remove('tab-button-active');
//       sort_filter_section.classList.remove('hidden');
//       chat_section.classList.add('hidden');
//     });

//     tab_button_chat.addEventListener('click', () => {
//       tab_button_chat.classList.add('tab-button-active');
//       tab_button_sortfilter.classList.remove('tab-button-active');
//       chat_section.classList.remove('hidden');
//       sort_filter_section.classList.add('hidden');
//     });

//     // 9) Hakukentän "live-haku"
//     global_search_input.addEventListener('input', () => {
//       filter_table(table_name);
//       resetOffset();
//     });
//   }
// }

// /**
//  * Luo suodatus-elementin kullekin sarakkeelle.
//  */
// function create_filter_element(column, data_type, table_name) {
//   const container = document.createElement('div');
//   container.classList.add('input-group');

//   // Käytetään samaa logiikkaa kuin aiemmin:
//   // - Joissain tapauksissa data_type voi olla olio, jossa .data_type; toisissa suoraan string
//   let dt_string = typeof data_type === 'object' && data_type.data_type 
//     ? data_type.data_type.toLowerCase()
//     : (data_type || '').toLowerCase();

//   // Erikoistapaus openai_embedding-kentälle
//   if (column === 'openai_embedding') {
//     const semantic_input = document.createElement('input');
//     semantic_input.type = 'text';
//     semantic_input.placeholder = 'Anna semanttinen hakusana...';
//     semantic_input.id = `${table_name}_filter_semantic_${column}`;
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

//   let input;

//   // Jos kyseessä on numeeriset tai päivämäärätyyppiset kentät, luodaan kaksi input-kenttää (min/max tai from/to)
//   if (
//     ['integer','bigint','smallint','numeric','real','double precision','date',
//      'timestamp','timestamp without time zone','timestamp with time zone']
//     .includes(dt_string)
//   ) {
//     const fromInput = document.createElement('input');
//     const toInput = document.createElement('input');

//     if (['integer','bigint','smallint','numeric','real','double precision'].includes(dt_string)) {
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

//     // Asetetaan uniikit tunnisteet
//     fromInput.id = `${table_name}_filter_${column}_from`;
//     toInput.id = `${table_name}_filter_${column}_to`;

//     // Lisää tapahtumakuuntelijat molemmille kentille
//     [fromInput, toInput].forEach(inputField => {
//       inputField.addEventListener('input', () => {
//         filter_table(table_name);
//         resetOffset();
//       });
//     });

//     container.appendChild(fromInput);
//     container.appendChild(toInput);

//     const label = document.createElement('label');
//     label.textContent = column;
//     container.appendChild(label);

//   } else if (dt_string === 'boolean') {
//     input = document.createElement('select');
//     container.classList.add('no-float');

//     ['', 'true', 'false', 'empty'].forEach(val => {
//       const opt = document.createElement('option');
//       opt.value = val;
//       opt.textContent =
//         val === ''      ? 'All'   :
//         val === 'empty' ? 'Empty' :
//                           val.charAt(0).toUpperCase() + val.slice(1);
//       input.appendChild(opt);
//     });

//     input.addEventListener('input', () => {
//       filter_table(table_name);
//       resetOffset();
//     });
//     container.appendChild(input);

//     const label = document.createElement('label');
//     label.setAttribute('for', input.id || '');
//     label.textContent = column;
//     container.appendChild(label);

//   } else {
//     // Normaali tekstisyöte
//     input = document.createElement('input');
//     input.type = 'text';
//     input.placeholder = ' ';
//     input.id = `${table_name}_filter_${column}`;
//     input.addEventListener('input', () => {
//       filter_table(table_name);
//       resetOffset();
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
//  * Kutsuu server-puoleista "vektorihakua" ja päivittää UI:n
//  */
// async function do_semantic_search(table_name, user_query) {
//   console.log("Semanttinen haku, user_query:", user_query);
//   if (!user_query.trim()) return;

//   const url = `/api/get-results-vector?table=${encodeURIComponent(table_name)}&vector_query=${encodeURIComponent(user_query)}`;
//   try {
//     const resp = await fetch(url);
//     if (!resp.ok) {
//       throw new Error(`vector search error (status ${resp.status})`);
//     }
//     const data = await resp.json();
//     console.log("Semanttinen haku tulos:", data);
//     update_table_ui(table_name, data);
//   } catch (e) {
//     console.error("do_semantic_search error:", e);
//   }
// }

// /**
//  * update_table_ui: päivittää taulun samaan tapaan kuin getResults
//  */
// export function update_table_ui(table_name, result) {
//   const { columns, data, types } = result;
//   showReadOnlyTable(table_name, columns, data, types);
// }

// /**
//  * showReadOnlyTable: generoi taulun ja laittaa sen readOnlyContaineriin
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

// // // TUODAAN MYÖS UUSI VIEW-SELECTOR:
// // import { createNewViewSelector } from '../../logical_components/table_views/draw_view_selector_buttons.js';

// // /**
// //  * Haetaan rivimäärä.
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
// //  * create_filter_bar:
// //  *  - Taulun nimi
// //  *  - Rivimäärä
// //  *  - CRUD-napit
// //  *  - Sarakenäkyvyysdropdown (vain table-näkymälle)
// //  *  - AI-Embedding -nappi
// //  *  - Näkymänapit (Taulu / Kortti / Puu)
// //  *  - (UUSI) Kolme erilaista näkymää: normal, transposed, ticket
// //  *  - Hakukenttä
// //  *  - Suodatus+Järjestä / Chat -välilehdet
// //  *
// //  * Lisäksi luodaan sisardivi (readOnlyContainer), johon taulu sijoitetaan.
// //  */
// // export function create_filter_bar(table_name, columns, data_types, current_view) {
// //   // 0) Haetaan tai luodaan yleiskontti
// //   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// //   if (!table_parts_container) {
// //     table_parts_container = document.createElement('div');
// //     table_parts_container.id = `${table_name}_table_parts_container`;
// //     document.body.appendChild(table_parts_container);
// //   }

// //   // 1) Luodaan filterBar, jos sitä ei vielä ole.
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

// //     const button_container_div = document.createElement('div');
// //     button_container_div.classList.add('filterBar-button-container');
// //     button_container_div.appendChild(createAddRowButton(table_name));
// //     button_container_div.appendChild(createColumnManagementButton(table_name));
// //     button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

// //     // Sarakenäkyvyysdropdown vain table-näkymälle
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
// //     second_line_div.appendChild(createNewViewSelector(table_name, current_view));
// //     top_row.appendChild(second_line_div);

// //     filter_bar.appendChild(top_row);

// //     // 3) Hakukenttä
// //     const search_row = document.createElement('div');
// //     search_row.classList.add('filterBar-search-row');
// //     const global_search_input = document.createElement('input');
// //     global_search_input.type = 'text';
// //     global_search_input.placeholder = 'Hae jotain...';
// //     global_search_input.id = `${table_name}_global_search_input`;
// //     search_row.appendChild(global_search_input);
// //     filter_bar.appendChild(search_row);

// //     // 4) Tab-napit: "Suodata ja järjestä" ja "Chat"
// //     const tabs_row = document.createElement('div');
// //     tabs_row.classList.add('filterBar-tabs-row');
// //     const tab_button_sortfilter = document.createElement('button');
// //     tab_button_sortfilter.textContent = 'Suodata ja järjestä';
// //     const tab_button_chat = document.createElement('button');
// //     tab_button_chat.textContent = 'Chat';
// //     tabs_row.appendChild(tab_button_sortfilter);
// //     tabs_row.appendChild(tab_button_chat);
// //     filter_bar.appendChild(tabs_row);

// //     // 5) Tabien sisältö: Suodatus+Järjestä -osio ja Chat-osio
// //     const tabs_content_container = document.createElement('div');
// //     tabs_content_container.classList.add('tabs_content_container');

// //     // 5a) Sort/filter -section
// //     const sort_filter_section = document.createElement('div');
// //     sort_filter_section.classList.add('sort_filter_section');

// //     // ----------------------------------------------------------
// //     // Uusi luokittelu: id, numeric, muut, ja lopuksi _id/_uid
// //     // ----------------------------------------------------------
// //     let idColumns = [];
// //     let numericColumns = [];
// //     let otherColumns = [];
// //     let additionalIdColumns = [];

// //     columns.forEach(col => {
// //       // Tarkistetaan, onko data_types[col] = 'numeric'
// //       // Huom. data_types[col] voi olla esim. 'integer', 'bigint' ym.
// //       // Voit laajentaa/korjata numeric-ehtoa tarpeen mukaan
// //       const dt = data_types[col] || ''; // varotoimi, jos puuttuu
// //       const dt_lower = typeof dt === 'string' ? dt.toLowerCase() : dt.data_type?.toLowerCase() || '';

// //       if (col === 'id') {
// //         idColumns.push(col);
// //       } 
// //       // Kokeillaan, onko dt_lower sukujuuriltaan "int", "numeric" tms:
// //       else if (
// //         dt_lower.includes('int') ||
// //         dt_lower.includes('numeric') ||
// //         dt_lower.includes('decimal') ||
// //         dt_lower.includes('real') ||
// //         dt_lower.includes('double')
// //       ) {
// //         // Varmistetaan, ettei loppu _id / _uid
// //         if (col.endsWith('_id') || col.endsWith('_uid')) {
// //           additionalIdColumns.push(col);
// //         } else {
// //           numericColumns.push(col);
// //         }
// //       }
// //       // Loppuuko _id tai _uid
// //       else if (col.endsWith('_id') || col.endsWith('_uid')) {
// //         additionalIdColumns.push(col);
// //       } else {
// //         // Kaikki muut
// //         otherColumns.push(col);
// //       }
// //     });

// //     // Varsinaiset "pääfiltterit" tulevat näkyviin:
// //     const orderedMainFilters = [
// //       ...idColumns,
// //       ...numericColumns,
// //       ...otherColumns
// //     ];

// //     // 5b) Luodaan kontaineri, johon kootaan kaikki pääfiltterit
// //     const mainFilterContainer = document.createElement('div');
// //     mainFilterContainer.classList.add('combined-filter-sort-container');

// //     // Funktio, joka rakentaa yhden rivin (lajittelu- ja suodatuselementin)
// //     function createRowForColumn(container, column) {
// //       const row_container = document.createElement('div');
// //       row_container.classList.add('row-container');

// //       // Lajittelupainike
// //       const sort_button = document.createElement('button');
// //       sort_button.setAttribute('data-sort-state', 'none');
// //       sort_button.innerHTML = '&#x21C5;'; // Kaksoisnuoli
// //       sort_button.addEventListener('click', () => {
// //         // Nollataan muiden napit samassa kontissa
// //         const allSortButtons = container.querySelectorAll('button[data-sort-state]');
// //         allSortButtons.forEach(btn => {
// //           if (btn !== sort_button) {
// //             btn.setAttribute('data-sort-state', 'none');
// //             btn.innerHTML = '&#x21C5;';
// //           }
// //         });
// //         let state = sort_button.getAttribute('data-sort-state');
// //         let newState;
// //         if (state === 'none') {
// //           newState = 'asc';
// //           sort_button.innerHTML = '&#9650;'; // Nuoli ylöspäin
// //         } else if (state === 'asc') {
// //           newState = 'desc';
// //           sort_button.innerHTML = '&#9660;'; // Nuoli alaspäin
// //         } else {
// //           newState = 'none';
// //           sort_button.innerHTML = '&#x21C5;';
// //         }
// //         sort_button.setAttribute('data-sort-state', newState);
// //         applySort(table_name, column, newState);
// //       });

// //       // Suodatusinput
// //       const filter_element = create_filter_element(column, data_types[column], table_name);

// //       row_container.appendChild(sort_button);
// //       row_container.appendChild(filter_element);
// //       container.appendChild(row_container);
// //     }

// //     // Lisätään pääsuodattimet halutussa järjestyksessä
// //     orderedMainFilters.forEach(col => {
// //       createRowForColumn(mainFilterContainer, col);
// //     });

// //     // 5c) Luodaan kontaineri lisä-id-kentille, jotka näytetään "Enemmän"-napin takana
// //     const additionalIdContainer = document.createElement('div');
// //     additionalIdContainer.classList.add('combined-filter-sort-container');
// //     additionalIdColumns.forEach(col => {
// //       createRowForColumn(additionalIdContainer, col);
// //     });

// //     // 5d) Kootaan kaikki suodattimet yhteen: pääsuodattimet näkyviin ja lisä-id:t piilossa
// //     const filtersContainer = document.createElement('div');
// //     filtersContainer.classList.add('combined-filter-sort-container');
// //     filtersContainer.appendChild(mainFilterContainer);

// //     if (additionalIdColumns.length > 0) {
// //       const additionalWrapper = document.createElement('div');
// //       additionalWrapper.style.display = 'none'; // Piilotettu aluksi
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

// //     // Kääritään suodattimet collapsible-osioon
// //     const combinedCollapsible = create_collapsible_section('Järjestä ja suodata', filtersContainer, true);
// //     sort_filter_section.appendChild(combinedCollapsible);

// //     // 5e) Chat-osio
// //     const chat_section = document.createElement('div');
// //     chat_section.classList.add('chat_section', 'hidden');
// //     create_chat_ui(table_name, chat_section);

// //     // Alussa aktivoidaan suodatus+järjestä -välilehti
// //     tab_button_sortfilter.classList.add('tab-button-active');
// //     sort_filter_section.classList.remove('hidden');
// //     chat_section.classList.add('hidden');

// //     tabs_content_container.appendChild(sort_filter_section);
// //     tabs_content_container.appendChild(chat_section);
// //     filter_bar.appendChild(tabs_content_container);

// //     // 6) Liitetään filter_bar DOM:iin
// //     table_parts_container.appendChild(filter_bar);

// //     // 7) Luodaan readOnlyContainer, jos sitä ei vielä ole
// //     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// //     if (!readOnlyContainer) {
// //       readOnlyContainer = document.createElement('div');
// //       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// //       readOnlyContainer.classList.add('readOnlyContainer');
// //       table_parts_container.appendChild(readOnlyContainer);
// //     }

// //     // 8) Välilehtien klikkaustapahtumat
// //     tab_button_sortfilter.addEventListener('click', () => {
// //       tab_button_sortfilter.classList.add('tab-button-active');
// //       tab_button_chat.classList.remove('tab-button-active');
// //       sort_filter_section.classList.remove('hidden');
// //       chat_section.classList.add('hidden');
// //     });

// //     tab_button_chat.addEventListener('click', () => {
// //       tab_button_chat.classList.add('tab-button-active');
// //       tab_button_sortfilter.classList.remove('tab-button-active');
// //       chat_section.classList.remove('hidden');
// //       sort_filter_section.classList.add('hidden');
// //     });

// //     // 9) Hakukentän "live-haku"
// //     global_search_input.addEventListener('input', () => {
// //       filter_table(table_name);
// //       resetOffset();
// //     });
// //   }
// // }


// // /**
// //  * Luo suodatus-elementin kullekin sarakkeelle.
// //  */
// // function create_filter_element(column, data_type, table_name) {
// //   const container = document.createElement('div');
// //   container.classList.add('input-group');

// //   // Jos data_type on objekti tyyliin { data_type: 'integer' }, haetaan pelkkä merkkijono
// //   let dt_string = typeof data_type === 'object'
// //     ? (data_type.data_type || '').toLowerCase()
// //     : (data_type || '').toLowerCase();

// //   // Erikoistapaus openai_embedding-kentälle
// //   if (column === 'openai_embedding') {
// //     const semantic_input = document.createElement('input');
// //     semantic_input.type = 'text';
// //     semantic_input.placeholder = 'Anna semanttinen hakusana...';
// //     semantic_input.id = `${table_name}_filter_semantic_${column}`;
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

// //   let input;

// //   // Jos kyseessä on numeeriset tai päivämäärätyyppiset kentät, luodaan kaksi input-kenttää (alueen min/max)
// //   if (
// //     [
// //       'integer',
// //       'bigint',
// //       'smallint',
// //       'numeric',
// //       'date',
// //       'timestamp',
// //       'timestamp without time zone',
// //       'timestamp with time zone'
// //     ].includes(dt_string)
// //   ) {
// //     const fromInput = document.createElement('input');
// //     const toInput = document.createElement('input');

// //     if (['integer', 'bigint', 'smallint', 'numeric'].includes(dt_string)) {
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

// //     // Asetetaan uniikit tunnisteet
// //     fromInput.id = `${table_name}_filter_${column}_from`;
// //     toInput.id = `${table_name}_filter_${column}_to`;

// //     // Lisää tapahtumakuuntelijat molemmille kentille
// //     [fromInput, toInput].forEach(inputField => {
// //       inputField.addEventListener('input', () => {
// //         filter_table(table_name);
// //         resetOffset();
// //       });
// //     });

// //     // Lisää kentät kontaineriin
// //     container.appendChild(fromInput);
// //     container.appendChild(toInput);

// //     // Lisää yhteinen label sarakkeelle
// //     const label = document.createElement('label');
// //     label.textContent = column;
// //     container.appendChild(label);

// //   } else if (dt_string === 'boolean') {
// //     input = document.createElement('select');
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

// //     input.addEventListener('input', () => {
// //       filter_table(table_name);
// //       resetOffset();
// //     });
// //     container.appendChild(input);

// //     const label = document.createElement('label');
// //     label.setAttribute('for', input.id || '');
// //     label.textContent = column;
// //     container.appendChild(label);

// //   } else {
// //     // Normaali tekstisyöte
// //     input = document.createElement('input');
// //     input.type = 'text';
// //     input.placeholder = ' ';
// //     input.id = `${table_name}_filter_${column}`;
// //     input.addEventListener('input', () => {
// //       filter_table(table_name);
// //       resetOffset();
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
// //  * Kutsuu server-puoleista "vektorihakua" ja päivittää UI:n
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
// //  * update_table_ui: päivittää taulun samaan tapaan kuin getResults
// //  */
// // export function update_table_ui(table_name, result) {
// //   const { columns, data, types } = result;
// //   showReadOnlyTable(table_name, columns, data, types);
// // }

// // /**
// //  * showReadOnlyTable: generoi taulun ja laittaa sen readOnlyContaineriin
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
// // //  * create_filter_bar:
// // //  *  - Taulun nimi
// // //  *  - Rivimäärä
// // //  *  - CRUD-napit
// // //  *  - Sarakenäkyvyysdropdown (vain table-näkymälle)
// // //  *  - AI-Embedding -nappi
// // //  *  - Näkymänapit (Taulu / Kortti / Puu)
// // //  *  - (UUSI) Kolme erilaista näkymää: normal, transposed, ticket
// // //  *  - Hakukenttä
// // //  *  - Suodatus+Järjestä / Chat -välilehdet
// // //  *
// // //  * Lisäksi luodaan sisardivi (readOnlyContainer), johon taulu sijoitetaan.
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

// // //     // 4) Tab-napit: "Suodata ja järjestä" ja "Chat"
// // //     const tabs_row = document.createElement('div');
// // //     tabs_row.classList.add('filterBar-tabs-row');
// // //     const tab_button_sortfilter = document.createElement('button');
// // //     tab_button_sortfilter.textContent = 'Suodata ja järjestä';
// // //     const tab_button_chat = document.createElement('button');
// // //     tab_button_chat.textContent = 'Chat';
// // //     tabs_row.appendChild(tab_button_sortfilter);
// // //     tabs_row.appendChild(tab_button_chat);
// // //     filter_bar.appendChild(tabs_row);

// // //     // 5) Tabien sisältö: Suodatus+Järjestä -osio ja Chat-osio
// // //     const tabs_content_container = document.createElement('div');
// // //     tabs_content_container.classList.add('tabs_content_container');

// // //     // 5a) Sort/filter -section
// // //     const sort_filter_section = document.createElement('div');
// // //     sort_filter_section.classList.add('sort_filter_section');

// // //     // ----------------------------------------------------------
// // //     // Uusi logiikka: jaotellaan sarakkeet eri ryhmiin
// // //     // ----------------------------------------------------------
// // // // Määritellään taulukot eri saraketyypeille:
// // // let idFilter = [];
// // // let numericColumns = [];
// // // let booleanColumns = [];
// // // let linkedColumns = [];
// // // let textColumns = [];
// // // let dateColumns = [];
// // // let additionalIdColumns = [];

// // // columns.forEach(col => {
// // //   if (col === 'id') {
// // //     idFilter.push(col);
// // //   } else if (data_types[col] === 'numeric' && !(col.endsWith('_id') || col.endsWith('_uid'))) {
// // //     numericColumns.push(col);
// // //   } else if (data_types[col] === 'boolean') {
// // //     booleanColumns.push(col);
// // //   } else if (col.toLowerCase().endsWith('(linked)') || col.toLowerCase().endsWith('(ln)')) {
// // //     linkedColumns.push(col);
// // //   } else if (data_types[col] === 'text') {
// // //     textColumns.push(col);
// // //   } else if (data_types[col] === 'date') {
// // //     dateColumns.push(col);
// // //   } else if (col.endsWith('_id') || col.endsWith('_uid')) {
// // //     additionalIdColumns.push(col);
// // //   } else {
// // //     // Oletuksena tekstiksi
// // //     textColumns.push(col);
// // //   }
// // // });

// // //     // 5b) Luodaan kontaineri pääsuodattimille oikeassa järjestyksessä:
// // //     // id, linked, text, boolean, numeric ja date.
// // //     const mainFilterContainer = document.createElement('div');
// // //     mainFilterContainer.classList.add('combined-filter-sort-container');

// // // // Määritellään pääjärjestys: id ensin, sitten muut sarakkeet tietyssä järjestyksessä.
// // // const orderedMainFilters = [
// // //   ...idFilter,
// // //   ...numericColumns,
// // //   ...booleanColumns,
// // //   ...linkedColumns,
// // //   ...textColumns,
// // //   ...dateColumns
// // // ];

// // //     // Funktio, joka rakentaa yhden rivin (lajittelu- ja suodatuselementin)
// // //     function createRowForColumn(container, column) {
// // //       const row_container = document.createElement('div');
// // //       row_container.classList.add('row-container');

// // //       // Lajittelupainike
// // //       const sort_button = document.createElement('button');
// // //       sort_button.setAttribute('data-sort-state', 'none');
// // //       sort_button.innerHTML = '&#x21C5;'; // Kaksoisnuoli
// // //       sort_button.addEventListener('click', () => {
// // //         // Nollataan muiden napit samassa kontissa
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
// // //           sort_button.innerHTML = '&#9650;'; // Nuoli ylöspäin
// // //         } else if (state === 'asc') {
// // //           newState = 'desc';
// // //           sort_button.innerHTML = '&#9660;'; // Nuoli alaspäin
// // //         } else {
// // //           newState = 'none';
// // //           sort_button.innerHTML = '&#x21C5;';
// // //         }
// // //         sort_button.setAttribute('data-sort-state', newState);
// // //         applySort(table_name, column, newState);
// // //       });

// // //       // Suodatusinput
// // //       const filter_element = create_filter_element(column, data_types[column], table_name);

// // //       row_container.appendChild(sort_button);
// // //       row_container.appendChild(filter_element);
// // //       container.appendChild(row_container);
// // //     }

// // //     // Lisätään pääsuodattimet
// // //     orderedMainFilters.forEach(col => {
// // //       createRowForColumn(mainFilterContainer, col);
// // //     });

// // //     // 5c) Luodaan kontaineri lisä-id-kentille, jotka näytetään "Enemmän"-napin takana
// // //     const additionalIdContainer = document.createElement('div');
// // //     additionalIdContainer.classList.add('combined-filter-sort-container');
// // //     additionalIdColumns.forEach(col => {
// // //       createRowForColumn(additionalIdContainer, col);
// // //     });

// // //     // 5d) Kootaan kaikki suodattimet yhteen: pääsuodattimet näkyviin ja lisä-id:t piilossa
// // //     const filtersContainer = document.createElement('div');
// // //     filtersContainer.classList.add('combined-filter-sort-container');
// // //     filtersContainer.appendChild(mainFilterContainer);

// // //     if (additionalIdColumns.length > 0) {
// // //       const additionalWrapper = document.createElement('div');
// // //       additionalWrapper.style.display = 'none'; // Piilotettu aluksi
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

// // //     // Kääritään suodattimet collapsible-osioon
// // //     const combinedCollapsible = create_collapsible_section('Järjestä ja suodata', filtersContainer, true);
// // //     sort_filter_section.appendChild(combinedCollapsible);

// // //     // 5e) Chat-osio
// // //     const chat_section = document.createElement('div');
// // //     chat_section.classList.add('chat_section', 'hidden');
// // //     create_chat_ui(table_name, chat_section);

// // //     // Alussa aktivoidaan suodatus+järjestä -välilehti
// // //     tab_button_sortfilter.classList.add('tab-button-active');
// // //     sort_filter_section.classList.remove('hidden');
// // //     chat_section.classList.add('hidden');

// // //     tabs_content_container.appendChild(sort_filter_section);
// // //     tabs_content_container.appendChild(chat_section);
// // //     filter_bar.appendChild(tabs_content_container);

// // //     // 6) Liitetään filter_bar DOM:iin
// // //     table_parts_container.appendChild(filter_bar);

// // //     // 7) Luodaan readOnlyContainer, jos sitä ei vielä ole
// // //     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // //     if (!readOnlyContainer) {
// // //       readOnlyContainer = document.createElement('div');
// // //       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// // //       readOnlyContainer.classList.add('readOnlyContainer');
// // //       table_parts_container.appendChild(readOnlyContainer);
// // //     }

// // //     // 8) Välilehtien klikkaustapahtumat
// // //     tab_button_sortfilter.addEventListener('click', () => {
// // //       tab_button_sortfilter.classList.add('tab-button-active');
// // //       tab_button_chat.classList.remove('tab-button-active');
// // //       sort_filter_section.classList.remove('hidden');
// // //       chat_section.classList.add('hidden');
// // //     });

// // //     tab_button_chat.addEventListener('click', () => {
// // //       tab_button_chat.classList.add('tab-button-active');
// // //       tab_button_sortfilter.classList.remove('tab-button-active');
// // //       chat_section.classList.remove('hidden');
// // //       sort_filter_section.classList.add('hidden');
// // //     });

// // //     // 9) Hakukentän "live-haku"
// // //     global_search_input.addEventListener('input', () => {
// // //       filter_table(table_name);
// // //       resetOffset();
// // //     });
// // //   }
// // // }


// // // /**
// // //  * Luo suodatus-elementin kullekin sarakkeelle.
// // //  */
// // // function create_filter_element(column, data_type, table_name) {
// // //   const container = document.createElement('div');
// // //   container.classList.add('input-group');

// // //   let dt_string = 'text';
// // //   if (data_type && data_type.data_type) {
// // //     dt_string = data_type.data_type.toLowerCase();
// // //   }

// // //   // Erikoistapaus openai_embedding-kentälle
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

// // //   // Jos kyseessä on numeeriset tai päivämäärätyyppiset kentät, luodaan kaksi input-kenttää (alueen min/max)
// // //   if (
// // //     [
// // //       'integer',
// // //       'bigint',
// // //       'smallint',
// // //       'numeric',
// // //       'date',
// // //       'timestamp',
// // //       'timestamp without time zone',
// // //       'timestamp with time zone'
// // //     ].includes(dt_string)
// // //   ) {
// // //     const fromInput = document.createElement('input');
// // //     const toInput = document.createElement('input');

// // //     if (['integer', 'bigint', 'smallint', 'numeric'].includes(dt_string)) {
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

// // //     // Asetetaan uniikit tunnisteet
// // //     fromInput.id = `${table_name}_filter_${column}_from`;
// // //     toInput.id = `${table_name}_filter_${column}_to`;

// // //     // Lisää tapahtumakuuntelijat molemmille kentille
// // //     [fromInput, toInput].forEach(inputField => {
// // //       inputField.addEventListener('input', () => {
// // //         filter_table(table_name);
// // //         resetOffset();
// // //       });
// // //     });

// // //     // Lisää kentät kontaineriin
// // //     container.appendChild(fromInput);
// // //     container.appendChild(toInput);

// // //     // Lisää yhteinen label sarakkeelle
// // //     const label = document.createElement('label');
// // //     label.textContent = column;
// // //     container.appendChild(label);

// // //   } else if (dt_string === 'boolean') {
// // //     input = document.createElement('select');
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
// // //     });
// // //     container.appendChild(input);

// // //     const label = document.createElement('label');
// // //     label.setAttribute('for', input.id || '');
// // //     label.textContent = column;
// // //     container.appendChild(label);

// // //   } else {
// // //     // Normaali tekstisyöte
// // //     input = document.createElement('input');
// // //     input.type = 'text';
// // //     input.placeholder = ' ';
// // //     input.id = `${table_name}_filter_${column}`;
// // //     input.addEventListener('input', () => {
// // //       filter_table(table_name);
// // //       resetOffset();
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
// // // //  * create_filter_bar:
// // // //  *  - Taulun nimi
// // // //  *  - Rivimäärä
// // // //  *  - CRUD-napit
// // // //  *  - Sarakenäkyvyysdropdown (vain table-näkymälle)
// // // //  *  - AI-Embedding -nappi
// // // //  *  - Näkymänapit (Taulu / Kortti / Puu)
// // // //  *  - (UUSI) Kolme erilaista näkymää: normal, transposed, ticket
// // // //  *  - Hakukenttä
// // // //  *  - Suodatus+Järjestä / Chat -välilehdet
// // // //  *
// // // //  * Lisäksi luodaan sisardivi (readOnlyContainer), johon taulu sijoitetaan.
// // // //  */
// // // // export function create_filter_bar(table_name, columns, data_types, current_view) {
// // // //   // 0) Haetaan/luodaan yleiskontti (table_parts_container).
// // // //   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// // // //   if (!table_parts_container) {
// // // //     table_parts_container = document.createElement('div');
// // // //     table_parts_container.id = `${table_name}_table_parts_container`;
// // // //     document.body.appendChild(table_parts_container);
// // // //   }

// // // //   // 1) Luodaan filterBar, ellei sitä vielä ole.
// // // //   let filter_bar = document.getElementById(`${table_name}_filterBar`);
// // // //   if (!filter_bar) {
// // // //     filter_bar = document.createElement('div');
// // // //     filter_bar.id = `${table_name}_filterBar`;
// // // //     filter_bar.classList.add('filterBar');

// // // //     // 1a) Luodaan otsikolle oma kontti
// // // //     const title_container = document.createElement('div');
// // // //     const table_name_element = document.createElement('div');
// // // //     table_name_element.textContent = table_name;
// // // //     table_name_element.style.fontWeight = 'bold';
// // // //     table_name_element.style.fontSize = '20px';
// // // //     table_name_element.setAttribute('data-lang-key', table_name);
// // // //     table_name_element.title = table_name;

// // // //     const table_name_span = document.createElement('span');
// // // //     table_name_span.textContent = table_name;

// // // //     title_container.appendChild(table_name_element);
// // // //     title_container.appendChild(table_name_span);
// // // //     filter_bar.appendChild(title_container);

// // // //     // 2) Yläpuolen rivimäärä + napit (top_row)
// // // //     const top_row = document.createElement('div');
// // // //     top_row.classList.add('filterBar-top-row');

// // // //     // 2a) Rivimäärä
// // // //     const row_count_element = document.createElement('span');
// // // //     row_count_element.textContent = "Rows: ...";
// // // //     fetchRowCount(table_name).then(count => {
// // // //       if (count !== null) {
// // // //         row_count_element.textContent = `Rows: ${count}`;
// // // //       } else {
// // // //         row_count_element.textContent = 'Rows: ?';
// // // //       }
// // // //     });

// // // //     // 2b) CRUD-napit
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

// // // //     // Ylin rivi: rivimäärä + CRUD-napit
// // // //     const first_line_div = document.createElement('div');
// // // //     first_line_div.classList.add('top-row-first-line');
// // // //     first_line_div.appendChild(row_count_element);
// // // //     first_line_div.appendChild(button_container_div);

// // // //     // *** (Esimerkin mukaan) Luodaan myös vanhat "Taulu / Kortti / Puu" -näkymänapit
// // // //     const viewSelectorDiv = createViewSelectorButtons(table_name, current_view);

// // // //     // *** LISÄTÄÄN UUSI 3-OSAINEN VALITSIN (normal, transposed, ticket) ***
// // // //     const newViewSelectorDiv = createNewViewSelector(table_name, current_view);

// // // //     // Rakennetaan top_row-kokonaisuus kahdesta rivistä:
// // // //     // Rivi1: rivimäärä ja CRUD-napit
// // // //     // Rivi2: vanhat napit + uudet napit
// // // //     top_row.appendChild(first_line_div);

// // // //     // Luodaan toinen "rivielementti" näkymäpainikkeille
// // // //     const second_line_div = document.createElement('div');
// // // //     second_line_div.classList.add('top-row-second-line');
// // // //     // Laita vanhat napit + uudet napit samaan konttiin
// // // //     second_line_div.appendChild(viewSelectorDiv);
// // // //     second_line_div.appendChild(newViewSelectorDiv);

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

// // // //     // 4) Tab-napit (Suodatus+Järjestä / Chat)
// // // //     const tabs_row = document.createElement('div');
// // // //     tabs_row.classList.add('filterBar-tabs-row');
// // // //     const tab_button_sortfilter = document.createElement('button');
// // // //     tab_button_sortfilter.textContent = 'Suodata ja järjestä';

// // // //     const tab_button_chat = document.createElement('button');
// // // //     tab_button_chat.textContent = 'Chat';

// // // //     tabs_row.appendChild(tab_button_sortfilter);
// // // //     tabs_row.appendChild(tab_button_chat);
// // // //     filter_bar.appendChild(tabs_row);

// // // //     // 5) Tabien sisältö
// // // //     const tabs_content_container = document.createElement('div');
// // // //     tabs_content_container.classList.add('tabs_content_container');

// // // //     // 5a) Sort+filter -section
// // // //     const sort_filter_section = document.createElement('div');
// // // //     sort_filter_section.classList.add('sort_filter_section');

// // // //     // ----------------------------------------------------
// // // //     // Uusi logiikka: erotellaan "normaalit" ja "ID" -sarakkeet
// // // //     // ----------------------------------------------------
// // // //     let normalColumns = [];
// // // //     let idColumns = [];

// // // //     columns.forEach((col) => {
// // // //       if (col.endsWith('_uid') || col.endsWith('_id')) {
// // // //         idColumns.push(col);
// // // //       } else {
// // // //         normalColumns.push(col);
// // // //       }
// // // //     });

// // // //     // Luodaan kaksi erillistä containeria
// // // //     const normalContainer = document.createElement('div');
// // // //     normalContainer.classList.add('combined-filter-sort-container');

// // // //     const idContainer = document.createElement('div');
// // // //     idContainer.classList.add('combined-filter-sort-container');

// // // //     // Funktio, joka rakentaa yhden rivin (sort-nappi + filter) annettuun containeriin
// // // //     function createRowForColumn(container, column) {
// // // //       const row_container = document.createElement('div');
// // // //       row_container.classList.add('row-container');

// // // //       // Sorttausnappi
// // // //       const sort_button = document.createElement('button');
// // // //       sort_button.setAttribute('data-sort-state', 'none');
// // // //       sort_button.innerHTML = '&#x21C5;'; // Molemmat nuolet aluksi

// // // //       // --- Sort-painikkeen klikkaus ---
// // // //       sort_button.addEventListener('click', () => {
// // // //         // 1) Nollataan muiden sorttausnappejen tila
// // // //         const allSortButtons = container.querySelectorAll('button[data-sort-state]');
// // // //         allSortButtons.forEach((btn) => {
// // // //           if (btn !== sort_button) {
// // // //             btn.setAttribute('data-sort-state', 'none');
// // // //             btn.innerHTML = '&#x21C5;';
// // // //           }
// // // //         });

// // // //         // 2) Päivitetään klikatun napin oma tila
// // // //         let state = sort_button.getAttribute('data-sort-state');
// // // //         let newState;

// // // //         if (state === 'none') {
// // // //           newState = 'asc';
// // // //           sort_button.innerHTML = '&#9650;'; // Ylöspäin osoittava nuoli
// // // //         } else if (state === 'asc') {
// // // //           newState = 'desc';
// // // //           sort_button.innerHTML = '&#9660;'; // Alaspäin osoittava nuoli
// // // //         } else {
// // // //           newState = 'none';
// // // //           sort_button.innerHTML = '&#x21C5;'; // Palautetaan kaksoisnuoli
// // // //         }

// // // //         sort_button.setAttribute('data-sort-state', newState);

// // // //         // 3) Kutsutaan lajittelufunktiota
// // // //         applySort(table_name, column, newState);
// // // //       });

// // // //       // Suodatusinput
// // // //       const filter_element = create_filter_element(column, data_types[column], table_name);

// // // //       row_container.appendChild(sort_button);
// // // //       row_container.appendChild(filter_element);
// // // //       container.appendChild(row_container);
// // // //     }

// // // //     // Rakennetaan normaalien sarakkeiden rivit
// // // //     normalColumns.forEach((col) => {
// // // //       createRowForColumn(normalContainer, col);
// // // //     });

// // // //     // Rakennetaan ID-sarakkeiden rivit
// // // //     idColumns.forEach((col) => {
// // // //       createRowForColumn(idContainer, col);
// // // //     });

// // // //     // -----------------------------------------------------------------------
// // // //     // Yhdistetään normaalit ja id-sarakkeet yhteen collapsible-lohkoon.
// // // //     // Normaalit suodattimet näytetään aina ja id-sarakkeet piilotetaan "Enemmän"-napin takana.
// // // //     // -----------------------------------------------------------------------
// // // //     const filtersContainer = document.createElement('div');
// // // //     filtersContainer.classList.add('combined-filter-sort-container');

// // // //     // Lisätään normaalit suodattimet näkyviin
// // // //     filtersContainer.appendChild(normalContainer);

// // // //     // Jos id-sarakkeita löytyy, lisätään togglable alue ja "Enemmän"-nappi
// // // //     if (idColumns.length > 0) {
// // // //       const idFiltersWrapper = document.createElement('div');
// // // //       idFiltersWrapper.style.display = 'none'; // aluksi piilotettu
// // // //       idFiltersWrapper.appendChild(idContainer);

// // // //       const moreButton = document.createElement('button');
// // // //       // also add data-lang-key="more" to moreButton
// // // //       moreButton.setAttribute('data-lang-key', 'show_more');
// // // //       moreButton.textContent = 'Enemmän';
// // // //       moreButton.addEventListener('click', () => {
// // // //         if (idFiltersWrapper.style.display === 'none') {
// // // //           idFiltersWrapper.style.display = 'block';
// // // //           moreButton.setAttribute('data-lang-key', 'show_less');
// // // //           moreButton.textContent = 'Vähemmän';
// // // //         } else {
// // // //           idFiltersWrapper.style.display = 'none';
// // // //           moreButton.setAttribute('data-lang-key', 'show_more');
// // // //           moreButton.textContent = 'Enemmän';
// // // //         }
// // // //       });

// // // //       filtersContainer.appendChild(moreButton);
// // // //       filtersContainer.appendChild(idFiltersWrapper);
// // // //     }

// // // //     // Kääritään koko filtersContainer collapsible-lohkoon
// // // //     const combinedCollapsible = create_collapsible_section('Järjestä ja suodata', filtersContainer, true);
// // // //     sort_filter_section.appendChild(combinedCollapsible);

// // // //     // 5b) Chat-section
// // // //     const chat_section = document.createElement('div');
// // // //     chat_section.classList.add('chat_section');
// // // //     chat_section.classList.add('hidden');

// // // //     create_chat_ui(table_name, chat_section);

// // // //     // Alussa Suodatus+Järjestä -välilehti on aktiivinen
// // // //     tab_button_sortfilter.classList.add('tab-button-active');
// // // //     tab_button_chat.classList.remove('tab-button-active');
// // // //     sort_filter_section.classList.remove('hidden');
// // // //     chat_section.classList.add('hidden');

// // // //     tabs_content_container.appendChild(sort_filter_section);
// // // //     tabs_content_container.appendChild(chat_section);
// // // //     filter_bar.appendChild(tabs_content_container);

// // // //     // 6) Liitetään filter_bar DOM:iin
// // // //     table_parts_container.appendChild(filter_bar);

// // // //     // 7) readOnlyContainer
// // // //     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // //     if (!readOnlyContainer) {
// // // //       readOnlyContainer = document.createElement('div');
// // // //       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// // // //       readOnlyContainer.classList.add('readOnlyContainer');
// // // //       table_parts_container.appendChild(readOnlyContainer);
// // // //     }

// // // //     // 8) Tabien klikkilogiikka
// // // //     tab_button_sortfilter.addEventListener('click', () => {
// // // //       tab_button_sortfilter.classList.add('tab-button-active');
// // // //       tab_button_chat.classList.remove('tab-button-active');
// // // //       sort_filter_section.classList.remove('hidden');
// // // //       chat_section.classList.add('hidden');
// // // //     });

// // // //     tab_button_chat.addEventListener('click', () => {
// // // //       tab_button_chat.classList.add('tab-button-active');
// // // //       tab_button_sortfilter.classList.remove('tab-button-active');
// // // //       chat_section.classList.remove('hidden');
// // // //       sort_filter_section.classList.add('hidden');
// // // //     });

// // // //     // 9) Hakukentän "live-haku"
// // // //     global_search_input.addEventListener('input', () => {
// // // //       filter_table(table_name);
// // // //       resetOffset();
// // // //     });
// // // //   }
// // // // }


// // // // // /**
// // // // //  * create_filter_bar:
// // // // //  *  - Taulun nimi
// // // // //  *  - Rivimäärä
// // // // //  *  - CRUD-napit
// // // // //  *  - Sarakenäkyvyysdropdown (vain table-näkymälle)
// // // // //  *  - AI-Embedding -nappi
// // // // //  *  - Näkymänapit (Taulu / Kortti / Puu)
// // // // //  *  - (UUSI) Kolme erilaista näkymää: normal, transposed, ticket
// // // // //  *  - Hakukenttä
// // // // //  *  - Suodatus+Järjestä / Chat -välilehdet
// // // // //  *
// // // // //  * Lisäksi luodaan sisardivi (readOnlyContainer), johon taulu sijoitetaan.
// // // // //  */
// // // // // export function create_filter_bar(table_name, columns, data_types, current_view) {
// // // // //   // 0) Haetaan/luodaan yleiskontti (table_parts_container).
// // // // //   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// // // // //   if (!table_parts_container) {
// // // // //     table_parts_container = document.createElement('div');
// // // // //     table_parts_container.id = `${table_name}_table_parts_container`;
// // // // //     document.body.appendChild(table_parts_container);
// // // // //   }

// // // // //   // 1) Luodaan filterBar, ellei sitä vielä ole.
// // // // //   let filter_bar = document.getElementById(`${table_name}_filterBar`);
// // // // //   if (!filter_bar) {
// // // // //     filter_bar = document.createElement('div');
// // // // //     filter_bar.id = `${table_name}_filterBar`;
// // // // //     filter_bar.classList.add('filterBar');

// // // // //     // 1a) Luodaan otsikolle oma kontti
// // // // //     const title_container = document.createElement('div');
// // // // //     const table_name_element = document.createElement('div');
// // // // //     table_name_element.textContent = table_name;
// // // // //     table_name_element.style.fontWeight = 'bold';
// // // // //     table_name_element.style.fontSize = '20px';
// // // // //     table_name_element.setAttribute('data-lang-key', table_name);
// // // // //     table_name_element.title = table_name;

// // // // //     const table_name_span = document.createElement('span');
// // // // //     table_name_span.textContent = table_name;

// // // // //     title_container.appendChild(table_name_element);
// // // // //     title_container.appendChild(table_name_span);
// // // // //     filter_bar.appendChild(title_container);

// // // // //     // 2) Yläpuolen rivimäärä + napit (top_row)
// // // // //     const top_row = document.createElement('div');
// // // // //     top_row.classList.add('filterBar-top-row');

// // // // //     // 2a) Rivimäärä
// // // // //     const row_count_element = document.createElement('span');
// // // // //     row_count_element.textContent = "Rows: ...";
// // // // //     fetchRowCount(table_name).then(count => {
// // // // //       if (count !== null) {
// // // // //         row_count_element.textContent = `Rows: ${count}`;
// // // // //       } else {
// // // // //         row_count_element.textContent = 'Rows: ?';
// // // // //       }
// // // // //     });

// // // // //     // 2b) CRUD-napit
// // // // //     const button_container_div = document.createElement('div');
// // // // //     button_container_div.classList.add('filterBar-button-container');
// // // // //     button_container_div.appendChild(createAddRowButton(table_name));
// // // // //     button_container_div.appendChild(createColumnManagementButton(table_name));
// // // // //     button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

// // // // //     // Sarakenäkyvyysdropdown vain table-näkymälle
// // // // //     if (current_view === 'table') {
// // // // //       const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // //       if (tableContainer) {
// // // // //         const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
// // // // //         if (columnVisibilityDropdown) {
// // // // //           button_container_div.appendChild(columnVisibilityDropdown);
// // // // //         }
// // // // //       }
// // // // //     }

// // // // //     // Ylin rivi: rivimäärä + CRUD-napit
// // // // //     const first_line_div = document.createElement('div');
// // // // //     first_line_div.classList.add('top-row-first-line');
// // // // //     first_line_div.appendChild(row_count_element);
// // // // //     first_line_div.appendChild(button_container_div);

// // // // //     // *** (Esimerkin mukaan) Luodaan myös vanhat "Taulu / Kortti / Puu" -näkymänapit
// // // // //     const viewSelectorDiv = createViewSelectorButtons(table_name, current_view);

// // // // //     // *** LISÄTÄÄN UUSI 3-OSAINEN VALITSIN (normal, transposed, ticket) ***
// // // // //     const newViewSelectorDiv = createNewViewSelector(table_name, current_view);

// // // // //     // Rakennetaan top_row-kokonaisuus kahdesta rivistä:
// // // // //     // Rivi1: rivimäärä ja CRUD-napit
// // // // //     // Rivi2: vanhat napit + uudet napit
// // // // //     top_row.appendChild(first_line_div);

// // // // //     // Luodaan toinen "rivielementti" näkymäpainikkeille
// // // // //     const second_line_div = document.createElement('div');
// // // // //     second_line_div.classList.add('top-row-second-line');
// // // // //     // Laita vanhat napit + uudet napit samaan konttiin
// // // // //     second_line_div.appendChild(viewSelectorDiv);
// // // // //     second_line_div.appendChild(newViewSelectorDiv);

// // // // //     top_row.appendChild(second_line_div);

// // // // //     filter_bar.appendChild(top_row);

// // // // //     // 3) Hakukenttä
// // // // //     const search_row = document.createElement('div');
// // // // //     search_row.classList.add('filterBar-search-row');
// // // // //     const global_search_input = document.createElement('input');
// // // // //     global_search_input.type = 'text';
// // // // //     global_search_input.placeholder = 'Hae jotain...';
// // // // //     global_search_input.id = `${table_name}_global_search_input`;
// // // // //     search_row.appendChild(global_search_input);
// // // // //     filter_bar.appendChild(search_row);

// // // // //     // 4) Tab-napit (Suodatus+Järjestä / Chat)
// // // // //     const tabs_row = document.createElement('div');
// // // // //     tabs_row.classList.add('filterBar-tabs-row');
// // // // //     const tab_button_sortfilter = document.createElement('button');
// // // // //     tab_button_sortfilter.textContent = 'Suodata ja järjestä';

// // // // //     const tab_button_chat = document.createElement('button');
// // // // //     tab_button_chat.textContent = 'Chat';

// // // // //     tabs_row.appendChild(tab_button_sortfilter);
// // // // //     tabs_row.appendChild(tab_button_chat);
// // // // //     filter_bar.appendChild(tabs_row);

// // // // //     // 5) Tabien sisältö
// // // // //     const tabs_content_container = document.createElement('div');
// // // // //     tabs_content_container.classList.add('tabs_content_container');

// // // // //     // 5a) Sort+filter - Yhdistetty sarakkeisiin
// // // // //     const sort_filter_section = document.createElement('div');
// // // // //     sort_filter_section.classList.add('sort_filter_section');

// // // // //     // Muodostetaan flex-kontti, jossa jokainen rivi sisältää sorttausnapin ja suodatusinputin
// // // // //     const combined_container = document.createElement('div');
// // // // //     combined_container.classList.add('combined-filter-sort-container');
// // // // //     // combined_container.style.display = 'flex';
// // // // //     // combined_container.style.flexDirection = 'column';
// // // // //     // combined_container.style.gap = '1rem';

// // // // //     // Käydään sarakkeet läpi ja luodaan jokaiselle rivi
// // // // //     columns.forEach((column) => {
// // // // //       // Luodaan rivi flexboxilla
// // // // //       const row_container = document.createElement('div');
// // // // //       row_container.classList.add('row-container');
// // // // //       // row_container.style.display = 'flex';
// // // // //       // row_container.style.alignItems = 'center';
// // // // //       // row_container.style.gap = '0.5rem';

// // // // //       // Sorttausnappi
// // // // //       const sort_button = document.createElement('button');
// // // // //       sort_button.setAttribute('data-sort-state', 'none');
// // // // //       sort_button.innerHTML = '&#x21C5;'; // Molemmat nuolet aluksi

// // // // //       // --- Tässä klikkitapahtuman käsittelijä ---
// // // // //       sort_button.addEventListener('click', () => {
// // // // //         // 1) Nollataan muiden sorttausnappejen tila
// // // // //         const allSortButtons = document.querySelectorAll('.combined-filter-sort-container button[data-sort-state]');
// // // // //         allSortButtons.forEach((btn) => {
// // // // //           // Nollataan kaikki muut napit
// // // // //           if (btn !== sort_button) {
// // // // //             btn.setAttribute('data-sort-state', 'none');
// // // // //             btn.innerHTML = '&#x21C5;';
// // // // //           }
// // // // //         });

// // // // //         // 2) Päivitetään klikatun napin oma tila
// // // // //         let state = sort_button.getAttribute('data-sort-state');
// // // // //         let newState;
        
// // // // //         if (state === 'none') {
// // // // //           newState = 'asc';
// // // // //           sort_button.innerHTML = '&#9650;'; // Ylöspäin osoittava nuoli
// // // // //         } else if (state === 'asc') {
// // // // //           newState = 'desc';
// // // // //           sort_button.innerHTML = '&#9660;'; // Alaspäin osoittava nuoli
// // // // //         } else {
// // // // //           newState = 'none';
// // // // //           sort_button.innerHTML = '&#x21C5;'; // Palautetaan kaksoisnuoli
// // // // //         }
        
// // // // //         sort_button.setAttribute('data-sort-state', newState);

// // // // //         // 3) Kutsutaan lajittelufunktiota
// // // // //         applySort(table_name, column, newState);
// // // // //       });

// // // // //       // Suodatusinput
// // // // //       const filter_element = create_filter_element(column, data_types[column], table_name);

// // // // //       // Lisätään sorttausnappi ja suodatusinput riville
// // // // //       row_container.appendChild(sort_button);
// // // // //       row_container.appendChild(filter_element);

// // // // //       // Lisätään rivi yhdistettyyn konttiin
// // // // //       combined_container.appendChild(row_container);
// // // // //     });

// // // // //     // Kääritään yhdistetty container collapsible-elementtiin
// // // // //     const combined_collapsible = create_collapsible_section('Suodata ja järjestä', combined_container, true);
// // // // //     sort_filter_section.appendChild(combined_collapsible);

// // // // //     // 5b) Chat-section
// // // // //     const chat_section = document.createElement('div');
// // // // //     chat_section.classList.add('chat_section');
// // // // //     chat_section.classList.add('hidden');

// // // // //     create_chat_ui(table_name, chat_section);

// // // // //     // Alussa Suodatus+Järjestä -välilehti on aktiivinen
// // // // //     tab_button_sortfilter.classList.add('tab-button-active');
// // // // //     tab_button_chat.classList.remove('tab-button-active');
// // // // //     sort_filter_section.classList.remove('hidden');
// // // // //     chat_section.classList.add('hidden');

// // // // //     tabs_content_container.appendChild(sort_filter_section);
// // // // //     tabs_content_container.appendChild(chat_section);
// // // // //     filter_bar.appendChild(tabs_content_container);

// // // // //     // 6) Liitetään filter_bar DOM:iin
// // // // //     table_parts_container.appendChild(filter_bar);

// // // // //     // 7) readOnlyContainer
// // // // //     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // //     if (!readOnlyContainer) {
// // // // //       readOnlyContainer = document.createElement('div');
// // // // //       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// // // // //       readOnlyContainer.classList.add('readOnlyContainer');
// // // // //       table_parts_container.appendChild(readOnlyContainer);
// // // // //     }

// // // // //     // 8) Tabien klikkilogiikka
// // // // //     tab_button_sortfilter.addEventListener('click', () => {
// // // // //       tab_button_sortfilter.classList.add('tab-button-active');
// // // // //       tab_button_chat.classList.remove('tab-button-active');
// // // // //       sort_filter_section.classList.remove('hidden');
// // // // //       chat_section.classList.add('hidden');
// // // // //     });

// // // // //     tab_button_chat.addEventListener('click', () => {
// // // // //       tab_button_chat.classList.add('tab-button-active');
// // // // //       tab_button_sortfilter.classList.remove('tab-button-active');
// // // // //       chat_section.classList.remove('hidden');
// // // // //       sort_filter_section.classList.add('hidden');
// // // // //     });

// // // // //     // 9) Hakukentän "live-haku"
// // // // //     global_search_input.addEventListener('input', () => {
// // // // //       filter_table(table_name);
// // // // //       resetOffset();
// // // // //     });
// // // // //   }
// // // // // }

// // // // /**
// // // //  * Luo suodatus-elementin kullekin sarakkeelle.
// // // //  */
// // // // function create_filter_element(column, data_type, table_name) {
// // // //   const container = document.createElement('div');
// // // //   container.classList.add('input-group');

// // // //   let dt_string = 'text';
// // // //   if (data_type && data_type.data_type) {
// // // //     dt_string = data_type.data_type.toLowerCase();
// // // //   }

// // // //   // Erikoistapaus openai_embedding-kentälle
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

// // // //   // Jos kyseessä on numeeriset tai päivämäärätyyppiset kentät, luodaan kaksi input-kenttää (alueen min/max)
// // // //   if (
// // // //     [
// // // //       'integer',
// // // //       'bigint',
// // // //       'smallint',
// // // //       'numeric',
// // // //       'date',
// // // //       'timestamp',
// // // //       'timestamp without time zone',
// // // //       'timestamp with time zone'
// // // //     ].includes(dt_string)
// // // //   ) {
// // // //     const fromInput = document.createElement('input');
// // // //     const toInput = document.createElement('input');

// // // //     if (['integer', 'bigint', 'smallint', 'numeric'].includes(dt_string)) {
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

// // // //     // Asetetaan uniikit tunnisteet
// // // //     fromInput.id = `${table_name}_filter_${column}_from`;
// // // //     toInput.id = `${table_name}_filter_${column}_to`;

// // // //     // Lisää tapahtumakuuntelijat molemmille kentille
// // // //     [fromInput, toInput].forEach(inputField => {
// // // //       inputField.addEventListener('input', () => {
// // // //         filter_table(table_name);
// // // //         resetOffset();
// // // //       });
// // // //     });

// // // //     // Lisää kentät kontaineriin
// // // //     container.appendChild(fromInput);
// // // //     container.appendChild(toInput);

// // // //     // Lisää yhteinen label sarakkeelle
// // // //     const label = document.createElement('label');
// // // //     label.textContent = column;
// // // //     container.appendChild(label);

// // // //   } else if (dt_string === 'boolean') {
// // // //     input = document.createElement('select');
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
// // // //     label.setAttribute('for', input.id || '');
// // // //     label.textContent = column;
// // // //     container.appendChild(label);

// // // //   } else {
// // // //     // Normaali tekstisyöte
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


// // // // // // create_filter_bar.js

// // // // // // 1) Tuodaan tarvittavat importit
// // // // // import { resetOffset } from '../../logical_components/infinite_scroll/infinite_scroll.js';
// // // // // import { applySort } from '../gt_crud/gt_read/apply_sort.js';
// // // // // import { filter_table } from './filter.js';
// // // // // import { create_collapsible_section } from '../../logical_components/collapsible_section.js';
// // // // // import { create_chat_ui } from '../../logical_components/ai_features/table_chat/chat.js';
// // // // // import { generate_table } from '../../logical_components/table_views/view_table.js';
// // // // // import { createViewSelectorButtons } from './draw_view_selector_buttons.js';
// // // // // import {
// // // // //   createAddRowButton,
// // // // //   createDeleteSelectedButton,
// // // // //   createColumnManagementButton
// // // // // } from '../gt_toolbar/button_factory.js';
// // // // // import { createColumnVisibilityDropdown } from '../gt_toolbar/column_visibility_dropdown.js';

// // // // // // TUODAAN MYÖS UUSI VIEW-SELECTOR:
// // // // // import { createNewViewSelector } from '../../logical_components/table_views/draw_view_selector_buttons.js';

// // // // // /**
// // // // //  * Haetaan rivimäärä.
// // // // //  */
// // // // // async function fetchRowCount(table_name) {
// // // // //   try {
// // // // //     const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
// // // // //       method: 'GET',
// // // // //       credentials: 'include'
// // // // //     });
// // // // //     if (!resp.ok) {
// // // // //       throw new Error(`error (status: ${resp.status})`);
// // // // //     }
// // // // //     const data = await resp.json();
// // // // //     if (data && typeof data.row_count === 'number') {
// // // // //       return data.row_count;
// // // // //     } else {
// // // // //       throw new Error("row_count missing in response");
// // // // //     }
// // // // //   } catch (error) {
// // // // //     console.error("virhe fetchRowCount-funktiossa:", error);
// // // // //     return null;
// // // // //   }
// // // // // }

// // // // // /**
// // // // //  * create_filter_bar:
// // // // //  *  - Taulun nimi
// // // // //  *  - Rivimäärä
// // // // //  *  - CRUD-napit
// // // // //  *  - Sarakenäkyvyysdropdown (vain table-näkymälle)
// // // // //  *  - AI-Embedding -nappi
// // // // //  *  - Näkymänapit (Taulu / Kortti / Puu)
// // // // //  *  - (UUSI) Kolme erilaista näkymää: normal, transposed, ticket
// // // // //  *  - Hakukenttä
// // // // //  *  - Suodatus+Järjestä / Chat -välilehdet
// // // // //  *
// // // // //  * Lisäksi luodaan sisardivi (readOnlyContainer), johon taulu sijoitetaan.
// // // // //  */
// // // // // export function create_filter_bar(table_name, columns, data_types, current_view) {
// // // // //   // 0) Haetaan/luodaan yleiskontti (table_parts_container).
// // // // //   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// // // // //   if (!table_parts_container) {
// // // // //     table_parts_container = document.createElement('div');
// // // // //     table_parts_container.id = `${table_name}_table_parts_container`;
// // // // //     document.body.appendChild(table_parts_container);
// // // // //   }

// // // // //   // 1) Luodaan filterBar, ellei sitä vielä ole.
// // // // //   let filter_bar = document.getElementById(`${table_name}_filterBar`);
// // // // //   if (!filter_bar) {
// // // // //     filter_bar = document.createElement('div');
// // // // //     filter_bar.id = `${table_name}_filterBar`;
// // // // //     filter_bar.classList.add('filterBar');

// // // // //     // 1a) Luodaan otsikolle oma kontti
// // // // //     const title_container = document.createElement('div');
// // // // //     const table_name_element = document.createElement('div');
// // // // //     table_name_element.textContent = table_name;
// // // // //     table_name_element.style.fontWeight = 'bold';
// // // // //     table_name_element.style.fontSize = '20px';
// // // // //     table_name_element.setAttribute('data-lang-key', table_name);
// // // // //     table_name_element.title = table_name;

// // // // //     const table_name_span = document.createElement('span');
// // // // //     table_name_span.textContent = table_name;

// // // // //     title_container.appendChild(table_name_element);
// // // // //     title_container.appendChild(table_name_span);
// // // // //     filter_bar.appendChild(title_container);

// // // // //     // 2) Yläpuolen rivimäärä + napit (top_row)
// // // // //     const top_row = document.createElement('div');
// // // // //     top_row.classList.add('filterBar-top-row');

// // // // //     // 2a) Rivimäärä
// // // // //     const row_count_element = document.createElement('span');
// // // // //     row_count_element.textContent = "Rows: ...";
// // // // //     fetchRowCount(table_name).then(count => {
// // // // //       if (count !== null) {
// // // // //         row_count_element.textContent = `Rows: ${count}`;
// // // // //       } else {
// // // // //         row_count_element.textContent = 'Rows: ?';
// // // // //       }
// // // // //     });

// // // // //     // 2b) CRUD-napit
// // // // //     const button_container_div = document.createElement('div');
// // // // //     button_container_div.classList.add('filterBar-button-container');
// // // // //     button_container_div.appendChild(createAddRowButton(table_name));
// // // // //     button_container_div.appendChild(createColumnManagementButton(table_name));
// // // // //     button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

// // // // //     // Sarakenäkyvyysdropdown vain table-näkymälle
// // // // //     if (current_view === 'table') {
// // // // //       const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // //       if (tableContainer) {
// // // // //         const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
// // // // //         if (columnVisibilityDropdown) {
// // // // //           button_container_div.appendChild(columnVisibilityDropdown);
// // // // //         }
// // // // //       }
// // // // //     }

// // // // //     // Ylin rivi: rivimäärä + CRUD-napit
// // // // //     const first_line_div = document.createElement('div');
// // // // //     first_line_div.classList.add('top-row-first-line');
// // // // //     first_line_div.appendChild(row_count_element);
// // // // //     first_line_div.appendChild(button_container_div);

// // // // //     // *** (Esimerkin mukaan) Luodaan myös vanhat "Taulu / Kortti / Puu" -näkymänapit
// // // // //     const viewSelectorDiv = createViewSelectorButtons(table_name, current_view);

// // // // //     // *** LISÄTÄÄN UUSI 3-OSAINEN VALITSIN (normal, transposed, ticket) ***
// // // // //     const newViewSelectorDiv = createNewViewSelector(table_name, current_view);

// // // // //     // Rakennetaan top_row-kokonaisuus kahdesta rivistä:
// // // // //     // Rivi1: rivimäärä ja CRUD-napit
// // // // //     // Rivi2: vanhat napit + uudet napit
// // // // //     top_row.appendChild(first_line_div);

// // // // //     // Luodaan toinen "rivielementti" näkymäpainikkeille
// // // // //     const second_line_div = document.createElement('div');
// // // // //     second_line_div.classList.add('top-row-second-line');
// // // // //     // Laita vanhat napit + uudet napit samaan konttiin
// // // // //     second_line_div.appendChild(viewSelectorDiv);
// // // // //     second_line_div.appendChild(newViewSelectorDiv);

// // // // //     top_row.appendChild(second_line_div);

// // // // //     filter_bar.appendChild(top_row);

// // // // //     // 3) Hakukenttä
// // // // //     const search_row = document.createElement('div');
// // // // //     search_row.classList.add('filterBar-search-row');
// // // // //     const global_search_input = document.createElement('input');
// // // // //     global_search_input.type = 'text';
// // // // //     global_search_input.placeholder = 'Hae jotain...';
// // // // //     global_search_input.id = `${table_name}_global_search_input`;
// // // // //     search_row.appendChild(global_search_input);
// // // // //     filter_bar.appendChild(search_row);

// // // // //     // 4) Tab-napit (Suodatus+Järjestä / Chat)
// // // // //     const tabs_row = document.createElement('div');
// // // // //     tabs_row.classList.add('filterBar-tabs-row');
// // // // //     const tab_button_sortfilter = document.createElement('button');
// // // // //     tab_button_sortfilter.textContent = 'Suodata ja järjestä';

// // // // //     const tab_button_chat = document.createElement('button');
// // // // //     tab_button_chat.textContent = 'Chat';

// // // // //     tabs_row.appendChild(tab_button_sortfilter);
// // // // //     tabs_row.appendChild(tab_button_chat);
// // // // //     filter_bar.appendChild(tabs_row);

// // // // //     // 5) Tabien sisältö
// // // // //     const tabs_content_container = document.createElement('div');
// // // // //     tabs_content_container.classList.add('tabs_content_container');

// // // // //     // 5a) Sort+filter - Yhdistetty sarakkeisiin
// // // // //     const sort_filter_section = document.createElement('div');
// // // // //     sort_filter_section.classList.add('sort_filter_section');



// // // // // // Muodostetaan flex-kontti, jossa jokainen rivi sisältää sorttausnapin ja suodatusinputin
// // // // // const combined_container = document.createElement('div');
// // // // // combined_container.classList.add('combined-filter-sort-container');
// // // // // // Käytetään flexboxia ja asetetaan jokainen pari omaan riviinsä
// // // // // combined_container.style.display = 'flex';
// // // // // combined_container.style.flexDirection = 'column';
// // // // // combined_container.style.gap = '1rem';

// // // // // // Käydään sarakkeet läpi ja luodaan jokaiselle rivi
// // // // // columns.forEach((column) => {
// // // // //   // Luodaan rivi flexboxilla
// // // // //   const row_container = document.createElement('div');
// // // // //   row_container.classList.add('row-container');
// // // // //   row_container.style.display = 'flex';
// // // // //   row_container.style.alignItems = 'center';
// // // // //   row_container.style.gap = '0.5rem';
  
// // // // //   // // Sorttausnappi – ei tarvita tekstiä, mutta voidaan lisätä esim. ikoni
// // // // //   const sort_button = document.createElement('button');
// // // // // sort_button.setAttribute('data-sort-state', 'none');
// // // // // sort_button.innerHTML = '&#x21C5;'; // Näyttää molemmat nuolet

// // // // // sort_button.addEventListener('click', () => {
// // // // //   let state = sort_button.getAttribute('data-sort-state');
// // // // //   let newState;
  
// // // // //   if (state === 'none') {
// // // // //     newState = 'asc';
// // // // //     sort_button.innerHTML = '&#9650;'; // Näyttää vain ylöspäin osoittavan nuolen
// // // // //   } else if (state === 'asc') {
// // // // //     newState = 'desc';
// // // // //     sort_button.innerHTML = '&#9660;'; // Näyttää vain alaspäin osoittavan nuolen
// // // // //   } else {
// // // // //     newState = 'none';
// // // // //     sort_button.innerHTML = '&#x21C5;'; // Palauttaa molemmat nuolet
// // // // //   }
  
// // // // //   sort_button.setAttribute('data-sort-state', newState);
  
// // // // //   // Kutsutaan lajittelufunktiota uuden tilan mukaisesti
// // // // //   applySort(table_name, column, newState);
// // // // // });
// // // // //   // Suodatusinput; käytetään aiempaa funktiota, joka luo inputin ja siihen labelin
// // // // //   const filter_element = create_filter_element(column, data_types[column], table_name);
  
// // // // //   // Lisätään sorttausnappi ja suodatusinput riville
// // // // //   row_container.appendChild(sort_button);
// // // // //   row_container.appendChild(filter_element);
  
// // // // //   // Lisätään rivi yhdistettyyn konttiin
// // // // //   combined_container.appendChild(row_container);
// // // // // });

// // // // //     // Kääritään yhdistetty container collapsible-elementtiin
// // // // //     const combined_collapsible = create_collapsible_section('Suodata ja järjestä', combined_container, true);
// // // // //     sort_filter_section.appendChild(combined_collapsible);

// // // // //     // 5b) Chat-section
// // // // //     const chat_section = document.createElement('div');
// // // // //     chat_section.classList.add('chat_section');
// // // // //     chat_section.classList.add('hidden');

// // // // //     create_chat_ui(table_name, chat_section);

// // // // //     // Alussa Suodatus+Järjestä -välilehti on aktiivinen
// // // // //     tab_button_sortfilter.classList.add('tab-button-active');
// // // // //     tab_button_chat.classList.remove('tab-button-active');
// // // // //     sort_filter_section.classList.remove('hidden');
// // // // //     chat_section.classList.add('hidden');

// // // // //     tabs_content_container.appendChild(sort_filter_section);
// // // // //     tabs_content_container.appendChild(chat_section);
// // // // //     filter_bar.appendChild(tabs_content_container);

// // // // //     // 6) Liitetään filter_bar DOM:iin
// // // // //     table_parts_container.appendChild(filter_bar);

// // // // //     // 7) readOnlyContainer
// // // // //     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // //     if (!readOnlyContainer) {
// // // // //       readOnlyContainer = document.createElement('div');
// // // // //       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// // // // //       readOnlyContainer.classList.add('readOnlyContainer');
// // // // //       table_parts_container.appendChild(readOnlyContainer);
// // // // //     }

// // // // //     // 8) Tabien klikkilogiikka
// // // // //     tab_button_sortfilter.addEventListener('click', () => {
// // // // //       tab_button_sortfilter.classList.add('tab-button-active');
// // // // //       tab_button_chat.classList.remove('tab-button-active');
// // // // //       sort_filter_section.classList.remove('hidden');
// // // // //       chat_section.classList.add('hidden');
// // // // //     });

// // // // //     tab_button_chat.addEventListener('click', () => {
// // // // //       tab_button_chat.classList.add('tab-button-active');
// // // // //       tab_button_sortfilter.classList.remove('tab-button-active');
// // // // //       chat_section.classList.remove('hidden');
// // // // //       sort_filter_section.classList.add('hidden');
// // // // //     });

// // // // //     // 9) Hakukentän "live-haku" (valinnainen)
// // // // //     global_search_input.addEventListener('input', () => {
// // // // //       filter_table(table_name);
// // // // //       resetOffset();
// // // // //     });
// // // // //   }
// // // // // }

// // // // // /**
// // // // //  * Luo suodatus-elementin kullekin sarakkeelle.
// // // // //  */
// // // // // // function create_filter_element(column, data_type, table_name) {
// // // // // //   const container = document.createElement('div');
// // // // // //   container.classList.add('input-group');

// // // // // //   let dt_string = 'text';
// // // // // //   if (data_type && data_type.data_type) {
// // // // // //     dt_string = data_type.data_type.toLowerCase();
// // // // // //   }

// // // // // //   // Jos sarake on openai_embedding, luodaan erikoiskenttä
// // // // // //   if (column === 'openai_embedding') {
// // // // // //     const semantic_input = document.createElement('input');
// // // // // //     semantic_input.type = 'text';
// // // // // //     semantic_input.placeholder = 'Anna semanttinen hakusana...';
// // // // // //     semantic_input.id = `${table_name}_filter_semantic_${column}`;
// // // // // //     semantic_input.addEventListener('keypress', (e) => {
// // // // // //       if (e.key === 'Enter') {
// // // // // //         do_semantic_search(table_name, semantic_input.value);
// // // // // //       }
// // // // // //     });

// // // // // //     container.appendChild(semantic_input);
// // // // // //     const label = document.createElement('label');
// // // // // //     label.setAttribute('for', semantic_input.id);
// // // // // //     label.textContent = 'Semantic vector search';
// // // // // //     container.appendChild(label);
// // // // // //     return container;
// // // // // //   }

// // // // // //   // Normaali syötekenttä
// // // // // //   let input;
// // // // // //   switch (dt_string) {
// // // // // //     case 'integer':
// // // // // //     case 'bigint':
// // // // // //     case 'smallint':
// // // // // //     case 'numeric':
// // // // // //       input = document.createElement('input');
// // // // // //       input.type = 'number';
// // // // // //       input.placeholder = ' ';
// // // // // //       break;
// // // // // //     case 'boolean':
// // // // // //       input = document.createElement('select');
// // // // // //       container.classList.add('no-float');
// // // // // //       ['','true','false','empty'].forEach(val => {
// // // // // //         const opt = document.createElement('option');
// // // // // //         opt.value = val;
// // // // // //         opt.textContent = val === '' ? 'All'
// // // // // //                        : val === 'empty' ? 'Empty'
// // // // // //                        : val.charAt(0).toUpperCase() + val.slice(1);
// // // // // //         input.appendChild(opt);
// // // // // //       });
// // // // // //       break;
// // // // // //     case 'date':
// // // // // //     case 'timestamp':
// // // // // //     case 'timestamp without time zone':
// // // // // //     case 'timestamp with time zone':
// // // // // //       input = document.createElement('input');
// // // // // //       input.type = 'date';
// // // // // //       input.placeholder = ' ';
// // // // // //       break;
// // // // // //     default:
// // // // // //       input = document.createElement('input');
// // // // // //       input.type = 'text';
// // // // // //       input.placeholder = ' ';
// // // // // //   }

// // // // // //   input.id = `${table_name}_filter_${column}`;
// // // // // //   input.addEventListener('input', () => {
// // // // // //     filter_table(table_name);
// // // // // //     resetOffset();
// // // // // //   });

// // // // // //   container.appendChild(input);

// // // // // //   const label = document.createElement('label');
// // // // // //   label.setAttribute('for', input.id);
// // // // // //   label.textContent = column;
// // // // // //   container.appendChild(label);

// // // // // //   return container;
// // // // // // }
// // // // // function create_filter_element(column, data_type, table_name) {
// // // // //   const container = document.createElement('div');
// // // // //   container.classList.add('input-group');

// // // // //   let dt_string = 'text';
// // // // //   if (data_type && data_type.data_type) {
// // // // //     dt_string = data_type.data_type.toLowerCase();
// // // // //   }

// // // // //   // Erikoistapaus openai_embedding-kentälle
// // // // //   if (column === 'openai_embedding') {
// // // // //     const semantic_input = document.createElement('input');
// // // // //     semantic_input.type = 'text';
// // // // //     semantic_input.placeholder = 'Anna semanttinen hakusana...';
// // // // //     semantic_input.id = `${table_name}_filter_semantic_${column}`;
// // // // //     semantic_input.addEventListener('keypress', (e) => {
// // // // //       if (e.key === 'Enter') {
// // // // //         do_semantic_search(table_name, semantic_input.value);
// // // // //       }
// // // // //     });
// // // // //     container.appendChild(semantic_input);

// // // // //     const label = document.createElement('label');
// // // // //     label.setAttribute('for', semantic_input.id);
// // // // //     label.textContent = 'Semantic vector search';
// // // // //     container.appendChild(label);

// // // // //     return container;
// // // // //   }

// // // // //   let input;

// // // // //   // Jos kyseessä on numeeriset tai päivämäärätyyppiset kentät, luodaan kaksi input-kenttää (alueen min/max)
// // // // //   if (
// // // // //     [
// // // // //       'integer',
// // // // //       'bigint',
// // // // //       'smallint',
// // // // //       'numeric',
// // // // //       'date',
// // // // //       'timestamp',
// // // // //       'timestamp without time zone',
// // // // //       'timestamp with time zone'
// // // // //     ].includes(dt_string)
// // // // //   ) {
// // // // //     const fromInput = document.createElement('input');
// // // // //     const toInput = document.createElement('input');

// // // // //     if (['integer', 'bigint', 'smallint', 'numeric'].includes(dt_string)) {
// // // // //       fromInput.type = 'number';
// // // // //       toInput.type = 'number';
// // // // //       fromInput.placeholder = 'Min';
// // // // //       toInput.placeholder = 'Max';
// // // // //     } else {
// // // // //       fromInput.type = 'date';
// // // // //       toInput.type = 'date';
// // // // //       fromInput.placeholder = 'From';
// // // // //       toInput.placeholder = 'To';
// // // // //     }

// // // // //     // Asetetaan uniikit tunnisteet
// // // // //     fromInput.id = `${table_name}_filter_${column}_from`;
// // // // //     toInput.id = `${table_name}_filter_${column}_to`;

// // // // //     // Lisää tapahtumakuuntelijat molemmille kentille
// // // // //     [fromInput, toInput].forEach(inputField => {
// // // // //       inputField.addEventListener('input', () => {
// // // // //         filter_table(table_name);
// // // // //         resetOffset();
// // // // //       });
// // // // //     });

// // // // //     // Lisää kentät kontaineriin
// // // // //     container.appendChild(fromInput);
// // // // //     container.appendChild(toInput);

// // // // //     // Lisää yhteinen label sarakkeelle
// // // // //     const label = document.createElement('label');
// // // // //     label.textContent = column;
// // // // //     container.appendChild(label);

// // // // //   } else if (dt_string === 'boolean') {
// // // // //     input = document.createElement('select');
// // // // //     container.classList.add('no-float');

// // // // //     ['', 'true', 'false', 'empty'].forEach(val => {
// // // // //       const opt = document.createElement('option');
// // // // //       opt.value = val;
// // // // //       opt.textContent =
// // // // //         val === ''      ? 'All'   :
// // // // //         val === 'empty' ? 'Empty' :
// // // // //                           val.charAt(0).toUpperCase() + val.slice(1);
// // // // //       input.appendChild(opt);
// // // // //     });

// // // // //     input.addEventListener('input', () => {
// // // // //       filter_table(table_name);
// // // // //       resetOffset();
// // // // //     });
// // // // //     container.appendChild(input);

// // // // //     const label = document.createElement('label');
// // // // //     label.setAttribute('for', input.id || '');
// // // // //     label.textContent = column;
// // // // //     container.appendChild(label);

// // // // //   } else {
// // // // //     // Normaali tekstisyöte
// // // // //     input = document.createElement('input');
// // // // //     input.type = 'text';
// // // // //     input.placeholder = ' ';
// // // // //     input.id = `${table_name}_filter_${column}`;
// // // // //     input.addEventListener('input', () => {
// // // // //       filter_table(table_name);
// // // // //       resetOffset();
// // // // //     });
// // // // //     container.appendChild(input);

// // // // //     const label = document.createElement('label');
// // // // //     label.setAttribute('for', input.id);
// // // // //     label.textContent = column;
// // // // //     container.appendChild(label);
// // // // //   }

// // // // //   return container;
// // // // // }

// // // // // /**
// // // // //  * Kutsuu server-puoleista "vektorihakua" ja päivittää UI:n
// // // // //  */
// // // // // async function do_semantic_search(table_name, user_query) {
// // // // //   console.log("Semanttinen haku, user_query:", user_query);
// // // // //   if (!user_query.trim()) return;

// // // // //   const url = `/api/get-results-vector?table=${encodeURIComponent(table_name)}&vector_query=${encodeURIComponent(user_query)}`;
// // // // //   try {
// // // // //     const resp = await fetch(url);
// // // // //     if (!resp.ok) {
// // // // //       throw new Error(`vector search error (status ${resp.status})`);
// // // // //     }
// // // // //     const data = await resp.json();
// // // // //     console.log("Semanttinen haku tulos:", data);
// // // // //     update_table_ui(table_name, data);
// // // // //   } catch (e) {
// // // // //     console.error("do_semantic_search error:", e);
// // // // //   }
// // // // // }

// // // // // /**
// // // // //  * update_table_ui: päivittää taulun samaan tapaan kuin getResults
// // // // //  */
// // // // // export function update_table_ui(table_name, result) {
// // // // //   const { columns, data, types } = result;
// // // // //   showReadOnlyTable(table_name, columns, data, types);
// // // // // }

// // // // // /**
// // // // //  * showReadOnlyTable: generoi taulun ja laittaa sen readOnlyContaineriin
// // // // //  */
// // // // // function showReadOnlyTable(table_name, columns, data, types) {
// // // // //   const readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // //   if (!readOnlyContainer) {
// // // // //     console.error('Virhe: readOnlyContainer puuttuu!');
// // // // //     return;
// // // // //   }
// // // // //   readOnlyContainer.innerHTML = '';

// // // // //   const tableEl = generate_table(table_name, columns, data, types);
// // // // //   if (tableEl) {
// // // // //     readOnlyContainer.appendChild(tableEl);
// // // // //   }
// // // // // }



// // // // // // // create_filter_bar.js

// // // // // // // 1) Tuodaan tarvittavat importit
// // // // // // import { resetOffset } from '../../logical_components/infinite_scroll/infinite_scroll.js';
// // // // // // import { applySort } from '../gt_crud/gt_read/apply_sort.js';
// // // // // // import { filter_table } from './filter.js';
// // // // // // import { create_collapsible_section } from '../../logical_components/collapsible_section.js';
// // // // // // import { create_chat_ui } from '../../logical_components/ai_features/table_chat/chat.js';
// // // // // // import { generate_table } from '../../logical_components/table_views/view_table.js';
// // // // // // import { createViewSelectorButtons } from './draw_view_selector_buttons.js';
// // // // // // import {
// // // // // //   createAddRowButton,
// // // // // //   createDeleteSelectedButton,
// // // // // //   createColumnManagementButton
// // // // // // } from '../gt_toolbar/button_factory.js';
// // // // // // import { createColumnVisibilityDropdown } from '../gt_toolbar/column_visibility_dropdown.js';

// // // // // // // TUODAAN MYÖS UUSI VIEW-SELECTOR:
// // // // // // import { createNewViewSelector } from '../../logical_components/table_views/draw_view_selector_buttons.js';

// // // // // // /**
// // // // // //  * Haetaan rivimäärä.
// // // // // //  */
// // // // // // async function fetchRowCount(table_name) {
// // // // // //   try {
// // // // // //     const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
// // // // // //       method: 'GET',
// // // // // //       credentials: 'include'
// // // // // //     });
// // // // // //     if (!resp.ok) {
// // // // // //       throw new Error(`error (status: ${resp.status})`);
// // // // // //     }
// // // // // //     const data = await resp.json();
// // // // // //     if (data && typeof data.row_count === 'number') {
// // // // // //       return data.row_count;
// // // // // //     } else {
// // // // // //       throw new Error("row_count missing in response");
// // // // // //     }
// // // // // //   } catch (error) {
// // // // // //     console.error("virhe fetchRowCount-funktiossa:", error);
// // // // // //     return null;
// // // // // //   }
// // // // // // }

// // // // // // /**
// // // // // //  * create_filter_bar:
// // // // // //  *  - Taulun nimi
// // // // // //  *  - Rivimäärä
// // // // // //  *  - CRUD-napit
// // // // // //  *  - Sarakenäkyvyysdropdown (vain table-näkymälle)
// // // // // //  *  - AI-Embedding -nappi
// // // // // //  *  - Näkymänapit (Taulu / Kortti / Puu)
// // // // // //  *  - (UUSI) Kolme erilaista näkymää: normal, transposed, ticket
// // // // // //  *  - Hakukenttä
// // // // // //  *  - Suodatus+Järjestä / Chat -välilehdet
// // // // // //  *
// // // // // //  * Lisäksi luodaan sisardivi (readOnlyContainer), johon taulu sijoitetaan.
// // // // // //  */
// // // // // // export function create_filter_bar(table_name, columns, data_types, current_view) {
// // // // // //   // 0) Haetaan/luodaan yleiskontti (table_parts_container).
// // // // // //   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// // // // // //   if (!table_parts_container) {
// // // // // //     table_parts_container = document.createElement('div');
// // // // // //     table_parts_container.id = `${table_name}_table_parts_container`;
// // // // // //     document.body.appendChild(table_parts_container);
// // // // // //   }

// // // // // //   // 1) Luodaan filterBar, ellei sitä vielä ole.
// // // // // //   let filter_bar = document.getElementById(`${table_name}_filterBar`);
// // // // // //   if (!filter_bar) {
// // // // // //     filter_bar = document.createElement('div');
// // // // // //     filter_bar.id = `${table_name}_filterBar`;
// // // // // //     filter_bar.classList.add('filterBar');

// // // // // //     // 1a) Luodaan otsikolle oma kontti
// // // // // //     const title_container = document.createElement('div');
// // // // // //     const table_name_element = document.createElement('div');
// // // // // //     table_name_element.textContent = table_name;
// // // // // //     table_name_element.style.fontWeight = 'bold';
// // // // // //     table_name_element.style.fontSize = '20px';
// // // // // //     table_name_element.setAttribute('data-lang-key', table_name);
// // // // // //     table_name_element.title = table_name;

// // // // // //     const table_name_span = document.createElement('span');
// // // // // //     table_name_span.textContent = table_name;

// // // // // //     title_container.appendChild(table_name_element);
// // // // // //     title_container.appendChild(table_name_span);
// // // // // //     filter_bar.appendChild(title_container);

// // // // // //     // 2) Yläpuolen rivimäärä + napit (top_row)
// // // // // //     const top_row = document.createElement('div');
// // // // // //     top_row.classList.add('filterBar-top-row');

// // // // // //     // 2a) Rivimäärä
// // // // // //     const row_count_element = document.createElement('span');
// // // // // //     row_count_element.textContent = "Rows: ...";
// // // // // //     fetchRowCount(table_name).then(count => {
// // // // // //       if (count !== null) {
// // // // // //         row_count_element.textContent = `Rows: ${count}`;
// // // // // //       } else {
// // // // // //         row_count_element.textContent = 'Rows: ?';
// // // // // //       }
// // // // // //     });

// // // // // //     // 2b) CRUD-napit
// // // // // //     const button_container_div = document.createElement('div');
// // // // // //     button_container_div.classList.add('filterBar-button-container');
// // // // // //     button_container_div.appendChild(createAddRowButton(table_name));
// // // // // //     button_container_div.appendChild(createColumnManagementButton(table_name));
// // // // // //     button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

// // // // // //     // Sarakenäkyvyysdropdown vain table-näkymälle
// // // // // //     if (current_view === 'table') {
// // // // // //       const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // // //       if (tableContainer) {
// // // // // //         const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
// // // // // //         if (columnVisibilityDropdown) {
// // // // // //           button_container_div.appendChild(columnVisibilityDropdown);
// // // // // //         }
// // // // // //       }
// // // // // //     }

// // // // // //     // Ylin rivi: rivimäärä + CRUD-napit
// // // // // //     const first_line_div = document.createElement('div');
// // // // // //     first_line_div.classList.add('top-row-first-line');
// // // // // //     first_line_div.appendChild(row_count_element);
// // // // // //     first_line_div.appendChild(button_container_div);

// // // // // //     // *** (Esimerkin mukaan) Luodaan myös vanhat "Taulu / Kortti / Puu" -näkymänapit
// // // // // //     const viewSelectorDiv = createViewSelectorButtons(table_name, current_view);

// // // // // //     // *** LISÄTÄÄN UUSI 3-OSAINEN VALITSIN (normal, transposed, ticket) ***
// // // // // //     const newViewSelectorDiv = createNewViewSelector(table_name, current_view);

// // // // // //     // Rakennetaan top_row-kokonaisuus kahdesta rivistä:
// // // // // //     // Rivi1: rivimäärä ja CRUD-napit
// // // // // //     // Rivi2: vanhat napit + uudet napit
// // // // // //     top_row.appendChild(first_line_div);

// // // // // //     // Luodaan toinen "rivielementti" näkymäpainikkeille
// // // // // //     const second_line_div = document.createElement('div');
// // // // // //     second_line_div.classList.add('top-row-second-line');
// // // // // //     // Laita vanhat napit + uudet napit samaan konttiin
// // // // // //     second_line_div.appendChild(viewSelectorDiv);
// // // // // //     second_line_div.appendChild(newViewSelectorDiv);

// // // // // //     top_row.appendChild(second_line_div);

// // // // // //     filter_bar.appendChild(top_row);

// // // // // //     // 3) Hakukenttä
// // // // // //     const search_row = document.createElement('div');
// // // // // //     search_row.classList.add('filterBar-search-row');
// // // // // //     const global_search_input = document.createElement('input');
// // // // // //     global_search_input.type = 'text';
// // // // // //     global_search_input.placeholder = 'Hae jotain...';
// // // // // //     global_search_input.id = `${table_name}_global_search_input`;
// // // // // //     search_row.appendChild(global_search_input);
// // // // // //     filter_bar.appendChild(search_row);

// // // // // //     // 4) Tab-napit (Suodatus+Järjestä / Chat)
// // // // // //     const tabs_row = document.createElement('div');
// // // // // //     tabs_row.classList.add('filterBar-tabs-row');
// // // // // //     const tab_button_sortfilter = document.createElement('button');
// // // // // //     tab_button_sortfilter.textContent = 'Suodata ja järjestä';

// // // // // //     const tab_button_chat = document.createElement('button');
// // // // // //     tab_button_chat.textContent = 'Chat';

// // // // // //     tabs_row.appendChild(tab_button_sortfilter);
// // // // // //     tabs_row.appendChild(tab_button_chat);
// // // // // //     filter_bar.appendChild(tabs_row);

// // // // // //     // 5) Tabien sisältö
// // // // // //     const tabs_content_container = document.createElement('div');
// // // // // //     tabs_content_container.classList.add('tabs_content_container');

// // // // // //     // 5a) Sort+filter - Yhdistetty sarakkeisiin
// // // // // //     const sort_filter_section = document.createElement('div');
// // // // // //     sort_filter_section.classList.add('sort_filter_section');

// // // // // //     // --- Tässä luodaan yhdistetty container, jossa on kaksi saraketta ---
// // // // // //     // const combined_container = document.createElement('div');
// // // // // //     // combined_container.classList.add('combined-filter-sort-container');
// // // // // //     // combined_container.style.display = 'grid';
// // // // // //     // combined_container.style.gridTemplateColumns = 'repeat(2, 1fr)';
// // // // // //     // combined_container.style.gap = '1rem';

// // // // // //     // // Käydään läpi jokainen sarake ja lisätään siihen sorttauspainike ja suodatusinput
// // // // // //     // columns.forEach((column) => {
// // // // // //     //   const column_container = document.createElement('div');
// // // // // //     //   column_container.classList.add('column-container');

// // // // // //     //   // Sorttauspainike
// // // // // //     //   const sort_button = document.createElement('button');
// // // // // //     //   sort_button.classList.add('sort_button');
// // // // // //     //   sort_button.textContent = column;
// // // // // //     //   sort_button.addEventListener('click', () => {
// // // // // //     //     applySort(table_name, column);
// // // // // //     //   });
// // // // // //     //   column_container.appendChild(sort_button);

// // // // // //     //   // Suodatusinput
// // // // // //     //   const filter_element = create_filter_element(column, data_types[column], table_name);
// // // // // //     //   column_container.appendChild(filter_element);

// // // // // //     //   combined_container.appendChild(column_container);
// // // // // //     // });

// // // // // // // Muodostetaan flex-kontti, jossa jokainen rivi sisältää sorttausnapin ja suodatusinputin
// // // // // // const combined_container = document.createElement('div');
// // // // // // combined_container.classList.add('combined-filter-sort-container');
// // // // // // // Käytetään flexboxia ja asetetaan jokainen pari omaan riviinsä
// // // // // // combined_container.style.display = 'flex';
// // // // // // combined_container.style.flexDirection = 'column';
// // // // // // combined_container.style.gap = '1rem';

// // // // // // // Käydään sarakkeet läpi ja luodaan jokaiselle rivi
// // // // // // columns.forEach((column) => {
// // // // // //   // Luodaan rivi flexboxilla
// // // // // //   const row_container = document.createElement('div');
// // // // // //   row_container.classList.add('row-container');
// // // // // //   row_container.style.display = 'flex';
// // // // // //   row_container.style.alignItems = 'center';
// // // // // //   row_container.style.gap = '0.5rem';
  
// // // // // //   // // Sorttausnappi – ei tarvita tekstiä, mutta voidaan lisätä esim. ikoni
// // // // // //   const sort_button = document.createElement('button');
// // // // // //   // sort_button.classList.add('sort_button');
// // // // // //   // // Poistetaan tekstisisältö tai korvataan halutulla ikonilla
// // // // // //   // sort_button.textContent = '';
// // // // // //   // // Esim. FontAwesome-ikoni (edellyttää FontAwesome-kirjaston lataamista)
// // // // // //   // // sort_button.innerHTML = '<i class="fa fa-sort"></i>';
  
// // // // // //   // sort_button.addEventListener('click', () => {
// // // // // //   //   applySort(table_name, column);
// // // // // //   // });

// // // // // //   // Oletetaan, että sort_button on jo määritelty
// // // // // // // Asetetaan aluksi data-attribuutiksi 'none' ja näytetään molempiin suuntiin osoittava nuoli
// // // // // // sort_button.setAttribute('data-sort-state', 'none');
// // // // // // sort_button.innerHTML = '&#x21C5;'; // Näyttää molemmat nuolet

// // // // // // sort_button.addEventListener('click', () => {
// // // // // //   let state = sort_button.getAttribute('data-sort-state');
// // // // // //   let newState;
  
// // // // // //   if (state === 'none') {
// // // // // //     newState = 'asc';
// // // // // //     sort_button.innerHTML = '&#9650;'; // Näyttää vain ylöspäin osoittavan nuolen
// // // // // //   } else if (state === 'asc') {
// // // // // //     newState = 'desc';
// // // // // //     sort_button.innerHTML = '&#9660;'; // Näyttää vain alaspäin osoittavan nuolen
// // // // // //   } else {
// // // // // //     newState = 'none';
// // // // // //     sort_button.innerHTML = '&#x21C5;'; // Palauttaa molemmat nuolet
// // // // // //   }
  
// // // // // //   sort_button.setAttribute('data-sort-state', newState);
  
// // // // // //   // Kutsutaan lajittelufunktiota uuden tilan mukaisesti
// // // // // //   applySort(table_name, column, newState);
// // // // // // });
// // // // // //   // Suodatusinput; käytetään aiempaa funktiota, joka luo inputin ja siihen labelin
// // // // // //   const filter_element = create_filter_element(column, data_types[column], table_name);
  
// // // // // //   // Lisätään sorttausnappi ja suodatusinput riville
// // // // // //   row_container.appendChild(sort_button);
// // // // // //   row_container.appendChild(filter_element);
  
// // // // // //   // Lisätään rivi yhdistettyyn konttiin
// // // // // //   combined_container.appendChild(row_container);
// // // // // // });

// // // // // //     // Kääritään yhdistetty container collapsible-elementtiin
// // // // // //     const combined_collapsible = create_collapsible_section('Suodata ja järjestä', combined_container, true);
// // // // // //     sort_filter_section.appendChild(combined_collapsible);

// // // // // //     // 5b) Chat-section
// // // // // //     const chat_section = document.createElement('div');
// // // // // //     chat_section.classList.add('chat_section');
// // // // // //     chat_section.classList.add('hidden');

// // // // // //     create_chat_ui(table_name, chat_section);

// // // // // //     // Alussa Suodatus+Järjestä -välilehti on aktiivinen
// // // // // //     tab_button_sortfilter.classList.add('tab-button-active');
// // // // // //     tab_button_chat.classList.remove('tab-button-active');
// // // // // //     sort_filter_section.classList.remove('hidden');
// // // // // //     chat_section.classList.add('hidden');

// // // // // //     tabs_content_container.appendChild(sort_filter_section);
// // // // // //     tabs_content_container.appendChild(chat_section);
// // // // // //     filter_bar.appendChild(tabs_content_container);

// // // // // //     // 6) Liitetään filter_bar DOM:iin
// // // // // //     table_parts_container.appendChild(filter_bar);

// // // // // //     // 7) readOnlyContainer
// // // // // //     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // // //     if (!readOnlyContainer) {
// // // // // //       readOnlyContainer = document.createElement('div');
// // // // // //       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// // // // // //       readOnlyContainer.classList.add('readOnlyContainer');
// // // // // //       table_parts_container.appendChild(readOnlyContainer);
// // // // // //     }

// // // // // //     // 8) Tabien klikkilogiikka
// // // // // //     tab_button_sortfilter.addEventListener('click', () => {
// // // // // //       tab_button_sortfilter.classList.add('tab-button-active');
// // // // // //       tab_button_chat.classList.remove('tab-button-active');
// // // // // //       sort_filter_section.classList.remove('hidden');
// // // // // //       chat_section.classList.add('hidden');
// // // // // //     });

// // // // // //     tab_button_chat.addEventListener('click', () => {
// // // // // //       tab_button_chat.classList.add('tab-button-active');
// // // // // //       tab_button_sortfilter.classList.remove('tab-button-active');
// // // // // //       chat_section.classList.remove('hidden');
// // // // // //       sort_filter_section.classList.add('hidden');
// // // // // //     });

// // // // // //     // 9) Hakukentän "live-haku" (valinnainen)
// // // // // //     global_search_input.addEventListener('input', () => {
// // // // // //       filter_table(table_name);
// // // // // //       resetOffset();
// // // // // //     });
// // // // // //   }
// // // // // // }

// // // // // // /**
// // // // // //  * Luo suodatus-elementin kullekin sarakkeelle.
// // // // // //  */
// // // // // // function create_filter_element(column, data_type, table_name) {
// // // // // //   const container = document.createElement('div');
// // // // // //   container.classList.add('input-group');

// // // // // //   let dt_string = 'text';
// // // // // //   if (data_type && data_type.data_type) {
// // // // // //     dt_string = data_type.data_type.toLowerCase();
// // // // // //   }

// // // // // //   // Jos sarake on openai_embedding, luodaan erikoiskenttä
// // // // // //   if (column === 'openai_embedding') {
// // // // // //     const semantic_input = document.createElement('input');
// // // // // //     semantic_input.type = 'text';
// // // // // //     semantic_input.placeholder = 'Anna semanttinen hakusana...';
// // // // // //     semantic_input.id = `${table_name}_filter_semantic_${column}`;
// // // // // //     semantic_input.addEventListener('keypress', (e) => {
// // // // // //       if (e.key === 'Enter') {
// // // // // //         do_semantic_search(table_name, semantic_input.value);
// // // // // //       }
// // // // // //     });

// // // // // //     container.appendChild(semantic_input);
// // // // // //     const label = document.createElement('label');
// // // // // //     label.setAttribute('for', semantic_input.id);
// // // // // //     label.textContent = 'Semantic vector search';
// // // // // //     container.appendChild(label);
// // // // // //     return container;
// // // // // //   }

// // // // // //   // Normaali syötekenttä
// // // // // //   let input;
// // // // // //   switch (dt_string) {
// // // // // //     case 'integer':
// // // // // //     case 'bigint':
// // // // // //     case 'smallint':
// // // // // //     case 'numeric':
// // // // // //       input = document.createElement('input');
// // // // // //       input.type = 'number';
// // // // // //       input.placeholder = ' ';
// // // // // //       break;
// // // // // //     case 'boolean':
// // // // // //       input = document.createElement('select');
// // // // // //       container.classList.add('no-float');
// // // // // //       ['','true','false','empty'].forEach(val => {
// // // // // //         const opt = document.createElement('option');
// // // // // //         opt.value = val;
// // // // // //         opt.textContent = val === '' ? 'All'
// // // // // //                        : val === 'empty' ? 'Empty'
// // // // // //                        : val.charAt(0).toUpperCase() + val.slice(1);
// // // // // //         input.appendChild(opt);
// // // // // //       });
// // // // // //       break;
// // // // // //     case 'date':
// // // // // //     case 'timestamp':
// // // // // //     case 'timestamp without time zone':
// // // // // //     case 'timestamp with time zone':
// // // // // //       input = document.createElement('input');
// // // // // //       input.type = 'date';
// // // // // //       input.placeholder = ' ';
// // // // // //       break;
// // // // // //     default:
// // // // // //       input = document.createElement('input');
// // // // // //       input.type = 'text';
// // // // // //       input.placeholder = ' ';
// // // // // //   }

// // // // // //   input.id = `${table_name}_filter_${column}`;
// // // // // //   input.addEventListener('input', () => {
// // // // // //     filter_table(table_name);
// // // // // //     resetOffset();
// // // // // //   });

// // // // // //   container.appendChild(input);

// // // // // //   const label = document.createElement('label');
// // // // // //   label.setAttribute('for', input.id);
// // // // // //   label.textContent = column;
// // // // // //   container.appendChild(label);

// // // // // //   return container;
// // // // // // }

// // // // // // /**
// // // // // //  * Kutsuu server-puoleista "vektorihakua" ja päivittää UI:n
// // // // // //  */
// // // // // // async function do_semantic_search(table_name, user_query) {
// // // // // //   console.log("Semanttinen haku, user_query:", user_query);
// // // // // //   if (!user_query.trim()) return;

// // // // // //   const url = `/api/get-results-vector?table=${encodeURIComponent(table_name)}&vector_query=${encodeURIComponent(user_query)}`;
// // // // // //   try {
// // // // // //     const resp = await fetch(url);
// // // // // //     if (!resp.ok) {
// // // // // //       throw new Error(`vector search error (status ${resp.status})`);
// // // // // //     }
// // // // // //     const data = await resp.json();
// // // // // //     console.log("Semanttinen haku tulos:", data);
// // // // // //     update_table_ui(table_name, data);
// // // // // //   } catch (e) {
// // // // // //     console.error("do_semantic_search error:", e);
// // // // // //   }
// // // // // // }

// // // // // // /**
// // // // // //  * update_table_ui: päivittää taulun samaan tapaan kuin getResults
// // // // // //  */
// // // // // // export function update_table_ui(table_name, result) {
// // // // // //   const { columns, data, types } = result;
// // // // // //   showReadOnlyTable(table_name, columns, data, types);
// // // // // // }

// // // // // // /**
// // // // // //  * showReadOnlyTable: generoi taulun ja laittaa sen readOnlyContaineriin
// // // // // //  */
// // // // // // function showReadOnlyTable(table_name, columns, data, types) {
// // // // // //   const readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // // //   if (!readOnlyContainer) {
// // // // // //     console.error('Virhe: readOnlyContainer puuttuu!');
// // // // // //     return;
// // // // // //   }
// // // // // //   readOnlyContainer.innerHTML = '';

// // // // // //   const tableEl = generate_table(table_name, columns, data, types);
// // // // // //   if (tableEl) {
// // // // // //     readOnlyContainer.appendChild(tableEl);
// // // // // //   }
// // // // // // }


// // // // // // // // create_filter_bar.js

// // // // // // // // 1) Tuodaan tarvittavat importit
// // // // // // // import { resetOffset } from '../../logical_components/infinite_scroll/infinite_scroll.js';
// // // // // // // import { applySort } from '../gt_crud/gt_read/apply_sort.js';
// // // // // // // import { filter_table } from './filter.js';
// // // // // // // import { create_collapsible_section } from '../../logical_components/collapsible_section.js';
// // // // // // // import { create_chat_ui } from '../../logical_components/ai_features/table_chat/chat.js';
// // // // // // // import { generate_table } from '../../logical_components/table_views/view_table.js';
// // // // // // // import { createViewSelectorButtons } from './draw_view_selector_buttons.js';
// // // // // // // import {
// // // // // // //   createAddRowButton,
// // // // // // //   createDeleteSelectedButton,
// // // // // // //   createColumnManagementButton
// // // // // // // } from '../gt_toolbar/button_factory.js';
// // // // // // // import { createColumnVisibilityDropdown } from '../gt_toolbar/column_visibility_dropdown.js';

// // // // // // // // TUODAAN MYÖS UUSI VIEW-SELECTOR:
// // // // // // // import { createNewViewSelector } from '../../logical_components/table_views/draw_view_selector_buttons.js';

// // // // // // // /**
// // // // // // //  * Haetaan rivimäärä.
// // // // // // //  */
// // // // // // // async function fetchRowCount(table_name) {
// // // // // // //   try {
// // // // // // //     const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
// // // // // // //       method: 'GET',
// // // // // // //       credentials: 'include'
// // // // // // //     });
// // // // // // //     if (!resp.ok) {
// // // // // // //       throw new Error(`error (status: ${resp.status})`);
// // // // // // //     }
// // // // // // //     const data = await resp.json();
// // // // // // //     if (data && typeof data.row_count === 'number') {
// // // // // // //       return data.row_count;
// // // // // // //     } else {
// // // // // // //       throw new Error("row_count missing in response");
// // // // // // //     }
// // // // // // //   } catch (error) {
// // // // // // //     console.error("virhe fetchRowCount-funktiossa:", error);
// // // // // // //     return null;
// // // // // // //   }
// // // // // // // }

// // // // // // // /**
// // // // // // //  * create_filter_bar:
// // // // // // //  *  - Taulun nimi
// // // // // // //  *  - Rivilaskuri
// // // // // // //  *  - CRUD-napit
// // // // // // //  *  - Sarakenäkyvyysdropdown (vain table-näkymälle)
// // // // // // //  *  - AI-Embedding -nappi
// // // // // // //  *  - Näkymänapit (Taulu / Kortti / Puu)
// // // // // // //  *  - (UUSI) Kolme erilaista näkymää: normal, transposed, ticket
// // // // // // //  *  - Hakukenttä
// // // // // // //  *  - Suodatus+Järjestä / Chat -välilehdet
// // // // // // //  *
// // // // // // //  * Lisäksi luodaan sisardivi (readOnlyContainer), johon taulu sijoitetaan.
// // // // // // //  */
// // // // // // // export function create_filter_bar(table_name, columns, data_types, current_view) {
// // // // // // //   // 0) Haetaan/luodaan yleiskontti (table_parts_container).
// // // // // // //   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// // // // // // //   if (!table_parts_container) {
// // // // // // //     table_parts_container = document.createElement('div');
// // // // // // //     table_parts_container.id = `${table_name}_table_parts_container`;
// // // // // // //     document.body.appendChild(table_parts_container);
// // // // // // //   }

// // // // // // //   // 1) Luodaan filterBar, ellei sitä vielä ole.
// // // // // // //   let filter_bar = document.getElementById(`${table_name}_filterBar`);
// // // // // // //   if (!filter_bar) {
// // // // // // //     filter_bar = document.createElement('div');
// // // // // // //     filter_bar.id = `${table_name}_filterBar`;
// // // // // // //     filter_bar.classList.add('filterBar');

// // // // // // //     // 1a) Luodaan otsikolle oma kontti
// // // // // // //     const title_container = document.createElement('div');
// // // // // // //     const table_name_element = document.createElement('div');
// // // // // // //     table_name_element.textContent = table_name;
// // // // // // //     table_name_element.style.fontWeight = 'bold';
// // // // // // //     table_name_element.style.fontSize = '20px';
// // // // // // //     table_name_element.setAttribute('data-lang-key', table_name);
// // // // // // //     table_name_element.title = table_name;

// // // // // // //     const table_name_span = document.createElement('span');
// // // // // // //     table_name_span.textContent = table_name;

// // // // // // //     title_container.appendChild(table_name_element);
// // // // // // //     title_container.appendChild(table_name_span);
// // // // // // //     filter_bar.appendChild(title_container);

// // // // // // //     // 2) Yläpuolen rivimäärä + napit (top_row)
// // // // // // //     const top_row = document.createElement('div');
// // // // // // //     top_row.classList.add('filterBar-top-row');

// // // // // // //     // 2a) Rivimäärä
// // // // // // //     const row_count_element = document.createElement('span');
// // // // // // //     row_count_element.textContent = "Rows: ...";
// // // // // // //     fetchRowCount(table_name).then(count => {
// // // // // // //       if (count !== null) {
// // // // // // //         row_count_element.textContent = `Rows: ${count}`;
// // // // // // //       } else {
// // // // // // //         row_count_element.textContent = 'Rows: ?';
// // // // // // //       }
// // // // // // //     });

// // // // // // //     // 2b) CRUD-napit
// // // // // // //     const button_container_div = document.createElement('div');
// // // // // // //     button_container_div.classList.add('filterBar-button-container');
// // // // // // //     button_container_div.appendChild(createAddRowButton(table_name));
// // // // // // //     button_container_div.appendChild(createColumnManagementButton(table_name));
// // // // // // //     button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

// // // // // // //     // Sarakenäkyvyysdropdown vain table-näkymälle
// // // // // // //     if (current_view === 'table') {
// // // // // // //       const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // // // //       if (tableContainer) {
// // // // // // //         const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
// // // // // // //         if (columnVisibilityDropdown) {
// // // // // // //           button_container_div.appendChild(columnVisibilityDropdown);
// // // // // // //         }
// // // // // // //       }
// // // // // // //     }

// // // // // // //     // Ylin rivi: rivimäärä + CRUD-napit
// // // // // // //     const first_line_div = document.createElement('div');
// // // // // // //     first_line_div.classList.add('top-row-first-line');
// // // // // // //     first_line_div.appendChild(row_count_element);
// // // // // // //     first_line_div.appendChild(button_container_div);

// // // // // // //     // *** (Esimerkin mukaan) Luodaan myös vanhat "Taulu / Kortti / Puu" -näkymänapit
// // // // // // //     const viewSelectorDiv = createViewSelectorButtons(table_name, current_view);

// // // // // // //     // *** LISÄTÄÄN UUSI 3-OSAINEN VALITSIN (normal, transposed, ticket) ***
// // // // // // //     const newViewSelectorDiv = createNewViewSelector(table_name, current_view);

// // // // // // //     // Rakennetaan top_row-kokonaisuus kahdesta rivistä:
// // // // // // //     // Rivi1: rivimäärä ja CRUD-napit
// // // // // // //     // Rivi2: vanhat napit + uudet napit
// // // // // // //     top_row.appendChild(first_line_div);

// // // // // // //     // Luodaan toinen "rivielementti" näkymäpainikkeille
// // // // // // //     const second_line_div = document.createElement('div');
// // // // // // //     second_line_div.classList.add('top-row-second-line');
// // // // // // //     // Laita vanhat napit + uudet napit samaan konttiin
// // // // // // //     second_line_div.appendChild(viewSelectorDiv);
// // // // // // //     second_line_div.appendChild(newViewSelectorDiv);

// // // // // // //     top_row.appendChild(second_line_div);

// // // // // // //     filter_bar.appendChild(top_row);

// // // // // // //     // 3) Hakukenttä
// // // // // // //     const search_row = document.createElement('div');
// // // // // // //     search_row.classList.add('filterBar-search-row');
// // // // // // //     const global_search_input = document.createElement('input');
// // // // // // //     global_search_input.type = 'text';
// // // // // // //     global_search_input.placeholder = 'Hae jotain...';
// // // // // // //     global_search_input.id = `${table_name}_global_search_input`;
// // // // // // //     search_row.appendChild(global_search_input);
// // // // // // //     filter_bar.appendChild(search_row);

// // // // // // //     // 4) Tab-napit (Suodatus+Järjestä / Chat)
// // // // // // //     const tabs_row = document.createElement('div');
// // // // // // //     tabs_row.classList.add('filterBar-tabs-row');
// // // // // // //     const tab_button_sortfilter = document.createElement('button');
// // // // // // //     tab_button_sortfilter.textContent = 'Suodata ja järjestä';

// // // // // // //     const tab_button_chat = document.createElement('button');
// // // // // // //     tab_button_chat.textContent = 'Chat';

// // // // // // //     tabs_row.appendChild(tab_button_sortfilter);
// // // // // // //     tabs_row.appendChild(tab_button_chat);
// // // // // // //     filter_bar.appendChild(tabs_row);

// // // // // // //     // 5) Tabien sisältö
// // // // // // //     const tabs_content_container = document.createElement('div');
// // // // // // //     tabs_content_container.classList.add('tabs_content_container');

// // // // // // //     // 5a) Sort+filter
// // // // // // //     const sort_filter_section = document.createElement('div');
// // // // // // //     sort_filter_section.classList.add('sort_filter_section');

// // // // // // //     const top_sections = document.createElement('div');
// // // // // // //     top_sections.classList.add('top-sections');

// // // // // // //     // -- Sorttaus --
// // // // // // //     const sort_container = document.createElement('div');
// // // // // // //     sort_container.classList.add('filterBar-section');

// // // // // // //     const sort_options_container = document.createElement('div');
// // // // // // //     columns.forEach((column) => {
// // // // // // //       const sort_button = document.createElement('button');
// // // // // // //       sort_button.classList.add('sort_button');
// // // // // // //       sort_button.textContent = column;
// // // // // // //       sort_button.addEventListener('click', () => {
// // // // // // //         applySort(table_name, column);
// // // // // // //       });
// // // // // // //       sort_options_container.appendChild(sort_button);
// // // // // // //     });
// // // // // // //     sort_container.appendChild(sort_options_container);
// // // // // // //     const sort_collapsible = create_collapsible_section('Sorttaus', sort_container, true);
// // // // // // //     top_sections.appendChild(sort_collapsible);

// // // // // // //     // -- Filtterit --
// // // // // // //     const filter_container = document.createElement('div');
// // // // // // //     filter_container.classList.add('filterBar-section');
// // // // // // //     columns.forEach((column) => {
// // // // // // //       const filter_element = create_filter_element(column, data_types[column], table_name);
// // // // // // //       filter_container.appendChild(filter_element);
// // // // // // //     });
// // // // // // //     const filter_collapsible = create_collapsible_section('Filtterit', filter_container, true);
// // // // // // //     top_sections.appendChild(filter_collapsible);

// // // // // // //     sort_filter_section.appendChild(top_sections);

// // // // // // //     // 5b) Chat-section
// // // // // // //     const chat_section = document.createElement('div');
// // // // // // //     chat_section.classList.add('chat_section');
// // // // // // //     chat_section.classList.add('hidden');

// // // // // // //     create_chat_ui(table_name, chat_section);

// // // // // // //     // Alussa Suodatus+Järjestä -välilehti on aktiivinen
// // // // // // //     tab_button_sortfilter.classList.add('tab-button-active');
// // // // // // //     tab_button_chat.classList.remove('tab-button-active');
// // // // // // //     sort_filter_section.classList.remove('hidden');
// // // // // // //     chat_section.classList.add('hidden');

// // // // // // //     tabs_content_container.appendChild(sort_filter_section);
// // // // // // //     tabs_content_container.appendChild(chat_section);
// // // // // // //     filter_bar.appendChild(tabs_content_container);

// // // // // // //     // 6) Liitetään filter_bar DOM:iin
// // // // // // //     table_parts_container.appendChild(filter_bar);

// // // // // // //     // 7) readOnlyContainer
// // // // // // //     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // // // //     if (!readOnlyContainer) {
// // // // // // //       readOnlyContainer = document.createElement('div');
// // // // // // //       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// // // // // // //       readOnlyContainer.classList.add('readOnlyContainer');
// // // // // // //       table_parts_container.appendChild(readOnlyContainer);
// // // // // // //     }

// // // // // // //     // 8) Tabien klikkilogiikka
// // // // // // //     tab_button_sortfilter.addEventListener('click', () => {
// // // // // // //       tab_button_sortfilter.classList.add('tab-button-active');
// // // // // // //       tab_button_chat.classList.remove('tab-button-active');
// // // // // // //       sort_filter_section.classList.remove('hidden');
// // // // // // //       chat_section.classList.add('hidden');
// // // // // // //     });

// // // // // // //     tab_button_chat.addEventListener('click', () => {
// // // // // // //       tab_button_chat.classList.add('tab-button-active');
// // // // // // //       tab_button_sortfilter.classList.remove('tab-button-active');
// // // // // // //       chat_section.classList.remove('hidden');
// // // // // // //       sort_filter_section.classList.add('hidden');
// // // // // // //     });

// // // // // // //     // 9) Hakukentän "live-haku" (valinnainen)
// // // // // // //     global_search_input.addEventListener('input', () => {
// // // // // // //       filter_table(table_name);
// // // // // // //       resetOffset();
// // // // // // //     });
// // // // // // //   }
// // // // // // // }

// // // // // // // function create_filter_element(column, data_type, table_name) {
// // // // // // //   const container = document.createElement('div');
// // // // // // //   container.classList.add('input-group');

// // // // // // //   let dt_string = 'text';
// // // // // // //   if (data_type && data_type.data_type) {
// // // // // // //     dt_string = data_type.data_type.toLowerCase();
// // // // // // //   }

// // // // // // //   // Jos sarake on openai_embedding, luodaan erikoiskenttä
// // // // // // //   if (column === 'openai_embedding') {
// // // // // // //     const semantic_input = document.createElement('input');
// // // // // // //     semantic_input.type = 'text';
// // // // // // //     semantic_input.placeholder = 'Anna semanttinen hakusana...';
// // // // // // //     semantic_input.id = `${table_name}_filter_semantic_${column}`;
// // // // // // //     semantic_input.addEventListener('keypress', (e) => {
// // // // // // //       if (e.key === 'Enter') {
// // // // // // //         do_semantic_search(table_name, semantic_input.value);
// // // // // // //       }
// // // // // // //     });

// // // // // // //     container.appendChild(semantic_input);
// // // // // // //     const label = document.createElement('label');
// // // // // // //     label.setAttribute('for', semantic_input.id);
// // // // // // //     label.textContent = 'Semantic vector search';
// // // // // // //     container.appendChild(label);
// // // // // // //     return container;
// // // // // // //   }

// // // // // // //   // Normaali syötekenttä
// // // // // // //   let input;
// // // // // // //   switch (dt_string) {
// // // // // // //     case 'integer':
// // // // // // //     case 'bigint':
// // // // // // //     case 'smallint':
// // // // // // //     case 'numeric':
// // // // // // //       input = document.createElement('input');
// // // // // // //       input.type = 'number';
// // // // // // //       input.placeholder = ' ';
// // // // // // //       break;
// // // // // // //     case 'boolean':
// // // // // // //       input = document.createElement('select');
// // // // // // //       container.classList.add('no-float');
// // // // // // //       ['','true','false','empty'].forEach(val => {
// // // // // // //         const opt = document.createElement('option');
// // // // // // //         opt.value = val;
// // // // // // //         opt.textContent = val === '' ? 'All'
// // // // // // //                        : val === 'empty' ? 'Empty'
// // // // // // //                        : val.charAt(0).toUpperCase() + val.slice(1);
// // // // // // //         input.appendChild(opt);
// // // // // // //       });
// // // // // // //       break;
// // // // // // //     case 'date':
// // // // // // //     case 'timestamp':
// // // // // // //     case 'timestamp without time zone':
// // // // // // //     case 'timestamp with time zone':
// // // // // // //       input = document.createElement('input');
// // // // // // //       input.type = 'date';
// // // // // // //       input.placeholder = ' ';
// // // // // // //       break;
// // // // // // //     default:
// // // // // // //       input = document.createElement('input');
// // // // // // //       input.type = 'text';
// // // // // // //       input.placeholder = ' ';
// // // // // // //   }

// // // // // // //   input.id = `${table_name}_filter_${column}`;
// // // // // // //   input.addEventListener('input', () => {
// // // // // // //     filter_table(table_name);
// // // // // // //     resetOffset();
// // // // // // //   });

// // // // // // //   container.appendChild(input);

// // // // // // //   const label = document.createElement('label');
// // // // // // //   label.setAttribute('for', input.id);
// // // // // // //   label.textContent = column;
// // // // // // //   container.appendChild(label);

// // // // // // //   return container;
// // // // // // // }

// // // // // // // /**
// // // // // // //  * Kutsuu server-puoleista "vektorihakua" ja päivittää UI:n
// // // // // // //  */
// // // // // // // async function do_semantic_search(table_name, user_query) {
// // // // // // //   console.log("Semanttinen haku, user_query:", user_query);
// // // // // // //   if (!user_query.trim()) return;

// // // // // // //   const url = `/api/get-results-vector?table=${encodeURIComponent(table_name)}&vector_query=${encodeURIComponent(user_query)}`;
// // // // // // //   try {
// // // // // // //     const resp = await fetch(url);
// // // // // // //     if (!resp.ok) {
// // // // // // //       throw new Error(`vector search error (status ${resp.status})`);
// // // // // // //     }
// // // // // // //     const data = await resp.json();
// // // // // // //     console.log("Semanttinen haku tulos:", data);
// // // // // // //     update_table_ui(table_name, data);
// // // // // // //   } catch (e) {
// // // // // // //     console.error("do_semantic_search error:", e);
// // // // // // //   }
// // // // // // // }

// // // // // // // /**
// // // // // // //  * update_table_ui: päivittää taulun samaan tapaan kuin getResults
// // // // // // //  */
// // // // // // // export function update_table_ui(table_name, result) {
// // // // // // //   const { columns, data, types } = result;
// // // // // // //   showReadOnlyTable(table_name, columns, data, types);
// // // // // // // }

// // // // // // // /**
// // // // // // //  * showReadOnlyTable: generoi taulun ja laittaa sen readOnlyContaineriin
// // // // // // //  */
// // // // // // // function showReadOnlyTable(table_name, columns, data, types) {
// // // // // // //   const readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // // // //   if (!readOnlyContainer) {
// // // // // // //     console.error('Virhe: readOnlyContainer puuttuu!');
// // // // // // //     return;
// // // // // // //   }
// // // // // // //   readOnlyContainer.innerHTML = '';

// // // // // // //   const tableEl = generate_table(table_name, columns, data, types);
// // // // // // //   if (tableEl) {
// // // // // // //     readOnlyContainer.appendChild(tableEl);
// // // // // // //   }
// // // // // // // }


// // // // // // // // // create_filter_bar.js

// // // // // // // // // 1) Tuodaan tarvittavat importit
// // // // // // // // import { resetOffset } from '../../logical_components/infinite_scroll/infinite_scroll.js';
// // // // // // // // import { applySort } from '../gt_crud/gt_read/apply_sort.js';
// // // // // // // // import { filter_table } from './filter.js';
// // // // // // // // import { create_collapsible_section } from '../../logical_components/collapsible_section.js';
// // // // // // // // import { create_chat_ui } from '../../logical_components/ai_features/table_chat/chat.js';
// // // // // // // // import { generate_table } from '../../logical_components/table_views/view_table.js';
// // // // // // // // import { createViewSelectorButtons } from './draw_view_selector_buttons.js';
// // // // // // // // import {
// // // // // // // //   createAddRowButton,
// // // // // // // //   createDeleteSelectedButton,
// // // // // // // //   createColumnManagementButton
// // // // // // // // } from '../gt_toolbar/button_factory.js';
// // // // // // // // import { createColumnVisibilityDropdown } from '../gt_toolbar/column_visibility_dropdown.js';
// // // // // // // // import { createNewViewSelector } from '../../logical_components/table_views/draw_view_selector_buttons.js';

// // // // // // // // /**
// // // // // // // //  * Haetaan rivimäärä.
// // // // // // // //  */
// // // // // // // // async function fetchRowCount(table_name) {
// // // // // // // //   try {
// // // // // // // //     const resp = await fetch(`/api/get-row-count?table=${table_name}`, {
// // // // // // // //       method: 'GET',
// // // // // // // //       credentials: 'include'
// // // // // // // //     });
// // // // // // // //     if (!resp.ok) {
// // // // // // // //       throw new Error(`error (status: ${resp.status})`);
// // // // // // // //     }
// // // // // // // //     const data = await resp.json();
// // // // // // // //     if (data && typeof data.row_count === 'number') {
// // // // // // // //       return data.row_count;
// // // // // // // //     } else {
// // // // // // // //       throw new Error("row_count missing in response");
// // // // // // // //     }
// // // // // // // //   } catch (error) {
// // // // // // // //     console.error("virhe fetchRowCount-funktiossa:", error);
// // // // // // // //     return null;
// // // // // // // //   }
// // // // // // // // }

// // // // // // // // /**
// // // // // // // //  * create_filter_bar:
// // // // // // // //  *  - Taulun nimi
// // // // // // // //  *  - Rivilaskuri
// // // // // // // //  *  - CRUD-napit
// // // // // // // //  *  - Sarakenäkyvyysdropdown (vain table-näkymälle)
// // // // // // // //  *  - AI-Embedding -nappi
// // // // // // // //  *  - Näkymänapit (Taulu / Kortti / Puu)
// // // // // // // //  *  - Hakukenttä
// // // // // // // //  *  - Suodatus+Järjestä / Chat -välilehdet
// // // // // // // //  * 
// // // // // // // //  * Lisäksi luodaan sisardivi (readOnlyContainer), johon taulu sijoitetaan.
// // // // // // // //  */
// // // // // // // // export function create_filter_bar(table_name, columns, data_types, current_view) {
// // // // // // // //   // 0) Haetaan/luodaan yleiskontti (table_parts_container).
// // // // // // // //   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// // // // // // // //   if (!table_parts_container) {
// // // // // // // //     table_parts_container = document.createElement('div');
// // // // // // // //     table_parts_container.id = `${table_name}_table_parts_container`;
// // // // // // // //     document.body.appendChild(table_parts_container);
// // // // // // // //   }

// // // // // // // //   // 1) Luodaan filterBar, ellei sitä vielä ole.
// // // // // // // //   let filter_bar = document.getElementById(`${table_name}_filterBar`);
// // // // // // // //   if (!filter_bar) {
// // // // // // // //     filter_bar = document.createElement('div');
// // // // // // // //     filter_bar.id = `${table_name}_filterBar`;
// // // // // // // //     filter_bar.classList.add('filterBar');

// // // // // // // //     // 1a) Luodaan otsikolle oma kontti
// // // // // // // //     const title_container = document.createElement('div');

// // // // // // // //     // Luodaan data-lang-key -elementti taulun nimelle
// // // // // // // //     const table_name_element = document.createElement('div');
// // // // // // // //     table_name_element.textContent = table_name;
// // // // // // // //     table_name_element.style.fontWeight = 'bold';
// // // // // // // //     table_name_element.style.fontSize = '20px';
// // // // // // // //     table_name_element.setAttribute('data-lang-key', table_name);
// // // // // // // //     table_name_element.title = table_name;

// // // // // // // //     // Luodaan erillinen span-elementti
// // // // // // // //     const table_name_span = document.createElement('span');
// // // // // // // //     table_name_span.textContent = table_name;

// // // // // // // //     // Lisätään molemmat uuteen div-konttiin
// // // // // // // //     title_container.appendChild(table_name_element);
// // // // // // // //     title_container.appendChild(table_name_span);

// // // // // // // //     // Lisätään tämä kontti filter_bar-elementtiin
// // // // // // // //     filter_bar.appendChild(title_container);

// // // // // // // //     // 2) Yläpuolen rivimäärä + napit (top_row)
// // // // // // // //     const top_row = document.createElement('div');
// // // // // // // //     top_row.classList.add('filterBar-top-row');

// // // // // // // //     // 2a) Rivimäärä
// // // // // // // //     const row_count_element = document.createElement('span');
// // // // // // // //     row_count_element.textContent = "Rows: ...";

// // // // // // // //     // Päivitetään rivimäärä, kun data on saatu
// // // // // // // //     fetchRowCount(table_name).then(count => {
// // // // // // // //       if (count !== null) {
// // // // // // // //         row_count_element.textContent = `Rows: ${count}`;
// // // // // // // //       } else {
// // // // // // // //         row_count_element.textContent = 'Rows: ?';
// // // // // // // //       }
// // // // // // // //     });

// // // // // // // //     // 2b) Nappisäiliö
// // // // // // // //     const button_container_div = document.createElement('div');
// // // // // // // //     button_container_div.classList.add('filterBar-button-container');

// // // // // // // //     // --- CRUD-napit ---
// // // // // // // //     button_container_div.appendChild(createAddRowButton(table_name));
// // // // // // // //     button_container_div.appendChild(createColumnManagementButton(table_name));
// // // // // // // //     button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

// // // // // // // //     console.log('tulostus 1...');
// // // // // // // //     // --- Lisätään sarakenäkyvyysdropdown vain table-näkymälle ---
// // // // // // // //     if (current_view === 'table') {
// // // // // // // //       console.log('tulostus 2...');
// // // // // // // //       const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // // // // //       if (tableContainer) {
// // // // // // // //         console.log('tulostus 3...');
// // // // // // // //         const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
// // // // // // // //         if (columnVisibilityDropdown) {
// // // // // // // //           console.log('tulostus 4...');
// // // // // // // //           button_container_div.appendChild(columnVisibilityDropdown);


// // // // // // // //           button_container_div.appendChild(columnVisibilityDropdown);
// // // // // // // //         }
// // // // // // // //       }
// // // // // // // //     }

// // // // // // // //     // Luo välikontti ensimmäiselle riville
// // // // // // // //     const first_line_div = document.createElement('div');
// // // // // // // //     first_line_div.classList.add('top-row-first-line');
// // // // // // // //     first_line_div.appendChild(row_count_element);
// // // // // // // //     first_line_div.appendChild(button_container_div);

// // // // // // // //     // *** Näkymänapit (Taulu, Kortti, Puu) omalle "riville" ***
// // // // // // // //     const viewSelectorDiv = createViewSelectorButtons(table_name, current_view);

// // // // // // // //     // Asetellaan nämä kaksi "riviä" top_row:iin
// // // // // // // //     top_row.appendChild(first_line_div);  // -> grid-rivin 1
// // // // // // // //     top_row.appendChild(viewSelectorDiv); // -> grid-rivin 2

// // // // // // // //     // Lopuksi liitetään top_row filter_bariin
// // // // // // // //     filter_bar.appendChild(top_row);

// // // // // // // //     // 3) Hakukenttä (omalla rivillään)
// // // // // // // //     const search_row = document.createElement('div');
// // // // // // // //     search_row.classList.add('filterBar-search-row');
// // // // // // // //     const global_search_input = document.createElement('input');
// // // // // // // //     global_search_input.type = 'text';
// // // // // // // //     global_search_input.placeholder = 'Hae jotain...';
// // // // // // // //     global_search_input.id = `${table_name}_global_search_input`;
// // // // // // // //     search_row.appendChild(global_search_input);
// // // // // // // //     filter_bar.appendChild(search_row);

// // // // // // // //     // 4) Tab-napit (Suodatus + Järjestä / Chat)
// // // // // // // //     const tabs_row = document.createElement('div');
// // // // // // // //     tabs_row.classList.add('filterBar-tabs-row');
// // // // // // // //     const tab_button_sortfilter = document.createElement('button');
// // // // // // // //     tab_button_sortfilter.textContent = 'Suodata ja järjestä';

// // // // // // // //     const tab_button_chat = document.createElement('button');
// // // // // // // //     tab_button_chat.textContent = 'Chat';

// // // // // // // //     tabs_row.appendChild(tab_button_sortfilter);
// // // // // // // //     tabs_row.appendChild(tab_button_chat);
// // // // // // // //     filter_bar.appendChild(tabs_row);

// // // // // // // //     // 5) Tabien sisältö
// // // // // // // //     const tabs_content_container = document.createElement('div');
// // // // // // // //     tabs_content_container.classList.add('tabs_content_container');

// // // // // // // //     // 5a) Sort+filter
// // // // // // // //     const sort_filter_section = document.createElement('div');
// // // // // // // //     sort_filter_section.classList.add('sort_filter_section');

// // // // // // // //     // Yläosiot (sort ja filter)
// // // // // // // //     const top_sections = document.createElement('div');
// // // // // // // //     top_sections.classList.add('top-sections');

// // // // // // // //     // -- Sorttaus --
// // // // // // // //     const sort_container = document.createElement('div');
// // // // // // // //     sort_container.classList.add('filterBar-section');

// // // // // // // //     const sort_options_container = document.createElement('div');
// // // // // // // //     columns.forEach((column) => {
// // // // // // // //       const sort_button = document.createElement('button');
// // // // // // // //       sort_button.classList.add('sort_button');
// // // // // // // //       sort_button.textContent = column;
// // // // // // // //       sort_button.addEventListener('click', () => {
// // // // // // // //         applySort(table_name, column);
// // // // // // // //       });
// // // // // // // //       sort_options_container.appendChild(sort_button);
// // // // // // // //     });
// // // // // // // //     sort_container.appendChild(sort_options_container);

// // // // // // // //     const sort_collapsible = create_collapsible_section('Sorttaus', sort_container, true);
// // // // // // // //     top_sections.appendChild(sort_collapsible);

// // // // // // // //     // -- Filtterit --
// // // // // // // //     const filter_container = document.createElement('div');
// // // // // // // //     filter_container.classList.add('filterBar-section');

// // // // // // // //     columns.forEach((column) => {
// // // // // // // //       const filter_element = create_filter_element(column, data_types[column], table_name);
// // // // // // // //       filter_container.appendChild(filter_element);
// // // // // // // //     });

// // // // // // // //     const filter_collapsible = create_collapsible_section('Filtterit', filter_container, true);
// // // // // // // //     top_sections.appendChild(filter_collapsible);

// // // // // // // //     sort_filter_section.appendChild(top_sections);

// // // // // // // //     // 5b) Chat-section
// // // // // // // //     const chat_section = document.createElement('div');
// // // // // // // //     chat_section.classList.add('chat_section');
// // // // // // // //     chat_section.classList.add('hidden');

// // // // // // // //     // Rakennetaan chat UI
// // // // // // // //     create_chat_ui(table_name, chat_section);

// // // // // // // //     // Alussa Suodatus+Järjestä -välilehti on aktiivinen
// // // // // // // //     tab_button_sortfilter.classList.add('tab-button-active');
// // // // // // // //     tab_button_chat.classList.remove('tab-button-active');
// // // // // // // //     sort_filter_section.classList.remove('hidden');
// // // // // // // //     chat_section.classList.add('hidden');

// // // // // // // //     // Lisätään containerit
// // // // // // // //     tabs_content_container.appendChild(sort_filter_section);
// // // // // // // //     tabs_content_container.appendChild(chat_section);
// // // // // // // //     filter_bar.appendChild(tabs_content_container);

// // // // // // // //     // 6) Liitetään filter_bar DOM:iin
// // // // // // // //     table_parts_container.appendChild(filter_bar);

// // // // // // // //     // 7) Luodaan sisardivi readOnlyContainer taulun näyttöä varten (jos sitä ei jo ole)
// // // // // // // //     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // // // // //     if (!readOnlyContainer) {
// // // // // // // //       readOnlyContainer = document.createElement('div');
// // // // // // // //       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
// // // // // // // //       readOnlyContainer.classList.add('readOnlyContainer');
// // // // // // // //       table_parts_container.appendChild(readOnlyContainer);
// // // // // // // //     }

// // // // // // // //     // 8) Tabien klikkilogiikka
// // // // // // // //     tab_button_sortfilter.addEventListener('click', () => {
// // // // // // // //       tab_button_sortfilter.classList.add('tab-button-active');
// // // // // // // //       tab_button_chat.classList.remove('tab-button-active');
// // // // // // // //       sort_filter_section.classList.remove('hidden');
// // // // // // // //       chat_section.classList.add('hidden');
// // // // // // // //     });

// // // // // // // //     tab_button_chat.addEventListener('click', () => {
// // // // // // // //       tab_button_chat.classList.add('tab-button-active');
// // // // // // // //       tab_button_sortfilter.classList.remove('tab-button-active');
// // // // // // // //       chat_section.classList.remove('hidden');
// // // // // // // //       sort_filter_section.classList.add('hidden');
// // // // // // // //     });

// // // // // // // //     // 9) Hakukentän "live-haku" (valinnainen)
// // // // // // // //     global_search_input.addEventListener('input', () => {
// // // // // // // //       filter_table(table_name);
// // // // // // // //       resetOffset();
// // // // // // // //     });
// // // // // // // //   }
// // // // // // // // }

// // // // // // // // function create_filter_element(column, data_type, table_name) {
// // // // // // // //   const container = document.createElement('div');
// // // // // // // //   container.classList.add('input-group');

// // // // // // // //   let dt_string = 'text';
// // // // // // // //   if (data_type && data_type.data_type) {
// // // // // // // //     dt_string = data_type.data_type.toLowerCase();
// // // // // // // //   }

// // // // // // // //   // Jos sarake on openai_embedding, luodaan erikoiskenttä semanttiselle hakulauseelle
// // // // // // // //   if (column === 'openai_embedding') {
// // // // // // // //     const semantic_input = document.createElement('input');
// // // // // // // //     semantic_input.type = 'text';
// // // // // // // //     semantic_input.placeholder = 'Anna semanttinen hakusana... (Esim. "Tiina leipoo")';
// // // // // // // //     semantic_input.id = `${table_name}_filter_semantic_${column}`;
// // // // // // // //     semantic_input.addEventListener('keypress', (e) => {
// // // // // // // //       if (e.key === 'Enter') {
// // // // // // // //         do_semantic_search(table_name, semantic_input.value);
// // // // // // // //       }
// // // // // // // //     });

// // // // // // // //     container.appendChild(semantic_input);

// // // // // // // //     const label = document.createElement('label');
// // // // // // // //     label.setAttribute('for', semantic_input.id);
// // // // // // // //     label.textContent = 'Semantic vector search';
// // // // // // // //     container.appendChild(label);

// // // // // // // //     return container;
// // // // // // // //   }

// // // // // // // //   // Normaali kenttä
// // // // // // // //   let input;
// // // // // // // //   switch (dt_string) {
// // // // // // // //     case 'integer':
// // // // // // // //     case 'bigint':
// // // // // // // //     case 'smallint':
// // // // // // // //     case 'numeric':
// // // // // // // //       input = document.createElement('input');
// // // // // // // //       input.type = 'number';
// // // // // // // //       input.placeholder = ' ';
// // // // // // // //       break;
// // // // // // // //     case 'boolean':
// // // // // // // //       input = document.createElement('select');
// // // // // // // //       container.classList.add('no-float');
// // // // // // // //       {
// // // // // // // //         const opt_all = document.createElement('option');
// // // // // // // //         opt_all.value = '';
// // // // // // // //         opt_all.textContent = 'All';
// // // // // // // //         input.appendChild(opt_all);

// // // // // // // //         const opt_true = document.createElement('option');
// // // // // // // //         opt_true.value = 'true';
// // // // // // // //         opt_true.textContent = 'True';
// // // // // // // //         input.appendChild(opt_true);

// // // // // // // //         const opt_false = document.createElement('option');
// // // // // // // //         opt_false.value = 'false';
// // // // // // // //         opt_false.textContent = 'False';
// // // // // // // //         input.appendChild(opt_false);

// // // // // // // //         // Lisätään "Empty"-vaihtoehto
// // // // // // // //         const opt_empty = document.createElement('option');
// // // // // // // //         opt_empty.value = 'empty';
// // // // // // // //         opt_empty.textContent = 'Empty';
// // // // // // // //         input.appendChild(opt_empty);
// // // // // // // //       }
// // // // // // // //       break;
// // // // // // // //     case 'date':
// // // // // // // //     case 'timestamp':
// // // // // // // //     case 'timestamp without time zone':
// // // // // // // //     case 'timestamp with time zone':
// // // // // // // //       input = document.createElement('input');
// // // // // // // //       input.type = 'date';
// // // // // // // //       input.placeholder = ' ';
// // // // // // // //       break;
// // // // // // // //     default:
// // // // // // // //       input = document.createElement('input');
// // // // // // // //       input.type = 'text';
// // // // // // // //       input.placeholder = ' ';
// // // // // // // //   }

// // // // // // // //   input.id = `${table_name}_filter_${column}`;
// // // // // // // //   input.addEventListener('input', () => {
// // // // // // // //     filter_table(table_name);
// // // // // // // //     resetOffset();
// // // // // // // //   });

// // // // // // // //   container.appendChild(input);

// // // // // // // //   const label = document.createElement('label');
// // // // // // // //   label.setAttribute('for', input.id);
// // // // // // // //   label.textContent = column;
// // // // // // // //   container.appendChild(label);

// // // // // // // //   return container;
// // // // // // // // }

// // // // // // // // /**
// // // // // // // //  * Kutsuu server-puoleista "vektorihakua" ja päivittää UI:n
// // // // // // // //  */
// // // // // // // // async function do_semantic_search(table_name, user_query) {
// // // // // // // //   console.log("Semanttinen haku, user_query:", user_query);
// // // // // // // //   if (!user_query.trim()) return;

// // // // // // // //   const url = `/api/get-results-vector?table=${encodeURIComponent(table_name)}&vector_query=${encodeURIComponent(user_query)}`;
// // // // // // // //   try {
// // // // // // // //     const resp = await fetch(url);
// // // // // // // //     if (!resp.ok) {
// // // // // // // //       throw new Error(`vector search error (status ${resp.status})`);
// // // // // // // //     }
// // // // // // // //     const data = await resp.json();
// // // // // // // //     console.log("Semanttinen haku tulos:", data);
// // // // // // // //     update_table_ui(table_name, data);
// // // // // // // //   } catch (e) {
// // // // // // // //     console.error("do_semantic_search error:", e);
// // // // // // // //   }
// // // // // // // // }

// // // // // // // // /**
// // // // // // // //  * update_table_ui: päivittää taulun samaan tapaan kuin getResults
// // // // // // // //  */
// // // // // // // // export function update_table_ui(table_name, result) {
// // // // // // // //   const { columns, data, types } = result;
// // // // // // // //   showReadOnlyTable(table_name, columns, data, types);
// // // // // // // // }

// // // // // // // // /**
// // // // // // // //  * showReadOnlyTable: generoi taulun ja laittaa sen readOnlyContaineriin
// // // // // // // //  */
// // // // // // // // function showReadOnlyTable(table_name, columns, data, types) {
// // // // // // // //   const readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
// // // // // // // //   if (!readOnlyContainer) {
// // // // // // // //     console.error('Virhe: readOnlyContainer puuttuu!');
// // // // // // // //     return;
// // // // // // // //   }
// // // // // // // //   readOnlyContainer.innerHTML = '';

// // // // // // // //   const tableEl = generate_table(table_name, columns, data, types);
// // // // // // // //   if (tableEl) {
// // // // // // // //     readOnlyContainer.appendChild(tableEl);
// // // // // // // //   }
// // // // // // // // }










// // // // // // // // const tableName = 'oma_taulun_nimi'; // vaihda omaksi taulun nimeksi
// // // // // // // // // Haetaan nykyinen näkymä esim. localStoragesta (oletus 'normal')
// // // // // // // // const currentView = localStorage.getItem(`${tableName}_view`) || 'normal';

// // // // // // // // // Luodaan uusi näkymävalitsin
// // // // // // // // const newViewSelector = createNewViewSelector(tableName, currentView);

// // // // // // // // // Lisätään uusi näkymävalitsin esimerkiksi olemassa olevaan konttiin
// // // // // // // // const targetDiv = document.getElementById(`${tableName}_readOnlyContainer`); // tai muu sopiva div
// // // // // // // // if (targetDiv) {
// // // // // // // //   targetDiv.prepend(newViewSelector);
// // // // // // // // }
