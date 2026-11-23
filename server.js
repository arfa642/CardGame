/**
 * Thulla Card Game - Real-time Web Server
 * Express + Socket.IO server handling lobbies, multiplayer connections, and bot automation.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const ThullaGame = require('./game/engine');
const ThullaBot = require('./game/bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Serve static assets from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Lightweight keep-alive ping endpoint for cron jobs (prevents sleep)
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Support direct room URL: /room/:roomId
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rooms storage: roomId -> { id, hostId, hostSocketId, game, sockets: Map(playerId -> socketId), botTimer }
const rooms = new Map();

// Helper to generate unique 6-character room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous 0/O or 1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

// Broadcast game state to every connected player in the room (with personalized private hand)
function broadcastGameState(room, extraData = {}) {
  const { game } = room;
  for (const player of game.players) {
    if (!player.isBot) {
      const socketId = room.sockets.get(player.id);
      if (socketId) {
        const playerState = game.getState(player.id);
        io.to(socketId).emit('game_state_update', {
          state: playerState,
          isHost: player.id === room.hostId,
          myPlayerId: player.id,
          ...extraData
        });
      }
    }
  }

  // Also broadcast spectator/general state to room channel
  io.to(room.id).emit('room_info', {
    roomId: room.id,
    playerCount: game.players.length,
    status: game.status
  });
}

// Bot turn scheduler
function triggerBotTurnIfNeeded(room) {
  const { game } = room;
  if (game.status !== 'in_progress') return;

  const current = game.getCurrentPlayer();
  if (!current || !current.isBot) return;

  // Clear any existing timer
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }

  const botSpeed = game.options.botSpeed || 900;

  // Notify players that bot is thinking
  io.to(room.id).emit('bot_thinking', {
    botId: current.id,
    botName: current.name
  });

  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (game.status !== 'in_progress') return;

    const botPlayer = game.getCurrentPlayer();
    if (!botPlayer || !botPlayer.isBot) return;

    try {
      const card = ThullaBot.chooseCard(game, botPlayer.id);
      if (!card) {
        console.error(`Bot ${botPlayer.name} could not pick a card`);
        return;
      }

      const result = game.playCard(botPlayer.id, card.id);

      // Broadcast card play / Thulla event
      io.to(room.id).emit('action_performed', {
        action: result,
        actor: { id: botPlayer.id, name: botPlayer.name, avatar: botPlayer.avatar, isBot: true },
        card: card
      });

      broadcastGameState(room);

      // Check if next turn is also a bot
      triggerBotTurnIfNeeded(room);
    } catch (err) {
      console.error(`Error in bot turn for room ${room.id}:`, err);
    }
  }, botSpeed);
}

// Socket.io Connection Handler
io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentPlayerId = null;

  // 1. Create Table / Room
  socket.on('create_room', ({ hostName, avatar, options }, callback) => {
    try {
      const roomId = generateRoomCode();
      const playerId = 'user_' + socket.id.slice(0, 8);

      const game = new ThullaGame(roomId, options || {});
      const hostPlayer = game.addPlayer(playerId, hostName || 'Host', false, avatar);

      const room = {
        id: roomId,
        hostId: playerId,
        hostSocketId: socket.id,
        game,
        sockets: new Map([[playerId, socket.id]]),
        botTimer: null
      };

      rooms.set(roomId, room);
      currentRoomId = roomId;
      currentPlayerId = playerId;

      socket.join(roomId);

      callback({
        success: true,
        roomId,
        playerId,
        gameState: game.getState(playerId),
        isHost: true
      });

      broadcastGameState(room);
      console.log(`Room [${roomId}] created by ${hostPlayer.name}`);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // 2. Join Table / Room
  socket.on('join_room', ({ roomId, playerName, avatar }, callback) => {
    try {
      const upperRoomId = (roomId || '').trim().toUpperCase();
      const room = rooms.get(upperRoomId);

      if (!room) {
        return callback({ success: false, error: 'Table not found. Please check room code.' });
      }

      if (room.game.status !== 'waiting') {
        return callback({ success: false, error: 'Game has already started in this room.' });
      }

      if (room.game.players.length >= 10) {
        return callback({ success: false, error: 'Table is full (maximum 10 players).' });
      }

      const playerId = 'user_' + socket.id.slice(0, 8);
      const player = room.game.addPlayer(playerId, playerName || `Player ${room.game.players.length + 1}`, false, avatar);

      room.sockets.set(playerId, socket.id);
      currentRoomId = upperRoomId;
      currentPlayerId = playerId;

      socket.join(upperRoomId);

      callback({
        success: true,
        roomId: upperRoomId,
        playerId,
        gameState: room.game.getState(playerId),
        isHost: playerId === room.hostId
      });

      io.to(upperRoomId).emit('player_announcement', {
        type: 'join',
        text: `${player.name} joined the table!`
      });

      broadcastGameState(room);
      console.log(`${player.name} joined room [${upperRoomId}]`);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // 3. Add AI Bot
  socket.on('add_bot', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) return callback && callback({ success: false, error: 'Room not found' });
    if (room.hostId !== currentPlayerId) {
      return callback && callback({ success: false, error: 'Only the host can add bots' });
    }

    try {
      const botCount = room.game.players.filter(p => p.isBot).length;
      const botAvatars = ['🤖', '🦾', '👾', '🚀', '🧠', '🧙', '🥷', '🦊', '🐯'];
      const avatar = botAvatars[botCount % botAvatars.length];
      const botId = 'bot_' + Math.random().toString(36).substring(2, 9);
      const botNames = ['Bot Max', 'Bot Zara', 'Bot Leo', 'Bot Maya', 'Bot Rex', 'Bot Luna', 'Bot Sam', 'Bot Kai'];
      const botName = botNames[botCount % botNames.length];

      room.game.addPlayer(botId, botName, true, avatar);
      broadcastGameState(room);
      if (callback) callback({ success: true });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // 4. Remove AI Bot
  socket.on('remove_bot', ({ roomId, botId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) return callback && callback({ success: false, error: 'Room not found' });
    if (room.hostId !== currentPlayerId) {
      return callback && callback({ success: false, error: 'Only the host can remove bots' });
    }

    // Find bot to remove
    let targetBotId = botId;
    if (!targetBotId) {
      const bots = room.game.players.filter(p => p.isBot);
      if (bots.length > 0) targetBotId = bots[bots.length - 1].id;
    }

    if (targetBotId) {
      room.game.removePlayer(targetBotId);
      broadcastGameState(room);
      if (callback) callback({ success: true });
    } else {
      if (callback) callback({ success: false, error: 'No bots to remove' });
    }
  });

  // 5. Fill with bots up to target count (e.g. 4)
  socket.on('fill_bots', ({ roomId, count = 4 }, callback) => {
    const room = rooms.get(roomId);
    if (!room) return callback && callback({ success: false, error: 'Room not found' });
    if (room.hostId !== currentPlayerId) {
      return callback && callback({ success: false, error: 'Only host can fill with bots' });
    }

    try {
      const botAvatars = ['🤖', '🦾', '👾', '🚀', '🧠', '🧙', '🥷', '🦊', '🐯'];
      const botNames = ['Bot Max', 'Bot Zara', 'Bot Leo', 'Bot Maya', 'Bot Rex', 'Bot Luna', 'Bot Sam', 'Bot Kai'];

      while (room.game.players.length < count && room.game.players.length < 10) {
        const botIndex = room.game.players.filter(p => p.isBot).length;
        const botId = 'bot_' + Math.random().toString(36).substring(2, 9);
        const name = botNames[botIndex % botNames.length];
        const avatar = botAvatars[botIndex % botAvatars.length];
        room.game.addPlayer(botId, name, true, avatar);
      }

      broadcastGameState(room);
      if (callback) callback({ success: true });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // 6. Start Game
  socket.on('start_game', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) return callback && callback({ success: false, error: 'Room not found' });
    if (room.hostId !== currentPlayerId) {
      return callback && callback({ success: false, error: 'Only the host can start the game' });
    }

    try {
      room.game.startGame();
      broadcastGameState(room, { sound: 'game_start' });

      io.to(roomId).emit('player_announcement', {
        type: 'game_start',
        text: room.game.lastEvent ? room.game.lastEvent.text : 'Game started!'
      });

      if (callback) callback({ success: true });

      // Trigger bot turn if starting player is bot
      triggerBotTurnIfNeeded(room);
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // 7. Play Card
  socket.on('play_card', ({ roomId, cardId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) return callback && callback({ success: false, error: 'Room not found' });

    try {
      const player = room.game.players.find(p => p.id === currentPlayerId);
      if (!player) return callback && callback({ success: false, error: 'Player not in room' });

      const card = player.hand.find(c => c.id === cardId);
      const result = room.game.playCard(currentPlayerId, cardId);

      // Broadcast card play / Thulla action
      io.to(roomId).emit('action_performed', {
        action: result,
        actor: { id: player.id, name: player.name, avatar: player.avatar, isBot: false },
        card: card
      });

      broadcastGameState(room);
      if (callback) callback({ success: true, result });

      // Trigger bot if next turn is a bot
      triggerBotTurnIfNeeded(room);
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // 8. Restart / Play Again
  socket.on('restart_game', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) return callback && callback({ success: false, error: 'Room not found' });
    if (room.hostId !== currentPlayerId) {
      return callback && callback({ success: false, error: 'Only host can restart game' });
    }

    try {
      room.game.startGame();
      broadcastGameState(room, { sound: 'game_start' });
      if (callback) callback({ success: true });
      triggerBotTurnIfNeeded(room);
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // 9. Emoji Reaction
  socket.on('send_reaction', ({ roomId, emoji }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.game.players.find(p => p.id === currentPlayerId);
    if (player) {
      io.to(roomId).emit('reaction_received', {
        playerId: player.id,
        playerName: player.name,
        emoji
      });
    }
  });

  // 10. Chat Message
  socket.on('send_chat', ({ roomId, message }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.game.players.find(p => p.id === currentPlayerId);
    if (player && message && message.trim()) {
      io.to(roomId).emit('chat_received', {
        senderId: player.id,
        senderName: player.name,
        senderAvatar: player.avatar,
        text: message.trim().slice(0, 150),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  // 11. Disconnect
  socket.on('disconnect', () => {
    if (!currentRoomId || !currentPlayerId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const player = room.game.players.find(p => p.id === currentPlayerId);
    if (!player) return;

    if (room.game.status === 'waiting') {
      // Remove from room before game starts
      room.game.removePlayer(currentPlayerId);
      room.sockets.delete(currentPlayerId);

      // If host left, assign new host or delete room if empty
      if (room.hostId === currentPlayerId) {
        const remainingHuman = room.game.players.find(p => !p.isBot);
        if (remainingHuman) {
          room.hostId = remainingHuman.id;
          room.hostSocketId = room.sockets.get(remainingHuman.id);
        } else {
          rooms.delete(currentRoomId);
          console.log(`Room [${currentRoomId}] deleted (empty)`);
          return;
        }
      }

      broadcastGameState(room);
    } else {
      // Game in progress: mark player disconnected
      player.connected = false;
      broadcastGameState(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🎴 Thulla Card Game Server Running!`);
  console.log(`🌐 Local:   http://localhost:${PORT}`);
  console.log(`🎮 Ready for 2 to 10 players & AI Bots!`);
  console.log(`========================================`);
});
