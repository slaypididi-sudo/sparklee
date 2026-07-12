// Функция запроса прав на уведомления
function requestNotificationPermission() {
    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
            console.log("Статус уведомлений:", permission);
        });
    }
}

// Вызовите это при загрузке страницы (или по кнопке "Start Chatting")
document.addEventListener('DOMContentLoaded', () => {
    // ... ваш текущий код ...
    requestNotificationPermission();
});

// ==================== ИНИЦИАЛИЗАЦИЯ И МОСТ ====================
const socket = io(window.location.origin, {
    transports: ['websocket', 'polling']
});

let currentChatUser = null; 
const userStatusesCache = {}; // <-- ДОБАВЛЯЕМ ЭТУ СТРОКУ (Хранилище свежих статусов)
const VERIFIED_NUMBERS = ['+0000000000000', '+380935226790', '+4915226767520', '+0111111111111'];
let tempFirstName = "";
let tempLastName = "";
let tempAvatarBase64 = null;

// СУПЕР-ФУНКЦИЯ: Генерирует красивое имя. Если нет Имени, берет Юзернейм
function getUserFullName(user) {
    if (!user) return "User";
    if (user.firstName) {
        return user.firstName + (user.lastName ? ' ' + user.lastName : '');
    }
    return user.username ? '@' + user.username : "User";
}
// ГЛАВНАЯ ФУНКЦИЯ ПЕРЕКЛЮЧЕНИЯ ЭКРАНОВ
function showScreen(screenId) {
    console.log("🔄 Переключаю экран на:", screenId);
    // Добавили :not(.slide-panel), чтобы функция не трогала профиль
// Исключаем из переключения экранов профили, полноэкранный звонок и всплывающий тост
const screens = document.querySelectorAll('.container > div:not(.slide-panel):not(.call-overlay):not(.incoming-toast)');
    
    // 1. Скрываем вообще всё
    screens.forEach(screen => {
        screen.style.display = 'none';
    });
    
    // 2. Показываем только нужное
    const target = document.getElementById(screenId);
    if (target) {
        target.style.display = 'flex';
        console.log(`✅ Экран "${screenId}" успешно отображен как FLEX`);
    } else {
        console.error(`❌ Экран с ID "${screenId}" не найден в HTML!`);
    }
}

// ==================== ЛОГИКА ПРИ ЗАГРУЗКЕ (СЕССИИ) ====================
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('sessionToken');
    
    if (token) {
        console.log("🔍 Проверяем сессию...");
        socket.emit('check_session', token);
    } else {
        showScreen('first-welcome');
    }

    // Живой поиск
    const searchInput = document.getElementById('chat-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', handleLiveSearch);
    }

    // Кнопка Enter в чате
    const msgInput = document.getElementById('message-input');
    if (msgInput) {
        msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // Клик по системному боту
    const botElement = document.querySelector('.system-bot');
    if (botElement) {
        botElement.addEventListener('click', () => {
            const chatWindow = document.getElementById('chat-window');
            if (chatWindow) chatWindow.style.display = 'flex';
        });
    }
});

// ==================== ОТВЕТЫ СЕРВЕРА (АВТОРИЗАЦИЯ) ====================

// Мгновенное появление розового круга при публикации поста
socket.on('new_post_alert', (data) => {
    // 1. Ищем в списке чатов
    const chatCard = document.querySelector(`.user-chat-card[data-phone="${data.phone}"]`);
    if (chatCard) {
        const avatar = chatCard.querySelector('.user-dynamic-avatar');
        if (avatar) avatar.classList.add('has-story');
    }
    
    // 2. Ищем в открытом профиле (если мы его сейчас смотрим)
    if (currentlyViewedUser && currentlyViewedUser.phone === data.phone) {
        const profAvatar = document.getElementById('other-profile-avatar');
        if (profAvatar) profAvatar.classList.add('has-story');
    }
});

// Успешная отправка СМС — открываем окно ввода
socket.on('code_sent_success', () => {
    document.getElementById('countryInfo').innerText = '';
    showScreen('verify-view');
    document.getElementById('phone-info').innerText = `Sending code to ${window.tempRegistrationPhone}`;
});

// Защита от спама (3 ошибки = бан на час)
socket.on('sms_rate_limited', () => {
    const info = document.getElementById('countryInfo');
    const phoneInput = document.getElementById('phone');
    const codeInputs = document.querySelectorAll('.code-digit');
    
    // Показываем ошибку
    info.innerHTML = '<span style="color:#ff286f; font-weight:bold;">Too many attempts, please try again later</span>';
    
    // Трясем поле с телефоном
    shakeField(phoneInput);
    
    // Если пользователь уже на экране ввода кода, выкидываем его обратно
    const verifyView = document.getElementById('verify-view');
    if (verifyView && verifyView.style.display === 'flex') {
        codeInputs.forEach(el => el.value = '');
        showScreen('login-view');
    }
});

// Если ввели неверный код (но попытки еще остались)
socket.on('code_invalid', () => {
    alert("Invalid code!");
    const codeInputs = document.querySelectorAll('.code-digit');
    codeInputs.forEach(el => {
        el.value = '';
        shakeField(el); // Трясем поля с кодом
    });
    codeInputs[0].focus();
});

socket.on('auth_success', (user) => {
    console.log("✅ Авторизация успешна:", user);
    localStorage.setItem('active_session_full_number', user.phone);
    localStorage.setItem('sessionToken', user.sessionToken);
    
    // СОХРАНЯЕМ ВСЕ ДАННЫЕ В ПАМЯТЬ!
    localStorage.setItem('user_name_for_' + user.phone, user.username || '');
    localStorage.setItem('first_name_for_' + user.phone, user.firstName || '');
    localStorage.setItem('last_name_for_' + user.phone, user.lastName || '');
    localStorage.setItem('bio_for_' + user.phone, user.bio || '');
    // (Внутри auth_success и code_verified, после сохранения avatar/banner...)
    localStorage.setItem('join_date_for_' + user.phone, user.joinDate || '');
    localStorage.setItem('read_time_for_' + user.phone, user.totalReadTime || 0);
    localStorage.setItem('read_count_for_' + user.phone, user.readMessageCount || 0);
    localStorage.setItem('hide_answertime_for_' + user.phone, user.hideAnswerTime || false);
    
    if (user.avatarUrl) localStorage.setItem('avatar_for_' + user.phone, user.avatarUrl);
    if (user.bannerUrl) localStorage.setItem('banner_for_' + user.phone, user.bannerUrl);

    if (user.firstName) {
        showScreen('chat-view'); 
    } else {
        showScreen('setup-name-view');
    }

    socket.emit('get_chat_list', { phone: user.phone });
    io.emit('user_status_changed', { phone: socket.phone, status: 'online' });
});

socket.on('code_verified', (data) => {
    if (data.isNewUser) {
        localStorage.setItem('active_session_full_number', data.phone);
        showScreen('setup-name-view'); 
        setupLiveValidation();
    } else {
        const u = data.user;
        localStorage.setItem('active_session_full_number', u.phone);
        localStorage.setItem('sessionToken', u.sessionToken);
        
        // СОХРАНЯЕМ ДАННЫЕ!
        localStorage.setItem('user_name_for_' + u.phone, u.username || '');
        localStorage.setItem('first_name_for_' + u.phone, u.firstName || '');
        localStorage.setItem('last_name_for_' + u.phone, u.lastName || '');
        localStorage.setItem('bio_for_' + u.phone, u.bio || '');
        if (u.avatarUrl) localStorage.setItem('avatar_for_' + u.phone, u.avatarUrl);
        if (u.bannerUrl) localStorage.setItem('banner_for_' + u.phone, u.bannerUrl);

        showScreen('chat-view');
        socket.emit('get_chat_list', { phone: u.phone });
    }
});

socket.on('session_invalid', () => {
    console.log("❌ Сессия неверна или истекла");
    localStorage.removeItem('sessionToken');
    showScreen('first-welcome');
});

socket.on('code_sent', () => {
    showScreen('verify-view');
});

socket.on('code_verified', (data) => {
    if (data.isNewUser) {
        console.log("🆕 Это новый пользователь, идем на настройку имени");
        localStorage.setItem('active_session_full_number', data.phone);
        showScreen('setup-name-view'); // ТЕПЕРЬ ПЕРВЫМ ИДЕТ ИМЯ
        setupLiveValidation();
    } else {
        // ... старый код ...
        console.log("✅ Пользователь уже есть в базе, идем в чаты");
        localStorage.setItem('active_session_full_number', data.user.phone);
        localStorage.setItem('sessionToken', data.user.sessionToken);
        localStorage.setItem('user_name_for_' + data.user.phone, data.user.username);
        showScreen('chat-view'); // Исправлено на chat-view
        socket.emit('get_chat_list', { phone: data.user.phone });
    }
});

// ==================== ГЛОБАЛЬНЫЕ ДАННЫЕ И ВАЛИДАЦИЯ ====================
const countriesDatabase = {
    "0": { name: "Devland/Anachya", icon: "rocket" },
    "7": { name: "Russia", icon: "ru" },
    "49": { name: "Germany", icon: "de" },
    "33": { name: "France", icon: "fr" },
    "380": { name: "Ukraine", icon: "ua" },
    "44": { name: "UK", icon: "gb" },
    "1": { name: "USA", icon: "us" },
    "31": { name: "Netherlands", icon: "nl" }
};

function shakeField(element) {
    if (!element) return;
    element.classList.add('shake');
    setTimeout(() => element.classList.remove('shake'), 1500);
}

// НАВИГАЦИЯ МЕЖДУ ВЕЛОКАМ ЭКРАНАМИ
function goToLogin() {
    const first = document.getElementById('first-welcome');
    const login = document.getElementById('login-view');
    if (!first || !login) return;

    first.style.transition = 'opacity 0.3s ease';
    first.style.opacity = '0';

    setTimeout(() => {
        first.style.display = 'none';
        login.style.display = 'flex';
        login.style.opacity = '0';
        login.style.transform = 'translateY(120px)';

        setTimeout(() => {
            login.style.transition = 'all 0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            login.style.opacity = '1';
            login.style.transform = 'translateY(0)';
        }, 10);
    }, 280);
}

function submitRegistration() {
    const codeInput = document.getElementById('countryCode');
    const phoneInput = document.getElementById('phone');
    const info = document.getElementById('countryInfo');
    
    const code = codeInput.value.trim();
    const phone = phoneInput.value.trim();
    const fullNumber = "+" + code + phone;

    if (!countriesDatabase[code]) {
        shakeField(codeInput);
        info.innerHTML = '<span style="color:#ff286f;">Invalid country code</span>';
        setTimeout(() => info.innerHTML = '', 1800);
        return;
    }
    if (phone.length < 7) {
        shakeField(phoneInput);
        info.innerHTML = '<span style="color:#ff286f;">Number is incorrect</span>';
        setTimeout(() => info.innerHTML = '', 1800);
        return;
    }

    info.style.color = "#2d3436";
    info.innerText = "Requesting SMS...";
    
    // Сохраняем номер для проверки и просим сервер прислать СМС
    window.tempRegistrationPhone = fullNumber;
    socket.emit('request_sms_code', { phone: fullNumber });
}

function handleCodeInput(element) {
    if (element.value.length > 1) element.value = element.value.slice(0, 1);
    if (element.value && element.nextElementSibling) element.nextElementSibling.focus();

    let code = "";
    document.querySelectorAll('.code-digit').forEach(el => code += el.value);

    // Когда ввели все 5 цифр - отправляем на проверку серверу
    if (code.length === 5) {
        socket.emit('verify_code', { 
            phone: window.tempRegistrationPhone, 
            code: code 
        });
    }
}

// ==================== НАСТРОЙКА ПРОФИЛЯ ====================
function setupLiveValidation() {
    const userInp = document.getElementById('setup-username');
    const bioInp = document.getElementById('setup-bio');
    const userHint = document.getElementById('setup-user-hint');
    const bioHint = document.getElementById('setup-bio-hint');

    if (userInp) {
        userInp.oninput = function() {
            let val = this.value;
            if (!val.startsWith('@')) {
                val = '@' + val.replace(/@/g, '');
                this.value = val;
            }
            const cleanVal = val.slice(1);
            const regex = /^[a-zA-Z0-9\/\-\.]*$/;

            if (!regex.test(cleanVal)) {
                shakeField(this);
                if (userHint) userHint.classList.add('error');
                setTimeout(() => userHint && userHint.classList.remove('error'), 800);
                this.value = '@' + cleanVal.replace(/[^a-zA-Z0-9\/\-\.]/g, '');
            }
        };
    }

    if (bioInp) {
        bioInp.oninput = function() {
            if (bioHint) bioHint.innerText = `${this.value.length}/25`;
        };
        bioInp.addEventListener('keypress', function(e) {
            if (this.value.length >= 25) {
                e.preventDefault();
                shakeField(this);
                if (bioHint) bioHint.classList.add('error');
                setTimeout(() => bioHint && bioHint.classList.remove('error'), 800);
            }
        });
    }
}

function finishSetup() {
    const userInp = document.getElementById('setup-username');
    const bioInp = document.getElementById('setup-bio');
    
    let username = userInp.value.trim();
    let bio = bioInp.value.trim();
    let hasError = false;

    if (username === '@' || username.length === 0) { shakeField(userInp); hasError = true; }
    if (bio.length === 0) { shakeField(bioInp); hasError = true; }
    if (hasError) return;

    username = username.slice(1); 
    const currentNumber = localStorage.getItem('active_session_full_number');

    localStorage.setItem('user_name_for_' + currentNumber, username);
    localStorage.setItem('bio_for_' + currentNumber, bio);

    socket.emit('user_registered', {
        phone: currentNumber,
        username: username,
        bio: bio
    });

    console.log("⏳ Данные отправлены, ждем ответа сервера (auth_success)...");
}

// ==================== МОДАЛКА НИКА И БИОГРАФИИ ====================
function showUsernameModal() {
    const currentNumber = localStorage.getItem('active_session_full_number');
    let currentName = localStorage.getItem('user_name_for_' + currentNumber) || "";
    
    const input = document.getElementById('modal-username-input');
    const preview = document.getElementById('preview-username');
    const rulesText = document.getElementById('username-rules');

    if (!currentName.startsWith('@')) {
        currentName = '@' + currentName.replace('@', '');
    }
    if (input) input.value = currentName;
    if (preview) preview.textContent = currentName.replace('@', '') || "yourname";

    if (input) {
        input.oninput = function() {
            let val = this.value;
            if (!val.startsWith('@')) {
                val = '@' + val;
                this.value = val;
            }
            const cleanVal = val.slice(1);
            const regex = /^[a-zA-Z0-9_.\-\/]*$/;

            if (!regex.test(cleanVal)) {
                this.classList.add('shake');
                setTimeout(() => this.classList.remove('shake'), 1500);
                if (rulesText) rulesText.classList.add('error');
                setTimeout(() => rulesText && rulesText.classList.remove('error'), 800);
                this.value = '@' + cleanVal.replace(/[^a-zA-Z0-9_.\-\/]/g, '');
                return;
            }
            if (preview) preview.textContent = cleanVal || "yourname";
        };
    }

    const modal = document.getElementById('username-modal');
    if (modal) modal.style.display = 'flex';
}

function closeUsernameModal() {
    const modal = document.getElementById('username-modal');
    if (modal) modal.style.display = 'none';
}

function saveNewUsername() {
    const input = document.getElementById('modal-username-input');
    let newName = input.value.trim();
    
    if (newName.startsWith('@')) newName = newName.slice(1);

    if (newName.length < 4 || newName.length > 11) {
        alert("Имя должно быть от 4 до 11 символов!");
        return;
    }

    const currentNumber = localStorage.getItem('active_session_full_number');
    localStorage.setItem('user_name_for_' + currentNumber, newName);
    
    const displayEl = document.getElementById('user-display-name');
    if (displayEl) displayEl.innerText = newName;
    
    socket.emit('update_profile', {
        phone: currentNumber,
        username: newName
    });

    console.log(`✏️ Имя изменено на: ${newName}`);
    closeUsernameModal();
}

function showBioModal() {
    const currentNumber = localStorage.getItem('active_session_full_number');
    let currentBio = localStorage.getItem('bio_for_' + currentNumber) || "";

    let modal = document.getElementById('bio-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bio-modal';
        modal.className = 'username-modal';
        modal.innerHTML = `
            <div class="modal-header">
                <button onclick="closeBioModal()" class="modal-btn cancel">Cancel</button>
                <button onclick="saveBio()" class="modal-btn save">Save</button>
            </div>
            <div class="modal-body" style="text-align:left; padding:60px 30px 40px;">
                <h2>Tell us about yourself</h2>
                <textarea id="modal-bio-input" maxlength="25" placeholder="Write something about you...">${currentBio}</textarea>
                <div class="username-hints" style="text-align:right; margin-top:8px;">
                    <p id="bio-counter">0/25</p>
                    <p id="bio-rules">Maximum 25 characters</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        document.getElementById('modal-bio-input').value = currentBio;
    }

    const textarea = document.getElementById('modal-bio-input');
    const counter = document.getElementById('bio-counter');
    const rules = document.getElementById('bio-rules');

    textarea.oninput = function() {
        let len = this.value.length;
        if (counter) counter.textContent = `${len}/25`;

        if (len > 25) {
            this.classList.add('shake');
            setTimeout(() => this.classList.remove('shake'), 1500);
            if (rules) rules.classList.add('error');
            setTimeout(() => rules && rules.classList.remove('error'), 800);
            this.value = this.value.slice(0, 25);
        }
    };

    modal.style.display = 'flex';
    textarea.focus();
}

function closeBioModal() {
    const modal = document.getElementById('bio-modal');
    if (modal) modal.style.display = 'none';
}

function saveBio() {
    const bioText = document.getElementById('modal-bio-input').value.trim();
    const currentNumber = localStorage.getItem('active_session_full_number');
    
    localStorage.setItem('bio_for_' + currentNumber, bioText);
    const bioDisplay = document.getElementById('user-bio-text');
    if (bioDisplay) bioDisplay.innerText = bioText || "Here will be your biography...";
    
    socket.emit('update_profile', {
        phone: currentNumber,
        bio: bioText
    });

    closeBioModal();
}

// ==================== ПРОФИЛЬ И АВАТАРЫ ====================
function openProfile() {
    showScreen('profile-view');
    loadProfileData();
    // При открытии своего профиля запрашиваем данные
    const myPhone = localStorage.getItem('active_session_full_number');
    socket.emit('get_comments', { targetPhone: myPhone });
    socket.emit('get_posts', { targetPhone: myPhone });
    
    // Сбрасываем на вкладку по умолчанию
    switchProfileTab('comments');
}

function openChats() {
    showScreen('chat-view');
}

function loadProfileData() {
    const number = localStorage.getItem('active_session_full_number');
    if (!number) return;

    const fName = localStorage.getItem('first_name_for_' + number);
    const lName = localStorage.getItem('last_name_for_' + number);
    const uName = localStorage.getItem('user_name_for_' + number);
    
    let displayName = "User";
    if (fName) displayName = fName + (lName ? " " + lName : "");
    else if (uName) displayName = "@" + uName;

    document.getElementById('user-display-name').innerText = displayName;
    document.getElementById('user-username-text').innerText = '@' + (uName || 'username');
    document.getElementById('user-phone-display').innerText = number;
    document.getElementById('user-bio-text').innerText = localStorage.getItem('bio_for_' + number) || "Here will be your biography...";

    const avatarEl = document.getElementById('profile-avatar-main');
    if (avatarEl) avatarEl.src = localStorage.getItem('avatar_for_' + number) || 'placeholder.webp';

    const bannerEl = document.getElementById('profile-banner');
    if (bannerEl) {
        const savedBanner = localStorage.getItem('banner_for_' + number);
        if (savedBanner) bannerEl.src = savedBanner;
    }

    // === НОВАЯ ЧАСТЬ: Загрузка статистики ===
    const joinDateMs = parseInt(localStorage.getItem('join_date_for_' + number)) || Date.now();
    const totalReadTime = parseInt(localStorage.getItem('read_time_for_' + number)) || 0;
    const readCount = parseInt(localStorage.getItem('read_count_for_' + number)) || 0;
    const isHidden = localStorage.getItem('hide_answertime_for_' + number) === 'true';

    const joinDateEl = document.getElementById('my-joindate');
    if (joinDateEl) joinDateEl.innerText = formatJoinDate(joinDateMs);

    const answerTimeEl = document.getElementById('my-answertime');
    if (answerTimeEl) answerTimeEl.innerText = formatAnswerTime(totalReadTime, readCount);

    // Внутри функции loadProfileData() найди этот кусок и поменяй его:
    const toggleEl = document.getElementById('answertime-toggle');
    if (toggleEl) toggleEl.checked = !isHidden; // <-- Важно: чекбокс включен, когда НЕ скрыто
}


// ==================== ПОИСК И ЧАТЫ ====================
let currentSearchMode = 'username';
function changeAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(ev) {
                const base64 = ev.target.result;
                const number = localStorage.getItem('active_session_full_number');
                
                // Временно показываем картинку
                const avatar = document.getElementById('profile-avatar-main');
                if (avatar) avatar.src = base64;

                // 🚀 ВОТ ТО, ЧЕГО НЕ ХВАТАЛО: ОТПРАВКА НА СЕРВЕР
                socket.emit('update_profile', {
                    phone: number,
                    avatarBase64: base64
                });
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

function changeBanner() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(ev) {
                const base64 = ev.target.result;
                const number = localStorage.getItem('active_session_full_number');
                
                const banner = document.getElementById('profile-banner');
                if (banner) {
                    banner.src = base64;
                    if (file.type.startsWith('video/')) {
                        banner.loop = true; banner.muted = true; banner.play();
                    }
                }

                // 🚀 ОТПРАВЛЯЕМ БАННЕР НА СЕРВЕР
                socket.emit('update_profile', {
                    phone: number,
                    bannerBase64: base64
                });
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}
function handleLiveSearch(e) {
    let val = e.target.value;
    const overlay = document.getElementById('search-overlay');

    if (val.length === 0) {
        if (overlay) overlay.style.display = 'none';
        return;
    }

    if (!val.startsWith('@')) {
        val = '@' + val;
        e.target.value = val;
    }

    if (overlay && overlay.style.display === 'none') {
        overlay.style.display = 'flex';
    }

    const cleanQuery = val.slice(1);

    socket.emit('search_user', {
        query: cleanQuery,
        mode: currentSearchMode
    });
}

function switchSearchTab(mode) {
    if (currentSearchMode === mode) return;
    currentSearchMode = mode;

    const tabUsername = document.getElementById('tab-username');
    const tabBio = document.getElementById('tab-bio');
    const line = document.getElementById('search-tab-line');
    const searchInput = document.getElementById('chat-search-input');

    if (mode === 'username') {
        if (tabUsername) tabUsername.classList.add('active');
        if (tabBio) tabBio.classList.remove('active');
        if (line) line.style.transform = 'translateX(0%)';
    } else {
        if (tabBio) tabBio.classList.add('active');
        if (tabUsername) tabUsername.classList.remove('active');
        if (line) line.style.transform = 'translateX(100%)';
    }

    if (searchInput && searchInput.value.length > 1) {
        handleLiveSearch({ target: searchInput });
    }
}

socket.on('search_results', (data) => {
    const resultsList = document.getElementById('search-results-list');
    if (!resultsList) return;

    resultsList.innerHTML = ''; 

    if (data.results && data.results.length > 0) {
        data.results.forEach(user => {
            // --- ДОБАВЛЯЕМ СОХРАНЕНИЕ В КЭШ ---
            userStatusesCache[user.phone] = {
                isOnline: user.isOnline,
                lastSeen: user.lastSeen,
                status: user.isOnline ? 'online' : 'offline'
            };
            // ----------------------------------

            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <img src="${user.avatarUrl ? user.avatarUrl : 'placeholder.webp'}" onerror="this.src='placeholder.webp'" class="search-result-avatar" alt="User">
                <div class="search-result-info">
                    <span class="search-result-name">${getUserFullName(user)}</span>
                    <span class="search-result-bio" style="color: #ff286f; font-weight: 500;">@${user.username}</span>
                    <span class="search-result-bio">${user.bio || 'Привет, я в Sparkle!'}</span>
                </div>
            `;
            item.onclick = () => openPrivateChat(user);
            resultsList.appendChild(item);
        });
    } else {
        resultsList.innerHTML = `
            <div style="text-align: center; color: #888; padding-top: 40px; font-weight: 600;">
                Пользователь не найден
            </div>`;
    }
});

function openPrivateChat(user) {
    currentChatUser = user; 
    const chatWindow = document.getElementById('chat-window');
    if (!chatWindow) return;

    const headerName = document.querySelector('.chat-header-name');
    if (headerName) headerName.textContent = getUserFullName(user);
    
    const chatAvatar = document.querySelector('.chat-header-avatar');
    if (chatAvatar) {
        // Убрали username.jpg, поставили placeholder.webp
        chatAvatar.src = user.avatarUrl ? user.avatarUrl : 'placeholder.webp';
        
        // Делаем аватарку кликабельной!
        chatAvatar.style.cursor = 'pointer';
        chatAvatar.onclick = () => openOtherUserProfile(user);
    }
    
    const verIcon = document.querySelector('.ver-icon');
    if (verIcon) verIcon.style.display = VERIFIED_NUMBERS.includes(user.phone) ? 'block' : 'none';

    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) chatMessages.innerHTML = '';

    // СРАЗУ СТАВИМ СТАТУС БЕЗ ОЖИДАНИЯ СЕРВЕРА (Используя свежий кэш)
    const freshStatus = userStatusesCache[user.phone] || { isOnline: user.isOnline, lastSeen: user.lastSeen, status: user.isOnline ? 'online' : 'offline' };
    const statusEl = document.getElementById('chat-status');
    
    if (statusEl) {
        if (freshStatus.status === 'online') {
            statusEl.textContent = 'online';
            statusEl.className = 'status-online';
        } else if (freshStatus.status === 'in_chat') {
            statusEl.textContent = 'in chat';
            statusEl.className = 'status-in-chat';
        } else {
            const formattedTime = formatLastSeen(freshStatus.lastSeen);
            statusEl.textContent = formattedTime;
            statusEl.className = formattedTime === 'offline' ? 'status-offline' : 'status-last-seen';
        }
    }

    socket.emit('get_chat_history', { withPhone: user.phone });
    socket.emit('join_chat', { targetPhone: user.phone });

    const overlay = document.getElementById('search-overlay');
    if (overlay) overlay.style.display = 'none';
    chatWindow.style.display = 'flex';
}

function closeChatWindow() {
    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) chatWindow.style.display = 'none';
    socket.emit('leave_chat');
}

function openBotChat() {
    const chatWindow = document.getElementById('chat-window');
    if (!chatWindow) return;
    chatWindow.style.display = 'flex';
    
    const headerName = document.querySelector('.chat-header-name');
    const avatar = document.querySelector('.chat-header-avatar');
    const verIcon = document.querySelector('.ver-icon');
    
    if (headerName) headerName.textContent = 'Sparkle-info';
    if (avatar) avatar.src = 'cahtbot.jpg';
    if (verIcon) verIcon.style.display = 'block';
    
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.innerHTML = `
            <div class="message-bubble">Hello! I'm your Sparkle information bot. I'm so glad to see you here!</div>
        `;
    }
    currentChatUser = null; 
}

// ==================== РАБОТА С СООБЩЕНИЯМИ ====================
function sendMessage() {
    const input = document.getElementById('message-input');
    if (!input) return;
    const text = input.value.trim();
    const myPhone = localStorage.getItem('active_session_full_number');
    
    if (text === "" || !currentChatUser) return;

    if (!socket.connected) {
        renderSingleMessage({
            sender: myPhone,
            text: text,
            timestamp: Date.now(),
            read: false,
            isError: true 
        }, myPhone);
        input.value = "";
        return;
    }

    socket.emit('send_private_message', {
        recipientPhone: currentChatUser.phone,
        text: text
    });

    input.value = ""; 
}

function renderSingleMessage(msg, myPhone) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    const isMyMessage = msg.sender === myPhone;
    const msgDiv = document.createElement('div');
    
    // --- ЕСЛИ ЭТО ЛОГ ЗВОНКА ---
    if (msg.type === 'call_log') {
        msgDiv.className = `call-log-bubble ${isMyMessage ? 'my-message-log' : ''}`;
        if (isMyMessage) msgDiv.style.marginLeft = 'auto'; // Сдвиг вправо для своих логов
        
        const isSuccess = msg.callStatus === 'success';
        
        msgDiv.innerHTML = `
            <div class="call-log-icon ${isSuccess ? 'success' : 'canceled'}">
                ${isSuccess ? '📞' : '📵'}
            </div>
            <div class="call-log-details">
                <span class="call-log-title ${isSuccess ? 'success' : 'canceled'}">
                    ${isSuccess ? 'Successful call' : 'Canceled call'}
                </span>
                <span class="call-log-duration">
                    ${isSuccess ? 'Time: ' + msg.duration : 'Missed'}
                </span>
            </div>
            <div class="message-time" style="margin-left: auto; align-self: flex-end;">
                ${new Date(msg.timestamp).getHours()}:${new Date(msg.timestamp).getMinutes().toString().padStart(2, '0')}
            </div>
        `;
        
        // При клике на звонок - перезваниваем (по умолчанию видео)
        msgDiv.onclick = () => { startCall('video'); };
        
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return; 
    }

    // --- ЕСЛИ ЭТО ОБЫЧНОЕ ТЕКСТОВОЕ СООБЩЕНИЕ ---
    msgDiv.className = `message-bubble ${isMyMessage ? 'my-message' : ''}`;
    const textSpan = document.createElement('span');
    textSpan.innerText = msg.text;
    textSpan.style.wordBreak = 'break-word';
    msgDiv.appendChild(textSpan);

    const timeContainer = document.createElement('div');
    timeContainer.className = 'message-time';
    timeContainer.style.display = 'flex';
    timeContainer.style.alignItems = 'center';
    timeContainer.style.justifyContent = 'flex-end';
    timeContainer.style.marginTop = '4px';

    const date = new Date(msg.timestamp);
    const timeText = document.createElement('span');
    timeText.innerText = date.getHours() + ":" + date.getMinutes().toString().padStart(2, '0');
    timeContainer.appendChild(timeText);

    if (isMyMessage) {
        const statusIcon = document.createElement('span');
        statusIcon.style.marginLeft = '5px';
        statusIcon.style.fontSize = '11px';
        if (msg.isError) { statusIcon.innerText = '✗'; statusIcon.style.color = '#ff4757'; } 
        else if (msg.read) { statusIcon.innerText = '✓✓'; statusIcon.style.color = '#4cd964'; } 
        else { statusIcon.innerText = '✓'; statusIcon.style.color = 'rgba(255,255,255,0.7)'; }
        timeContainer.appendChild(statusIcon);
    }
    msgDiv.appendChild(timeContainer);
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// СЛУШАТЕЛИ СОБЫТИЙ ЧАТА
socket.on('chat_list_data', (chats) => {
    const listContainer = document.getElementById('chat-list-container');
    if (!listContainer) return;

    // ИСПРАВЛЕНА ФАТАЛЬНАЯ ОШИБКА БОТА! 
    listContainer.innerHTML = `
        <div class="chat-item system-bot" onclick="openBotChat()">
            <img src="cahtbot.jpg" alt="Bot" class="bot-avatar">
            <div class="bot-info">
                <div class="bot-name-row">
                    <span class="user-dynamic-name chat-list-name" style="color: #ff286f;">Sparkle-info</span>
                    <img src="ver.jpg" alt="Verified" class="ver-icon">
                </div>
                <div class="bot-desc">your Sparkle information bot</div>
            </div>
        </div>
    `;

    // ... дальше идет chats.forEach ...

    chats.forEach(chat => {
        // --- ДОБАВЛЯЕМ СОХРАНЕНИЕ В КЭШ ---
        userStatusesCache[chat.phone] = {
            isOnline: chat.isOnline,
            lastSeen: chat.lastSeen,
            status: chat.isOnline ? 'online' : 'offline'
        };
        // ----------------------------------

        const card = document.createElement('div');
        card.className = 'user-chat-card';
        card.dataset.phone = chat.phone; // Важно для поиска блока по номеру!

        const avatarSrc = chat.avatarUrl || 'placeholder.webp';
        const badgeHtml = chat.unreadCount > 0 ? `<div class="user-chat-badge">${chat.unreadCount}</div>` : '';
        const verIconHtml = VERIFIED_NUMBERS.includes(chat.phone) ? `<img src="ver.jpg" class="ver-icon" style="margin-left: 5px; width: 14px; height: 14px;">` : '';
        
        // Цвет имени (зеленый, если онлайн)
        const nameColor = chat.isOnline ? '#4cd137' : '#2d3436';

        card.innerHTML = `
            <div class="user-avatar-wrapper">
                <img src="${avatarSrc}" onerror="this.src='placeholder.webp'" class="user-dynamic-avatar">
            </div>
            <div class="user-info-block">
                <div style="display: flex; align-items: center;">
                    <span class="user-dynamic-name chat-list-name" style="color: ${nameColor};">@${chat.username}</span>
                    ${verIconHtml}
                </div>
                <span class="user-dynamic-bio">${chat.bio || '—'}</span>
                <span class="user-dynamic-lastmsg">${chat.lastMessage || 'Нет сообщений'}</span>
            </div>
            ${badgeHtml}
        `;

        card.onclick = () => openPrivateChat(chat);
        listContainer.appendChild(card);
    });
});

socket.on('chat_history', (history) => {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    chatMessages.innerHTML = ''; 
    const myPhone = localStorage.getItem('active_session_full_number');
    
    history.forEach(msg => renderSingleMessage(msg, myPhone));
    chatMessages.scrollTop = chatMessages.scrollHeight; 
});

socket.on('new_private_message', (msg) => {
    const myPhone = localStorage.getItem('active_session_full_number');
    
    // ЛОГИКА УВЕДОМЛЕНИЙ
    // Показываем, если вкладка скрыта (document.hidden) ИЛИ мы не в этом чате
    const isChatOpen = (currentChatUser && currentChatUser.phone === msg.sender);
    
    if (document.hidden || !isChatOpen) {
        // Достаем данные отправителя из локального хранилища (вы их там сохраняете ранее)
        const senderName = localStorage.getItem('first_name_for_' + msg.sender) || "User";
        const senderLastName = localStorage.getItem('last_name_for_' + msg.sender) || "";
        const senderAvatar = localStorage.getItem('avatar_for_' + msg.sender) || 'placeholder.webp';
        
        showPushNotification(
            `${senderName} ${senderLastName}`, 
            msg.text, 
            senderAvatar
        );
    }

    // --- Ваш существующий код рендеринга ---
    if (currentChatUser && (currentChatUser.phone === msg.sender || currentChatUser.phone === msg.recipient)) {
        renderSingleMessage(msg, myPhone);
        if (msg.recipient === myPhone) {
            socket.emit('get_chat_history', { withPhone: currentChatUser.phone });
        }
    }
});

socket.on('profile_updated', (updatedUser) => {
    const myPhone = localStorage.getItem('active_session_full_number');

    // 1. Если это МЫ обновили свой аватар/баннер, сохраняем пути к файлам
    if (updatedUser.phone === myPhone) {
        if (updatedUser.username) localStorage.setItem('user_name_for_' + myPhone, updatedUser.username);
        if (updatedUser.bio) localStorage.setItem('bio_for_' + myPhone, updatedUser.bio);
        if (updatedUser.avatarUrl) localStorage.setItem('avatar_for_' + myPhone, updatedUser.avatarUrl);
        if (updatedUser.bannerUrl) localStorage.setItem('banner_for_' + myPhone, updatedUser.bannerUrl);
        loadProfileData(); // Перерисовываем свой профиль
    }

    // 2. Если обновился собеседник, с которым открыт чат
    if (currentChatUser && currentChatUser.phone === updatedUser.phone) {
        currentChatUser = updatedUser; 
        const chatName = document.querySelector('.chat-header-name');
        const chatAvatar = document.querySelector('.chat-header-avatar');
        if (chatName) chatName.textContent = `@${updatedUser.username}`;
        if (chatAvatar) chatAvatar.src = updatedUser.avatarUrl || 'placeholder.webp';
    }

    // 3. Принудительно обновляем списки чатов, чтобы там появились новые аватарки
    if (myPhone) socket.emit('get_chat_list', { phone: myPhone });
});

socket.on('messages_read', (data) => {
    if (currentChatUser && currentChatUser.phone === data.byPhone) {
        socket.emit('get_chat_history', { withPhone: currentChatUser.phone });
    }
});

let currentlyViewedUser = null; // Запоминаем, чей профиль сейчас открыт

function openOtherUserProfile(user) {
    currentlyViewedUser = user;
    const panel = document.getElementById('other-user-profile');
    if (!panel) return;

    // 1. Подставляем картинки, имя и био
    document.getElementById('other-profile-banner').src = user.bannerUrl || 'banner.jpg';
    document.getElementById('other-profile-avatar').src = user.avatarUrl || 'placeholder.webp';
    document.getElementById('other-user-name').textContent = getUserFullName(user);
    document.getElementById('other-user-username').textContent = `@${user.username}`;
    document.getElementById('other-user-bio').textContent = user.bio || 'Пользователь пока ничего не рассказал о себе.';

    // 2. МАСКИРОВКА НОМЕРА ТЕЛЕФОНА (Оставляем только код страны)
    const phoneStr = user.phone || "";
    // Регулярное выражение ищет плюс и от 1 до 3 цифр после него (это и есть код страны)
    const matchCode = phoneStr.match(/^(\+\d{1,3})/); 
    const countryCode = matchCode ? matchCode[1] : "+";
    // Заменяем все цифры после кода страны на букву 'X'
    const maskedPhone = countryCode + ' ' + 'X'.repeat(phoneStr.length - countryCode.length);
    document.getElementById('other-user-phone').textContent = maskedPhone;

    // 3. ГЕНЕРАЦИЯ И ВСТАВКА ID (Берем последние 6 цифр из реального номера телефона)
    const fakeId = phoneStr.replace(/\D/g, '').slice(-6);
    document.getElementById('other-user-id').textContent = `ID: ${fakeId || '000000'}`;

    // 4. Проверка галочки верификации
    const verIcon = document.getElementById('other-ver-icon');
    if (verIcon) {
        verIcon.style.display = VERIFIED_NUMBERS.includes(user.phone) ? 'block' : 'none';
    }

    // Запускаем CSS анимацию выезда
    panel.classList.add('active');
    document.getElementById('other-user-joindate').textContent = formatJoinDate(user.joinDate);
    
    const answerTimeBlock = document.getElementById('other-answertime-block');
    if (user.hideAnswerTime) {
        // Если человек выключил фиолетовый ползунок у себя, прячем блок!
        answerTimeBlock.style.display = 'none';
    } else {
        answerTimeBlock.style.display = 'block';
        document.getElementById('other-user-answertime').textContent = formatAnswerTime(user.totalReadTime, user.readMessageCount);
    }

    panel.classList.add('active');

    // Сбрасываем вкладку на комментарии по умолчанию
    switchProfileTab('comments'); 
    
    // Запрашиваем комментарии и посты с сервера
    socket.emit('get_comments', { targetPhone: user.phone });
    socket.emit('get_posts', { targetPhone: user.phone });
    
    // Устанавливаем розовую обводку на главный аватар в профиле, если есть посты
    const profAvatar = document.getElementById('other-profile-avatar');
    if (user.hasStory) profAvatar.classList.add('has-story');
    else profAvatar.classList.remove('has-story');
}


// Функция для закрытия профиля другого пользователя
function closeOtherUserProfile() {
    const panel = document.getElementById('other-user-profile');
    if (panel) {
        panel.classList.remove('active');
    }
}

// --- УМНЫЙ РАСЧЕТ ВРЕМЕНИ ---
function formatLastSeen(timestamp) {
    // Если данных нет вообще (старые аккаунты до обновы)
    if (!timestamp) return 'offline'; 
    
    const now = new Date();
    const last = new Date(timestamp);
    const diffMins = Math.floor((now - last) / 60000);
    const diffHours = Math.floor(diffMins / 60);

    const isToday = now.getDate() === last.getDate() && now.getMonth() === last.getMonth() && now.getFullYear() === last.getFullYear();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = yesterday.getDate() === last.getDate() && yesterday.getMonth() === last.getMonth() && yesterday.getFullYear() === last.getFullYear();

    const hhmm = last.getHours().toString().padStart(2, '0') + ':' + last.getMinutes().toString().padStart(2, '0');

    // Меньше 1 часа назад
    if (diffMins < 60 && isToday) {
        if (diffMins === 0) return 'was online just now';
        return `was online ${diffMins} minutes ago`;
    }
    
    // Больше часа, но сегодня
    if (isToday) return `was online at ${hhmm}`;
    
    // Вчера
    if (isYesterday) return `was online yesterday at ${hhmm}`;
    
    // Больше чем вчера (только дата)
    const dd = last.getDate().toString().padStart(2, '0');
    const mm = (last.getMonth() + 1).toString().padStart(2, '0');
    const yy = last.getFullYear().toString().slice(-2);
    return `was online at ${dd}.${mm}.${yy}`;
}

// --- ОБНОВЛЕНИЕ СТАТУСОВ В РЕАЛЬНОМ ВРЕМЕНИ ---
socket.on('user_status_changed', (data) => {
    // --- 1. ОБНОВЛЯЕМ НАШ ГЛОБАЛЬНЫЙ КЭШ ---
    if (!userStatusesCache[data.phone]) userStatusesCache[data.phone] = {};
    userStatusesCache[data.phone].status = data.status;
    userStatusesCache[data.phone].isOnline = (data.status === 'online' || data.status === 'in_chat');
    if (data.lastSeen) userStatusesCache[data.phone].lastSeen = data.lastSeen;

    // ... (дальше твой код обновления DOM: if (currentChatUser && currentChatUser.phone === data.phone) и т.д.)
    // 1. Обновляем шапку открытого чата
    if (currentChatUser && currentChatUser.phone === data.phone) {
        const statusEl = document.getElementById('chat-status');
        if (statusEl) {
            if (data.status === 'online') {
                statusEl.textContent = 'online';
                statusEl.className = 'status-online';
            } else if (data.status === 'in_chat') {
                statusEl.textContent = 'in chat';
                statusEl.className = 'status-in-chat';
            } else {
                const formattedTime = formatLastSeen(data.lastSeen);
                statusEl.textContent = formattedTime;
                statusEl.className = formattedTime === 'offline' ? 'status-offline' : 'status-last-seen';
            }
        }
    }

    // 2. Обновляем цвет имени в списке чатов
    const chatCard = document.querySelector(`.user-chat-card[data-phone="${data.phone}"]`);
    if (chatCard) {
        const nameEl = chatCard.querySelector('.chat-list-name');
        if (nameEl) {
            nameEl.style.color = (data.status === 'online' || data.status === 'in_chat') ? '#4cd137' : '#2d3436';
        }
    }

    // 3. ОБНОВЛЯЕМ ЦВЕТ В ПОИСКЕ (Лайв)
    const searchNameEl = document.querySelector(`.search-result-name[data-search-phone="${data.phone}"]`);
    if (searchNameEl) {
        searchNameEl.style.color = (data.status === 'online' || data.status === 'in_chat') ? '#4cd137' : '#2d3436';
    }
});

// --- СТАТУС ПЕЧАТАНИЯ ---
let typingTimer;
const messageInput = document.getElementById('message-input');
if (messageInput) {
    messageInput.addEventListener('input', () => {
        if (currentChatUser) {
            socket.emit('typing', { targetPhone: currentChatUser.phone });
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                socket.emit('stop_typing', { targetPhone: currentChatUser.phone });
            }, 2000); // Тайм-аут 2 секунды после прекращения ввода
        }
    });
}

socket.on('user_typing', (data) => {
    if (currentChatUser && currentChatUser.phone === data.phone) {
        const statusEl = document.getElementById('chat-status');
        if (!statusEl) return;
        
        if (data.isTyping) {
            statusEl.textContent = 'typing...';
            statusEl.className = 'status-typing';
        } else {
            // Возвращаем в статус 'in_chat' (т.к. если он печатает, он 100% в чате с нами)
            statusEl.textContent = 'in chat';
            statusEl.className = 'status-in-chat';
        }
    }
});

// --- ЖИВОЙ ТАЙМЕР ДЛЯ СТАТУСА "WAS ONLINE" ---
setInterval(() => {
    if (currentChatUser) {
        const freshStatus = userStatusesCache[currentChatUser.phone];
        // Если человек не в сети и окно чата сейчас открыто
        if (freshStatus && freshStatus.status !== 'online' && freshStatus.status !== 'in_chat') {
            const chatWindow = document.getElementById('chat-window');
            const statusEl = document.getElementById('chat-status');
            
            // Если мы сейчас смотрим на чат и собеседник не печатает
            if (chatWindow && chatWindow.style.display === 'flex' && statusEl && !statusEl.classList.contains('status-typing')) {
                const formattedTime = formatLastSeen(freshStatus.lastSeen);
                // Обновляем текст в лайв-режиме
                if (statusEl.textContent !== formattedTime) {
                    statusEl.textContent = formattedTime;
                    statusEl.className = formattedTime === 'offline' ? 'status-offline' : 'status-last-seen';
                }
            }
        }
    }
}, 60000); // Запускается ровно раз в минуту (60000 мс)

// ==================== СИСТЕМА ЗВОНКОВ (WebRTC + ВИДЕО + ЭКРАН) ====================
let localStream = null;
let peerConnection = null;
let activeCallTarget = null;
let callTimerInterval = null;
let callStartTime = null;
let callConnected = false;  
let callRole = null;        

let isMicMuted = false;
let isLocalVideoOn = false;
let isRemoteVideoOn = false;
let currentVideoMode = null; // 'camera_user', 'camera_env', 'screen'
let isScreensharePaused = false;

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function playSound(id) { const s = document.getElementById(id); if(s){ s.currentTime=0; s.play().catch(e=>{}); } }
function stopSound(id) { const s = document.getElementById(id); if(s){ s.pause(); s.currentTime=0; } }

// Блокировка/разблокировка кнопок
function setCallControlsLocked(locked) {
    const btns = document.querySelectorAll('.locked-precall');
    btns.forEach(btn => locked ? btn.classList.add('disabled') : btn.classList.remove('disabled'));
}

// 1. Инициация звонка
async function startCall(type) {
    if (!currentChatUser) return;
    activeCallTarget = currentChatUser.phone;
    callRole = 'caller';
    callConnected = false;
    
    // UI Сброс
    setCallControlsLocked(true); // Блокируем кнопки до ответа!
    document.getElementById('call-audio-layer').style.display = 'flex';
    document.getElementById('call-video-layer').style.display = 'none';
    document.getElementById('btn-add-user').style.display = 'flex';
    document.getElementById('btn-camera-action').style.display = 'none';
    
    const targetBanner = currentChatUser.bannerUrl || 'banner.jpg';
    const targetAvatar = currentChatUser.avatarUrl || 'placeholder.webp';
    const targetName = `@${currentChatUser.username || 'username'}`;
    
    document.getElementById('call-bg-banner').style.backgroundImage = `url(${targetBanner})`;
    document.getElementById('call-target-avatar').src = targetAvatar;
    document.getElementById('remote-fallback-bg').style.backgroundImage = `url(${targetBanner})`;
    document.getElementById('remote-fallback-avatar').src = targetAvatar;

    const myPhone = localStorage.getItem('active_session_full_number');
    const myBanner = localStorage.getItem('banner_for_'+myPhone) || 'banner.jpg';
    const myAvatar = localStorage.getItem('avatar_for_'+myPhone) || 'placeholder.webp';
    document.getElementById('local-fallback-bg').style.backgroundImage = `url(${myBanner})`;
    document.getElementById('local-fallback-avatar').src = myAvatar;
    
    document.getElementById('call-target-name').textContent = targetName;
    document.getElementById('video-target-name').textContent = targetName;
    
    document.getElementById('call-status-timer-audio').textContent = 'calling....';
    document.getElementById('call-status-timer-video').textContent = 'calling....';
    
    document.getElementById('call-fullscreen-overlay').classList.add('active'); 

    document.getElementById('btn-toggle-mic').classList.remove('muted');
    document.getElementById('btn-toggle-video').classList.add('muted');
    isMicMuted = false;
    isLocalVideoOn = false;
    isRemoteVideoOn = false;

    try {
        // Изначально захватываем ТОЛЬКО аудио
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        socket.emit('call_user', {
            targetPhone: activeCallTarget,
            type: 'audio', // Стартуем всегда как аудио под капотом
            callerName: localStorage.getItem('user_name_for_'+myPhone) || 'User',
            callerAvatar: myAvatar,
            callerBanner: myBanner
        });

        playSound('sound-calling');
        setupPeerConnection(true); // Создаем оффер
    } catch (err) {
        alert("Нет доступа к микрофону!");
        endCall();
    }
}

// 2. Входящий звонок
// 2. Входящий звонок
socket.on('incoming_call', (data) => {
    activeCallTarget = data.fromPhone;
    callRole = 'receiver';
    callConnected = false;
    
    document.getElementById('incoming-avatar').src = data.callerAvatar || 'placeholder.webp';
    
    // ИСПРАВЛЕНЫ КАВЫЧКИ! Теперь берем настоящую переменную
    document.getElementById('incoming-name').textContent = data.callerName;
    document.getElementById('incoming-type').textContent = 'is calling you...';
    
    document.getElementById('call-bg-banner').style.backgroundImage = `url(${data.callerBanner || 'banner.jpg'})`;
    document.getElementById('call-target-avatar').src = data.callerAvatar || 'placeholder.webp';
    document.getElementById('remote-fallback-bg').style.backgroundImage = `url(${data.callerBanner || 'banner.jpg'})`;
    document.getElementById('remote-fallback-avatar').src = data.callerAvatar || 'placeholder.webp';
    
    const myPhone = localStorage.getItem('active_session_full_number');
    document.getElementById('local-fallback-bg').style.backgroundImage = `url(${localStorage.getItem('banner_for_'+myPhone) || 'banner.jpg'})`;
    document.getElementById('local-fallback-avatar').src = localStorage.getItem('avatar_for_'+myPhone) || 'placeholder.webp';

    // ИСПРАВЛЕНЫ КАВЫЧКИ ЗДЕСЬ ТОЖЕ!
    document.getElementById('call-target-name').textContent = data.callerName;
    document.getElementById('video-target-name').textContent = data.callerName;

    document.getElementById('incoming-call-toast').classList.add('show');
    playSound('sound-ringing');
});

// 3. Ответ на звонок
async function answerCall(isAccepted) {
    const myPhone = localStorage.getItem('active_session_full_number');
    const toast = document.getElementById('incoming-call-toast');

    if (activeCallTarget === myPhone) {
        toast.classList.add('shake');
        setTimeout(() => { toast.classList.remove('shake'); toast.classList.remove('show'); stopSound('sound-ringing'); endCall(); }, 600);
        return;
    }

    toast.classList.remove('show');
    stopSound('sound-ringing');
    
    if (!isAccepted) {
        socket.emit('call_response', { targetPhone: activeCallTarget, accepted: false });
        playSound('sound-decline');
        cleanupCall();
        return;
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        document.getElementById('call-status-timer-audio').textContent = 'connecting...';
        document.getElementById('call-fullscreen-overlay').classList.add('active');
        
        setCallControlsLocked(true);
        socket.emit('call_response', { targetPhone: activeCallTarget, accepted: true });
        setupPeerConnection(false); 
    } catch (err) {
        alert("Нет доступа к микрофону!");
        socket.emit('call_response', { targetPhone: activeCallTarget, accepted: false });
    }
}

// 4. Обработка ответа сервером
socket.on('call_response', (data) => {
    stopSound('sound-calling');
    if (!data.accepted) {
        document.getElementById('call-status-timer-audio').textContent = 'declined';
        playSound('sound-decline');
        setTimeout(cleanupCall, 1500);
    }
});

// 5. УМНЫЙ WEBRTC (Авто-переговоры для видео)
function setupPeerConnection(isCaller) {
    peerConnection = new RTCPeerConnection(rtcConfig);
    
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Динамическое добавление потоков
    peerConnection.onnegotiationneeded = async () => {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('webrtc_signal', { targetPhone: activeCallTarget, signal: peerConnection.localDescription });
        } catch (err) { console.error(err); }
    };

    peerConnection.ontrack = (event) => {
        if (event.track.kind === 'audio') {
            document.getElementById('remote-audio').srcObject = event.streams[0];
            if (!callConnected) {
                callConnected = true;
                setCallControlsLocked(false); // ЗВОНОК НАЧАЛСЯ - РАЗБЛОКИРУЕМ КНОПКИ
                startCallTimer();
            }
        }
        if (event.track.kind === 'video') {
            document.getElementById('remote-video').srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc_signal', { targetPhone: activeCallTarget, signal: { type: 'candidate', candidate: event.candidate } });
        }
    };
}

socket.on('webrtc_signal', async (data) => {
    if (!peerConnection) return;
    if (data.signal.type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('webrtc_signal', { targetPhone: activeCallTarget, signal: answer });
    } else if (data.signal.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
    } else if (data.signal.type === 'candidate') {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
    }
});

// ==================== УПРАВЛЕНИЕ ВИДЕО И ЭКРАНОМ ====================

function openVideoModal() {
    if (isLocalVideoOn) {
        // Выключаем видео
        turnOffLocalVideo();
    } else {
        // Открываем модалку выбора
        document.getElementById('video-source-modal').style.display = 'block';
    }
}
function closeVideoModal() { document.getElementById('video-source-modal').style.display = 'none'; }

async function activateVideoMode(mode) {
    closeVideoModal();
    try {
        let newStream;
        if (mode === 'screen') {
            newStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        } else {
            newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } });
        }

        const videoTrack = newStream.getVideoTracks()[0];
        
        // Если экран перестали шарить кнопкой браузера "Остановить"
        videoTrack.onended = () => turnOffLocalVideo(); 

        // Добавляем видео в трансляцию
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
            sender.replaceTrack(videoTrack);
        } else {
            peerConnection.addTrack(videoTrack, localStream);
        }

        localStream.addTrack(videoTrack);
        document.getElementById('local-video').srcObject = localStream;
        
        isLocalVideoOn = true;
        currentVideoMode = mode;
        isScreensharePaused = false;
        
        document.getElementById('btn-toggle-video').classList.remove('muted');
        
        // Настройка кнопки "Action" (Переворот камеры ИЛИ Пауза экрана)
        const actionBtn = document.getElementById('btn-camera-action');
        const actionIcon = document.getElementById('camera-action-icon');
        actionBtn.style.display = 'flex';
        actionIcon.src = mode === 'screen' ? 'pause.png' : 'flip.png';

        updateVideoLayout();
        socket.emit('video_state_update', { targetPhone: activeCallTarget, isVideoOn: true });

    } catch (e) { console.warn("Видео отменено", e); }
}

function turnOffLocalVideo() {
    isLocalVideoOn = false;
    currentVideoMode = null;
    document.getElementById('btn-toggle-video').classList.add('muted');
    document.getElementById('btn-camera-action').style.display = 'none';

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.stop();
        localStream.removeTrack(videoTrack);
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) peerConnection.removeTrack(sender);
    }
    
    updateVideoLayout();
    socket.emit('video_state_update', { targetPhone: activeCallTarget, isVideoOn: false });
}

// Синхронизация состояний камер
socket.on('remote_video_state', (data) => {
    isRemoteVideoOn = data.isVideoOn;
    updateVideoLayout();
});

// Умный Layout (Отрисовка слоев и Фаллбэков)
function updateVideoLayout() {
    const audioLayer = document.getElementById('call-audio-layer');
    const videoLayer = document.getElementById('call-video-layer');
    
    // Если оба выключили видео -> Режим Аудио Звонка
    if (!isLocalVideoOn && !isRemoteVideoOn) {
        videoLayer.style.display = 'none';
        audioLayer.style.display = 'flex';
        document.getElementById('btn-add-user').style.display = 'flex';
        return;
    }

    // Иначе режим Видео Звонка
    audioLayer.style.display = 'none';
    videoLayer.style.display = 'block';
    document.getElementById('btn-add-user').style.display = 'none';

    // Управление фаллбэками (Заглушками)
    document.getElementById('local-video-fallback').style.display = isLocalVideoOn ? 'none' : 'flex';
    document.getElementById('remote-video-fallback').style.display = isRemoteVideoOn ? 'none' : 'flex';
}

// Смена видео местами (Главный <-> PiP)
function swapVideos(clickedElement) {
    const remoteContainer = document.getElementById('remote-video-container');
    const localContainer = document.getElementById('local-video-container');

    // Меняем классы оболочек местами
    if (remoteContainer.classList.contains('video-main-wrapper')) {
        remoteContainer.className = 'video-pip-wrapper';
        localContainer.className = 'video-main-wrapper';
    } else {
        remoteContainer.className = 'video-main-wrapper';
        localContainer.className = 'video-pip-wrapper';
    }
}

// Действие камеры: Смена фронт/бэк ИЛИ Пауза экрана
function handleCameraAction() {
    if (currentVideoMode === 'screen') {
        // ПАУЗА ЭКРАНА
        isScreensharePaused = !isScreensharePaused;
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) videoTrack.enabled = !isScreensharePaused; // Замораживает кадр
        
        socket.emit('screenshare_paused', { 
            targetPhone: activeCallTarget, 
            isPaused: isScreensharePaused,
            username: document.getElementById('user-display-name')?.innerText || 'User' 
        });
    } else {
        // ПЕРЕВОРОТ КАМЕРЫ
        const nextMode = currentVideoMode === 'user' ? 'environment' : 'user';
        activateVideoMode(nextMode); // Перезапускаем поток с новой камерой
    }
}

socket.on('remote_screenshare_paused', (data) => {
    const remoteVideo = document.getElementById('remote-video');
    const notify = document.getElementById('mic-mute-notify');
    
    if (data.isPaused) {
        remoteVideo.classList.add('paused-blur');
        notify.textContent = `${data.username} paused the sharing`;
        notify.style.display = 'block';
    } else {
        remoteVideo.classList.remove('paused-blur');
        notify.style.display = 'none';
    }
});

// ==================== МИКРОФОН И ЗАВЕРШЕНИЕ ====================
function toggleMic() {
    if (!localStream) return;
    isMicMuted = !isMicMuted;
    localStream.getAudioTracks()[0].enabled = !isMicMuted;
    
    const micBtn = document.getElementById('btn-toggle-mic');
    isMicMuted ? micBtn.classList.add('muted') : micBtn.classList.remove('muted');

    socket.emit('mic_toggled', {
        targetPhone: activeCallTarget,
        username: document.getElementById('user-display-name')?.innerText || 'User',
        isMuted: isMicMuted
    });
}

socket.on('mic_status_changed', (data) => {
    const notify = document.getElementById('mic-mute-notify');
    if (data.isMuted) {
        notify.textContent = `${data.username} turned the microphone off`;
        notify.style.display = 'block';
    } else {
        notify.style.display = 'none';
    }
});

// Блокировка добавления себя в звонок
function toggleInviteMenu() {
    const menu = document.getElementById('call-invite-menu');
    const list = document.getElementById('call-invite-list');
    
    if (menu.style.display === 'none') {
        list.innerHTML = '';
        const chatCards = document.querySelectorAll('#chat-list-container .user-chat-card');
        chatCards.forEach(card => {
            const clone = card.cloneNode(true);
            clone.onclick = () => {
                const targetPhone = card.dataset.phone;
                if (targetPhone === localStorage.getItem('active_session_full_number')) {
                    menu.classList.add('shake');
                    setTimeout(() => menu.classList.remove('shake'), 500);
                    return; 
                }
                
                document.getElementById('call-bg-banner-2').style.backgroundImage = `url(banner.jpg)`;
                document.getElementById('call-bg-banner-2').style.display = 'block';
                document.getElementById('call-target-avatar-2').src = clone.querySelector('img').src;
                document.getElementById('call-target-avatar-2').style.display = 'block';
                
                socket.emit('invite_to_call', { targetPhone: targetPhone, callerName: "Group Call" });
                menu.style.display = 'none';
            };
            list.appendChild(clone);
        });
        menu.style.display = 'flex';
    } else {
        menu.style.display = 'none';
    }
}

function startCallTimer() {
    callStartTime = Date.now();
    const timerAudio = document.getElementById('call-status-timer-audio');
    const timerVideo = document.getElementById('call-status-timer-video');
    
    callTimerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - callStartTime) / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const timeStr = `${m}:${s.toString().padStart(2, '0')}`;
        timerAudio.textContent = timeStr;
        timerVideo.textContent = timeStr;
    }, 1000);
}

function endCall() {
    if (activeCallTarget) socket.emit('call_ended', { targetPhone: activeCallTarget });
    cleanupCall();
}

socket.on('call_ended', () => {
    playSound('sound-decline');
    cleanupCall();
});

function cleanupCall() {
    // Сохранение лога в переписку
    if (callRole === 'caller' && activeCallTarget) {
        socket.emit('send_private_message', {
            recipientPhone: activeCallTarget,
            text: '', 
            type: 'call_log',
            callStatus: callConnected ? 'success' : 'canceled',
            duration: callConnected ? document.getElementById('call-status-timer-audio').textContent : null
        });
    }

    document.getElementById('call-fullscreen-overlay').classList.remove('active');
    document.getElementById('incoming-call-toast').classList.remove('show');
    closeVideoModal();
    document.getElementById('call-invite-menu').style.display = 'none';
    
    stopSound('sound-ringing');
    stopSound('sound-calling');
    
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();
    
    // Возврат контейнеров на исходные места
    document.getElementById('remote-video-container').className = 'video-main-wrapper';
    document.getElementById('local-video-container').className = 'video-pip-wrapper';
    document.getElementById('remote-video').classList.remove('paused-blur');
    document.getElementById('mic-mute-notify').style.display = 'none';
    
    localStream = null; peerConnection = null; activeCallTarget = null;
    callRole = null; callConnected = false; isLocalVideoOn = false; isRemoteVideoOn = false;
    
    if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
}

// --- ФУНКЦИИ ЭКРАНА ИМЕНИ И ФАМИЛИИ ---
function uploadSetupAvatar() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(ev) {
                tempAvatarBase64 = ev.target.result;
                document.getElementById('setup-name-avatar').src = tempAvatarBase64;
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

function finishNameSetup() {
    const fNameInput = document.getElementById('setup-firstname');
    const lNameInput = document.getElementById('setup-lastname');
    
    const fName = fNameInput.value.trim();
    if (!fName) {
        shakeField(fNameInput);
        return; // Имя ОБЯЗАТЕЛЬНО!
    }
    
    tempFirstName = fName;
    tempLastName = lNameInput.value.trim();
    
    showScreen('setup-profile-view'); // Идем за юзернеймом
}

// Обновленная функция finishSetup (отправляет все данные)
function finishSetup() {
    const userInp = document.getElementById('setup-username');
    const bioInp = document.getElementById('setup-bio');
    
    let username = userInp.value.trim();
    let bio = bioInp.value.trim();
    let hasError = false;

    if (username === '@' || username.length === 0) { shakeField(userInp); hasError = true; }
    if (bio.length === 0) { shakeField(bioInp); hasError = true; }
    if (hasError) return;

    username = username.slice(1); 
    const currentNumber = localStorage.getItem('active_session_full_number');

    localStorage.setItem('user_name_for_' + currentNumber, username);
    localStorage.setItem('first_name_for_' + currentNumber, tempFirstName);
    localStorage.setItem('last_name_for_' + currentNumber, tempLastName);
    localStorage.setItem('bio_for_' + currentNumber, bio);
    if (tempAvatarBase64) localStorage.setItem('avatar_for_' + currentNumber, tempAvatarBase64);

    socket.emit('user_registered', {
        phone: currentNumber,
        firstName: tempFirstName,
        lastName: tempLastName,
        username: username,
        bio: bio,
        avatarBase64: tempAvatarBase64 // Передаем аватар сразу!
    });
    console.log("⏳ Данные отправлены...");
}

// ==================== МОДАЛКА ИМЕНИ И ФАМИЛИИ ====================
function showNameModal() {
    const currentNumber = localStorage.getItem('active_session_full_number');
    document.getElementById('modal-firstname-input').value = localStorage.getItem('first_name_for_' + currentNumber) || "";
    document.getElementById('modal-lastname-input').value = localStorage.getItem('last_name_for_' + currentNumber) || "";
    
    document.getElementById('name-modal').style.display = 'flex';
}

function closeNameModal() {
    document.getElementById('name-modal').style.display = 'none';
}

function saveNewName() {
    const fNameInput = document.getElementById('modal-firstname-input');
    const newFirstName = fNameInput.value.trim();
    const newLastName = document.getElementById('modal-lastname-input').value.trim();
    
    if (!newFirstName) {
        shakeField(fNameInput);
        return; // Имя не может быть пустым!
    }

    const currentNumber = localStorage.getItem('active_session_full_number');
    localStorage.setItem('first_name_for_' + currentNumber, newFirstName);
    localStorage.setItem('last_name_for_' + currentNumber, newLastName);
    
    loadProfileData(); // Обновляем UI
    
    socket.emit('update_profile', {
        phone: currentNumber,
        firstName: newFirstName,
        lastName: newLastName
    });

    closeNameModal();
}

// --- ФОРМАТЕРЫ АНАЛИТИКИ ---
function formatJoinDate(ts) {
    if (!ts) return "Recently";
    const d = new Date(ts);
    return d.getDate().toString().padStart(2, '0') + '.' + 
           (d.getMonth() + 1).toString().padStart(2, '0') + '.' + 
           d.getFullYear().toString().slice(-2);
}

function formatAnswerTime(totalMs, count) {
    if (!count || count === 0) return "Not enough data";
    
    const avgMs = totalMs / count;
    const hours = avgMs / (1000 * 60 * 60);
    
    if (hours < 1) return "Answers in minutes";
    if (hours < 24) return `Answers in ~${Math.round(hours)} hours`;
    
    const days = hours / 24;
    if (days < 7) return `Answers in ~${Math.round(days)} days`;
    
    const weeks = days / 7;
    if (weeks < 4) return `Answers in ~${Math.round(weeks)} weeks`;
    
    const months = days / 30;
    if (months < 12) return `Answers in ~${Math.round(months)} months`;
    
    const years = days / 365;
    return `Answers in ~${Math.round(years)} years`;
}

// УПРАВЛЕНИЕ ПОЛЗУНКОМ
function toggleAnswerTime(checkbox) {
    // Если чекбокс активен = блок ПОКАЗАН (hide = false). Если выключен = СКРЫТ (hide = true)
    const hide = !checkbox.checked; 
    const currentNumber = localStorage.getItem('active_session_full_number');
    
    localStorage.setItem('hide_answertime_for_' + currentNumber, hide);
    
    socket.emit('update_profile', {
        phone: currentNumber,
        hideAnswerTime: hide
    });
}

// ==================== СТАТИСТИКА ПРОФИЛЯ ====================

// Форматирование даты в формат XX.XX.XX
function formatJoinDate(timestamp) {
    if (!timestamp) return "XX.XX.XX";
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
}

// Вычисление среднего времени ответа
function formatAnswerTime(totalTimeMs, count) {
    if (!count || count === 0) return "No data"; // Если сообщений еще нет
    
    // Высчитываем среднее время в миллисекундах и переводим в минуты
    const avgMs = totalTimeMs / count;
    const avgMins = Math.round(avgMs / 60000);
    
    if (avgMins < 1) return "< 1 min";
    if (avgMins < 60) return `${avgMins} mins`;
    
    const avgHours = Math.round(avgMins / 60);
    if (avgHours < 24) return `${avgHours} hours`;
    
    const avgDays = Math.round(avgHours / 24);
    if (avgDays < 7) return `${avgDays} days`;
    
    const avgWeeks = Math.round(avgDays / 7);
    if (avgDays < 30) return `${avgWeeks} weeks`;
    
    const avgMonths = Math.round(avgDays / 30);
    if (avgMonths < 12) return `${avgMonths} months`;
    
    const avgYears = Math.round(avgDays / 365);
    return `${avgYears} years`;
}

// Функция для фиолетового тумблера (скрыть/показать)
function toggleAnswerTime() {
    const number = localStorage.getItem('active_session_full_number');
    const toggleEl = document.getElementById('answertime-toggle');
    
    // Если галочка стоит, значит мы прячем блок
    const isHidden = toggleEl.checked; 
    
    localStorage.setItem('hide_answertime_for_' + number, isHidden);
    
    // Отправляем на сервер твой готовый обработчик
    socket.emit('update_profile', {
        phone: number,
        hideAnswerTime: isHidden
    });
}

// ==================== СТАТИСТИКА: ДАТА И ВРЕМЯ ОТВЕТА ====================

// 1. Конвертация timestamp в формат ХХ.ХХ.ХХ
function formatJoinDate(timestamp) {
    if (!timestamp) return "Just joined";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "Just joined";
    
    const dd = date.getDate().toString().padStart(2, '0');
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const yy = date.getFullYear().toString().slice(-2);
    
    return `${dd}.${mm}.${yy}`;
}

// 2. Вычисление и форматирование среднего времени ответа
function formatAnswerTime(totalMs, count) {
    if (!count || count === 0 || !totalMs) return "No data yet";
    
    const avgMs = totalMs / count;
    const mins = avgMs / 60000;
    const hours = mins / 60;
    const days = hours / 24;
    
    if (mins < 60) return `${Math.max(1, Math.round(mins))} mins`;
    if (hours < 24) return `${Math.round(hours)} hours`;
    if (days < 7) return `${Math.round(days)} days`;
    if (days < 30) return `${Math.round(days / 7)} weeks`;
    if (days < 365) return `${Math.round(days / 30)} months`;
    return `${Math.round(days / 365)} years`;
}

// 3. Управление фиолетовым ползунком
function toggleAnswerTime(isTurnedOn) {
    // isTurnedOn = true (ползунок фиолетовый, мы показываем блок)
    // isTurnedOn = false (ползунок серый, мы скрываем блок)
    const isHidden = !isTurnedOn; 
    const number = localStorage.getItem('active_session_full_number');
    
    localStorage.setItem('hide_answertime_for_' + number, isHidden);
    
    // Отправляем настройку на сервер, чтобы другие ее увидели
    socket.emit('update_profile', {
        phone: number,
        hideAnswerTime: isHidden
    });
}

// 4. Функция для высчитывания и сохранения времени при прочтении чужого сообщения.
// ВЫЗЫВАЙ ЭТУ ФУНКЦИЮ ТАМ, ГДЕ СООБЩЕНИЕ ПОМЕЧАЕТСЯ КАК ПРОЧИТАННОЕ (когда открываешь чат)
function calculateMessageReadTime(messageSentTimestamp) {
    const myPhone = localStorage.getItem('active_session_full_number');
    if (!myPhone || !messageSentTimestamp) return;

    const delayMs = Date.now() - messageSentTimestamp;
    
    let totalTime = parseInt(localStorage.getItem('read_time_for_' + myPhone)) || 0;
    let readCount = parseInt(localStorage.getItem('read_count_for_' + myPhone)) || 0;

    totalTime += delayMs;
    readCount += 1;

    localStorage.setItem('read_time_for_' + myPhone, totalTime);
    localStorage.setItem('read_count_for_' + myPhone, readCount);

    // Синхронизируем статистику с сервером
    socket.emit('update_profile', {
        phone: myPhone,
        totalReadTime: totalTime,
        readMessageCount: readCount
    });

    // Обновляем текст на экране сразу
    const answerTimeEl = document.getElementById('my-answertime');
    if (answerTimeEl) {
        answerTimeEl.innerText = formatAnswerTime(totalTime, readCount);
    }
}

window.addEventListener('load', () => {
    const splash = document.getElementById('splash-screen');
    
    // Ждем 1.8 секунды (время анимации)
    setTimeout(() => {
        splash.style.opacity = '0'; // Запускаем исчезновение
        
        // Полностью удаляем из DOM через 0.5с (время transition)
        setTimeout(() => {
            splash.style.display = 'none';
        }, 500);
    }, 1800);
});


// ==================== ЛОГИКА ВКЛАДОК (POSTS / COMMENTS) ====================
// ==================== ЛОГИКА ВКЛАДОК ====================
function switchProfileTab(tabName) {
    const tabComments = document.getElementById('tab-comments');
    const tabPosts = document.getElementById('tab-posts');
    const line = document.getElementById('profile-tab-line');
    
    const contentComments = document.getElementById('content-comments');
    const contentPosts = document.getElementById('content-posts');

    if (tabName === 'comments') {
        tabComments.classList.add('active'); tabPosts.classList.remove('active');
        line.style.transform = 'translateX(0%)';
        contentComments.style.display = 'block'; contentPosts.style.display = 'none';
    } else {
        tabPosts.classList.add('active'); tabComments.classList.remove('active');
        line.style.transform = 'translateX(100%)';
        contentPosts.style.display = 'block'; contentComments.style.display = 'none';
        
        // ПЕРЕЗАПУСК АНИМАЦИИ ЗНАКА ВОПРОСА КАЖДЫЙ РАЗ, КОГДА ОТКРЫВАЮТ ПОСТЫ
        document.querySelectorAll('.empty-question-mark').forEach(qMark => {
            qMark.classList.remove('animate-question');
            void qMark.offsetWidth; // Хитрый трюк для принудительного сброса CSS-анимации
            qMark.classList.add('animate-question');
        });
    }
}

// ==================== ОТОБРАЖЕНИЕ СТОРИС И ПУСТОГО ЭКРАНА ====================
socket.on('posts_data', (data) => {
    const myPhone = localStorage.getItem('active_session_full_number');
    const isLookingAtOther = currentlyViewedUser && currentlyViewedUser.phone === data.targetPhone;
    const isLookingAtMine = document.getElementById('profile-view').style.display === 'flex' && myPhone === data.targetPhone;

    // Обновляем сетку, только если мы сейчас смотрим нужный профиль
    if (isLookingAtOther || isLookingAtMine) {
        currentPostsArray = data.posts;
        
        // Ищем все сетки постов (и в своем профиле, и в чужом)
        const grids = document.querySelectorAll('.posts-grid');
        
        grids.forEach(grid => {
            grid.innerHTML = '';
            
            if (data.posts.length === 0) {
                // ЕСЛИ ПОСТОВ НЕТ - ПОКАЗЫВАЕМ ЗНАК ВОПРОСА
                grid.style.display = 'block'; // Убираем CSS-grid, чтобы отцентровать элемент
                grid.innerHTML = `
                    <div class="empty-posts-state">
                        <div class="empty-question-mark">?</div>
                        <p>no posts here</p>
                    </div>
                `;
                
                // Запускаем анимацию сразу при рендеринге
                const qMark = grid.querySelector('.empty-question-mark');
                if (qMark) {
                    qMark.classList.remove('animate-question');
                    void qMark.offsetWidth;
                    qMark.classList.add('animate-question');
                }
            } else {
                grid.style.display = 'grid'; 
                data.posts.forEach(post => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'post-thumbnail-wrapper';
                    
                    const el = document.createElement(post.isVideo ? 'video' : 'img');
                    el.src = post.mediaUrl;
                    el.className = 'post-thumbnail';
                    if (post.isVideo) { el.muted = true; el.autoplay = false; }
                    el.onclick = () => openStoryViewer(post);
                    
                    wrapper.appendChild(el);
                    
                    // ЕСЛИ ЭТО НАШ ПРОФИЛЬ - ДОБАВЛЯЕМ КОРЗИНУ
                    if (isLookingAtMine) {
                        const delBtn = document.createElement('button');
                        delBtn.className = 'post-delete-btn';
                        delBtn.innerHTML = '<img src="delete.webp" alt="Delete">';
                        delBtn.onclick = (e) => {
                            e.stopPropagation(); // ВАЖНО: Останавливает клик, чтобы не открылся просмотр сторис
                            openPostDeleteModal(post.id);
                        };
                        wrapper.appendChild(delBtn);
                    }
                    
                    grid.appendChild(wrapper);
                });
            }
        });
    }
});

let viewedPostId = null;

function openStoryViewer(post) {
    viewedPostId = post.id;
    const imgEl = document.getElementById('view-story-img');
    const vidEl = document.getElementById('view-story-video');
    const progress = document.getElementById('story-progress');
    const viewer = document.getElementById('story-viewer');
    
    imgEl.style.display = 'none'; 
    vidEl.style.display = 'none';
    progress.style.width = '0%';
    progress.style.transition = 'none'; 
    
    document.getElementById('story-views-count').textContent = post.views.length;
    document.getElementById('story-likes-count').textContent = post.likes.length;
    const likeImg = document.getElementById('story-like-img');
    const myPhone = localStorage.getItem('active_session_full_number');
    
    if (post.likes.includes(myPhone)) likeImg.classList.add('liked');
    else likeImg.classList.remove('liked');
    
    // Показываем блок как flex и через 10мс включаем анимацию вылета
    viewer.style.display = 'flex';
    setTimeout(() => { viewer.classList.add('show-story'); }, 10);
    
    socket.emit('view_post', { postId: post.id });

    if (post.isVideo) {
        vidEl.src = post.mediaUrl;
        vidEl.style.display = 'block';
        
        // ВАЖНО: Убираем принудительный muted, если браузер позволяет
        vidEl.muted = false; 
        
        let playPromise = vidEl.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                // Если браузер заблокировал автоплей со звуком (политика безопасности)
                console.log("Автоплей со звуком заблокирован браузером. Включаем без звука.");
                vidEl.muted = true;
                vidEl.play();
            });
        }
        
        vidEl.onended = closeStoryViewer;
        
        // Живой прогресс-бар для видео
        vidEl.ontimeupdate = () => {
            if (vidEl.duration) {
                const percent = (vidEl.currentTime / vidEl.duration) * 100;
                progress.style.width = `${percent}%`;
            }
        };
    } else {
        imgEl.src = post.mediaUrl;
        imgEl.style.display = 'block';
        
        setTimeout(() => { progress.style.transition = 'width 5s linear'; progress.style.width = '100%'; }, 50);
        storyAnimationProgress = setTimeout(closeStoryViewer, 5050);
    }
}


function toggleStoryLike() {
    if (!viewedPostId) return;
    socket.emit('toggle_like_post', { postId: viewedPostId });
}

// ==================== ОБНОВЛЕНИЕ СТАТИСТИКИ (СОХРАНЕНИЕ ДАННЫХ) ====================
socket.on('post_stats_updated', (data) => {
    // 1. Сохраняем новые данные в наш локальный массив (чтобы при переоткрытии не сбрасывалось)
    if (currentPostsArray) {
        const p = currentPostsArray.find(x => x.id === data.postId);
        if (p) {
            p.views = data.views;
            p.likes = data.likes;
        }
    }

    // 2. Если сторис открыта прямо сейчас - обновляем цифры на экране
    if (viewedPostId === data.postId) {
        const viewsEl = document.getElementById('story-views-count');
        const likesEl = document.getElementById('story-likes-count');
        if (viewsEl) viewsEl.textContent = data.views.length;
        if (likesEl) likesEl.textContent = data.likes.length;
    }
});

socket.on('post_liked_status', (data) => {
    if (viewedPostId === data.postId) {
        const likeImg = document.getElementById('story-like-img');
        if (likeImg) {
            if (data.isLiked) likeImg.classList.add('liked');
            else likeImg.classList.remove('liked');
        }
    }
});

// ==================== БЕЗОПАСНОЕ ЗАКРЫТИЕ СТОРИС (ФИКС ЗАВИСАНИЙ) ====================
function closeStoryViewer() {
    const viewer = document.getElementById('story-viewer');
    if (!viewer) return;
    
    // Убираем класс, запускается CSS анимация исчезновения
    viewer.classList.remove('show-story');
    
    const vidEl = document.getElementById('view-story-video');
    if (vidEl) {
        vidEl.pause(); 
        vidEl.src = ''; // Очищаем память
    }
    
    clearTimeout(storyAnimationProgress);
    
    // Через 300мс (когда анимация закончится) полностью отключаем блок
    setTimeout(() => { 
        viewer.style.display = 'none'; 
    }, 300);
}

// ==================== ИНТЕГРАЦИЯ В СТАРЫЙ КОД ====================
// ВАЖНО: Тебе нужно найти старую функцию openOtherUserProfile() и добавить в её конец эти две строчки:
// socket.emit('get_comments', { targetPhone: user.phone });
// socket.emit('get_posts', { targetPhone: user.phone });

// А в функции рендера карточек чата (где формируется HTML с аватаром)
// Найди место, где создается `<img src="${avatarSrc}" ... class="user-dynamic-avatar">`
// И добавь туда проверку: ${chat.hasStory ? 'has-story' : ''} в class

function showPushNotification(senderName, messageText, avatarUrl) {
    if (Notification.permission === "granted") {
        new Notification(senderName, {
            body: messageText,
            icon: avatarUrl || 'placeholder.webp', // Берем аватарку из кэша
            tag: 'sparkle-msg', // Чтобы уведомления не дублировались, а обновлялись
            renotify: true
        });
    }
}

// Помощник для определения текущего открытого профиля
function getActiveProfilePhone() {
    const otherProfile = document.getElementById('other-user-profile');
    if (otherProfile && otherProfile.classList.contains('active')) {
        return currentlyViewedUser ? currentlyViewedUser.phone : null;
    }
    // Если открыт свой профиль
    return localStorage.getItem('active_session_full_number');
}

// ==================== ЛОГИКА КОММЕНТАРИЕВ ====================
function sendComment() {
    const input = document.getElementById('new-comment-input');
    const text = input.value.trim();
    const targetPhone = getActiveProfilePhone(); // Используем умную функцию
    
    if (!text || !targetPhone) return;

    socket.emit('add_comment', {
        targetPhone: targetPhone,
        text: text
    });
    input.value = '';
}

socket.on('comments_data', (data) => {
    const targetPhone = getActiveProfilePhone();
    const myPhone = localStorage.getItem('active_session_full_number');
    const isMyProfile = (targetPhone === myPhone); // Проверяем, наш ли это профиль
    
    if (targetPhone === data.targetPhone) {
        document.querySelectorAll('.comments-list').forEach(list => {
            list.innerHTML = '';
            
            if (data.comments.length === 0) {
                list.innerHTML = `
                    <div class="empty-posts-state">
                        <div class="empty-question-mark">?</div>
                        <p>no comments here</p>
                    </div>
                `;
                const qMark = list.querySelector('.empty-question-mark');
                if (qMark) {
                    void qMark.offsetWidth;
                    qMark.classList.add('animate-question');
                }
            } else {
                data.comments.forEach(c => {
                    renderComment(list, c, isMyProfile);
                });
            }
        });
    }
});

socket.on('new_comment_added', (comment) => {
    const targetPhone = getActiveProfilePhone();
    const myPhone = localStorage.getItem('active_session_full_number');
    const isMyProfile = (targetPhone === myPhone);
    
    if (targetPhone === comment.targetPhone) {
        document.querySelectorAll('.comments-list').forEach(list => {
            if (list.querySelector('.empty-posts-state')) list.innerHTML = '';
            renderComment(list, comment, isMyProfile, true); // true = добавить наверх
        });
    }
});

// Умная функция рендера комментария с поддержкой удаления
function renderComment(listElement, c, isMyProfile, prepend = false) {
    const wrapper = document.createElement('div');
    wrapper.className = 'comment-bubble-wrapper';
    wrapper.id = `comment-wrap-${c.id}`;
    
    const isPendingDelete = !!c.deleteAt;
    const textClass = isPendingDelete ? 'comment-text comment-text-pending' : 'comment-text';

    let html = `<div class="comment-bubble">
                    <span class="comment-author">${c.senderName}</span>
                    <span class="${textClass}" id="comment-text-${c.id}">${c.text}</span>
                </div>`;
                
    // Если это НАШ профиль, добавляем иконки
    if (isMyProfile) {
        if (isPendingDelete) {
            html += `<img src="waiting.png" class="comment-action-icon waiting-anim" alt="Waiting">`;
        } else {
            html += `<img src="delete.webp" class="comment-action-icon" alt="Delete" onclick="openCommentDeleteModal('${c.id}')">`;
        }
    }
    
    wrapper.innerHTML = html;
    if (prepend) listElement.insertBefore(wrapper, listElement.firstChild);
    else listElement.appendChild(wrapper);
}


// ==================== СОЗДАНИЕ СТОРИС (ВЫБОР ФАЙЛА, ПРЕДПРОСМОТР, ПУБЛИКАЦИЯ) ====================
let tempStoryBase64 = null;
let tempStoryIsVideo = false;

// Функция открывает скрытый input для выбора файла (вызывается по нажатию на розовый плюсик)
function openStoryPicker() {
    document.getElementById('story-file-input').click();
}

// Функция обрабатывает выбранный файл и показывает окно предпросмотра
function handleStoryFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    tempStoryIsVideo = file.type.startsWith('video/');
    const reader = new FileReader();
    
    reader.onload = function(ev) {
        tempStoryBase64 = ev.target.result;
        
        const creator = document.getElementById('story-creator');
        const imgEl = document.getElementById('preview-story-img');
        const vidEl = document.getElementById('preview-story-video');
        const progress = creator.querySelector('.story-progress-bar');
        
        imgEl.style.display = 'none';
        vidEl.style.display = 'none';
        progress.style.width = '0%';
        
        if (tempStoryIsVideo) {
            vidEl.src = tempStoryBase64;
            vidEl.style.display = 'block';
            vidEl.muted = false; // Включаем звук в предпросмотре!
            vidEl.volume = 1.0;
            
            vidEl.play().catch(error => {
                vidEl.muted = true;
                vidEl.play();
            });

            // Заставляем розовую полосу двигаться в предпросмотре в такт видео
            vidEl.ontimeupdate = () => {
                if (vidEl.duration) {
                    const percent = (vidEl.currentTime / vidEl.duration) * 100;
                    progress.style.width = `${percent}%`;
                }
            };
        } else {
            imgEl.src = tempStoryBase64;
            imgEl.style.display = 'block';
            progress.style.width = '100%'; // Для фото полоса сразу заполнена
        }
        
        // Показываем модальное окно с красивой анимацией
        creator.style.display = 'flex';
        setTimeout(() => { creator.classList.add('show-story'); }, 10);
    };
    reader.readAsDataURL(file);
}

// Функция закрытия окна предпросмотра (при нажатии на крестик)
function closeStoryCreator() {
    const creator = document.getElementById('story-creator');
    creator.classList.remove('show-story'); // Запускаем анимацию исчезновения
    
    const vidEl = document.getElementById('preview-story-video');
    vidEl.pause();
    vidEl.src = '';
    vidEl.ontimeupdate = null; // Отключаем обработчик ползунка
    
    setTimeout(() => {
        creator.style.display = 'none';
        document.getElementById('story-file-input').value = '';
        tempStoryBase64 = null;
    }, 300); // Ждем пока CSS анимация закончится
}

// Функция публикации сторис (кнопка Post)
function uploadStory() {
    if (!tempStoryBase64) return;
    
    // Отправляем файл на сервер
    socket.emit('create_post', {
        mediaBase64: tempStoryBase64,
        isVideo: tempStoryIsVideo
    });
    
    closeStoryCreator(); // Закрываем окно предпросмотра
    openChats(); // Перекидываем пользователя в раздел чатов
}

// ==================== ЛОГИКА УДАЛЕНИЯ КОММЕНТАРИЕВ ====================
let commentIdToDelete = null;

function openCommentDeleteModal(commentId) {
    commentIdToDelete = commentId;
    document.getElementById('comment-delete-modal').style.display = 'flex';
}

function closeCommentDeleteModal() {
    commentIdToDelete = null;
    document.getElementById('comment-delete-modal').style.display = 'none';
}

document.getElementById('confirm-comment-delete-btn').onclick = () => {
    if (commentIdToDelete) {
        socket.emit('mark_comment_delete', { commentId: commentIdToDelete });
    }
    closeCommentDeleteModal();
};

socket.on('comment_marked_deleted', (data) => {
    // Мгновенное визуальное обновление (Красный текст + часы)
    const textEl = document.getElementById(`comment-text-${data.commentId}`);
    if (textEl) textEl.classList.add('comment-text-pending');
    
    const wrapEl = document.getElementById(`comment-wrap-${data.commentId}`);
    if (wrapEl) {
        // Ищем старую кнопку delete и меняем на waiting
        const oldIcon = wrapEl.querySelector('.comment-action-icon');
        if (oldIcon && !oldIcon.classList.contains('waiting-anim')) {
            const newIcon = document.createElement('img');
            newIcon.src = 'waiting.png';
            newIcon.className = 'comment-action-icon waiting-anim';
            wrapEl.replaceChild(newIcon, oldIcon);
        }
    }
});

// ==================== ЛОГИКА УДАЛЕНИЯ ПОСТОВ (СТОРИС) ====================
let postIdToDelete = null;

function openPostDeleteModal(postId) {
    postIdToDelete = postId;
    document.getElementById('post-delete-modal').style.display = 'flex';
}

function closePostDeleteModal() {
    postIdToDelete = null;
    document.getElementById('post-delete-modal').style.display = 'none';
}

document.getElementById('confirm-post-delete-btn').onclick = () => {
    if (postIdToDelete) {
        socket.emit('delete_post', { postId: postIdToDelete });
    }
    closePostDeleteModal();
};

socket.on('post_deleted_success', (data) => {
    // Принудительно перезапрашиваем посты, чтобы сетка обновилась
    socket.emit('get_posts', { targetPhone: data.targetPhone });
});