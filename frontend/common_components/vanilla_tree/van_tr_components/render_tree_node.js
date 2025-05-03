// van_tr_components/render_tree_node.js
import { count_this_function } from '../../../core_components/dev_tools/function_counter.js';
import { createSvgIcon, createSvgToggle, createEmptySvg } from './svg_helpers.js';

/**
 * Luo yhden .node-elementin Vanilla-puuhun (rekursiivinen).
 *
 * @param {Object}  nodeData puun tämän solmun data
 * @param {number}  level     syvyystaso (root = 0)
 * @param {Object}  ctx       injektoidut apu-/asetearvot, ks. render_tree
 */
export function createTreeNode(nodeData, level, ctx) {
    count_this_function('createTreeNode');

    const {
        global_config,
        render_mode,
        id_suffix,
        nodes_to_open,
        openChildren,
        toggleChildrenVisibility,
        handle_checkbox_change,
        collectSelectedLeafNodesWithFolders,
    } = ctx;

    const treeContainer = document.getElementById('vanillaTree' + id_suffix);
    if (!treeContainer) {
        const ph = document.createElement('div');
        ph.textContent = '[vanilla tree placeholder]';
        return ph;
    }

    /* ---------- runko ---------- */
    const nodeEl = document.createElement('div');
    nodeEl.className = 'node';
    nodeEl.id = 'tree_node_' + nodeData.id + id_suffix;
    nodeEl.setAttribute('data-db-id', nodeData.db_id);
    nodeEl.setAttribute('data-node-id', nodeData.id);
    nodeEl.style.userSelect = 'none';

    const hasChildren = Array.isArray(nodeData.children) && nodeData.children.length > 0;
    nodeEl.setAttribute('data-is-folder', hasChildren ? 'true' : 'false');

    const row = document.createElement('div');
    row.className = 'node-row';
    row.style.userSelect = 'none';

    /* ---------- toggle-ikoni ---------- */
    const toggleWrap = document.createElement('div');
    toggleWrap.classList.add('toggle');

    if (hasChildren) {
        const t = createSvgToggle();
        toggleWrap.appendChild(t);
        toggleWrap.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const childC = nodeEl.querySelector('.children');
            if (childC) {
                toggleWrap.classList.toggle('rotated');
                toggleChildrenVisibility(childC);
            }
        });
    } else {
        toggleWrap.appendChild(createEmptySvg());
    }
    row.appendChild(toggleWrap);

    /* ---------- checkbox / button ---------- */
    const isLeaf = !hasChildren;
    const shouldHaveCheckbox =
        render_mode === 'checkbox' &&
        (global_config.checkbox_mode === 'all' ||
            (global_config.checkbox_mode === 'leaf' && isLeaf));

    const setLang = (el, val) => {
        if (global_config.use_data_lang_key && el) el.setAttribute('data-lang-key', val);
    };

    if (shouldHaveCheckbox) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.setAttribute('data-indeterminate', 'false');
        cb.style.margin = '0 10px 0 5px';
        row.appendChild(cb);

        cb.addEventListener('change', (e) => {
            handle_checkbox_change(e, global_config.max_recursion_depth);

            /* kansioiden “täysin valittu” -status */
            const currentNode = e.target.closest('.node');
            const childCont = currentNode.querySelector('.children');
            const isFolder = !!childCont;

            if (isFolder) {
                if (cb.checked && !cb.indeterminate) currentNode.setAttribute('data-folder-fully-selected', 'true');
                else currentNode.removeAttribute('data-folder-fully-selected');
            } else {
                /* nollaa ylös päin */
                let anc = currentNode.parentElement?.closest('.node');
                while (anc) {
                    const ancCb = anc.querySelector('input[type="checkbox"]');
                    if (ancCb && anc.getAttribute('data-folder-fully-selected') === 'true') {
                        anc.removeAttribute('data-folder-fully-selected');
                        ancCb.checked = false;
                        ancCb.indeterminate = false;
                        ancCb.setAttribute('data-indeterminate', 'false');
                    }
                    anc = anc.parentElement?.closest('.node');
                }
            }

            const sel = collectSelectedLeafNodesWithFolders(treeContainer);
            document.dispatchEvent(
                new CustomEvent('checkboxSelectionChanged', { detail: { selectedCategories: sel } }),
            );
        });
    } else if (render_mode === 'button' && isLeaf) {
        const btn = document.createElement('button');
        btn.textContent = nodeData.name;
        setLang(btn, nodeData.name);
        btn.style.marginRight = '10px';
        btn.className = 'general_button' + id_suffix;
        btn.addEventListener('click', (evt) => {
            evt.stopPropagation();
            if (typeof global_config.button_action_function === 'function') {
                global_config.button_action_function(nodeData);
            } else console.log('klikattiin nappia:', nodeData.name);
        });
        row.appendChild(btn);
    }

    /* ---------- mahdollinen kansio-ikoni ---------- */
    if (global_config.use_icons) {
        const iconW = document.createElement('div');
        iconW.classList.add('icon');
        iconW.appendChild(createSvgIcon());
        row.appendChild(iconW);
    }

    /* ---------- otsikko + lasten määrä ---------- */
    if (!(render_mode === 'button' && isLeaf)) {
        const labelWrap = document.createElement('span');
        const label = document.createElement('span');
        label.textContent = nodeData.name;
        setLang(label, nodeData.name);
        labelWrap.appendChild(label);

        if (global_config.show_node_count && hasChildren) {
            const c = document.createElement('span');
            c.className = 'node-count';
            c.style.cssText = 'margin-left:5px;font-size:0.9em;color:#666;';
            labelWrap.appendChild(c);
        }
        row.appendChild(labelWrap);
    }

    nodeEl.appendChild(row);

    /* ---------- klikkaus koko riviltä ---------- */
    row.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (
            ev.target.closest('.toggle') ||
            ['input', 'button'].includes(ev.target.tagName.toLowerCase())
        )
            return;

        const childC = nodeEl.querySelector('.children');
        if (childC) {
            toggleWrap.classList.toggle('rotated');
            toggleChildrenVisibility(childC);
        }

        if (render_mode === 'checkbox') {
            const cb = row.querySelector('input[type="checkbox"]');
            if (cb) {
                cb.indeterminate ? (cb.indeterminate = false) : (cb.checked = !cb.checked);
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });

    /* ---------- rekursio ---------- */
    if (hasChildren) {
        const childC = document.createElement('div');
        childC.className = 'children';
        childC.style.cssText = 'overflow:hidden;display:none;';

        nodeData.children.forEach((cd) => childC.appendChild(createTreeNode(cd, level + 1, ctx)));
        nodeEl.appendChild(childC);

        if (level < global_config.initial_open_level) nodes_to_open.push(nodeEl);
    }

    return nodeEl;
}