// mobile_friendly_nav.js

const navbar = document.getElementById('navbar');
const menuButton = document.getElementById('menuButton');
const overlay = document.getElementById('overlay');

// Alustustilat (oikea tila luetaan localStoragesta DOMContentLoaded-funktiossa)
let navVisible = true;
let isInitialLoad = true;

// Päivitetään overlayn näkyvyys
function updateOverlayVisibility() {
    if (window.innerWidth < 1080 && navVisible) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

// Responsiivinen tarkistus
function checkWindowWidth() {
    const windowWidth = window.innerWidth;

    // Pienellä ruudulla voidaan halutessa pakottaa navbar piilotetuksi ensimmäisellä latauksella
    if (windowWidth < 1080) {
        if (isInitialLoad) {
            // Jos haluat ohittaa localStoragen arvon pienten ruutujen ensimmäisellä latauksella,
            // voit pakottaa piilotuksen tähän:
            // navbar.classList.add('collapsed');
            // navVisible = false;
        }
    } else {
        // Suuremmalla ruudulla voidaan halutessa näyttää nav automaattisesti
        // (tai tukeutua localStoragen arvoon, jos haluat säilyttää)
        // navVisible = true;
    }

    updateOverlayVisibility();

    if (isInitialLoad) {
        isInitialLoad = false;
    }
}

// Napin klikkaus: näytä/piilota navigation
menuButton.addEventListener('click', function () {
    navVisible = !navVisible;
    localStorage.setItem('navVisible', navVisible); // Tallennetaan valinta

    if (navVisible) {
        navbar.classList.remove('collapsed');
        menuButton.classList.add('inset');
    } else {
        navbar.classList.add('collapsed');
        menuButton.classList.remove('inset');
    }
    updateOverlayVisibility();
});

// Overlay-klikkaus sulkee navin
overlay.addEventListener('click', function () {
    if (navVisible) {
        navVisible = false;
        localStorage.setItem('navVisible', navVisible);
        navbar.classList.add('collapsed');
        menuButton.classList.remove('inset');
    }
    overlay.classList.remove('active');
});

// Sivun latautuessa luetaan mahdollinen tallennettu navVisible-tila
document.addEventListener('DOMContentLoaded', () => {
    const storedNavVisible = localStorage.getItem('navVisible');
    if (storedNavVisible !== null) {
        navVisible = (storedNavVisible === 'true');
    }

    // Asetetaan luokat heti ladatessa
    if (navVisible) {
        navbar.classList.remove('collapsed');
        menuButton.classList.add('inset');
    } else {
        navbar.classList.add('collapsed');
        menuButton.classList.remove('inset');
    }

    checkWindowWidth();
});