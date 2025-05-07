// navbar.js

const NAVBAR_WIDTH_THRESHOLD = 1850; // Kynnysarvo pikseleinä
let navVisible = true; // Oletusarvo: navigaatiopalkki näkyvissä
let isInitialLoad = true; // Tarkistaa, onko kyseessä sivun ensimmäinen lataus

export function initNavbar() {
  const navbar = document.getElementById('navbar');
  const menuButton = document.getElementById('menuButton');
  const overlay = document.getElementById('overlay');
  const tabsContainer = document.getElementById('tabs_container');

  // Tarkistetaan, että DOM-elementit löytyvät
  if (!navbar || !menuButton || !overlay || !tabsContainer) {
    console.warn('Navbar-elementtejä ei löydy DOM:sta');
    return;
  }

  // Haetaan navVisible-tila localStoragesta
  const storedNavVisible = localStorage.getItem('navVisible');
  if (storedNavVisible !== null) {
    navVisible = storedNavVisible === 'true';
  }

  // Tarkistetaan ruudun leveys alussa
  checkWindowWidth();

  // Asetetaan navigaatiopalkin alkutila
  if (navVisible) {
    navbar.classList.remove('collapsed');
    menuButton.classList.add('inset');
    tabsContainer.classList.remove('navbar_hidden');
  } else {
    navbar.classList.add('collapsed');
    menuButton.classList.remove('inset');
    tabsContainer.classList.add('navbar_hidden');
  }

  // Menu-painikkeen klikkaus
  menuButton.addEventListener('click', () => {
    navVisible = !navVisible;
    localStorage.setItem('navVisible', navVisible);

    if (navVisible) {
      navbar.classList.remove('collapsed');
      menuButton.classList.add('inset');
      tabsContainer.classList.remove('navbar_hidden');
    } else {
      navbar.classList.add('collapsed');
      menuButton.classList.remove('inset');
      tabsContainer.classList.add('navbar_hidden');
    }
    updateOverlayVisibility();
  });

  // Overlay-klikkaus (sulkee navigaatiopalkin)
  overlay.addEventListener('click', () => {
    if (navVisible) {
      navVisible = false;
      localStorage.setItem('navVisible', navVisible);
      navbar.classList.add('collapsed');
      menuButton.classList.remove('inset');
      tabsContainer.classList.add('navbar_hidden');
    }
    overlay.classList.remove('active');
  });

  // Kuunnellaan ikkunan koon muuttumista
  window.addEventListener('resize', checkWindowWidth);

  // Päivitetään overlayn näkyvyys
  updateOverlayVisibility();
}

// Funktio, joka tarkistaa ruudun leveyden ja päivittää navigaatiopalkin
function checkWindowWidth() {
  const windowWidth = window.innerWidth;
  const navbar = document.getElementById('navbar');
  const menuButton = document.getElementById('menuButton');
  const tabsContainer = document.getElementById('tabs_container');

  // Jos leveys >= 1366px ja navigaatiopalkki ei ole näkyvissä, näytetään se
  if (windowWidth >= NAVBAR_WIDTH_THRESHOLD && !navVisible) {
    navVisible = true;
    localStorage.setItem('navVisible', navVisible);
    if (navbar && menuButton && tabsContainer) {
      navbar.classList.remove('collapsed');
      menuButton.classList.add('inset');
      tabsContainer.classList.remove('navbar_hidden');
    }
  }
  // Jos leveys < 1366px ja navigaatiopalkki on näkyvissä, piilotetaan se
  else if (windowWidth < NAVBAR_WIDTH_THRESHOLD && navVisible) {
    navVisible = false;
    localStorage.setItem('navVisible', navVisible);
    if (navbar && menuButton && tabsContainer) {
      navbar.classList.add('collapsed');
      menuButton.classList.remove('inset');
      tabsContainer.classList.add('navbar_hidden');
    }
  }

  updateOverlayVisibility();

  if (isInitialLoad) {
    isInitialLoad = false;
  }
}

// Overlayn näkyvyyden päivitys
function updateOverlayVisibility() {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  if (window.innerWidth < NAVBAR_WIDTH_THRESHOLD && navVisible) {
    overlay.classList.add('active');
  } else {
    overlay.classList.remove('active');
  }
}