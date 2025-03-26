// edit_cell.js

import { selectCell } from '../../../table_views/table_view/table_content_utils.js';
import { fetchReferencedData } from '../gt_1_1_row_create/add_row.js'; // Tarvitaan foreign key -tietojen hakemiseen

export async function editCell(cell, columns, data, dataTypes, table_name) {
    let originalContent = cell.textContent;

    // Haetaan sarakkeen nimi ja tietotyyppi
    const colIndex = parseInt(cell.dataset.colIndex);
    const columnName = columns[colIndex];
    const dataTypeInfo = dataTypes[columnName];

    // Tarkistetaan, onko sarake '_name' -sarake ja liittyykö se foreign key -sarakkeeseen
    let foreignKeyColumnName = null;
    let isNameColumn = false;
    if (columnName.endsWith('_name')) {
        foreignKeyColumnName = columnName.replace('_name', '_id');
        if (!columns.includes(foreignKeyColumnName)) {
            foreignKeyColumnName = columnName.replace('_name', '');
        }
        isNameColumn = true;
    } else if (dataTypeInfo && dataTypeInfo.foreign_table) {
        foreignKeyColumnName = columnName;
    }

    // Jos sarake liittyy foreign key -sarakkeeseen
    if (foreignKeyColumnName && dataTypes[foreignKeyColumnName] && dataTypes[foreignKeyColumnName].foreign_table) {
        await handleForeignKeyEditing(cell, columns, data, dataTypes, table_name, columnName, foreignKeyColumnName, isNameColumn, originalContent);
    } else {
        await handleRegularEditing(cell, columns, data, dataTypes, table_name, columnName, originalContent);
    }
}

async function handleForeignKeyEditing(cell, columns, data, dataTypes, table_name, columnName, foreignKeyColumnName, isNameColumn, originalContent) {
    cell.textContent = '';
    cell.classList.add('editing');

    const dropdownContainer = document.createElement('div');
    dropdownContainer.classList.add('custom-dropdown-container');

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Hae...';
    searchInput.classList.add('dropdown-search-input');

    const optionsList = document.createElement('ul');
    optionsList.classList.add('dropdown-options-list');

    const foreignTableName = dataTypes[foreignKeyColumnName].foreign_table;
    const options = await fetchReferencedData(foreignTableName);

    function renderOptions(filterText = '') {
        optionsList.replaceChildren();

        const filteredOptions = options.filter(option => {
            const displayValue = option['display'] || '';
            return displayValue.toLowerCase().includes(filterText.toLowerCase());
        });

        filteredOptions.forEach(option => {
            const optionItem = document.createElement('li');
            optionItem.classList.add('dropdown-option-item');

            const idValue = option['id'];
            const displayValue = option['display'];

            optionItem.dataset.value = idValue;
            optionItem.dataset.display = displayValue;

            if (isNameColumn) {
                optionItem.textContent = displayValue;
            } else {
                optionItem.textContent = `${idValue} (${displayValue})`;
            }

            const rowIndex = parseInt(cell.dataset.rowIndex);
            const rowData = data[rowIndex];
            const foreignKeyValue = rowData[foreignKeyColumnName];

            if (idValue == foreignKeyValue) {
                optionItem.classList.add('selected');
            }

            optionItem.addEventListener('click', () => {
                selectOption(idValue, displayValue);
            });

            optionsList.appendChild(optionItem);
        });
    }

    // Funktio valinnan käsittelyyn
    async function selectOption(newValue, displayValue) {
        if (isNameColumn) {
            cell.textContent = displayValue;
        } else {
            cell.textContent = newValue;
            cell.title = displayValue;
        }
        cell.classList.remove('editing');

        const rowIndex = parseInt(cell.dataset.rowIndex);
        const rowData = data[rowIndex];
        const foreignKeyValue = rowData[foreignKeyColumnName];

        if (newValue == foreignKeyValue) {
            selectCell(cell);
            return;
        }

        const id = rowData['id'];

        const updateData = {
            id: id,
            column: foreignKeyColumnName,
            value: newValue
        };

        try {
            await sendUpdateRequest(table_name, updateData);

            data[rowIndex][foreignKeyColumnName] = newValue;
            data[rowIndex][foreignKeyColumnName + '_name'] = displayValue;
            data[rowIndex][columnName] = isNameColumn ? displayValue : newValue;

            const rowCells = cell.parentElement.cells;
            for (let i = 0; i < columns.length; i++) {
                const col = columns[i];
                if (col === foreignKeyColumnName) {
                    const fkCell = rowCells[i + 1];
                    fkCell.textContent = data[rowIndex][foreignKeyColumnName];
                    fkCell.title = data[rowIndex][foreignKeyColumnName + '_name'];
                } else if (col === foreignKeyColumnName + '_name') {
                    const nameCell = rowCells[i + 1];
                    nameCell.textContent = data[rowIndex][foreignKeyColumnName + '_name'];
                }
            }

        } catch (error) {
            console.error('Error updating cell:', error);
            cell.textContent = originalContent;
            alert('Error updating cell');
        } finally {
            selectCell(cell);
        }
    }

    // Hakukentän tapahtuma
    searchInput.addEventListener('input', () => {
        const filterText = searchInput.value;
        renderOptions(filterText);
    });

    // Blur-tapahtuma
    function handleBlur(event) {
        if (!dropdownContainer.contains(event.relatedTarget)) {
            document.removeEventListener('click', handleDocumentClick);
            cell.classList.remove('editing');
            cell.textContent = originalContent;
            selectCell(cell);
        }
    }

    // Käsitellään klikkaukset dropdownin ulkopuolella
    function handleDocumentClick(event) {
        if (!dropdownContainer.contains(event.target)) {
            handleBlur({ relatedTarget: null });
        }
    }

    // Lisätään elementit kontaineriin
    dropdownContainer.appendChild(searchInput);
    dropdownContainer.appendChild(optionsList);

    // Lisätään kontaineri soluun
    cell.appendChild(dropdownContainer);
    searchInput.focus();

    // Alustetaan valinnat
    renderOptions();

    // Lisätään tapahtumankuuntelijat
    searchInput.addEventListener('blur', handleBlur);
    optionsList.addEventListener('blur', handleBlur);
    document.addEventListener('click', handleDocumentClick);

    // Estetään solun fokuksen menetys
    dropdownContainer.addEventListener('mousedown', (event) => {
        event.preventDefault();
    });

    // Näppäimistönavigaatio
    searchInput.addEventListener('keydown', (event) => {
        const items = optionsList.querySelectorAll('.dropdown-option-item');
        const selectedItem = optionsList.querySelector('.dropdown-option-item.highlighted');
        let currentIndex = Array.from(items).indexOf(selectedItem);

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (currentIndex < items.length - 1) {
                currentIndex++;
            } else {
                currentIndex = 0;
            }
            highlightItem(items, currentIndex);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (currentIndex > 0) {
                currentIndex--;
            } else {
                currentIndex = items.length - 1;
            }
            highlightItem(items, currentIndex);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (selectedItem) {
                selectedItem.click();
            }
        } else if (event.key === 'Escape') {
            handleBlur({ relatedTarget: null });
        }
    });

    function highlightItem(items, index) {
        items.forEach(item => item.classList.remove('highlighted'));
        const item = items[index];
        if (item) {
            item.classList.add('highlighted');
            item.scrollIntoView({ block: 'nearest' });
        }
    }
}

async function handleRegularEditing(cell, columns, data, dataTypes, table_name, columnName, originalContent) {
    cell.textContent = '';
    cell.classList.add('editing');

    const dataTypeInfo = dataTypes[columnName];
    const dataType = dataTypeInfo.data_type || dataTypeInfo;
    let inputType = 'text';
    if (dataType.includes('timestamp') || dataType.includes('date')) {
        inputType = 'date';
    } else if (dataType.includes('int') || dataType === 'numeric') {
        inputType = 'number';
    } else if (dataType === 'boolean') {
        inputType = 'checkbox';
    }

    const input = document.createElement('input');
    input.type = inputType;

    const rowIndex = parseInt(cell.dataset.rowIndex);
    const rowData = data[rowIndex];
    const originalValue = rowData[columnName];

    if (inputType === 'checkbox') {
        input.checked = originalValue === true || originalValue === 'true';
    } else if (inputType === 'date') {
        const dateValue = new Date(originalValue);
        if (!isNaN(dateValue)) {
            input.value = dateValue.toISOString().substring(0, 10);
        } else {
            input.value = '';
        }
    } else {
        input.value = originalValue !== null && originalValue !== undefined ? originalValue : '';
    }

    cell.appendChild(input);
    input.focus();

    input.addEventListener('blur', async () => {
        let newValue;
        if (input.type === 'checkbox') {
            newValue = input.checked;
            cell.textContent = newValue ? 'true' : 'false';
        } else {
            newValue = input.value;
            cell.textContent = newValue;
        }
        cell.classList.remove('editing');

        let valueChanged = false;
        if (input.type === 'checkbox') {
            // Vertaa suoraan uusi ja alkuperäinen arvo
            valueChanged = (newValue !== originalValue);
        } else if (input.type === 'number') {
            valueChanged = (parseFloat(newValue) !== parseFloat(originalValue));
        } else {
            valueChanged = (newValue !== originalValue);
        }

        // Debug-tulostus
        console.log('originalValue:', originalValue, 'newValue:', newValue, 'valueChanged:', valueChanged);

        if (!valueChanged) {
            selectCell(cell);
            return;
        }

        const id = rowData['id'];

        const updateData = {
            id: id,
            column: columnName,
            value: newValue
        };

        try {
            await sendUpdateRequest(table_name, updateData);

            data[rowIndex][columnName] = newValue;

        } catch (error) {
            console.error('Error updating cell:', error);
            cell.textContent = originalContent;
            alert('Error updating cell');
        } finally {
            selectCell(cell);
        }
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            input.blur();
        } else if (event.key === 'Escape') {
            input.value = originalValue !== null && originalValue !== undefined ? originalValue : '';
            input.blur();
        }
    });
}

async function sendUpdateRequest(table_name, updateData) {
    // const response = await fetch(`/tables/${table_name}/update`, {
    const response = await fetch(`/api/update-row?table=${table_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
    });
if (!response.ok) {
    throw new Error('Update failed');
}
const result = await response.json();
console.log('Update successful:', result);
}