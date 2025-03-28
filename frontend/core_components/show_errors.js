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
        // Esim. jos maxLength on 50, laitetaan puoliksi (miinus pisteet)
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
        errorContainer.style.padding = "0.5rem";
        errorContainer.style.background = "#511";
        errorContainer.style.color = "#200";
        errorContainer.style.zIndex = "999999";
        errorContainer.style.display = "none"; // oletuksena piilossa
        
        // Jätä width pois tai pidä "auto" / "fit-content"
        errorContainer.style.width = "auto";

        // Voit rajoittaa maksimikokoa halutessasi:
        // errorContainer.style.maxWidth = "80%";

        document.body.appendChild(errorContainer);
    }

    // Tehdään sulkunappi
    const closeButton = document.createElement("button");
    closeButton.textContent = "Sulje";
    closeButton.style.marginLeft = "0.5rem";
    closeButton.addEventListener("click", () => {
        errorContainer.style.display = "none";
    });
    errorContainer.appendChild(closeButton);

    // Luodaan elementti varsinaisille virheteksteille
    const errorMessageSpan = document.createElement("span");
    errorContainer.appendChild(errorMessageSpan);

    // Klikkaus muualla piilottaa virheboksin
    document.addEventListener("click", (event) => {
        if (!errorContainer.contains(event.target)) {
            errorContainer.style.display = "none";
        }
    });

    // Pieni apufunktio, joka näyttää tekstin errorContainerissa
    function showErrorInUI(message) {
        errorMessageSpan.textContent = message;
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
                const shortUrl = shortenUrl(response.url, 60);
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
