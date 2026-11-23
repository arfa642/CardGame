# 🎴 Thulla Card Game (Online Multiplayer & AI Bots)

An authentic, modern, real-time web-based implementation of the traditional South Asian card game **Thulla** (also known as *Bhabhi* or *Get Away*).

## ✨ Features

- **🌐 Online Real-Time Multiplayer:** Anyone can create a table, get a unique 6-character room code, and share a direct link (e.g. `http://localhost:3000/?room=XYZ123` or `http://your-server/room/XYZ123`).
- **👥 2 to 10 Players Support:** Accommodates any table size from heads-up 2-player duels to full 10-player games with automatic dynamic seating around a casino-style felt table.
- **🤖 Intelligent AI Bots:** Host can add/remove bots, or click **"Fill Table"** to instantly fill empty seats. You can also play 100% solo against 1-9 smart AI bots with a single click (**"Quick Play vs Bots"**).
- **♠️ Accurate Thulla Rules Engine:**
  - Game begins with the player holding the **Ace of Spades (♠A)** leading the first trick.
  - Mandatory suit-following logic: legal cards are highlighted with a gold glow, while invalid cards are locked.
  - **The THULLA Penalty:** If a player has no cards of the led suit, they can hit with any card of another suit! The player who threw the highest card of the led suit must pick up all cards from the trick into their hand.
  - **Trick Clearing:** When all active players follow suit without a Thulla, cards are permanently cleared to the dead pile, and the trick winner leads next.
  - **Winning & Podium:** Players who shed all cards become **Safe** with official rankings (1st, 2nd, 3rd place). The last player remaining with cards is the **Thulla (Bhabhi)**!
- **🔊 Synthesized Web Audio API:** 100% self-contained audio effects (card snap, Thulla impact explosion, victory fanfare, turn chime, pop) without relying on external media files.
- **💬 Reactions & Table Chat:** Live floating emoji reactions (🔥, 😂, 💥, 🃏, 💀, 👏) and in-game chat drawer.

---

## 🚀 How to Run

### 1. Start the Server
```bash
npm start
```
The server will start listening at:
```
http://localhost:3000
```

### 2. Playing the Game
1. Open [http://localhost:3000](http://localhost:3000) in your browser.
2. **To play with friends:**
   - Click **"Create Table & Invite Link"**.
   - Copy the generated invite link or share the 6-character room code.
   - Your friends can open the link in their browser (desktop or mobile) and join instantly.
3. **To play with Bots:**
   - On the homepage, click **"⚡ Quick Play vs Bots"** to start immediately with 3 AI players.
   - Or create a custom room and use the **"+ Add Bot"** or **"Fill Table"** buttons in the lobby.

---

## 📜 Game Rules Summary

1. **Objective:** Shed all your cards. The first player to have 0 cards wins 1st place. The last remaining player holding cards is the **Thulla (Bhabhi)**.
2. **Opening Lead:** All cards are dealt out equally. Whoever has the Ace of Spades (♠A) leads the first trick with ♠A.
3. **Following Suit:** Players take turns in clockwise order. You MUST play a card of the led suit if you hold one.
4. **THULLA:**
   - If you do NOT hold any card of the led suit, you can throw ANY card from your hand.
   - This hit is called a **THULLA**!
   - The player who played the highest card of the original led suit in this trick must pick up all cards on the table and add them to their hand.
   - The player who gave the Thulla gets the next lead.
5. **Safe Players:** Once you play your last card, you are Safe and exit the round. The game continues until only 1 player remains.
