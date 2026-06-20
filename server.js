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

// 1. ВЫНОСИМ ФУНКЦИЮ ВНЕ IO.ON
function logAllUsers(usersArray) {
    const list = usersArray.map(u => `+${u.phone} юз ${u.username}`).join(", ");
    console.log("Все пользователи: " + list);
}

let allRegisteredUsers = loadUsers();

// ... твой код выше ...

io.on('connection', (socket) => {
    console.log('[LOG] Клиент подключился:', socket.id);

    socket.on('user_registered', (userData) => {
        // ... логика регистрации ...
        logAllUsers(); // Вызов
    });

    socket.on('update_username', (data) => {
        // ... логика обновления ...
        logAllUsers(); // Вызов
    });
}); // <--- ЭТО закрывает io.on('connection', ...)

// ФУНКЦИЯ ДОЛЖНА БЫТЬ ВНЕ io.on
function logAllUsers() {
    const list = allRegisteredUsers.map(u => `+${u.phone} юз ${u.username}`).join(", ");
    console.log("Все пользователи: " + list);
} // <--- ЭТО закрывает функцию logAllUsers

// Убедись, что в конце файла НЕТ лишних символов
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
    // 3. ОБНОВЛЕНИЕ ЮЗЕРНЕЙМА
    socket.on('update_username', (data) => {
        const user = allRegisteredUsers.find(u => u.phone === data.phone);
        if (user) {
            user.username = data.newName;
            saveUsers(allRegisteredUsers);
            
            console.log(`Имя изменено: ${data.newName}`);
            
            // ВЫЗОВ ФУНКЦИИ ДЛЯ СПИСКА ВСЕХ
            logAllUsers(); 
            
            socket.emit('update_success', { newName: data.newName });
        }
    });
});

// Убедись, что функция logAllUsers определена ВНЕ io.on
function logAllUsers() {
    const list = allRegisteredUsers.map(u => `+${u.phone} юз ${u.username}`).join(", ");
    console.log("Все пользователи: " + list);
}

    // ОБНОВЛЕНИЕ ЮЗЕРНЕЙМА
    socket.on('update_username', (data) => {
        const user = allRegisteredUsers.find(u => u.phone === data.phone);
        if (user) {
            user.username = data.newName;
            saveUsers(allRegisteredUsers);
            
            console.log(`[LOG] Имя изменено: ${data.newName}`);
            logAllUsers(allRegisteredUsers); // Вызываем логи
            
            socket.emit('username_updated', { newName: data.newName });
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
