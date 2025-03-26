// lang.js

// Globaalisti tallennetaan englanninkieliset käännökset
let defaultTranslations = {};

// Näytetäänkö debug-viestejä konsolissa
var debug = false;

/**
 * Kääntää sivun valitun kielen mukaisesti.
 * Lukee käännökset /api/translations?lang=xxx -endpointista.
 */
export function translatePage(chosen_language) {
    document.documentElement.setAttribute('lang', chosen_language);

    // Jos valittu kieli ei ole englanti, haetaan englanninkieliset käännökset fallbackia varten.
    if (chosen_language !== 'en') {
        fetch(`/api/translations?lang=en`)
            .then(response => response.ok ? response.json() : {})
            .then(data => {
                defaultTranslations = data;
                if (debug) console.log("Default English translations loaded", defaultTranslations);
            })
            .catch(error => {
                console.error("Error fetching default English translations:", error);
                defaultTranslations = {};
            });
    }

    // Haetaan valitun kielen käännökset
    fetch(`/api/translations?lang=${chosen_language}`)
        .then(response => {
            if (!response.ok) {
                if (response.status === 404) {
                    console.log("Translations not found for language:", chosen_language);
                    var fallbackLang = 'en';
                    if (chosen_language !== fallbackLang) {
                        // Kutsutaan uudestaan englanninkielisenä
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
    // Haetaan ensin käännös data-lang-key:n perusteella
    let finalTranslation = getTranslation(
        one_element.getAttribute('data-lang-key'),
        translation_data,
        chosen_language,
        missing_keys
    );

    // Jos data-lang-key ei tuottanut mitään (tai toi itse avaimen),
    // ja elementillä on data-lang-key-fallback, koitetaan sitä samoilla säännöillä
    if (
        finalTranslation === one_element.getAttribute('data-lang-key') 
        && one_element.hasAttribute('data-lang-key-fallback')
    ) {
        let fallbackKey = one_element.getAttribute('data-lang-key-fallback');
        let fallbackTranslation = getTranslation(fallbackKey, translation_data, chosen_language, missing_keys);
        if (fallbackTranslation !== fallbackKey) {
            finalTranslation = fallbackTranslation;
        }
    }

    // Päivitetään elementin sisältö sen tyypin mukaisesti
    if (one_element.tagName.toLowerCase() === 'input') {
        if (one_element.hasAttribute('placeholder')) {
            one_element.setAttribute('placeholder', finalTranslation);
            if (debug) console.log("input placeholder:", finalTranslation);
        } else if (one_element.getAttribute('type') === 'submit') {
            one_element.setAttribute('value', finalTranslation);
            if (debug) console.log("input submit:", finalTranslation);
        }
    } else if (
        one_element.tagName.toLowerCase() === 'option' ||
        one_element.querySelector('span') ||
        one_element.querySelector('i')
    ) {
        one_element.lastChild.textContent = finalTranslation;
        if (debug) console.log("option/span/i:", finalTranslation);
    } else {
        one_element.textContent = finalTranslation; 
        if (debug) console.log("general element:", finalTranslation);
    }
}

/**
 * Yrittää hakea annettua avainta translation_data:sta.
 * Jos ei löydy, tarkistaa defaultTranslations.
 * Jos vieläkään ei löydy, palauttaa avaimen sellaisenaan.
 */
function getTranslation(translationKey, translation_data, chosen_language, missing_keys) {
    if (!translationKey) return "";

    // Jaetaan avain mahdollisessa plus-merkin kohdalla (esim. "manage_table+dev_dating_profiles")
    let splitted_key = translationKey.split('+');
    let base_key = splitted_key[0];
    let variable_part = splitted_key[1] || null;

    // Etsitään käännös valitulla kielellä
    let one_translation = translation_data[base_key];

    // Jos käännöstä ei löydy, yritetään fallback englanninkielisistä käännöksistä
    if (!one_translation && defaultTranslations && defaultTranslations[base_key]) {
        one_translation = defaultTranslations[base_key];
        if (debug) console.log("Using fallback English translation for key:", base_key, one_translation);
    }

    // Jos käännöstä ei vieläkään löydy, palautetaan avain
    if (!one_translation) {
        if (missing_keys) {
            missing_keys.push(base_key);
        }
        return translationKey; 
    }

    // Korvataan mahdolliset muuttujat, esim. $table_name
    if (variable_part) {
        one_translation = one_translation.replace('$table_name', variable_part);
    }

    return one_translation;
}
