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
function showUsernameModal() {
    const currentNumber = localStorage.getItem('active_session_full_number');
    const currentName = localStorage.getItem('user_name_for_' + currentNumber) || "User";

    document.getElementById('modal-username-input').value = currentName;
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
    
    if (text === "") return; // Не отправляем пустоту

    // 1. Создаем контейнер для сообщения
    const chatMessages = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message-bubble', 'my-message');
    msgDiv.innerText = text;

    // 2. Добавляем в чат
    chatMessages.appendChild(msgDiv);

    // 3. Очищаем поле и скроллим вниз
    input.value = "";
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Позволяет отправлять сообщение нажатием на Enter
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Открытие — МГНОВЕННО
document.querySelector('.system-bot').addEventListener('click', () => {
    const chatWindow = document.getElementById('chat-window');
    chatWindow.style.display = 'flex'; // Показываем
    
    // Добавляем класс сразу, чтобы поехала анимация
    requestAnimationFrame(() => {
        chatWindow.classList.add('open');
    });
});

// Закрытие — С АНИМАЦИЕЙ
function closeChatWindow() {
    const chatWindow = document.getElementById('chat-window');
    chatWindow.classList.remove('open'); // Уезжает вправо
    
    // Ждем 300мс, пока оно доедет, и только потом скрываем
    setTimeout(() => {
        chatWindow.style.display = 'none';
    }, 300);
}