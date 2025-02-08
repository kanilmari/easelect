// vanilla_dropdown.js

/**
 * Pieni, hakutoiminnolla varustettu vanilla-dropdown-komponentti.
 * 
 * @param {Object} config 
 * @param {HTMLElement} config.containerElement - HTML-elementti, johon dropdown sijoitetaan
 * @param {Array<Object>} config.options - Alkuperäiset valintavaihtoehdot [{ value, label, ... }]
 * @param {string} [config.placeholder="Valitse..."] - Vihjeteksti, kun ei ole valintaa
 * @param {string} [config.searchPlaceholder="Hae..."] - Hakukentän vihjeteksti
 * @param {boolean} [config.showClearButton=true] - Näytetäänkö "tyhjennä valinta" -painike
 * @param {boolean} [config.useSearch=true] - Näytetäänkö hakukenttä
 * @param {function} [config.onChange] - Kutsutaan, kun valinta muuttuu (parametrina valittu arvo)
 */
export function createVanillaDropdown({
    containerElement,
    options,
    placeholder = "Valitse...",
    searchPlaceholder = "Hae...",
    showClearButton = true,
    useSearch = true,
    onChange
  }) {
    if (!containerElement) {
      throw new Error("containerElement puuttuu tai on virheellinen.");
    }
  
    // Tallennetaan “instanssiin” options
    let currentOptions = options || [];
  
    // Luodaan “instanssi-olio” -> tallennamme sen containerElement.__dropdowniin
    // jotta muu koodi voi hakea sen (esim. getValue, setOptions).
    const instance = {
      getValue,
      setValue,
      setOptions,
      open,
      close
    };
    containerElement.__dropdown = instance;
  
    // Luodaan perusrakenne
    containerElement.classList.add("vdw-dropdown");
  
    // Näkyvä input
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.placeholder = placeholder;
    inputEl.readOnly = true;
    inputEl.classList.add('vdw-dropdown-input');
  
    // Dropdown-listan kääre
    const listWrapper = document.createElement('div');
    listWrapper.classList.add('vdw-dropdown-list');
    listWrapper.style.display = 'none';
  
    // (Mahdollinen) hakukenttä
    let searchInput = null;
    if (useSearch) {
      const searchContainer = document.createElement('div');
      searchContainer.classList.add('vdw-dropdown-search');
  
      searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = searchPlaceholder;
      searchInput.classList.add('vdw-dropdown-search-input');
  
      searchContainer.appendChild(searchInput);
      listWrapper.appendChild(searchContainer);
  
      // Tapahtumankuuntelija hakukentälle
      searchInput.addEventListener('input', () => {
        renderList(searchInput.value.trim());
      });
    }
  
    // Varsinaiset vaihtoehdot
    const optionsList = document.createElement('div');
    optionsList.classList.add('vdw-dropdown-options');
    listWrapper.appendChild(optionsList);
  
    // Liitetään DOM:iin
    containerElement.appendChild(inputEl);
    containerElement.appendChild(listWrapper);
  
    // Tyhjennä-valinta-painike
    let clearBtn = null;
    if (showClearButton) {
      clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.classList.add('vdw-clear-btn');
      clearBtn.innerHTML = "&times;";
      clearBtn.style.display = "none";
      containerElement.appendChild(clearBtn);
  
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setValue(null, true);
        close();
      });
    }
  
    // Seurataan valittua arvoa
    let selectedValue = null;
  
    // Klikkaus inputtiin -> avaa/sulje
    inputEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });
  
    // Klikkaus muualle sulkee
    document.addEventListener('click', (e) => {
      if (!containerElement.contains(e.target)) {
        close();
      }
    });
  
    // Renderöintifunktio
    function renderList(filterText = "") {
      optionsList.innerHTML = "";
  
      const filtered = currentOptions.filter(o => 
        o.label.toLowerCase().includes(filterText.toLowerCase())
      );
  
      if (filtered.length === 0) {
        const noResults = document.createElement('div');
        noResults.classList.add('vdw-no-results');
        noResults.textContent = "Ei tuloksia";
        optionsList.appendChild(noResults);
        return;
      }
  
      filtered.forEach(opt => {
        const item = document.createElement('div');
        item.classList.add('vdw-option');
        item.textContent = opt.label;
        item.addEventListener('click', () => {
          setValue(opt.value, true);
          close();
        });
        optionsList.appendChild(item);
      });
    }
  
    function setValue(value, triggerChange = false) {
      selectedValue = value;
      const found = currentOptions.find(o => o.value === value);
      inputEl.value = found ? found.label : "";
      if (clearBtn) {
        clearBtn.style.display = selectedValue ? "inline-block" : "none";
      }
      if (triggerChange && typeof onChange === 'function') {
        onChange(selectedValue);
      }
    }
  
    function getValue() {
      return selectedValue;
    }
  
    function setOptions(newOptions) {
      currentOptions = newOptions || [];
      setValue(null, false); // Tyhjennetään valinta
      renderList("");        // Renderöidään heti uusi lista
    }
  
    function open() {
      listWrapper.style.display = 'block';
      if (searchInput) {
        searchInput.value = "";
      }
      renderList("");
    }
  
    function close() {
      listWrapper.style.display = 'none';
    }
  
    function toggle() {
      if (listWrapper.style.display === 'none') {
        open();
      } else {
        close();
      }
    }
  
    // Alustava renderöinti
    renderList("");
  
    // Palautetaan instanssin julkiset metodit
    return instance;
  }
  