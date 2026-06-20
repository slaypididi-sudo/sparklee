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

function loadUsers() {
    if (!fs.existsSync(DB_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } 
    catch (e) { return []; }
}

function saveUsers(users) {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

// ЭТА ФУНКЦИЯ ДОЛЖНА БЫТЬ ВНЕ io.on
function logAllUsers() {
    const list = allRegisteredUsers.map(u => `+${u.phone} юз ${u.username}`).join(", ");
    console.log("Все пользователи: " + list);
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
            
            console.log(`Зарегестрирован пользователь ${userData.phone} юзернейм ${userData.username}`);
            logAllUsers(); // Выводим актуальный список
            
            socket.emit('auth_success', userData);
        }
    });

    // 3. ОБНОВЛЕНИЕ ЮЗЕРНЕЙМА
    socket.on('update_username', (data) => {
        const user = allRegisteredUsers.find(u => u.phone === data.phone);
        if (user) {
            user.username = data.newName;
            saveUsers(allRegisteredUsers);
            
            console.log(`[LOG] Имя изменено: ${data.newName}`);
            logAllUsers(); // Выводим актуальный список после изменения
            
            socket.emit('update_success', user);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
