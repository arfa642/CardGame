/**
 * Thulla AI Bot Logic
 * Implements intelligent decision-making for computer opponents.
 */

class ThullaBot {
  /**
   * Decide which card to play given the game engine and bot player ID
   * @param {ThullaGame} game
   * @param {string} botId
   * @returns {Object} The chosen card
   */
  static chooseCard(game, botId) {
    const validCards = game.getValidCards(botId);
    if (!validCards || validCards.length === 0) {
      return null;
    }

    // Only one legal choice (e.g. ♠A on start, or only one card of led suit)
    if (validCards.length === 1) {
      return validCards[0];
    }

    const bot = game.players.find(p => p.id === botId);
    if (!bot) return validCards[0];

    const trick = game.trick;
    const isLeading = trick.length === 0;

    // SCENARIO 1: Bot is LEADING the trick
    if (isLeading) {
      return this.chooseLeadCard(bot.hand, validCards, game);
    }

    const ledSuit = game.ledSuit;
    const isThullaOpportunity = validCards.every(c => c.suit !== ledSuit) ||
      (validCards.some(c => c.suit !== ledSuit) && !bot.hand.some(h => h.suit === ledSuit));

    // SCENARIO 2: Bot does NOT have the led suit -> THULLA!
    if (isThullaOpportunity) {
      return this.chooseThullaCard(bot.hand, validCards);
    }

    // SCENARIO 3: Bot MUST follow suit
    return this.chooseFollowSuitCard(bot.hand, validCards, trick, ledSuit, game);
  }

  /**
   * When leading:
   * - 40% chance: Lead highest card (Ace/King) if available to clear the trick.
   * - 30% chance: Lead a random suit from hand to ensure variety and clear common suits.
   * - 30% chance: Lead shortest suit to try voiding it.
   */
  static chooseLeadCard(hand, validCards, game) {
    const powerCards = validCards.filter(c => c.value >= 13);
    const rand = Math.random();

    // 1. Clear tricks with Ace/King
    if (powerCards.length > 0 && rand < 0.35) {
      return powerCards[Math.floor(Math.random() * powerCards.length)];
    }

    // Group cards by suit
    const bySuit = {};
    validCards.forEach(c => {
      if (!bySuit[c.suit]) bySuit[c.suit] = [];
      bySuit[c.suit].push(c);
    });

    const suits = Object.keys(bySuit);

    // 2. Lead a randomly chosen suit from hand (prevents infinite lock)
    if (rand < 0.70) {
      const chosenSuit = suits[Math.floor(Math.random() * suits.length)];
      const suitCards = bySuit[chosenSuit].sort((a, b) => a.value - b.value);
      return Math.random() < 0.6 ? suitCards[0] : suitCards[suitCards.length - 1];
    }

    // 3. Lead shortest suit to void it
    suits.sort((a, b) => bySuit[a].length - bySuit[b].length);
    const shortestSuit = suits[0];
    const shortestCards = bySuit[shortestSuit].sort((a, b) => a.value - b.value);
    return shortestCards[0];
  }

  /**
   * When giving a Thulla, bot wants to dump their highest card,
   * especially Aces, Kings, Queens of suits they have many of.
   */
  static chooseThullaCard(hand, validCards) {
    const sortedDesc = [...validCards].sort((a, b) => b.value - a.value);

    // If multiple cards of same top value, prefer the suit with the most cards in hand
    const suitCounts = {};
    hand.forEach(c => {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });

    const topValue = sortedDesc[0].value;
    const topCards = sortedDesc.filter(c => c.value === topValue);

    topCards.sort((a, b) => (suitCounts[b.suit] || 0) - (suitCounts[a.suit] || 0));

    return topCards[0];
  }

  /**
   * When following suit:
   * Avoid holding the highest card if other players can still play after,
   * because someone might Thulla!
   */
  static chooseFollowSuitCard(hand, validCards, trick, ledSuit, game) {
    const ledCardsInTrick = trick.filter(t => t.card.suit === ledSuit);
    let highestOnTable = ledCardsInTrick.reduce((max, t) => (t.card.value > max.value ? t.card : max), ledCardsInTrick[0].card);

    const sortedAsc = [...validCards].sort((a, b) => a.value - b.value);

    // Check if bot is the last active player to play in this trick
    const remainingToPlay = game.players.filter(p => !p.isSafe && !trick.some(t => t.playerId === p.id));
    const isLastPlayer = remainingToPlay.length <= 1;

    if (isLastPlayer) {
      // Last player to play: no one can Thulla after us!
      // Safe to dump our highest card to win and clear cards!
      return sortedAsc[sortedAsc.length - 1];
    }

    // If other players are still to play after us:
    // Try to play a card lower than current highestOnTable to avoid taking the hit
    const lowerCards = sortedAsc.filter(c => c.value < highestOnTable.value);
    if (lowerCards.length > 0) {
      return lowerCards[lowerCards.length - 1];
    }

    // All our cards are higher than table highest.
    // Play our lowest card that is higher (e.g. play 10 instead of Ace)
    return sortedAsc[0];
  }
}

module.exports = ThullaBot;
