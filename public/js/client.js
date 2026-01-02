// Connect to Socket.io server
const socket = io();

// Game state
let currentState = 'join';
let playerInfo = null;
let currentRoomCode = null;
let playerPrompts = [];
let currentPromptIndex = 0;
let submittedCount = 0;

// Canvas variables
let canvas, ctx;
let isDrawing = false;
let currentColor = '#000000';
let brushSize = 5;

// DOM Elements
const screens = {
  join: document.getElementById('join-screen'),
  lobby: document.getElementById('lobby-screen'),
  drawing: document.getElementById('drawing-screen'),
  waitingAuction: document.getElementById('waiting-auction-screen'),
  bidding: document.getElementById('bidding-screen'),
  result: document.getElementById('player-result-screen'),
  finalResults: document.getElementById('final-results-screen')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupJoinScreen();
  setupDrawingCanvas();
  setupSocketListeners();
});

// Setup Join Screen
function setupJoinScreen() {
  const joinBtn = document.getElementById('joinBtn');
  const playerNameInput = document.getElementById('playerName');
  const roomCodeInput = document.getElementById('roomCode');

  // Auto-uppercase room code
  roomCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  joinBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    const roomCode = roomCodeInput.value.trim().toUpperCase();

    if (!name) {
      showMessage('joinMessage', 'Please enter your name', 'error');
      return;
    }

    if (!roomCode || roomCode.length !== 4) {
      showMessage('joinMessage', 'Please enter a valid 4-letter room code', 'error');
      return;
    }

    // Attempt to join room
    socket.emit('join_room', { roomCode, name });
    joinBtn.disabled = true;
    joinBtn.textContent = 'Joining...';
  });

  // Allow Enter key to join
  playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') roomCodeInput.focus();
  });

  roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinBtn.click();
  });
}

// Setup Drawing Canvas
function setupDrawingCanvas() {
  canvas = document.getElementById('drawingCanvas');
  ctx = canvas.getContext('2d');

  // Set canvas size
  const container = canvas.parentElement;
  canvas.width = 400;
  canvas.height = 400;

  // Fill with white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Color picker
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentColor = btn.dataset.color;
    });
  });

  // Brush size
  const brushSizeSlider = document.getElementById('brushSize');
  const brushSizeDisplay = document.getElementById('brushSizeDisplay');

  brushSizeSlider.addEventListener('input', (e) => {
    brushSize = parseInt(e.target.value);
    brushSizeDisplay.textContent = brushSize;
  });

  // Drawing events
  let lastX = 0;
  let lastY = 0;

  function startDrawing(e) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches) {
      lastX = (e.touches[0].clientX - rect.left) * scaleX;
      lastY = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      lastX = (e.clientX - rect.left) * scaleX;
      lastY = (e.clientY - rect.top) * scaleY;
    }

    // Draw a dot at the tap location (for taps without dragging)
    ctx.beginPath();
    ctx.arc(lastX, lastY, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = currentColor;
    ctx.fill();
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let currentX, currentY;

    if (e.touches) {
      currentX = (e.touches[0].clientX - rect.left) * scaleX;
      currentY = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      currentX = (e.clientX - rect.left) * scaleX;
      currentY = (e.clientY - rect.top) * scaleY;
    }

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(currentX, currentY);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.stroke();

    lastX = currentX;
    lastY = currentY;
  }

  function stopDrawing() {
    isDrawing = false;
  }

  // Mouse events
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);

  // Touch events
  canvas.addEventListener('touchstart', startDrawing);
  canvas.addEventListener('touchmove', draw);
  canvas.addEventListener('touchend', stopDrawing);

  // Clear button
  document.getElementById('clearBtn').addEventListener('click', () => {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  });

  // Submit button
  document.getElementById('submitBtn').addEventListener('click', () => {
    const imageData = canvas.toDataURL('image/png');
    socket.emit('submit_drawing', { imageData });

    document.getElementById('submitBtn').disabled = true;
    document.getElementById('submitBtn').textContent = 'Submitting...';
  });
}

// Setup Socket Listeners
function setupSocketListeners() {
  // Join success
  socket.on('join_success', (data) => {
    playerInfo = data.playerInfo;
    currentRoomCode = data.roomCode;

    document.getElementById('displayName').textContent = playerInfo.name;
    document.getElementById('displayRoom').textContent = currentRoomCode;

    switchScreen('lobby');
    document.getElementById('joinBtn').disabled = false;
    document.getElementById('joinBtn').textContent = 'Join Game';
  });

  // Phase change
  socket.on('phase_change', (data) => {
    if (data.phase === 'DRAWING') {
      // Phase change happens, but we wait for prompts before showing screen
    }
  });

  // Receive prompts
  socket.on('receive_prompts', (data) => {
    playerPrompts = data.prompts;
    currentPromptIndex = 0;
    submittedCount = 0;

    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update prompt display
    updatePromptDisplay();

    // Show drawing screen
    switchScreen('drawing');

    // Re-enable submit button
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('submitBtn').textContent = 'Submit Art';
  });

  // Submit success
  socket.on('submit_success', (data) => {
    submittedCount = data.submittedCount;

    if (submittedCount < 2) {
      // More artworks to draw
      currentPromptIndex = submittedCount;

      // Clear canvas for next drawing
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Update prompt display
      updatePromptDisplay();

      // Re-enable submit button
      document.getElementById('submitBtn').disabled = false;
      document.getElementById('submitBtn').textContent = 'Submit Art';
    } else {
      // All artworks submitted
      switchScreen('waitingAuction');
    }
  });

  // Auction round start
  socket.on('start_auction_round', (data) => {
    const artwork = data.artwork;

    document.getElementById('biddingArtwork').src = artwork.imageData;
    document.getElementById('biddingArtist').textContent = artwork.artistName;
    document.getElementById('playerCash').textContent = `$${data.yourCash}`;

    // Show badge and hint based on whether it's your art
    const yourArtBadge = document.getElementById('yourArtBadge');
    const hintBox = document.querySelector('.hint-box');
    const hintText = document.getElementById('artworkHint');

    if (artwork.isYourArt) {
      yourArtBadge.classList.remove('hidden');
      hintBox.classList.add('hidden'); // Hide hint for artist
    } else {
      yourArtBadge.classList.add('hidden');
      hintBox.classList.remove('hidden');
      hintText.textContent = artwork.hint;
    }

    // Reset bid display
    document.getElementById('bidAmount').textContent = '$0';
    document.getElementById('bidLeader').textContent = 'None';
    document.getElementById('bidTimer').textContent = '15s';

    switchScreen('bidding');
  });

  // Auction update
  socket.on('auction_update', (data) => {
    document.getElementById('bidAmount').textContent = `$${data.currentBid}`;
    document.getElementById('bidLeader').textContent = data.highestBidder || 'None';
    document.getElementById('bidTimer').textContent = `${data.timeLeft}s`;
  });

  // Timer update
  socket.on('timer_update', (data) => {
    document.getElementById('bidTimer').textContent = `${data.timeLeft}s`;
  });

  // Round result
  socket.on('round_result', (data) => {
    document.getElementById('resultArtworkPlayer').src = data.artwork.imageData;

    let message = '';
    if (data.soldTo) {
      message = `Sold to ${data.soldTo} for $${data.soldPrice}!<br>`;
      message += `True Value: $${data.artwork.trueValue}<br>`;
      if (data.profit > 0) {
        message += `<span style="color: #4CAF50;">Profit: +$${data.profit}</span>`;
      } else if (data.profit < 0) {
        message += `<span style="color: #f44336;">Loss: -$${Math.abs(data.profit)}</span>`;
      } else {
        message += `Break even!`;
      }
    } else {
      message = 'No bids placed. Artwork remains unsold.';
    }

    document.getElementById('resultMessage').innerHTML = message;
    switchScreen('result');
  });

  // Game over
  socket.on('game_over', (data) => {
    const resultsContent = document.getElementById('finalResultsContent');

    let html = '<div style="margin-bottom: 20px;">';

    data.results.forEach((result, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
      const isYou = result.name === playerInfo.name;

      html += `
        <div style="background: rgba(255,255,255,${isYou ? '0.4' : '0.2'}); padding: 15px; border-radius: 10px; margin-bottom: 10px; ${isYou ? 'border: 3px solid #ffd700;' : ''}">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="font-size: 1.3rem;">${medal} ${result.name} ${isYou ? '(You)' : ''}</strong>
              <p style="margin: 5px 0; font-size: 0.9rem;">
                Cash: $${result.cash} | Portfolio: $${result.portfolioValue}
              </p>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #ffd700;">$${result.netWorth}</div>
              <div style="font-size: 0.9rem;">${result.artworkCount} artworks</div>
            </div>
          </div>
        </div>
      `;
    });

    html += '</div>';

    resultsContent.innerHTML = html;
    switchScreen('finalResults');
  });

  // Error handling
  socket.on('error', (data) => {
    showMessage('joinMessage', data.message, 'error');
    document.getElementById('joinBtn').disabled = false;
    document.getElementById('joinBtn').textContent = 'Join Game';
  });

  // Room closed
  socket.on('room_closed', (data) => {
    alert(data.message);
    location.reload();
  });
}

// Bidding buttons
document.getElementById('bid100Btn').addEventListener('click', () => {
  socket.emit('place_bid', { amount: 100 });
});

document.getElementById('bid500Btn').addEventListener('click', () => {
  socket.emit('place_bid', { amount: 500 });
});

// Helper: Switch screen
function switchScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
  currentState = screenName;
}

// Helper: Update prompt display
function updatePromptDisplay() {
  const promptElement = document.getElementById('currentPrompt');
  const progressElement = document.getElementById('promptProgress');

  if (promptElement && playerPrompts.length > 0) {
    promptElement.textContent = playerPrompts[currentPromptIndex];
  }

  if (progressElement) {
    progressElement.textContent = `Artwork ${currentPromptIndex + 1} of 2`;
  }
}

// Helper: Show message
function showMessage(elementId, message, type) {
  const msgElement = document.getElementById(elementId);
  msgElement.className = `message ${type}`;
  msgElement.textContent = message;
  msgElement.classList.remove('hidden');

  setTimeout(() => {
    msgElement.classList.add('hidden');
  }, 5000);
}
