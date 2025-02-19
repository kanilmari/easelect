// lang.js
// Exportataan (tai tuodaan globaaliksi) translatePage-funktio, 
// jotta lang_panel.js voi kutsua sitä.

var debug = false; // Näytäkö debug-viestejä konsolissa

/**
 * Kääntää sivun valitun kielen mukaisesti.
 * Lukee käännökset /api/translations?lang=xxx -endpointista.
 */
export function translatePage(chosen_language) {
    document.documentElement.setAttribute('lang', chosen_language);

    fetch(`/api/translations?lang=${chosen_language}`)
        .then(response => {
            if (!response.ok) {
                if (response.status === 404) {
                    console.log("Translations not found for language:", chosen_language);
                    var fallbackLang = 'en';
                    if (chosen_language !== fallbackLang) {
                        translatePage(fallbackLang);
                    } else {
                        throw new Error("Fallback translations also not found: " + fallbackLang);
                    }
                } else {
                    throw new Error("HTTP error " + response.status);
                }
                return null;
            }
            return response.json();
        })
        .then(data => {
            if (!data) return;
            translateElements(data, chosen_language);

            // Tarkkaillaan DOM-muutoksia, jotta uudet elementit saadaan käännettyä lennossa
            var observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            if (node.hasAttribute('data-lang-key')) {
                                translateElement(node, data, chosen_language);
                            }
                            node.querySelectorAll('[data-lang-key]').forEach(childNode => {
                                translateElement(childNode, data, chosen_language);
                            });
                        }
                    });
                    if (mutation.type === 'attributes' && mutation.attributeName === 'data-lang-key') {
                        translateElement(mutation.target, data, chosen_language);
                    }
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-lang-key']
            });
        })
        .catch(function (error) {
            console.error('Fetch Error:', error);
        });
}

/**
 * Käy läpi kaikki data-lang-key-elementit ja kääntää ne.
 */
function translateElements(translation_data, chosen_language) {
    var all_lang_elements = document.querySelectorAll('[data-lang-key]');
    var missing_keys = [];

    all_lang_elements.forEach(function (one_element) {
        translateElement(one_element, translation_data, chosen_language, missing_keys);
    });

    if (missing_keys.length > 0) {
        console.log("Warning: Missing data-lang-keys:", missing_keys);
    }
}

/**
 * Kääntää yhden elementin annetun translation_data:n perusteella.
 * Tukee placeholderien, submit-valuejen ym. asettamista.
 */
function translateElement(one_element, translation_data, chosen_language, missing_keys) {
    var translation_key = one_element.getAttribute('data-lang-key');

    // Tarkistetaan, onko avaimessa plus-merkkiä (esim. "manage_table+dev_dating_profiles")
    // jolloin baseKey = "manage_table" ja variablePart = "dev_dating_profiles"
    var splitted_key = translation_key.split('+');
    var base_key = splitted_key[0];
    var variable_part = splitted_key[1] || null;

    var one_translation = translation_data[base_key];
    if (one_translation) {
        if (variable_part) {
            one_translation = one_translation.replace('$table_name', variable_part);
        }

        if (one_element.tagName.toLowerCase() === 'input') {
            if (one_element.hasAttribute('placeholder')) {
                one_element.setAttribute('placeholder', one_translation);
                if (debug) console.log("input placeholder:", one_translation);
            } else if (one_element.getAttribute('type') === 'submit') {
                one_element.setAttribute('value', one_translation);
                if (debug) console.log("input submit:", one_translation);
            }
        } else if (
            one_element.tagName.toLowerCase() === 'option' ||
            one_element.querySelector('span') ||
            one_element.querySelector('i')
        ) {
            one_element.lastChild.textContent = one_translation;
            if (debug) console.log("option/span/i:", one_translation);
        } else {
            one_element.innerHTML = one_translation;
            if (debug) console.log("general element:", one_translation);
        }
    } else {
        if (missing_keys) {
            missing_keys.push(base_key);
        }
    }
}
