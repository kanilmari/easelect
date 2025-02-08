// // create_filter_bar_window.js
// import { resetOffset } from '../../../common_actions/infinite_scroll/infinite_scroll.js';
// import { applySort } from './gt_read/apply_sort.js';
// import { filter_table } from './gt_read/filterbar/filter.js';
// import { create_collapsible_section } from './collapsible_section.js';
// import { create_chat_ui } from './chat.js';

// export function create_filter_bar_window(table_name, columns, data_types) {
//   // Luodaan “ikkuna”-elementti
//   const filter_window = document.createElement('div');
//   filter_window.className = 'window';
//   // Voit arpoa sijainteja
//   filter_window.style.top = '0';
//   filter_window.style.left = '0';


//   // Luodaan otsikkorivi
//   const title_bar = document.createElement('div');
//   title_bar.className = 'title_bar';

//   const title_text = document.createElement('div');
//   title_text.className = 'title_text';
//   title_text.textContent = 'Filtteripalkki (ikkunassa)';

//   // Sulkunappi
//   const close_button = document.createElement('button');
//   close_button.className = 'close_button';
//   close_button.textContent = 'X';
//   close_button.onclick = () => {
//     filter_window.remove();
//   };

//   title_bar.appendChild(title_text);
//   title_bar.appendChild(close_button);

//   // “Sisältöalue” ikkunaan
//   const window_content = document.createElement('div');
//   window_content.className = 'window_content';

//   // Luodaan sama filtteripalkin rakenne kuin create_filter_bar -funktiossa,
//   // mutta sijoitetaan se window_contentiin:
//   const filter_bar = document.createElement('div');
//   filter_bar.id = `${table_name}_filterBar_window`;  
//   filter_bar.classList.add('filterBar');

//   // --- 1) Hakukenttä ---
//   const search_row = document.createElement('div');
//   search_row.classList.add('filterBar-search-row');
//   const global_search_input = document.createElement('input');
//   global_search_input.type = 'text';
//   global_search_input.placeholder = 'Hae jotain...';
//   global_search_input.id = `${table_name}_global_search_input_window`;
//   search_row.appendChild(global_search_input);
//   filter_bar.appendChild(search_row);

//   // --- 2) Välilehtipainikkeet ---
//   const tabs_row = document.createElement('div');
//   tabs_row.classList.add('filterBar-tabs-row');

//   const tab_button_sortfilter = document.createElement('button');
//   tab_button_sortfilter.textContent = 'Suodata ja järjestä';
//   const tab_button_chat = document.createElement('button');
//   tab_button_chat.textContent = 'Chat';

//   tabs_row.appendChild(tab_button_sortfilter);
//   tabs_row.appendChild(tab_button_chat);
//   filter_bar.appendChild(tabs_row);

//   // --- 3) Tabs-sisältöalue ---
//   const tabs_content_container = document.createElement('div');
//   tabs_content_container.classList.add('tabs_content_container');

//   // 3a) Sort & Filter -osio
//   const sort_filter_section = document.createElement('div');
//   sort_filter_section.classList.add('sort_filter_section');
//   sort_filter_section.classList.remove('hidden');  

//   const top_sections = document.createElement('div');
//   top_sections.classList.add('top-sections');

//   // Sorttaus
//   const sort_container = document.createElement('div');
//   sort_container.classList.add('filterBar-section');
//   const sort_label = document.createElement('label');
//   sort_label.textContent = 'Sort by column:';
//   sort_container.appendChild(sort_label);

//   const sort_options_container = document.createElement('div');
//   columns.forEach((column) => {
//     const sort_button = document.createElement('button');
//     sort_button.textContent = column;
//     sort_button.addEventListener('click', () => {
//       applySort(table_name, column);
//     });
//     sort_options_container.appendChild(sort_button);
//   });
//   sort_container.appendChild(sort_options_container);

//   const sort_collapsible = create_collapsible_section('Sorttaus', sort_container, true);
//   top_sections.appendChild(sort_collapsible);

//   // Filtterit
//   const filter_container = document.createElement('div');
//   filter_container.classList.add('filterBar-section');

//   columns.forEach((column) => {
//     const filter_element = create_filter_element_for_window(column, data_types[column], table_name);
//     filter_container.appendChild(filter_element);
//   });
//   const filter_collapsible = create_collapsible_section('Filtterit', filter_container, false);
//   top_sections.appendChild(filter_collapsible);

//   sort_filter_section.appendChild(top_sections);

//   // 3b) Chat
//   const chat_section = document.createElement('div');
//   chat_section.classList.add('chat_section');
//   chat_section.classList.add('hidden');
//   create_chat_ui(table_name, chat_section);

//   tabs_content_container.appendChild(sort_filter_section);
//   tabs_content_container.appendChild(chat_section);
//   filter_bar.appendChild(tabs_content_container);

//   // Lisätään eventlistenerit tab-painikkeille
//   tab_button_sortfilter.addEventListener('click', () => {
//     tab_button_sortfilter.classList.add('tab-button-active');
//     tab_button_chat.classList.remove('tab-button-active');
//     sort_filter_section.classList.remove('hidden');
//     chat_section.classList.add('hidden');
//   });
//   tab_button_chat.addEventListener('click', () => {
//     tab_button_chat.classList.add('tab-button-active');
//     tab_button_sortfilter.classList.remove('tab-button-active');
//     chat_section.classList.remove('hidden');
//     sort_filter_section.classList.add('hidden');
//   });

//   // Lopuksi lisätään filter_bar ikkunan sisältöön
//   window_content.appendChild(filter_bar);

//   // Liitetään otsikkorivi + content + resize-handle ikkunaan
//   filter_window.appendChild(title_bar);
//   filter_window.appendChild(window_content);

//   // Jos haluat koonmuutoskahvan
//   const resize_handle = document.createElement('div');
//   resize_handle.className = 'resize_handle';
//   filter_window.appendChild(resize_handle);

//   // Kiinnitetään ikkuna esim. bodyyn tai omaan containeriin
//   document.getElementById('window_container').appendChild(filter_window);

//   // Tee vetäminen ja koonmuutos mahdolliseksi (tarvitset nämä funktiot)
//   tee_vetaminen_mahdolliseksi(filter_window, title_bar);
//   tee_koonmuutos_mahdolliseksi(filter_window, resize_handle);

//   // Voit halutessasi lisätä hakukentän 'input' -eventlistenerin
//   global_search_input.addEventListener('input', () => {
//     filter_table(table_name);
//     resetOffset();
//   });
// }

// /*
//   Tarvitset hyvin samankaltaisen create_filter_element -funktion,
//   mutta anna sille eri nimi, ettei tule sekaannusta.
// */
// function create_filter_element_for_window(column, data_type, table_name) {
//   const container = document.createElement('div');
//   container.classList.add('input-group');

//   let dt_string = 'text';
//   if (data_type && data_type.data_type) {
//     dt_string = data_type.data_type.toLowerCase();
//   }

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

//   input.id = `${table_name}_filter_win_${column}`;
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

// /*
//   Huom: Tarvitset vedon ja koonmuutoksen funktiot, esim. samat kuin
//   aiemmassa esimerkissäsi: tee_vetaminen_mahdolliseksi ja
//   tee_koonmuutos_mahdolliseksi, jotka asetit window-elementille.
// */
// function tee_vetaminen_mahdolliseksi(ikkuna, title_bar) {
//   let alkupiste_x = 0;
//   let alkupiste_y = 0;
//   let ikkuna_alkuvasen = 0;
//   let ikkuna_alkuyla = 0;
//   let vedetaan = false;

//   title_bar.addEventListener('mousedown', (e) => {
//     vedetaan = true;
//     alkupiste_x = e.clientX;
//     alkupiste_y = e.clientY;
//     ikkuna_alkuvasen = parseInt(ikkuna.style.left) || 0;
//     ikkuna_alkuyla = parseInt(ikkuna.style.top) || 0;
//     document.addEventListener('mousemove', siirra_ikkunaa);
//     document.addEventListener('mouseup', vapauta_ikkuna);
//   });

//   function siirra_ikkunaa(e) {
//     if (!vedetaan) return;
//     const delta_x = e.clientX - alkupiste_x;
//     const delta_y = e.clientY - alkupiste_y;
//     ikkuna.style.left = ikkuna_alkuvasen + delta_x + 'px';
//     ikkuna.style.top = ikkuna_alkuyla + delta_y + 'px';
//   }

//   function vapauta_ikkuna() {
//     vedetaan = false;
//     document.removeEventListener('mousemove', siirra_ikkunaa);
//     document.removeEventListener('mouseup', vapauta_ikkuna);
//   }
// }

// function tee_koonmuutos_mahdolliseksi(ikkuna, resize_handle) {
//   let alkupiste_x = 0;
//   let alkupiste_y = 0;
//   let alku_leveys = 0;
//   let alku_korkeus = 0;
//   let muutetaan_kokoa = false;

//   resize_handle.addEventListener('mousedown', (e) => {
//     muutetaan_kokoa = true;
//     alkupiste_x = e.clientX;
//     alkupiste_y = e.clientY;
//     alku_leveys = ikkuna.offsetWidth;
//     alku_korkeus = ikkuna.offsetHeight;
//     document.addEventListener('mousemove', muuta_kokoa);
//     document.addEventListener('mouseup', lopeta_koonmuutos);
//   });

//   function muuta_kokoa(e) {
//     if (!muutetaan_kokoa) return;
//     const delta_x = e.clientX - alkupiste_x;
//     const delta_y = e.clientY - alkupiste_y;
//     ikkuna.style.width = alku_leveys + delta_x + 'px';
//     ikkuna.style.height = alku_korkeus + delta_y + 'px';
//   }

//   function lopeta_koonmuutos() {
//     muutetaan_kokoa = false;
//     document.removeEventListener('mousemove', muuta_kokoa);
//     document.removeEventListener('mouseup', lopeta_koonmuutos);
//   }
// }