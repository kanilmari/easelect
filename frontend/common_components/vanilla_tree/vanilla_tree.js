// vanilla_tree.js
import {
    handle_checkbox_change,
    collect_checkbox_states,
    apply_checkbox_states,
} from './van_tr_components/checkbox_logic.js';
import { createTreeNode } from './van_tr_components/render_tree_node.js';
import { wait_until_appears } from '../wait_until_appears.js';
import { count_this_function } from '../../core_components/dev_tools/function_counter.js';

/* ------------ pienehköt top-level-apu-funktiot (entiset) ------------- */

// korkeus-päivitys (ei tee mitään, mutta säilytetään kutsut)
function update_ancestor_container_heights() {}
function getAllDescendantLeaves(nodeEl) {
    const leaves = [];
    nodeEl.querySelectorAll('.node').forEach((n) => {
        const cc = n.querySelector('.children');
        if (!cc || cc.children.length === 0) leaves.push(n.id);
    });
    return leaves;
}
function collectSelectedLeafNodesWithFolders(container) {
    const sel = [];
    container.querySelectorAll('.node').forEach((n) => {
        const cb = n.querySelector('input[type="checkbox"]');
        if (!cb) return;
        const cc = n.querySelector('.children');
        const isFolder = !!cc;
        const fully =
            isFolder &&
            cb.checked &&
            !cb.indeterminate &&
            n.getAttribute('data-folder-fully-selected') === 'true';
        if (fully) getAllDescendantLeaves(n).forEach((id) => sel.includes(id) || sel.push(id));
    });
    container
        .querySelectorAll('input[type="checkbox"]:checked')
        .forEach((cb) => {
            const n = cb.closest('.node');
            if (!n) return;
            const cc = n.querySelector('.children');
            if (cc && cc.children.length) return;
            if (!sel.includes(n.id)) sel.push(n.id);
        });
    return sel;
}

/* ==================================================================== */
/* =======================  UUSI RENDER_TREE  ========================= */
/* ==================================================================== */

export async function render_tree(data, config = {}) {
    count_this_function('render_tree');

    /* ---------- vakiot & asetukset ---------- */
    const global_config = {
        container_id: config.container_id || 'vanillaTree',
        id_suffix: config.id_suffix || '',
        render_mode: config.render_mode || 'checkbox',
        checkbox_mode: config.checkbox_mode || 'all',
        use_icons: config.use_icons || false,
        populate_checkbox_selection: config.populate_checkbox_selection || false,
        max_recursion_depth: config.max_recursion_depth || 32,
        tree_model: config.tree_model || 'flat',
        initial_open_level: config.initial_open_level || 0,
        show_node_count: config.show_node_count !== false, // oletus true
        show_search: config.show_search !== false, // oletus true
        title_text: config.title_text || '',
        button_action_function: config.button_action_function || null,
        use_data_lang_key: config.use_data_lang_key !== false,
    };

    const { container_id, id_suffix, render_mode } = global_config;
    const search_input_id = 'tree_search' + id_suffix;

    /* ---------- juoksevat tilat ---------- */
    const nodes_to_open = [];
    let checkbox_states = {};

    /* ---------- LocalStorage-apuja ---------- */
    const lsKey = () => 'expanded_nodes' + id_suffix;
    const loadExpanded = () => {
        try {
            const raw = localStorage.getItem(lsKey());
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.log(e);
            return [];
        }
    };
    const saveExpanded = (arr) => localStorage.setItem(lsKey(), JSON.stringify(arr));

    /* ---------- DOM-apuja ---------- */
    const getContainer = () => document.getElementById(container_id);
    const getTreeContainer = () => document.getElementById('vanillaTree' + id_suffix);
    const getSearchInput = () => document.getElementById(search_input_id);

    const createStructure = () => {
        const root = getContainer();
        if (!root) return null;
        root.replaceChildren();

        if (global_config.title_text) {
            const h2 = document.createElement('h2');
            h2.textContent = global_config.title_text;
            root.appendChild(h2);
        }

        let searchInput = null;
        if (global_config.show_search) {
            searchInput = document.createElement('input');
            searchInput.id = search_input_id;
            searchInput.placeholder = 'Haku...';
            root.appendChild(searchInput);
        }

        const treeDiv = document.createElement('div');
        treeDiv.id = 'vanillaTree' + id_suffix;
        treeDiv.className = 'tree-container';
        root.appendChild(treeDiv);

        return { searchInput, treeContainer: treeDiv };
    };

    /* ---------- avaa / sulje kansion lapset ---------- */
    const openChildren = (nodeEl) => {
        const c = nodeEl.querySelector('.children');
        if (!c) return;
        c.style.cssText = 'display:block;transition:none;max-height:none;';
        update_ancestor_container_heights(nodeEl);
        const exp = loadExpanded();
        if (!exp.includes(nodeEl.id)) {
            exp.push(nodeEl.id);
            saveExpanded(exp);
        }
    };
    const closeChildren = (nodeEl) => {
        const c = nodeEl.querySelector('.children');
        if (!c) return;
        c.style.cssText = 'display:none;transition:none;max-height:0;';
        const exp = loadExpanded().filter((id) => id !== nodeEl.id);
        saveExpanded(exp);
        update_ancestor_container_heights(nodeEl);
    };
    const toggleChildrenVisibility = (childC) => {
        const n = childC.closest('.node');
        if (!n) return;
        childC.style.display === 'none' || childC.style.display === ''
            ? openChildren(n)
            : closeChildren(n);
    };

    /* ---------- checkbox-tilojen tallennus ---------- */
    const updateCheckboxStates = () => (checkbox_states = collect_checkbox_states(getTreeContainer()));
    const restoreCheckboxStates = () => apply_checkbox_states(checkbox_states, getTreeContainer());

    /* ---------- haku + folder-count ---------- */
    const filterTreeNodes = (term) => {
        const tc = getTreeContainer();
        if (!tc) return;
        tc.querySelectorAll('.node').forEach((n) => {
            const txt = (n.querySelector('span,button')?.textContent || '').toLowerCase();
            if (txt.includes(term.toLowerCase())) {
                n.classList.remove('hidden');
                let p = n.parentElement?.closest('.node');
                while (p) {
                    p.classList.remove('hidden');
                    const cc = p.querySelector('.children');
                    if (cc && (cc.style.display === 'none' || !cc.style.display)) {
                        openChildren(p);
                        p.querySelector('.toggle')?.classList.add('rotated');
                    }
                    p = p.parentElement?.closest('.node');
                }
            } else n.classList.add('hidden');
        });
    };

    const updateFolderCounts = () => {
        if (!global_config.show_node_count) return;
        const tc = getTreeContainer();
        if (!tc) return;

        const countLeaves = (n) => {
            const cc = n.querySelector(':scope > .children');
            const hidden = n.classList.contains('hidden');
            if (!cc) return hidden ? 0 : 1;
            let cnt = 0;
            cc.querySelectorAll(':scope > .node').forEach((c) => (cnt += countLeaves(c)));
            return cnt;
        };

        tc.querySelectorAll('.node > .children').forEach((c) => {
            const par = c.parentElement;
            const span = par.querySelector('.node-count');
            if (span) span.textContent = `(${countLeaves(par)})`;
        });
    };

    /* ---------- VARSINAINEN RENDER ---------- */
    async function doRender(treeData) {
        await wait_until_appears('#' + container_id);

        const { treeContainer } = createStructure() || {};
        if (!treeContainer) return;
        treeContainer.replaceChildren();

        const ctx = {
            global_config,
            render_mode,
            id_suffix,
            nodes_to_open,
            openChildren,
            toggleChildrenVisibility,
            handle_checkbox_change,
            collectSelectedLeafNodesWithFolders,
        };

        if (global_config.tree_model === 'flat') {
            buildTree(treeData).forEach((rootNode) =>
                treeContainer.appendChild(createTreeNode(rootNode, 0, ctx)),
            );
        } else {
            treeContainer.appendChild(createTreeNode(treeData, 0, ctx));
        }

        restoreCheckboxStates();

        /* LS & initial open */
        setTimeout(() => {
            nodes_to_open.forEach((n) => {
                openChildren(n);
                n.querySelector('.toggle')?.classList.add('rotated');
            });

            loadExpanded().forEach((id) => {
                const n = document.getElementById(id);
                if (!n) return;
                let anc = n.parentElement?.closest('.node');
                while (anc) {
                    if (!loadExpanded().includes(anc.id)) return;
                    anc = anc.parentElement?.closest('.node');
                }
                openChildren(n);
                n.querySelector('.toggle')?.classList.add('rotated');
            });

            updateFolderCounts();
        }, 0);

        /* haku-kenttä */
        getSearchInput()?.addEventListener('input', function () {
            updateCheckboxStates();
            filterTreeNodes(this.value);
            const sel = collectSelectedLeafNodesWithFolders(treeContainer);
            document.dispatchEvent(
                new CustomEvent('checkboxSelectionChanged', { detail: { selectedCategories: sel } }),
            );
            updateFolderCounts();
        });
    }

    /* renderöi! */
    updateCheckboxStates();
    await doRender(data);
}

/* ---------- flat → hierarkia ---------- */
function buildTree(flat) {
    const nodes = Object.fromEntries(flat.map((n) => [n.id, { ...n, children: [] }]));
    const roots = [];
    flat.forEach((n) =>
        n.parent_id == null || n.parent_id === 'null'
            ? roots.push(nodes[n.id])
            : nodes[n.parent_id]?.children.push(nodes[n.id]),
    );
    return roots;
}
