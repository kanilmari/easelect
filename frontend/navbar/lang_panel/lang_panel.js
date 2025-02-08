var menuLanguageSVG = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86q54.5 54.5 86 127T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Zm0-82q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-104-16q-18-33-31.5-68.5T322-320H204q29 50 72.5 87t99.5 55Zm208 0q56-18 99.5-55t72.5-87H638q-9 38-22.5 73.5T584-178ZM170-400h136q-3-20-4.5-39.5T300-480q0-21 1.5-40.5T306-560H170q-5 20-7.5 39.5T160-480q0 21 2.5 40.5T170-400Zm216 0h188q3-20 4.5-39.5T580-480q0-21-1.5-40.5T574-560H386q-3 20-4.5 39.5T380-480q0 21 1.5 40.5T386-400Zm268 0h136q5-20 7.5-39.5T800-480q0-21-2.5-40.5T790-560H654q3 20 4.5 39.5T660-480q0 21-1.5 40.5T654-400Zm-16-240h118q-29-50-72.5-87T584-782q18 33 31.5 68.5T638-640Zm-234 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h118q9-38 22.5-73.5T376-782q-56 18-99.5 55T204-640Z"/></svg>';
var serviceLanguageSVG = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="m476-80 182-480h84L924-80h-84l-43-122H603L560-80h-84ZM160-200l-56-56 202-202q-35-35-63.5-80T190-640h84q20 39 40 68t48 58q33-33 68.5-92.5T484-720H40v-80h280v-80h80v80h280v80H564q-21 72-63 148t-83 116l96 98-30 82-122-125-202 201Zm468-72h144l-72-204-72 204Z"/></svg>';
var serviceLanguageSVG2 = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M440-160q-17 0-28.5-11.5T400-200v-240L168-736q-15-20-4.5-42t36.5-22h560q26 0 36.5 22t-4.5 42L560-440v240q0 17-11.5 28.5T520-160h-80Zm40-308 198-252H282l198 252Zm0 0Z"/></svg>';
var serviceLanguageSVG3 = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M320-280q17 0 28.5-11.5T360-320q0-17-11.5-28.5T320-360q-17 0-28.5 11.5T280-320q0 17 11.5 28.5T320-280Zm0-160q17 0 28.5-11.5T360-480q0-17-11.5-28.5T320-520q-17 0-28.5 11.5T280-480q0 17 11.5 28.5T320-440Zm0-160q17 0 28.5-11.5T360-640q0-17-11.5-28.5T320-680q-17 0-28.5 11.5T280-640q0 17 11.5 28.5T320-600Zm120 320h240v-80H440v80Zm0-160h240v-80H440v80Zm0-160h240v-80H440v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z"/></svg>';
var arrowSVG = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/></svg>';

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

function getLanguageDisplayName(languageCode) {
	var languageNames = {
		'en': 'English',
		'fi': 'Finnish',
		'sv': 'Swedish',
		'ch': 'Chinese',
		// Lisää muita kieliä tarvittaessa
	};
	return languageNames[languageCode] || languageCode;
}