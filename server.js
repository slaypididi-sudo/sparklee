const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const DB_FILE = path.join(__dirname, 'users.json');

app.use(express.static(path.join(__dirname, 'public')));

// Функция загрузки БД
function loadUsers() {
    if (!fs.existsSync(DB_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } 
    catch (e) { return []; }
}

// Функция сохранения БД
function saveUsers(users) {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

let allRegisteredUsers = loadUsers();

io.on('connection', (socket) => {
    console.log('[LOG] Клиент подключился:', socket.id);

    // 1. РЕГИСТРАЦИЯ
    socket.on('user_registered', (userData) => {
        if (!allRegisteredUsers.find(u => u.phone === userData.phone)) {
            userData.sessionToken = Math.random().toString(36).substr(2) + Date.now();
            allRegisteredUsers.push(userData);
            saveUsers(allRegisteredUsers);
            console.log(`[LOG] Зарегистрирован: ${userData.username}`);
            socket.emit('auth_success', userData);
        }
    });

    // 2. ПРОВЕРКА СЕССИИ (авто-вход)
    socket.on('check_session', (token) => {
        const user = allRegisteredUsers.find(u => u.sessionToken === token);
        if (user) {
            socket.emit('auth_success', user);
        } else {
            socket.emit('auth_required');
        }
    });

    // 3. ОБНОВЛЕНИЕ ЮЗЕРНЕЙМА
    socket.on('update_username', (data) => {
        const user = allRegisteredUsers.find(u => u.phone === data.phone);
        if (user) {
            user.username = data.newName;
            saveUsers(allRegisteredUsers);
            console.log(`[LOG] Имя изменено: ${data.newName}`);
            socket.emit('update_success', user);
        }
    });

    socket.on('search_query', (query) => {
        // ... (оставь свою логику поиска)
    });
});

server.listen(3000, () => console.log('Сервер запущен на http://localhost:3000'));
