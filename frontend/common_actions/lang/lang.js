// lang.js
var debug = false; // Show debug information in the console

function translatePage(chosen_language) {
    document.documentElement.setAttribute('lang', chosen_language);

    fetch(`/api/translations?lang=${chosen_language}`)
        .then(response => {
            if (!response.ok) {
                if (response.status === 404) {
                    console.log("Translations not found for language: ", chosen_language);
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
            console.error('Fetch Error: ', error);
        });
}

function translateElements(translation_data, chosen_language) {
    var all_lang_elements = document.querySelectorAll('[data-lang-key]');
    var missing_keys = [];

    all_lang_elements.forEach(function (one_element) {
        translateElement(one_element, translation_data, chosen_language, missing_keys);
    });

    if (missing_keys.length > 0) {
        console.log("Warning: Missing data-lang-keys: ", missing_keys);
    }
}

function translateElement(one_element, translation_data, chosen_language, missing_keys) {
    var translation_key = one_element.getAttribute('data-lang-key');
    var one_translation = translation_data[translation_key];

    if (one_translation) {
        if (one_element.tagName.toLowerCase() === 'input') {
            if (one_element.hasAttribute('placeholder')) {
                one_element.setAttribute('placeholder', one_translation);
                if (debug) {
                    console.log("input element with placeholder: " + one_translation);
                }
            } else if (one_element.getAttribute('type') === 'submit') {
                one_element.setAttribute('value', one_translation);
                if (debug) {
                    console.log("input element of type submit: " + one_translation);
                }
            }
        } else if (one_element.tagName.toLowerCase() === 'option' || one_element.querySelector('span') || one_element.querySelector('i')) {
            one_element.lastChild.textContent = one_translation;
            if (debug) {
                console.log("option element: " + one_translation);
            }
        } else {
            one_element.innerHTML = one_translation;
            if (debug) {
                console.log("general element: " + one_translation);
            }
        }
    } else if (missing_keys) {
        missing_keys.push(translation_key);
    }
}

var defaultLang = navigator.language.substr(0, 2);
var savedLang = localStorage.getItem('selectedLanguage') || defaultLang;

document.querySelectorAll('input[type="radio"][name="menu-lang"]').forEach(function (one_radio) {
    one_radio.addEventListener('change', function () {
        if (this.checked) {
            localStorage.setItem('selectedLanguage', this.value);
            translatePage(this.value);
        }
    });
});

translatePage(savedLang);
