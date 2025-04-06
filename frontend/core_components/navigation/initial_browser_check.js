// initial_browser_check.js

console.log("Initial browser check script loaded.");

function checkForIEBrowser() {
    var userAgent = window.navigator.userAgent;
    // Otetaan selainkieli (IE:ssä voi olla userLanguage)
    var userLang = navigator.language || navigator.userLanguage || "en";

    // Tarkistetaan IE
    if (userAgent.indexOf("MSIE ") > 0 || userAgent.indexOf("Trident/") > 0) {
        // Jos kieli on suomi (tarkistetaan, alkaako "fi", fi-FI tms.)
        if (userLang.toLowerCase().indexOf("fi") === 0) {
            document.body.innerHTML = "<h1>Hei IE-käyttäjä!</h1>" +
                "<p>Internet Explorer on vanhentunut selain. " +
                "Lataa jokin uudempi, esimerkiksi <a href='https://brave.com/download/'>Brave</a>.</p>";
        } else {
            document.body.innerHTML = "<h1>Hello IE user!</h1>" +
                "<p>Your Internet Explorer browser is outdated. " +
                "Please install a more modern browser, for example <a href='https://brave.com/download/'>Brave</a>.</p>";
        }
        return false;
    } else {
        console.log("Ei IE:tä, kaikki kunnossa!");
    }
}

// Kutsu funktiota
checkForIEBrowser();
