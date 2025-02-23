// nav_utils.js

import { load_table } from './load_table.js';

/**
 * Palauttaa customView:n tai "normaalin" taulun loadFunctionin ja containerId:n.
 * @param {string} name - Taulun tai customView’n nimi
 * @param {Array} custom_views - custom_views-taulukko
 */
export function get_load_info(name, custom_views) {
    const custom_view = custom_views.find(view => view.name === name);
    if (custom_view) {
        return {
            loadFunction: custom_view.loadFunction,
            containerId: custom_view.containerId
        };
    } else {
        // Oletus: tavallisen taulun lukufunktio
        return {
            loadFunction: () => load_table(name),
            containerId: `${name}_container`
        };
    }
}