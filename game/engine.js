/**
 * Thulla Game Engine
 * Manages game rules, turns, tricks, Thulla penalties, and winning conditions.
 */

const { createDeck, shuffle, dealCards, sortHand } = require('./deck');

class ThullaGame {
  constructor(roomId, options = {}) {
    this.roomId = roomId;
    this.options = {
      deckCount: options.deckCount || 'auto', // 'auto', 1, or 2
      botSpeed: options.botSpeed || 900, // ms delay for bot actions
      ...options
    };

    this.players = []; // { id, name, isBot, hand: [], isSafe: false, rank: null, connected: true, avatar }
    this.status = 'waiting'; // 'waiting', 'in_progress', 'game_over'
    this.trick = []; // [{ playerId, playerName, card }]
    this.currentTurnIndex = -1;
    this.ledSuit = null;
    this.isFirstTrick = true;
    this.discardPileCount = 0;
    this.winners = []; // Array of { playerId, name, rank, isBot }
    this.loser = null; // The player who is "Thulla" / "Bhabhi"
    this.lastEvent = null; // Announcement / event description
    this.activeTrickStarter = -1;
  }

  addPlayer(id, name, isBot = false, avatar = '') {
    if (this.players.length >= 10) {
      throw new Error('Table is full (maximum 10 players)');
    }
    if (this.status !== 'waiting') {
      throw new Error('Game already in progress');
    }

    const defaultAvatars = ['🦊', '🐼', '🦁', '🐯', '🐸', '🐨', '🐵', '🦉', '🐺', '🦄'];
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
    if (idx !== -1) {
      const removed = this.players.splice(idx, 1)[0];
      // If game was waiting, all good
      return removed;
    }
    return null;
  }

  replaceWithBot(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (player) {
      player.isBot = true;
      player.name = `Bot (${player.name})`;
      return player;
    }
    return null;
  }

  startGame() {
    if (this.players.length < 2) {
      throw new Error('Need at least 2 players to start');
    }

    // Determine deck count: if 'auto', 1 deck for <=5 players, 2 decks for >5 players
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
    this.trick = [];
    this.discardPileCount = 0;
    this.winners = [];
    this.loser = null;
    this.isFirstTrick = true;

    // Find who has Ace of Spades (♠A) to start the game!
    let starterIndex = -1;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].hand.some(c => c.isAceOfSpades())) {
        starterIndex = i;
        break;
      }
    }

    // Fallback if somehow ♠A not found (shouldn't happen)
    if (starterIndex === -1) starterIndex = 0;

    this.currentTurnIndex = starterIndex;
    this.activeTrickStarter = starterIndex;
    this.lastEvent = {
      type: 'game_start',
      text: `${this.players[starterIndex].name} holds the Ace of Spades (♠A) and leads first!`
    };

    return this.getState();
  }

  getCurrentPlayer() {
    if (this.currentTurnIndex < 0 || this.currentTurnIndex >= this.players.length) return null;
    return this.players[this.currentTurnIndex];
  }

  getActivePlayers() {
    return this.players.filter(p => !p.isSafe);
  }

  getValidCards(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.isSafe) return [];

    // If it's the very first trick of the game, player holding ♠A must lead with ♠A
    if (this.isFirstTrick && this.trick.length === 0) {
      const aceSpade = player.hand.filter(c => c.isAceOfSpades());
      if (aceSpade.length > 0) {
        return aceSpade;
      }
    }

    // If trick is empty, player can lead with ANY card from their hand
    if (this.trick.length === 0) {
      return [...player.hand];
    }

    // Trick is already started: must follow led suit if player has any card of that suit
    const suitCards = player.hand.filter(c => c.suit === this.ledSuit);
    if (suitCards.length > 0) {
      return suitCards;
    }

    // Player does NOT have the led suit: can play ANY card (this will be a THULLA!)
    return [...player.hand];
  }

  playCard(playerId, cardId) {
    if (this.status !== 'in_progress') {
      throw new Error('Game is not in progress');
    }

    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== playerId) {
      throw new Error("It is not this player's turn");
    }

    const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      throw new Error('Card not found in player hand');
    }

    const card = currentPlayer.hand[cardIndex];
    const validCards = this.getValidCards(playerId);
    const isValid = validCards.some(vc => vc.id === card.id);
    if (!isValid) {
      throw new Error(`Must follow suit (${this.ledSuit}) if you have it!`);
    }

    // Remove card from player hand
    currentPlayer.hand.splice(cardIndex, 1);

    // If leading this trick, set led suit
    const isLeadCard = this.trick.length === 0;
    if (isLeadCard) {
      this.ledSuit = card.suit;
    }

    // Add to trick
    this.trick.push({
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      card
    });

    let actionResult = {
      type: 'card_played',
      player: currentPlayer.name,
      card,
      isThulla: false
    };

    // Check for THULLA!
    // A Thulla happens when:
    // 1. Not the lead card (trick.length > 1)
    // 2. Played card suit != ledSuit
    const isThulla = !isLeadCard && card.suit !== this.ledSuit;

    if (isThulla) {
      // Find the player who played the HIGHEST card of ledSuit in this trick
      const ledCards = this.trick.filter(t => t.card.suit === this.ledSuit);
      let highestLed = ledCards[0];
      for (const item of ledCards) {
        if (item.card.value > highestLed.card.value) {
          highestLed = item;
        }
      }

      const victim = this.players.find(p => p.id === highestLed.playerId);

      // Victim must pick up all cards from this trick!
      const penaltyCards = this.trick.map(t => t.card);
      victim.hand.push(...penaltyCards);
      sortHand(victim.hand);

      // If victim was previously marked safe, they are no longer safe!
      if (victim.isSafe) {
        victim.isSafe = false;
        victim.rank = null;
        this.winners = this.winners.filter(w => w.playerId !== victim.id);
        this.winners.forEach((w, idx) => {
          w.rank = idx + 1;
          const p = this.players.find(pl => pl.id === w.playerId);
          if (p) p.rank = w.rank;
        });
      }

      actionResult = {
        type: 'thulla',
        isThulla: true,
        thullaBy: currentPlayer.name,
        thullaCard: card,
        victimName: victim.name,
        victimId: victim.id,
        highestCard: highestLed.card,
        cardsCount: penaltyCards.length
      };

      this.lastEvent = {
        type: 'thulla',
        text: `💥 THULLA! ${currentPlayer.name} hit ${victim.name} with ${card.rank}${card.suit}! ${victim.name} picks up ${penaltyCards.length} cards!`
      };

      // Check if current player (who hit Thulla) emptied hand
      this.checkPlayerSafe(currentPlayer);

      // Next lead:
      // In this rule variation: The player who picked up the cards (victim) leads the next trick!
      let nextLeadIndex;
      if (!victim.isSafe) {
        nextLeadIndex = this.players.indexOf(victim);
      } else if (!currentPlayer.isSafe) {
        nextLeadIndex = this.players.indexOf(currentPlayer);
      } else {
        nextLeadIndex = this.getNextActiveIndex(this.players.indexOf(victim));
      }

      // Clear the trick
      this.trick = [];
      this.ledSuit = null;
      this.isFirstTrick = false;
      this.currentTurnIndex = nextLeadIndex;
      this.activeTrickStarter = nextLeadIndex;

      this.checkGameOver();
      return { ...actionResult, gameState: this.getState() };
    }

    // NOT a Thulla: card followed suit (or was lead)
    // Check if player just became safe
    this.checkPlayerSafe(currentPlayer);

    // Check if trick is complete:
    // A trick is complete when all currently active players (who participated or had a turn) have played
    // That means: trick.length >= active players at start of trick, or everyone remaining has played
    const remainingToPlay = this.players.filter(p => !p.isSafe && !this.trick.some(t => t.playerId === p.id));

    if (remainingToPlay.length === 0) {
      // Trick complete with no Thulla!
      // Find winner of the trick (highest card of ledSuit)
      const ledCards = this.trick.filter(t => t.card.suit === this.ledSuit);
      let highestTrick = ledCards[0];
      for (const item of ledCards) {
        if (item.card.value > highestTrick.card.value) {
          highestTrick = item;
        }
      }

      const winnerPlayer = this.players.find(p => p.id === highestTrick.playerId);

      // Discard cards
      this.discardPileCount += this.trick.length;

      actionResult = {
        type: 'trick_cleared',
        winnerName: winnerPlayer.name,
        winnerId: winnerPlayer.id,
        highestCard: highestTrick.card,
        cardsDiscarded: this.trick.length
      };

      this.lastEvent = {
        type: 'trick_cleared',
        text: `✨ ${winnerPlayer.name} wins the trick with ${highestTrick.card.rank}${highestTrick.card.suit}! Cards cleared.`
      };

      // The winner of the trick gets the lead for next trick!
      let nextLeadIndex;
      if (!winnerPlayer.isSafe) {
        nextLeadIndex = this.players.indexOf(winnerPlayer);
      } else {
        // If the winner emptied their hand and is safe, lead goes clockwise to next active player
        nextLeadIndex = this.getNextActiveIndex(this.players.indexOf(winnerPlayer));
      }

      this.trick = [];
      this.ledSuit = null;
      this.isFirstTrick = false;
      this.currentTurnIndex = nextLeadIndex;
      this.activeTrickStarter = nextLeadIndex;

      this.checkGameOver();
      return { ...actionResult, gameState: this.getState() };
    }

    // Trick continues: advance turn to next active player who hasn't played in this trick yet
    this.isFirstTrick = false;
    this.currentTurnIndex = this.getNextTurnInTrick();

    return { ...actionResult, gameState: this.getState() };
  }

  getNextTurnInTrick() {
    let nextIdx = (this.currentTurnIndex + 1) % this.players.length;
    let checked = 0;
    while (checked < this.players.length) {
      const p = this.players[nextIdx];
      // Must be active (not safe) and not already played in this trick
      if (!p.isSafe && !this.trick.some(t => t.playerId === p.id)) {
        return nextIdx;
      }
      nextIdx = (nextIdx + 1) % this.players.length;
      checked++;
    }
    return nextIdx;
  }

  getNextActiveIndex(startIndex) {
    let nextIdx = (startIndex + 1) % this.players.length;
    let checked = 0;
    while (checked < this.players.length) {
      if (!this.players[nextIdx].isSafe) {
        return nextIdx;
      }
      nextIdx = (nextIdx + 1) % this.players.length;
      checked++;
    }
    return -1;
  }

  checkPlayerSafe(player) {
    if (player.hand.length === 0 && !player.isSafe) {
      player.isSafe = true;
      const rank = this.winners.length + 1;
      player.rank = rank;
      this.winners.push({
        playerId: player.id,
        name: player.name,
        rank,
        isBot: player.isBot
      });

      this.lastEvent = {
        type: 'player_safe',
        text: `🎉 ${player.name} has shed all cards and is SAFE! (Rank #${rank})`
      };
    }
  }

  checkGameOver() {
    const active = this.getActivePlayers();
    if (active.length <= 1) {
      this.status = 'game_over';
      if (active.length === 1) {
        const loserPlayer = active[0];
        loserPlayer.rank = this.players.length;
        this.loser = {
          playerId: loserPlayer.id,
          name: loserPlayer.name,
          handCount: loserPlayer.hand.length,
          isBot: loserPlayer.isBot
        };
        this.lastEvent = {
          type: 'game_over',
          text: `💀 GAME OVER! ${loserPlayer.name} is the THULLA (Bhabhi)!`
        };
      } else {
        this.lastEvent = {
          type: 'game_over',
          text: `Game over! All players are safe!`
        };
      }
      return true;
    }
    return false;
  }

  // Returns sanitized game state for clients
  // If forPlayerId is provided, includes that player's full hand and valid moves;
  // hides opponents' hands (only showing card counts).
  getState(forPlayerId = null) {
    const activePlayers = this.getActivePlayers();

    const sanitizedPlayers = this.players.map((p, index) => {
      const isCurrentTurn = index === this.currentTurnIndex;
      const base = {
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        avatar: p.avatar,
        cardCount: p.hand.length,
        isSafe: p.isSafe,
        rank: p.rank,
        connected: p.connected,
        isCurrentTurn
      };

      if (forPlayerId && p.id === forPlayerId) {
        base.hand = p.hand;
        base.validCards = this.getValidCards(p.id);
      }

      return base;
    });

    return {
      roomId: this.roomId,
      status: this.status,
      options: this.options,
      players: sanitizedPlayers,
      currentTurnIndex: this.currentTurnIndex,
      currentTurnPlayerId: this.getCurrentPlayer() ? this.getCurrentPlayer().id : null,
      ledSuit: this.ledSuit,
      isFirstTrick: this.isFirstTrick,
      trick: this.trick,
      discardPileCount: this.discardPileCount,
      winners: this.winners,
      loser: this.loser,
      lastEvent: this.lastEvent
    };
  }
}

module.exports = ThullaGame;
