// if_isAdmin_return_true.js
//export default function ifIsAdminReturn(isAdmin) {
export function ifIsAdminReturnTrue(isAdmin) {
    // Check if the user is an admin
    localStorage.setItem("isAdmin", isAdmin);
    if (isAdmin) {
        return true;
    } else {
        return false;
    }
}
