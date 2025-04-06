// user_profile_tab.js

/**
 * Rakentaa "User Profile" -näkymän annetun containerin sisään.
 */
export async function generate_user_view(container) {
    try {
        container.replaceChildren(); // Tyhjennä vanha sisältö

        const heading = document.createElement('h2');
        heading.textContent = 'User Profile';
        container.appendChild(heading);

        // Esimerkki: näytetään joku perustieto
        const userInfoDiv = document.createElement('div');
        userInfoDiv.textContent = 'Welcome! Here you can see your user profile details.';
        container.appendChild(userInfoDiv);

        // Esimerkki: profiilin muokkausnappi
        const editProfileButton = document.createElement('button');
        editProfileButton.textContent = 'Edit Profile';
        editProfileButton.addEventListener('click', () => {
            console.log('Profile editing not yet implemented.');
            // ... avaa esim. modaalin
        });
        container.appendChild(editProfileButton);

    } catch (error) {
        console.error('Error in generate_user_view:', error);
    }
}
