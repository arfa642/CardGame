/**
 * Deck and Card Management for Thulla
 */

const SUITS = ['♠', '♥', '♦', '♣']; // Spades, Hearts, Diamonds, Clubs
const SUIT_NAMES = {
  '♠': 'Spades',
  '♥': 'Hearts',
  '♦': 'Diamonds',
  '♣': 'Clubs'
};
const SUIT_COLORS = {
  '♠': 'black',
  '♣': 'black',
  '♥': 'red',
  '♦': 'red'
};

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A': 14
};

class Card {
  constructor(suit, rank, deckIndex = 0) {
    this.suit = suit;
    this.rank = rank;
    this.value = RANK_VALUES[rank];
    this.color = SUIT_COLORS[suit];
    this.suitName = SUIT_NAMES[suit];
    this.deckIndex = deckIndex;
    this.id = `${rank}${suit}_${deckIndex}`;
  }

  isAceOfSpades() {
    return this.suit === '♠' && this.rank === 'A';
  }

  toString() {
    return `${this.rank}${this.suit}`;
  }
}

function createDeck(numDecks = 1) {
  const cards = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push(new Card(suit, rank, d));
      }
    }
  }
  return cards;
}

// Fisher-Yates shuffle algorithm
function shuffle(cards) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Deals cards as evenly as possible to n players
function dealCards(deck, numPlayers) {
  const hands = Array.from({ length: numPlayers }, () => []);
  deck.forEach((card, idx) => {
    hands[idx % numPlayers].push(card);
  });

  // Sort each player's hand by suit and then rank for good UX
  hands.forEach(hand => sortHand(hand));

  return hands;
}

// Suit order for sorting: Spades, Hearts, Clubs, Diamonds
const SUIT_ORDER = { '♠': 0, '♥': 1, '♣': 2, '♦': 3 };

function sortHand(hand) {
  return hand.sort((a, b) => {
    if (a.suit !== b.suit) {
      return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    }
    return a.value - b.value;
  });
}

module.exports = {
  SUITS,
  RANKS,
  RANK_VALUES,
  SUIT_NAMES,
  SUIT_COLORS,
  Card,
  createDeck,
  shuffle,
  dealCards,
  sortHand
};
