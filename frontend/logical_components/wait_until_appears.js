// File: wait_until_appears.js

export function wait_until_appears(css_selector) {
    return new Promise((resolve) => {
        // Jos elementti on jo olemassa, palauta se heti
        const existing_element = document.querySelector(css_selector);
        if (existing_element) {
            resolve(existing_element);
            return;
        }

        // Muuten tarkkaillaan DOMia, kunnes elementti ilmestyy
        const observer = new MutationObserver((mutations, obs) => {
            const element = document.querySelector(css_selector);
            if (element) {
                resolve(element);
                obs.disconnect();
            }
        });

        // Tarkkaillaan koko dokumenttirunkoa
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}
