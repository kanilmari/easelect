// main.js

import { initNavbar } from './main_app/navigation/navbar.js';
import { update_oids_and_table_names } from './main_app/main/update_oids_and_table_names.js';
import { load_tables } from './main_app/main/load_tables.js';
import { updateMenuLanguageDisplay } from './logical_components/lang/lang_panel.js';
import { handle_table_selected_event } from './main_app/navigation/table_selected_listener.js';

// Tarpeellisia lisäimportteja
import './logical_components/lang/lang.js';
import './logical_components/vanilla_tree/tree_call.js';
import './logical_components/table_views/table_view/table_column_resizer.js';
import './logical_components/print_svgs/logout_svg.js';
import './main_app/navigation/tabs.js';

document.addEventListener('DOMContentLoaded', () => {
  const current_path = window.location.pathname; 

  // 1. Alustetaan navbar
  initNavbar();

  // 2. Tarkistetaan, onko polku esim. "/tables/..."
  if (current_path.startsWith("/tables/")) {
    const table_name = current_path.replace("/tables/", "");
    if (table_name) {
      localStorage.setItem('selected_table', table_name);
    }
  }

  // 3. Päivitetään OID:t, ladataan taulut, ja päivitetään kielivalinta
  update_oids_and_table_names();
  load_tables();
  updateMenuLanguageDisplay();
});

// Reagoidaan “tableSelected”-eventtiin (mm. navigointia varten)
document.addEventListener('tableSelected', handle_table_selected_event);

