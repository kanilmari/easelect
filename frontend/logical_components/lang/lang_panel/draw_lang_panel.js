document.addEventListener('DOMContentLoaded', function() {
    // Haetaan kielenvalitsimen pääelementti
    const language_selector_div = document.querySelector('.language-selection.menu-language-selection');
    if (!language_selector_div) {
      console.error('kielenvalitsimen elementtiä ei löytynyt.');
      return;
    }
    
    // Haetaan nappi, joka näyttää valitun kielen, sekä pudotusvalikko
    const button_select_selected = language_selector_div.querySelector('.select-selected');
    const dropdown_items_div = language_selector_div.querySelector('.select-items');
    
    // Näytetään tai piilotetaan valikko napin klikkauksella
    button_select_selected.addEventListener('click', function(event) {
      dropdown_items_div.classList.toggle('select-hide');
      button_select_selected.classList.toggle('select-arrow-active');
      event.stopPropagation();
    });
    
    // Lisätään tapahtumakuuntelijat jokaiseen kielivaihtoehtoon
    const language_option_labels = language_selector_div.querySelectorAll('.select-option');
    language_option_labels.forEach(function(option_label) {
      option_label.addEventListener('click', function() {
        const selected_language_key = this.getAttribute('data-lang-key');
        const selected_language_text = this.textContent.trim();
        
        // Päivitetään napin sisältö säilyttäen mahdollinen svg-ikoni
        const svg_icon = button_select_selected.querySelector('.svg-icon');
        if (svg_icon) {
          button_select_selected.innerHTML = '';
          button_select_selected.appendChild(svg_icon);
          button_select_selected.appendChild(document.createTextNode(' ' + selected_language_text));
        } else {
          button_select_selected.textContent = selected_language_text;
        }
        
        // Merkitään vastaava radio-input valituksi labelin for-attribuutin avulla
        const radio_input_id = this.getAttribute('for');
        const corresponding_radio_input = document.getElementById(radio_input_id);
        if (corresponding_radio_input) {
          corresponding_radio_input.checked = true;
        }
        
        // Piilotetaan valikko
        dropdown_items_div.classList.add('select-hide');
        button_select_selected.classList.remove('select-arrow-active');
        
        // Lokitetaan kielenvaihto
        console.log("kieli vaihdettu:", selected_language_key);
      });
    });
    
    // Suljetaan valikko, jos klikataan sivua muualla
    document.addEventListener('click', function() {
      dropdown_items_div.classList.add('select-hide');
      button_select_selected.classList.remove('select-arrow-active');
    });
  });