// File: checkbox_logic.js
// Käytetään kokonaisena funktiota.

export function handle_checkbox_change(event, maxRecursionDepth) {
    const checkbox = event.target;
    update_parent_state(checkbox, maxRecursionDepth);
}

export function update_parent_state(childCheckbox, maxDepth, depth = 0) {
    if (depth >= maxDepth) {
        console.log('maksimi rekursion syvyys saavutettu');
        return;
    }
    const parentElement = childCheckbox.closest('.node')?.parentElement?.closest('.node');
    if (!parentElement) return;

    const parentCheckbox = parentElement.querySelector('input[type="checkbox"]');
    if (!parentCheckbox) return;

    const childCheckboxes = parentElement.querySelectorAll('.children .node:not(.hidden) input[type="checkbox"]');
    let allChecked = true;
    let anyChecked = false;

    childCheckboxes.forEach(chk => {
        if (chk.checked) {
            anyChecked = true;
        } else {
            allChecked = false;
        }
    });

    if (allChecked) {
        parentCheckbox.indeterminate = false;
        parentCheckbox.checked = true;
    } else if (anyChecked) {
        parentCheckbox.indeterminate = true;
        parentCheckbox.checked = false;
    } else {
        parentCheckbox.indeterminate = false;
        parentCheckbox.checked = false;
    }

    parentCheckbox.setAttribute('data-indeterminate', parentCheckbox.indeterminate ? 'true' : 'false');
    update_parent_state(parentCheckbox, maxDepth, depth + 1);
}

export function collect_checkbox_states(container) {
    const checkboxStates = {};
    if (!container) return checkboxStates;
    const allCheckboxes = container.querySelectorAll('.node input[type="checkbox"]');
    allCheckboxes.forEach(checkbox => {
        const nodeId = checkbox.closest('.node').id;
        checkboxStates[nodeId] = {
            checked: checkbox.checked,
            indeterminate: checkbox.indeterminate
        };
    });
    return checkboxStates;
}

export function apply_checkbox_states(checkboxStates, container) {
    if (!container) return;
    const allCheckboxes = container.querySelectorAll('.node input[type="checkbox"]');
    allCheckboxes.forEach(checkbox => {
        const nodeId = checkbox.closest('.node').id;
        if (checkboxStates[nodeId]) {
            checkbox.checked = checkboxStates[nodeId].checked;
            checkbox.indeterminate = checkboxStates[nodeId].indeterminate;
            checkbox.setAttribute('data-indeterminate', checkbox.indeterminate ? 'true' : 'false');
        } else {
            checkbox.checked = false;
            checkbox.indeterminate = false;
            checkbox.setAttribute('data-indeterminate', 'false');
        }
    });
}
