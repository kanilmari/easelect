var menuLanguageSVG = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86q54.5 54.5 86 127T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Zm0-82q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-104-16q-18-33-31.5-68.5T322-320H204q29 50 72.5 87t99.5 55Zm208 0q56-18 99.5-55t72.5-87H638q-9 38-22.5 73.5T584-178ZM170-400h136q-3-20-4.5-39.5T300-480q0-21 1.5-40.5T306-560H170q-5 20-7.5 39.5T160-480q0 21 2.5 40.5T170-400Zm216 0h188q3-20 4.5-39.5T580-480q0-21-1.5-40.5T574-560H386q-3 20-4.5 39.5T380-480q0 21 1.5 40.5T386-400Zm268 0h136q5-20 7.5-39.5T800-480q0-21-2.5-40.5T790-560H654q3 20 4.5 39.5T660-480q0 21-1.5 40.5T654-400Zm-16-240h118q-29-50-72.5-87T584-782q18 33 31.5 68.5T638-640Zm-234 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h118q9-38 22.5-73.5T376-782q-56 18-99.5 55T204-640Z"/></svg>';

// Svg-kuvien lisääminen tehty ylempänä...
document.addEventListener('DOMContentLoaded', function () {
	// Yleinen funktio kielipalkkien avaamiseen/sulkemiseen
	function toggleLanguagePanel(panelToToggle) {
		var itemsDiv = panelToToggle.nextElementSibling;
		// Sulje kaikki muut kielipalkit
		document.querySelectorAll('.language-selection .select-items').forEach(function (otherItemsDiv) {
			if (otherItemsDiv !== itemsDiv) {
				otherItemsDiv.classList.add('select-hide');
				otherItemsDiv.previousElementSibling.classList.remove('select-arrow-active');
			}
		});
		// Avaa tai sulje tämä palkki
		itemsDiv.classList.toggle('select-hide');
		panelToToggle.classList.toggle('select-arrow-active');
	}

	// Lisää event listenerit kielipalkkien avaamiseen/sulkemiseen
	document.querySelectorAll('.language-selection .select-selected').forEach(function (selectedDiv) {
		selectedDiv.addEventListener('click', function () {
			toggleLanguagePanel(selectedDiv);
		});
	});

	// Aseta event listenerit valikkokielille
	document.querySelectorAll('.menu-language-selection input[type="radio"]').forEach(function (radio) {
		radio.addEventListener('change', updateMenuLanguageDisplay);
	});

	// Aseta oletusarvoisesti valitut kielet
	setDefaultMenuLanguage();

	// Alustus
	updateMenuLanguageDisplay();
	// updateServiceLanguageDisplay();
});

function setDefaultMenuLanguage() {
	// Aseta valikkokieli
	var defaultMenuLang = navigator.language.split('-')[0]; // Otetaan kielen lyhyt muoto, esim. 'en'
	var menuLangRadio = document.querySelector('.menu-language-selection input[type="radio"][value="' + defaultMenuLang + '"]');
	if (menuLangRadio) {
		menuLangRadio.checked = true;
	}
}

export async function updateMenuLanguageDisplay() {
	var selectedMenuLanguage = document.querySelector('.menu-language-selection input[type="radio"]:checked')?.value;
	var displayElement = document.querySelector('.menu-language-selection .select-selected');
	if (displayElement) {
		displayElement.innerHTML = menuLanguageSVG + '&#x2004;' + (getShortLanguageCode(selectedMenuLanguage) + "&#x2009;" || "Select Menu Language");
	}
}

function getShortLanguageCode(languageCode) {
	var shortCodes = {
		'en': 'EN',
		'fi': 'FI',
		'sv': 'SV',
		'ch': 'CH',
		// Lisää muita kieliä tarvittaessa
	};
	return shortCodes[languageCode] || languageCode;
}

// function getLanguageDisplayName(languageCode) {
// 	var languageNames = {
// 		'en': 'English',
// 		'fi': 'Finnish',
// 		'sv': 'Swedish',
// 		'ch': 'Chinese',
// 		// Lisää muita kieliä tarvittaessa
// 	};
// 	return languageNames[languageCode] || languageCode;
// }