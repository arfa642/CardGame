/**
 * Thulla Web App Client Logic
 * Handles real-time communication, card animations, seat calculations, and interactive UI.
 */

// Initialize Socket.io
const socket = io();

// State
let myPlayerId = null;
let currentRoomId = null;
let isHost = false;
let currentGameState = null;
let selectedAvatar = '🦊';
let isTrickFrozen = false;
let trickFreezeTimer = null;

// Avatars list
const AVATARS = ['🦊', '🐼', '🦁', '🐯', '🤖', '🦄', '🐸', '🧙', '🥷', '🚀'];

// DOM Elements
const screenLanding = document.getElementById('screen-landing');
const screenLobby = document.getElementById('screen-lobby');
const screenGame = document.getElementById('screen-game');

const navRoomPill = document.getElementById('nav-room-pill');
const navRoomCode = document.getElementById('nav-room-code');
const navCopyLinkBtn = document.getElementById('nav-copy-link-btn');
const soundToggleBtn = document.getElementById('sound-toggle-btn');
const rulesModalBtn = document.getElementById('rules-modal-btn');
const modalRules = document.getElementById('modal-rules');
const closeRulesBtn = document.getElementById('close-rules-btn');
const closeRulesBtnBottom = document.getElementById('close-rules-btn-bottom');

// Landing Elements
const createPlayerName = document.getElementById('create-player-name');
const createMaxPlayers = document.getElementById('create-max-players');
const playerCapacityLabel = document.getElementById('player-capacity-label');
const createDeckMode = document.getElementById('create-deck-mode');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomCode = document.getElementById('join-room-code');
const joinPlayerName = document.getElementById('join-player-name');
const joinRoomBtn = document.getElementById('join-room-btn');
const quickPlayBtn = document.getElementById('quick-play-btn');
const avatarPickerCreate = document.getElementById('avatar-picker-create');
const avatarPickerJoin = document.getElementById('avatar-picker-join');

// Lobby Elements
const lobbyRoomCode = document.getElementById('lobby-room-code');
const lobbyShareLink = document.getElementById('lobby-share-link');
const lobbyCopyCodeBtn = document.getElementById('lobby-copy-code-btn');
const lobbyCopyLinkBtn = document.getElementById('lobby-copy-link-btn');
const lobbyPlayerCountBadge = document.getElementById('lobby-player-count-badge');
const lobbyPlayersGrid = document.getElementById('lobby-players-grid');
const hostControls = document.getElementById('host-controls');
const guestWaitingMsg = document.getElementById('guest-waiting-msg');
const btnAddBot = document.getElementById('btn-add-bot');
const btnRemoveBot = document.getElementById('btn-remove-bot');
const btnFillBots = document.getElementById('btn-fill-bots');
const btnStartGame = document.getElementById('btn-start-game');

// Game Elements
const ledSuitBadge = document.getElementById('led-suit-badge');
const discardCountBadge = document.getElementById('discard-count-badge');
const turnNoticeBanner = document.getElementById('turn-notice-banner');
const seatsLayer = document.getElementById('seats-layer');
const trickTable = document.getElementById('trick-table');
const thullaBanner = document.getElementById('thulla-banner');
const thullaBannerSub = document.getElementById('thulla-banner-sub');
const userCardsContainer = document.getElementById('user-cards-container');
const userHandCount = document.getElementById('user-hand-count');
const handTurnHint = document.getElementById('hand-turn-hint');

// Chat & Reactions
const openChatBtn = document.getElementById('open-chat-btn');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatDrawer = document.getElementById('chat-drawer');
const chatBadge = document.getElementById('chat-badge');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

// Game Over Modal
const modalGameOver = document.getElementById('modal-game-over');
const podiumList = document.getElementById('podium-list');
const loserName = document.getElementById('loser-name');
const btnPlayAgain = document.getElementById('btn-play-again');
const btnBackLobby = document.getElementById('btn-back-lobby');

// Toast Notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const bg = type === 'error' ? 'bg-red-600' : 'bg-slate-800 border border-slate-700';
  toast.className = `${bg} text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center justify-between transition-all transform duration-300 translate-y-2 opacity-0`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

// Render Avatar Pickers
function setupAvatarPickers() {
  [avatarPickerCreate, avatarPickerJoin].forEach(picker => {
    picker.innerHTML = '';
    AVATARS.forEach((av, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `w-10 h-10 rounded-xl flex items-center justify-center text-lg border transition flex-shrink-0 ${
        av === selectedAvatar ? 'bg-amber-500/20 border-amber-500 scale-105' : 'bg-slate-800 border-slate-700 hover:border-slate-600'
      }`;
      btn.innerText = av;
      btn.addEventListener('click', () => {
        selectedAvatar = av;
        setupAvatarPickers();
      });
      picker.appendChild(btn);
    });
  });
}

// Read URL parameters on load
function parseURLParams() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');
  if (roomParam) {
    joinRoomCode.value = roomParam.trim().toUpperCase();
  } else {
    // Check path /room/XYZ
    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 'room' && pathParts[2]) {
      joinRoomCode.value = pathParts[2].trim().toUpperCase();
    }
  }
}

// Generate full shareable link
function getShareableLink(roomId) {
  return `${window.location.origin}/?room=${roomId}`;
}

// Copy to clipboard
function copyInviteLink(roomId) {
  const link = getShareableLink(roomId);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => {
      showToast('📋 Invite link copied to clipboard!');
    }).catch(() => {
      prompt('Copy this link:', link);
    });
  } else {
    prompt('Copy this link:', link);
  }
}

// View Switching
function switchScreen(screen) {
  screenLanding.classList.add('hidden');
  screenLobby.classList.add('hidden');
  screenGame.classList.add('hidden');

  if (screen === 'landing') {
    screenLanding.classList.remove('hidden');
    navRoomPill.classList.add('hidden');
  } else if (screen === 'lobby') {
    screenLobby.classList.remove('hidden');
    navRoomPill.classList.remove('hidden');
  } else if (screen === 'game') {
    screenGame.classList.remove('hidden');
    navRoomPill.classList.remove('hidden');
  }
}

// --- EVENT HANDLERS ---

// Create Room
createRoomBtn.addEventListener('click', () => {
  const name = createPlayerName.value.trim() || 'Player 1';
  const maxPlayers = parseInt(createMaxPlayers.value) || 4;
  const deckMode = createDeckMode.value;

  socket.emit('create_room', {
    hostName: name,
    avatar: selectedAvatar,
    options: { maxPlayers, deckCount: deckMode }
  }, (res) => {
    if (res.success) {
      myPlayerId = res.playerId;
      currentRoomId = res.roomId;
      isHost = true;
      setupLobbyView(res.gameState);
      switchScreen('lobby');
      showToast(`🎉 Room created! Code: ${res.roomId}`);
    } else {
      showToast(res.error, 'error');
    }
  });
});

// Join Room
joinRoomBtn.addEventListener('click', () => {
  const code = joinRoomCode.value.trim().toUpperCase();
  const name = joinPlayerName.value.trim() || 'Player';

  if (!code) {
    return showToast('Please enter a 6-character room code', 'error');
  }

  socket.emit('join_room', {
    roomId: code,
    playerName: name,
    avatar: selectedAvatar
  }, (res) => {
    if (res.success) {
      myPlayerId = res.playerId;
      currentRoomId = res.roomId;
      isHost = res.isHost;
      setupLobbyView(res.gameState);
      switchScreen('lobby');
      showToast(`Joined table ${res.roomId}!`);
    } else {
      showToast(res.error, 'error');
    }
  });
});

// Quick Play vs 2 to 6 AI Bots
quickPlayBtn.addEventListener('click', () => {
  const name = createPlayerName.value.trim() || 'You';
  const botSelect = document.getElementById('quick-bot-count');
  const botCount = botSelect ? (parseInt(botSelect.value) || 3) : 3;
  const totalPlayers = botCount + 1;

  socket.emit('create_room', {
    hostName: name,
    avatar: selectedAvatar,
    options: { maxPlayers: totalPlayers, deckCount: 'auto', botSpeed: 1600 }
  }, (res) => {
    if (res.success) {
      myPlayerId = res.playerId;
      currentRoomId = res.roomId;
      isHost = true;

      // Fill with selected number of bots and auto-start
      socket.emit('fill_bots', { roomId: res.roomId, count: totalPlayers }, () => {
        socket.emit('start_game', { roomId: res.roomId });
      });
    } else {
      showToast(res.error, 'error');
    }
  });
});

// Slider Capacity Label
createMaxPlayers.addEventListener('input', (e) => {
  playerCapacityLabel.innerText = `${e.target.value} Players`;
});

// Lobby Preset Bot Buttons (2 to 6 bots)
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('btn-preset-bots')) {
    const bots = parseInt(e.target.dataset.bots) || 3;
    if (currentRoomId) {
      socket.emit('set_bots_count', { roomId: currentRoomId, count: bots }, (res) => {
        if (res && res.success) {
          showToast(`Table set to ${bots} Bots (${bots + 1} players)`);
        }
      });
    }
  }
});

// Lobby Buttons
btnAddBot.addEventListener('click', () => {
  if (currentRoomId) socket.emit('add_bot', { roomId: currentRoomId });
});

btnRemoveBot.addEventListener('click', () => {
  if (currentRoomId) socket.emit('remove_bot', { roomId: currentRoomId });
});

btnFillBots.addEventListener('click', () => {
  if (currentRoomId) socket.emit('fill_bots', { roomId: currentRoomId, count: 4 });
});

btnStartGame.addEventListener('click', () => {
  if (!currentRoomId) return;
  btnStartGame.disabled = true;
  socket.emit('start_game', { roomId: currentRoomId }, (res) => {
    btnStartGame.disabled = false;
    if (res && !res.success) {
      showToast(res.error, 'error');
    }
  });
});

// Copy Invite Links
lobbyCopyCodeBtn.addEventListener('click', () => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(currentRoomId);
    showToast('Room code copied!');
  }
});

lobbyCopyLinkBtn.addEventListener('click', () => {
  if (currentRoomId) copyInviteLink(currentRoomId);
});

navCopyLinkBtn.addEventListener('click', () => {
  if (currentRoomId) copyInviteLink(currentRoomId);
});

// Sound Toggle
soundToggleBtn.addEventListener('click', () => {
  const muted = window.soundFx.toggleMute();
  soundToggleBtn.innerText = muted ? '🔇' : '🔊';
  showToast(muted ? 'Sound Muted' : 'Sound Unmuted');
});

// Rules Modal
rulesModalBtn.addEventListener('click', () => modalRules.classList.remove('hidden'));
closeRulesBtn.addEventListener('click', () => modalRules.classList.add('hidden'));
closeRulesBtnBottom.addEventListener('click', () => modalRules.classList.add('hidden'));

// Chat Toggle
openChatBtn.addEventListener('click', () => {
  chatDrawer.classList.toggle('hidden');
  chatBadge.classList.add('hidden');
});
closeChatBtn.addEventListener('click', () => chatDrawer.classList.add('hidden'));

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text && currentRoomId) {
    socket.emit('send_chat', { roomId: currentRoomId, message: text });
    chatInput.value = '';
  }
});

// Reaction Buttons
document.querySelectorAll('.reaction-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.dataset.emoji;
    if (emoji && currentRoomId) {
      socket.emit('send_reaction', { roomId: currentRoomId, emoji });
    }
  });
});

// Game Over Play Again
btnPlayAgain.addEventListener('click', () => {
  modalGameOver.classList.add('hidden');
  if (isHost && currentRoomId) {
    socket.emit('restart_game', { roomId: currentRoomId });
  } else {
    showToast('Waiting for host to restart...');
  }
});

btnBackLobby.addEventListener('click', () => {
  modalGameOver.classList.add('hidden');
  switchScreen('lobby');
});

// --- UI RENDERING FUNCTIONS ---

function setupLobbyView(state) {
  navRoomCode.innerText = state.roomId;
  lobbyRoomCode.innerText = state.roomId;
  lobbyShareLink.innerText = getShareableLink(state.roomId);

  const max = state.options.maxPlayers || 4;
  lobbyPlayerCountBadge.innerText = `${state.players.length} / ${max} Players`;

  // Host vs Guest controls
  if (isHost) {
    hostControls.classList.remove('hidden');
    guestWaitingMsg.classList.add('hidden');
  } else {
    hostControls.classList.add('hidden');
    guestWaitingMsg.classList.remove('hidden');
  }

  // Render Seated Players
  lobbyPlayersGrid.innerHTML = '';
  state.players.forEach(p => {
    const isMe = p.id === myPlayerId;
    const card = document.createElement('div');
    card.className = `p-3 rounded-xl border flex items-center gap-3 ${
      isMe ? 'bg-amber-500/10 border-amber-500/50 shadow-md' : 'bg-slate-900/80 border-slate-800'
    }`;
    card.innerHTML = `
      <div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-xl flex-shrink-0">
        ${p.avatar || '👤'}
      </div>
      <div class="truncate">
        <div class="font-bold text-xs text-white truncate flex items-center gap-1.5">
          ${p.name}
          ${isMe ? '<span class="text-[9px] bg-amber-500 text-black px-1 rounded font-extrabold">YOU</span>' : ''}
          ${p.isBot ? '<span class="text-[9px] bg-blue-600 text-white px-1 rounded font-bold">BOT</span>' : ''}
        </div>
        <div class="text-[10px] text-slate-400">Ready to play</div>
      </div>
    `;
    lobbyPlayersGrid.appendChild(card);
  });

  // Fill empty slots with placeholders
  for (let i = state.players.length; i < max; i++) {
    const placeholder = document.createElement('div');
    placeholder.className = 'p-3 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 flex items-center gap-3 opacity-60';
    placeholder.innerHTML = `
      <div class="w-10 h-10 rounded-full border border-dashed border-slate-700 flex items-center justify-center text-slate-500 text-sm">
        +
      </div>
      <div class="text-xs text-slate-500 font-medium">Empty Seat</div>
    `;
    lobbyPlayersGrid.appendChild(placeholder);
  }
}

// Render the Table Game View
function renderGameBoard(state) {
  currentGameState = state;
  navRoomCode.innerText = state.roomId;

  // 1. Update Top Bar Status
  if (state.ledSuit) {
    const suitColors = { '♠': 'text-slate-100', '♣': 'text-slate-100', '♥': 'text-red-500', '♦': 'text-red-500' };
    ledSuitBadge.innerHTML = `<span class="${suitColors[state.ledSuit] || ''} text-base">${state.ledSuit}</span>`;
  } else {
    ledSuitBadge.innerHTML = '<span class="text-slate-400">Any</span>';
  }

  discardCountBadge.innerText = state.discardPileCount || 0;

  // Turn status
  const currentTurnPlayer = state.players.find(p => p.id === state.currentTurnPlayerId);
  const isMyTurn = state.currentTurnPlayerId === myPlayerId;

  if (isMyTurn) {
    turnNoticeBanner.className = 'px-4 py-1.5 rounded-full bg-amber-500 text-black text-xs font-black shadow-lg shadow-amber-500/30 animate-pulse';
    turnNoticeBanner.innerText = state.isFirstTrick && state.trick.length === 0 ? '♠ Leading with Ace of Spades (Your Turn!)' : '👉 It is YOUR turn to play!';
    handTurnHint.innerText = 'Tap any glowing card below to play it!';
    window.soundFx.playTurnChime();
  } else if (currentTurnPlayer) {
    turnNoticeBanner.className = 'px-4 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs font-bold text-slate-300';
    turnNoticeBanner.innerText = `Waiting for ${currentTurnPlayer.name}...`;
    handTurnHint.innerText = `Waiting for ${currentTurnPlayer.name} to play`;
  }

  // 2. Render Opponent Seats around the Table
  renderSeats(state);

  // 3. Render Center Trick Cards (if not in a Thulla/Win pause)
  if (!isTrickFrozen) {
    renderTrick(state.trick);
  }

  // 4. Render User Hand at Bottom
  const myPlayer = state.players.find(p => p.id === myPlayerId);
  if (myPlayer) {
    renderUserHand(myPlayer.hand || [], myPlayer.validCards || [], isMyTurn);
    userHandCount.innerText = (myPlayer.hand || []).length;
  }

  // 5. Check Game Over
  if (state.status === 'game_over') {
    renderGameOverModal(state);
  }
}

// Seat Positioning around Oval Table for 2 to 10 players
function renderSeats(state) {
  seatsLayer.innerHTML = '';
  const players = state.players;
  const numPlayers = players.length;

  // Find index of current user so user is always at bottom (index 0)
  const myIndex = players.findIndex(p => p.id === myPlayerId);
  const normalizedIndex = myIndex !== -1 ? myIndex : 0;

  players.forEach((player, i) => {
    // Relative position clockwise from current player
    const relIndex = (i - normalizedIndex + numPlayers) % numPlayers;

    // Angle math:
    // User is relIndex 0 at angle = 90 degrees (bottom center)
    // Other players fan around the oval: angle in radians
    const angle = (Math.PI / 2) + (relIndex * 2 * Math.PI / numPlayers);

    // Oval radii percentages
    const rx = 44; // percent width
    const ry = 42; // percent height
    const cx = 50; // center X %
    const cy = 48; // center Y %

    const posX = cx + rx * Math.cos(angle);
    const posY = cy + ry * Math.sin(angle);

    const isCurrentTurn = player.id === state.currentTurnPlayerId;
    const isMe = player.id === myPlayerId;

    const seat = document.createElement('div');
    seat.id = `seat-${player.id}`;
    seat.className = `player-seat ${isCurrentTurn ? 'current-turn' : ''}`;
    seat.style.left = `${posX}%`;
    seat.style.top = `${posY}%`;

    let statusBadge = '';
    if (player.isSafe) {
      statusBadge = `<span class="bg-emerald-500/90 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full shadow">#${player.rank} SAFE 🏆</span>`;
    } else if (!player.connected && !player.isBot) {
      statusBadge = `<span class="bg-red-500/80 text-white text-[9px] font-bold px-1 rounded">DC</span>`;
    } else {
      statusBadge = `<span class="card-count-badge">🃏 ${player.cardCount}</span>`;
    }

    seat.innerHTML = `
      <div class="avatar-badge">
        <span>${player.avatar || '👤'}</span>
      </div>
      <div class="player-info-tag">
        ${player.name}
      </div>
      ${statusBadge}
    `;

    seatsLayer.appendChild(seat);
  });
}

// Render Center Trick Cards
function renderTrick(trick, highlightCardId = null, highlightClass = '') {
  trickTable.innerHTML = '';
  if (!trick || trick.length === 0) return;

  const count = trick.length;
  trick.forEach((item, idx) => {
    const cardData = item.card || item;
    const cardEl = createCardElement(cardData);
    const wrapper = document.createElement('div');
    wrapper.className = 'trick-card-wrapper';

    if (highlightCardId && cardData.id === highlightCardId) {
      wrapper.classList.add(highlightClass);
    }

    // Spread slightly with organic casino angle
    const angleStep = 24;
    const baseAngle = -((count - 1) * angleStep) / 2;
    const rot = baseAngle + idx * angleStep + (Math.sin(idx * 7) * 4);
    const offsetSpread = 28;
    const offsetX = (idx - (count - 1) / 2) * offsetSpread;

    wrapper.style.transform = `translateX(${offsetX}px) rotate(${rot}deg)`;
    wrapper.style.zIndex = idx + 1;

    // Player name label on top of card
    const playerName = item.playerName || '';
    if (playerName) {
      const label = document.createElement('div');
      label.className = 'absolute -bottom-4 left-1/2 -translate-x-1/2 bg-black/85 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30 whitespace-nowrap shadow';
      label.innerText = playerName;
      wrapper.appendChild(label);
    }

    wrapper.appendChild(cardEl);
    trickTable.appendChild(wrapper);
  });
}

// Render User's Hand
function renderUserHand(hand, validCards, isMyTurn) {
  userCardsContainer.innerHTML = '';

  const validCardIds = new Set((validCards || []).map(c => c.id));

  hand.forEach((card, idx) => {
    const isValid = isMyTurn && validCardIds.has(card.id);
    const cardEl = createCardElement(card);
    cardEl.classList.add('hand-card');

    if (isValid) {
      cardEl.classList.add('valid-card');
      cardEl.addEventListener('click', () => {
        playCard(card.id);
      });
    } else {
      cardEl.classList.add('disabled-card');
      cardEl.title = isMyTurn ? 'Must follow led suit' : 'Not your turn';
    }

    userCardsContainer.appendChild(cardEl);
  });
}

// Create Card DOM Element
function createCardElement(card) {
  const div = document.createElement('div');
  const isRed = card.suit === '♥' || card.suit === '♦';
  div.className = `playing-card ${isRed ? 'red' : 'black'}`;

  div.innerHTML = `
    <div class="card-corner top">
      <span>${card.rank}</span>
      <span class="text-xs">${card.suit}</span>
    </div>
    <div class="card-center-suit">${card.suit}</div>
    <div class="card-corner bottom">
      <span>${card.rank}</span>
      <span class="text-xs">${card.suit}</span>
    </div>
  `;

  return div;
}

// Play Card Action
function playCard(cardId) {
  if (!currentRoomId) return;
  window.soundFx.playCardSnap();

  socket.emit('play_card', { roomId: currentRoomId, cardId }, (res) => {
    if (res && !res.success) {
      showToast(res.error, 'error');
    }
  });
}

// Trigger THULLA Visual Blast
function triggerThullaEffect(action) {
  window.soundFx.playThullaHit();
  thullaBannerSub.innerText = `${action.thullaBy} ➔ ${action.victimName} (+${action.cardsCount} cards)`;
  thullaBanner.classList.remove('show');
  void thullaBanner.offsetWidth; // re-flow
  thullaBanner.classList.add('show');
}

// Render Game Over Modal with Confetti
function renderGameOverModal(state) {
  modalGameOver.classList.remove('hidden');

  // Launch celebratory confetti
  if (window.confetti) {
    window.confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 }
    });
  }
  window.soundFx.playVictory();

  // Populate Winners Podium
  podiumList.innerHTML = '';
  state.winners.forEach(w => {
    const item = document.createElement('div');
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[w.rank - 1] || `#${w.rank}`;
    item.className = 'flex items-center justify-between p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs';
    item.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-base">${medal}</span>
        <span class="font-bold text-white">${w.name}</span>
        ${w.isBot ? '<span class="text-[9px] bg-blue-600/80 px-1 rounded text-white font-bold">BOT</span>' : ''}
      </div>
      <span class="text-emerald-400 font-bold font-mono">SAFE</span>
    `;
    podiumList.appendChild(item);
  });

  // Spotlight Loser (The Thulla)
  if (state.loser) {
    loserName.innerText = `${state.loser.name} (${state.loser.handCount} cards left)`;
  } else {
    loserName.innerText = 'Everyone is Safe!';
  }

  // Only host can click "Play Again"
  btnPlayAgain.style.display = isHost ? 'inline-flex' : 'none';
}

// Float Emoji Reaction over Player Seat
function floatReaction(playerId, emoji) {
  const seat = document.getElementById(`seat-${playerId}`);
  if (!seat) return;

  const reaction = document.createElement('div');
  reaction.className = 'floating-reaction';
  reaction.innerText = emoji;
  seat.appendChild(reaction);

  window.soundFx.playPop();

  setTimeout(() => {
    reaction.remove();
  }, 1900);
}

// --- SOCKET.IO EVENT LISTENERS ---

socket.on('connect', () => {
  console.log('Connected to server with ID:', socket.id);
});

socket.on('game_state_update', (data) => {
  currentGameState = data.state;
  isHost = data.isHost;
  myPlayerId = data.myPlayerId;

  if (data.state.status === 'waiting') {
    setupLobbyView(data.state);
    switchScreen('lobby');
  } else if (data.state.status === 'in_progress' || data.state.status === 'game_over') {
    switchScreen('game');
    renderGameBoard(data.state);
  }
});

socket.on('action_performed', (data) => {
  const action = data.action;

  if (action.isThulla) {
    isTrickFrozen = true;
    if (trickFreezeTimer) clearTimeout(trickFreezeTimer);

    // Render the completed trick with the Thulla card highlighted in red
    if (action.completedTrick) {
      renderTrick(action.completedTrick, action.thullaCard ? action.thullaCard.id : null, 'thulla-hit');
    }

    turnNoticeBanner.className = 'px-4 py-1.5 rounded-full bg-red-600 text-white text-xs font-black shadow-lg shadow-red-600/40 animate-pulse';
    turnNoticeBanner.innerText = `💥 THULLA! ${action.thullaBy} hit ${action.victimName} (+${action.cardsCount} cards)`;

    triggerThullaEffect(action);

    // Keep cards visible on table for 2.4s so players see what happened!
    trickFreezeTimer = setTimeout(() => {
      isTrickFrozen = false;
      trickFreezeTimer = null;
      if (currentGameState) {
        renderGameBoard(currentGameState);
      }
    }, 2400);

  } else if (action.type === 'trick_cleared') {
    isTrickFrozen = true;
    if (trickFreezeTimer) clearTimeout(trickFreezeTimer);

    if (action.completedTrick) {
      renderTrick(action.completedTrick, action.highestCard ? action.highestCard.id : null, 'trick-winner');
    }

    turnNoticeBanner.className = 'px-4 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold shadow-md';
    turnNoticeBanner.innerText = `✨ ${action.winnerName} won the trick with ${action.highestCard.rank}${action.highestCard.suit}!`;

    window.soundFx.playTrickWin();

    // Keep cards visible on table for 1.8s so players see who won!
    trickFreezeTimer = setTimeout(() => {
      isTrickFrozen = false;
      trickFreezeTimer = null;
      if (currentGameState) {
        renderGameBoard(currentGameState);
      }
    }, 1800);

  } else {
    window.soundFx.playCardSnap();
  }
});

socket.on('player_announcement', (data) => {
  showToast(data.text);
});

socket.on('reaction_received', (data) => {
  floatReaction(data.playerId, data.emoji);
});

socket.on('chat_received', (data) => {
  const msg = document.createElement('div');
  const isMe = data.senderId === myPlayerId;
  msg.className = `p-2 rounded-lg text-xs ${isMe ? 'bg-amber-500/20 text-amber-200 ml-4' : 'bg-slate-800 text-slate-200 mr-4'}`;
  msg.innerHTML = `
    <div class="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
      <span class="font-bold text-white">${data.senderAvatar} ${data.senderName}</span>
      <span>${data.time}</span>
    </div>
    <div>${data.text}</div>
  `;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (chatDrawer.classList.contains('hidden')) {
    chatBadge.classList.remove('hidden');
    window.soundFx.playPop();
  }
});

socket.on('bot_thinking', (data) => {
  const seat = document.getElementById(`seat-${data.botId}`);
  if (seat) {
    const info = seat.querySelector('.player-info-tag');
    if (info) {
      info.innerText = `🤔 Thinking...`;
      setTimeout(() => {
        if (currentGameState) {
          const p = currentGameState.players.find(pl => pl.id === data.botId);
          if (p && info) info.innerText = p.name;
        }
      }, 900);
    }
  }
});

// Initialize on Load
window.addEventListener('DOMContentLoaded', () => {
  setupAvatarPickers();
  parseURLParams();
});
