// navbar.js

let navVisible = true;
let isInitialLoad = true;

export function initNavbar() {
  const navbar = document.getElementById('navbar');
  const menuButton = document.getElementById('menuButton');
  const overlay = document.getElementById('overlay');

  if (!navbar || !menuButton || !overlay) {
    console.warn('Navbar elements not found in DOM');
    return;
  }

  // Haetaan localStoragesta navVisible-arvo
  const storedNavVisible = localStorage.getItem('navVisible');
  if (storedNavVisible !== null) {
    navVisible = (storedNavVisible === 'true');
  }

  // Tarkistetaan ruudun leveys
  checkWindowWidth();

  // Asetetaan navin alkutila
  if (navVisible) {
    navbar.classList.remove('collapsed');
    menuButton.classList.add('inset');
  } else {
    navbar.classList.add('collapsed');
    menuButton.classList.remove('inset');
  }

  // Menu-napin klikkaus
  menuButton.addEventListener('click', () => {
    navVisible = !navVisible;
    localStorage.setItem('navVisible', navVisible);

    if (navVisible) {
      navbar.classList.remove('collapsed');
      menuButton.classList.add('inset');
    } else {
      navbar.classList.add('collapsed');
      menuButton.classList.remove('inset');
    }
    updateOverlayVisibility();
  });

  // Overlay-klikkaus
  overlay.addEventListener('click', () => {
    if (navVisible) {
      navVisible = false;
      localStorage.setItem('navVisible', navVisible);
      navbar.classList.add('collapsed');
      menuButton.classList.remove('inset');
    }
    overlay.classList.remove('active');
  });

  // Kuunnellaan ikkunan koon muuttumista
  window.addEventListener('resize', checkWindowWidth);

  // Kutsutaan lopuksi overlayn päivitys
  updateOverlayVisibility();
}

// Huom: Tehdään checkWindowWidth ja updateOverlayVisibility sisäisiksi funktioiksi
function checkWindowWidth() {
  const windowWidth = window.innerWidth;
  if (windowWidth < 1080 && isInitialLoad) {
    // Halutessa voit pakottaa piiloon ensilatauksella
    // navbar.classList.add('collapsed');
    // navVisible = false;
  }
  updateOverlayVisibility();
  if (isInitialLoad) {
    isInitialLoad = false;
  }
}

function updateOverlayVisibility() {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  if (window.innerWidth < 1080 && navVisible) {
    overlay.classList.add('active');
  } else {
    overlay.classList.remove('active');
  }
}