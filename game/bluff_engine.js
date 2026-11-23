/**
 * Bluff (Cheat / 420) Game Engine
 * Players place 1-4 cards facedown claiming a rank.
 * Anyone can call "BLUFF!". If caught, bluffer picks up the pile;
 * if innocent, the challenger picks up the pile!
 */

const { createDeck, shuffle, dealCards, sortHand, RANKS } = require('./deck');

class BluffGame {
  constructor(roomId, options = {}) {
    this.roomId = roomId;
    this.gameType = 'bluff';
    this.options = {
      deckCount: options.deckCount || 'auto',
      botSpeed: options.botSpeed || 1600,
      ...options
    };

    this.players = [];
    this.status = 'waiting'; // 'waiting', 'in_progress', 'challenge_phase', 'game_over'
    this.centerPile = []; // all cards placed facedown so far
    this.currentClaimRankIndex = 0; // index into RANKS: 'A', '2', '3'...
    this.currentTurnIndex = -1;
    this.lastPlay = null; // { playerId, playerName, declaredRank, actualCards, count }
    this.challengeTimer = null;
    this.winners = [];
    this.loser = null;
    this.lastEvent = null;
  }

  addPlayer(id, name, isBot = false, avatar = '') {
    if (this.players.length >= 10) throw new Error('Table is full');
    if (this.status !== 'waiting') throw new Error('Game already in progress');

    const defaultAvatars = ['🦊', '🐼', '🦁', '🐯', '🤖', '🦄', '🐸', '🧙'];
    const chosenAvatar = avatar || defaultAvatars[this.players.length % defaultAvatars.length];

    const player = {
      id,
      name: name || (isBot ? `Bot ${this.players.filter(p => p.isBot).length + 1}` : `Player ${this.players.length + 1}`),
      isBot,
      avatar: chosenAvatar,
      hand: [],
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

    let numDecks = 1;
    if (this.options.deckCount === 2 || (this.options.deckCount === 'auto' && this.players.length > 5)) {
      numDecks = 2;
    }

    const fullDeck = shuffle(createDeck(numDecks));
    const dealtHands = dealCards(fullDeck, this.players.length);

    this.players.forEach((player, i) => {
      player.hand = dealtHands[i];
      player.isSafe = false;
      player.rank = null;
    });

    this.status = 'in_progress';
    this.centerPile = [];
    this.winners = [];
    this.loser = null;
    this.currentClaimRankIndex = 0; // Starts with Aces
    this.currentTurnIndex = 0;
    this.lastPlay = null;

    this.lastEvent = {
      type: 'game_start',
      text: `Game started! ${this.players[0].name} leads first. Current claim: ${RANKS[this.currentClaimRankIndex]}s`
    };

    return this.getState();
  }

  getCurrentRank() {
    return RANKS[this.currentClaimRankIndex];
  }

  getCurrentPlayer() {
    return this.players[this.currentTurnIndex];
  }

  getActivePlayers() {
    return this.players.filter(p => !p.isSafe);
  }

  // Play 1-4 cards with declared rank
  playCards(playerId, cardIds, declaredRank = null) {
    if (this.status !== 'in_progress') throw new Error('Game not in progress');

    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== playerId) throw new Error('Not your turn');

    if (!cardIds || cardIds.length < 1 || cardIds.length > 4) {
      throw new Error('Must play between 1 and 4 cards');
    }

    // Target rank defaults to current rank in sequence
    const targetRank = declaredRank || this.getCurrentRank();

    // Find cards in player's hand
    const actualCards = [];
    for (const cid of cardIds) {
      const idx = currentPlayer.hand.findIndex(c => c.id === cid);
      if (idx === -1) throw new Error('Card not found in hand');
      actualCards.push(currentPlayer.hand.splice(idx, 1)[0]);
    }

    // Add to center pile
    this.centerPile.push(...actualCards);

    const isBluff = actualCards.some(c => c.rank !== targetRank);

    this.lastPlay = {
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      declaredRank: targetRank,
      actualCards,
      count: actualCards.length,
      isBluff
    };

    this.lastEvent = {
      type: 'cards_placed',
      text: `${currentPlayer.name} placed ${actualCards.length} card(s) claiming ${targetRank}s!`
    };

    // Check if player has emptied hand
    if (currentPlayer.hand.length === 0 && !currentPlayer.isSafe) {
      // Pending win: if no one calls bluff, they win!
    }

    // Advance rank for next turn
    this.currentClaimRankIndex = (this.currentClaimRankIndex + 1) % RANKS.length;

    return {
      type: 'cards_placed',
      player: currentPlayer.name,
      count: actualCards.length,
      declaredRank: targetRank,
      pileCount: this.centerPile.length
    };
  }

  // Call Bluff on the last play
  callBluff(challengerId) {
    if (!this.lastPlay) throw new Error('No play to challenge');

    const challenger = this.players.find(p => p.id === challengerId);
    if (!challenger || challenger.isSafe) throw new Error('Invalid challenger');

    if (challenger.id === this.lastPlay.playerId) {
      throw new Error('Cannot challenge your own play');
    }

    const { playerName, declaredRank, actualCards, isBluff, playerId: blufferId } = this.lastPlay;
    const bluffer = this.players.find(p => p.id === blufferId);

    let penaltyPlayer;
    let resultText;
    let challengeWon;

    if (isBluff) {
      // Caught! Bluffer picks up the whole center pile!
      penaltyPlayer = bluffer;
      challengeWon = true;
      resultText = `🚨 BLUFF CAUGHT! ${playerName} lied! (Played: ${actualCards.map(c => c.rank + c.suit).join(', ')}). ${playerName} picks up ${this.centerPile.length} cards!`;
    } else {
      // Innocent! Challenger was wrong and picks up the whole pile!
      penaltyPlayer = challenger;
      challengeWon = false;
      resultText = `✨ HONEST PLAY! ${playerName} was telling the truth! (${actualCards.map(c => c.rank + c.suit).join(', ')}). ${challenger.name} picks up ${this.centerPile.length} cards!`;
    }

    // Give pile to penalty player
    penaltyPlayer.hand.push(...this.centerPile);
    sortHand(penaltyPlayer.hand);
    const pickedCount = this.centerPile.length;
    this.centerPile = [];

    // Check if players emptied hand
    this.checkSafePlayers();

    // Next turn goes to the winner of the challenge
    const nextLeader = challengeWon ? challenger : bluffer;
    let nextIdx = this.players.indexOf(nextLeader);
    if (nextLeader.isSafe) {
      nextIdx = this.getNextActiveIndex(nextIdx);
    }

    this.currentTurnIndex = nextIdx;
    this.lastPlay = null;

    this.lastEvent = {
      type: 'challenge_result',
      text: resultText
    };

    this.checkGameOver();

    return {
      type: 'challenge_result',
      isBluff,
      challengeWon,
      challengerName: challenger.name,
      blufferName: playerName,
      penaltyPlayerName: penaltyPlayer.name,
      pickedCount,
      revealedCards: actualCards
    };
  }

  // Pass without challenging (advances turn to next active player)
  passTurn(playerId) {
    this.checkSafePlayers();
    this.currentTurnIndex = this.getNextActiveIndex(this.currentTurnIndex);
    this.lastPlay = null;
    return { type: 'pass' };
  }

  getNextActiveIndex(startIdx) {
    let next = (startIdx + 1) % this.players.length;
    let count = 0;
    while (count < this.players.length) {
      if (!this.players[next].isSafe) return next;
      next = (next + 1) % this.players.length;
      count++;
    }
    return startIdx;
  }

  checkSafePlayers() {
    this.players.forEach(p => {
      if (p.hand.length === 0 && !p.isSafe) {
        p.isSafe = true;
        const rank = this.winners.length + 1;
        p.rank = rank;
        this.winners.push({ playerId: p.id, name: p.name, rank, isBot: p.isBot });
      }
    });
  }

  checkGameOver() {
    const active = this.getActivePlayers();
    if (active.length <= 1) {
      this.status = 'game_over';
      if (active.length === 1) {
        const loser = active[0];
        loser.rank = this.players.length;
        this.loser = { playerId: loser.id, name: loser.name, handCount: loser.hand.length, isBot: loser.isBot };
      }
      return true;
    }
    return false;
  }

  getState(forPlayerId = null) {
    return {
      roomId: this.roomId,
      gameType: 'bluff',
      status: this.status,
      options: this.options,
      currentRank: this.getCurrentRank(),
      currentClaimRankIndex: this.currentClaimRankIndex,
      centerPileCount: this.centerPile.length,
      currentTurnIndex: this.currentTurnIndex,
      currentTurnPlayerId: this.getCurrentPlayer() ? this.getCurrentPlayer().id : null,
      lastPlay: this.lastPlay ? {
        playerName: this.lastPlay.playerName,
        playerId: this.lastPlay.playerId,
        declaredRank: this.lastPlay.declaredRank,
        count: this.lastPlay.count
      } : null,
      players: this.players.map((p, idx) => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        avatar: p.avatar,
        cardCount: p.hand.length,
        isSafe: p.isSafe,
        rank: p.rank,
        connected: p.connected,
        isCurrentTurn: idx === this.currentTurnIndex,
        hand: forPlayerId === p.id ? p.hand : undefined
      })),
      winners: this.winners,
      loser: this.loser,
      lastEvent: this.lastEvent
    };
  }
}

module.exports = BluffGame;
