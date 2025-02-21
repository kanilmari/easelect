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
 * create_filter_bar:
 *  - Taulun nimi
 *  - Rivilaskuri
 *  - CRUD-napit
 *  - Sarakenäkyvyysdropdown (vain table-näkymälle)
 *  - AI-Embedding -nappi
 *  - Näkymänapit (Taulu / Kortti / Puu)
 *  - Hakukenttä
 *  - Suodatus+Järjestä / Chat -välilehdet
 * 
 * Lisäksi luodaan sisardivi (readOnlyContainer), johon taulu sijoitetaan.
 */
export function create_filter_bar(table_name, columns, data_types, current_view) {
  // 0) Haetaan/luodaan yleiskontti (table_parts_container).
  let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
  if (!table_parts_container) {
    table_parts_container = document.createElement('div');
    table_parts_container.id = `${table_name}_table_parts_container`;
    document.body.appendChild(table_parts_container);
  }

  // 1) Luodaan filterBar, ellei sitä vielä ole.
  let filter_bar = document.getElementById(`${table_name}_filterBar`);
  if (!filter_bar) {
    filter_bar = document.createElement('div');
    filter_bar.id = `${table_name}_filterBar`;
    filter_bar.classList.add('filterBar');

    // 1a) Luodaan otsikolle oma kontti
    const title_container = document.createElement('div');

    // Luodaan data-lang-key -elementti taulun nimelle
    const table_name_element = document.createElement('div');
    table_name_element.textContent = table_name;
    table_name_element.style.fontWeight = 'bold';
    table_name_element.style.fontSize = '20px';
    table_name_element.setAttribute('data-lang-key', table_name);
    table_name_element.title = table_name;

    // Luodaan erillinen span-elementti
    const table_name_span = document.createElement('span');
    table_name_span.textContent = table_name;

    // Lisätään molemmat uuteen div-konttiin
    title_container.appendChild(table_name_element);
    title_container.appendChild(table_name_span);

    // Lisätään tämä kontti filter_bar-elementtiin
    filter_bar.appendChild(title_container);

    // 2) Yläpuolen rivimäärä + napit (top_row)
    const top_row = document.createElement('div');
    top_row.classList.add('filterBar-top-row');

    // 2a) Rivimäärä
    const row_count_element = document.createElement('span');
    row_count_element.textContent = "Rows: ...";

    // Päivitetään rivimäärä, kun data on saatu
    fetchRowCount(table_name).then(count => {
      if (count !== null) {
        row_count_element.textContent = `Rows: ${count}`;
      } else {
        row_count_element.textContent = 'Rows: ?';
      }
    });

    // 2b) Nappisäiliö
    const button_container_div = document.createElement('div');
    button_container_div.classList.add('filterBar-button-container');

    // --- CRUD-napit ---
    button_container_div.appendChild(createAddRowButton(table_name));
    button_container_div.appendChild(createColumnManagementButton(table_name));
    button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

    console.log('tulostus 1...');
    // --- Lisätään sarakenäkyvyysdropdown vain table-näkymälle ---
    if (current_view === 'table') {
      console.log('tulostus 2...');
      const tableContainer = document.getElementById(`${table_name}_readOnlyContainer`);
      if (tableContainer) {
        console.log('tulostus 3...');
        const columnVisibilityDropdown = createColumnVisibilityDropdown(tableContainer);
        if (columnVisibilityDropdown) {
          console.log('tulostus 4...');
          button_container_div.appendChild(columnVisibilityDropdown);
           

          button_container_div.appendChild(columnVisibilityDropdown);
        }
      }
    }

    // Luo välikontti ensimmäiselle riville
    const first_line_div = document.createElement('div');
    first_line_div.classList.add('top-row-first-line');
    first_line_div.appendChild(row_count_element);
    first_line_div.appendChild(button_container_div);

    // *** Näkymänapit (Taulu, Kortti, Puu) omalle "riville" ***
    const viewSelectorDiv = createViewSelectorButtons(table_name, current_view);

    // Asetellaan nämä kaksi "riviä" top_row:iin
    top_row.appendChild(first_line_div);  // -> grid-rivin 1
    top_row.appendChild(viewSelectorDiv); // -> grid-rivin 2

    // Lopuksi liitetään top_row filter_bariin
    filter_bar.appendChild(top_row);

    // 3) Hakukenttä (omalla rivillään)
    const search_row = document.createElement('div');
    search_row.classList.add('filterBar-search-row');
    const global_search_input = document.createElement('input');
    global_search_input.type = 'text';
    global_search_input.placeholder = 'Hae jotain...';
    global_search_input.id = `${table_name}_global_search_input`;
    search_row.appendChild(global_search_input);
    filter_bar.appendChild(search_row);

    // 4) Tab-napit (Suodatus + Järjestä / Chat)
    const tabs_row = document.createElement('div');
    tabs_row.classList.add('filterBar-tabs-row');
    const tab_button_sortfilter = document.createElement('button');
    tab_button_sortfilter.textContent = 'Suodata ja järjestä';

    const tab_button_chat = document.createElement('button');
    tab_button_chat.textContent = 'Chat';

    tabs_row.appendChild(tab_button_sortfilter);
    tabs_row.appendChild(tab_button_chat);
    filter_bar.appendChild(tabs_row);

    // 5) Tabien sisältö
    const tabs_content_container = document.createElement('div');
    tabs_content_container.classList.add('tabs_content_container');

    // 5a) Sort+filter
    const sort_filter_section = document.createElement('div');
    sort_filter_section.classList.add('sort_filter_section');

    // Yläosiot (sort ja filter)
    const top_sections = document.createElement('div');
    top_sections.classList.add('top-sections');

    // -- Sorttaus --
    const sort_container = document.createElement('div');
    sort_container.classList.add('filterBar-section');

    const sort_options_container = document.createElement('div');
    columns.forEach((column) => {
      const sort_button = document.createElement('button');
      sort_button.classList.add('sort_button');
      sort_button.textContent = column;
      sort_button.addEventListener('click', () => {
        applySort(table_name, column);
      });
      sort_options_container.appendChild(sort_button);
    });
    sort_container.appendChild(sort_options_container);

    const sort_collapsible = create_collapsible_section('Sorttaus', sort_container, true);
    top_sections.appendChild(sort_collapsible);

    // -- Filtterit --
    const filter_container = document.createElement('div');
    filter_container.classList.add('filterBar-section');

    columns.forEach((column) => {
      const filter_element = create_filter_element(column, data_types[column], table_name);
      filter_container.appendChild(filter_element);
    });

    const filter_collapsible = create_collapsible_section('Filtterit', filter_container, true);
    top_sections.appendChild(filter_collapsible);

    sort_filter_section.appendChild(top_sections);

    // 5b) Chat-section
    const chat_section = document.createElement('div');
    chat_section.classList.add('chat_section');
    chat_section.classList.add('hidden');

    // Rakennetaan chat UI
    create_chat_ui(table_name, chat_section);

    // Alussa Suodatus+Järjestä -välilehti on aktiivinen
    tab_button_sortfilter.classList.add('tab-button-active');
    tab_button_chat.classList.remove('tab-button-active');
    sort_filter_section.classList.remove('hidden');
    chat_section.classList.add('hidden');

    // Lisätään containerit
    tabs_content_container.appendChild(sort_filter_section);
    tabs_content_container.appendChild(chat_section);
    filter_bar.appendChild(tabs_content_container);

    // 6) Liitetään filter_bar DOM:iin
    table_parts_container.appendChild(filter_bar);

    // 7) Luodaan sisardivi readOnlyContainer taulun näyttöä varten (jos sitä ei jo ole)
    let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
    if (!readOnlyContainer) {
      readOnlyContainer = document.createElement('div');
      readOnlyContainer.id = `${table_name}_readOnlyContainer`;
      readOnlyContainer.classList.add('readOnlyContainer');
      table_parts_container.appendChild(readOnlyContainer);
    }

    // 8) Tabien klikkilogiikka
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

    // 9) Hakukentän "live-haku" (valinnainen)
    global_search_input.addEventListener('input', () => {
      filter_table(table_name);
      resetOffset();
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
    const semantic_input = document.createElement('input');
    semantic_input.type = 'text';
    semantic_input.placeholder = 'Anna semanttinen hakusana... (Esim. "Tiina leipoo")';
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

  // Normaali kenttä
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

        // Lisätään "Empty"-vaihtoehto
        const opt_empty = document.createElement('option');
        opt_empty.value = 'empty';
        opt_empty.textContent = 'Empty';
        input.appendChild(opt_empty);
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

// /**
//  * Luodaan yksi suodatuskenttä saraketta kohden
//  */
// function create_filter_element(column, data_type, table_name) {
//   const container = document.createElement('div');
//   container.classList.add('input-group');

//   let dt_string = 'text';
//   if (data_type && data_type.data_type) {
//     dt_string = data_type.data_type.toLowerCase();
//   }

//   // Jos sarake on openai_embedding, luodaan erikoiskenttä semanttiselle hakulauseelle
//   if (column === 'openai_embedding') {
//     const semantic_input = document.createElement('input');
//     semantic_input.type = 'text';
//     semantic_input.placeholder = 'Anna semanttinen hakusana... (Esim. "Tiina leipoo")';
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

//   // Normaali kenttä
//   let input;
//   switch (dt_string) {
//     case 'integer':
//     case 'bigint':
//     case 'smallint':
//     case 'numeric':
//       input = document.createElement('input');
//       input.type = 'number';
//       input.placeholder = ' ';
//       break;
//     case 'boolean':
//       input = document.createElement('select');
//       container.classList.add('no-float');
//       {
//         const opt_all = document.createElement('option');
//         opt_all.value = '';
//         opt_all.textContent = 'All';
//         input.appendChild(opt_all);

//         const opt_true = document.createElement('option');
//         opt_true.value = 'true';
//         opt_true.textContent = 'True';
//         input.appendChild(opt_true);

//         const opt_false = document.createElement('option');
//         opt_false.value = 'false';
//         opt_false.textContent = 'False';
//         input.appendChild(opt_false);
//       }
//       break;
//     case 'date':
//     case 'timestamp':
//     case 'timestamp without time zone':
//     case 'timestamp with time zone':
//       input = document.createElement('input');
//       input.type = 'date';
//       input.placeholder = ' ';
//       break;
//     default:
//       input = document.createElement('input');
//       input.type = 'text';
//       input.placeholder = ' ';
//   }

//   input.id = `${table_name}_filter_${column}`;
//   input.addEventListener('input', () => {
//     filter_table(table_name);
//     resetOffset();
//   });

//   container.appendChild(input);

//   const label = document.createElement('label');
//   label.setAttribute('for', input.id);
//   label.textContent = column;
//   container.appendChild(label);

//   return container;
// }

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
// ///
//   createColumnManagementButton
// } from '../gt_toolbar/button_factory.js';

// /**
//  * Haetaan rivimäärä. (Sama funktio, jota käytit aiemmin toolbarissa.)
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
//  * create_filter_bar:
//  *  - Taulun nimi
//  *  - Rivilaskuri
//  *  - CRUD-napit
//  *  - Sarakenäkyvyysnappi (optionaalisesti vain table-näkymälle)
//  *  - AI-Embedding -nappi
//  *  - (Uudet) Näkymänapit (Taulu / Kortti / Puu) - suoraan esillä
//  *  - Hakukenttä
//  *  - Suodatus+Järjestä / Chat -välilehdet
//  * 
//  *  Lisäksi luodaan sisardivi (readOnlyContainer), johon varsinainen lukutoiminto/taulu sijoitetaan.
//  */
// // // export function create_filter_bar(table_name, columns, data_types, current_view) {
// // //   // 0) Haetaan/luodaan yleiskontti (table_parts_container).
// // //   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
// // //   if (!table_parts_container) {
// // //     table_parts_container = document.createElement('div');
// // //     table_parts_container.id = `${table_name}_table_parts_container`;
// // //     // Voit liittää suoraan bodyyn tai johonkin muuhun haluttuun elementtiin
// // //     document.body.appendChild(table_parts_container);
// // //   }

// // //   // 1) Luodaan filterBar, ellei sitä vielä ole.
// // //   let filter_bar = document.getElementById(`${table_name}_filterBar`);
// // //   if (!filter_bar) {
// // //     filter_bar = document.createElement('div');
// // //     filter_bar.id = `${table_name}_filterBar`;
// // //     filter_bar.classList.add('filterBar');

// // //     // 1a) Otsikko (esim. taulun nimi)
// // //     const table_name_element = document.createElement('div');
// // //     table_name_element.textContent = table_name;
// // //     table_name_element.style.fontWeight = 'bold';
// // //     table_name_element.style.fontSize = '20px';
// // //     //set attribute data-lang-key
// // //     table_name_element.setAttribute('data-lang-key', table_name);
// // //     // Print html title table_name
// // //     table_name_element.title = table_name;

    

// // //     filter_bar.appendChild(table_name_element);
// export function create_filter_bar(table_name, columns, data_types, current_view) {
//   // 0) Haetaan/luodaan yleiskontti (table_parts_container).
//   let table_parts_container = document.getElementById(`${table_name}_table_parts_container`);
//   if (!table_parts_container) {
//     table_parts_container = document.createElement('div');
//     table_parts_container.id = `${table_name}_table_parts_container`;
//     document.body.appendChild(table_parts_container);
//   }

//   // 1) Luodaan filterBar, ellei sitä vielä ole.
//   let filter_bar = document.getElementById(`${table_name}_filterBar`);
//   if (!filter_bar) {
//     filter_bar = document.createElement('div');
//     filter_bar.id = `${table_name}_filterBar`;
//     filter_bar.classList.add('filterBar');

// // 1a) Luodaan otsikolle oma kontti
// const title_container = document.createElement('div');

// // Luodaan data-lang-key -elementti (div) taulun nimelle
// const table_name_element = document.createElement('div');
// table_name_element.textContent = table_name;
// table_name_element.style.fontWeight = 'bold';
// table_name_element.style.fontSize = '20px';
// table_name_element.setAttribute('data-lang-key', table_name);
// table_name_element.title = table_name;

// // Luodaan erillinen span-elementti
// const table_name_span = document.createElement('span');
// // Laita span:iin haluamasi sisältö (tässä sama taulun nimi, tai jokin muu teksti)
// table_name_span.textContent = table_name; 
// // Voit muotoilla span:ia haluamallasi tavalla esim. classListilla
// // table_name_span.classList.add('omaSpanClass');

// // Lisätään molemmat uuteen div-konttiin
// title_container.appendChild(table_name_element);
// title_container.appendChild(table_name_span);

// // Lopuksi lisätään tämä kontti filter_bar-elementtiin
// filter_bar.appendChild(title_container);

//     // const tooltip = document.createElement('span');
//     // tooltip.classList.add('tooltip');
//     // tooltip.textContent = table_name;
//     // table_name_element.appendChild(tooltip);

//     // 2) Yläpuolen rivimäärä + napit (top_row)
//     const top_row = document.createElement('div');
//     top_row.classList.add('filterBar-top-row');
//     // -> Toteutetaan CSS:llä 2-rivinen grid

//     // 2a) Rivimäärä
//     const row_count_element = document.createElement('span');
//     row_count_element.textContent = "Rows: ...";

//     // Päivitetään rivimäärä, kun data on saatu
//     fetchRowCount(table_name).then(count => {
//       if (count !== null) {
//         row_count_element.textContent = `Rows: ${count}`;
//       } else {
//         row_count_element.textContent = 'Rows: ?';
//       }
//     });

//     // 2b) Nappisäiliö
//     const button_container_div = document.createElement('div');
//     button_container_div.classList.add('filterBar-button-container');

//     // --- CRUD-napit ---
//     button_container_div.appendChild(createAddRowButton(table_name));
//     button_container_div.appendChild(createColumnManagementButton(table_name));
//     button_container_div.appendChild(createDeleteSelectedButton(table_name, current_view));

//     // Luo välikontti ensimmäiselle riville:
//     const first_line_div = document.createElement('div');
//     first_line_div.classList.add('top-row-first-line');
//     first_line_div.appendChild(row_count_element);
//     first_line_div.appendChild(button_container_div);

//     // *** Näkymänapit (Taulu, Kortti, Puu) omalle "riville" ***
//     const viewSelectorDiv = createViewSelectorButtons(table_name, current_view);

//     // Asetellaan nyt nämä kaksi ”riviä” top_row:iin
//     top_row.appendChild(first_line_div);  // -> grid-rivin 1
//     top_row.appendChild(viewSelectorDiv); // -> grid-rivin 2

//     // Lopuksi liitetään top_row filter_bariin
//     filter_bar.appendChild(top_row);
//     // 3) Hakukenttä (omalla rivillään)
//     const search_row = document.createElement('div');
//     search_row.classList.add('filterBar-search-row');
//     const global_search_input = document.createElement('input');
//     global_search_input.type = 'text';
//     global_search_input.placeholder = 'Hae jotain...';
//     global_search_input.id = `${table_name}_global_search_input`;
//     search_row.appendChild(global_search_input);
//     filter_bar.appendChild(search_row);

//     // 4) Tab-napit (Suodatus + Järjestä / Chat)
//     const tabs_row = document.createElement('div');
//     tabs_row.classList.add('filterBar-tabs-row');
//     const tab_button_sortfilter = document.createElement('button');
//     tab_button_sortfilter.textContent = 'Suodata ja järjestä';

//     const tab_button_chat = document.createElement('button');
//     tab_button_chat.textContent = 'Chat';

//     tabs_row.appendChild(tab_button_sortfilter);
//     tabs_row.appendChild(tab_button_chat);
//     filter_bar.appendChild(tabs_row);

//     // 5) Tabien sisältö
//     const tabs_content_container = document.createElement('div');
//     tabs_content_container.classList.add('tabs_content_container');

//     // 5a) Sort+filter
//     const sort_filter_section = document.createElement('div');
//     sort_filter_section.classList.add('sort_filter_section');

//     // Yläosiot (sort ja filter)
//     const top_sections = document.createElement('div');
//     top_sections.classList.add('top-sections');

//     // -- Sorttaus --
//     const sort_container = document.createElement('div');
//     sort_container.classList.add('filterBar-section');
//     // const sort_label = document.createElement('label');
//     // sort_label.textContent = 'Sort by column:';
//     // sort_container.appendChild(sort_label);

//     const sort_options_container = document.createElement('div');
//     columns.forEach((column) => {
//       const sort_button = document.createElement('button');
//       sort_button.classList.add('sort_button');
//       sort_button.textContent = column;
//       sort_button.addEventListener('click', () => {
//         applySort(table_name, column);
//       });
//       sort_options_container.appendChild(sort_button);
//     });
//     sort_container.appendChild(sort_options_container);

//     const sort_collapsible = create_collapsible_section('Sorttaus', sort_container, true);
//     top_sections.appendChild(sort_collapsible);

//     // -- Filtterit --
//     const filter_container = document.createElement('div');
//     filter_container.classList.add('filterBar-section');

//     columns.forEach((column) => {
//       const filter_element = create_filter_element(column, data_types[column], table_name);
//       filter_container.appendChild(filter_element);
//     });

//     const filter_collapsible = create_collapsible_section('Filtterit', filter_container, true);
//     top_sections.appendChild(filter_collapsible);

//     sort_filter_section.appendChild(top_sections);

//     // 5b) Chat-section
//     const chat_section = document.createElement('div');
//     chat_section.classList.add('chat_section');
//     // Piilotetaan chat tab oletuksena
//     chat_section.classList.add('hidden');

//     // Rakennetaan chat UI
//     create_chat_ui(table_name, chat_section);

//     // Alussa Suodatus+Järjestä -välilehti on aktiivinen
//     tab_button_sortfilter.classList.add('tab-button-active');
//     tab_button_chat.classList.remove('tab-button-active');
//     sort_filter_section.classList.remove('hidden');
//     chat_section.classList.add('hidden');

//     // Lisätään containerit
//     tabs_content_container.appendChild(sort_filter_section);
//     tabs_content_container.appendChild(chat_section);
//     filter_bar.appendChild(tabs_content_container);

//     // 6) Liitetään filter_bar DOM:iin
//     table_parts_container.appendChild(filter_bar);

//     // 7) Luodaan sisardivi readOnlyContainer taulun näyttöä varten (jos sitä ei jo ole)
//     let readOnlyContainer = document.getElementById(`${table_name}_readOnlyContainer`);
//     if (!readOnlyContainer) {
//       readOnlyContainer = document.createElement('div');
//       readOnlyContainer.id = `${table_name}_readOnlyContainer`;
//       readOnlyContainer.classList.add('readOnlyContainer');
//       table_parts_container.appendChild(readOnlyContainer);
//     }

//     // 8) Tabien klikkilogiikka
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

//     // 9) Hakukentän "live-haku" (valinnainen)
//     global_search_input.addEventListener('input', () => {
//       filter_table(table_name);
//       resetOffset();
//     });
//   }
// }

// /**
//  * Luodaan yksi suodatuskenttä saraketta kohden
//  */
// function create_filter_element(column, data_type, table_name) {
//   const container = document.createElement('div');
//   container.classList.add('input-group');

//   let dt_string = 'text';
//   if (data_type && data_type.data_type) {
//     dt_string = data_type.data_type.toLowerCase();
//   }

//   // Jos sarake on openai_embedding, luodaan erikoiskenttä semanttiselle hakulauseelle
//   if (column === 'openai_embedding') {
//     const semantic_input = document.createElement('input');
//     semantic_input.type = 'text';
//     semantic_input.placeholder = 'Anna semanttinen hakusana... (Esim. "Tiina leipoo")';
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

//   // Normaali kenttä
//   let input;
//   switch (dt_string) {
//     case 'integer':
//     case 'bigint':
//     case 'smallint':
//     case 'numeric':
//       input = document.createElement('input');
//       input.type = 'number';
//       input.placeholder = ' ';
//       break;
//     case 'boolean':
//       input = document.createElement('select');
//       container.classList.add('no-float');
//       {
//         const opt_all = document.createElement('option');
//         opt_all.value = '';
//         opt_all.textContent = 'All';
//         input.appendChild(opt_all);

//         const opt_true = document.createElement('option');
//         opt_true.value = 'true';
//         opt_true.textContent = 'True';
//         input.appendChild(opt_true);

//         const opt_false = document.createElement('option');
//         opt_false.value = 'false';
//         opt_false.textContent = 'False';
//         input.appendChild(opt_false);
//       }
//       break;
//     case 'date':
//     case 'timestamp':
//     case 'timestamp without time zone':
//     case 'timestamp with time zone':
//       input = document.createElement('input');
//       input.type = 'date';
//       input.placeholder = ' ';
//       break;
//     default:
//       input = document.createElement('input');
//       input.type = 'text';
//       input.placeholder = ' ';
//   }

//   input.id = `${table_name}_filter_${column}`;
//   input.addEventListener('input', () => {
//     filter_table(table_name);
//     resetOffset();
//   });

//   container.appendChild(input);

//   const label = document.createElement('label');
//   label.setAttribute('for', input.id);
//   label.textContent = column;
//   container.appendChild(label);

//   return container;
// }

// /**
//  * Kutsuu server-puoleista "vektorihakua" (esimerkkinä) ja päivittää UI:n
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
//  * - Tässä esimerkissä generoidaan taulu readOnlyContaineriin
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
//   // Tyhjennetään ennen uutta dataa
//   readOnlyContainer.innerHTML = '';

//   // Luo tauluelementti generate_table-funktiolla.
//   // Riippuen generate_tablen toteutuksesta, varmista että se joko
//   // palauttaa itse tauluelementin tai manipuloi readOnlyContaineria suoraan.
//   // Tässä oletuksena, että se palauttaa taulun:
//   const tableEl = generate_table(table_name, columns, data, types);
//   if (tableEl) {
//     readOnlyContainer.appendChild(tableEl);
//   }
// }