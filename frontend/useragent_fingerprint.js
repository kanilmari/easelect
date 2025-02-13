// useragent_fingerprint.js

export async function gather_browser_fingerprint_hash() {
    const fingerprint_data = {
        user_agent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        cookie_enabled: navigator.cookieEnabled,
        device_memory: navigator.deviceMemory || 'not_supported',
        hardware_concurrency: navigator.hardwareConcurrency || 'not_supported',
        screen_width: screen.width,
        screen_height: screen.height,
        color_depth: screen.colorDepth,
        timezone_offset: new Date().getTimezoneOffset(),
        do_not_track: navigator.doNotTrack || 'unspecified'
    };

    console.log('Selaimen sormenjälkeen liittyvät tiedot:', fingerprint_data);

    // Muutetaan objektimme JSON-merkkijonoksi
    const json_str = JSON.stringify(fingerprint_data);

    // Hashataan merkkijono:
    const encoder = new TextEncoder();
    const data = encoder.encode(json_str);
    const hash_buffer = await crypto.subtle.digest("SHA-256", data);
    const hash_array = Array.from(new Uint8Array(hash_buffer));
    const hash_hex = hash_array.map(b => b.toString(16).padStart(2, '0')).join('');

    return hash_hex;
}
