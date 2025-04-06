// show_errors.js
//
// Tämä skripti yrittää “kiinniottaa” kaikki merkittävät virheet:
//  - JavaScriptin ajonaikaiset virheet (window.onerror)
//  - Käsittelemättömät Promise-virheet (unhandledrejection)
//  - HTTP-tasolla (fetch) tulevat 4xx/5xx-virheet
//
// Se näyttää virheet sivun yläreunassa yksinkertaisessa alert-alueessa.
// Kutsutaan vain main.js:ssä tyyliin:
//   import "./show_errors.js";

(function() {
    // Pieni apufunktio: käännetään statuskoodi selkeämmäksi kuvaukseksi
    function getNiceStatusMessage(status) {
        switch (status) {
            case 400: return "Virheellinen pyyntö (400)";
            case 401: return "Luvaton (401)";
            case 403: return "Kielletty (403)";
            case 404: return "Resurssia ei löydy (404)";
            case 429: return "Liian monta pyyntöä (429)";
            case 500: return "Palvelinvirhe (500)";
            default:  return `Tuntematon HTTP-virhe (${status})`;
        }
    }

    // Pieni apufunktio: lyhennetään pitkä URL keskeltä, esim. “http://xxx.com/…/abc”
    function shortenUrl(url, maxLength = 50) {
        if (!url || url.length <= maxLength) {
            return url;
        }
        const half = Math.floor((maxLength - 3) / 2);
        return url.slice(0, half) + "..." + url.slice(url.length - half);
    }

    // Luodaan (tai haetaan) pieni container sivulle, johon virheet näytetään
    let errorContainer = document.getElementById("global-error-container");
    if (!errorContainer) {
        errorContainer = document.createElement("div");
        errorContainer.id = "global-error-container";

        // Asetetaan tyyli, joka pitää sen ylhäällä, mutta keskittää horisontaalisesti
        errorContainer.style.position = "fixed";
        errorContainer.style.top = "1rem";
        errorContainer.style.left = "50%";
        errorContainer.style.transform = "translateX(-50%)";
        errorContainer.style.padding = "1rem 1.5rem";
        errorContainer.style.background = "#511";
        errorContainer.style.zIndex = "999999";
        errorContainer.style.borderRadius = "7px";
        errorContainer.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.5)";
        errorContainer.style.display = "none";

        errorContainer.style.width = "auto"; // tai jätä pois
        // errorContainer.style.maxWidth = "80%"; // halutessasi

        document.body.appendChild(errorContainer);
    }

    // Luodaan elementti varsinaisille virheteksteille
    const errorMessageSpan = document.createElement("span");
    errorContainer.appendChild(errorMessageSpan);

    // Tehdään sulkunappi
    const closeButton = document.createElement("button");
    closeButton.textContent = "Sulje";
    closeButton.style.background = "#311";
    closeButton.style.border = "1px solid #fee";
    closeButton.style.color = "#fee";
    closeButton.style.marginLeft = "1rem";
    closeButton.addEventListener("click", () => {
        errorContainer.style.display = "none";
    });
    errorContainer.appendChild(closeButton);

    // Klikkaus muualla piilottaa virheboksin
    document.addEventListener("click", (event) => {
        if (!errorContainer.contains(event.target)) {
            errorContainer.style.display = "none";
        }
    });

    // Lisätään nappi, joka poistaa nimettyjä evästeitä
    // ja pyytää palvelimelta session-evästeen tyhjennyksen
    const resetButton = document.createElement("button");
    // resetButton.textContent = "Kirjaudu ulos";
    //add data attribute data-lang-key
    resetButton.setAttribute("data-lang-key", "logout");
    resetButton.style.background = "#311";
    resetButton.style.border = "1px solid #fee";
    resetButton.style.color = "#fee";
    resetButton.style.marginLeft = "1rem";
    resetButton.addEventListener("click", () => {
        // Ensin tyhjennetään nimeltä mainitut ei-HttpOnly-evästeet
        const cookiesToRemove = [
            "device_id",
            "fingerprint",
            "nonce_name",
            "session",
            "nonce_value"
        ];
        cookiesToRemove.forEach(cookieName => {
            // HttpOnly-cookieta (kuten session) ei voi poistaa JS:llä,
            // mutta yritetään joka tapauksessa, jos se ei sattuisi olemaan HttpOnly.
            document.cookie = cookieName + "=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        });

        // Kutsutaan palvelimen reittiä, joka Set-Cookie-otsikolla
        // tyhjentää session-evästeen (HttpOnly, Secure, jne.)
        fetch("/api/reset-session", { method: "POST" })
            .then(response => {
                if (!response.ok) {
                    throw new Error("Virhe reset-session-kutsussa: " + response.status);
                }
                return response.json();
            })
            .then(data => {
                console.log("Palvelimen vastaus:", data);
                // alert("Evästeet yritetty nollata. Palvelimen session-eväste poistettiin!");
                // Ladataan sivu uudelleen
                location.reload();
            })
            .catch(err => {
                console.error("Reset-session error:", err);
                alert("Session-evästeen nollaaminen epäonnistui!");
            });
    });
    errorContainer.appendChild(resetButton);

    // Pieni apufunktio, joka näyttää tekstin errorContainerissa
    function showErrorInUI(message) {
        errorMessageSpan.textContent = message;
        errorMessageSpan.style.color = "#fee";
        errorContainer.style.display = "block";
    }

    // window.onerror: Kaikki perinteiset JS-virheet
    window.onerror = function(message, source, lineno, colno, error) {
        const msg = `[JS VIRHE] ${message} (${source}:${lineno}:${colno})`;
        console.error(msg, error);
        showErrorInUI(msg);
        return false;
    };

    // window.onunhandledrejection: promise-virheet
    window.onunhandledrejection = function(event) {
        const msg = `[PROMISE VIRHE] ${event.reason}`;
        console.error(msg, event);
        showErrorInUI(msg);
    };

    // Monkey-patch fetch: napataan kaikki HTTP-pyynnöt, jotka saavat virhekoodin
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const response = await originalFetch(...args);
            if (!response.ok) {
                // 4xx/5xx-tilanne
                const niceStatusMsg = getNiceStatusMessage(response.status);
                // Lyhennetään URL keskeltä, jos liian pitkä
                const shortUrl = shortenUrl(response.url, 160);
                const msg = `[HTTP VIRHE] ${niceStatusMsg} | url=${shortUrl}`;
                console.error(msg, response);
                showErrorInUI(msg);
            }
            return response;
        } catch (err) {
            // Esim. verkko-ongelma tai fetchin parse-virhe
            const msg = `[FETCH ERROR] ${err}`;
            console.error(msg, err);
            showErrorInUI(msg);
            throw err;
        }
    };
})();


// // show_errors.js
// //
// // Tämä skripti yrittää “kiinniottaa” kaikki merkittävät virheet:
// //  - JavaScriptin ajonaikaiset virheet (window.onerror)
// //  - Käsittelemättömät Promise-virheet (unhandledrejection)
// //  - HTTP-tasolla (fetch) tulevat 4xx/5xx-virheet
// //
// // Se näyttää virheet sivun yläreunassa yksinkertaisessa alert-alueessa.
// // Kutsutaan vain main.js:ssä tyyliin:
// //   import "./show_errors.js";

// (function() {
//     // Pieni apufunktio: käännetään statuskoodi selkeämmäksi kuvaukseksi
//     function getNiceStatusMessage(status) {
//         switch (status) {
//             case 400: return "Virheellinen pyyntö (400)";
//             case 401: return "Luvaton (401)";
//             case 403: return "Kielletty (403)";
//             case 404: return "Resurssia ei löydy (404)";
//             case 429: return "Liian monta pyyntöä (429)";
//             case 500: return "Palvelinvirhe (500)";
//             default:  return `Tuntematon HTTP-virhe (${status})`;
//         }
//     }

//     // Pieni apufunktio: lyhennetään pitkä URL keskeltä, esim. “http://xxx.com/…/abc”
//     function shortenUrl(url, maxLength = 50) {
//         if (!url || url.length <= maxLength) {
//             return url;
//         }
//         // Esim. jos maxLength on 50, laitetaan puoliksi (miinus pisteet)
//         const half = Math.floor((maxLength - 3) / 2);
//         return url.slice(0, half) + "..." + url.slice(url.length - half);
//     }

//     // Luodaan (tai haetaan) pieni container sivulle, johon virheet näytetään
//     let errorContainer = document.getElementById("global-error-container");
//     if (!errorContainer) {
//         errorContainer = document.createElement("div");
//         errorContainer.id = "global-error-container";
        
//         // Asetetaan tyyli, joka pitää sen ylhäällä, mutta keskittää horisontaalisesti
//         errorContainer.style.position = "fixed";
//         errorContainer.style.top = "1rem";
//         errorContainer.style.left = "50%";
//         errorContainer.style.transform = "translateX(-50%)";
//         errorContainer.style.padding = "1rem 1.5rem";
//         errorContainer.style.background = "#511";
//         errorContainer.style.zIndex = "999999";
//         errorContainer.style.borderRadius = "7px";
//         errorContainer.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.5)";
//         errorContainer.style.display = "none";
        
//         // Jätä width pois tai pidä "auto" / "fit-content"
//         errorContainer.style.width = "auto";

//         // Voit rajoittaa maksimikokoa halutessasi:
//         // errorContainer.style.maxWidth = "80%";

//         document.body.appendChild(errorContainer);
//     }



//     // Luodaan elementti varsinaisille virheteksteille
//     const errorMessageSpan = document.createElement("span");
//     errorContainer.appendChild(errorMessageSpan);

//     // Tehdään sulkunappi
//     const closeButton = document.createElement("button");
//     closeButton.textContent = "Sulje";
//     closeButton.style.background = "#311";
//     closeButton.style.border = "1px solid #fee";
//     closeButton.style.color = "#fee";
//     closeButton.style.marginLeft = "1rem";
//     closeButton.addEventListener("click", () => {
//         errorContainer.style.display = "none";
//     });
//     errorContainer.appendChild(closeButton);

//     // Klikkaus muualla piilottaa virheboksin
//     document.addEventListener("click", (event) => {
//         if (!errorContainer.contains(event.target)) {
//             errorContainer.style.display = "none";
//         }
//     });

//     // Pieni apufunktio, joka näyttää tekstin errorContainerissa
//     function showErrorInUI(message) {
//         errorMessageSpan.textContent = message;
//         errorMessageSpan.style.color = "#fee";
//         errorContainer.style.display = "block";
//     }

//     // window.onerror: Kaikki perinteiset JS-virheet
//     window.onerror = function(message, source, lineno, colno, error) {
//         const msg = `[JS VIRHE] ${message} (${source}:${lineno}:${colno})`;
//         console.error(msg, error);
//         showErrorInUI(msg);
//         return false;
//     };

//     // window.onunhandledrejection: promise-virheet
//     window.onunhandledrejection = function(event) {
//         const msg = `[PROMISE VIRHE] ${event.reason}`;
//         console.error(msg, event);
//         showErrorInUI(msg);
//     };

//     // Monkey-patch fetch: napataan kaikki HTTP-pyynnöt, jotka saavat virhekoodin
//     const originalFetch = window.fetch;
//     window.fetch = async function(...args) {
//         try {
//             const response = await originalFetch(...args);
//             if (!response.ok) {
//                 // 4xx/5xx-tilanne
//                 const niceStatusMsg = getNiceStatusMessage(response.status);
//                 // Lyhennetään URL keskeltä, jos liian pitkä
//                 const shortUrl = shortenUrl(response.url, 160);
//                 const msg = `[HTTP VIRHE] ${niceStatusMsg} | url=${shortUrl}`;
//                 console.error(msg, response);
//                 showErrorInUI(msg);
//             }
//             return response;
//         } catch (err) {
//             // Esim. verkko-ongelma tai fetchin parse-virhe
//             const msg = `[FETCH ERROR] ${err}`;
//             console.error(msg, err);
//             showErrorInUI(msg);
//             throw err;
//         }
//     };
// })();


// // show_errors.js
// //
// // Tämä skripti yrittää “kiinniottaa” kaikki merkittävät virheet:
// //  - JavaScriptin ajonaikaiset virheet (window.onerror)
// //  - Käsittelemättömät Promise-virheet (unhandledrejection)
// //  - HTTP-tasolla (fetch) tulevat 4xx/5xx-virheet
// //
// // Se näyttää virheet sivun yläreunassa yksinkertaisessa alert-alueessa.
// // Kutsutaan vain main.js:ssä tyyliin: 
// //   import "./show_errors.js";

// (function() {
//     // Pieni apufunktio: käännetään statuskoodi selkeämmäksi kuvaukseksi
//     function getNiceStatusMessage(status) {
//         switch (status) {
//             case 400: return "Virheellinen pyyntö (400)";
//             case 401: return "Luvaton (401)";
//             case 403: return "Kielletty (403)";
//             case 404: return "Resurssia ei löydy (404)";
//             case 429: return "Liian monta pyyntöä (429)";
//             case 500: return "Palvelinvirhe (500)";
//             default:  return `Tuntematon HTTP-virhe (${status})`;
//         }
//     }

//     // Pieni apufunktio: lyhennetään pitkä URL keskeltä, esim. “http://xxx.com/…/abc”
//     function shortenUrl(url, maxLength = 50) {
//         if (!url || url.length <= maxLength) {
//             return url;
//         }
//         // Esim. jos maxLength on 50, laitetaan puoliksi (miinus pisteet)
//         const half = Math.floor((maxLength - 3) / 2);
//         return url.slice(0, half) + "..." + url.slice(url.length - half);
//     }

//     // Luodaan (tai haetaan) pieni container sivulle, johon virheet näytetään
//     let errorContainer = document.getElementById("global-error-container");
//     if (!errorContainer) {
//         errorContainer = document.createElement("div");
//         errorContainer.id = "global-error-container";
        
//         // Asetetaan tyyli, joka pitää sen ylhäällä, mutta keskittää horisontaalisesti
//         errorContainer.style.position = "fixed";
//         errorContainer.style.top = "1rem";
//         errorContainer.style.left = "50%";
//         errorContainer.style.transform = "translateX(-50%)";
//         errorContainer.style.padding = "0.5rem";
//         errorContainer.style.background = "#511";
//         errorContainer.style.color = "#200";
//         errorContainer.style.zIndex = "999999";
//         errorContainer.style.display = "none";
        
//         // Jätä width pois tai pidä "auto" / "fit-content"
//         errorContainer.style.width = "auto";

//         // Voit rajoittaa maksimikokoa halutessasi:
//         // errorContainer.style.maxWidth = "80%";

//         document.body.appendChild(errorContainer);
//     }

//     // Tehdään sulkunappi
//     const closeButton = document.createElement("button");
//     closeButton.textContent = "Sulje";
//     closeButton.style.marginLeft = "0.5rem";
//     closeButton.addEventListener("click", () => {
//         errorContainer.style.display = "none";
//     });
//     errorContainer.appendChild(closeButton);

//     // Luodaan elementti varsinaisille virheteksteille
//     const errorMessageSpan = document.createElement("span");
//     errorContainer.appendChild(errorMessageSpan);

//     // Klikkaus muualla piilottaa virheboksin
//     document.addEventListener("click", (event) => {
//         if (!errorContainer.contains(event.target)) {
//             errorContainer.style.display = "none";
//         }
//     });

//     // Pieni apufunktio, joka näyttää tekstin errorContainerissa
//     function showErrorInUI(message) {
//         errorMessageSpan.textContent = message;
//         errorContainer.style.display = "block";
//     }

//     // window.onerror: Kaikki perinteiset JS-virheet
//     window.onerror = function(message, source, lineno, colno, error) {
//         const msg = `[JS VIRHE] ${message} (${source}:${lineno}:${colno})`;
//         console.error(msg, error);
//         showErrorInUI(msg);
//         return false;
//     };

//     // window.onunhandledrejection: promise-virheet
//     window.onunhandledrejection = function(event) {
//         const msg = `[PROMISE VIRHE] ${event.reason}`;
//         console.error(msg, event);
//         showErrorInUI(msg);
//     };

//     // Monkey-patch fetch: napataan kaikki HTTP-pyynnöt, jotka saavat virhekoodin
//     const originalFetch = window.fetch; 
//     window.fetch = async function(...args) {
//         try {
//             const response = await originalFetch(...args);
//             if (!response.ok) {
//                 // 4xx/5xx-tilanne
//                 const niceStatusMsg = getNiceStatusMessage(response.status);
//                 // Lyhennetään URL keskeltä, jos liian pitkä
//                 const shortUrl = shortenUrl(response.url, 60);
//                 const msg = `[HTTP VIRHE] ${niceStatusMsg} | url=${shortUrl}`;
//                 console.error(msg, response);
//                 showErrorInUI(msg);
//             }
//             return response;
//         } catch (err) {
//             // Esim. verkko-ongelma tai fetchin parse-virhe
//             const msg = `[FETCH ERROR] ${err}`;
//             console.error(msg, err);
//             showErrorInUI(msg);
//             throw err;
//         }
//     };
// })();
