const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Объявляем массив один раз
let allRegisteredUsers = []; 

io.on('connection', (socket) => {
    console.log('>>> КЛИЕНТ ПОДКЛЮЧИЛСЯ, ID:', socket.id);

    // 1. РЕГИСТРАЦИЯ
    socket.on('user_registered', (userData) => {
        // Проверяем, нет ли уже такого пользователя, чтобы не дублировать
        if (!allRegisteredUsers.find(u => u.phone === userData.phone)) {
            allRegisteredUsers.push(userData);
            console.log("Зарегистрирован:", userData.username);
        }
    });

    // 2. ЖИВОЙ ПОИСК
    socket.on('search_query', (query) => {
        if (!query || query === '@') {
            socket.emit('search_results', []);
            return;
        }

        const cleanQuery = query.replace('@', '').toLowerCase();
        
        // Фильтруем и сортируем по похожести
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

// В самом конце server.js:
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});