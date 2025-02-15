/**
 * Lyhentää description-kontin tekstiä dynaamisesti, jos se ylittää tietyn merkkirajan.
 * Käyttää CSS-luokkia .vanilla-shortener, .vanilla-shortener.expanded ja
 * .vanilla-shortener-toggle (jotka on määritelty erillisessä CSS:ssä).
 *
 * @param {HTMLElement} container - DOM-elementti, jonka tekstiä lyhennetään.
 * @param {Object} options - Asetusobjekti.
 * @param {string} options.shortMaxHeight - max-height (CSS) lyhennetyssä tilassa (fallback), esim. "80px". 
 *                                         Jos merkkijono on "0" tai tyhjä, lasketaan dynaamisesti.
 * @param {string} options.fullMaxHeight - max-height (CSS) laajennetussa tilassa (fallback), esim. "400px". 
 *                                        Jos merkkijono on "0" tai tyhjä, lasketaan dynaamisesti.
 * @param {number} options.maxCharacters - Merkkiraja, jota pitempi teksti lyhennetään.
 * @param {"inline"|"callback"} options.expandMode - Määrittää, laajennetaanko teksti "inline"
 *                                                  vai kutsutaanko annettuja callbackeja.
 * @param {Function|null} options.onExpand - Callback, jota kutsutaan laajennuksessa,
 *                                           jos expandMode="callback".
 * @param {Function|null} options.onCollapse - Callback, jota kutsutaan pienennyksessä,
 *                                            jos expandMode="callback".
 */
export function shortenContainer(
    container,
    {
      shortMaxHeight = '200px',
      fullMaxHeight = '400px',
      maxCharacters = 300,
      expandMode = 'inline',
      onExpand = null,
      onCollapse = null,
    } = {}
  ) {
    const fullText = container.textContent.trim();
    if (fullText.length <= maxCharacters) return; // ei tehdä mitään, jos teksti on jo tarpeeksi lyhyt
  
    // Lyhennetty teksti
    const shortText = fullText.slice(0, maxCharacters) + '...';
  
    // -------------------------------------
    // Apufunktio, joka mittaa korkeuden (px)
    // -------------------------------------
    const measureHeight = (text) => {
      const clone = container.cloneNode(false);  // kopioi vain elementin, ei lapsia
      // Asetetaan mittausta varten mielivaltaiset tyylit
      clone.style.position = 'absolute';
      clone.style.visibility = 'hidden';
      clone.style.height = 'auto';
      clone.style.maxHeight = 'none';
      clone.style.overflow = 'visible';
      clone.style.whiteSpace = 'normal';
      clone.style.wordWrap = 'break-word';
      clone.style.overflowWrap = 'break-word';
      // Heitetään testiteksti sisään
      clone.textContent = text;
  
      // Lisätään bodyyn ja mitataan
      document.body.appendChild(clone);
      const height = clone.scrollHeight;
      // Poistetaan mittauskopio
      document.body.removeChild(clone);
  
      return height;
    };
  
    // Jos shortMaxHeight on "0" tai tyhjä, mitataan lyhennetty teksti
    if (!shortMaxHeight || shortMaxHeight === '0') {
      const measuredShortHeight = measureHeight(shortText);
      shortMaxHeight = measuredShortHeight + 'px';
    }
  
    // Jos fullMaxHeight on "0" tai tyhjä, mitataan koko teksti
    if (!fullMaxHeight || fullMaxHeight === '0') {
      const measuredFullHeight = measureHeight(fullText);
      fullMaxHeight = measuredFullHeight + 'px';
    }
  
    // Luo elementit
    const shortSpan = document.createElement('span');
    shortSpan.textContent = shortText;
  
    const fullSpan = document.createElement('span');
    fullSpan.textContent = fullText;
    fullSpan.style.display = 'none';
  
    // Tyhjennä ja aseta perusluokka
    container.textContent = '';
    container.classList.add('vanilla-shortener');
    container.style.maxHeight = shortMaxHeight; // aluksi lyhennettynä
  
    // Itse teksti (lyhennetty / täysi)
    container.appendChild(shortSpan);
    container.appendChild(fullSpan);
  
    // Luodaan linkki
    const toggleLink = document.createElement('a');
    toggleLink.href = '#';
    toggleLink.textContent = 'Näytä kaikki';
    toggleLink.classList.add('vanilla-shortener-toggle');
  
    // Luodaan "palkki" (tyyli vapaa)
    const absoluteBar = document.createElement('div');
    absoluteBar.classList.add('absolute-toggle-bar');
    absoluteBar.appendChild(toggleLink);
  
    // Lisätään palkki konttiin
    container.appendChild(absoluteBar);
  
    // Klikkitoiminto
    toggleLink.addEventListener('click', e => {
      e.preventDefault();
      const is_expanded = container.classList.contains('expanded');
  
      if (!is_expanded) {
        // LAJENNUS
        if (expandMode === 'inline') {
          // Normaalisti laajennetaan tekstiä
          shortSpan.style.display = 'none';
          fullSpan.style.display = 'inline';
          container.classList.add('expanded');
          container.style.maxHeight = fullMaxHeight;
          toggleLink.textContent = 'Pienennä';
        } else if (expandMode === 'callback') {
          // Kutsutaan ulkoista callbackia
          if (typeof onExpand === 'function') {
            onExpand({ container, fullText, shortText });
          }
        }
      } else {
        // PIENENNYS
        if (expandMode === 'inline') {
          // Pienennetään animoimalla
          container.classList.remove('expanded');
          container.style.maxHeight = shortMaxHeight;
          toggleLink.textContent = 'Näytä kaikki';
  
          // Odotetaan, että max-height siirtymä loppuu, ennen kuin vaihdetaan tekstin näkyvyyttä.
          const on_transition_end = (event) => {
            if (event.propertyName === 'max-height') {
              shortSpan.style.display = 'inline';
              fullSpan.style.display = 'none';
              container.removeEventListener('transitionend', on_transition_end);
            }
          };
          container.addEventListener('transitionend', on_transition_end);
        } else if (expandMode === 'callback') {
          // Kutsutaan ulkoista callbackia
          if (typeof onCollapse === 'function') {
            onCollapse({ container, fullText, shortText });
          }
        }
      }
    });
  }
  

// /**
//  * Lyhentää description-kontin tekstiä dynaamisesti, jos se ylittää tietyn merkkirajan.
//  * Käyttää CSS-luokkia .vanilla-shortener, .vanilla-shortener.expanded ja
//  * .vanilla-shortener-toggle (jotka on määritelty erillisessä CSS:ssä).
//  *
//  * @param {HTMLElement} container - DOM-elementti, jonka tekstiä lyhennetään.
//  * @param {Object} options - Asetusobjekti.
//  * @param {string} options.shortMaxHeight - max-height (CSS) lyhennetyssä tilassa (fallback), esim. "80px". 
//  *                                         Jos merkkijono on "0" tai tyhjä, lasketaan dynaamisesti.
//  * @param {string} options.fullMaxHeight - max-height (CSS) laajennetussa tilassa (fallback), esim. "400px". 
//  *                                        Jos merkkijono on "0" tai tyhjä, lasketaan dynaamisesti.
//  * @param {number} options.maxCharacters - Merkkiraja, jota pitempi teksti lyhennetään.
//  */
// export function shortenContainer(
//   container,
//   {
//     shortMaxHeight = '200px',
//     fullMaxHeight = '400px',
//     maxCharacters = 300
//   } = {}
// ) {
//   const fullText = container.textContent.trim();
//   if (fullText.length <= maxCharacters) return;

//   // Lyhennetty teksti
//   const shortText = fullText.slice(0, maxCharacters) + '...';

//   // -------------------------------------
//   // Apufunktio, joka mittaa korkeuden (px)
//   // -------------------------------------
//   const measureHeight = (text) => {
//     const clone = container.cloneNode(false);  // kopioi vain elementin, ei lapsia
//     // Asetetaan mittausta varten mielivaltaiset tyylit
//     clone.style.position = 'absolute';
//     clone.style.visibility = 'hidden';
//     clone.style.height = 'auto';
//     clone.style.maxHeight = 'none';
//     clone.style.overflow = 'visible';
//     clone.style.whiteSpace = 'normal';
//     clone.style.wordWrap = 'break-word';
//     clone.style.overflowWrap = 'break-word';
//     // Heitetään testiteksti sisään
//     clone.textContent = text;

//     // Lisätään bodyyn ja mitataan
//     document.body.appendChild(clone);
//     const height = clone.scrollHeight;
//     // Poistetaan mittauskopio
//     document.body.removeChild(clone);

//     return height;
//   };

//   // Jos shortMaxHeight on "0" tai tyhjä, mitataan lyhennetty teksti
//   if (!shortMaxHeight || shortMaxHeight === '0') {
//     const measuredShortHeight = measureHeight(shortText);
//     shortMaxHeight = measuredShortHeight + 'px';
//   }

//   // Jos fullMaxHeight on "0" tai tyhjä, mitataan koko teksti
//   if (!fullMaxHeight || fullMaxHeight === '0') {
//     const measuredFullHeight = measureHeight(fullText);
//     fullMaxHeight = measuredFullHeight + 'px';
//   }

//   // Luo elementit
//   const shortSpan = document.createElement('span');
//   shortSpan.textContent = shortText;

//   const fullSpan = document.createElement('span');
//   fullSpan.textContent = fullText;
//   fullSpan.style.display = 'none';

//   // Tyhjennä ja aseta perusluokka
//   container.textContent = '';
//   container.classList.add('vanilla-shortener');
//   container.style.maxHeight = shortMaxHeight; // aluksi lyhennettynä

//   // Itse teksti (lyhennetty / täysi)
//   container.appendChild(shortSpan);
//   container.appendChild(fullSpan);

//   // Luodaan linkki
//   const toggleLink = document.createElement('a');
//   toggleLink.href = '#';
//   toggleLink.textContent = 'Näytä kaikki';
//   toggleLink.classList.add('vanilla-shortener-toggle');

//   // Luodaan "palkki"
//   const absoluteBar = document.createElement('div');
//   absoluteBar.classList.add('absolute-toggle-bar');
//   absoluteBar.appendChild(toggleLink);

//   // Lisätään palkki konttiin
//   container.appendChild(absoluteBar);

//   // Klikkitoiminto
//   toggleLink.addEventListener('click', e => {
//     e.preventDefault();
//     const is_expanded = container.classList.contains('expanded');

//     if (!is_expanded) {
//       // Laajennus: näytetään koko teksti heti, jotta säiliön sisältö kasvaa.
//       shortSpan.style.display = 'none';
//       fullSpan.style.display = 'inline';
//       container.classList.add('expanded');
//       container.style.maxHeight = fullMaxHeight;
//       toggleLink.textContent = 'Pienennä';
//     } else {
//       // Pienennys: animoi säiliön pienentäminen ennen tekstin vaihtoa.
//       container.classList.remove('expanded');
//       container.style.maxHeight = shortMaxHeight;
//       toggleLink.textContent = 'Näytä kaikki';

//       // Odotetaan, että max-height siirtymä loppuu, ennen kuin vaihdetaan tekstin näkyvyyttä.
//       const on_transition_end = (event) => {
//         if (event.propertyName === 'max-height') {
//           shortSpan.style.display = 'inline';
//           fullSpan.style.display = 'none';
//           container.removeEventListener('transitionend', on_transition_end);
//         }
//       };
//       container.addEventListener('transitionend', on_transition_end);
//     }
//   });
// }

// // /**
// //  * Lyhentää description-kontin tekstiä, jos se ylittää tietyn merkkirajan.
// //  * Käyttää CSS-luokkia .vanilla-shortener, .vanilla-shortener.expanded ja
// //  * .vanilla-shortener-toggle (jotka on määritelty erillisessä CSS:ssä).
// //  *
// //  * @param {HTMLElement} container - DOM-elementti, jonka tekstiä lyhennetään.
// //  * @param {Object} options - Asetusobjekti.
// //  * @param {string} options.shortMaxHeight - max-height (CSS) lyhennetyssä tilassa, esim. "80px".
// //  * @param {string} options.fullMaxHeight - max-height (CSS) laajennetussa tilassa, esim. "400px".
// //  * @param {number} options.maxCharacters - Merkkiraja, jota pitempi teksti lyhennetään.
// //  */
// // export function shortenContainer(
// //     container,
// //     {
// //       shortMaxHeight = '0',
// //       fullMaxHeight = '400px',
// //       maxCharacters = 300
// //     } = {}
// //   ) {
// //     const fullText = container.textContent.trim();
// //     if (fullText.length <= maxCharacters) return;
  
// //     const shortText = fullText.slice(0, maxCharacters) + '...';
  
// //     // Luo elementit
// //     const shortSpan = document.createElement('span');
// //     shortSpan.textContent = shortText;
  
// //     const fullSpan = document.createElement('span');
// //     fullSpan.textContent = fullText;
// //     fullSpan.style.display = 'none';
  
// //     // Tyhjennä ja aseta perusluokat
// //     container.textContent = '';
// //     container.classList.add('vanilla-shortener');
// //     container.style.maxHeight = shortMaxHeight; // aluksi lyhennettynä
  
// //     // Itse teksti (lyhennetty / täysi)
// //     container.appendChild(shortSpan);
// //     container.appendChild(fullSpan);
  
// //     // Luodaan linkki
// //     const toggleLink = document.createElement('a');
// //     toggleLink.href = '#';
// //     toggleLink.textContent = 'Näytä kaikki';
// //     toggleLink.classList.add('vanilla-shortener-toggle');
  
// //     // Luodaan "palkki"
// //     const absoluteBar = document.createElement('div');
// //     absoluteBar.classList.add('absolute-toggle-bar');
// //     absoluteBar.appendChild(toggleLink);
  
// //     // Lisätään palkki konttiin
// //     container.appendChild(absoluteBar);
  
// //     // Klikkitoiminto
// //     toggleLink.addEventListener('click', e => {
// //       e.preventDefault();
// //       const is_expanded = container.classList.contains('expanded');
  
// //       if (!is_expanded) {
// //         // Laajennus: näytetään koko teksti heti, jotta säiliön sisältö kasvaa.
// //         shortSpan.style.display = 'none';
// //         fullSpan.style.display = 'inline';
// //         container.classList.add('expanded');
// //         container.style.maxHeight = fullMaxHeight;
// //         toggleLink.textContent = 'Pienennä';
// //       } else {
// //         // Pienennys: animoi säiliön pienentäminen ennen tekstin vaihtoa.
// //         container.classList.remove('expanded');
// //         container.style.maxHeight = shortMaxHeight;
// //         toggleLink.textContent = 'Näytä kaikki';
  
// //         // Odota, että max-height siirtymä loppuu, ennen kuin vaihdetaan tekstin näkyvyyttä.
// //         const on_transition_end = event => {
// //           if (event.propertyName === 'max-height') {
// //             shortSpan.style.display = 'inline';
// //             fullSpan.style.display = 'none';
// //             container.removeEventListener('transitionend', on_transition_end);
// //           }
// //         };
// //         container.addEventListener('transitionend', on_transition_end);
// //       }
// //     });
// //   }
  