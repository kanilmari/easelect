// load_single_chat_view.js

import { loadManagementView } from '../../../common_components/utils.js';
import { open_code_chat_and_file_structure_window } from './project_chat.js';

/**
 * Tämä funktio kutsutaan navigaatiosta, kun käyttäjä klikkaa “▶ Chat”.
 * Se huolehtii containerin luomisesta, ja avaa yhden ikkunan, jossa on
 * sekä chat että tiedostorakenteen päivityspainike.
 */
export function load_single_chat_view() {
  return loadManagementView('single_chat_container', generate_single_chat_content);
  // Jos et käytä loadManagementView-funktiota, niin luo vain container
  // ja kutsu generate_single_chat_content suoraan.
}

export async function generate_single_chat_view(container) {
  // Tyhjennetään container
  container.innerHTML = '';

  // Avataan yhdistetty chat + tiedostorakenne -ikkuna
  open_code_chat_and_file_structure_window();

  // Pieni info-teksti containeriin
  const info = document.createElement('p');
  info.textContent = 'Yhdistetty chat- ja tiedostojen päivitysikkuna on avattu. Voit raahata ikkunaa vapaasti.';
  container.appendChild(info);
}

