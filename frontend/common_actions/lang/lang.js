// lang.js

// This 'debug' variable controls whether debug messages are shown in the console.
// If set to true, the console will display detailed messages about the translation process.
var debug = false; // Show debug information in the console

// The 'translatePage' function is responsible for fetching the correct language pack
// from the server based on the chosen language. It then applies translations to the page.
// If the requested language is not found, it attempts to fall back to English. 
function translatePage(chosen_language) {
    // Here we set the 'lang' attribute on the <html> element to the chosen language code.
    // This helps screen readers and other tools identify the current language.
    document.documentElement.setAttribute('lang', chosen_language);

    // We fetch translation data from an API endpoint based on the selected language.
    // If the fetch fails with a 404 error, we try an English fallback; otherwise we throw an error.
    fetch(`/api/translations?lang=${chosen_language}`)
        .then(response => {
            // If the response is not OK, handle errors accordingly.
            if (!response.ok) {
                if (response.status === 404) {
                    // A 404 error means no translations for the chosen language were found.
                    // We use 'en' as a fallback language.
                    console.log("Translations not found for language: ", chosen_language);
                    var fallbackLang = 'en';
                    if (chosen_language !== fallbackLang) {
                        // Try again with the fallback language.
                        translatePage(fallbackLang);
                    } else {
                        // If the fallback is also missing, we throw an error.
                        throw new Error("Fallback translations also not found: " + fallbackLang);
                    }
                } else {
                    // Throw an error if some other response issue occurs.
                    throw new Error("HTTP error " + response.status);
                }
                return null;
            }
            return response.json();
        })
        .then(data => {
            // If no data was returned (due to an error above), we stop execution here.
            if (!data) return;

            // If we have data, we call 'translateElements' to apply the translations 
            // to any elements marked with 'data-lang-key'.
            translateElements(data, chosen_language);

            // The MutationObserver below tracks DOM changes (like new elements being added or 
            // attributes being changed) and re-applies translations as needed.
            var observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        // We only process element nodes, checking if they have 'data-lang-key'
                        // or if their child nodes have it. If yes, we translate them immediately.
                        if (node.nodeType === 1) {
                            if (node.hasAttribute('data-lang-key')) {
                                translateElement(node, data, chosen_language);
                            }
                            node.querySelectorAll('[data-lang-key]').forEach(childNode => {
                                translateElement(childNode, data, chosen_language);
                            });
                        }
                    });
                    // If an existing element has 'data-lang-key' attribute added or changed,
                    // we translate it as well.
                    if (mutation.type === 'attributes' && mutation.attributeName === 'data-lang-key') {
                        translateElement(mutation.target, data, chosen_language);
                    }
                });
            });

            // We observe the entire document body, including its subtree, for newly added elements
            // or changes to the 'data-lang-key' attribute. 
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-lang-key']
            });
        })
        // If an error is thrown at any point in the chain, this 'catch' block handles it.
        .catch(function (error) {
            console.error('Fetch Error: ', error);
        });
}

// This 'translateElements' function finds all elements with 'data-lang-key' in the DOM
// and calls 'translateElement' on each one. It also keeps track of any missing keys.
function translateElements(translation_data, chosen_language) {
    // We gather all elements that have a 'data-lang-key' attribute on the page.
    var all_lang_elements = document.querySelectorAll('[data-lang-key]');
    var missing_keys = [];

    // We call 'translateElement' for each element to replace its content or attributes
    // with the correct translation strings.
    all_lang_elements.forEach(function (one_element) {
        translateElement(one_element, translation_data, chosen_language, missing_keys);
    });

    // If any keys were missing from the translation data, we log them in the console.
    if (missing_keys.length > 0) {
        console.log("Warning: Missing data-lang-keys: ", missing_keys);
    }
}

// The 'translateElement' function is in charge of looking up a translation by key 
// and then applying it to the provided element's text content or attributes.
function translateElement(one_element, translation_data, chosen_language, missing_keys) {
    // We retrieve the 'data-lang-key' to decide which string to display.
    var translation_key = one_element.getAttribute('data-lang-key');
    // We look up the translation in the fetched translation data.
    var one_translation = translation_data[translation_key];

    // If a translation is found, we handle the element based on its tag type and attributes.
    // For instance, inputs may have placeholders or values to translate.
    if (one_translation) {
        if (one_element.tagName.toLowerCase() === 'input') {
            // If it's an input with a placeholder attribute, we set that to the translation.
            if (one_element.hasAttribute('placeholder')) {
                one_element.setAttribute('placeholder', one_translation);
                if (debug) {
                    console.log("input element with placeholder: " + one_translation);
                }
            // If it's a submit input, we set its value to the translation.
            } else if (one_element.getAttribute('type') === 'submit') {
                one_element.setAttribute('value', one_translation);
                if (debug) {
                    console.log("input element of type submit: " + one_translation);
                }
            }
        } else if (one_element.tagName.toLowerCase() === 'option' || one_element.querySelector('span') || one_element.querySelector('i')) {
            // For <option> or elements containing span or icon tags,
            // we update only the last child's text content.
            one_element.lastChild.textContent = one_translation;
            if (debug) {
                console.log("option element: " + one_translation);
            }
        } else {
            // Otherwise, for general elements, we set their innerHTML to the translation.
            one_element.innerHTML = one_translation;
            if (debug) {
                console.log("general element: " + one_translation);
            }
        }
    } else if (missing_keys) {
        // If the translation is not found, and we're tracking missing keys,
        // we add this key to the list for reporting.
        missing_keys.push(translation_key);
    }
}

// 'defaultLang' attempts to derive a default language code from the browser settings
// using the first two characters from 'navigator.language' (e.g., 'en', 'fr').
var defaultLang = navigator.language.substr(0, 2);
// 'savedLang' retrieves a previously saved language preference from localStorage.
// If none is found, it falls back to 'defaultLang'.
var savedLang = localStorage.getItem('selectedLanguage') || defaultLang;

// We query all radio inputs named 'menu-lang'. When a user changes the radio selection,
// we save the chosen language in localStorage and call 'translatePage' to update the translations.
document.querySelectorAll('input[type="radio"][name="menu-lang"]').forEach(function (one_radio) {
    one_radio.addEventListener('change', function () {
        if (this.checked) {
            localStorage.setItem('selectedLanguage', this.value);
            translatePage(this.value);
        }
    });
});

// Finally, we immediately translate the page using the saved (or default) language
// as soon as the script is loaded or the page is refreshed.
translatePage(savedLang);
