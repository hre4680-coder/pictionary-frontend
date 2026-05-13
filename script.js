// ======================== KONEKSI SOCKET ========================
const socket = io('https://pictionary-backend-production.up.railway.app', {
  reconnection: true,
  reconnectionAttempts: 5
});

// State global
let currentRoom = null;
let username = '';
let isHost = false;
let canDraw = false;
let canvas, ctx;
let painting = false;
let lastX = 0, lastY = 0;
let currentColor = '#000000';
let currentLineWidth = 8;
let isEraser = false;

// Undo/Redo stack
let historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

// DOM elements
const lobbyDiv = document.getElementById('lobbySection');
const gameDiv = document.getElementById('gameSection');
const startBtn = document.getElementById('startGameBtn');
const phaseEl = document.getElementById('phaseDisplay');
const timerEl = document.getElementById('timerDisplay');
const roomCodeSpan = document.getElementById('roomCodeDisplay');
const chatDiv = document.getElementById('chatMessages');
const playerListDiv = document.getElementById('playerListContainer');
const playerCountSpan = document.getElementById('playerCount');

// Setting room
let roomSettings = { duration: 60, maxRounds: 3 };

// Voting state
let votingImages = [];
let currentVoteIndex = 0;
let myVotes = [];
let currentRating = 0;
let autoNextTimer = null;

// ======================== INISIALISASI CANVAS ========================
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('drawCanvas');
  ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = currentLineWidth;
  setupCanvasEvents();
  saveHistoryState(); // simpan keadaan awal (canvas kosong)
});

function setupCanvasEvents() {
  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let cx, cy;
    if (e.touches) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = e.clientX; cy = e.clientY; }
    let x = (cx - rect.left) * scaleX;
    let y = (cy - rect.top) * scaleY;
    x = Math.min(Math.max(0, x), canvas.width);
    y = Math.min(Math.max(0, y), canvas.height);
    return { x, y };
  };
  const start = (e) => {
    if (!canDraw) return;
    e.preventDefault();
    painting = true;
    const pos = getPos(e);
    lastX = pos.x; lastY = pos.y;
    ctx.beginPath();
  };
  const draw = (e) => {
    if (!painting || !canDraw) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastX = pos.x; lastY = pos.y;
  };
  const stop = () => {
    if (painting) {
      painting = false;
      saveHistoryState();
    }
  };
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stop);
  canvas.addEventListener('mouseleave', stop);
  canvas.addEventListener('touchstart', start);
  canvas.addEventListener('touchmove', draw);
  canvas.addEventListener('touchend', stop);
}

// ======================== UNDO / REDO ========================
function saveHistoryState() {
  const imageData = canvas.toDataURL();
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(imageData);
  if (historyStack.length > MAX_HISTORY) historyStack.shift();
  historyIndex = historyStack.length - 1;
}
function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    restoreFromHistory();
  }
}
function redo() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    restoreFromHistory();
  }
}
function restoreFromHistory() {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = historyStack[historyIndex];
}

// ======================== TOOLBAR ========================
function changeColor(color) {
  currentColor = color;
  isEraser = false;
  ctx.strokeStyle = color;
}
function updateBrushSize(size) {
  currentLineWidth = parseInt(size);
  document.getElementById('brushSizeValue').innerText = size;
  ctx.lineWidth = currentLineWidth;
  if (isEraser) ctx.strokeStyle = '#ffffff';
  else ctx.strokeStyle = currentColor;
}
function setEraser() {
  isEraser = true;
  ctx.strokeStyle = '#ffffff';
}
function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  saveHistoryState();
}

// ======================== PILIHAN BACKGROUND (MODAL COLOR PICKER) ========================
function openBgPicker() {
  const modalHtml = `
    <div id="bgModal" class="modal">
      <div class="modal-content">
        <h3>Pilih Warna Background</h3>
        <input type="color" id="bgColorPicker" value="#ffffff" style="width:100%; margin:16px 0;">
        <button onclick="applyBgColor()" class="btn-gold">Terapkan</button>
        <button onclick="closeBgModal()" class="tool-btn">Batal</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}
function applyBgColor() {
  const color = document.getElementById('bgColorPicker').value;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  saveHistoryState();
  closeBgModal();
}
function closeBgModal() {
  const modal = document.getElementById('bgModal');
  if (modal) modal.remove();
}

// ======================== SETTING ROOM (HOST ONLY) ========================
function openSettings() {
  if (!isHost) {
    alert('Hanya host yang bisa mengatur room!');
    return;
  }
  const modalHtml = `
    <div id="settingsModal" class="modal">
      <div class="modal-content">
        <h3>⚙ Pengaturan Room</h3>
        <label>Durasi Menggambar (detik)</label>
        <select id="setDuration">
          <option value="30" ${roomSettings.duration === 30 ? 'selected' : ''}>30 detik</option>
          <option value="60" ${roomSettings.duration === 60 ? 'selected' : ''}>60 detik</option>
          <option value="90" ${roomSettings.duration === 90 ? 'selected' : ''}>90 detik</option>
          <option value="120" ${roomSettings.duration === 120 ? 'selected' : ''}>120 detik</option>
        </select>
        <label>Jumlah Ronde</label>
        <select id="setRounds">
          <option value="1" ${roomSettings.maxRounds === 1 ? 'selected' : ''}>1 ronde</option>
          <option value="2" ${roomSettings.maxRounds === 2 ? 'selected' : ''}>2 ronde</option>
          <option value="3" ${roomSettings.maxRounds === 3 ? 'selected' : ''}>3 ronde</option>
          <option value="4" ${roomSettings.maxRounds === 4 ? 'selected' : ''}>4 ronde</option>
          <option value="5" ${roomSettings.maxRounds === 5 ? 'selected' : ''}>5 ronde</option>
        </select>
        <button onclick="saveSettings()" class="btn-gold" style="margin-top:16px;">Simpan</button>
        <button onclick="closeModal()" class="tool-btn">Batal</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}
function saveSettings() {
  roomSettings.duration = parseInt(document.getElementById('setDuration').value);
  roomSettings.maxRounds = parseInt(document.getElementById('setRounds').value);
  closeModal();
  sendSystemMessage(`Host mengubah setting: ${roomSettings.duration} dt, ${roomSettings.maxRounds} ronde`);
}
function closeModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.remove();
}
function sendSystemMessage(msg) {
  socket.emit('chat', { roomCode: currentRoom, username: '🎮 Sistem', message: msg });
}

// ======================== SOCKET EVENTS ========================
socket.on('connect', () => console.log('✅ Terhubung ke server'));
socket.on('connect_error', (err) => alert('Koneksi gagal: ' + err.message));

socket.on('roomCreated', (roomCode) => {
  currentRoom = roomCode;
  isHost = true;
  showGameUI(roomCode);
  phaseEl.textContent = 'Menunggu mulai';
  canDraw = false;
  startBtn.style.display = 'inline-block';
});
socket.on('joinedRoom', (roomCode) => {
  currentRoom = roomCode;
  isHost = false;
  showGameUI(roomCode);
  phaseEl.textContent = 'Menunggu mulai';
  canDraw = false;
  startBtn.style.display = 'none';
});
socket.on('playerList', (players) => {
  playerListDiv.innerHTML = players.map(p => `<span class="player-badge">${escapeHtml(p.username)}</span>`).join('');
  playerCountSpan.textContent = players.length;
});
socket.on('gameStarted', (data) => {
  phaseEl.textContent = '🎨 MENGGAMBAR!';
  canDraw = true;
  addChatMessage('Sistem', `Mulai menggambar! Durasi ${data.duration} detik, ${data.maxRounds} ronde`);
});
socket.on('timerUpdate', (seconds) => {
  timerEl.textContent = seconds < 10 ? '0' + seconds : seconds;
  if (seconds <= 5) timerEl.style.color = '#ff5e6e';
  else timerEl.style.color = '#FF8A5C';
});
socket.on('timeoutDrawing', () => {
  canDraw = false;
  phaseEl.textContent = '⏳ Mengirim gambar...';
  const imageData = canvas.toDataURL();
  socket.emit('submitDrawing', { roomCode: currentRoom, imageData });
  addChatMessage('Sistem', 'Waktu habis! Gambar dikirim ke penilai.');
});
socket.on('votingStart', ({ images }) => {
  phaseEl.textContent = '⭐ VOTING! Beri rating untuk setiap gambar';
  canDraw = false;
  votingImages = images;
  currentVoteIndex = 0;
  myVotes = new Array(images.length).fill(null);
  showVotingCard();
});
socket.on('winnerResult', ({ winners }) => {
  showWinnerModal(winners);
});
socket.on('nextRound', ({ round, maxRounds }) => {
  phaseEl.textContent = `🎨 RONDE ${round} / ${maxRounds}`;
  canDraw = true;
  clearCanvas();
  addChatMessage('Sistem', `Memulai ronde ${round} dari ${maxRounds}`);
});
socket.on('gameEnded', ({ winner, allScores }) => {
  let scoreList = allScores.map(p => `${p.username}: ${p.score} poin`).join('\n');
  alert(`🏆 GAME SELESAI! Pemenang: ${winner.username}\nSkor akhir:\n${scoreList}`);
  location.reload();
});
socket.on('clearAllCanvas', () => {
  clearCanvas();
});
socket.on('chat', (data) => addChatMessage(data.username, data.message));
socket.on('error', (msg) => alert(msg));

// ======================== VOTING DENGAN AUTO-NEXT 5 DETIK ========================
function showVotingCard() {
  if (autoNextTimer) clearTimeout(autoNextTimer);
  const img = votingImages[currentVoteIndex];
  const modalHtml = `
    <div id="votingOverlay" class="voting-overlay">
      <div class="voting-card">
        <h3>Rating Gambar dari <strong>${escapeHtml(img.username)}</strong></h3>
        <p id="autoNextInfo" style="font-size:12px; color:#aaa;">⭐ Akan otomatis ke gambar berikutnya dalam 5 detik</p>
        <img src="${img.imageData}" />
        <div class="rating-stars" id="voteStars">
          <i class="far fa-star" data-rate="1"></i>
          <i class="far fa-star" data-rate="2"></i>
          <i class="far fa-star" data-rate="3"></i>
          <i class="far fa-star" data-rate="4"></i>
          <i class="far fa-star" data-rate="5"></i>
        </div>
        <div class="vote-nav">
          <button onclick="prevVote()" class="tool-btn" ${currentVoteIndex === 0 ? 'disabled' : ''}>◀ Sebelumnya</button>
          <button onclick="nextVote()" class="tool-btn" ${currentVoteIndex === votingImages.length-1 ? 'disabled' : ''}>Berikutnya ▶</button>
        </div>
        <button onclick="submitCurrentVote()" class="btn-gold" style="margin-top:16px;">Kirim Rating</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const stars = document.querySelectorAll('#voteStars i');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      const rate = parseInt(star.dataset.rate);
      currentRating = rate;
      stars.forEach((s, idx) => {
        if (idx < rate) s.className = 'fas fa-star selected';
        else s.className = 'far fa-star';
      });
      resetAutoNextTimer();
    });
  });
  
  if (myVotes[currentVoteIndex] !== null) {
    currentRating = myVotes[currentVoteIndex];
    stars.forEach((s, idx) => {
      if (idx < currentRating) s.className = 'fas fa-star selected';
      else s.className = 'far fa-star';
    });
  } else {
    currentRating = 0;
  }
  startAutoNextTimer();
}

function startAutoNextTimer() {
  if (autoNextTimer) clearTimeout(autoNextTimer);
  autoNextTimer = setTimeout(() => {
    if (document.getElementById('votingOverlay')) {
      // Simpan rating jika sudah dipilih
      if (myVotes[currentVoteIndex] === null && currentRating > 0) {
        myVotes[currentVoteIndex] = currentRating;
        socket.emit('submitVote', {
          roomCode: currentRoom,
          targetPlayerId: votingImages[currentVoteIndex].playerId,
          rating: currentRating
        });
      }
      if (currentVoteIndex < votingImages.length - 1) {
        nextVote();
      } else {
        document.getElementById('votingOverlay')?.remove();
        addChatMessage('Sistem', 'Terima kasih! Menunggu hasil...');
      }
    }
  }, 5000);
}
function resetAutoNextTimer() {
  if (autoNextTimer) clearTimeout(autoNextTimer);
  startAutoNextTimer();
}
function prevVote() {
  if (autoNextTimer) clearTimeout(autoNextTimer);
  if (currentVoteIndex > 0) {
    if (myVotes[currentVoteIndex] === null && currentRating > 0) {
      myVotes[currentVoteIndex] = currentRating;
      socket.emit('submitVote', {
        roomCode: currentRoom,
        targetPlayerId: votingImages[currentVoteIndex].playerId,
        rating: currentRating
      });
    }
    document.getElementById('votingOverlay').remove();
    currentVoteIndex--;
    showVotingCard();
  }
}
function nextVote() {
  if (autoNextTimer) clearTimeout(autoNextTimer);
  if (currentVoteIndex < votingImages.length - 1) {
    if (myVotes[currentVoteIndex] === null && currentRating > 0) {
      myVotes[currentVoteIndex] = currentRating;
      socket.emit('submitVote', {
        roomCode: currentRoom,
        targetPlayerId: votingImages[currentVoteIndex].playerId,
        rating: currentRating
      });
    }
    document.getElementById('votingOverlay').remove();
    currentVoteIndex++;
    showVotingCard();
  }
}
function submitCurrentVote() {
  if (autoNextTimer) clearTimeout(autoNextTimer);
  if (currentRating === 0) {
    alert('Pilih bintang dulu!');
    return;
  }
  myVotes[currentVoteIndex] = currentRating;
  socket.emit('submitVote', {
    roomCode: currentRoom,
    targetPlayerId: votingImages[currentVoteIndex].playerId,
    rating: currentRating
  });
  if (currentVoteIndex < votingImages.length - 1) {
    nextVote();
  } else {
    document.getElementById('votingOverlay')?.remove();
    addChatMessage('Sistem', 'Terima kasih! Menunggu hasil...');
  }
}

// ======================== WINNER MODAL ========================
function showWinnerModal(winners) {
  const podiumHtml = winners.map((w, idx) => {
    let medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : '🥉');
    return `
      <div class="podium-item">
        <div class="medal">${medal}</div>
        <strong>${escapeHtml(w.username)}</strong>
        <div>⭐ ${w.averageRating}</div>
        <img src="${w.imageData}" style="width:100px; border-radius:12px; margin-top:8px;" />
      </div>
    `;
  }).join('');
  const modalHtml = `
    <div id="winnerModal" class="winner-modal">
      <div class="winner-card">
        <h2>🏆 Pemenang Ronde Ini 🏆</h2>
        <div class="podium">${podiumHtml}</div>
        <button onclick="continueToNextRound()" class="btn-gold" style="margin-top:20px;">Lanjut ke Ronde Berikutnya</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}
function continueToNextRound() {
  document.getElementById('winnerModal')?.remove();
  socket.emit('continueToNextRound', currentRoom);
}

// ======================== FUNGSI UI ========================
function showGameUI(roomCode) {
  lobbyDiv.classList.add('hidden');
  gameDiv.classList.remove('hidden');
  roomCodeSpan.innerHTML = `🔑 Kode: <strong style="color:#fbbf24;">${roomCode}</strong>`;
}
function addChatMessage(sender, msg) {
  const div = document.createElement('div');
  div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(msg)}`;
  chatDiv.appendChild(div);
  chatDiv.scrollTop = chatDiv.scrollHeight;
}
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
}

// ======================== GAME ACTIONS ========================
function createRoom() {
  username = document.getElementById('username').value.trim();
  if (username === '') username = 'Pemain_' + Math.floor(Math.random() * 1000);
  socket.emit('createRoom', username);
}
function joinRoom() {
  username = document.getElementById('username').value.trim();
  if (username === '') username = 'Pemain_' + Math.floor(Math.random() * 1000);
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!code) return alert('Masukkan kode room');
  socket.emit('joinRoom', { roomCode: code, username });
}
function startGame() {
  if (isHost && currentRoom) {
    socket.emit('startGame', { roomCode: currentRoom, settings: roomSettings });
  } else {
    alert('Hanya host yang bisa memulai lomba!');
  }
}
function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (msg && currentRoom) {
    socket.emit('chat', { roomCode: currentRoom, username, message: msg });
    input.value = '';
  }
}

// ======================== EKSPOR KE GLOBAL ========================
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.startGame = startGame;
window.sendChat = sendChat;
window.undo = undo;
window.redo = redo;
window.clearCanvas = clearCanvas;
window.changeColor = changeColor;
window.updateBrushSize = updateBrushSize;
window.setEraser = setEraser;
window.openBgPicker = openBgPicker;
window.applyBgColor = applyBgColor;
window.closeBgModal = closeBgModal;
window.openSettings = openSettings;
window.saveSettings = saveSettings;
window.closeModal = closeModal;
window.prevVote = prevVote;
window.nextVote = nextVote;
window.submitCurrentVote = submitCurrentVote;
window.continueToNextRound = continueToNextRound;
window.sendSystemMessage = sendSystemMessage;