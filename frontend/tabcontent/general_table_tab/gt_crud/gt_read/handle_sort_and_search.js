// handle_sort_and_search.js

import { fetchDataWithSort } from './fetch_sorted_data.js';
import { initializeInfiniteScroll } from '../../../../common_tools/infinite_scroll/infinite_scroll.js';

// Säilytetään handleSortClick entisellään,
// mutta kutsutaan jo olemassa olevaa fetchDataWithSort-funktiota.
export function handleSortClick(column, table_name) {
    let currentOrder = localStorage.getItem(`${table_name}_sort_order_${column}`) || 'ASC';
    currentOrder = currentOrder === 'ASC' ? 'DESC' : 'ASC';
    localStorage.setItem(`${table_name}_sort_order_${column}`, currentOrder);

    const table = document.querySelector(`#${table_name}_container table`);
    if (!table) {
        console.error(`Table element not found for table: ${table_name}`);
        return;
    }
    const columns = JSON.parse(table.dataset.columns);
    columns.forEach(col => {
        if (col !== column) {
            localStorage.removeItem(`${table_name}_sort_order_${col}`);
        }
    });

    localStorage.setItem(`${table_name}_sort_column`, column);

    // Nyt emme määrittele fetchDataWithSort-funktiota uudelleen,
    // vaan kutsumme suoraan sitä, joka on importattu fetch_sorted_data.js:stä.
    fetchDataWithSort(table_name, column, currentOrder)
        .then(() => {
            // Jos haluat esim. lisälogiikkaa sortin jälkeen, voit laittaa sen tänne
            initializeInfiniteScroll(table_name);
        })
        .catch((error) => {
            console.error('Error fetching sorted data:', error);
        });
}
