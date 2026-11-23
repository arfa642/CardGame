/**
 * End-to-end verification script for Thulla server and Socket.io API
 */

const http = require('http');
const io = require('socket.io-client');

async function runE2ETest() {
  console.log('--- Testing Thulla Server End-to-End ---');

  // Start server on test port 3042
  process.env.PORT = '3042';
  require('./server');

  // Give server 500ms to listen
  await new Promise(r => setTimeout(r, 600));

  // 1. Test HTTP GET /
  const html = await new Promise((resolve, reject) => {
    http.get('http://localhost:3042/', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });

  console.log(`HTTP GET / Status: ${html.status} (${html.data.length} bytes)`);
  if (html.status !== 200 || !html.data.includes('THULLA')) {
    throw new Error('HTTP / did not return expected page');
  }

  // 2. Test Socket.IO client connection & Room creation
  const socket1 = io('http://localhost:3042');
  await new Promise((resolve) => socket1.on('connect', resolve));
  console.log(`Socket 1 connected with id: ${socket1.id}`);

  // Create room
  const createRes = await new Promise((resolve) => {
    socket1.emit('create_room', {
      hostName: 'TestHost',
      avatar: '🦊',
      options: { maxPlayers: 4, deckCount: 'auto' }
    }, resolve);
  });

  console.log(`Room created: ${createRes.roomId}, success: ${createRes.success}`);
  if (!createRes.success) throw new Error('Create room failed');

  // 3. Connect Socket 2 to test human join
  const socket2 = io('http://localhost:3042');
  await new Promise((resolve) => socket2.on('connect', resolve));

  const joinRes = await new Promise((resolve) => {
    socket2.emit('join_room', {
      roomId: createRes.roomId,
      playerName: 'TestGuest',
      avatar: '🐼'
    }, resolve);
  });

  console.log(`Player 2 joined table: success: ${joinRes.success}`);
  if (!joinRes.success) throw new Error('Join room failed');

  // 4. Host adds bots
  const addBotRes = await new Promise((resolve) => {
    socket1.emit('add_bot', { roomId: createRes.roomId }, resolve);
  });
  console.log(`Bot added: ${addBotRes.success}`);

  // 5. Host fills bots to 4 players
  const fillRes = await new Promise((resolve) => {
    socket1.emit('fill_bots', { roomId: createRes.roomId, count: 4 }, resolve);
  });
  console.log(`Bots filled to 4: ${fillRes.success}`);

  // 6. Host starts game
  const startRes = await new Promise((resolve) => {
    socket1.emit('start_game', { roomId: createRes.roomId }, resolve);
  });
  console.log(`Game started: ${startRes.success}`);

  // 7. Test Worldwide Matchmaking with 4 sockets
  console.log('--- Testing Worldwide Matchmaking (4-player queue) ---');
  const mmSockets = [];
  for (let i = 0; i < 4; i++) {
    const s = io('http://localhost:3042');
    await new Promise((resolve) => s.on('connect', resolve));
    mmSockets.push(s);
  }

  const matchFoundPromises = mmSockets.map(s => {
    return new Promise(resolve => s.once('match_found', resolve));
  });

  for (let i = 0; i < 4; i++) {
    mmSockets[i].emit('join_matchmaking', {
      gameType: 'thulla',
      playerName: `MM_Player_${i + 1}`,
      avatar: '🦊'
    });
    await new Promise(r => setTimeout(r, 80));
  }

  const matchFoundResults = await Promise.all(matchFoundPromises);
  console.log(`Match found for all 4 players! Room ID: ${matchFoundResults[0].roomId}`);
  if (!matchFoundResults[0].roomId || matchFoundResults.length !== 4) {
    throw new Error('Worldwide matchmaking failed to match 4 players');
  }

  // Wait 1.5 seconds for game state and bot turns
  await new Promise(r => setTimeout(r, 1500));

  console.log('✅ End-to-end verification passed with flying colors!');
  socket1.disconnect();
  socket2.disconnect();
  mmSockets.forEach(s => s.disconnect());
  process.exit(0);
}

runE2ETest().catch((err) => {
  console.error('❌ E2E Test Failed:', err);
  process.exit(1);
});
