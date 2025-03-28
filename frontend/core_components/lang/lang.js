// lang.js

// Globaalisti tallennetaan englanninkieliset käännökset
let defaultTranslations = {};

// Näytetäänkö debug-viestejä konsolissa
var debug = false;

// Pidämme kirjaa kaikista puuttuvista avaimista, myös DOM-muutoksissa
let globalMissingKeys = [];

// Tallennetaan viimeisin ladattu käännössanakirja ja kieli laajempaan scopeen
let currentTranslations = {};
let currentChosenLang = "";

/**
 * Kääntää sivun valitun kielen mukaisesti.
 * Lukee käännökset /api/translations?lang=xxx -endpointista.
 */
export async function translatePage(chosen_language) {
    // Asetetaan html-tagille lang-attribuutti
    document.documentElement.setAttribute('lang', chosen_language);
    currentChosenLang = chosen_language;

    // Jos valittu kieli ei ole englanti, haetaan englanninkieliset käännökset fallbackia varten.
    if (chosen_language !== 'en') {
        try {
            const response = await fetch(`/api/translations?lang=en`);
            if (response.ok) {
                defaultTranslations = await response.json();
                if (debug) console.log("Default English translations loaded", defaultTranslations);
            } else {
                console.log("Translations not found for language: en");
                defaultTranslations = {};
            }
        } catch (error) {
            console.error("Error fetching default English translations:", error);
            defaultTranslations = {};
        }
    }

    // Haetaan varsinaiset käännökset valitulla kielellä
    try {
        const response = await fetch(`/api/translations?lang=${chosen_language}`);
        if (!response.ok) {
            if (response.status === 404) {
                console.log("Translations not found for language:", chosen_language);
                const fallbackLang = 'en';
                if (chosen_language !== fallbackLang) {
                    // Kutsutaan uudestaan englanninkielisenä
                    await translatePage(fallbackLang);
                } else {
                    throw new Error("Fallback translations also not found: " + fallbackLang);
                }
                return; // Palataan pois, koska käännöksiä ei löydy
            } else {
                throw new Error("HTTP error " + response.status);
            }
        }

        currentTranslations = await response.json();

        // Tyhjennetään globaalien puuttuvien avainten lista, koska aloitamme "puhtaalta pöydältä"
        globalMissingKeys = [];

        // Käännetään olemassa oleva DOM
        translateElements(currentTranslations, chosen_language);

        // Käynnistetään DOM-muutoskuuntelija
        observeDomChanges();
    } catch (error) {
        console.error('Fetch Error:', error);
    }
}

/**
 * Tarkkailee DOM-muutoksia, jotta uudet/lisätyt elementit saadaan käännettyä lennossa.
 * Samalla kerää globaalit puuttuvat avaimet (globalMissingKeys) ja tekee tarvittaessa AI-hakuja.
 */
function observeDomChanges() {
    const observer = new MutationObserver(mutations => {
        // Pidetään listaa lisätyistä nodelista
        let freshlyAddedNodes = [];

        mutations.forEach(mutation => {
            // Lisätyt solmut
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // elementti
                    freshlyAddedNodes.push(node);
                    node.querySelectorAll('[data-lang-key]').forEach(childNode => {
                        freshlyAddedNodes.push(childNode);
                    });
                }
            });

            // data-lang-key -attribuutin muutokset
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-lang-key') {
                freshlyAddedNodes.push(mutation.target);
            }
        });

        // Käännetään nyt kertyneet uudet solmut
        if (freshlyAddedNodes.length > 0) {
            freshlyAddedNodes.forEach(node => {
                translateElement(node, currentTranslations, currentChosenLang, globalMissingKeys);
            });

            // Jos tuli uusia puuttuvia avaimia, yritetään hakea niille käännökset
            if (globalMissingKeys.length > 0) {
                // Poistetaan duplikaatit
                const uniqueMissing = [...new Set(globalMissingKeys)];
                globalMissingKeys = []; // Tyhjennetään tämä, AI-haku palauttaa ratkaisut
                console.log('Haetaan puuttuvia käännöksiä:', uniqueMissing);
                fetch('/api/generateTranslations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        missing_keys: uniqueMissing,
                        chosen_language: currentChosenLang
                    })
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error("HTTP error " + response.status);
                    }
                    return response.json();
                })
                .then(aiTranslations => {
                    // Sulautetaan uudet avaimet nykyiseen käännössanakirjaan
                    Object.keys(aiTranslations).forEach(key => {
                        currentTranslations[key] = aiTranslations[key];
                    });

                    // Käännetään äsken lisätyt solmut uudestaan, nyt uusilla käännöksillä
                    freshlyAddedNodes.forEach(node => {
                        translateElement(node, currentTranslations, currentChosenLang);
                    });
                })
                .catch(error => {
                    console.error("Error fetching AI translations:", error);
                });
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-lang-key']
    });
}

/**
 * Käy läpi kaikki data-lang-key-elementit ja kääntää ne.
 * Jos avaimia puuttuu, pyytää AI-käännöksiä Go-reitiltä /api/generateTranslations (kutsun jälkeen).
 */
function translateElements(translation_data, chosen_language) {
    var all_lang_elements = document.querySelectorAll('[data-lang-key]');
    var missing_keys_local = [];

    all_lang_elements.forEach(function (one_element) {
        translateElement(one_element, translation_data, chosen_language, missing_keys_local);
    });

    if (missing_keys_local.length > 0) {
        console.log("Warning: Missing data-lang-keys:", missing_keys_local);

        // Lisätään puuttuvat globaaliin listaan, observer hoitaa AI-haun seuraavassa vaiheessa
        globalMissingKeys.push(...missing_keys_local);
    }
}

/**
 * Kääntää yhden elementin annetun translation_data:n perusteella.
 * Tukee placeholderien, submit-valuejen ym. asettamista.
 */
function translateElement(one_element, translation_data, chosen_language, missing_keys) {
    if (!one_element.hasAttribute('data-lang-key')) {
        return; // Ei ole käännettävä elementti
    }

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
        // Option-, span- tai i-sisällöt: laitetaan teksti lastChildiin
        if (one_element.lastChild) {
            one_element.lastChild.textContent = finalTranslation;
        } else {
            // Jos jostain syystä ei ole lastChildia, luodaan sellainen
            one_element.textContent = finalTranslation;
        }
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

// // lang.js

// // Globaalisti tallennetaan englanninkieliset käännökset
// let defaultTranslations = {};

// // Näytetäänkö debug-viestejä konsolissa
// var debug = false;

// /**
//  * Kääntää sivun valitun kielen mukaisesti.
//  * Lukee käännökset /api/translations?lang=xxx -endpointista.
//  */
// export function translatePage(chosen_language) {
//     document.documentElement.setAttribute('lang', chosen_language);

//     // Jos valittu kieli ei ole englanti, haetaan englanninkieliset käännökset fallbackia varten.
//     if (chosen_language !== 'en') {
//         fetch(`/api/translations?lang=en`)
//             .then(response => response.ok ? response.json() : {})
//             .then(data => {
//                 defaultTranslations = data;
//                 if (debug) console.log("Default English translations loaded", defaultTranslations);
//             })
//             .catch(error => {
//                 console.error("Error fetching default English translations:", error);
//                 defaultTranslations = {};
//             });
//     }

//     // Haetaan valitun kielen käännökset
//     fetch(`/api/translations?lang=${chosen_language}`)
//         .then(response => {
//             if (!response.ok) {
//                 if (response.status === 404) {
//                     console.log("Translations not found for language:", chosen_language);
//                     var fallbackLang = 'en';
//                     if (chosen_language !== fallbackLang) {
//                         // Kutsutaan uudestaan englanninkielisenä
//                         translatePage(fallbackLang);
//                     } else {
//                         throw new Error("Fallback translations also not found: " + fallbackLang);
//                     }
//                 } else {
//                     throw new Error("HTTP error " + response.status);
//                 }
//                 return null;
//             }
//             return response.json();
//         })
//         .then(data => {
//             if (!data) return;
//             translateElements(data, chosen_language);

//             // Tarkkaillaan DOM-muutoksia, jotta uudet elementit saadaan käännettyä lennossa
//             var observer = new MutationObserver(mutations => {
//                 mutations.forEach(mutation => {
//                     mutation.addedNodes.forEach(node => {
//                         if (node.nodeType === 1) {
//                             if (node.hasAttribute('data-lang-key')) {
//                                 translateElement(node, data, chosen_language);
//                             }
//                             node.querySelectorAll('[data-lang-key]').forEach(childNode => {
//                                 translateElement(childNode, data, chosen_language);
//                             });
//                         }
//                     });
//                     if (mutation.type === 'attributes' && mutation.attributeName === 'data-lang-key') {
//                         translateElement(mutation.target, data, chosen_language);
//                     }
//                 });
//             });

//             observer.observe(document.body, {
//                 childList: true,
//                 subtree: true,
//                 attributes: true,
//                 attributeFilter: ['data-lang-key']
//             });
//         })
//         .catch(function (error) {
//             console.error('Fetch Error:', error);
//         });
// }

// /**
//  * Käy läpi kaikki data-lang-key-elementit ja kääntää ne.
//  */
// function translateElements(translation_data, chosen_language) {
//     var all_lang_elements = document.querySelectorAll('[data-lang-key]');
//     var missing_keys = [];

//     all_lang_elements.forEach(function (one_element) {
//         translateElement(one_element, translation_data, chosen_language, missing_keys);
//     });

//     if (missing_keys.length > 0) {
//         console.log("Warning: Missing data-lang-keys:", missing_keys);
//     }
// }

// /**
//  * Kääntää yhden elementin annetun translation_data:n perusteella.
//  * Tukee placeholderien, submit-valuejen ym. asettamista.
//  */
// function translateElement(one_element, translation_data, chosen_language, missing_keys) {
//     // Haetaan ensin käännös data-lang-key:n perusteella
//     let finalTranslation = getTranslation(
//         one_element.getAttribute('data-lang-key'),
//         translation_data,
//         chosen_language,
//         missing_keys
//     );

//     // Jos data-lang-key ei tuottanut mitään (tai toi itse avaimen),
//     // ja elementillä on data-lang-key-fallback, koitetaan sitä samoilla säännöillä
//     if (
//         finalTranslation === one_element.getAttribute('data-lang-key') 
//         && one_element.hasAttribute('data-lang-key-fallback')
//     ) {
//         let fallbackKey = one_element.getAttribute('data-lang-key-fallback');
//         let fallbackTranslation = getTranslation(fallbackKey, translation_data, chosen_language, missing_keys);
//         if (fallbackTranslation !== fallbackKey) {
//             finalTranslation = fallbackTranslation;
//         }
//     }

//     // Päivitetään elementin sisältö sen tyypin mukaisesti
//     if (one_element.tagName.toLowerCase() === 'input') {
//         if (one_element.hasAttribute('placeholder')) {
//             one_element.setAttribute('placeholder', finalTranslation);
//             if (debug) console.log("input placeholder:", finalTranslation);
//         } else if (one_element.getAttribute('type') === 'submit') {
//             one_element.setAttribute('value', finalTranslation);
//             if (debug) console.log("input submit:", finalTranslation);
//         }
//     } else if (
//         one_element.tagName.toLowerCase() === 'option' ||
//         one_element.querySelector('span') ||
//         one_element.querySelector('i')
//     ) {
//         one_element.lastChild.textContent = finalTranslation;
//         if (debug) console.log("option/span/i:", finalTranslation);
//     } else {
//         one_element.textContent = finalTranslation; 
//         if (debug) console.log("general element:", finalTranslation);
//     }
// }

// /**
//  * Yrittää hakea annettua avainta translation_data:sta.
//  * Jos ei löydy, tarkistaa defaultTranslations.
//  * Jos vieläkään ei löydy, palauttaa avaimen sellaisenaan.
//  */
// function getTranslation(translationKey, translation_data, chosen_language, missing_keys) {
//     if (!translationKey) return "";

//     // Jaetaan avain mahdollisessa plus-merkin kohdalla (esim. "manage_table+dev_dating_profiles")
//     let splitted_key = translationKey.split('+');
//     let base_key = splitted_key[0];
//     let variable_part = splitted_key[1] || null;

//     // Etsitään käännös valitulla kielellä
//     let one_translation = translation_data[base_key];

//     // Jos käännöstä ei löydy, yritetään fallback englanninkielisistä käännöksistä
//     if (!one_translation && defaultTranslations && defaultTranslations[base_key]) {
//         one_translation = defaultTranslations[base_key];
//         if (debug) console.log("Using fallback English translation for key:", base_key, one_translation);
//     }

//     // Jos käännöstä ei vieläkään löydy, palautetaan avain
//     if (!one_translation) {
//         if (missing_keys) {
//             missing_keys.push(base_key);
//         }
//         return translationKey; 
//     }

//     // Korvataan mahdolliset muuttujat, esim. $table_name
//     if (variable_part) {
//         one_translation = one_translation.replace('$table_name', variable_part);
//     }

//     return one_translation;
// }
