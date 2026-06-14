/* =========================================
   COUNTRY DATABASE (EXTENDED FOR DEV-LAND)
   ========================================= */
const countriesDatabase = {
    "0": { name: "DEV-Land (Anachya)", type: "sticker", icon: "rocket" },
    "7": { name: "Russia", type: "flag", icon: "ru" },
    "49": { name: "Germany", type: "flag", icon: "de" },
    "33": { name: "France", type: "flag", icon: "fr" },
    "380": { name: "Ukraine", type: "flag", icon: "ua" },
    "44": { name: "UK", type: "flag", icon: "gb" },
    "1": { name: "USA", type: "flag", icon: "us" },
    "31": { name: "Netherlands", type: "flag", icon: "nl" }
};

/* =========================================
   LOGIN & VERIFICATION LOGIC (EXTENDED)
   ========================================= */

document.getElementById('countryCode').addEventListener('input', function() {
    const inputCode = this.value;
    const infoDisplayElement = document.getElementById('countryInfo');
    const phoneInputElement = document.getElementById('phone');
    
    // Log info for debugging
    console.log("Country code input changed: " + inputCode);
    
    if (countriesDatabase[inputCode]) {
        console.log("Country found: " + countriesDatabase[inputCode].name);
        infoDisplayElement.innerHTML = `<span class="flag-icon flag-icon-${countriesDatabase[inputCode].icon}"></span> ${countriesDatabase[inputCode].name}`;
        // Auto-focus phone input if code is valid
        phoneInputElement.focus();
    } else {
        infoDisplayElement.innerHTML = inputCode.length > 0 ? "Unknown code" : "";
    }
});

function validateAndProceed() {
    const phoneValue = document.getElementById('phone').value;
    const codeValue = document.getElementById('countryCode').value;
    
    console.log("Attempting sign up with phone: " + phoneValue);
    
    if (phoneValue.length >= 7 && countriesDatabase[codeValue]) {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('verify-view').style.display = 'flex';
        document.getElementById('phone-info').innerText = `Sending code to +${codeValue}${phoneValue}`;
    } else {
        console.warn("Invalid phone or country code.");
        document.getElementById('error-message').style.display = "block";
    }
}

function handleCodeInput(element) {
    if (element.value.length > 1) {
        element.value = element.value.slice(0, 1);
    }
    if (element.value && element.nextElementSibling) {
        element.nextElementSibling.focus();
    }
    
    const allDigitElements = document.querySelectorAll('.code-digit');
    let generatedCodeString = "";
    allDigitElements.forEach(digit => generatedCodeString += digit.value);
    
    if (generatedCodeString.length === 5) {
        console.log("Code entered completely: " + generatedCodeString);
        // The master code
        if (generatedCodeString === "55555") {
            completeRegistration();
        } else {
            console.warn("Master code '55555' not entered.");
        }
    }
}

/* =========================================
   SESSION & USERNAME REGISTRATION LOGIC
   ========================================= */

function completeRegistration() {
    const c = document.getElementById('countryCode').value;
    const p = document.getElementById('phone').value;
    const fullNumberString = "+" + c + p;
    
    console.log("Registration complete. Number is: " + fullNumberString);
    
    // Store current active session in localStorage
    localStorage.setItem('active_session_full_number', fullNumberString);

    // Retrieve previous or generate a base default username (if none exists)
    const storedUsername = localStorage.getItem('user_name_for_' + fullNumberString);
    if (!storedUsername) {
        // Base initial default name
        const initialDefaultName = "NewUser_" + Math.floor(1000 + Math.random() * 9000);
        localStorage.setItem('user_name_for_' + fullNumberString, initialDefaultName);
        console.log("Generated first-time username: " + initialDefaultName);
    }

    document.getElementById('verify-view').style.display = 'none';
    document.getElementById('chat-view').style.display = 'flex';
}

/* =========================================
   PROFILE NAVIGATION LOGIC (EXTENDED)
   ========================================= */

/* =========================================
   ПРОФИЛЬ (Очищенная версия)
   ========================================= */

function openProfile() {
    // 1. Переключение экранов
    document.getElementById('chat-view').style.display = 'none';
    document.getElementById('profile-view').style.display = 'flex';
    
    // 2. Получение данных из localStorage
    const activeNumber = localStorage.getItem('active_session_full_number');
    const username = localStorage.getItem('user_name_for_' + activeNumber) || "SparkleUser";
    
    console.log("Opening profile for: " + activeNumber);
    
    // 3. Загрузка аватарки (вызываем вашу функцию)
    loadAvatar(); 
    
    // 4. Обновление текста (безопасная проверка элементов)
    const nameLabel = document.getElementById('user-display-name');
    if (nameLabel) nameLabel.innerText = username;
    
    const idLabel = document.getElementById('user-display-id');
    if (idLabel) idLabel.innerText = "Sparkle ID: " + username;
    
    const phoneLabel = document.getElementById('user-phone-display');
    if (phoneLabel) phoneLabel.innerText = activeNumber || "N/A";
}

function openChats() {
    document.getElementById('profile-view').style.display = 'none';
    document.getElementById('chat-view').style.display = 'flex';
}

function openChats() {
    document.getElementById('profile-view').style.display = 'none';
    document.getElementById('chat-view').style.display = 'flex';
}

/* =========================================
   USERNAME EDITING LOGIC (EXTENDED & VALIDATED)
   ========================================= */

function enableUsernameEditing() {
    console.log("Username editing mode enabled.");
    
    // Swap Displays
    const displayWrapper = document.getElementById('username-display-wrapper');
    const inputWrapper = document.getElementById('username-edit-input-wrapper');
    const inputField = document.getElementById('username-new-val');
    
    displayWrapper.style.display = 'none';
    inputWrapper.style.display = 'flex';
    inputWrapper.style.flexDirection = 'column';
    
    // Set current username in the input field
    const activeNumber = localStorage.getItem('active_session_full_number');
    const currentUsername = localStorage.getItem('user_name_for_' + activeNumber);
    inputField.value = currentUsername;
    
    // Add Click listener for confirmations and blur for cancel/confirm
    inputField.addEventListener('blur', finalizeUsernameChangeOnBlur);
    inputField.addEventListener('keydown', finalizeUsernameChangeOnEnter);
    
    // Auto focus the field
    inputField.focus();
}

function finalizeUsernameChangeOnEnter(event) {
    if (event.key === 'Enter') {
        finalizeUsernameChange();
    } else if (event.key === 'Escape') {
        cancelUsernameEditing();
    }
}

function finalizeUsernameChangeOnBlur() {
    // Blurring is less definitive than Enter, so cancel unless something special happens.
    // For simplicity, we can let Enter handle confirmation.
    // finalizeUsernameChange(); 
    // To ensure length and validation logic doesn't trigger on simple focus loss,
    // we just cancel on blur for a better experience.
    cancelUsernameEditing();
}

function cancelUsernameEditing() {
    console.log("Username editing mode canceled.");
    
    const displayWrapper = document.getElementById('username-display-wrapper');
    const inputWrapper = document.getElementById('username-edit-input-wrapper');
    const inputField = document.getElementById('username-new-val');
    
    displayWrapper.style.display = 'flex';
    inputWrapper.style.display = 'none';
    
    // Remove listeners
    inputField.removeEventListener('blur', finalizeUsernameChangeOnBlur);
    inputField.removeEventListener('keydown', finalizeUsernameChangeOnEnter);
}

function finalizeUsernameChange() {
    console.log("Attempting to finalize username change.");
    
    const displayWrapper = document.getElementById('username-display-wrapper');
    const inputWrapper = document.getElementById('username-edit-input-wrapper');
    const inputField = document.getElementById('username-new-val');
    const userDisplayLabel = document.getElementById('user-display-name');
    
    const activeNumber = localStorage.getItem('active_session_full_number');
    const newUsernameValue = inputField.value.trim();
    
    // === VAlIDATION LOGIC ===
    // 1. DURATION: Min 4, Max 11
    // 2. CHARACTER: Only letters, _, -, /, !
    const usernameValidationRegex = /^[A-Za-z0-9_\-\/!]*$/;
    
    // Length Check
    if (newUsernameValue.length < 4 || newUsernameValue.length > 11) {
        console.warn("Username must be between 4 and 11 characters.");
        alert("Username length must be between 4 and 11 characters.");
        inputField.focus(); // keep focus
        return; // Break
    }
    
    // Character Check
    if (!usernameValidationRegex.test(newUsernameValue)) {
        console.warn("Username contains invalid characters.");
        alert("Username can only contain English letters, numbers, and characters: _ - / !");
        inputField.focus(); // keep focus
        return; // Break
    }
    
    // Logic Passed. SAVE.
    console.log("Username validation successful. Saving new username: " + newUsernameValue);
    
    localStorage.setItem('user_name_for_' + activeNumber, newUsernameValue);
    userDisplayLabel.innerText = newUsernameValue;
    
    // Return to default Display mode
    displayWrapper.style.display = 'flex';
    inputWrapper.style.display = 'none';
    
    // Remove listeners to clean up
    inputField.removeEventListener('blur', finalizeUsernameChangeOnBlur);
    inputField.removeEventListener('keydown', finalizeUsernameChangeOnEnter);
}

// 1. При клике на аватар - имитируем клик по скрытому инпуту
document.querySelector('.profile-avatar-main').addEventListener('click', function() {
    document.getElementById('avatar-upload').click();
});

// ... (тут ваш старый код)

// 2. Когда пользователь выбрал файл
document.getElementById('avatar-upload').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imageData = e.target.result;
            const activeNumber = localStorage.getItem('active_session_full_number');
            localStorage.setItem('avatar_for_' + activeNumber, imageData);
            document.querySelector('.profile-avatar-main').src = imageData;
        };
        reader.readAsDataURL(file);
    }
});

function loadAvatar() {
    const activeNumber = localStorage.getItem('active_session_full_number');
    const savedAvatar = localStorage.getItem('avatar_for_' + activeNumber);
    if (savedAvatar) {
        document.querySelector('.profile-avatar-main').src = savedAvatar;
    } else {
        document.querySelector('.profile-avatar-main').src = 'placeholder.webp';
    }
}

// Поиск и навигация
const searchInput = document.getElementById('input-search');
const navPanel = document.querySelector('.chat-navigation');

searchInput.addEventListener('focus', () => {
    if (searchInput.value === "") searchInput.value = "@";
    if (navPanel) navPanel.style.display = 'none';
});

searchInput.addEventListener('input', (e) => {
    let val = e.target.value;
    const regex = /^[A-Za-z0-9_\/!@]*$/;
    if (!regex.test(val)) {
        e.target.value = val.slice(0, -1);
        return;
    }
    if (val === "" || val === "@") {
        if (navPanel) navPanel.style.display = 'flex';
    }
    socket.emit('search_query', val);
});

document.addEventListener('click', (e) => {
    if (searchInput && !searchInput.contains(e.target) && navPanel) {
        navPanel.style.display = 'flex';
    }
});