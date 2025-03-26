// vanilla_tree.js

import { handle_checkbox_change, collect_checkbox_states, apply_checkbox_states } from './checkbox_logic.js';
import { wait_until_appears } from '../wait_until_appears.js';

// Päivitetään vanhempien konttien korkeuksia – animaatioita ei enää käytetä, joten tämä funktio ei tee mitään
function update_ancestor_container_heights() {
    // Animaatiota ei tarvita, joten ei tehdä mitään
}

// Apufunktio: Hakee kaikki leaf-nodet annetun nodeElementin alta
function getAllDescendantLeaves(nodeElement) {
    const leaves = [];
    const allNodes = nodeElement.querySelectorAll('.node');
    allNodes.forEach(childNode => {
        const childrenContainer = childNode.querySelector('.children');
        if (!childrenContainer || childrenContainer.children.length === 0) {
            leaves.push(childNode.id);
        }
    });
    return leaves;
}

// Apufunktio: Kerää kaikki puusta valitut leaf-solmut.
// Jos kansio (folder) on "täysin valittu" (data-folder-fully-selected),
// se lisätään ikään kuin sen lapset olisi valittu.
function collectSelectedLeafNodesWithFolders(container) {
    const selectedLeaves = [];

    // Käydään läpi kaikki solmut ja lisätään kansiot, jotka ovat täysin valittuja
    const allNodes = container.querySelectorAll('.node');
    allNodes.forEach(node => {
        const checkbox = node.querySelector('input[type="checkbox"]');
        if (checkbox) {
            const childrenContainer = node.querySelector('.children');
            const isFolder = !!childrenContainer;
            const isFullySelectedFolder = isFolder &&
                checkbox.checked &&
                !checkbox.indeterminate &&
                node.getAttribute('data-folder-fully-selected') === 'true';
            if (isFullySelectedFolder) {
                const allDescendantLeaves = getAllDescendantLeaves(node);
                allDescendantLeaves.forEach(leafNodeId => {
                    if (!selectedLeaves.includes(leafNodeId)) {
                        selectedLeaves.push(leafNodeId);
                    }
                });
            }
        }
    });

    // Lisäksi lisätään kaikki yksittäin valitut leaf-solmut
    const checkedCheckboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    checkedCheckboxes.forEach(checkbox => {
        const nodeElement = checkbox.closest('.node');
        if (nodeElement) {
            const childrenContainer = nodeElement.querySelector('.children');
            if (!childrenContainer || childrenContainer.children.length === 0) {
                if (!selectedLeaves.includes(nodeElement.id)) {
                    selectedLeaves.push(nodeElement.id);
                }
            }
        }
    });

    return selectedLeaves;
}

// Apufunktiot SVG-elementtien luomiseen
function createSvgIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M 22 18 V 10 a 2 2 0 0 0 -2 -2 h -7 c -2 0 -1 -2 -3 -2 H 4 a 2 2 0 0 0 -2 2 v 10 a 2 2 0 0 0 2 2 h 16 a 2 2 0 0 0 2 -2 z");
    svg.appendChild(path);
    return svg;
}

function createSvgToggle() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("toggle");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", "12 6, 18 12, 12 18");
    svg.appendChild(polyline);
    return svg;
}

function createEmptySvg() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("toggle-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "none");
    svg.setAttribute("stroke-width", "0");
    return svg;
}

/**
 * render_tree(data, config):
 *  - data: puun data (flat tai hierarchical)
 *  - config: mm. container_id, render_mode, ym.
 */
export async function render_tree(data, config) {
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
        show_node_count: config.show_node_count || true,
        show_search: config.show_search || true,
        title_text: config.title_text || '',
        button_action_function: config.button_action_function || null,
        use_data_lang_key: config.use_data_lang_key || true
    };

    const render_mode = global_config.render_mode;
    const container_id = global_config.container_id;
    const id_suffix = global_config.id_suffix;
    const search_input_id = 'tree_search' + id_suffix;

    let checkbox_states = {};
    let nodes_to_open = [];

    // LocalStorage-logiikka auki olevien solmujen tallentamiseen
    function getExpandedNodeKey() {
        return 'expanded_nodes' + id_suffix;
    }

    function loadExpandedNodes() {
        const lsKey = getExpandedNodeKey();
        try {
            const rawData = localStorage.getItem(lsKey);
            return rawData ? JSON.parse(rawData) : [];
        } catch (e) {
            console.log(e);
            return [];
        }
    }

    function saveExpandedNodes(expandedList) {
        const lsKey = getExpandedNodeKey();
        localStorage.setItem(lsKey, JSON.stringify(expandedList));
    }

    function getContainer() {
        return document.getElementById(container_id);
    }

    function createStructure() {
        const rootContainer = getContainer();
        if (!rootContainer) return null;

        rootContainer.replaceChildren();

        if (global_config.title_text) {
            const titleElem = document.createElement('h2');
            titleElem.textContent = global_config.title_text;
            rootContainer.appendChild(titleElem);
        }

        let searchInput = null;
        if (global_config.show_search) {
            searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.id = search_input_id;
            searchInput.placeholder = 'Haku...';
            rootContainer.appendChild(searchInput);
        }

        const treeDiv = document.createElement('div');
        treeDiv.id = 'vanillaTree' + id_suffix;
        treeDiv.className = 'tree-container';
        rootContainer.appendChild(treeDiv);

        return {
            searchInput,
            treeContainer: treeDiv
        };
    }

    function getTreeContainer() {
        return document.getElementById('vanillaTree' + id_suffix);
    }

    function getSearchInput() {
        return document.getElementById(search_input_id) || null;
    }

    function createNode(nodeData, level = 0) {
        const treeContainer = getTreeContainer();
        if (!treeContainer) {
            return document.createElement('div');
        }

        const node_element = document.createElement('div');
        node_element.className = 'node';
        node_element.id = "tree_node_" + nodeData.id + id_suffix;

        node_element.setAttribute('data-db-id', nodeData.db_id);
        const has_children = Array.isArray(nodeData.children) && nodeData.children.length > 0;
        node_element.setAttribute('data-is-folder', has_children ? 'true' : 'false');
        node_element.setAttribute('data-node-id', nodeData.id);
        node_element.style.userSelect = 'none';

        const row_element = document.createElement('div');
        row_element.className = 'node-row';
        row_element.style.userSelect = 'none';

        const toggle_element = document.createElement('div');
        toggle_element.classList.add('toggle');

        if (has_children) {
            const svgToggle = createSvgToggle();
            toggle_element.appendChild(svgToggle);
            toggle_element.addEventListener('click', function (event) {
                event.stopPropagation();
                const children_container = node_element.querySelector('.children');
                if (children_container) {
                    this.classList.toggle('rotated');
                    toggleChildrenVisibility(children_container);
                }
            });
        } else {
            const emptySvg = createEmptySvg();
            toggle_element.appendChild(emptySvg);
        }
        row_element.appendChild(toggle_element);

        const is_leaf = !has_children;
        const should_include_checkbox =
            (render_mode === 'checkbox') &&
            ((global_config.checkbox_mode === 'all') ||
             (global_config.checkbox_mode === 'leaf' && is_leaf));

        let checkbox;
        let button_element;

        function setDataLangKeyAttrib(elem, val) {
            if (global_config.use_data_lang_key && elem) {
                elem.setAttribute('data-lang-key', val);
            }
        }

        if (render_mode === 'checkbox' && should_include_checkbox) {
            checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.marginRight = '10px';
            checkbox.style.marginLeft = '5px';
            checkbox.setAttribute('data-indeterminate', 'false');
            row_element.appendChild(checkbox);

            checkbox.addEventListener('change', (e) => {
                handle_checkbox_change(e, global_config.max_recursion_depth);

                const current_node = e.target.closest('.node');
                const possible_children_container = current_node.querySelector('.children');
                const isFolder = !!possible_children_container;

                if (isFolder) {
                    if (checkbox.checked && !checkbox.indeterminate) {
                        current_node.setAttribute('data-folder-fully-selected', 'true');
                    } else {
                        current_node.removeAttribute('data-folder-fully-selected');
                    }
                } else {
                    let ancestor_folder = current_node.parentElement?.closest('.node');
                    while (ancestor_folder) {
                        const ancestor_checkbox = ancestor_folder.querySelector('input[type="checkbox"]');
                        if (ancestor_checkbox && ancestor_folder.getAttribute('data-folder-fully-selected') === 'true') {
                            ancestor_folder.removeAttribute('data-folder-fully-selected');
                            ancestor_checkbox.checked = false;
                            ancestor_checkbox.indeterminate = false;
                            ancestor_checkbox.setAttribute('data-indeterminate', 'false');
                        }
                        ancestor_folder = ancestor_folder.parentElement?.closest('.node');
                    }
                }

                const selected_node_ids = collectSelectedLeafNodesWithFolders(getTreeContainer());
                const custom_event = new CustomEvent('checkboxSelectionChanged', { detail: { selectedCategories: selected_node_ids } });
                document.dispatchEvent(custom_event);
            });
        } else if (render_mode === 'button' && is_leaf) {
            button_element = document.createElement('button');
            button_element.textContent = nodeData.name;
            setDataLangKeyAttrib(button_element, nodeData.name);
            button_element.style.marginRight = '10px';
            button_element.className = 'general_button' + id_suffix;

            button_element.addEventListener('click', function (evt) {
                evt.stopPropagation();
                if (typeof global_config.button_action_function === 'function') {
                    global_config.button_action_function(nodeData);
                } else {
                    console.log("klikattiin nappia:", nodeData.name);
                }
            });
            row_element.appendChild(button_element);
        }

        if (global_config.use_icons) {
            const icon_element = document.createElement('div');
            const svgIcon = createSvgIcon();
            icon_element.appendChild(svgIcon);
            icon_element.classList.add('icon');
            row_element.appendChild(icon_element);
        }

        if (!(render_mode === 'button' && is_leaf)) {
            const label_container = document.createElement('span');
            label_container.style.userSelect = 'none';

            const label_span_element = document.createElement('span');
            label_span_element.textContent = nodeData.name;
            setDataLangKeyAttrib(label_span_element, nodeData.name);
            label_container.appendChild(label_span_element);

            if (global_config.show_node_count && has_children) {
                const count_span_element = document.createElement('span');
                count_span_element.className = 'node-count';
                count_span_element.style.marginLeft = '5px';
                count_span_element.style.fontSize = '0.9em';
                count_span_element.style.color = '#666';
                label_container.appendChild(count_span_element);
            }
            row_element.appendChild(label_container);
        }

        node_element.appendChild(row_element);

        row_element.addEventListener('click', function (event) {
            event.stopPropagation();
            if (
                event.target.closest('.toggle') ||
                event.target.tagName.toLowerCase() === 'input' ||
                event.target.tagName.toLowerCase() === 'button'
            ) {
                return;
            }

            const children_container = node_element.querySelector('.children');
            if (children_container) {
                const toggle_icon = row_element.querySelector('.toggle');
                if (toggle_icon) {
                    toggle_icon.classList.toggle('rotated');
                }
                toggleChildrenVisibility(children_container);
            }

            if (render_mode === 'checkbox') {
                const cb = row_element.querySelector('input[type="checkbox"]');
                if (cb) {
                    if (cb.indeterminate) {
                        cb.indeterminate = false;
                        cb.checked = true;
                    } else {
                        cb.checked = !cb.checked;
                    }
                    const change_evt = new Event('change', { bubbles: true });
                    cb.dispatchEvent(change_evt);
                }
            }
        });

        if (has_children) {
            const children_container = document.createElement('div');
            children_container.className = 'children';
            children_container.style.overflow = 'hidden';
            children_container.style.display = 'none';

            nodeData.children.forEach(child_data => {
                const child_node = createNode(child_data, level + 1);
                children_container.appendChild(child_node);
            });

            node_element.appendChild(children_container);

            if (level < global_config.initial_open_level) {
                nodes_to_open.push(node_element);
            }
        }

        return node_element;
    }

    // Uusi openChildren, jossa ei käytetä animaatiota
    function openChildren(nodeElement) {
        const container = nodeElement.querySelector('.children');
        if (!container) return;

        container.style.display = 'block';
        container.style.transition = '';
        container.style.maxHeight = 'none';

        update_ancestor_container_heights(nodeElement);

        const expandedNodes = loadExpandedNodes();
        if (!expandedNodes.includes(nodeElement.id)) {
            expandedNodes.push(nodeElement.id);
            saveExpandedNodes(expandedNodes);
        }
    }

    // Uusi closeChildren, jossa ei käytetä animaatiota
    function closeChildren(nodeElement) {
        const container = nodeElement.querySelector('.children');
        if (!container) return;

        container.style.display = 'none';
        container.style.transition = '';
        container.style.maxHeight = '0';

        const expandedNodes = loadExpandedNodes();
        const index = expandedNodes.indexOf(nodeElement.id);
        if (index !== -1) {
            expandedNodes.splice(index, 1);
            saveExpandedNodes(expandedNodes);
        }

        update_ancestor_container_heights(nodeElement);
    }

    function toggleChildrenVisibility(container) {
        const nodeElement = container.closest('.node');
        if (!nodeElement) return;

        if (container.style.display === 'none' || container.style.display === '') {
            openChildren(nodeElement);
        } else {
            closeChildren(nodeElement);
        }
    }

    function updateCheckbox_states() {
        checkbox_states = collect_checkbox_states(getTreeContainer());
    }

    function restoreCheckbox_states() {
        apply_checkbox_states(checkbox_states, getTreeContainer());
    }

    function filterTreeNodes(searchTerm) {
        const tc = getTreeContainer();
        if (!tc) return;
        const nodes = tc.querySelectorAll('.node');
        nodes.forEach(node => {
            let textElem = node.querySelector('span, button');
            const text = textElem ? textElem.textContent.toLowerCase() : '';
            if (text.includes(searchTerm.toLowerCase())) {
                node.classList.remove('hidden');
                let parent = node.parentElement.closest('.node');
                while (parent) {
                    parent.classList.remove('hidden');
                    const childrenContainer = parent.querySelector('.children');
                    if (childrenContainer && (childrenContainer.style.display === 'none' || childrenContainer.style.display === '')) {
                        openChildren(parent);
                        const toggleIcon = parent.querySelector('.toggle');
                        if (toggleIcon) {
                            toggleIcon.classList.add('rotated');
                        }
                    }
                    parent = parent.parentElement ? parent.parentElement.closest('.node') : null;
                }
            } else {
                node.classList.add('hidden');
            }
        });
    }

    function updateFolderCounts() {
        if (!global_config.show_node_count) return;

        const tc = getTreeContainer();
        if (!tc) return;

        function countVisibleLeafDescendants(nodeElem) {
            const childrenContainer = nodeElem.querySelector(':scope > .children');
            const isHidden = nodeElem.classList.contains('hidden');
            if (!childrenContainer) {
                return isHidden ? 0 : 1;
            }
            let count = 0;
            const childNodes = childrenContainer.querySelectorAll(':scope > .node');
            childNodes.forEach(child => {
                count += countVisibleLeafDescendants(child);
            });
            return count;
        }

        const folders = tc.querySelectorAll('.node > .children');
        folders.forEach(folderContainer => {
            const parentNode = folderContainer.parentElement;
            const nodeCountSpan = parentNode.querySelector('.node-count');
            if (!nodeCountSpan) {
                return;
            }
            const leafCount = countVisibleLeafDescendants(parentNode);
            nodeCountSpan.textContent = `(${leafCount})`;
        });
    }

    async function render(data) {
        await wait_until_appears('#' + container_id);

        const { treeContainer } = createStructure();
        if (!treeContainer) return;
        treeContainer.replaceChildren();

        if (global_config.tree_model === 'flat') {
            const hierarchicalData = buildTree(data);
            hierarchicalData.forEach(rootNodeData => {
                const rootNode = createNode(rootNodeData, 0);
                treeContainer.appendChild(rootNode);
            });
        } else {
            const rootNode = createNode(data, 0);
            treeContainer.appendChild(rootNode);
        }

        restoreCheckbox_states();

        setTimeout(() => {
            nodes_to_open.forEach(nodeElement => {
                openChildren(nodeElement);
                const toggleIcon = nodeElement.querySelector('.toggle');
                if (toggleIcon) {
                    toggleIcon.classList.add('rotated');
                }
            });

            const storedExpandedNodes = loadExpandedNodes();
            storedExpandedNodes.forEach(nodeId => {
                const nodeElem = document.getElementById(nodeId);
                if (!nodeElem) return;
                let ancestor = nodeElem.parentElement ? nodeElem.parentElement.closest('.node') : null;
                let allAncestorsExpanded = true;
                while (ancestor) {
                    if (!storedExpandedNodes.includes(ancestor.id)) {
                        allAncestorsExpanded = false;
                        break;
                    }
                    ancestor = ancestor.parentElement ? ancestor.parentElement.closest('.node') : null;
                }
                if (!allAncestorsExpanded) return;
                openChildren(nodeElem);
                const toggleIcon = nodeElem.querySelector('.toggle');
                if (toggleIcon) {
                    toggleIcon.classList.add('rotated');
                }
            });

            updateFolderCounts();
        }, 0);

        const actualSearchInput = getSearchInput();
        if (actualSearchInput) {
            actualSearchInput.addEventListener('input', function () {
                updateCheckbox_states();
                filterTreeNodes(this.value);
                const selectedNodeIds = collectSelectedLeafNodesWithFolders(treeContainer);
                console.log('Valitut solmut: ' + selectedNodeIds.join(', '));
                const event = new CustomEvent('checkboxSelectionChanged', { detail: { selectedCategories: selectedNodeIds } });
                document.dispatchEvent(event);
                updateFolderCounts();
            });
        }
    }

    updateCheckbox_states();
    await render(data);
}

// Apufunktio data-rakenteen muuntamiseen hierarkiaksi, jos data on "flat"
function buildTree(flatData) {
    const nodes = {};
    const roots = [];

    flatData.forEach(node => {
        nodes[node.id] = { ...node, children: [] };
    });

    flatData.forEach(node => {
        const n = nodes[node.id];
        if (node.parent_id === null || node.parent_id === 'null') {
            roots.push(n);
        } else {
            if (nodes[node.parent_id]) {
                nodes[node.parent_id].children.push(n);
            }
        }
    });

    return roots;
}