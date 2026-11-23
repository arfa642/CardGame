/**
 * Rang / Court Piece (Kotu Pees / Gandu Patta) Game Engine
 * South Asian classic trump trick-taking card game.
 * Trump caller selects the Rang (Trump Suit), players cut with trump.
 * First team/player to collect 7 hands wins!
 */

const { createDeck, shuffle, dealCards, sortHand, SUITS } = require('./deck');

class RangGame {
  constructor(roomId, options = {}) {
    this.roomId = roomId;
    this.gameType = 'rang';
    this.options = {
      botSpeed: options.botSpeed || 1600,
      ...options
    };

    this.players = [];
    this.status = 'waiting'; // 'waiting', 'trump_selection', 'in_progress', 'game_over'
    this.trumpSuit = null; // '♠', '♥', '♦', '♣'
    this.trumpCallerIndex = 0;
    this.trick = []; // [{ playerId, playerName, card }]
    this.ledSuit = null;
    this.currentTurnIndex = -1;
    this.handsWon = {}; // playerId -> count
    this.winners = [];
    this.loser = null;
    this.lastEvent = null;
  }

  addPlayer(id, name, isBot = false, avatar = '') {
    if (this.players.length >= 8) throw new Error('Table full for Rang (max 8 players)');
    if (this.status !== 'waiting') throw new Error('Game in progress');

    const defaultAvatars = ['🦊', '🐼', '🦁', '🐯', '🤖', '🦄', '🐸', '🧙'];
    const chosenAvatar = avatar || defaultAvatars[this.players.length % defaultAvatars.length];

    const player = {
      id,
      name: name || (isBot ? `Bot ${this.players.filter(p => p.isBot).length + 1}` : `Player ${this.players.length + 1}`),
      isBot,
      avatar: chosenAvatar,
      hand: [],
      handsCount: 0,
      isSafe: false,
      rank: null,
      connected: true
    };

    this.players.push(player);
    return player;
  }

  removePlayer(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx !== -1) return this.players.splice(idx, 1)[0];
    return null;
  }

  startGame() {
    if (this.players.length < 2) throw new Error('Need at least 2 players');

    const fullDeck = shuffle(createDeck(1));
    const dealtHands = dealCards(fullDeck, this.players.length);

    this.players.forEach((player, i) => {
      player.hand = dealtHands[i];
      player.handsCount = 0;
      player.isSafe = false;
      this.handsWon[player.id] = 0;
    });

    this.status = 'trump_selection';
    this.trumpCallerIndex = 0;
    this.trumpSuit = null;
    this.trick = [];
    this.ledSuit = null;
    this.currentTurnIndex = this.trumpCallerIndex;

    const caller = this.players[this.trumpCallerIndex];

    // If caller is bot, auto-select their longest suit as trump
    if (caller.isBot) {
      this.selectTrump(caller.id, this.autoSelectBotTrump(caller.hand));
    } else {
      this.lastEvent = {
        type: 'select_trump',
        text: `👑 ${caller.name} is the Trump Caller! Please select the RANG (Trump Suit).`
      };
    }

    return this.getState();
  }

  autoSelectBotTrump(hand) {
    const counts = {};
    hand.forEach(c => counts[c.suit] = (counts[c.suit] || 0) + 1);
    let bestSuit = SUITS[0];
    let maxCount = -1;
    for (const suit of SUITS) {
      if ((counts[suit] || 0) > maxCount) {
        maxCount = counts[suit];
        bestSuit = suit;
      }
    }
    return bestSuit;
  }

  selectTrump(playerId, suit) {
    const caller = this.players[this.trumpCallerIndex];
    if (caller.id !== playerId) throw new Error('Only the trump caller can set Rang');

    this.trumpSuit = suit;
    this.status = 'in_progress';
    this.currentTurnIndex = this.trumpCallerIndex;

    const suitNames = { '♠': 'Spades (Hukum)', '♥': 'Hearts (Paan)', '♦': 'Diamonds (Eent)', '♣': 'Clubs (Chiri)' };

    this.lastEvent = {
      type: 'trump_set',
      text: `👑 RANG (Trump) is set to ${suit} ${suitNames[suit] || suit}! ${caller.name} leads the first trick.`
    };

    return this.getState();
  }

  getCurrentPlayer() {
    return this.players[this.currentTurnIndex];
  }

  getValidCards(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return [];

    // Leading trick: any card
    if (this.trick.length === 0) return [...player.hand];

    // Must follow led suit if held
    const suitCards = player.hand.filter(c => c.suit === this.ledSuit);
    if (suitCards.length > 0) return suitCards;

    // Doesn't have led suit: can play any card (trump or discard)
    return [...player.hand];
  }

  playCard(playerId, cardId) {
    if (this.status !== 'in_progress') throw new Error('Game not in progress');

    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== playerId) throw new Error('Not your turn');

    const cardIdx = currentPlayer.hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) throw new Error('Card not in hand');

    const card = currentPlayer.hand[cardIdx];
    const valid = this.getValidCards(playerId);
    if (!valid.some(c => c.id === card.id)) {
      throw new Error(`Must follow led suit (${this.ledSuit})`);
    }

    currentPlayer.hand.splice(cardIdx, 1);

    if (this.trick.length === 0) {
      this.ledSuit = card.suit;
    }

    this.trick.push({
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      card
    });

    // Check if trick completed
    if (this.trick.length >= this.players.length) {
      // Determine winner:
      // 1. Highest trump card if any trump was played
      // 2. Highest card of led suit
      const trumps = this.trick.filter(t => t.card.suit === this.trumpSuit);
      let winnerItem;

      if (trumps.length > 0) {
        winnerItem = trumps.reduce((max, t) => t.card.value > max.card.value ? t : max, trumps[0]);
      } else {
        const ledCards = this.trick.filter(t => t.card.suit === this.ledSuit);
        winnerItem = ledCards.reduce((max, t) => t.card.value > max.card.value ? t : max, ledCards[0]);
      }

      const winnerPlayer = this.players.find(p => p.id === winnerItem.playerId);
      winnerPlayer.handsCount = (winnerPlayer.handsCount || 0) + 1;
      this.handsWon[winnerPlayer.id] = winnerPlayer.handsCount;

      const completedTrick = [...this.trick];
      this.trick = [];
      this.ledSuit = null;
      this.currentTurnIndex = this.players.indexOf(winnerPlayer);

      this.lastEvent = {
        type: 'trick_cleared',
        text: `✨ ${winnerPlayer.name} wins the hand with ${winnerItem.card.rank}${winnerItem.card.suit}! (Total hands: ${winnerPlayer.handsCount})`
      };

      // Check win condition: 7 hands wins! (Or all cards played)
      if (winnerPlayer.handsCount >= 7 || this.players[0].hand.length === 0) {
        this.status = 'game_over';
        this.winners = [{ playerId: winnerPlayer.id, name: winnerPlayer.name, rank: 1, isBot: winnerPlayer.isBot }];
      }

      return {
        type: 'trick_cleared',
        winnerName: winnerPlayer.name,
        winnerId: winnerPlayer.id,
        highestCard: winnerItem.card,
        completedTrick
      };
    }

    // Advance turn to next player in trick
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;

    return {
      type: 'card_played',
      player: currentPlayer.name,
      card
    };
  }

  getState(forPlayerId = null) {
    return {
      roomId: this.roomId,
      gameType: 'rang',
      status: this.status,
      options: this.options,
      trumpSuit: this.trumpSuit,
      trumpCallerId: this.players[this.trumpCallerIndex] ? this.players[this.trumpCallerIndex].id : null,
      trumpCallerName: this.players[this.trumpCallerIndex] ? this.players[this.trumpCallerIndex].name : null,
      ledSuit: this.ledSuit,
      trick: this.trick,
      currentTurnIndex: this.currentTurnIndex,
      currentTurnPlayerId: this.getCurrentPlayer() ? this.getCurrentPlayer().id : null,
      players: this.players.map((p, idx) => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        avatar: p.avatar,
        cardCount: p.hand.length,
        handsCount: p.handsCount || 0,
        isSafe: p.isSafe,
        rank: p.rank,
        connected: p.connected,
        isCurrentTurn: idx === this.currentTurnIndex,
        hand: forPlayerId === p.id ? p.hand : undefined,
        validCards: forPlayerId === p.id ? this.getValidCards(p.id) : undefined
      })),
      winners: this.winners,
      loser: this.loser,
      lastEvent: this.lastEvent
    };
  }
}

module.exports = RangGame;
