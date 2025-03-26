// logout_svg.js

var logout_icon_svg = `
<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 -960 960 960" fill="var(--text_color)">
  <path d="m216-160-56-56 384-384H440v80h-80v-160h233q16 0 31 6t26 17l120 119q27 27 66 42t84 16v80q-62 0-112.5-19T718-476l-40-42-88 88 90 90-262 151-40-69 172-99-68-68-266 265Zm-96-280Zm-80-120m739-80q-33 0-57-23.5T698-720q0-33 24-56.5t57-23.5q33 0 57 23.5t24 56.5q0 33-24 56.5T779-640ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Z"></path>
</svg>
`;

document.addEventListener('DOMContentLoaded', function() {
  const logout_container = document.querySelector('.logout-container');
  if (!logout_container) {
    console.log("logout_svg.js: .logout-container elementtiä ei löytynyt!");
    return;
  }

  // 1) Luodaan DOMParser, jotta saamme oikean <svg>-elementin
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(logout_icon_svg, 'image/svg+xml');
  const parsedSvg = svgDoc.documentElement; // varsinaisen <svg> -elementin juuri

  // 2) Luodaan logout-nappi
  const logout_button = document.createElement('button');
  logout_button.id = 'logout_button';

  // 3) Lisätään SVG-elementti sen sisälle
  logout_button.replaceChildren(parsedSvg);

  // 4) Korvataan .logout-containerin sisältö uudella napilla
  logout_container.replaceChildren(logout_button);

  // 5) Lisätään klikkauskuuntelija
  logout_button.addEventListener('click', function() {
    window.location.href = '/logout';
  });
});
