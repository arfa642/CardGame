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
let selectedBluffCardIds = new Set();
let activeSuitFilter = 'ALL';

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
  const pickers = [
    document.getElementById('avatar-picker-global'),
    avatarPickerCreate,
    avatarPickerJoin
  ].filter(Boolean);

  pickers.forEach(picker => {
    picker.innerHTML = '';
    AVATARS.forEach((av) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-base sm:text-lg border transition flex-shrink-0 ${
        av === selectedAvatar ? 'bg-amber-500/20 border-amber-500 scale-105' : 'bg-slate-800 border-slate-700 hover:border-slate-600'
      }`;
      btn.innerText = av;
      btn.addEventListener('click', () => {
        selectedAvatar = av;
        localStorage.setItem('thulla_player_avatar', selectedAvatar);
        setupAvatarPickers();
      });
      picker.appendChild(btn);
    });
  });
}

// Read URL parameters on load and direct join if room code is present!
function parseURLParamsAndDirectJoin() {
  const params = new URLSearchParams(window.location.search);
  let roomCode = params.get('room');
  if (!roomCode) {
    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 'room' && pathParts[2]) {
      roomCode = pathParts[2];
    }
  }

  if (roomCode) {
    roomCode = roomCode.trim().toUpperCase();
    joinRoomCode.value = roomCode;

    // DIRECT TABLE JOIN (bypasses website home completely!)
    const savedName = localStorage.getItem('thulla_player_name') || `Player_${Math.floor(100 + Math.random() * 900)}`;
    const savedAvatar = localStorage.getItem('thulla_player_avatar') || selectedAvatar;

    showToast(`Joining table ${roomCode}...`);

    socket.emit('join_room', {
      roomId: roomCode,
      playerName: savedName,
      avatar: savedAvatar
    }, (res) => {
      if (res && res.success) {
        myPlayerId = res.playerId;
        currentRoomId = res.roomId;
        isHost = res.isHost;
        setupLobbyView(res.gameState);
        switchScreen('lobby');
        showToast(`🎉 Joined Table ${res.roomId} directly!`);
      } else {
        showToast(res ? res.error : 'Room not found or full', 'error');
        switchScreen('landing');
      }
    });
    return true;
  }
  return false;
}

// Generate full shareable link
function getShareableLink(roomId) {
  return `${window.location.origin}/?room=${roomId}`;
}

// Copy to clipboard with universal mobile fallback
function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
    }).catch(() => {
      fallbackCopyText(text, successMsg);
    });
  } else {
    fallbackCopyText(text, successMsg);
  }
}

function fallbackCopyText(text, successMsg) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) {
      showToast(successMsg);
    } else {
      prompt('Copy this link:', text);
    }
  } catch (err) {
    prompt('Copy this link:', text);
  }
}

function copyInviteLink(roomId) {
  const link = getShareableLink(roomId);
  copyToClipboard(link, '📋 Invite link copied to clipboard!');
}

// View Switching
function switchScreen(screen) {
  screenLanding.classList.add('hidden');
  screenLobby.classList.add('hidden');
  screenGame.classList.add('hidden');

  const appTopHeader = document.getElementById('app-top-header');

  if (screen === 'landing') {
    screenLanding.classList.remove('hidden');
    navRoomPill.classList.add('hidden');
    if (appTopHeader) appTopHeader.classList.remove('hidden');
  } else if (screen === 'lobby') {
    screenLobby.classList.remove('hidden');
    navRoomPill.classList.remove('hidden');
    if (appTopHeader) appTopHeader.classList.remove('hidden');
  } else if (screen === 'game') {
    screenGame.classList.remove('hidden');
    navRoomPill.classList.remove('hidden');
    if (appTopHeader) appTopHeader.classList.add('hidden');
  }
}

// --- PROFILE & COIN HELPERS ---

function getUserCoins() {
  return parseInt(localStorage.getItem('thulla_user_coins')) || 50000;
}

function addCoins(amount) {
  const current = getUserCoins();
  const next = current + amount;
  localStorage.setItem('thulla_user_coins', next);
  updateCoinsDisplay();
  return next;
}

function updateCoinsDisplay() {
  const display = document.getElementById('user-coins-display');
  if (display) {
    display.innerText = getUserCoins().toLocaleString();
  }
}

function getPlayerStats() {
  const wins = parseInt(localStorage.getItem('thullaking_wins') || '0', 10);
  const losses = parseInt(localStorage.getItem('thullaking_losses') || '0', 10);
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  return { wins, losses, total, winRate };
}

function updateStatsUI() {
  const stats = getPlayerStats();
  const elWins = document.getElementById('stat-wins-count');
  const elLosses = document.getElementById('stat-losses-count');
  const elRate = document.getElementById('stat-win-rate');
  if (elWins) elWins.innerText = stats.wins;
  if (elLosses) elLosses.innerText = stats.losses;
  if (elRate) elRate.innerText = `${stats.winRate}%`;
}

function updateProfileUI() {
  const savedName = localStorage.getItem('thulla_player_name') || 'Player';
  const savedAvatar = localStorage.getItem('thulla_player_avatar') || selectedAvatar;
  const bannerName = document.getElementById('banner-player-name');
  const bannerAvatar = document.getElementById('banner-avatar-emoji');
  const headerName = document.getElementById('header-player-name');
  const headerAvatar = document.getElementById('header-avatar-emoji');
  const modalAvatarPreview = document.getElementById('modal-profile-avatar-preview');
  const globalInput = document.getElementById('global-player-name');

  if (bannerName) bannerName.innerText = savedName;
  if (bannerAvatar) bannerAvatar.innerText = savedAvatar;
  if (headerName) headerName.innerText = savedName;
  if (headerAvatar) headerAvatar.innerText = savedAvatar;
  if (modalAvatarPreview) modalAvatarPreview.innerText = savedAvatar;
  if (globalInput) globalInput.value = savedName;

  updateStatsUI();
  updateCoinsDisplay();
}

function getPlayerProfile() {
  const globalInput = document.getElementById('global-player-name');
  let name = globalInput ? globalInput.value.trim() : '';
  if (!name) name = localStorage.getItem('thulla_player_name') || 'Player';
  localStorage.setItem('thulla_player_name', name);
  localStorage.setItem('thulla_player_avatar', selectedAvatar);
  updateProfileUI();
  return { name, avatar: selectedAvatar };
}

function switchMainTab(mode) {
  const tabs = [
    { id: 'tab-btn-friends', dockId: 'dock-btn-friends', sec: 'section-friends' },
    { id: 'tab-btn-bots', dockId: 'dock-btn-bots', sec: 'section-bots' },
    { id: 'tab-btn-worldwide', dockId: 'dock-btn-play', sec: 'section-worldwide' }
  ];

  tabs.forEach(t => {
    const btn = document.getElementById(t.id);
    const dockBtn = document.getElementById(t.dockId);
    const sec = document.getElementById(t.sec);
    if (!sec) return;

    if (t.id === `tab-btn-${mode}`) {
      if (btn) btn.className = 'mode-tab-btn active py-2.5 px-2 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-1.5 thulla-btn-gold';
      if (dockBtn) dockBtn.classList.add('active');
      sec.classList.remove('hidden');
    } else {
      if (btn) btn.className = 'mode-tab-btn py-2.5 px-2 rounded-xl text-xs sm:text-sm font-black text-slate-300 hover:text-white transition flex items-center justify-center gap-1.5';
      if (dockBtn) dockBtn.classList.remove('active');
      sec.classList.add('hidden');
    }
  });

  if (mode === 'worldwide') {
    fetchWorldwideCounts();
  }
}

// Create Room & Enter Lobby (Play with Friends)
function createGameAndEnterLobby(name, avatar, options) {
  localStorage.setItem('thulla_player_name', name);
  localStorage.setItem('thulla_player_avatar', avatar);

  socket.emit('create_room', {
    hostName: name,
    avatar: avatar,
    options
  }, (res) => {
    if (res && res.success) {
      myPlayerId = res.playerId;
      currentRoomId = res.roomId;
      isHost = true;
      setupLobbyView(res.gameState);
      switchScreen('lobby');
      showToast(`🎉 Room created! Code: ${res.roomId}`);
    } else {
      showToast(res ? res.error : 'Failed to create table', 'error');
    }
  });
}

// Instant Play vs AI Bots
function startSoloBotGame(name, avatar, gameType, botCount) {
  const totalPlayers = botCount + 1;
  localStorage.setItem('thulla_player_name', name);
  localStorage.setItem('thulla_player_avatar', avatar);

  showToast(`Starting ${gameType.toUpperCase()} vs ${botCount} bots...`);

  socket.emit('create_room', {
    hostName: name,
    avatar: avatar,
    options: { maxPlayers: totalPlayers, gameType, deckCount: 'auto', botSpeed: 1600 }
  }, (res) => {
    if (res && res.success) {
      myPlayerId = res.playerId;
      currentRoomId = res.roomId;
      isHost = true;

      socket.emit('fill_bots', { roomId: res.roomId, count: totalPlayers }, () => {
        socket.emit('start_game', { roomId: res.roomId });
      });
    } else {
      showToast(res ? res.error : 'Failed to start bot match', 'error');
    }
  });
}

// Worldwide Matchmaking Logic
let activeMatchmakingGame = null;

function startMatchmaking(gameType) {
  const { name, avatar } = getPlayerProfile();
  activeMatchmakingGame = gameType;

  const gameNames = {
    thulla: '🎴 Thulla (4-Player Table)',
    bluff: '🤫 Bluff (4-Player Table)',
    rang: '👑 Rang (4-Player Partnership)'
  };

  const modal = document.getElementById('modal-matchmaking');
  const label = document.getElementById('matchmaking-game-label');
  const statusText = document.getElementById('matchmaking-status-text');
  const slotsCount = document.getElementById('matchmaking-slots-count');
  if (label) label.innerText = gameNames[gameType] || gameType.toUpperCase();
  if (statusText) statusText.innerText = 'Searching for players worldwide...';
  if (slotsCount) slotsCount.innerText = '1 / 4 Players';

  renderMatchmakingSlots([{ id: myPlayerId || 'me', name, avatar }]);
  if (modal) modal.classList.remove('hidden');

  socket.emit('join_matchmaking', { gameType, playerName: name, avatar }, (res) => {
    if (res && res.success) {
      showToast(`Joined worldwide ${gameType.toUpperCase()} queue!`);
    } else {
      showToast(res ? res.error : 'Could not join matchmaking', 'error');
    }
  });
}

function cancelMatchmaking() {
  socket.emit('leave_matchmaking', () => {
    activeMatchmakingGame = null;
    const modal = document.getElementById('modal-matchmaking');
    if (modal) modal.classList.add('hidden');
    showToast('Matchmaking cancelled');
    fetchWorldwideCounts();
  });
}

function renderMatchmakingSlots(players) {
  const grid = document.getElementById('matchmaking-slots-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let i = 0; i < 4; i++) {
    const p = players[i];
    const slot = document.createElement('div');
    slot.className = `p-3 rounded-xl border flex items-center gap-2.5 transition ${
      p ? 'bg-amber-500/10 border-amber-500/50 shadow-md' : 'bg-slate-900/40 border-dashed border-slate-800'
    }`;
    if (p) {
      slot.innerHTML = `
        <div class="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-lg flex-shrink-0">
          ${p.avatar || '👤'}
        </div>
        <div class="text-left truncate">
          <div class="font-bold text-xs text-white truncate">${p.name}</div>
          <div class="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Ready
          </div>
        </div>
      `;
    } else {
      slot.innerHTML = `
        <div class="w-9 h-9 rounded-full border border-dashed border-slate-700 flex items-center justify-center text-slate-500 text-xs flex-shrink-0 animate-pulse">
          ⏳
        </div>
        <div class="text-left truncate">
          <div class="text-xs text-slate-500 font-medium">Slot ${i + 1}</div>
          <div class="text-[10px] text-slate-500 italic">Searching...</div>
        </div>
      `;
    }
    grid.appendChild(slot);
  }
}

function updateQueueBadge(gameType, count) {
  const badge = document.getElementById(`badge-queue-${gameType}`);
  if (badge) {
    badge.innerText = count > 0 ? `${count} in queue` : '0 in queue';
    if (count > 0) {
      badge.className = 'text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse';
    } else {
      badge.className = 'text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700';
    }
  }
}

function fetchWorldwideCounts() {
  socket.emit('get_worldwide_counts', (counts) => {
    if (counts) {
      updateQueueBadge('thulla', counts.thulla || 0);
      updateQueueBadge('bluff', counts.bluff || 0);
      updateQueueBadge('rang', counts.rang || 0);
    }
  });
}

// --- EVENT HANDLERS ---

// Tab Switchers
const tabBtnFriends = document.getElementById('tab-btn-friends');
const tabBtnBots = document.getElementById('tab-btn-bots');
const tabBtnWorldwide = document.getElementById('tab-btn-worldwide');

if (tabBtnFriends) tabBtnFriends.addEventListener('click', () => switchMainTab('friends'));
if (tabBtnBots) tabBtnBots.addEventListener('click', () => switchMainTab('bots'));
if (tabBtnWorldwide) tabBtnWorldwide.addEventListener('click', () => switchMainTab('worldwide'));

// 1. Play with Friends Cards
const btnCreateThulla = document.getElementById('btn-create-thulla');
const btnCreateBluff = document.getElementById('btn-create-bluff');
const btnCreateRang = document.getElementById('btn-create-rang');

if (btnCreateThulla) {
  btnCreateThulla.addEventListener('click', () => {
    const profile = getPlayerProfile();
    const maxPlayers = parseInt(document.getElementById('friends-thulla-players')?.value) || 4;
    createGameAndEnterLobby(profile.name, profile.avatar, { maxPlayers, gameType: 'thulla', deckCount: 'auto' });
  });
}

if (btnCreateBluff) {
  btnCreateBluff.addEventListener('click', () => {
    const profile = getPlayerProfile();
    const maxPlayers = parseInt(document.getElementById('friends-bluff-players')?.value) || 4;
    createGameAndEnterLobby(profile.name, profile.avatar, { maxPlayers, gameType: 'bluff', deckCount: '1' });
  });
}

if (btnCreateRang) {
  btnCreateRang.addEventListener('click', () => {
    const profile = getPlayerProfile();
    createGameAndEnterLobby(profile.name, profile.avatar, { maxPlayers: 4, gameType: 'rang', deckCount: '1' });
  });
}

// Join Room (Friends mode)
if (joinRoomBtn) {
  joinRoomBtn.addEventListener('click', () => {
    const code = joinRoomCode ? joinRoomCode.value.trim().toUpperCase() : '';
    const profile = getPlayerProfile();

    if (!code) {
      return showToast('Please enter a 6-character room code', 'error');
    }

    socket.emit('join_room', {
      roomId: code,
      playerName: profile.name,
      avatar: profile.avatar
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
}

// 2. Play with Bots Cards
const btnBotsThulla = document.getElementById('btn-bots-thulla');
const btnBotsBluff = document.getElementById('btn-bots-bluff');
const btnBotsRang = document.getElementById('btn-bots-rang');

if (btnBotsThulla) {
  btnBotsThulla.addEventListener('click', () => {
    const profile = getPlayerProfile();
    const botCount = parseInt(document.getElementById('bots-count-select')?.value) || 3;
    startSoloBotGame(profile.name, profile.avatar, 'thulla', botCount);
  });
}

if (btnBotsBluff) {
  btnBotsBluff.addEventListener('click', () => {
    const profile = getPlayerProfile();
    const botCount = parseInt(document.getElementById('bots-count-select')?.value) || 3;
    startSoloBotGame(profile.name, profile.avatar, 'bluff', botCount);
  });
}

if (btnBotsRang) {
  btnBotsRang.addEventListener('click', () => {
    const profile = getPlayerProfile();
    startSoloBotGame(profile.name, profile.avatar, 'rang', 3);
  });
}

// 3. Play Worldwide Cards
const btnQueueThulla = document.getElementById('btn-queue-thulla');
const btnQueueBluff = document.getElementById('btn-queue-bluff');
const btnQueueRang = document.getElementById('btn-queue-rang');
const btnCancelMatchmaking = document.getElementById('btn-cancel-matchmaking');

if (btnQueueThulla) btnQueueThulla.addEventListener('click', () => startMatchmaking('thulla'));
if (btnQueueBluff) btnQueueBluff.addEventListener('click', () => startMatchmaking('bluff'));
if (btnQueueRang) btnQueueRang.addEventListener('click', () => startMatchmaking('rang'));
if (btnCancelMatchmaking) btnCancelMatchmaking.addEventListener('click', () => cancelMatchmaking());

// Profile Edit Modal & Settings
const btnOpenProfile = document.getElementById('btn-open-profile');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnAvatarClick = document.getElementById('btn-avatar-click');
const btnNameClick = document.getElementById('btn-name-click');
const modalProfileEdit = document.getElementById('modal-profile-edit');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnCloseProfile = document.getElementById('btn-close-profile');

const openProfileModal = () => {
  updateProfileUI();
  if (modalProfileEdit) modalProfileEdit.classList.remove('hidden');
};

if (btnOpenProfile) btnOpenProfile.addEventListener('click', openProfileModal);
if (btnOpenSettings) btnOpenSettings.addEventListener('click', openProfileModal);
if (btnAvatarClick) btnAvatarClick.addEventListener('click', openProfileModal);
if (btnNameClick) btnNameClick.addEventListener('click', openProfileModal);

if (btnCloseProfile && modalProfileEdit) {
  btnCloseProfile.addEventListener('click', () => {
    modalProfileEdit.classList.add('hidden');
  });
}

if (btnSaveProfile && modalProfileEdit) {
  btnSaveProfile.addEventListener('click', () => {
    getPlayerProfile();
    modalProfileEdit.classList.add('hidden');
    showToast('👑 Profile updated successfully!');
  });
}

// Close modals on outside tap
[modalProfileEdit, document.getElementById('modal-leaderboard')].forEach(m => {
  if (m) {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.add('hidden');
    });
  }
});

// Leaderboard Modal
const dockBtnLeaderboard = document.getElementById('dock-btn-leaderboard');
const modalLeaderboard = document.getElementById('modal-leaderboard');
const btnCloseLeaderboard = document.getElementById('btn-close-leaderboard');

if (dockBtnLeaderboard && modalLeaderboard) {
  dockBtnLeaderboard.addEventListener('click', () => modalLeaderboard.classList.remove('hidden'));
}
if (btnCloseLeaderboard && modalLeaderboard) {
  btnCloseLeaderboard.addEventListener('click', () => modalLeaderboard.classList.add('hidden'));
}

// Dock Navigation Buttons (Mobile App Style)
const dockBtnFriends = document.getElementById('dock-btn-friends');
const dockBtnBots = document.getElementById('dock-btn-bots');
const dockBtnPlay = document.getElementById('dock-btn-play');
const dockBtnRules = document.getElementById('dock-btn-rules');

if (dockBtnFriends) dockBtnFriends.addEventListener('click', () => switchMainTab('friends'));
if (dockBtnBots) dockBtnBots.addEventListener('click', () => switchMainTab('bots'));
if (dockBtnPlay) dockBtnPlay.addEventListener('click', () => switchMainTab('worldwide'));
if (dockBtnRules) dockBtnRules.addEventListener('click', () => modalRules && modalRules.classList.remove('hidden'));

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
if (btnAddBot) {
  btnAddBot.addEventListener('click', () => {
    if (currentRoomId) socket.emit('add_bot', { roomId: currentRoomId });
  });
}

if (btnRemoveBot) {
  btnRemoveBot.addEventListener('click', () => {
    if (currentRoomId) socket.emit('remove_bot', { roomId: currentRoomId });
  });
}

if (btnFillBots) {
  btnFillBots.addEventListener('click', () => {
    if (currentRoomId) socket.emit('fill_bots', { roomId: currentRoomId, count: 4 });
  });
}

if (btnStartGame) {
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
}

// Copy Invite Links
if (lobbyCopyCodeBtn) {
  lobbyCopyCodeBtn.addEventListener('click', () => {
    if (currentRoomId) copyToClipboard(currentRoomId, '📋 Room code copied!');
  });
}

if (lobbyCopyLinkBtn) {
  lobbyCopyLinkBtn.addEventListener('click', () => {
    if (currentRoomId) copyInviteLink(currentRoomId);
  });
}

if (navCopyLinkBtn) {
  navCopyLinkBtn.addEventListener('click', () => {
    if (currentRoomId) copyInviteLink(currentRoomId);
  });
}

// Sound Toggle
function handleToggleSound() {
  const muted = window.soundFx.toggleMute();
  const icon = document.getElementById('dock-sound-icon');
  if (icon) icon.innerText = muted ? '🔇' : '🔊';
  if (soundToggleBtn) soundToggleBtn.innerText = muted ? '🔇' : '🔊';
  showToast(muted ? 'Sound Muted' : 'Sound Unmuted');
}

if (soundToggleBtn) soundToggleBtn.addEventListener('click', handleToggleSound);
const dockBtnSound = document.getElementById('dock-btn-sound');
if (dockBtnSound) dockBtnSound.addEventListener('click', handleToggleSound);

// Rules Modal
if (rulesModalBtn) rulesModalBtn.addEventListener('click', () => modalRules && modalRules.classList.remove('hidden'));
if (closeRulesBtn) closeRulesBtn.addEventListener('click', () => modalRules && modalRules.classList.add('hidden'));
if (closeRulesBtnBottom) closeRulesBtnBottom.addEventListener('click', () => modalRules && modalRules.classList.add('hidden'));

// Chat Toggle
if (openChatBtn) {
  openChatBtn.addEventListener('click', () => {
    if (chatDrawer) chatDrawer.classList.toggle('hidden');
    if (chatBadge) chatBadge.classList.add('hidden');
  });
}
if (closeChatBtn) {
  closeChatBtn.addEventListener('click', () => {
    if (chatDrawer) chatDrawer.classList.add('hidden');
  });
}

if (chatForm) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput ? chatInput.value.trim() : '';
    if (text && currentRoomId) {
      socket.emit('send_chat', { roomId: currentRoomId, message: text });
      if (chatInput) chatInput.value = '';
    }
  });
}

// Quick Chat Chips
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('chat-chip')) {
    const phrase = e.target.innerText.trim();
    if (phrase && currentRoomId) {
      socket.emit('send_chat', { roomId: currentRoomId, message: phrase });
    }
  }
});

// Lobby Live Chat
const lobbyChatForm = document.getElementById('lobby-chat-form');
const lobbyChatInput = document.getElementById('lobby-chat-input');
const lobbyChatMessages = document.getElementById('lobby-chat-messages');

if (lobbyChatForm) {
  lobbyChatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = lobbyChatInput.value.trim();
    if (text && currentRoomId) {
      socket.emit('send_chat', { roomId: currentRoomId, message: text });
      lobbyChatInput.value = '';
    }
  });
}

// Show Chat Bubble over Player Avatar
function showChatBubble(playerId, text) {
  const seat = document.getElementById(`seat-${playerId}`);
  if (!seat) return;
  const bubble = document.createElement('div');
  bubble.className = 'chat-speech-bubble';
  bubble.innerText = text;
  seat.appendChild(bubble);

  setTimeout(() => {
    bubble.remove();
  }, 4000);
}

// Lobby Game Mode Select
const lobbyGameModeSelect = document.getElementById('lobby-game-mode-select');
if (lobbyGameModeSelect) {
  lobbyGameModeSelect.addEventListener('change', (e) => {
    if (currentRoomId && isHost) {
      socket.emit('change_game_type', { roomId: currentRoomId, gameType: e.target.value }, (res) => {
        if (res && res.success) {
          showToast(`Switched game to ${e.target.value.toUpperCase()}!`);
        }
      });
    }
  });
}

// Bluff Action Buttons
const btnCallBluff = document.getElementById('btn-call-bluff');
const btnPlayBluffCards = document.getElementById('btn-play-bluff-cards');
const bluffSelectedCount = document.getElementById('bluff-selected-count');
const bluffActionBar = document.getElementById('bluff-action-bar');

if (btnCallBluff) {
  btnCallBluff.addEventListener('click', () => {
    if (!currentRoomId) return;
    socket.emit('call_bluff', { roomId: currentRoomId }, (res) => {
      if (res && !res.success) {
        showToast(res.error, 'error');
      }
    });
  });
}

if (btnPlayBluffCards) {
  btnPlayBluffCards.addEventListener('click', () => {
    if (!currentRoomId) return;
    if (selectedBluffCardIds.size === 0) {
      return showToast('Tap cards in your hand to select 1 to 4 cards to place!', 'error');
    }
    const cardIds = Array.from(selectedBluffCardIds);
    socket.emit('bluff_play_cards', { roomId: currentRoomId, cardIds }, (res) => {
      if (res && res.success) {
        selectedBluffCardIds.clear();
        if (bluffSelectedCount) bluffSelectedCount.innerText = '0';
      } else {
        showToast(res ? res.error : 'Failed to play cards', 'error');
      }
    });
  });
}

// Rang Trump Selection Modal & Buttons
const rangTrumpModal = document.getElementById('rang-trump-modal');
document.querySelectorAll('.btn-select-trump').forEach(btn => {
  btn.addEventListener('click', () => {
    const suit = btn.dataset.suit;
    if (suit && currentRoomId) {
      socket.emit('select_trump', { roomId: currentRoomId, suit }, (res) => {
        if (res && res.success) {
          if (rangTrumpModal) rangTrumpModal.classList.add('hidden');
          showToast(`👑 RANG is set to ${suit}!`);
        }
      });
    }
  });
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
if (btnPlayAgain) {
  btnPlayAgain.addEventListener('click', () => {
    if (modalGameOver) modalGameOver.classList.add('hidden');
    if (isHost && currentRoomId) {
      socket.emit('restart_game', { roomId: currentRoomId });
    } else {
      showToast('Waiting for host to restart...');
    }
  });
}

if (btnBackLobby) {
  btnBackLobby.addEventListener('click', () => {
    if (modalGameOver) modalGameOver.classList.add('hidden');
    switchScreen('lobby');
  });
}

// --- UI RENDERING FUNCTIONS ---

function setupLobbyView(state) {
  if (navRoomCode) navRoomCode.innerText = state.roomId;
  if (lobbyRoomCode) lobbyRoomCode.innerText = state.roomId;
  if (lobbyShareLink) lobbyShareLink.innerText = getShareableLink(state.roomId);

  const gameModeSelect = document.getElementById('lobby-game-mode-select');
  if (gameModeSelect && state.gameType) {
    gameModeSelect.value = state.gameType;
    gameModeSelect.disabled = !isHost;
  }

  const max = (state.options && state.options.maxPlayers) || 4;
  if (lobbyPlayerCountBadge) {
    lobbyPlayerCountBadge.innerText = `${state.players.length} / ${max} Players`;
  }

  // Host vs Guest controls
  if (hostControls && guestWaitingMsg) {
    if (isHost) {
      hostControls.classList.remove('hidden');
      guestWaitingMsg.classList.add('hidden');
    } else {
      hostControls.classList.add('hidden');
      guestWaitingMsg.classList.remove('hidden');
    }
  }

  // Render Seated Players
  if (lobbyPlayersGrid) {
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
}

// Render the Table Game View
function renderGameBoard(state) {
  currentGameState = state;
  navRoomCode.innerText = state.roomId;

  // 1. Update Top Bar Status according to Game Type
  if (state.gameType === 'bluff') {
    ledSuitBadge.innerHTML = `<span class="text-amber-400 font-extrabold text-xs">Claim: ${state.currentRank || 'A'}s</span>`;
    discardCountBadge.innerText = state.centerPileCount || 0;
    if (bluffActionBar) bluffActionBar.classList.remove('hidden');

    if (btnCallBluff) {
      if (state.lastPlay && state.lastPlay.playerId !== myPlayerId) {
        btnCallBluff.disabled = false;
        btnCallBluff.classList.remove('opacity-40');
        btnCallBluff.innerText = `🚨 CALL BLUFF! (${state.lastPlay.playerName} claimed ${state.lastPlay.count} ${state.lastPlay.declaredRank}s)`;
      } else {
        btnCallBluff.disabled = true;
        btnCallBluff.classList.add('opacity-40');
        btnCallBluff.innerText = `🚨 CALL BLUFF! (Jhooth!)`;
      }
    }
  } else if (state.gameType === 'rang') {
    if (bluffActionBar) bluffActionBar.classList.add('hidden');
    ledSuitBadge.innerHTML = `<span class="text-amber-400 font-extrabold text-xs">Rang: ${state.trumpSuit || 'Choosing...'}</span>`;
    discardCountBadge.innerText = state.trick ? state.trick.length : 0;

    if (state.status === 'trump_selection') {
      if (state.trumpCallerId === myPlayerId) {
        if (rangTrumpModal) rangTrumpModal.classList.remove('hidden');
      }
    } else {
      if (rangTrumpModal) rangTrumpModal.classList.add('hidden');
    }
  } else {
    // Thulla Mode
    if (bluffActionBar) bluffActionBar.classList.add('hidden');
    if (state.ledSuit) {
      const suitColors = { '♠': 'text-slate-100', '♣': 'text-slate-100', '♥': 'text-red-500', '♦': 'text-red-500' };
      ledSuitBadge.innerHTML = `<span class="${suitColors[state.ledSuit] || ''} text-base">${state.ledSuit}</span>`;
    } else {
      ledSuitBadge.innerHTML = '<span class="text-slate-400">Any</span>';
    }
    discardCountBadge.innerText = state.discardPileCount || 0;
  }

  // Turn status
  const currentTurnPlayer = state.players.find(p => p.id === state.currentTurnPlayerId);
  const isMyTurn = state.currentTurnPlayerId === myPlayerId;

  if (isMyTurn) {
    turnNoticeBanner.className = 'px-4 py-1.5 rounded-full bg-amber-500 text-black text-xs font-black shadow-lg shadow-amber-500/30 animate-pulse';
    if (state.gameType === 'bluff') {
      turnNoticeBanner.innerText = `👉 YOUR TURN: Select 1-4 cards claiming ${state.currentRank}s`;
      handTurnHint.innerText = 'Tap cards to select, then click "Place Cards"';
    } else {
      turnNoticeBanner.innerText = state.isFirstTrick && state.trick && state.trick.length === 0 ? '♠ Leading with Ace of Spades (Your Turn!)' : '👉 It is YOUR turn to play!';
      handTurnHint.innerText = 'Tap any glowing card below to play it!';
    }
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

// Render User's Hand (optimized for 2-3 players and large hands)
function renderUserHand(hand, validCards, isMyTurn) {
  userCardsContainer.innerHTML = '';

  // Update Suit Tab Counts
  const countAll = hand.length;
  const countSpades = hand.filter(c => c.suit === '♠').length;
  const countHearts = hand.filter(c => c.suit === '♥').length;
  const countDiamonds = hand.filter(c => c.suit === '♦').length;
  const countClubs = hand.filter(c => c.suit === '♣').length;

  const tabAll = document.getElementById('tab-count-all');
  const tabSpades = document.getElementById('tab-count-spades');
  const tabHearts = document.getElementById('tab-count-hearts');
  const tabDiamonds = document.getElementById('tab-count-diamonds');
  const tabClubs = document.getElementById('tab-count-clubs');

  if (tabAll) tabAll.innerText = countAll;
  if (tabSpades) tabSpades.innerText = countSpades;
  if (tabHearts) tabHearts.innerText = countHearts;
  if (tabDiamonds) tabDiamonds.innerText = countDiamonds;
  if (tabClubs) tabClubs.innerText = countClubs;

  // Filter by active suit tab if user clicked a specific suit
  let displayCards = hand;
  const isFilterActive = activeSuitFilter !== 'ALL';
  if (isFilterActive) {
    displayCards = hand.filter(c => c.suit === activeSuitFilter);
    // If player has 0 cards of this suit, fall back to ALL
    if (displayCards.length === 0) {
      displayCards = hand;
      activeSuitFilter = 'ALL';
      document.querySelectorAll('.suit-tab').forEach(tab => {
        if (tab.dataset.suit === 'ALL') {
          tab.className = 'suit-tab active px-2.5 py-0.5 rounded-lg bg-amber-500 text-black font-extrabold text-[11px] shadow transition';
        } else {
          const isRed = tab.dataset.suit === '♥' || tab.dataset.suit === '♦';
          tab.className = `suit-tab px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 ${isRed ? 'text-red-400' : 'text-slate-100'} font-bold text-[11px] border border-slate-700 transition`;
        }
      });
    }
  }

  // Overlap margin based on card count
  let overlapMargin = '-26px';
  if (isFilterActive || displayCards.length <= 6) {
    overlapMargin = '6px'; // Zero overlap when filtering or few cards!
  } else if (displayCards.length <= 10) {
    overlapMargin = '-14px';
  } else if (displayCards.length <= 15) {
    overlapMargin = '-20px';
  }

  // 1. BLUFF MODE: multi-card selection
  if (currentGameState && currentGameState.gameType === 'bluff') {
    displayCards.forEach((card, idx) => {
      const isSelected = selectedBluffCardIds.has(card.id);
      const cardEl = createCardElement(card);
      cardEl.classList.add('hand-card', 'valid-card');
      if (idx > 0) cardEl.style.marginLeft = overlapMargin;

      if (isSelected) {
        cardEl.classList.add('selected-bluff-card');
      }
      cardEl.addEventListener('click', () => {
        if (selectedBluffCardIds.has(card.id)) {
          selectedBluffCardIds.delete(card.id);
        } else {
          if (selectedBluffCardIds.size >= 4) {
            return showToast('Maximum 4 cards can be played at once in Bluff', 'error');
          }
          selectedBluffCardIds.add(card.id);
        }
        if (bluffSelectedCount) bluffSelectedCount.innerText = selectedBluffCardIds.size;
        renderUserHand(hand, validCards, isMyTurn);
      });
      userCardsContainer.appendChild(cardEl);
    });
    return;
  }

  // 2. THULLA & RANG MODES: single card play
  const validCardIds = new Set((validCards || []).map(c => c.id));

  displayCards.forEach((card, idx) => {
    const isValid = isMyTurn && (validCardIds.size === 0 || validCardIds.has(card.id));
    const cardEl = createCardElement(card);
    cardEl.classList.add('hand-card');
    if (idx > 0) cardEl.style.marginLeft = overlapMargin;

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

// Suit Filter Tab Click Handler
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('suit-tab')) {
    activeSuitFilter = e.target.dataset.suit || 'ALL';
    document.querySelectorAll('.suit-tab').forEach(tab => {
      if (tab.dataset.suit === activeSuitFilter) {
        tab.className = 'suit-tab active px-2.5 py-0.5 rounded-lg bg-amber-500 text-black font-extrabold text-[11px] shadow transition';
      } else {
        const isRed = tab.dataset.suit === '♥' || tab.dataset.suit === '♦';
        tab.className = `suit-tab px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 ${isRed ? 'text-red-400' : 'text-slate-100'} font-bold text-[11px] border border-slate-700 transition`;
      }
    });

    if (currentGameState) {
      const myPlayer = currentGameState.players.find(p => p.id === myPlayerId);
      if (myPlayer) {
        renderUserHand(myPlayer.hand || [], myPlayer.validCards || [], currentGameState.currentTurnPlayerId === myPlayerId);
      }
    }
  }
});

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

let lastRecordedGameOverKey = null;

function recordGameResult(state) {
  if (!state) return;
  const winnersStr = (state.winners || []).map(w => w.id).join('-');
  const loserStr = state.loser ? state.loser.id : 'none';
  const gameKey = `${state.roomId || 'room'}_${state.turnNumber || 0}_${winnersStr}_${loserStr}`;
  if (lastRecordedGameOverKey === gameKey) return;
  lastRecordedGameOverKey = gameKey;

  const totalPlayers = (state.players && state.players.length > 0) ? state.players.length : 4;
  const myWinnerRecord = state.winners ? state.winners.find(w => w.id === myPlayerId) : null;
  const isLoser = state.loser && state.loser.id === myPlayerId;

  let isWin = false;
  if (myWinnerRecord) {
    // Rule: 1st and 2nd for 4+ players, 1st for 2-3 players
    if (totalPlayers >= 4) {
      if (myWinnerRecord.rank <= 2) isWin = true;
    } else {
      if (myWinnerRecord.rank === 1) isWin = true;
    }
  }

  if (isWin) {
    const curWins = parseInt(localStorage.getItem('thullaking_wins') || '0', 10);
    localStorage.setItem('thullaking_wins', (curWins + 1).toString());
  } else if (isLoser) {
    const curLosses = parseInt(localStorage.getItem('thullaking_losses') || '0', 10);
    localStorage.setItem('thullaking_losses', (curLosses + 1).toString());
  }

  updateStatsUI();
}

// Render Game Over Modal with Confetti
function renderGameOverModal(state) {
  modalGameOver.classList.remove('hidden');

  // Record win/loss stats in player banner
  recordGameResult(state);

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

  // Award Coins to winner
  const myWinnerRecord = state.winners.find(w => w.id === myPlayerId);
  if (myWinnerRecord) {
    if (myWinnerRecord.rank === 1) {
      addCoins(5000);
      showToast('👑 KING VICTORY! +5,000 Coins added!');
    } else if (myWinnerRecord.rank === 2) {
      addCoins(2500);
      showToast('🥈 2nd Place! +2,500 Coins added!');
    }
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

  // Also add to Lobby Live Chat
  const lobbyChat = document.getElementById('lobby-chat-messages');
  if (lobbyChat) {
    const lmsg = document.createElement('div');
    lmsg.className = 'text-[11px] text-slate-300';
    lmsg.innerHTML = `<span class="font-bold text-amber-400">${data.senderName}:</span> ${data.text}`;
    lobbyChat.appendChild(lmsg);
    lobbyChat.scrollTop = lobbyChat.scrollHeight;
  }

  // Floating speech bubble over seat
  showChatBubble(data.senderId, data.text);

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

// Worldwide Matchmaking Socket Listeners
socket.on('matchmaking_update', ({ gameType, count, needed, players }) => {
  if (activeMatchmakingGame === gameType) {
    const slotsCount = document.getElementById('matchmaking-slots-count');
    if (slotsCount) slotsCount.innerText = `${count} / ${needed} Players`;
    renderMatchmakingSlots(players);
  }
  updateQueueBadge(gameType, count);
});

socket.on('match_found', ({ roomId, gameType, playerId, isHost: hostStatus }) => {
  activeMatchmakingGame = null;
  myPlayerId = playerId;
  currentRoomId = roomId;
  isHost = hostStatus;

  const modal = document.getElementById('modal-matchmaking');
  const statusText = document.getElementById('matchmaking-status-text');
  if (statusText) statusText.innerText = '🎉 Match Found! Launching Table...';

  if (window.soundFx) window.soundFx.play('game_start');

  setTimeout(() => {
    if (modal) modal.classList.add('hidden');
    switchScreen('game');
    showToast('Table connected! Match started worldwide!', 'info');
  }, 900);
});

// Initialize on Load
window.addEventListener('DOMContentLoaded', () => {
  setupAvatarPickers();
  updateProfileUI();
  switchMainTab('worldwide');

  const globalInput = document.getElementById('global-player-name');
  if (globalInput) {
    globalInput.addEventListener('input', (e) => {
      localStorage.setItem('thulla_player_name', e.target.value.trim());
      updateProfileUI();
    });
  }

  // Fetch worldwide queue counts
  fetchWorldwideCounts();

  // If user opened a shareable room link, join table DIRECTLY!
  parseURLParamsAndDirectJoin();
});
