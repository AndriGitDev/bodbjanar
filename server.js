/**
 * Boðbjánar - Multiplayer Art Auction Game Server
 *
 * This server handles room creation, player management, drawing phases,
 * and real-time auction logic using Socket.io.
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const MAX_IMAGE_SIZE = 200 * 1024; // 200KB

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage for rooms
const rooms = {};

/**
 * List of drawing prompts randomly assigned to players.
 * @type {string[]}
 */
const DRAWING_PROMPTS = [
  "A cat riding a skateboard",
  "Chilling on a beach",
  "A superhero saving the day",
  "A delicious pizza",
  "A haunted house",
  "A rocket ship to Mars",
  "A magical forest",
  "A monster under the bed",
  "A fancy dinner party",
  "A snowman in summer",
  "A dragon hoarding treasure",
  "A robot doing yoga",
  "A pirate ship battle",
  "A unicorn at a rave",
  "An alien's first day on Earth",
  "A bear fishing",
  "A time machine",
  "A dance party",
  "A castle in the clouds",
  "A ninja doing laundry",
  "A mermaid's coffee shop",
  "A vampire at the dentist",
  "A wizard's potion lab",
  "An octopus playing drums",
  "A penguin's birthday party"
];

/**
 * Selects a random prompt that hasn't been used yet in the current room.
 * @param {string[]} usedPrompts - List of prompts already assigned.
 * @returns {string} A drawing prompt.
 */
function getRandomPrompt(usedPrompts = []) {
  const availablePrompts = DRAWING_PROMPTS.filter(p => !usedPrompts.includes(p));
  if (availablePrompts.length === 0) return DRAWING_PROMPTS[0]; // Fallback
  return availablePrompts[Math.floor(Math.random() * availablePrompts.length)];
}

/**
 * Generates a unique 4-letter uppercase room code.
 * @returns {string} The generated room code.
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Check if code already exists
  if (rooms[code]) {
    return generateRoomCode(); // Recursive retry
  }
  return code;
}

/**
 * Generates a random "true value" for an artwork between $100 and $10,000.
 * @returns {number} The generated value.
 */
function generateTrueValue() {
  return Math.floor(Math.random() * 9900) + 100; // 100-10000
}

/**
 * Generates a descriptive hint based on the artwork's true value.
 * @param {number} trueValue - The actual value of the artwork.
 * @returns {string} A hint string.
 */
function generateHint(trueValue) {
  if (trueValue > 8000) return "Masterpiece - Critics are raving!";
  if (trueValue > 6000) return "Excellent - Strong market potential";
  if (trueValue > 4000) return "Good - Solid investment";
  if (trueValue > 2000) return "Average - Market is uncertain";
  if (trueValue > 500) return "Below Average - Risky investment";
  return "Trash - Market rejection likely";
}

// Rate limiting map
const messageCounts = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const MAX_MESSAGES_PER_WINDOW = 10;

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Simple rate limiting middleware
  socket.use((packet, next) => {
    const now = Date.now();
    const stats = messageCounts.get(socket.id) || { count: 0, lastReset: now };

    if (now - stats.lastReset > RATE_LIMIT_WINDOW) {
      stats.count = 1;
      stats.lastReset = now;
    } else {
      stats.count++;
    }

    messageCounts.set(socket.id, stats);

    if (stats.count > MAX_MESSAGES_PER_WINDOW) {
      console.warn(`Rate limit exceeded for socket ${socket.id}`);
      return next(new Error('Rate limit exceeded. Please slow down.'));
    }
    next();
  });

  // Host creates a room
  socket.on('create_room', () => {
    const roomCode = generateRoomCode();

    rooms[roomCode] = {
      roomId: roomCode,
      gameState: 'LOBBY',
      hostSocketId: socket.id,
      players: {},
      artworks: [],
      auctionState: {
        currentArtIndex: 0,
        currentBid: 0,
        highestBidderId: null,
        highestBidderName: null,
        timer: 15
      }
    };

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.isHost = true;

    console.log(`Room created: ${roomCode} by ${socket.id}`);

    socket.emit('room_created', {
      roomCode: roomCode,
      message: 'Room created successfully'
    });
  });

  // Player joins a room
  socket.on('join_room', ({ roomCode, name }) => {
    roomCode = roomCode.toUpperCase().trim();

    // Sanitize and limit name
    name = name ? name.toString().trim().substring(0, 15) : 'Anonymous';

    if (!rooms[roomCode]) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (rooms[roomCode].gameState !== 'LOBBY') {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }

    // Add player to room
    rooms[roomCode].players[socket.id] = {
      socketId: socket.id,
      name: name,
      cash: 5000,
      inventory: [],
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${socket.id}`
    };

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerName = name;
    socket.isHost = false;

    console.log(`Player ${name} (${socket.id}) joined room ${roomCode}`);

    // Notify all clients in the room about the update
    io.to(roomCode).emit('room_update', {
      players: rooms[roomCode].players,
      gameState: rooms[roomCode].gameState
    });

    // Notify host specifically about new player
    if (rooms[roomCode].hostSocketId) {
      io.to(rooms[roomCode].hostSocketId).emit('player_joined', {
        playerId: socket.id,
        playerName: name
      });
    }

    socket.emit('join_success', {
      roomCode: roomCode,
      playerInfo: rooms[roomCode].players[socket.id]
    });
  });

  // Host starts the drawing phase
  socket.on('start_drawing', () => {
    const roomCode = socket.roomCode;

    if (!roomCode || !rooms[roomCode] || rooms[roomCode].hostSocketId !== socket.id) {
      socket.emit('error', { message: 'Not authorized' });
      return;
    }

    rooms[roomCode].gameState = 'DRAWING';
    rooms[roomCode].artworks = []; // Reset artworks

    // Assign 2 prompts to each player
    const usedPrompts = [];
    Object.keys(rooms[roomCode].players).forEach(playerId => {
      const prompt1 = getRandomPrompt(usedPrompts);
      usedPrompts.push(prompt1);
      const prompt2 = getRandomPrompt(usedPrompts);
      usedPrompts.push(prompt2);

      rooms[roomCode].players[playerId].prompts = [prompt1, prompt2];
      rooms[roomCode].players[playerId].submittedCount = 0;

      // Send prompts to the player
      io.to(playerId).emit('receive_prompts', {
        prompts: [prompt1, prompt2]
      });
    });

    console.log(`Drawing phase started in room ${roomCode}`);

    io.to(roomCode).emit('phase_change', {
      phase: 'DRAWING',
      message: 'Time to create your masterpieces!'
    });
  });

  // Player submits artwork
  socket.on('submit_drawing', ({ imageData }) => {
    const roomCode = socket.roomCode;

    // Validate image data size
    if (imageData && imageData.length > MAX_IMAGE_SIZE) {
      socket.emit('error', { message: 'Image data too large' });
      return;
    }

    if (!roomCode || !rooms[roomCode]) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (rooms[roomCode].gameState !== 'DRAWING') {
      socket.emit('error', { message: 'Not in drawing phase' });
      return;
    }

    const player = rooms[roomCode].players[socket.id];

    // Check if player already submitted 2 artworks
    if (player.submittedCount >= 2) {
      socket.emit('error', { message: 'Already submitted all artworks' });
      return;
    }

    // Get the current prompt for this submission
    const prompt = player.prompts[player.submittedCount];
    const trueValue = generateTrueValue();

    const artwork = {
      id: `art_${Date.now()}_${socket.id}`,
      artistSocketId: socket.id,
      artistName: socket.playerName,
      imageData: imageData,
      trueValue: trueValue,
      prompt: prompt, // The actual drawing prompt
      soldTo: null,
      soldPrice: 0
    };

    rooms[roomCode].artworks.push(artwork);
    player.submittedCount++;

    console.log(`Artwork ${player.submittedCount}/2 submitted by ${socket.playerName} in room ${roomCode} (${prompt})`);

    socket.emit('submit_success', {
      message: `Artwork ${player.submittedCount}/2 submitted!`,
      submittedCount: player.submittedCount,
      totalRequired: 2
    });

    // Notify host about submission
    const totalExpected = Object.keys(rooms[roomCode].players).length * 2;
    io.to(rooms[roomCode].hostSocketId).emit('artwork_submitted', {
      artistName: socket.playerName,
      totalSubmitted: rooms[roomCode].artworks.length,
      totalExpected: totalExpected
    });
  });

  // Host starts the auction phase
  socket.on('start_auction', () => {
    const roomCode = socket.roomCode;

    if (!roomCode || !rooms[roomCode] || rooms[roomCode].hostSocketId !== socket.id) {
      socket.emit('error', { message: 'Not authorized' });
      return;
    }

    if (rooms[roomCode].artworks.length === 0) {
      socket.emit('error', { message: 'No artworks to auction' });
      return;
    }

    rooms[roomCode].gameState = 'BIDDING';
    rooms[roomCode].auctionState = {
      currentArtIndex: 0,
      currentBid: 0,
      highestBidderId: null,
      highestBidderName: null,
      timer: 15
    };

    console.log(`Auction started in room ${roomCode}`);

    startAuctionRound(roomCode);
  });

  // Player places a bid
  socket.on('place_bid', ({ amount }) => {
    const roomCode = socket.roomCode;

    if (!roomCode || !rooms[roomCode]) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (rooms[roomCode].gameState !== 'BIDDING') {
      socket.emit('error', { message: 'Not in bidding phase' });
      return;
    }

    const player = rooms[roomCode].players[socket.id];
    const auctionState = rooms[roomCode].auctionState;
    const newBid = auctionState.currentBid + amount;

    // Validate player has enough cash
    if (player.cash < newBid) {
      socket.emit('error', { message: 'Not enough cash!' });
      return;
    }

    // Validate bid is higher than current
    if (amount <= 0) {
      socket.emit('error', { message: 'Invalid bid amount' });
      return;
    }

    // Update auction state
    auctionState.currentBid = newBid;
    auctionState.highestBidderId = socket.id;
    auctionState.highestBidderName = player.name;
    auctionState.timer = 10; // Reset timer to 10s (anti-snipe)

    console.log(`Bid placed: $${newBid} by ${player.name} in room ${roomCode}`);

    // Broadcast update to all clients
    io.to(roomCode).emit('auction_update', {
      currentBid: auctionState.currentBid,
      highestBidder: auctionState.highestBidderName,
      timeLeft: auctionState.timer
    });
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    messageCounts.delete(socket.id);

    const roomCode = socket.roomCode;

    if (!roomCode || !rooms[roomCode]) return;

    // If host disconnects, close the room
    if (socket.isHost && rooms[roomCode].hostSocketId === socket.id) {
      console.log(`Host disconnected, closing room ${roomCode}`);
      io.to(roomCode).emit('room_closed', {
        message: 'Host has disconnected. Game ended.'
      });
      delete rooms[roomCode];
      return;
    }

    // If player disconnects, remove from room
    if (rooms[roomCode].players[socket.id]) {
      const playerName = rooms[roomCode].players[socket.id].name;
      delete rooms[roomCode].players[socket.id];

      console.log(`Player ${playerName} left room ${roomCode}`);

      io.to(roomCode).emit('room_update', {
        players: rooms[roomCode].players,
        gameState: rooms[roomCode].gameState
      });

      if (rooms[roomCode].hostSocketId) {
        io.to(rooms[roomCode].hostSocketId).emit('player_left', {
          playerName: playerName
        });
      }
    }
  });
});

/**
 * Initializes and starts a new auction round for the next artwork in the room.
 * @param {string} roomCode - The room code.
 */
function startAuctionRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const currentArt = room.artworks[room.auctionState.currentArtIndex];

  if (!currentArt) {
    // No more artworks, end auction
    endAuction(roomCode);
    return;
  }

  room.auctionState.currentBid = 0;
  room.auctionState.highestBidderId = null;
  room.auctionState.highestBidderName = null;
  room.auctionState.timer = 15;

  console.log(`Starting auction round ${room.auctionState.currentArtIndex + 1} in room ${roomCode}`);

  // Send artwork to host (without hint and true value)
  io.to(room.hostSocketId).emit('start_auction_round', {
    artwork: {
      id: currentArt.id,
      artistName: currentArt.artistName,
      imageData: currentArt.imageData
    },
    roundNumber: room.auctionState.currentArtIndex + 1,
    totalRounds: room.artworks.length
  });

  // Send artwork to all players
  Object.keys(room.players).forEach(playerId => {
    const isArtist = playerId === currentArt.artistSocketId;

    // Generate hint: for non-artists, show the prompt + value
    let hint = null;
    if (!isArtist) {
      hint = `${currentArt.prompt} is worth $${currentArt.trueValue}`;
    }

    io.to(playerId).emit('start_auction_round', {
      artwork: {
        id: currentArt.id,
        artistName: currentArt.artistName,
        imageData: currentArt.imageData,
        hint: hint, // Only shown to non-artists
        isYourArt: isArtist
      },
      roundNumber: room.auctionState.currentArtIndex + 1,
      totalRounds: room.artworks.length,
      yourCash: room.players[playerId].cash
    });
  });

  // Start countdown timer
  startAuctionTimer(roomCode);
}

/**
 * Starts the countdown timer for the current auction round.
 * Handles "Going once/twice/SOLD" announcements.
 * @param {string} roomCode - The room code.
 */
function startAuctionTimer(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.gameState !== 'BIDDING') return;

  const timerInterval = setInterval(() => {
    if (!rooms[roomCode] || rooms[roomCode].gameState !== 'BIDDING') {
      clearInterval(timerInterval);
      return;
    }

    room.auctionState.timer--;

    // Countdown announcements
    let announcement = null;
    if (room.auctionState.timer === 5) {
      announcement = 'Going once...';
    } else if (room.auctionState.timer === 3) {
      announcement = 'Going twice...';
    } else if (room.auctionState.timer === 0) {
      announcement = 'SOLD!';
    }

    // Always broadcast timer update with announcement
    io.to(roomCode).emit('timer_update', {
      timeLeft: room.auctionState.timer,
      announcement: announcement
    });

    if (room.auctionState.timer <= 0) {
      clearInterval(timerInterval);
      endAuctionRound(roomCode);
    }
  }, 1000);
}

/**
 * Ends the current auction round, determines the winner, and updates balances.
 * @param {string} roomCode - The room code.
 */
function endAuctionRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const currentArt = room.artworks[room.auctionState.currentArtIndex];
  const winnerId = room.auctionState.highestBidderId;
  const finalPrice = room.auctionState.currentBid;

  console.log(`Auction round ended in room ${roomCode}`);

  if (winnerId && room.players[winnerId]) {
    // Deduct cash from winner
    room.players[winnerId].cash -= finalPrice;

    // Add artwork to winner's inventory
    room.players[winnerId].inventory.push(currentArt);

    // Update artwork
    currentArt.soldTo = winnerId;
    currentArt.soldPrice = finalPrice;

    console.log(`Artwork sold to ${room.players[winnerId].name} for $${finalPrice}`);
  } else {
    console.log(`No bids placed for artwork ${currentArt.id}`);
  }

  // Broadcast round result
  io.to(roomCode).emit('round_result', {
    artwork: {
      imageData: currentArt.imageData,
      artistName: currentArt.artistName,
      trueValue: currentArt.trueValue
    },
    soldTo: winnerId ? room.players[winnerId].name : null,
    soldPrice: finalPrice,
    profit: winnerId ? (currentArt.trueValue - finalPrice) : 0
  });

  // Move to next artwork after a delay
  setTimeout(() => {
    room.auctionState.currentArtIndex++;

    if (room.auctionState.currentArtIndex < room.artworks.length) {
      startAuctionRound(roomCode);
    } else {
      endAuction(roomCode);
    }
  }, 5000); // 5 second delay to show results
}

/**
 * Concludes the auction phase and calculates final scores for all players.
 * @param {string} roomCode - The room code.
 */
function endAuction(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  room.gameState = 'SCORING';

  console.log(`Game ended in room ${roomCode}`);

  // Calculate final scores
  const results = Object.values(room.players).map(player => {
    const portfolioValue = player.inventory.reduce((sum, art) => sum + art.trueValue, 0);
    const netWorth = player.cash + portfolioValue;

    return {
      name: player.name,
      cash: player.cash,
      portfolioValue: portfolioValue,
      netWorth: netWorth,
      artworkCount: player.inventory.length
    };
  });

  // Sort by net worth descending
  results.sort((a, b) => b.netWorth - a.netWorth);

  io.to(roomCode).emit('game_over', {
    results: results,
    artworks: room.artworks
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`Boðbjánar server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}/host.html to host a game`);
  console.log(`Visit http://localhost:${PORT} to join as a player`);
});
