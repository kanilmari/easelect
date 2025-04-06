// endpoint_router.js
// import { gather_browser_fingerprint_hash } from '../auth/login.js'; // säilytä tämä rivi

// Keskitä kaikki reittikutsut tänne:
// Yksinkertainen reititin, joka keskittää palvelimelle menevät pyynnöt
const endpoint_map = {
    fetchContentTables: '/api/tables',
    // Lisätty uudet reitit:
    fetchForeignKeys: '/foreign_keys',
    addForeignKey: '/add_foreign_key',
    deleteForeignKey: '/delete_foreign_key',
    fetchDynamicChildren: '/api/fetch-dynamic-children',
    fetchAuthModes: '/api/auth-modes',
};

export async function endpoint_router(route_name, { method = 'GET', body_data = null } = {}) {
    console.log('endpoint_router in action...');
    try {
        const endpoint_url = endpoint_map[route_name];
        if (!endpoint_url) {
            throw new Error(`Tuntematon reitti: ${route_name}`);
        }

        // Lasketaan sormenjälki ja tulostetaan se lokiin // säilytä tämä rivi
        // const fingerprint_hash = await gather_browser_fingerprint_hash(); // säilytä tämä rivi
        // console.log('Selaimen sormenjälki:', fingerprint_hash); // säilytä tämä rivi

        const fetch_options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (body_data) {
            fetch_options.body = JSON.stringify(body_data);
        }

        const response = await fetch(endpoint_url, fetch_options);
        if (!response.ok) {
            const error_text = await response.text();
            console.error('Virhe pyynnössä:', error_text);
            throw new Error(`Virhe pyynnössä: ${error_text}`);
        }

        return await response.json();
    } catch (err) {
        console.error('endpoint_router error:', err);
        throw err;
    }
}
