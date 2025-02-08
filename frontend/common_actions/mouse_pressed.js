
// not yet implemented, but allows to separate events already when mouse is being pressed down, and not after it.
export async function mouse_pressed(event) {
    let viesti = '';

    // Tarkista mikä hiiren painike painettiin
    switch (event.button) {
        case 0:
            viesti = 'Vasen painike painettu';
            break;
        case 1:
            viesti = 'Keskimmäinen painike painettu';
            break;
        case 2:
            viesti = 'Oikea painike painettu';
            break;
        default:
            viesti = 'Tuntematon painike painettu';
    }

    // Lisää tieto Ctrl- ja Shift-näppäimistä
    if (event.ctrlKey) {
        viesti += ' (CTRL pohjassa)';
    }
    if (event.shiftKey) {
        viesti += ' (SHIFT pohjassa)';
    }

    // Näytä viesti
    alert(viesti);
}

// CTRL + click = open link in new tab, background
// CTRL + SHIFT + click = open link in new tab, foreground
// SHIFT + click = open link in new window, foreground