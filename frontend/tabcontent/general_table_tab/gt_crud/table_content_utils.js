// table_content_utils.js

export function selectCell(cell) {
    // Poistetaan 'selected_for_editing' -luokka kaikista soluista
    const table = cell.closest('table');
    const selectedCells = table.querySelectorAll('.selected_for_editing');
    selectedCells.forEach(selectedCell => {
        selectedCell.classList.remove('selected_for_editing');
    });

    // Lisätään 'selected_for_editing' -luokka valittuun soluun
    cell.classList.add('selected_for_editing');
    cell.focus();
}
