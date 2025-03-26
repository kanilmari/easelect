// theme.js

// Mahdolliset teemat
export const themes = ['system', 'dark', 'light'];

// SVG-kuvakkeet
export const themeIcons = {
    'light': `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M480-360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0 80q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-212l101-97 55 53-97 101-59-57Zm326-268Z"/></svg>`,
    'dark': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor">
        <path d="M21.75 14.37a9.5 9.5 0 1 1-11.62-11.62 7 7 0 1 0 11.62 11.62z"/>
    </svg>`,
    'system': `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M480-28 346-160H160v-186L28-480l132-134v-186h186l134-132 134 132h186v186l132 134-132 134v186H614L480-28Zm0-252q83 0 141.5-58.5T680-480q0-83-58.5-141.5T480-680v400Zm0 140 100-100h140v-140l100-100-100-100v-140H580L480-820 380-720H240v140L140-480l100 100v140h140l100 100Zm0-340Z"/></svg>`
};

let currentThemeIndex;

document.addEventListener('DOMContentLoaded', () => {
    // Alusta teema
    currentThemeIndex = initializeTheme(themes, applyTheme);

    // Alustetaan menuButton

    // Aseta tapahtumankuuntelija teeman vaihtopainikkeelle
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    themeToggleBtn.addEventListener('click', function() {
        // Vaihda seuraavaan teemaan
        currentThemeIndex = (currentThemeIndex + 1) % themes.length;
        const newTheme = themes[currentThemeIndex];
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);

        // Päivitä napin sisältö
        updateThemeButton(newTheme);
    });
});


export function applyTheme(theme) {
    const body = document.body;
    body.classList.remove('light-mode', 'dark-mode', 'system-mode');

    if (theme === 'light') {
        body.classList.add('light-mode');
    } else if (theme === 'dark') {
        body.classList.add('dark-mode');
    } else if (theme === 'system') {
        const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");
        body.classList.add('system-mode');
        if (prefersDarkScheme.matches) {
            body.classList.add('dark-mode');
        } else {
            body.classList.add('light-mode');
        }

        // Päivitetään teema automaattisesti, jos järjestelmäteema muuttuu
        prefersDarkScheme.addEventListener('change', (event) => {
            if (event.matches) {
                body.classList.add('dark-mode');
                body.classList.remove('light-mode');
            } else {
                body.classList.add('light-mode');
                body.classList.remove('dark-mode');
            }
        });
    }
}

export function updateThemeButton(theme) {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    // Tyhjennetään painike
    themeToggleBtn.textContent = '';

    // Luodaan DOMParser jolla puretaan SVG-merkkijono
    const parser = new DOMParser();
    const parsedDoc = parser.parseFromString(themeIcons[theme], 'text/html');

    // Etsitään <svg> luodusta dokumentista
    const svgElement = parsedDoc.body.querySelector('svg');
    if (svgElement) {
        themeToggleBtn.appendChild(svgElement);
    }

    // Lisätään span-elementti
    const spanElement = document.createElement('span');
    spanElement.classList.add('visually-hidden');
    themeToggleBtn.appendChild(spanElement);
}


export function initializeTheme(themes, applyTheme) {
    let currentThemeIndex = 0; // Alussa 'system'
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme && themes.includes(savedTheme)) {
        currentThemeIndex = themes.indexOf(savedTheme);
    } else {
        currentThemeIndex = 0; // Oletuksena 'system'
    }
    const currentTheme = themes[currentThemeIndex];
    applyTheme(currentTheme);
    updateThemeButton(currentTheme);
    return currentThemeIndex;
}
