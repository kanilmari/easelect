// register_tab.js

/**
 * Rakentaa "Register" -lomakkeen annetun containerin sisään.
 */
export async function generate_register_view(container) {
    try {
        container.replaceChildren(); // Tyhjennä vanha sisältö

        const heading = document.createElement('h2');
        heading.textContent = 'Register';
        container.appendChild(heading);

        const form = document.createElement('form');
        form.id = 'register_form';

        // Käyttäjätunnus
        const labelUser = document.createElement('label');
        labelUser.textContent = 'Choose Username';
        labelUser.setAttribute('for', 'reg_username_input');
        form.appendChild(labelUser);

        const inputUser = document.createElement('input');
        inputUser.type = 'text';
        inputUser.id = 'reg_username_input';
        inputUser.name = 'username';
        inputUser.required = true;
        form.appendChild(inputUser);

        // Sähköposti
        const labelEmail = document.createElement('label');
        labelEmail.textContent = 'Email';
        labelEmail.setAttribute('for', 'reg_email_input');
        form.appendChild(labelEmail);

        const inputEmail = document.createElement('input');
        inputEmail.type = 'email';
        inputEmail.id = 'reg_email_input';
        inputEmail.name = 'email';
        inputEmail.required = true;
        form.appendChild(inputEmail);

        // Salasana
        const labelPass = document.createElement('label');
        labelPass.textContent = 'Password';
        labelPass.setAttribute('for', 'reg_password_input');
        form.appendChild(labelPass);

        const inputPass = document.createElement('input');
        inputPass.type = 'password';
        inputPass.id = 'reg_password_input';
        inputPass.name = 'password';
        inputPass.required = true;
        form.appendChild(inputPass);

        // Submit
        const submitButton = document.createElement('button');
        submitButton.type = 'submit';
        submitButton.textContent = 'Register';
        form.appendChild(submitButton);

        form.addEventListener('submit', async (evt) => {
            evt.preventDefault();
            const usernameVal = inputUser.value;
            const emailVal = inputEmail.value;
            const passwordVal = inputPass.value;

            // Esimerkki: tee tässä fetch backendiin
            console.log('Register attempt:', { usernameVal, emailVal, passwordVal });
            // ... toteuta rekisteröinti

            // Tyhjennä kentät
            inputUser.value = '';
            inputEmail.value = '';
            inputPass.value = '';
        });

        container.appendChild(form);
    } catch (error) {
        console.error('Error in generate_register_view:', error);
    }
}
