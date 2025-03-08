// utilities.js

export function getOrCreateContainer(containerId) {
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.classList.add('content_div');
        document.getElementById('tabs_container').appendChild(container);
    }
    return container;
}

/**
 * Yleinen funktio, joka hoitaa:
 * 1) Säiliön luonnin/hakemisen
 * 2) .management_forms -divin luonnin/hakemisen
 * 3) Sisällön luomisen vain kerran
 *
 * @param {string} containerId  - Divin id, esim. "foreign_keys_container"
 * @param {Function} generateFn - Funktio (async tai sync), joka generoi varsinainen sisällön
 */
export async function loadManagementView(containerId, generateFn) {
    // 1. Hae tai luo .content_div + .management_forms -elementit
    const management_div = getOrCreateManagementFormsContainer(containerId);

    // 2. Ladataan sisältö vain jos management_div on tyhjä
    if (!management_div.hasChildNodes()) {
        await generateFn(management_div);
    }
}

export function getOrCreateManagementFormsContainer(containerId) {
    // Hae tai luo content_div-luokan container
    let main_container = document.getElementById(containerId);
    if (!main_container) {
        main_container = document.createElement('div');
        main_container.id = containerId;
        main_container.classList.add('content_div');
        document.getElementById('tabs_container').appendChild(main_container);
    }
    // Etsi / luo .management_forms-luokan div
    let management_div = main_container.querySelector('.management_forms');
    if (!management_div) {
        management_div = document.createElement('div');
        management_div.classList.add('management_forms');
        main_container.appendChild(management_div);
    }

    return management_div;
}


export function extract_id_from_text(text) {
    // Assume text is in the format "id (name)" or just "id"
    const match = text.match(/^(\d+)/);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}
