// ================== KONEKSI ==================
const socket = io('https://pictionary-backend-production.up.railway.app', {
  reconnection: true,
  reconnectionAttempts: 5,
  timeout: 10000
});

// State
let currentRoom = null;
let username = '';
let isDrawingAllowed = false;
let isHost = false;
let canvas, ctx;
let painting = false;
let lastX = 0, lastY = 0;
let currentColor = '#000000';
let currentLineWidth = 8;
let isEraser = false;

// DOM elements
let lobbyDiv, gameDiv, startBtn, phaseEl, timerEl, roomCodeSpan, chatDiv;

// Inisialisasi saat halaman siap
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('drawCanvas');
  if (canvas) {
    ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentLineWidth;
    setupCanvasEvents();
  } else {
    console.error('Canvas tidak ditemukan!');
  }

  lobbyDiv = document.getElementById('lobbySection');
  gameDiv = document.getElementById('gameSection');
  startBtn = document.getElementById('startGameBtn');
  phaseEl = document.getElementById('phaseDisplay');
  timerEl = document.getElementById('timerDisplay');
  roomCodeSpan = document.getElementById('roomCodeDisplay');
  chatDiv = document.getElementById('chatMessages');

  console.log('✅ DOM siap');
});

// Fungsi tampilkan game UI dengan kode room
function showGameUI(roomCode) {
  if (!lobbyDiv || !gameDiv) return;
  lobbyDiv.classList.add('hidden');
  gameDiv.classList.remove('hidden');
  if (roomCodeSpan) {
    roomCodeSpan.innerHTML = `🔑 Kode Room: <strong style="color:#fbbf24;">${roomCode}</strong>`;
  } else {
    // Fallback kalau elemen tidak ada
    alert(`✅ Room berhasil! Kode: ${roomCode}\nSimpan kode ini untuk ajak teman.`);
  }
  // Simpan ke localStorage biar bisa dilihat
  localStorage.setItem('lastRoomCode', roomCode);
}

// ================== SOCKET EVENTS ==================
socket.on('connect', () => {
  console.log('✅ Socket terhubung ke server');
});

socket.on('connect_error', (err) => {
  console.error('❌ Koneksi gagal:', err.message);
  alert('Gagal terhubung ke server. Periksa koneksi internet atau server backend.');
});

socket.on('roomCreated', (roomCode) => {
  console.log('✅ roomCreated event diterima, kode:', roomCode);
  currentRoom = roomCode;
  isHost = true;
  showGameUI(roomCode);
  if (startBtn) startBtn.style.display = 'inline-block';
  if (phaseEl) phaseEl.textContent = 'Menunggu Host Mulai';
  isDrawingAllowed = false;
});

socket.on('joinedRoom', (roomCode) => {
  console.log('✅ joinedRoom event, kode:', roomCode);
  currentRoom = roomCode;
  isHost = false;
  showGameUI(roomCode);
  if (startBtn) startBtn.style.display = 'none';
  if (phaseEl) phaseEl.textContent = 'Menunggu dimulai...';
  isDrawingAllowed = false;
});

socket.on('gameStarted', () => {
  console.log('🎮 Game started');
  if (phaseEl) phaseEl.textContent = '🎨 WAKTU MENGGAMBAR!';
  isDrawingAllowed = true;
  addChatMessage('Sistem', 'Lomba dimulai! Mulai menggambar!');
});

socket.on('timerUpdate', (seconds) => {
  if (timerEl) timerEl.textContent = seconds < 10 ? '0' + seconds : seconds;
});

socket.on('phaseChange', (data) => {
  if (data.phase === 'voting') {
    if (phaseEl) phaseEl.textContent = '⭐ WAKTU VOTING!';
    isDrawingAllowed = false;
    addChatMessage('Sistem', 'Fase voting, tidak bisa menggambar.');
  } else if (data.phase === 'drawing') {
    if (phaseEl) phaseEl.textContent = '🖌️ WAKTU MENGGAMBAR!';
    isDrawingAllowed = true;
  }
});

socket.on('drawing', (data) => {
  if (!ctx) return;
  ctx.save();
  ctx.strokeStyle = data.color;
  ctx.lineWidth = data.lineWidth;
  ctx.beginPath();
  ctx.moveTo(data.lastX, data.lastY);
  ctx.lineTo(data.x, data.y);
  ctx.stroke();
  ctx.restore();
});

socket.on('clearCanvas', () => {
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('chat', (data) => {
  addChatMessage(data.username, data.message);
});

socket.on('error', (msg) => {
  alert('Error: ' + msg);
  console.error(msg);
});

// ================== CANVAS ==================
function setupCanvasEvents() {
  if (!canvas) return;
  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if (e.touches) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    let x = (clientX - rect.left) * scaleX;
    let y = (clientY - rect.top) * scaleY;
    x = Math.min(Math.max(0, x), canvas.width);
    y = Math.min(Math.max(0, y), canvas.height);
    return { x, y };
  };

  const start = (e) => {
    if (!isDrawingAllowed) return;
    e.preventDefault();
    painting = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
    ctx.beginPath();
  };
  const draw = (e) => {
    if (!painting || !isDrawingAllowed) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    socket.emit('drawing', {
      roomCode: currentRoom,
      lastX, lastY,
      x: pos.x, y: pos.y,
      color: isEraser ? '#ffffff' : currentColor,
      lineWidth: currentLineWidth
    });
    lastX = pos.x;
    lastY = pos.y;
  };
  const stop = () => { painting = false; };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stop);
  canvas.addEventListener('mouseleave', stop);
  canvas.addEventListener('touchstart', start);
  canvas.addEventListener('touchmove', draw);
  canvas.addEventListener('touchend', stop);
}

// ================== FUNGSI TOOL & GAME ==================
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
  if (!currentRoom) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit('clearCanvas', currentRoom);
}
function createRoom() {
  const nameInput = document.getElementById('username');
  username = nameInput.value.trim();
  if (username === '') username = 'Pemain_' + Math.floor(Math.random() * 1000);
  console.log('createRoom emit, username:', username);
  socket.emit('createRoom', username);
}
function joinRoom() {
  const nameInput = document.getElementById('username');
  username = nameInput.value.trim();
  if (username === '') username = 'Pemain_' + Math.floor(Math.random() * 1000);
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!code) return alert('Masukkan kode room!');
  console.log('joinRoom emit', code, username);
  socket.emit('joinRoom', { roomCode: code, username });
}
function startGame() {
  if (isHost && currentRoom) {
    socket.emit('startGame', currentRoom);
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
function addChatMessage(sender, msg) {
  if (!chatDiv) return;
  const div = document.createElement('div');
  div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(msg)}`;
  chatDiv.appendChild(div);
  chatDiv.scrollTop = chatDiv.scrollHeight;
}
function escapeHtml(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}
function openSettings() { alert('Pengaturan tema akan segera hadir!'); }
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.startGame = startGame;
window.clearCanvas = clearCanvas;
window.changeColor = changeColor;
window.updateBrushSize = updateBrushSize;
window.setEraser = setEraser;
window.sendChat = sendChat;
window.openSettings = openSettings;