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
  
	const selection_close_delay_ms = 0; // odotetaan n ms
	let currentOptions = options || [];
  
	const instance = {
	  getValue,
	  setValue,
	  setOptions,
	  open,
	  close
	};
	containerElement.__dropdown = instance;
  
	containerElement.classList.add("vdw-dropdown");
  
	// Luodaan rivi, jossa input + tyhjennysnappi
	const inputRow = document.createElement('div');
	inputRow.classList.add("vdw-dropdown-input-row");
  
	// Syötekenttä
	const inputEl = document.createElement('input');
	inputEl.type = 'text';
	inputEl.placeholder = placeholder;
	inputEl.readOnly = true;
	inputEl.classList.add('vdw-dropdown-input');
	inputRow.appendChild(inputEl);
  
	// Tyhjennä-valinta-painike
	let clearBtn = null;
	if (showClearButton) {
	  clearBtn = document.createElement('button');
	  clearBtn.type = 'button';
	  clearBtn.classList.add('vdw-clear-btn');
	  clearBtn.textContent = "×";
	  clearBtn.style.display = "none";
	  inputRow.appendChild(clearBtn);
  
	  clearBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		setValue(null, true);
		close(); // suljetaan heti
	  });
	}
  
	// Lisätään "rivi" containeriin
	containerElement.appendChild(inputRow);
  
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
  
	  searchInput.addEventListener('input', () => {
		renderList(searchInput.value.trim());
	  });
	}
  
	// Varsinaiset vaihtoehdot
	const optionsList = document.createElement('div');
	optionsList.classList.add('vdw-dropdown-options');
	listWrapper.appendChild(optionsList);
  
	// Liitetään listWrapper containeriin
	containerElement.appendChild(listWrapper);
  
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
  
	function renderList(filterText = "") {
	  optionsList.replaceChildren();
  
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
  
		if (opt.value === selectedValue) {
		  item.classList.add('vdw-selected');
		}
  
		item.addEventListener('click', () => {
		  setValue(opt.value, true);
  
		  // Päivitetään valinnan ulkoinen korostus
		  const allItems = optionsList.querySelectorAll('.vdw-option');
		  allItems.forEach(el => el.classList.remove('vdw-selected'));
		  item.classList.add('vdw-selected');
  
		  // Odotetaan n ms ennen sulkemista
		  setTimeout(() => {
			close();
		  }, selection_close_delay_ms);
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
	  setValue(null, false);
	  renderList("");
	}
  
	function open() {
	  listWrapper.style.display = 'block';
	  if (searchInput) {
		searchInput.value = "";
		searchInput.focus();
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
  
	renderList("");
  
	return instance;
  }
  
