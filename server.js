const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage for rooms
const rooms = {};

// Helper function to generate 4-letter room code
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

// Helper function to generate true value for artwork
function generateTrueValue() {
  return Math.floor(Math.random() * 9900) + 100; // 100-10000
}

// Helper function to generate hint based on true value
function generateHint(trueValue) {
  if (trueValue > 8000) return "Masterpiece - Critics are raving!";
  if (trueValue > 6000) return "Excellent - Strong market potential";
  if (trueValue > 4000) return "Good - Solid investment";
  if (trueValue > 2000) return "Average - Market is uncertain";
  if (trueValue > 500) return "Below Average - Risky investment";
  return "Trash - Market rejection likely";
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

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
      cash: 1000,
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

    console.log(`Drawing phase started in room ${roomCode}`);

    io.to(roomCode).emit('phase_change', {
      phase: 'DRAWING',
      message: 'Time to create your masterpiece!'
    });
  });

  // Player submits artwork
  socket.on('submit_drawing', ({ imageData }) => {
    const roomCode = socket.roomCode;

    if (!roomCode || !rooms[roomCode]) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (rooms[roomCode].gameState !== 'DRAWING') {
      socket.emit('error', { message: 'Not in drawing phase' });
      return;
    }

    // Check if player already submitted
    const existingArt = rooms[roomCode].artworks.find(art => art.artistSocketId === socket.id);
    if (existingArt) {
      socket.emit('error', { message: 'Already submitted artwork' });
      return;
    }

    const trueValue = generateTrueValue();
    const hint = generateHint(trueValue);

    const artwork = {
      id: `art_${Date.now()}_${socket.id}`,
      artistSocketId: socket.id,
      artistName: socket.playerName,
      imageData: imageData,
      trueValue: trueValue,
      hint: hint,
      soldTo: null,
      soldPrice: 0
    };

    rooms[roomCode].artworks.push(artwork);

    console.log(`Artwork submitted by ${socket.playerName} in room ${roomCode}`);

    socket.emit('submit_success', {
      message: 'Artwork submitted successfully!'
    });

    // Notify host about submission
    io.to(rooms[roomCode].hostSocketId).emit('artwork_submitted', {
      artistName: socket.playerName,
      totalSubmitted: rooms[roomCode].artworks.length,
      totalPlayers: Object.keys(rooms[roomCode].players).length
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

// Helper function to start an auction round
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

  // Send artwork to all players (with hint but not true value)
  Object.keys(room.players).forEach(playerId => {
    const isArtist = playerId === currentArt.artistSocketId;
    io.to(playerId).emit('start_auction_round', {
      artwork: {
        id: currentArt.id,
        artistName: currentArt.artistName,
        imageData: currentArt.imageData,
        hint: currentArt.hint,
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

// Auction timer
function startAuctionTimer(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.gameState !== 'BIDDING') return;

  const timerInterval = setInterval(() => {
    if (!rooms[roomCode] || rooms[roomCode].gameState !== 'BIDDING') {
      clearInterval(timerInterval);
      return;
    }

    room.auctionState.timer--;

    if (room.auctionState.timer <= 0) {
      clearInterval(timerInterval);
      endAuctionRound(roomCode);
    } else {
      // Broadcast timer update
      io.to(roomCode).emit('timer_update', {
        timeLeft: room.auctionState.timer
      });
    }
  }, 1000);
}

// End current auction round
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

// End auction and show final scores
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
  console.log(`Art Auction server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}/host.html to host a game`);
  console.log(`Visit http://localhost:${PORT} to join as a player`);
});
