// ======================== KONEKSI SOCKET ========================
const socket = io('https://pictionary-backend-production.up.railway.app', { reconnection: true });

// State global
let currentRoom = null;
let username = '';
let isHost = false;
let canDraw = false;          // apakah boleh menggambar
let canvas, ctx;
let painting = false;
let lastX = 0, lastY = 0;
let currentColor = '#000000';
let lineWidth = 8;
let isEraser = false;

// Stack untuk undo
let canvasStack = [];
let stackIndex = -1;
const MAX_STACK = 50;

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

// Inisialisasi canvas
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('myCanvas');
  ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = lineWidth;
  setupCanvasEvents();
  saveCanvasState(); // simpan state awal
});

// ======================== CANVAS UNDO & BACKGROUND ========================
function saveCanvasState() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Hapus state setelah index jika kita undo lalu gambar baru
  if (stackIndex < canvasStack.length - 1) {
    canvasStack = canvasStack.slice(0, stackIndex + 1);
  }
  canvasStack.push(imageData);
  if (canvasStack.length > MAX_STACK) canvasStack.shift();
  stackIndex = canvasStack.length - 1;
}

function restoreCanvasState(index) {
  if (index >= 0 && index < canvasStack.length) {
    ctx.putImageData(canvasStack[index], 0, 0);
    stackIndex = index;
  }
}

function undo() {
  if (stackIndex > 0) {
    restoreCanvasState(stackIndex - 1);
  }
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Atur background sesuai pilihan
  applyBackground();
  saveCanvasState();
}

function applyBackground() {
  const bg = document.getElementById('bgSelect').value;
  const temp = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (bg === 'white') ctx.fillStyle = '#ffffff';
  else if (bg === 'black') ctx.fillStyle = '#000000';
  else if (bg === 'grid') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }
    return;
  } else if (bg === 'paper') {
    ctx.fillStyle = '#f5e6d3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // texture sederhana
    ctx.fillStyle = '#d9c2a7';
    for (let i = 0; i < 200; i++) {
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
    }
    return;
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // restore gambar lama
  ctx.putImageData(temp, 0, 0);
}

function changeBackground(value) {
  // simpan gambar saat ini
  const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (value === 'white') ctx.fillStyle = '#ffffff';
  else if (value === 'black') ctx.fillStyle = '#000000';
  else if (value === 'grid') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }
    ctx.putImageData(current, 0, 0);
    saveCanvasState();
    return;
  } else if (value === 'paper') {
    ctx.fillStyle = '#f5e6d3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#d9c2a7';
    for (let i = 0; i < 200; i++) {
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
    }
    ctx.putImageData(current, 0, 0);
    saveCanvasState();
    return;
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.putImageData(current, 0, 0);
  saveCanvasState();
}

// ======================== CANVAS DRAWING ========================
function setupCanvasEvents() {
  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    let cx, cy;
    if (e.touches) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = e.clientX; cy = e.clientY; }
    let x = (cx - rect.left) * sx;
    let y = (cy - rect.top) * sy;
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
      saveCanvasState(); // simpan setelah selesai coretan
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

function changeColor(c) { currentColor = c; isEraser = false; ctx.strokeStyle = c; }
function updateBrushSize(s) { lineWidth = parseInt(s); document.getElementById('brushSizeValue').innerText = s; ctx.lineWidth = lineWidth; if(isEraser) ctx.strokeStyle='#ffffff'; else ctx.strokeStyle=currentColor; }
function setEraser() { isEraser = true; ctx.strokeStyle = '#ffffff'; }

// ======================== SOCKET EVENTS ========================
socket.on('connect', () => console.log('✅ Terhubung ke server'));
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
socket.on('gameStarted', (settings) => {
  phaseEl.textContent = '🎨 MENGGAMBAR!';
  canDraw = true;
  addChatMessage('Sistem', `Mulai menggambar! Durasi ${settings.duration} detik`);
  clearCanvas(); // reset canvas baru
});
socket.on('timerUpdate', (sec) => { timerEl.textContent = sec < 10 ? '0'+sec : sec; if(sec<=5) timerEl.style.color='#ff5e6e'; });
socket.on('timeoutDrawing', () => {
  canDraw = false;
  phaseEl.textContent = '⏳ Mengirim gambar...';
  const imageData = canvas.toDataURL();
  socket.emit('submitDrawing', { roomCode: currentRoom, imageData });
  addChatMessage('Sistem', 'Waktu habis! Gambar dikirim.');
});
socket.on('votingPhase', (data) => {
  // data = { images: [{playerId, username, imageData}] }
  phaseEl.textContent = '⭐ VOTING! Beri rating';
  startRatingSlider(data.images);
});
socket.on('winnerResult', (winners) => {
  // winners = [{rank:1, username, imageData, avgRating}, ...]
  showWinnerModal(winners);
});
socket.on('nextRound', (round) => {
  phaseEl.textContent = `🎨 RONDE ${round}`;
  canDraw = true;
  clearCanvas();
  closeModals();
});
socket.on('gameEnded', (finalWinner) => {
  alert(`🏆 GAME SELESAI! Juara Umum: ${finalWinner.username}`);
  location.reload();
});
socket.on('chat', (data) => addChatMessage(data.username, data.message));
socket.on('error', (msg) => alert(msg));

// ======================== UI HELPERS ========================
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
function escapeHtml(str) { return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }

// ======================== GAME CONTROLS ========================
function createRoom() {
  username = document.getElementById('username').value.trim() || 'Pemain_'+Math.floor(Math.random()*1000);
  socket.emit('createRoom', username);
}
function joinRoom() {
  username = document.getElementById('username').value.trim() || 'Pemain_'+Math.floor(Math.random()*1000);
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if(!code) return alert('Masukkan kode room');
  socket.emit('joinRoom', { roomCode: code, username });
}
function startGame() {
  if(isHost && currentRoom) {
    // ambil setting dari modal (bisa simpan di local variable)
    const duration = parseInt(document.getElementById('setDuration')?.value || 60);
    const rounds = parseInt(document.getElementById('setRounds')?.value || 3);
    socket.emit('startGame', currentRoom, { duration, maxRounds: rounds });
  } else alert('Hanya host yang bisa memulai');
}
function sendChat() {
  const inp = document.getElementById('chatInput');
  const msg = inp.value.trim();
  if(msg && currentRoom) {
    socket.emit('chat', { roomCode: currentRoom, username, message: msg });
    inp.value = '';
  }
}

// ======================== SETTING ROOM (HOST) ========================
function openSettings() {
  if (!isHost) return alert('Hanya host yang bisa mengatur room');
  // buat modal setting
  let modal = document.getElementById('settingsModal');
  if (!modal) {
    const html = `
      <div id="settingsModal" class="modal">
        <div class="modal-content">
          <h3>⚙ Pengaturan Room</h3>
          <label>Durasi menggambar (detik)</label>
          <select id="setDuration" style="margin:10px 0; width:100%; padding:8px;">
            <option value="30">30 detik</option>
            <option value="60" selected>60 detik</option>
            <option value="90">90 detik</option>
            <option value="120">120 detik</option>
          </select>
          <label>Jumlah Ronde</label>
          <select id="setRounds" style="margin:10px 0; width:100%; padding:8px;">
            <option value="1">1 ronde</option>
            <option value="2">2 ronde</option>
            <option value="3" selected>3 ronde</option>
            <option value="4">4 ronde</option>
            <option value="5">5 ronde</option>
          </select>
          <button onclick="window.saveSettings()" class="btn-gold">Simpan</button>
          <button onclick="window.closeSettings()" class="tool-btn" style="margin-top:8px;">Tutup</button>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  } else {
    modal.style.display = 'flex';
  }
}
function saveSettings() {
  closeSettings();
  addChatMessage('Sistem', 'Pengaturan room telah disimpan.');
}
function closeSettings() {
  const modal = document.getElementById('settingsModal');
  if(modal) modal.style.display = 'none';
}

// ======================== RATING SLIDER (per gambar dengan animasi) ========================
let currentRatingIndex = 0;
let ratingImages = [];
let ratingResults = []; // simpan rating per gambar { targetPlayerId, rating }

function startRatingSlider(images) {
  ratingImages = images;
  ratingResults = [];
  currentRatingIndex = 0;
  showRatingCard();
}

function showRatingCard() {
  if (currentRatingIndex >= ratingImages.length) {
    // selesai rating, kirim hasil ke server
    socket.emit('submitVotes', { roomCode: currentRoom, votes: ratingResults });
    closeRatingSlider();
    return;
  }
  const img = ratingImages[currentRatingIndex];
  const cardHtml = `
    <div id="ratingSlider" class="rating-slider">
      <div class="rating-card">
        <h3>⭐ Rating Gambar</h3>
        <p>Peserta: <strong>${escapeHtml(img.username)}</strong></p>
        <img src="${img.imageData}" />
        <div class="rating-stars" id="ratingStars">
          <i class="far fa-star" data-rate="1"></i>
          <i class="far fa-star" data-rate="2"></i>
          <i class="far fa-star" data-rate="3"></i>
          <i class="far fa-star" data-rate="4"></i>
          <i class="far fa-star" data-rate="5"></i>
        </div>
        <button id="submitRatingBtn" class="btn-gold">Kirim Rating</button>
        <div style="margin-top:12px;">${currentRatingIndex+1} / ${ratingImages.length}</div>
      </div>
    </div>
  `;
  // hapus jika ada
  closeRatingSlider();
  document.body.insertAdjacentHTML('beforeend', cardHtml);
  // attach event stars
  const stars = document.querySelectorAll('#ratingStars i');
  let selectedRate = 0;
  stars.forEach(star => {
    star.addEventListener('click', () => {
      const rate = parseInt(star.dataset.rate);
      selectedRate = rate;
      stars.forEach((s, idx) => {
        if(idx < rate) s.className = 'fas fa-star selected';
        else s.className = 'far fa-star';
      });
    });
  });
  document.getElementById('submitRatingBtn').addEventListener('click', () => {
    if(selectedRate === 0) return alert('Pilih bintang dulu!');
    ratingResults.push({ targetPlayerId: img.playerId, rating: selectedRate });
    currentRatingIndex++;
    showRatingCard(); // animasi pindah gambar
  });
}

function closeRatingSlider() {
  const el = document.getElementById('ratingSlider');
  if(el) el.remove();
}

function showWinnerModal(winners) {
  // winners: [{rank, username, imageData, avgRating}]
  closeModals();
  let winnerHtml = `<div id="winnerModal" class="modal"><div class="modal-content" style="max-width:500px;"><h2>🏆 HASIL AKHIR 🏆</h2>`;
  winners.forEach(w => {
    winnerHtml += `
      <div style="margin:16px 0; border-bottom:1px solid #fbbf24;">
        <h3>Juara ${w.rank}: ${escapeHtml(w.username)}</h3>
        <img src="${w.imageData}" style="max-width:100%; border-radius:16px; margin:8px 0;" />
        <p>⭐ Rata-rata: ${w.avgRating}</p>
      </div>
    `;
  });
  winnerHtml += `<button onclick="window.continueGame()" class="btn-gold">Lanjut ke Ronde Berikutnya</button></div></div>`;
  document.body.insertAdjacentHTML('beforeend', winnerHtml);
}

function continueGame() {
  socket.emit('continueGame', currentRoom);
  closeModals();
}

function closeModals() {
  const modals = document.querySelectorAll('.modal');
  modals.forEach(m => m.remove());
  closeRatingSlider();
}

// Ekspose ke global
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.startGame = startGame;
window.sendChat = sendChat;
window.undo = undo;
window.clearCanvas = clearCanvas;
window.changeBackground = changeBackground;
window.changeColor = changeColor;
window.updateBrushSize = updateBrushSize;
window.setEraser = setEraser;
window.openSettings = openSettings;
window.saveSettings = saveSettings;
window.closeSettings = closeSettings;
window.continueGame = continueGame;