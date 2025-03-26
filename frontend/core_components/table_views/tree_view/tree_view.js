
import { render_tree } from '../../../common_components/vanilla_tree/vanilla_tree.js';

export async function create_tree_view(table_name, columns, data) {
    const tree_view_div = document.getElementById(`${table_name}_tree_view_container`);
    if (!tree_view_div) return;

    let id_column = null;
    let parent_column = null;
    for (const col of columns) {
        const lower = col.toLowerCase();
        if (!id_column && lower === 'id') {
            id_column = col;
        }
        if (!parent_column && lower.startsWith('parent_')) {
            parent_column = col;
        }
    }
    if (!id_column) {
        tree_view_div.innerHTML = '<div">Ei "id"-saraketta – ei puuta.</div>';
        return;
    }

    // Etsitään name/nimi-sarake
    let name_column = null;
    const name_candidates = columns.filter(c => {
        const lower = c.toLowerCase();
        return lower.includes('name') || lower.includes('nimi');
    });
    if (name_candidates.length > 0) {
        name_column = name_candidates[0];
    }

    // Etsitään type-sarake
    let type_column = null;
    for (const col of columns) {
        if (col.toLowerCase() === 'type') {
            type_column = col;
            break;
        }
    }

    // Rakennetaan "flat"-data
    const tree_data = data.map(row => {
        const typeVal = type_column && row[type_column] ? String(row[type_column]).trim() : '';
        const nameVal = (name_column && row[name_column] != null)
            ? String(row[name_column]).trim()
            : String(row[id_column]); // fallback id:hen

        // Iso alkukirjain ja kaksoispiste
        const nodeLabel = typeVal
            ? `${typeVal.charAt(0).toUpperCase() + typeVal.slice(1)}: ${nameVal}`
            : nameVal;

        return {
            id: row[id_column],
            parent_id: parent_column ? row[parent_column] : null,
            name: nodeLabel
        };
    });

    tree_view_div.replaceChildren();
    render_tree(tree_data, {
        container_id: tree_view_div.id,
        id_suffix: `_${table_name}_tree`,
        render_mode: 'button',
        checkbox_mode: 'none',
        use_icons: false,
        populate_checkbox_selection: false,
        max_recursion_depth: 64,
        tree_model: 'flat',
        initial_open_level: 2,
        show_node_count: true,
        show_search: true,
        use_data_lang_key: false,
        // button_action_function: (nodeData) => {
        //     // console.log("Klikkasit solmua:", nodeData);
        // }
    });
}
