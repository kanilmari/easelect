/**
 * Luo SHA-256 -pohjainen "avatar" annetusta siemenarvosta. 
 */
export async function create_seeded_avatar(seed_string, letter_for_avatar, useLargeSize = false) {
    // Lasketaan seed_string -> SHA-256 (hex)
    const msgUint8 = new TextEncoder().encode(seed_string);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Otetaan osa hashista numeriseen muotoon satunnaisuutta varten
    const numericHashPart_for_color = parseInt(hashHex.slice(0, 8), 16);
    const numericHashPart_for_radius = parseInt(hashHex.slice(8, 16), 16);

    // Määritetään maksimi merkkimäärä
    const max_chars = 16;
    let final_text = '?';
    if (letter_for_avatar) {
        if (letter_for_avatar.length > max_chars) {
            final_text = letter_for_avatar.slice(0, max_chars) + '...';
        } else {
            final_text = letter_for_avatar;
        }
    }
    const final_letter = final_text.toUpperCase();

    // Taustavärin laskenta HSL-muodossa
    const hue_value = numericHashPart_for_color % 360;
    const saturation_value = 30;  // Tummahko
    const lightness_value = 40;
    const chosen_color_hsl = `hsl(${hue_value}, ${saturation_value}%, ${lightness_value}%)`;

    // Border-radiaalin laskenta
    const random_radius = (numericHashPart_for_radius % 30) + 1;
    const chosen_border_radius = `${random_radius}%`;

    // Fontit
    const fonts = [
        'Arial, sans-serif',
        '"Times New Roman", Times, serif',
        'Consolas, monospace',
        'Verdana, Geneva, sans-serif',
        '"Trebuchet MS", Helvetica, sans-serif',
        'Georgia, serif',
        '"Palatino Linotype", "Book Antiqua", Palatino, serif'
    ];
    const font_index = (numericHashPart_for_color >>> 8) % fonts.length;
    const chosen_font = fonts[font_index];

    // Jos haluamme ison 300x300 tai pienen 120x120
    const containerSize = useLargeSize ? 300 : 120;
    const avatarBoxSize = useLargeSize ? 220 : 120;

    // Container
    const container_div = document.createElement('div');
    container_div.style.width = containerSize + 'px';
    container_div.style.height = containerSize + 'px';
    container_div.style.display = 'flex';
    container_div.style.alignItems = 'center';
    container_div.style.justifyContent = 'center';
    container_div.style.overflow = 'hidden';

    // Avatar-elementti
    const avatar_div = document.createElement('div');
    avatar_div.textContent = final_letter;
    avatar_div.style.display = 'flex';
    avatar_div.style.alignItems = 'center';
    avatar_div.style.justifyContent = 'center';
    avatar_div.style.width = avatarBoxSize + 'px';
    avatar_div.style.height = avatarBoxSize + 'px';
    avatar_div.style.backgroundColor = chosen_color_hsl;
    avatar_div.style.fontFamily = chosen_font;
    avatar_div.style.fontWeight = 'bold';
    avatar_div.style.fontSize = useLargeSize ? '7rem' : '4rem';
    avatar_div.style.color = '#fff';
    avatar_div.style.textShadow = '2px 2px 5px rgba(0, 0, 0, 0.5)';
    avatar_div.style.borderRadius = chosen_border_radius;

    container_div.appendChild(avatar_div);
    return container_div;
}

/**
 * Luo fancy-kuvaelementin. PNG-kuville ei lisätä varjoa, sumennusta eikä pyöristettyjä kulmia.
 */
export function createImageElement(image_src, useLargeSize) {
    const wrapper = document.createElement('div');
    wrapper.style.width = useLargeSize ? '300px' : '140px';
    wrapper.style.height = useLargeSize ? '300px' : '140px';
    wrapper.style.position = 'relative';
    // wrapper.style.overflow = 'hidden';  // avaa halutessasi

    const foregroundImg = document.createElement('img');
    const isPng = image_src.toLowerCase().endsWith('.png');

    if (!isPng) {
        // Muille kuin PNG-kuville lisätään pyöristys, varjo ja (halutessa) blur-tausta
        wrapper.style.background = 'var(--bg_color)';
        
        wrapper.style.borderRadius = '7px';
        // wrapper.style.border = '1px solid var(--border_color)';
        foregroundImg.style.borderRadius = '6px';
        // foregroundImg.style.border = '1px solid var(--border_color)';
        wrapper.style.boxShadow = '2px 2px 4px rgba(0, 0, 0, 0.2)';
        
        wrapper.style.backdropFilter = 'blur(10px)';
        wrapper.style.webkitBackdropFilter = 'blur(10px)';
        // Alla oleva blur-elementti on optio, voit avata sen kommentoimalla sisällön näkyviin:
        /*
        const blurredBg = document.createElement('div');
        blurredBg.style.position = 'absolute';
        blurredBg.style.top = '0';
        blurredBg.style.left = '0';
        blurredBg.style.right = '0';
        blurredBg.style.bottom = '0';
        blurredBg.style.backgroundImage = `url(${image_src})`;
        blurredBg.style.backgroundSize = 'cover';
        blurredBg.style.backgroundPosition = 'center';
        blurredBg.style.filter = 'blur(40px)';
        blurredBg.style.opacity = '0.8';
        blurredBg.style.filter += ' saturate(80%)';
        wrapper.appendChild(blurredBg);
        */
    }

    // Näytettävä kuva
    foregroundImg.src = image_src;
    foregroundImg.alt = 'Kuva puuttuu';
    foregroundImg.style.position = 'relative';
    foregroundImg.style.width = '100%';
    foregroundImg.style.height = '100%';
    foregroundImg.style.objectFit = 'contain';  // pidetään kuva kokonaan näkyvissä
    foregroundImg.style.objectPosition = 'center';

    wrapper.appendChild(foregroundImg);
    // add style: wrapper.backdrop-filter: blur(10px);
    wrapper.style.backdropFilter = 'blur(10px)';
    
    // Hey copilot, add class named "random"
    wrapper.classList.add('wrapper');
    
    /*
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: '-webkit solid var(--border_color)';
    border: 1px solid rgba(255, 255, 255, 0.18);
    border: '1px solid var(--border_color)';
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    position: absolute;
    z-index: 10001;
    */


    // wrapper.style.border = '1px solid rgba(255, 255, 255, 0.18)';
    // wrapper.style.boxShadow = '0 8px 32px 0 rgba(0, 0, 0, 0.37)';
    // wrapper.style.position = 'absolute';
    // wrapper.style.zIndex = '10001';
    // wrapper
    return wrapper;
}

