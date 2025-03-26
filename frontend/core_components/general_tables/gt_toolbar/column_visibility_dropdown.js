// column_visibility_dropdown.js

export function createColumnVisibilityDropdown(tableContainer) {
    // Luodaan dropdownin pääelementti
    const dropdownContainer = document.createElement('div');
    dropdownContainer.classList.add('custom-dropdown');

    // Luodaan button-elementti
    const dropdownButton = document.createElement('button');
    dropdownButton.classList.add('custom-dropdown-button');
    dropdownButton.textContent = 'Näytettävät sarakkeet ▼';

    // Luodaan dropdownin sisältö
    const dropdownContent = document.createElement('div');
    dropdownContent.classList.add('custom-dropdown-content');

    // Luodaan hakukenttä
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.classList.add('custom-search-box');
    searchBox.placeholder = 'Hae sarakkeita...';

    dropdownContent.appendChild(searchBox);

    // Luo checkboxeja varten kontaineri
    const checkboxContainer = document.createElement('div');
    checkboxContainer.classList.add('custom-checkbox-container');

    dropdownContent.appendChild(checkboxContainer);

    // Tallennetaan sarakkeet
    let columns = [];

    // Hae sarakkeet lähimmästä taulusta
    function getColumnsFromTable() {
        // Etsi lähin 'table_from_db' taulu dropdownin alapuolelta
        const table = tableContainer.querySelector('.table_from_db');
        if (!table) {
            console.error('Taulua ei löytynyt.');
            return false; // Indicate failure
        }

        // Ladataan näkyvyysasetukset
        const tableName = table.id;
        const visibilitySettings = loadColumnVisibilitySettings(tableName);

        // Hae ensimmäinen header-rivi (sarakkeiden otsikot)
        const headerRow = table.querySelector('thead tr');
        if (!headerRow) {
            console.error('Header-riviä ei löytynyt.');
            return false;
        }

        const headerCells = headerRow.querySelectorAll('th');
        columns = [];

        headerCells.forEach((th, index) => {
            // Ohitetaan ensimmäinen sarake (valintaruutu)
            if (index === 0) return;

            const columnIndex = index + 1; // Tämä vastaa taulukon todellista sarakeindeksiä (nth-child)

            // Otetaan sarakkeen nimi ilman lajittelun indikaattoreita
            const columnNameElement = th.querySelector('span:first-child');
            const columnName = columnNameElement ? columnNameElement.textContent.trim() : th.textContent.trim();

            columns.push({
                name: columnName,
                visible: Object.hasOwn(visibilitySettings, columnName)
                    ? visibilitySettings[columnName]
                    : !th.classList.contains('hidden'),
                index: columnIndex // Tallennetaan todellinen sarakeindeksi
            });
        });

        return true; // Indicate success
    }

    // Luo checkboxit sarakkeista
    function createCheckboxes(filter = '') {
        checkboxContainer.replaceChildren();

        columns.forEach(column => {
            if (column.name.toLowerCase().includes(filter.toLowerCase())) {
                const checkboxLabel = document.createElement('label');
                checkboxLabel.classList.add('custom-dropdown-item');

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = column.visible;
                checkbox.addEventListener('change', () => {
                    column.visible = checkbox.checked;
                    updateTableColumns();
                });

                checkboxLabel.appendChild(checkbox);
                checkboxLabel.appendChild(document.createTextNode(column.name));

                checkboxContainer.appendChild(checkboxLabel);
            }
        });
    }

    // Päivittää taulun sarakkeiden näkyvyyden
    function updateTableColumns() {
        const table = tableContainer.querySelector('.table_from_db');
        if (!table) {
            console.error('Taulua ei löytynyt.');
            return;
        }

        const tableName = table.id;

        columns.forEach(column => {
            const columnIndex = column.index;

            // Valitaan kaikki th- ja td-elementit, jotka ovat kyseisessä sarakkeessa
            const ths = table.querySelectorAll(`thead tr th:nth-child(${columnIndex})`);
            const tds = table.querySelectorAll(`tbody tr td:nth-child(${columnIndex})`);

            if (column.visible) {
                ths.forEach(th => th.classList.remove('hidden'));
                tds.forEach(td => td.classList.remove('hidden'));
            } else {
                ths.forEach(th => th.classList.add('hidden'));
                tds.forEach(td => td.classList.add('hidden'));
            }
        });

        // Tallennetaan näkyvyysasetukset
        saveColumnVisibilitySettings(tableName, columns);
    }

    // Hakutoiminto
    searchBox.addEventListener('input', () => {
        createCheckboxes(searchBox.value);
    });

    // Lisää tapahtumankuuntelija dropdownin avaamiseksi/sulkemiseksi
    dropdownButton.addEventListener('click', () => {
        dropdownContent.classList.toggle('show');
        if (dropdownContent.classList.contains('show')) {
            // Alustetaan sarakkeet ja checkboxit dropdownin avauksen yhteydessä
            const success = getColumnsFromTable();
            if (!success) {
                // Jos taulua ei löydy, sulje dropdown ja älä näytä mitään
                dropdownContent.classList.remove('show');
                return;
            }
            createCheckboxes();
            searchBox.value = ''; // Tyhjennetään hakukenttä
            searchBox.focus();
        }
    });

    // Sulje dropdown, jos klikkaa ulkopuolelle
    window.addEventListener('click', (event) => {
        if (!dropdownContainer.contains(event.target)) {
            dropdownContent.classList.remove('show');
        }
    });

    // Kootaan dropdown
    dropdownContainer.appendChild(dropdownButton);
    dropdownContainer.appendChild(dropdownContent);

    // Tarkistetaan, että taulu löytyy ennen palautusta
    if (tableContainer.querySelector('.table_from_db')) {
        return dropdownContainer;
    } else {
        return null;
    }
}

// Tallennetaan sarakkeiden näkyvyysasetukset localStorageen
function saveColumnVisibilitySettings(tableName, columns) {
    const visibilitySettings = {};
    columns.forEach(column => {
        visibilitySettings[column.name] = column.visible;
    });
    localStorage.setItem(`${tableName}_column_visibility`, JSON.stringify(visibilitySettings));
}

// Ladataan sarakkeiden näkyvyysasetukset localStoragesta
function loadColumnVisibilitySettings(tableName) {
    const settings = localStorage.getItem(`${tableName}_column_visibility`);
    return settings ? JSON.parse(settings) : {};
}

// Funktio soveltamaan tallennetut näkyvyysasetukset tauluun
export function applySavedColumnVisibility(table) {
    const tableName = table.id;
    let visibilitySettings = loadColumnVisibilitySettings(tableName);

    if (!visibilitySettings) return;

    const columns = [];

    // Hae ensimmäinen header-rivi (sarakkeiden otsikot)
    const headerRow = table.querySelector('thead tr');
    if (!headerRow) {
        console.error('Header-riviä ei löytynyt.');
        return;
    }

    const headerCells = headerRow.querySelectorAll('th');

    headerCells.forEach((th, index) => {
        // Ohitetaan ensimmäinen sarake (valintaruutu)
        if (index === 0) return;

        const columnIndex = index + 1;
        const columnNameElement = th.querySelector('span:first-child');
        const columnName = columnNameElement ? columnNameElement.textContent.trim() : th.textContent.trim();

        const isVisible = Object.hasOwn(visibilitySettings, columnName)
            ? visibilitySettings[columnName]
            : true;

        columns.push({
            name: columnName,
            visible: isVisible,
            index: columnIndex
        });
    });

    // Puhdistetaan visibilitySettings sarakkeista, joita ei enää ole
    const updatedVisibilitySettings = {};
    columns.forEach(column => {
        updatedVisibilitySettings[column.name] = column.visible;
    });
    saveColumnVisibilitySettings(tableName, columns); // Päivitetään localStorage

    // Päivitetään sarakkeiden näkyvyys
    columns.forEach(column => {
        const columnIndex = column.index;

        const ths = table.querySelectorAll(`thead tr th:nth-child(${columnIndex})`);
        const tds = table.querySelectorAll(`tbody tr td:nth-child(${columnIndex})`);

        if (column.visible) {
            ths.forEach(th => th.classList.remove('hidden'));
            tds.forEach(td => td.classList.remove('hidden'));
        } else {
            ths.forEach(th => th.classList.add('hidden'));
            tds.forEach(td => td.classList.add('hidden'));
        }
    });
}
