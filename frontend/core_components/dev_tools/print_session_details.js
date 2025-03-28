// print_session_details.js
export async function fetchAndDisplaySession() {
    try {
      const response = await fetch('/api/sessioninfo');
      if (!response.ok) {
        console.error('Virhe fetchissä /api/sessioninfo');
        return;
      }
    
      const sessionData = await response.json();
      const sessionDebugElement = document.getElementById('session_debug');
  
      if (sessionDebugElement) {
        // Tyhjennetään elementti ja lisätään pieni otsikko
        sessionDebugElement.innerHTML = '';
  
        const heading = document.createElement('div');
        heading.classList.add('sessionDebugHeader'); // Tyylitellään CSS:ssä
        heading.textContent = 'Session details';
        sessionDebugElement.appendChild(heading);
  
        // Luodaan lista
        const listEl = document.createElement('ul');
        listEl.classList.add('sessionDebugList'); // Tyylitellään CSS:ssä
  
        // Käydään läpi sessionData-olio
        Object.entries(sessionData).forEach(([key, value]) => {
          const listItem = document.createElement('li');
          listItem.classList.add('sessionDebugItem'); // Tyylitellään CSS:ssä
          listItem.textContent = `${key}: ${value}`;
          listEl.appendChild(listItem);
        });
  
        sessionDebugElement.appendChild(listEl);
      }
    } catch (err) {
      console.error('fetchAndDisplaySession -virhe:', err);
    }
  }
  
  window.addEventListener('DOMContentLoaded', () => {
    fetchAndDisplaySession();
  });
  