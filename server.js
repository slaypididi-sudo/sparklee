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

// Функции работы с базой
function loadUsers() {
    if (!fs.existsSync(DB_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } 
    catch (e) { return []; }
}

function saveUsers(users) {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

// Глобальная функция для вывода логов
function logAllUsers() {
    const list = allRegisteredUsers.map(u => `+${u.phone} юз ${u.username}`).join(", ");
    console.log("Все пользователи: " + list);
}

let allRegisteredUsers = loadUsers();

io.on('connection', (socket) => {
    console.log('[LOG] Клиент подключился:', socket.id);

    // РЕГИСТРАЦИЯ
    socket.on('user_registered', (userData) => {
        if (!allRegisteredUsers.find(u => u.phone === userData.phone)) {
            userData.sessionToken = Math.random().toString(36).substr(2) + Date.now();
            allRegisteredUsers.push(userData);
            saveUsers(allRegisteredUsers);
            
            console.log(`Зарегестрирован пользователь ${userData.phone} юзернейм ${userData.username}`);
            logAllUsers(); // Вызываем лог
            
            socket.emit('auth_success', userData);
        }
    });

    // ПРОВЕРКА СЕССИИ
    socket.on('check_session', (token) => {
        const user = allRegisteredUsers.find(u => u.sessionToken === token);
        if (user) {
            socket.emit('auth_success', user);
        } else {
            socket.emit('auth_required');
        }
    });

    // ОБНОВЛЕНИЕ ЮЗЕРНЕЙМА
    socket.on('update_username', (data) => {
        const user = allRegisteredUsers.find(u => u.phone === data.phone);
        if (user) {
            user.username = data.newName;
            saveUsers(allRegisteredUsers);
            
            console.log(`Имя изменено: ${data.newName}`);
            logAllUsers(); // Вызываем лог
            
            socket.emit('update_success', { newName: data.newName });
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
