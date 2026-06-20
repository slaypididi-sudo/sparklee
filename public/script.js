const socket = io();

document.addEventListener('DOMContentLoaded', () => {
    console.log("✅ Sparkle Messenger script fully loaded");

    // Автовход
    const savedToken = localStorage.getItem('sessionToken');
    if (savedToken) {
        console.log("🔄 Пытаемся автовход...");
        socket.emit('check_session', savedToken);
    }

    // Country code
    const countryCode = document.getElementById('countryCode');
    if (countryCode) {
        countryCode.addEventListener('input', function() {
            const code = this.value.trim();
            const info = document.getElementById('countryInfo');
            if (countriesDatabase[code]) {
                info.innerHTML = `<span class="flag-icon flag-icon-${countriesDatabase[code].icon}"></span> ${countriesDatabase[code].name}`;
            } else {
                info.innerHTML = code.length > 0 ? "Unknown code" : "";
            }
        });
    }
});

// ==================== ГЛОБАЛЬНЫЕ ДАННЫЕ ====================
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

// ==================== РЕГИСТРАЦИЯ ====================
function validateAndProceed() {
    const codeInput = document.getElementById('countryCode');
    const phoneInput = document.getElementById('phone');
    const code = codeInput.value.trim();

    if (countriesDatabase[code] && phoneInput.value.length < 7) {
        console.log(`✅ Код страны ${code} принят — переключаем фокус на номер`);
        
        // Показываем страну
        const info = document.getElementById('countryInfo');
        info.innerHTML = `<span class="flag-icon flag-icon-${countriesDatabase[code].icon}"></span> ${countriesDatabase[code].name}`;
        
        // Автофокус + выделение
        setTimeout(() => {
            phoneInput.focus();
            phoneInput.select();
        }, 50);
        
    } else if (phoneInput.value.length >= 7) {
        // Если номер уже введён — переходим к верификации
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('verify-view').style.display = 'flex';
        document.getElementById('phone-info').innerText = `Sending code to +${code}${phoneInput.value}`;
        console.log(`📲 Переход на верификацию: +${code}${phoneInput.value}`);
    } else {
        alert("Введите код страны и номер телефона (минимум 7 цифр)");
    }
}

// Новый модал
function showUsernameModal() {
    const currentNumber = localStorage.getItem('active_session_full_number');
    const currentName = localStorage.getItem('user_name_for_' + currentNumber) || "";
    
    const input = document.getElementById('modal-username-input');
    input.value = currentName;
    
    // Предпросмотр ссылки
    const preview = document.getElementById('preview-username');
    if (preview) preview.textContent = currentName || "yourname";

    input.addEventListener('input', function() {
        if (preview) preview.textContent = this.value || "yourname";
    });

    document.getElementById('username-modal').style.display = 'flex';
}

function closeUsernameModal() {
    document.getElementById('username-modal').style.display = 'none';
}

function saveNewUsername() {
    const newName = document.getElementById('modal-username-input').value.trim();
    const currentNumber = localStorage.getItem('active_session_full_number');

    if (newName.length < 4 || newName.length > 11) {
        alert("Имя должно быть от 4 до 11 символов!");
        return;
    }

    localStorage.setItem('user_name_for_' + currentNumber, newName);
    document.getElementById('user-display-name').innerText = newName;
    console.log(`✏️ Имя успешно изменено на: ${newName}`);
    closeUsernameModal();
}

function handleCodeInput(element) {
    if (element.value.length > 1) element.value = element.value.slice(0, 1);
    if (element.value && element.nextElementSibling) element.nextElementSibling.focus();

    let code = "";
    document.querySelectorAll('.code-digit').forEach(el => code += el.value);

    if (code.length === 5) {
        if (code === "55555") {
            completeRegistration();
        } else {
            alert("Неверный код! Попробуйте 55555");
        }
    }
}

function completeRegistration() {
    const code = document.getElementById('countryCode').value;
    const phone = document.getElementById('phone').value;
    const fullNumber = "+" + code + phone;

    console.log("✅ УСПЕШНАЯ РЕГИСТРАЦИЯ!");
    console.log(`📱 Зарегистрирован номер: ${fullNumber}`);

    localStorage.setItem('active_session_full_number', fullNumber);

    if (!localStorage.getItem('user_name_for_' + fullNumber)) {
        const defaultName = "NewUser_" + Math.floor(1000 + Math.random() * 9000);
        localStorage.setItem('user_name_for_' + fullNumber, defaultName);
        console.log(`👤 Создано новое имя: ${defaultName}`);
    }

    // Переход в чат
    document.getElementById('verify-view').style.display = 'none';
    document.getElementById('chat-view').style.display = 'flex';
    
    console.log("🚀 Переход в главный экран чата");
}

// ==================== USERNAME MODAL ====================
// ==================== USERNAME MODAL ====================
// ==================== USERNAME MODAL ====================
function showUsernameModal() {
    const currentNumber = localStorage.getItem('active_session_full_number');
    let currentName = localStorage.getItem('user_name_for_' + currentNumber) || "";
    
    const input = document.getElementById('modal-username-input');
    const preview = document.getElementById('preview-username');
    const rulesText = document.getElementById('username-rules');

    // Добавляем @ в начало если его нет
    if (!currentName.startsWith('@')) {
        currentName = '@' + currentName.replace('@', '');
    }
    input.value = currentName;
    if (preview) preview.textContent = currentName.replace('@', '') || "yourname";

    // Live preview + валидация
    input.oninput = function() {
        let val = this.value;

        // Не даём удалить @
        if (!val.startsWith('@')) {
            val = '@' + val;
            this.value = val;
        }

        const cleanVal = val.slice(1); // без @
        const regex = /^[a-zA-Z0-9_.\-\/]*$/;

        if (!regex.test(cleanVal)) {
            // Анимация тряски
            this.classList.add('shake');
            setTimeout(() => this.classList.remove('shake'), 1500);

            // Красный текст
            rulesText.classList.add('error');
            setTimeout(() => rulesText.classList.remove('error'), 800);

            // Удаляем последний запрещённый символ
            this.value = '@' + cleanVal.replace(/[^a-zA-Z0-9_.\-\/]/g, '');
            return;
        }

        // Обновляем превью
        if (preview) preview.textContent = cleanVal || "yourname";
    };

    // Фокус на поле
    setTimeout(() => input.focus(), 300);

    document.getElementById('username-modal').style.display = 'flex';
}

function closeUsernameModal() {
    document.getElementById('username-modal').style.display = 'none';
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
    document.getElementById('user-display-name').innerText = newName;
    
    console.log(`✏️ Имя изменено на: ${newName}`);
    closeUsernameModal();
}

function closeUsernameModal() {
    document.getElementById('username-modal').style.display = 'none';
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
    document.getElementById('user-display-name').innerText = newName;
    
    console.log(`✏️ Имя изменено на: ${newName}`);
    closeUsernameModal();
}

function closeUsernameModal() {
    document.getElementById('username-modal').style.display = 'none';
}

function saveNewUsername() {
    const newName = document.getElementById('modal-username-input').value.trim();
    const currentNumber = localStorage.getItem('active_session_full_number');

    if (newName.length < 4 || newName.length > 11) {
        alert("Имя должно быть от 4 до 11 символов!");
        return;
    }

    localStorage.setItem('user_name_for_' + currentNumber, newName);
    document.getElementById('user-display-name').innerText = newName;
    console.log(`✏️ Имя изменено на: ${newName}`);
    closeUsernameModal();
}

// ==================== НАВИГАЦИЯ ====================
function openChats() {
    document.getElementById('profile-view').style.display = 'none';
    document.getElementById('chat-view').style.display = 'flex';
}

function openProfile() {
    document.getElementById('chat-view').style.display = 'none';
    document.getElementById('profile-view').style.display = 'flex';

    const number = localStorage.getItem('active_session_full_number');
    if (number) {
        document.getElementById('user-display-name').innerText = localStorage.getItem('user_name_for_' + number) || "User";
        document.getElementById('user-phone-display').innerText = number;
    }
    loadAvatar();
}

function loadAvatar() {
    const number = localStorage.getItem('active_session_full_number');
    const avatarEl = document.querySelector('.profile-avatar-main');
    if (avatarEl) {
        avatarEl.src = localStorage.getItem('avatar_for_' + number) || 'placeholder.webp';
    }
}

// ... (тут твои существующие функции: loadAvatar, openChats, openProfile и т.д.) ...

// ВСТАВЬ ЭТОТ БЛОК В КОНЕЦ ФАЙЛА
document.addEventListener('DOMContentLoaded', () => {
    const botElement = document.querySelector('.system-bot');
    if (botElement) {
        botElement.addEventListener('click', () => {
            const chatWindow = document.getElementById('chat-window');
            if (chatWindow) {
                chatWindow.style.display = 'flex';
            }
        });
    }
});

function closeChatWindow() {
    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) {
        chatWindow.style.display = 'none';
    }
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (text === "") return;

    const chatMessages = document.getElementById('chat-messages');
    
    // Получаем текущее время
    const now = new Date();
    const timeString = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0');

    // Создаем контейнер
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message-bubble', 'my-message');
    
    // Добавляем текст
    const textSpan = document.createElement('span');
    textSpan.innerText = text;
    msgDiv.appendChild(textSpan);

    // Добавляем время
    const timeSpan = document.createElement('span');
    timeSpan.classList.add('message-time');
    timeSpan.innerText = timeString;
    msgDiv.appendChild(timeSpan);

    chatMessages.appendChild(msgDiv);
    
    input.value = "";
    chatMessages.scrollTop = chatMessages.scrollHeight; // Скролл вниз
}

// Позволяет отправлять сообщение нажатием на Enter
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('.nav-btn');
    const indicator = document.querySelector('.nav-indicator');

    buttons.forEach((btn, index) => {
        btn.addEventListener('click', () => {
            // Перемещаем индикатор
            // index 0 -> 0%, index 1 -> 33%, index 2 -> 66%
            const position = index * 33.33;
            indicator.style.transform = `translateX(${position * 3}%)`;
            
            // Убираем активность со всех, добавляем текущему
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            console.log("Переключено на:", btn.getAttribute('data-tab'));
        });
    });
});

function switchTab(tabName) {
    // 1. Двигаем индикатор
    const btns = document.querySelectorAll('.nav-btn');
    const indicator = document.getElementById('indicator');
    
    // Находим кнопку, на которую нажали
    let activeIndex = 0;
    btns.forEach((btn, index) => {
        if (btn.getAttribute('onclick').includes(tabName)) {
            activeIndex = index;
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Вычисляем позицию (сдвигаем индикатор к нужной кнопке)
    // 33.33% - это ширина одной секции
    indicator.style.transform = `translateX(${activeIndex * 100}%)`;

    // 2. Логика переключения экранов (скрываем все, показываем нужный)
    // Предположим, у тебя есть блоки <div id="chats-view"> и т.д.
    const views = ['chats', 'calls', 'profile'];
    views.forEach(view => {
        const el = document.getElementById(view + '-view');
        if (el) el.style.display = (view === tabName) ? 'flex' : 'none';
    });
}

// Поиск с автоматическим @
const searchInput = document.getElementById('input-search');
if (searchInput) {
    searchInput.addEventListener('focus', () => {
        if (!searchInput.value.startsWith('@')) {
            searchInput.value = '@';
        }
        // Можно добавить сюда открытие результатов позже
    });
}

// ==================== PROFILE FUNCTIONS ====================

function loadProfileData() {
    const number = localStorage.getItem('active_session_full_number');
    if (!number) return;

    // Имя и телефон
    document.getElementById('user-display-name').innerText = localStorage.getItem('user_name_for_' + number) || "User";
    document.getElementById('user-phone-display').innerText = number;

    // Аватарка
    const avatarEl = document.getElementById('profile-avatar-main');
    if (avatarEl) avatarEl.src = localStorage.getItem('avatar_for_' + number) || 'placeholder.webp';

    // Баннер
    const bannerEl = document.getElementById('profile-banner');
    if (bannerEl) {
        const savedBanner = localStorage.getItem('banner_for_' + number);
        if (savedBanner) bannerEl.src = savedBanner;
    }

    // Био
    document.getElementById('user-bio-text').innerText = localStorage.getItem('bio_for_' + number) || "Here will be your biography...";
}

function changeAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(ev) {
                const number = localStorage.getItem('active_session_full_number');
                localStorage.setItem('avatar_for_' + number, ev.target.result);
                document.getElementById('profile-avatar-main').src = ev.target.result;
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
                const number = localStorage.getItem('active_session_full_number');
                localStorage.setItem('banner_for_' + number, ev.target.result);
                const banner = document.getElementById('profile-banner');
                banner.src = ev.target.result;
                if (file.type.startsWith('video/')) {
                    banner.loop = true;
                    banner.muted = true;
                    banner.play();
                }
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

// Bio Modal
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
        counter.textContent = `${len}/25`;

        if (len > 25) {
            this.classList.add('shake');
            setTimeout(() => this.classList.remove('shake'), 1500);
            rules.classList.add('error');
            setTimeout(() => rules.classList.remove('error'), 800);
            this.value = this.value.slice(0, 25);
        }
    };

    document.getElementById('bio-modal').style.display = 'flex';
    textarea.focus();
}

function closeBioModal() {
    const modal = document.getElementById('bio-modal');
    if (modal) modal.style.display = 'none';
}

function saveBio() {
    const bioText = document.getElementById('modal-bio-input').value.trim();
    const number = localStorage.getItem('active_session_full_number');
    localStorage.setItem('bio_for_' + number, bioText);
    document.getElementById('user-bio-text').innerText = bioText || "Here will be your biography...";
    closeBioModal();
}

// Открытие профиля
function openProfile() {
    document.getElementById('chat-view').style.display = 'none';
    document.getElementById('profile-view').style.display = 'flex';
    loadProfileData();
}