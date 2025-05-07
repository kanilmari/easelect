// big_card_beautifier.js
import { count_this_function } from '../../dev_tools/function_counter.js';
import { format_column_name } from './card_helpers.js';

count_this_function('createPrettyJsonCard'); // 🔢

/**
 * Luo key–value-kortin yhdestä JSON-objektista lapsitaulujen esittämiseen.
 * Jokainen kenttä näytetään kahden rivin elementtinä samaan tyyliin kuin
 * pääkortissa. Null → '—'.
 */
export function createPrettyJsonCard(jsonObj) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('child_pretty_card');

    Object.entries(jsonObj).forEach(([key, value]) => {
        const field = document.createElement('div');
        field.classList.add('two_line_field');

        const label = document.createElement('div');
        label.classList.add('two_line_label');
        label.textContent = format_column_name(key);

        const val = document.createElement('div');
        val.classList.add('two_line_value', 'child_pretty_value');
        val.textContent =
            value === null || value === undefined ? '—' : String(value);

        field.appendChild(label);
        field.appendChild(val);
        wrapper.appendChild(field);
    });

    return wrapper;
}