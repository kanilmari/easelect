// if_is_admin.js
//export default function ifIsAdminReturn(isAdmin) {
export function ifIsAdmin(isAdmin) {
    // Check if the user is an admin
    localStorage.setItem("isAdmin", isAdmin);
    if (isAdmin) {
        return true;
    } else {
        return false;
    }
}
