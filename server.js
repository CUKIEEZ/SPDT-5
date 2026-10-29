const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
  connectionStateRecovery: {}
});

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_ROOMS = new Set(['umum', 'teknologi', 'random']);
const messageHistory = new Map();
const MAX_HISTORY = 100;
const MAX_MESSAGE_LENGTH = 1000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Nexus Chat', transport: 'Socket.IO' });
});

function cleanText(value, maxLength = 32) {
  return String(value ?? '')
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function roomName(value) {
  const candidate = cleanText(value, 24).toLowerCase();
  return ALLOWED_ROOMS.has(candidate) ? candidate : 'umum';
}

function getRoomUsers(room) {
  const ids = io.sockets.adapter.rooms.get(room);
  if (!ids) return [];
  return [...ids].map((id) => {
    const client = io.sockets.sockets.get(id);
    return client ? {
      id,
      username: client.data.username || 'Pengguna',
      initials: initials(client.data.username || 'Pengguna')
    } : null;
  }).filter(Boolean);
}

function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}

function systemMessage(text, type = 'info') {
  return {
    id: `system-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: 'system',
    systemType: type,
    text,
    timestamp: new Date().toISOString()
  };
}

function broadcastUsers(room) {
  io.to(room).emit('users-updated', getRoomUsers(room));
}

function getRoomCounts() {
  const counts = {};
  for (const room of ALLOWED_ROOMS) counts[room] = io.sockets.adapter.rooms.get(room)?.size || 0;
  return counts;
}

function broadcastRoomCounts() {
  io.emit('room-counts', getRoomCounts());
}

io.on('connection', (socket) => {
  console.log(`[Socket.IO] client terhubung: ${socket.id}`);

  socket.on('join-room', async (payload = {}) => {
    const username = cleanText(payload.username, 24) || 'Pengguna';
    const nextRoom = roomName(payload.room);
    const previousRoom = socket.data.room;
    const previousName = socket.data.username || username;

    if (previousRoom === nextRoom) {
      socket.data.username = username;
      socket.emit('room-joined', {
        room: nextRoom,
        username,
        history: messageHistory.get(nextRoom) || [],
        users: getRoomUsers(nextRoom)
      });
      broadcastUsers(nextRoom);
      broadcastRoomCounts();
      return;
    }

    if (previousRoom) {
      socket.to(previousRoom).emit('system-message', systemMessage(`${previousName} meninggalkan kanal.`, 'leave'));
      socket.to(previousRoom).emit('user-typing', { id: socket.id, username: previousName, isTyping: false });
      await socket.leave(previousRoom);
      broadcastUsers(previousRoom);
    }

    socket.data.username = username;
    socket.data.room = nextRoom;
    await socket.join(nextRoom);

    socket.emit('room-joined', {
      room: nextRoom,
      username,
      history: messageHistory.get(nextRoom) || [],
      users: getRoomUsers(nextRoom)
    });

    socket.to(nextRoom).emit('system-message', systemMessage(`${username} bergabung ke kanal.`, 'join'));
    broadcastUsers(nextRoom);
    broadcastRoomCounts();
    console.log(`[Socket.IO] ${username} masuk ke #${nextRoom}`);
  });

  socket.on('chat-message', (rawText) => {
    const room = socket.data.room;
    const username = socket.data.username;
    if (!room || !username) return;

    const text = cleanText(rawText, MAX_MESSAGE_LENGTH);
    if (!text) return;

    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      type: 'chat',
      senderId: socket.id,
      username,
      initials: initials(username),
      text,
      timestamp: new Date().toISOString()
    };

    const history = messageHistory.get(room) || [];
    history.push(message);
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    messageHistory.set(room, history);

    io.to(room).emit('chat-message', message);
  });

  socket.on('typing', (isTyping) => {
    const room = socket.data.room;
    if (!room || !socket.data.username) return;
    socket.to(room).emit('user-typing', {
      id: socket.id,
      username: socket.data.username,
      isTyping: Boolean(isTyping)
    });
  });

  socket.on('disconnecting', () => {
    const room = socket.data.room;
    const username = socket.data.username;
    if (!room || !username) return;
    socket.to(room).emit('system-message', systemMessage(`${username} keluar dari obrolan.`, 'leave'));
    socket.to(room).emit('user-typing', { id: socket.id, username, isTyping: false });
    const remainingUsers = getRoomUsers(room).filter(user => user.id !== socket.id);
    io.to(room).emit('users-updated', remainingUsers);
  });

  socket.on('disconnect', (reason) => {
    broadcastRoomCounts();
    console.log(`[Socket.IO] client terputus: ${socket.id} (${reason})`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ✦ Nexus Chat berjalan di http://localhost:${PORT}`);
  console.log('  Tekan Ctrl + C untuk menghentikan server.\n');
});
