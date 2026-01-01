# 🎨 Boðbjánar - Multiplayer Art Auction Game

A Jackbox-style multiplayer web game where players create art and bid on each other's creations in a real-time auction.

## 🎮 Game Overview

**Boðbjánar** is a local multiplayer party game built with Node.js and Socket.io. One player hosts the game on a laptop/TV (the "Host Display"), while other players join using their mobile devices as controllers.

### Game Flow

1. **Lobby** - Players join using a 4-letter room code
2. **Drawing Phase** - Each player receives 2 random prompts and creates 2 artworks
3. **Auction Phase** - Players bid on artworks. Non-artists see hints like "A cat riding a skateboard is worth $3500" and must guess if the artwork matches
4. **Scoring** - Winner is determined by net worth (remaining cash + portfolio value)

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start the server
npm start
```

The server will start on `http://localhost:3000`

### How to Play

1. **Host**: Open `http://localhost:3000/host.html` on a laptop/TV
   - A 4-letter room code will be displayed

2. **Players**: Open `http://localhost:3000` on mobile devices
   - Enter your name and the room code to join

3. **Start Game**: Host clicks "Start Game" when all players have joined

4. **Create Art**: Players draw on their mobile canvas

5. **Auction**: Bid on artworks using the hint system to guess true values

6. **Win**: Player with highest net worth wins!

## 🏗️ Architecture

### Tech Stack

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla JavaScript (no frameworks)
- **Styling**: CSS Grid/Flexbox, mobile-first design
- **State Management**: Server-authoritative (clients are "dumb terminals")

### Project Structure

```
bodbjanar/
├── server.js              # Node.js server with Socket.io logic
├── package.json           # Dependencies
├── public/
│   ├── index.html         # Player/client view
│   ├── host.html          # Host/display view
│   ├── css/
│   │   └── styles.css     # Shared styles
│   └── js/
│       ├── client.js      # Player-side logic
│       └── host.js        # Host-side logic
└── README.md
```

## 🎯 Features

### Implemented

- ✅ Room creation with 4-letter codes
- ✅ Real-time player join/leave
- ✅ Touch-enabled drawing canvas with 8 colors
- ✅ Color picker and brush size controls
- ✅ **25 unique drawing prompts** randomly assigned to players
- ✅ **2 artworks per player** for extended gameplay
- ✅ Automatic artwork valuation system
- ✅ **Deduction-based hint system** - non-artists see "Prompt is worth $X"
- ✅ Real-time bidding with anti-snipe timer reset
- ✅ **Countdown announcements**: "Going once... Going twice... SOLD!"
- ✅ **Sound effects** for countdown and auction events
- ✅ Cash management and inventory tracking
- ✅ Portfolio value calculation
- ✅ Leaderboard with rankings

### Game Mechanics

- Starting cash: $1000 per player
- Artworks per player: 2 (from random prompts)
- Artwork values: $100 - $10,000 (randomly generated)
- Bid increments: +$100 or +$500
- Auction timer: 15 seconds (resets to 10s on new bid)
- Hint system: Non-artists see the prompt + value, must guess if artwork matches
- Announcements: "Going once..." (5s), "Going twice..." (3s), "SOLD!" (1s)
- Winners determined by: Cash + Portfolio Value

## 🔧 Development

### Run in Development Mode

```bash
# Install nodemon (auto-restart on file changes)
npm install -g nodemon

# Run with auto-reload
npm run dev
```

### Deployment (VPS)

1. **Install Node.js on VPS**

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. **Clone and Setup**

```bash
git clone <your-repo>
cd art-auction-game
npm install
```

3. **Run with PM2** (process manager)

```bash
sudo npm install -g pm2
pm2 start server.js --name "art-auction"
pm2 startup
pm2 save
```

4. **Configure Nginx Reverse Proxy**

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

5. **Enable and Restart Nginx**

```bash
sudo ln -s /etc/nginx/sites-available/art-auction /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 🎨 Socket Events Reference

### Client → Server

- `create_room()` - Host creates a new game room
- `join_room(roomCode, name)` - Player joins a room
- `submit_drawing(imageData)` - Player submits artwork
- `place_bid(amount)` - Player places a bid
- `start_drawing()` - Host starts drawing phase
- `start_auction()` - Host starts auction phase

### Server → Client

- `room_created(roomCode)` - Room successfully created
- `room_update(players, gameState)` - Player list updated
- `phase_change(phase)` - Game phase changed
- `start_auction_round(artwork, roundNumber)` - New auction round
- `auction_update(currentBid, highestBidder, timer)` - Bid placed
- `round_result(artwork, soldTo, soldPrice, profit)` - Round ended
- `game_over(results)` - Game finished, show leaderboard

## 📝 License

MIT

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

---

Built with ❤️ for game nights!