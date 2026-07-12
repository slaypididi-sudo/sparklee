const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const twilio = require('twilio');

// ВАЖНО: Вставь сюда свои реальные ключи, но никому их не показывай!
const twilioClient = twilio('AC26eabfcf1d37dec04bdacd675d721d47', '21c947e54570fe0392fe88c49edb2365');
const TWILIO_PHONE = '+19163148186';

let pendingCodes = {}; // Временное хранилище кодов: { "+49...": "12345" }
let ipRateLimits = {}; // Хранилище блокировок: { "::1": { fails: 0, blockUntil: 0 } }
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const app = express();
const server = http.createServer(app);

// Увеличиваем лимит данных со стандартного 1МБ до 100МБ для видео
const io = new Server(server, {
    maxHttpBufferSize: 1e8 
});

const DB_FILE = path.join(__dirname, 'users.json');
const MSG_FILE = path.join(__dirname, 'messages.json');

const COMMENTS_FILE = path.join(__dirname, 'comments.json');
const POSTS_FILE = path.join(__dirname, 'posts.json');

function loadComments() {
    if (!fs.existsSync(COMMENTS_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8')); } catch (e) { return []; }
}
function saveComments(comments) { fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2)); }

function loadPosts() {
    if (!fs.existsSync(POSTS_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')); } catch (e) { return []; }
}
function savePosts(posts) { fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2)); }

app.use(express.static(path.join(__dirname, 'public')));

function loadUsers() {
    if (!fs.existsSync(DB_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { return []; }
}
function saveUsers(users) { fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2)); }

function loadMessages() {
    if (!fs.existsSync(MSG_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(MSG_FILE, 'utf8')); } catch (e) { return []; }
}
function saveMessages(messages) { fs.writeFileSync(MSG_FILE, JSON.stringify(messages, null, 2)); }

let allRegisteredUsers = loadUsers();
let onlineUsers = {}; 
let userChatFocus = {}; // Кто с кем сейчас в чате: { "мой_номер": "номер_собеседника" }

function broadcastChatList(userPhone) {
    const socketId = onlineUsers[userPhone];
    if (!socketId) return;

    const messages = loadMessages();
    const users = loadUsers();
    let partners = new Set();
    
    messages.forEach(m => {
        if (m.sender === userPhone) partners.add(m.recipient);
        if (m.recipient === userPhone) partners.add(m.sender);
    });

    let chatList = [];
    partners.forEach(partnerPhone => {
        const partnerUser = users.find(u => u.phone === partnerPhone) || { phone: partnerPhone, username: "Пользователь", bio: "" };
        const pairMessages = messages.filter(m => 
            (m.sender === userPhone && m.recipient === partnerPhone) ||
            (m.sender === partnerPhone && m.recipient === userPhone)
        );

        if (pairMessages.length === 0) return;
        const lastMsg = pairMessages[pairMessages.length - 1];
        const unreadCount = pairMessages.filter(m => m.recipient === userPhone && !m.read).length;

        // Логика для правильного отображения превью звонков в списке чатов
        let previewText = lastMsg.text;
        if (lastMsg.type === 'call_log') {
            previewText = lastMsg.callStatus === 'success' ? '📞 Звонок' : '📵 Отмененный звонок';
        }

        chatList.push({
            phone: partnerUser.phone,
            firstName: partnerUser.firstName, // ДОБАВИТЬ ЭТО
            lastName: partnerUser.lastName,   // ДОБАВИТЬ ЭТО
            username: partnerUser.username,
            bio: partnerUser.bio || "",
            avatarUrl: partnerUser.avatarUrl || "",
            bannerUrl: partnerUser.bannerUrl || "",
            lastMessage: previewText,
            timestamp: lastMsg.timestamp,
            unreadCount: unreadCount,
            isOnline: !!onlineUsers[partnerUser.phone],
            lastSeen: partnerUser.lastSeen || null,
            joinDate: partnerUser.joinDate || null,
            totalReadTime: partnerUser.totalReadTime || 0,
            readMessageCount: partnerUser.readMessageCount || 0,
            hideAnswerTime: partnerUser.hideAnswerTime || false,
            // Добавь эту строчку внутрь chatList.push, где ты передаешь avatarUrl и прочее:
            hasStory: loadPosts().some(p => p.authorPhone === partnerUser.phone && (Date.now() - p.timestamp < 24 * 60 * 60 * 1000)),
        });
    });

    chatList.sort((a, b) => b.timestamp - a.timestamp);
    io.to(socketId).emit('chat_list_data', chatList);
}

io.on('connection', (socket) => {
    console.log('🟢 [СИСТЕМА] Новое подключение:', socket.id);

    // ВАЖНО: Добавь это в server.js внутри io.on('connection')
socket.on('check_session', (token) => {
    const users = loadUsers();
    const user = users.find(u => u.sessionToken === token);
    
    if (user) {
        socket.phone = user.phone;
        onlineUsers[user.phone] = socket.id;
        
        console.log(`✅ Сессия восстановлена для: ${user.phone}`);
        
        // Отправляем успех, чтобы клиент перешел в чаты
        socket.emit('auth_success', user);
        
        // Сразу подгружаем чаты
        broadcastChatList(user.phone);
    } else {
        socket.emit('session_invalid');
    }
});

// ==================== СИГНАЛИНГ ДЛЯ ЗВОНКОВ (WebRTC) ====================
    
    // 1. Инициация звонка (А звонит Б)
    socket.on('call_user', (data) => {
        const targetSocket = onlineUsers[data.targetPhone];
        if (targetSocket) {
            io.to(targetSocket).emit('incoming_call', {
                fromPhone: socket.phone,
                callerName: data.callerName,
                callerAvatar: data.callerAvatar,
                callerBanner: data.callerBanner,
                type: data.type
            });
        }
    });

    // 2. Ответ на звонок (Б принял или отклонил)
    socket.on('call_response', (data) => {
        const targetSocket = onlineUsers[data.targetPhone];
        if (targetSocket) {
            io.to(targetSocket).emit('call_response', {
                fromPhone: socket.phone,
                accepted: data.accepted
            });
        }
    });

    // 3. Завершение звонка (сброс)
    socket.on('call_ended', (data) => {
        const targetSocket = onlineUsers[data.targetPhone];
        if (targetSocket) {
            io.to(targetSocket).emit('call_ended', { fromPhone: socket.phone });
        }
    });

    // 4. Передача WebRTC данных (SDP и ICE кандидаты)
    socket.on('webrtc_signal', (data) => {
        const targetSocket = onlineUsers[data.targetPhone];
        if (targetSocket) {
            io.to(targetSocket).emit('webrtc_signal', {
                fromPhone: socket.phone,
                signal: data.signal
            });
        }
    });

    // 5. Передача статуса микрофона
    socket.on('mic_toggled', (data) => {
        const targetSocket = onlineUsers[data.targetPhone];
        if (targetSocket) {
            io.to(targetSocket).emit('mic_status_changed', {
                username: data.username,
                isMuted: data.isMuted
            });
        }
    });

    // === НОВЫЕ СОБЫТИЯ ДЛЯ ВИДЕО И ЭКРАНА ===
    socket.on('video_state_update', (data) => {
        const targetSocket = onlineUsers[data.targetPhone];
        if (targetSocket) {
            io.to(targetSocket).emit('remote_video_state', {
                isVideoOn: data.isVideoOn,
                username: data.username
            });
        }
    });

    socket.on('screenshare_paused', (data) => {
        const targetSocket = onlineUsers[data.targetPhone];
        if (targetSocket) {
            io.to(targetSocket).emit('remote_screenshare_paused', {
                isPaused: data.isPaused,
                username: data.username
            });
        }
    });

    // 6. Приглашение третьего лица
    socket.on('invite_to_call', (data) => {
        const targetSocket = onlineUsers[data.targetPhone];
        if (targetSocket) {
            io.to(targetSocket).emit('incoming_call', {
                fromPhone: socket.phone, // Звонящий (группа)
                callerName: data.callerName, // "User1, User2"
                callerAvatar: data.callerAvatar,
                callerBanner: data.callerBanner,
                type: 'audio',
                isGroupInvite: true,
                inviterPhone: socket.phone
            });
        }
    });

// Убедись, что после сохранения профиля ты тоже шлешь auth_success
socket.on('save_profile', (data) => {
    let users = loadUsers();
    const userIndex = users.findIndex(u => u.phone === socket.phone);
    
    if (userIndex !== -1) {
        users[userIndex].username = data.username;
        users[userIndex].bio = data.bio;
        saveUsers(users);
        
        // Отправляем событие, чтобы клиент понял, что можно идти в чаты
        socket.emit('auth_success', users[userIndex]);
    }
});

// --- СИСТЕМА СТАТУСОВ ---
    socket.on('join_chat', (data) => {
        if (!socket.phone) return;
        userChatFocus[socket.phone] = data.targetPhone;
        console.log(`👁️ [СТАТУС] ${socket.phone} зашел в диалог с ${data.targetPhone}`);
        
        // Сообщаем собеседнику, что мы вошли в чат (in chat)
        const targetSocket = onlineUsers[data.targetPhone];
        if (targetSocket) {
            io.to(targetSocket).emit('user_status_changed', { phone: socket.phone, status: 'in_chat' });
        }
    });

    socket.on('leave_chat', () => {
        if (!socket.phone) return;
        const target = userChatFocus[socket.phone];
        delete userChatFocus[socket.phone];
        console.log(`🙈 [СТАТУС] ${socket.phone} вышел из диалога.`);
        
        // Сообщаем собеседнику, что мы просто онлайн
        if (target && onlineUsers[target]) {
            io.to(onlineUsers[target]).emit('user_status_changed', { phone: socket.phone, status: 'online' });
        }
    });

    // --- СТАТУС ПЕЧАТАНИЯ ---
    socket.on('typing', (data) => {
        if (!socket.phone) return;
        const targetSocket = onlineUsers[data.targetPhone];
        if (targetSocket) {
            io.to(targetSocket).emit('user_typing', { phone: socket.phone, isTyping: true });
        }
    });

    socket.on('stop_typing', (data) => {
        if (!socket.phone) return;
        const targetSocket = onlineUsers[data.targetPhone];
        if (targetSocket) {
            io.to(targetSocket).emit('user_typing', { phone: socket.phone, isTyping: false });
        }
    });

    // Получаем IP-адрес пользователя
    const clientIp = socket.handshake.address;

    // ЗАПРОС СМС КОДА
    socket.on('request_sms_code', (data) => {
        const now = Date.now();
        
        // 1. Проверяем, не заблокирован ли IP
        if (ipRateLimits[clientIp] && ipRateLimits[clientIp].blockUntil > now) {
            return socket.emit('sms_rate_limited');
        }

        const phone = data.phone;
        const code = Math.floor(10000 + Math.random() * 90000).toString();
        pendingCodes[phone] = code;

        console.log(`🔑 Генерируем код ${code} для ${phone}`);

        // 2. Отправляем СМС через Twilio
        twilioClient.messages.create({
            body: `${code} is your Sparkle verification code. Do not share it with anyone.`,
            from: TWILIO_PHONE,
            to: phone
        })
        .then(message => {
            console.log(`📱 СМС успешно отправлено (SID: ${message.sid})`);
            socket.emit('code_sent_success');
        })
        .catch(error => {
            console.error('❌ Ошибка отправки СМС:', error);
            // Даже если на триале не отправилось, эмулируем успех, чтобы работал чит-код
            socket.emit('code_sent_success'); 
        });
    });

    // ПРОВЕРКА КОДА (С чит-кодом и защитой от перебора)
    socket.on('verify_code', (data) => {
        const now = Date.now();

        // Проверяем блокировку IP
        if (ipRateLimits[clientIp] && ipRateLimits[clientIp].blockUntil > now) {
            return socket.emit('sms_rate_limited');
        }

        // Если IP нет в базе — создаем запись
        if (!ipRateLimits[clientIp]) {
            ipRateLimits[clientIp] = { fails: 0, blockUntil: 0 };
        }

        // ЧИТ-КОД 55555 ИЛИ ПРАВИЛЬНЫЙ КОД ИЗ СМС
        if (data.code === '55555' || pendingCodes[data.phone] === data.code) {
            // Успех! Сбрасываем счетчик ошибок для этого IP
            ipRateLimits[clientIp].fails = 0;
            delete pendingCodes[data.phone];
            
            let user = allRegisteredUsers.find(u => u.phone === data.phone);
            if (user) {
                console.log(`✅ [АВТОРИЗАЦИЯ] Пользователь ${data.phone} найден.`);
                socket.phone = user.phone;
                onlineUsers[user.phone] = socket.id;
                socket.emit('code_verified', { isNewUser: false, user: user });
                broadcastChatList(user.phone);
            } else {
                console.log(`🆕 [АВТОРИЗАЦИЯ] Новый номер ${data.phone}.`);
                socket.emit('code_verified', { isNewUser: true, phone: data.phone });
            }
        } else {
            // НЕВЕРНЫЙ КОД
            ipRateLimits[clientIp].fails += 1;
            console.log(`⚠️ Ошибка ввода кода для ${clientIp}. Попыток: ${ipRateLimits[clientIp].fails}`);
            
            // Если ошиблись 3 раза — блокируем на 1 час (3600000 миллисекунд)
            if (ipRateLimits[clientIp].fails >= 3) {
                ipRateLimits[clientIp].blockUntil = now + 3600000;
                return socket.emit('sms_rate_limited');
            }
            
            socket.emit('code_invalid');
        }
    });

    // Регистрация нового юзера
    // Регистрация нового юзера (ОБНОВЛЕНО С ИМЕНЕМ И ФАМИЛИЕЙ)
    socket.on('user_registered', (userData) => {
        console.log(`📝 [РЕГИСТРАЦИЯ] Создан профиль: ${userData.phone}`);
        let user = {
            phone: userData.phone,
            firstName: userData.firstName,
            lastName: userData.lastName,
            username: userData.username,
            bio: userData.bio, 
            joinDate: Date.now(),          // ДАТА РЕГИСТРАЦИИ
            totalReadTime: 0,              // Сумма всех миллисекунд до ответа
            readMessageCount: 0,           // Количество прочитанных сообщений
            hideAnswerTime: false,         // Скрыт ли блок времени ответа
            sessionToken: Math.random().toString(36).substr(2) + Date.now()
        };
        // ... (дальше твой код saveBase64Image и allRegisteredUsers.push)
        
        // Если при регистрации сразу загрузили аватар
        if (userData.avatarBase64) {
            const newUrl = saveBase64Image(userData.avatarBase64, userData.phone, 'avatar');
            if (newUrl) user.avatarUrl = newUrl;
        }

        allRegisteredUsers.push(user);
        saveUsers(allRegisteredUsers);
        
        socket.phone = user.phone;
        onlineUsers[user.phone] = socket.id;
        socket.emit('auth_success', user);
    });

    // Обновление профиля (ГЛОБАЛЬНОЕ)
// Это обработчик смены профиля на сервере
    socket.on('update_profile', (data) => {
        // Берем номер из data.phone, если socket.phone пуст
        const userPhone = socket.phone || data.phone;
        if (!userPhone) return;

        let user = allRegisteredUsers.find(u => u.phone === userPhone);
        if (!user) return;

        if (data.avatarBase64) {
            const newUrl = saveBase64Image(data.avatarBase64, userPhone, 'avatar');
            if (newUrl) user.avatarUrl = newUrl;
        }

        if (data.bannerBase64) {
            const newUrl = saveBase64Image(data.bannerBase64, userPhone, 'banner');
            if (newUrl) user.bannerUrl = newUrl;
        }

        if (data.username) user.username = data.username;
        if (data.bio) user.bio = data.bio;
        if (data.firstName !== undefined) user.firstName = data.firstName;
        if (data.lastName !== undefined) user.lastName = data.lastName;
        if (data.hideAnswerTime !== undefined) user.hideAnswerTime = data.hideAnswerTime;

        saveUsers(allRegisteredUsers);
        io.emit('profile_updated', user);
        broadcastChatList(userPhone);
    });

    socket.on('check_session', (token) => {
        let user = allRegisteredUsers.find(u => u.sessionToken === token);
        if (user) {
            console.log(`🔄 [АВТОВХОД] Успешный вход по токену: ${user.phone}`);
            socket.phone = user.phone;
            onlineUsers[user.phone] = socket.id;
            socket.emit('auth_success', user);
            broadcastChatList(user.phone);
        } else {
            socket.emit('session_invalid');
        }
    });

    socket.on('get_chat_history', (data) => {
        if (!socket.phone) return;
        console.log(`📂 [ИСТОРИЯ] Запрос истории: ${socket.phone} <-> ${data.withPhone}`);
        const messages = loadMessages();
        const myPhone = socket.phone;
        const partnerPhone = data.withPhone;

        let changed = false;
        messages.forEach(m => {
            if (m.sender === partnerPhone && m.recipient === myPhone && !m.read) {
                m.read = true;
                changed = true;
            }
        });

        let newlyReadCount = 0;
        let newlyReadTimeSum = 0;
        const now = Date.now();

        messages.forEach(m => {
            if (m.sender === partnerPhone && m.recipient === myPhone && !m.read) {
                m.read = true;
                changed = true;
                newlyReadCount++;
                newlyReadTimeSum += (now - m.timestamp); // Высчитываем сколько времени сообщение висело непрочитанным
            }
        });

        if (changed) {
            saveMessages(messages);
            
            // ОБНОВЛЯЕМ АНАЛИТИКУ ПОЛЬЗОВАТЕЛЯ
            let users = loadUsers();
            let me = users.find(u => u.phone === myPhone);
            if (me) {
                me.readMessageCount = (me.readMessageCount || 0) + newlyReadCount;
                me.totalReadTime = (me.totalReadTime || 0) + newlyReadTimeSum;
                saveUsers(users);
                io.emit('profile_updated', me); // Рассылаем обновление всем, чтобы статистика обновилась в реальном времени
            }

            const senderSocketId = onlineUsers[partnerPhone];
            if (senderSocketId) {
                io.to(senderSocketId).emit('messages_read', { byPhone: myPhone });
            }
        }
        
        const history = messages.filter(m => 
            (m.sender === myPhone && m.recipient === partnerPhone) ||
            (m.sender === partnerPhone && m.recipient === myPhone)
        );
        socket.emit('chat_history', history);
    });

    socket.on('send_private_message', (data) => {
        if (!socket.phone || !data.recipientPhone) return;
        
        // У обычных сообщений есть текст, у логов звонков текста может не быть
        if (!data.text && data.type !== 'call_log') return;

        console.log(`💬 [СООБЩЕНИЕ/ЗВОНОК] ${socket.phone} -> ${data.recipientPhone} (Тип: ${data.type || 'text'})`);

        const messages = loadMessages();
        const newMsg = {
            sender: socket.phone,
            recipient: data.recipientPhone,
            text: data.text ? data.text.trim() : '',
            type: data.type || 'text',              // 'text' или 'call_log'
            callStatus: data.callStatus || null,    // 'success' или 'canceled'
            duration: data.duration || null,        // Время разговора
            timestamp: Date.now(),
            read: false
        };

        messages.push(newMsg);
        saveMessages(messages);

        const recipientSocketId = onlineUsers[data.recipientPhone];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('new_private_message', newMsg);
            broadcastChatList(data.recipientPhone);
        }

        socket.emit('new_private_message', newMsg);
        broadcastChatList(socket.phone);
    });

    socket.on('search_user', (data) => {
        if (!data || !data.query) return socket.emit('search_results', { results: [] });
        const q = data.query.toLowerCase();
        let rawResults = [];
        if (data.mode === 'username') {
            rawResults = allRegisteredUsers.filter(u => u.username?.toLowerCase().includes(q) || u.phone?.includes(q));
        } else {
            rawResults = allRegisteredUsers.filter(u => u.bio?.toLowerCase().includes(q));
        }
        
        // Добавляем инфу об онлайне в результаты поиска (ИСПРАВЛЕНО: заменено partnerUser на u)
        const results = rawResults.map(u => ({
            ...u,
            isOnline: !!onlineUsers[u.phone],
            lastSeen: u.lastSeen || null,
            joinDate: u.joinDate || null,
            totalReadTime: u.totalReadTime || 0,
            readMessageCount: u.readMessageCount || 0,
            hideAnswerTime: u.hideAnswerTime || false,
        }));
        
        socket.emit('search_results', { results: results });
    });

    // ПРАВИЛЬНОЕ РАСПОЛОЖЕНИЕ: Внутри io.on('connection'), но ВНЕ socket.on('disconnect')
    
    socket.on('disconnect', () => {
        if (socket.phone) {
            console.log(`🔴 [ОТКЛЮЧЕНИЕ] Пользователь вышел: ${socket.phone}`);
            let user = allRegisteredUsers.find(u => u.phone === socket.phone);
            if (user) {
                user.lastSeen = Date.now();
                saveUsers(allRegisteredUsers);
            }
            delete onlineUsers[socket.phone];
            delete userChatFocus[socket.phone];
            io.emit('user_status_changed', { phone: socket.phone, status: 'offline', lastSeen: Date.now() });
            broadcastChatList(socket.phone);
        }
    }); // <-- ВАЖНО: Закрывающая скобка disconnect должна быть ЗДЕСЬ!

    // ==================== КОММЕНТАРИИ ====================
    socket.on('get_comments', (data) => {
        const allComments = loadComments();
        const userComments = allComments.filter(c => c.targetPhone === data.targetPhone).sort((a, b) => b.timestamp - a.timestamp);
        socket.emit('comments_data', { targetPhone: data.targetPhone, comments: userComments });
    });

    socket.on('add_comment', (data) => {
        if (!socket.phone) return;
        const allComments = loadComments();
        const users = loadUsers();
        const sender = users.find(u => u.phone === socket.phone);
        const senderName = sender ? (sender.firstName || `@${sender.username}`) : 'User';

        const newComment = {
            id: Date.now().toString(),
            targetPhone: data.targetPhone,
            senderPhone: socket.phone,
            senderName: senderName,
            text: data.text,
            timestamp: Date.now()
        };
        
        allComments.push(newComment);
        saveComments(allComments);
        io.emit('new_comment_added', newComment);
    });

    // ==================== ИЗМЕНЕНИЯ В КОММЕНТАРИЯХ (ТАЙМЕР УДАЛЕНИЯ) ====================
    socket.on('get_comments', (data) => {
        let allComments = loadComments();
        const now = Date.now();
        let changed = false;

        // ПРОВЕРКА: Если прошло 3 дня с момента запуска удаления, удаляем комментарий навсегда
        const filteredComments = allComments.filter(c => {
            if (c.deleteAt && now >= c.deleteAt) {
                changed = true;
                return false; // Удаляем из массива
            }
            return true; // Оставляем
        });

        if (changed) {
            saveComments(filteredComments);
            allComments = filteredComments;
        }

        const userComments = allComments.filter(c => c.targetPhone === data.targetPhone).sort((a, b) => b.timestamp - a.timestamp);
        socket.emit('comments_data', { targetPhone: data.targetPhone, comments: userComments });
    });

    socket.on('mark_comment_delete', (data) => {
        if (!socket.phone) return;
        const allComments = loadComments();
        const comment = allComments.find(c => c.id === data.commentId && c.targetPhone === socket.phone);
        
        if (comment && !comment.deleteAt) {
            // Ставим таймер на 3 дня (3 дня * 24 часа * 60 минут * 60 секунд * 1000 миллисекунд)
            comment.deleteAt = Date.now() + 259200000;
            saveComments(allComments);
            
            // Оповещаем всех, кто смотрит профиль, чтобы иконка поменялась на часы
            io.emit('comment_marked_deleted', { 
                commentId: comment.id, 
                targetPhone: socket.phone, 
                deleteAt: comment.deleteAt 
            });
        }
    });

    // ==================== УДАЛЕНИЕ СТОРИС (МГНОВЕННО) ====================
    socket.on('delete_post', (data) => {
        if (!socket.phone) return;
        let posts = loadPosts();
        
        const postIndex = posts.findIndex(p => p.id === data.postId && p.authorPhone === socket.phone);
        if (postIndex !== -1) {
            posts.splice(postIndex, 1);
            savePosts(posts);
            
            // Отправляем сигнал об успешном удалении
            socket.emit('post_deleted_success', { targetPhone: socket.phone });
            // Оповещаем всех, чтобы обновить кружок в чатах, если сторис больше нет
            io.emit('new_post_alert', { phone: socket.phone }); 
        }
    });

    // ==================== ПОСТЫ (СТОРИС) ====================
    socket.on('create_post', (data) => {
        if (!socket.phone) return;
        const posts = loadPosts();
        const newUrl = saveBase64Image(data.mediaBase64, socket.phone, `post_${Date.now()}`);
        if (!newUrl) return;

        const newPost = {
            id: Date.now().toString(),
            authorPhone: socket.phone,
            mediaUrl: newUrl,
            isVideo: data.isVideo,
            timestamp: Date.now(),
            views: [],
            likes: []
        };
        
        posts.push(newPost);
        savePosts(posts);
        
        io.emit('new_post_alert', { phone: socket.phone });
        socket.emit('post_created_success');
    });

    socket.on('get_posts', (data) => {
        const posts = loadPosts();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const userPosts = posts.filter(p => p.authorPhone === data.targetPhone && (Date.now() - p.timestamp < twentyFourHours));
        socket.emit('posts_data', { targetPhone: data.targetPhone, posts: userPosts.sort((a, b) => b.timestamp - a.timestamp) });
    });

    socket.on('view_post', (data) => {
        if (!socket.phone) return;
        const posts = loadPosts();
        const post = posts.find(p => p.id === data.postId);
        if (post && !post.views.includes(socket.phone)) {
            post.views.push(socket.phone);
            savePosts(posts);
            // Отправляем полные массивы обратно клиентам
            io.emit('post_stats_updated', { postId: post.id, views: post.views, likes: post.likes });
        }
    });

    socket.on('toggle_like_post', (data) => {
        if (!socket.phone) return;
        const posts = loadPosts();
        const post = posts.find(p => p.id === data.postId);
        if (post) {
            const likeIndex = post.likes.indexOf(socket.phone);
            if (likeIndex === -1) post.likes.push(socket.phone);
            else post.likes.splice(likeIndex, 1);
            savePosts(posts);
            
            socket.emit('post_liked_status', { postId: post.id, isLiked: likeIndex === -1 });
            io.emit('post_stats_updated', { postId: post.id, views: post.views, likes: post.likes });
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`🚀 Сервер запущен на http://localhost:${PORT}`));
function saveBase64Image(base64Data, phone, type) {
    try {
        // Улучшенный парсинг, который считывает ЛЮБЫЕ форматы (включая iOS .mov)
        const matches = base64Data.match(/^data:(.*?);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            console.log("❌ Ошибка парсинга файла: неверный формат base64");
            return null; 
        }

        const mimeType = matches[1];
        const base64String = matches[2];
        let extension = 'bin';
        
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) extension = 'jpg';
        else if (mimeType.includes('png')) extension = 'png';
        else if (mimeType.includes('mp4')) extension = 'mp4';
        else if (mimeType.includes('quicktime')) extension = 'mp4'; // Автоконвертация iOS видео
        else if (mimeType.includes('webm')) extension = 'webm';
        else extension = mimeType.split('/')[1] || 'bin';

        const buffer = Buffer.from(base64String, 'base64');
        const cleanPhone = phone.replace('+', '');
        const fileName = `${cleanPhone}_${type}.${extension}`;
        const filePath = path.join(UPLOADS_DIR, fileName);

        fs.writeFileSync(filePath, buffer);
        return `/uploads/${fileName}?t=${Date.now()}`; 
    } catch (e) {
        console.error("❌ Ошибка при сохранении файла:", e);
        return null;
    }
}