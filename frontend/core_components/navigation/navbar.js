// navbar.js

let navVisible = true;
let isInitialLoad = true;

export function initNavbar() {
  const navbar = document.getElementById('navbar');
  const menuButton = document.getElementById('menuButton');
  const overlay = document.getElementById('overlay');
  const tabsContainer = document.getElementById('tabs_container');

  if (!navbar || !menuButton || !overlay || !tabsContainer) {
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
    tabsContainer.classList.remove('navbar_hidden');
  } else {
    navbar.classList.add('collapsed');
    menuButton.classList.remove('inset');
    tabsContainer.classList.add('navbar_hidden');
  }

  // Menu-napin klikkaus
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

  // Overlay-klikkaus
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

  // Kutsutaan lopuksi overlayn päivitys
  updateOverlayVisibility();
}

// Sisäinen funktio ruudun leveyden tarkistukseen
function checkWindowWidth() {
  const windowWidth = window.innerWidth;

  // Piilotetaan navbar, jos leveys on alle 1368 px
  if (windowWidth < 1368 && navVisible) {
    navVisible = false;
    localStorage.setItem('navVisible', navVisible);
    const navbar = document.getElementById('navbar');
    const menuButton = document.getElementById('menuButton');
    const tabsContainer = document.getElementById('tabs_container');
    if (navbar && menuButton && tabsContainer) {
      navbar.classList.add('collapsed');
      menuButton.classList.remove('inset');
      tabsContainer.classList.add('navbar_hidden');
    }
  }

  // Halutessasi voit pakottaa piiloon myös ensimmäisellä latauksella, 
  // jos leveys on toisen ehdon mukainen
  if (windowWidth < 1080 && isInitialLoad) {
    // navbar.classList.add('collapsed');
    // navVisible = false;
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
  if (window.innerWidth < 1080 && navVisible) {
    overlay.classList.add('active');
  } else {
    overlay.classList.remove('active');
  }
}


// // navbar.js

// let navVisible = true;
// let isInitialLoad = true;

// export function initNavbar() {
//   const navbar = document.getElementById('navbar');
//   const menuButton = document.getElementById('menuButton');
//   const overlay = document.getElementById('overlay');
//   const tabsContainer = document.getElementById('tabs_container');

//   if (!navbar || !menuButton || !overlay || !tabsContainer) {
//     console.warn('Navbar elements not found in DOM');
//     return;
//   }

//   // Haetaan localStoragesta navVisible-arvo
//   const storedNavVisible = localStorage.getItem('navVisible');
//   if (storedNavVisible !== null) {
//     navVisible = (storedNavVisible === 'true');
//   }

//   // Tarkistetaan ruudun leveys
//   checkWindowWidth();

//   // Asetetaan navin alkutila
//   if (navVisible) {
//     navbar.classList.remove('collapsed');
//     menuButton.classList.add('inset');
//     tabsContainer.classList.remove('navbar_hidden');
//   } else {
//     navbar.classList.add('collapsed');
//     menuButton.classList.remove('inset');
//     tabsContainer.classList.add('navbar_hidden');
//   }

//   // Menu-napin klikkaus
//   menuButton.addEventListener('click', () => {
//     navVisible = !navVisible;
//     localStorage.setItem('navVisible', navVisible);

//     if (navVisible) {
//       navbar.classList.remove('collapsed');
//       menuButton.classList.add('inset');
//       tabsContainer.classList.remove('navbar_hidden');
//     } else {
//       navbar.classList.add('collapsed');
//       menuButton.classList.remove('inset');
//       tabsContainer.classList.add('navbar_hidden');
//     }
//     updateOverlayVisibility();
//   });

//   // Overlay-klikkaus
//   overlay.addEventListener('click', () => {
//     if (navVisible) {
//       navVisible = false;
//       localStorage.setItem('navVisible', navVisible);
//       navbar.classList.add('collapsed');
//       menuButton.classList.remove('inset');
//       tabsContainer.classList.add('navbar_hidden');
//     }
//     overlay.classList.remove('active');
//   });

//   // Kuunnellaan ikkunan koon muuttumista
//   window.addEventListener('resize', checkWindowWidth);

//   // Kutsutaan lopuksi overlayn päivitys
//   updateOverlayVisibility();
// }

// // Sisäinen funktio ruudun leveyden tarkistukseen
// function checkWindowWidth() {
//   const windowWidth = window.innerWidth;
//   if (windowWidth < 1080 && isInitialLoad) {
//     // Halutessasi voit pakottaa piiloon ensilatauksella
//     // navbar.classList.add('collapsed');
//     // navVisible = false;
//   }
//   updateOverlayVisibility();
//   if (isInitialLoad) {
//     isInitialLoad = false;
//   }
// }

// // Overlayn näkyvyyden päivitys
// function updateOverlayVisibility() {
//   const overlay = document.getElementById('overlay');
//   if (!overlay) return;
//   if (window.innerWidth < 1080 && navVisible) {
//     overlay.classList.add('active');
//   } else {
//     overlay.classList.remove('active');
//   }
// }
