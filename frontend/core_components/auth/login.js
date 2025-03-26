// login.js

// Kerätään selaimen fingerprint-dataa
function gather_browser_fingerprint_data() {
    return {
        user_agent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        cookie_enabled: navigator.cookieEnabled,
        screen_width: screen.width,
        screen_height: screen.height,
        color_depth: screen.colorDepth
    };
}

// Lasketaan SHA-256 hash JSON-kuvauksesta
// Huom. vaatii HTTPS, jotta crypto.subtle on käytettävissä.
export async function gather_browser_fingerprint_hash() {
    const data_obj = gather_browser_fingerprint_data();
    const json_str = JSON.stringify(data_obj);

    const encoder = new TextEncoder();
    const encoded_data = encoder.encode(json_str);
    const hash_buffer = await crypto.subtle.digest("SHA-256", encoded_data);
    const hash_array = Array.from(new Uint8Array(hash_buffer));
    const hash_hex = hash_array.map(b => b.toString(16).padStart(2, '0')).join('');
    return hash_hex;
}

// Lisätään submit-event listener, joka varmistaa, että fingerprint lasketaan ennen lomakkeen lähettämistä
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.querySelector('form');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            try {
                const hash_value = await gather_browser_fingerprint_hash();
                document.getElementById('fingerprint').value = hash_value;
                console.log('fingerprint:' + hash_value);
            } catch (err) {
                console.error('Virhe sormenjäljen laskennassa:', err);
            }
            // Kun fingerprint on asetettu, lähetetään lomake
            loginForm.submit();
        });
    }
});
