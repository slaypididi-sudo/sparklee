const fs = require('fs');
const DB_FILE = 'users.json';

// Функция для чтения БД
function loadUsers() {
    if (!fs.existsSync(DB_FILE)) return [];
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs'); // Добавляем модуль для работы с файлами

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const DB_FILE = path.join(__dirname, 'users.json');

app.use(express.static(path.join(__dirname, 'public')));

// Функция загрузки пользователей из файла
function loadUsers() {
    if (!fs.existsSync(DB_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

// Функция сохранения пользователей в файл
function saveUsers(users) {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

let allRegisteredUsers = loadUsers(); 

io.on('connection', (socket) => {
    console.log('>>> КЛИЕНТ ПОДКЛЮЧИЛСЯ, ID:', socket.id);

    // 1. РЕГИСТРАЦИЯ
    socket.on('user_registered', (userData) => {
        if (!allRegisteredUsers.find(u => u.phone === userData.phone)) {
            // Создаем токен для сессии
            userData.sessionToken = Math.random().toString(36).substr(2) + Date.now();
            allRegisteredUsers.push(userData);
            saveUsers(allRegisteredUsers); // Сохраняем в файл
            console.log("Зарегистрирован:", userData.username);
            socket.emit('auth_success', userData);
        }
    });

    // 2. ПРОВЕРКА СЕССИИ (при входе на сайт)
    socket.on('check_session', (token) => {
        const user = allRegisteredUsers.find(u => u.sessionToken === token);
        if (user) {
            socket.emit('auth_success', user);
        } else {
            socket.emit('auth_required');
        }
    });

    // 3. ЖИВОЙ ПОИСК (твоя логика не тронута)
    socket.on('search_query', (query) => {
        if (!query || query === '@') {
            socket.emit('search_results', []);
            return;
        }

        const cleanQuery = query.replace('@', '').toLowerCase();
        const results = allRegisteredUsers
            .map(u => ({
                ...u,
                score: u.username.toLowerCase().startsWith(cleanQuery) ? 2 : 1 
            }))
            .filter(u => u.username.toLowerCase().includes(cleanQuery))
            .sort((a, b) => b.score - a.score);

        socket.emit('search_results', results);
    });

    socket.on('disconnect', () => {
        console.log('>>> КЛИЕНТ ОТКЛЮЧИЛСЯ');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
