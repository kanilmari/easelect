// load_single_chat_view.js

import { loadManagementView } from '../utils.js';
import { open_chat_window, open_file_struct_ud_window } from './builder_chat_upload.js';

/**
 * Tämä funktio kutsutaan navigaatiosta, kun käyttäjä klikkaa “▶ Chat”.
 * Se huolehtii containerin luomisesta, ja lopuksi avaa chat- ja hallintaikkunat.
 */
export function load_single_chat_view() {
  // Jos projektissasi on käytössä tämä "loadManagementView", joka luo/näyttää containerin:
  return loadManagementView('single_chat_container', generate_single_chat_content);
  // HUOM: Jos et käytä 'loadManagementView', voit vain luoda suoraan containerin
  // ja kutsua generate_single_chat_content(...) perään, tai suoraan avata ikkunat.
}

async function generate_single_chat_content(container) {
  // Tyhjennetään container
  container.innerHTML = '';

  // Avaa chat-ikkuna
  open_chat_window();

  // Avaa tiedostonsiirto- (hallinta) ikkuna
  open_file_struct_ud_window();

  // Laitetaan pieni info-teksti containeriin
  const info = document.createElement('p');
  info.textContent = 'Chat-ikkuna ja tiedostojen latausikkuna on avattu. Voit raahata ne vapaasti.';
  container.appendChild(info);
}
