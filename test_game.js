/**
 * Test script for Thulla Game Engine and Bot AI
 * Simulates a full game between 4 bots to ensure rules and edge cases work seamlessly.
 */

const ThullaGame = require('./game/engine');
const ThullaBot = require('./game/bot');

console.log('--- Testing Thulla Game Engine ---');

const game = new ThullaGame('TEST_ROOM', { deckCount: 1 });

// Add 4 bot players
const p1 = game.addPlayer('bot1', 'Bot Alpha', true, '🦊');
const p2 = game.addPlayer('bot2', 'Bot Bravo', true, '🐼');
const p3 = game.addPlayer('bot3', 'Bot Charlie', true, '🦁');
const p4 = game.addPlayer('bot4', 'Bot Delta', true, '🐯');

console.log(`Players added: ${game.players.map(p => p.name).join(', ')}`);

game.startGame();
console.log(`Game started! Initial turn: ${game.getCurrentPlayer().name}`);
console.log(game.lastEvent.text);

let turns = 0;
const maxTurns = 500;

while (game.status === 'in_progress' && turns < maxTurns) {
  turns++;
  const current = game.getCurrentPlayer();
  const card = ThullaBot.chooseCard(game, current.id);

  if (!card) {
    console.error(`Error: Bot ${current.name} could not find a valid card!`);
    break;
  }

  const result = game.playCard(current.id, card.id);
  if (result.isThulla) {
    console.log(`[Turn ${turns}] ${result.thullaBy} hit THULLA on ${result.victimName} with ${result.thullaCard.rank}${result.thullaCard.suit}!`);
  } else if (result.type === 'trick_cleared') {
    console.log(`[Turn ${turns}] Trick won by ${result.winnerName} with ${result.highestCard.rank}${result.highestCard.suit}`);
  }

  // Check safe players
  const newlySafe = game.players.filter(p => p.isSafe && p.rank === game.winners.length);
  if (newlySafe.length > 0) {
    // console.log(`Player safe: ${newlySafe.map(p => p.name).join(', ')}`);
  }
}

console.log('\n--- Game Results ---');
console.log(`Total turns: ${turns}`);
console.log(`Game Status: ${game.status}`);
console.log('Winners:');
game.winners.forEach(w => console.log(`  Rank #${w.rank}: ${w.name}`));
if (game.loser) {
  console.log(`Loser (THULLA / Bhabhi): ${game.loser.name} with ${game.loser.handCount} cards remaining!`);
}

if (game.status === 'game_over') {
  console.log('SUCCESS: Full game simulation completed properly!');
} else {
  console.error('FAILURE: Game did not complete within turn limit.');
}
