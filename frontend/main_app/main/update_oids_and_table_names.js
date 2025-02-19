// update_oids_and_table_names.js

export async function update_oids_and_table_names() {
    try {
        const response = await fetch('/update-oids');
        if (!response.ok) {
            throw new Error(`error updating OID values: ${response.statusText}`);
        }
    } catch (error) {
        console.error('error updating OID values and table names:', error);
    }
}