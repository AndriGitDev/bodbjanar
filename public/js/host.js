// Connect to Socket.io server
const socket = io();

// Game state
let currentRoomCode = null;
let players = {};
let gameState = 'LOBBY';
let totalArtworks = 0;

// Audio context for sound effects
let audioContext = null;

// Helper: Play countdown beep
function playBeep(frequency = 800, duration = 100) {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration / 1000);
}

// DOM Elements
const screens = {
  lobby: document.getElementById('lobby-screen'),
  drawing: document.getElementById('drawing-screen'),
  auction: document.getElementById('auction-screen'),
  result: document.getElementById('result-screen'),
  leaderboard: document.getElementById('leaderboard-screen')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupHost();
  setupSocketListeners();
});

// Setup Host
function setupHost() {
  // Create room on load
  socket.emit('create_room');

  // Start Drawing button
  document.getElementById('startDrawingBtn').addEventListener('click', () => {
    socket.emit('start_drawing');
  });

  // Start Auction button
  document.getElementById('startAuctionBtn').addEventListener('click', () => {
    socket.emit('start_auction');
  });
}

// Setup Socket Listeners
function setupSocketListeners() {
  // Room created
  socket.on('room_created', (data) => {
    currentRoomCode = data.roomCode;
    document.getElementById('roomCode').textContent = currentRoomCode;

    // Set join URL
    const joinUrl = window.location.origin;
    document.getElementById('joinUrl').textContent = joinUrl;

    console.log(`Room created: ${currentRoomCode}`);
  });

  // Room update
  socket.on('room_update', (data) => {
    players = data.players;
    gameState = data.gameState;

    updatePlayersDisplay();

    // Enable start button if there are players
    const playerCount = Object.keys(players).length;
    document.getElementById('startDrawingBtn').disabled = playerCount === 0;
  });

  // Player joined
  socket.on('player_joined', (data) => {
    console.log(`Player joined: ${data.playerName}`);
    // Play a sound or animation here if desired
  });

  // Player left
  socket.on('player_left', (data) => {
    console.log(`Player left: ${data.playerName}`);
  });

  // Phase change
  socket.on('phase_change', (data) => {
    gameState = data.phase;

    if (data.phase === 'DRAWING') {
      switchScreen('drawing');
      const playerCount = Object.keys(players).length;
      document.getElementById('totalPlayers').textContent = playerCount;
      document.getElementById('submissionCount').textContent = '0';
    }
  });

  // Artwork submitted
  socket.on('artwork_submitted', (data) => {
    document.getElementById('submissionCount').textContent = data.totalSubmitted;
    document.getElementById('totalPlayers').textContent = data.totalExpected;
    totalArtworks = data.totalSubmitted;

    // Enable auction button when all artworks submitted
    if (data.totalSubmitted >= data.totalExpected && data.totalExpected > 0) {
      document.getElementById('startAuctionBtn').disabled = false;
    }
  });

  // Auction round start
  socket.on('start_auction_round', (data) => {
    const artwork = data.artwork;

    document.getElementById('auctionArtwork').src = artwork.imageData;
    document.getElementById('artistName').textContent = artwork.artistName;
    document.getElementById('currentRound').textContent = data.roundNumber;
    document.getElementById('totalRounds').textContent = data.totalRounds;

    // Reset auction display
    document.getElementById('currentBid').textContent = '$0';
    document.getElementById('highestBidder').textContent = 'None';
    document.getElementById('timeLeft').textContent = '15';

    switchScreen('auction');
  });

  // Auction update
  socket.on('auction_update', (data) => {
    document.getElementById('currentBid').textContent = `$${data.currentBid}`;
    document.getElementById('highestBidder').textContent = data.highestBidder || 'None';
    document.getElementById('timeLeft').textContent = data.timeLeft;
  });

  // Timer update
  socket.on('timer_update', (data) => {
    document.getElementById('timeLeft').textContent = data.timeLeft;

    // Display announcement if present
    const announcementEl = document.getElementById('announcement');
    if (data.announcement) {
      announcementEl.textContent = data.announcement;

      // Play different sounds for different announcements
      if (data.announcement === 'Going once...') {
        playBeep(600, 150);
      } else if (data.announcement === 'Going twice...') {
        playBeep(700, 150);
      } else if (data.announcement === 'SOLD!') {
        playBeep(1000, 300);
      }
    } else {
      announcementEl.textContent = '';

      // Play tick sound for last 10 seconds
      if (data.timeLeft <= 10 && data.timeLeft > 0) {
        playBeep(400, 50);
      }
    }
  });

  // Round result
  socket.on('round_result', (data) => {
    document.getElementById('resultArtwork').src = data.artwork.imageData;
    document.getElementById('soldTo').textContent = data.soldTo || 'No bids';
    document.getElementById('soldPrice').textContent = `$${data.soldPrice}`;
    document.getElementById('trueValue').textContent = `$${data.artwork.trueValue}`;

    const profit = data.profit;
    const profitElement = document.getElementById('profit');

    if (profit > 0) {
      profitElement.textContent = `+$${profit}`;
      profitElement.style.color = '#4CAF50';
    } else if (profit < 0) {
      profitElement.textContent = `-$${Math.abs(profit)}`;
      profitElement.style.color = '#f44336';
    } else {
      profitElement.textContent = `$0`;
      profitElement.style.color = '#ffd700';
    }

    switchScreen('result');

    // Auto-hide after showing result
    setTimeout(() => {
      // Will either show next auction or leaderboard
    }, 4500);
  });

  // Game over
  socket.on('game_over', (data) => {
    displayLeaderboard(data.results);
  });

  // Error handling
  socket.on('error', (data) => {
    console.error('Error:', data.message);
    alert(`Error: ${data.message}`);
  });
}

// Update players display
function updatePlayersDisplay() {
  const playersGrid = document.getElementById('playersGrid');
  const playerCount = Object.keys(players).length;

  document.getElementById('playerCount').textContent = playerCount;

  if (playerCount === 0) {
    playersGrid.innerHTML = `
      <div class="player-card" style="opacity: 0.5;">
        <h4>Waiting for players...</h4>
      </div>
    `;
    return;
  }

  playersGrid.innerHTML = '';

  Object.values(players).forEach(player => {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.innerHTML = `
      <img src="${player.avatar}" alt="${player.name}" style="width: 60px; height: 60px; border-radius: 50%; margin-bottom: 10px;">
      <h4>${player.name}</h4>
      <p style="margin: 5px 0; color: #4CAF50; font-weight: bold;">$${player.cash}</p>
    `;
    playersGrid.appendChild(card);
  });
}

// Display leaderboard
function displayLeaderboard(results) {
  const leaderboardList = document.getElementById('leaderboardList');
  leaderboardList.innerHTML = '';

  results.forEach((result, index) => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item' + (index === 0 ? ' first' : '');

    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;

    item.innerHTML = `
      <div class="rank">${medal}</div>
      <div class="player-info">
        <h3>${result.name}</h3>
        <p style="margin: 5px 0;">
          Cash: $${result.cash} | Portfolio: $${result.portfolioValue} | Artworks: ${result.artworkCount}
        </p>
      </div>
      <div class="score-info">
        <div class="net-worth">$${result.netWorth}</div>
        <div>Net Worth</div>
      </div>
    `;

    leaderboardList.appendChild(item);
  });

  switchScreen('leaderboard');
}

// Helper: Switch screen
function switchScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.add('hidden'));
  if (screens[screenName]) {
    screens[screenName].classList.remove('hidden');
  }
}
