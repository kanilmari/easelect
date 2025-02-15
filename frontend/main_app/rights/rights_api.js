// rights_api.js
export async function save_usergroup_right() {
    const usergroup_id = document.getElementById('usergroup_select').value;
    const right_id = document.getElementById('right_select').value;
    const table_uid = document.getElementById('table_select').value;

    const data = {
        usergroup_id: parseInt(usergroup_id, 10),
        right_id: parseInt(right_id, 10),
        table_uid: parseInt(table_uid, 10)
    };

    try {
        const response = await fetch('/save-usergroup-right', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            alert('Oikeus tallennettu onnistuneesti!');
        } else if (response.status === 409) {
            alert('Oikeus on jo olemassa.');
        } else {
            alert('Virhe tallennettaessa oikeutta.');
        }
    } catch (error) {
        console.error('Virhe oikeutta tallennettaessa:', error);
        alert('Virhe tallennettaessa oikeutta.');
    }
}
