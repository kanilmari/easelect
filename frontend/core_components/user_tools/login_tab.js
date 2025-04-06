// login_tab.js

/**
 * Rakentaa "Login" -lomakkeen annetun containerin sisään.
 */
export async function generate_login_view(container) {
    try {
        container.replaceChildren(); // Tyhjennä vanha sisältö

        const heading = document.createElement('h2');
        heading.textContent = 'Login';
        container.appendChild(heading);

        const form = document.createElement('form');
        form.id = 'login_form';

        // Käyttäjätunnus
        const labelUser = document.createElement('label');
        labelUser.textContent = 'Username';
        labelUser.setAttribute('for', 'username_input');
        form.appendChild(labelUser);

        const inputUser = document.createElement('input');
        inputUser.type = 'text';
        inputUser.id = 'username_input';
        inputUser.name = 'username';
        inputUser.required = true;
        form.appendChild(inputUser);

        // Salasana
        const labelPass = document.createElement('label');
        labelPass.textContent = 'Password';
        labelPass.setAttribute('for', 'password_input');
        form.appendChild(labelPass);

        const inputPass = document.createElement('input');
        inputPass.type = 'password';
        inputPass.id = 'password_input';
        inputPass.name = 'password';
        inputPass.required = true;
        form.appendChild(inputPass);

        // Lähetysnappi
        const submitButton = document.createElement('button');
        submitButton.type = 'submit';
        submitButton.textContent = 'Login';
        form.appendChild(submitButton);

        // Lomakkeen submit-tapahtuma
        form.addEventListener('submit', async (evt) => {
            evt.preventDefault();
            const usernameVal = inputUser.value;
            const passwordVal = inputPass.value;

            // Esimerkki: tee tässä fetch backendiin, tms.
            console.log('Login attempt:', { usernameVal, passwordVal });
            // ... toteuta sisäänkirjautuminen

            // Tyhjennä kentät
            inputUser.value = '';
            inputPass.value = '';
        });

        container.appendChild(form);
    } catch (error) {
        console.error('Error in generate_login_view:', error);
    }
}
