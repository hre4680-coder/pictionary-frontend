// ================== KONFIGURASI UTAMA ==================
const socket = io('https://zuw2qt2d.up.railway.app', {
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 10000,
});

let currentRoom = null;
let username = '';
let isDrawing = false;
let canvas, ctx;
let painting = false;
let lastX = 0;
let lastY = 0;

// ================== INISIALISASI ==================
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('canvas');
  if (canvas) {
    ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 8;
  }

  console.log('🚀 Frontend siap');
});

// ================== SOCKET CONNECTION ==================
socket.on('connect', () => {
  console.log('✅ Socket TERHUBUNG - ID:', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('❌ Gagal connect ke server:', err.message);
});

socket.on('disconnect', () => {
  console.warn('⚠️ Socket terputus');
});

// ================== ROOM HANDLING ==================
function createRoom() {
  username = document.getElementById('username').value.trim();
  if (!username) username = 'Player' + Math.floor(Math.random() * 999);

  console.log(`📤 Mengirim createRoom → Nama: ${username}`);

  if (!socket.connected) {
    alert('❌ Belum terhubung ke server. Refresh halaman!');
    return;
  }

  socket.emit('createRoom', username);
}

function joinRoom() {
  username = document.getElementById('username').value.trim() || 'Player' + Math.floor(Math.random() * 999);
  const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();

  if (!roomCode) {
    alert('Masukkan kode room!');
    return;
  }

  socket.emit('joinRoom', { roomCode, username });
}

// ================== CANVAS DRAWING ==================
function setupCanvas() {
  if (!canvas) return;

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);

  // Touch support (HP)
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e.touches[0]); });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e.touches[0]); });
  canvas.addEventListener('touchend', endDraw);
}

function startDraw(e) {
  if (!isDrawing) return;
  painting = true;
  const pos = getPos(e);
  lastX = pos.x;
  lastY = pos.y;
}

function draw(e) {
  if (!painting || !isDrawing) return;

  const pos = getPos(e);

  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();

  socket.emit('drawing', {
    roomCode: currentRoom,
    lastX: lastX,
    lastY: lastY,
    x: pos.x,
    y: pos.y,
    color: ctx.strokeStyle,
    lineWidth: ctx.lineWidth
  });

  lastX = pos.x;
  lastY = pos.y;
}

function endDraw() {
  painting = false;
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

// ================== SOCKET RECEIVER ==================
socket.on('roomCreated', (roomCode) => {
  console.log('🎉 ROOM BERHASIL DIBUAT:', roomCode);
  currentRoom = roomCode;

  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  document.getElementById('roomDisplay').textContent = roomCode;

  isDrawing = true;
  setupCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('joinedRoom', (roomCode) => {
  console.log('✅ Berhasil join room:', roomCode);
  currentRoom = roomCode;

  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  document.getElementById('roomDisplay').textContent = roomCode;

  isDrawing = false;
  setupCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('drawing', (data) => {
  if (!ctx) return;
  ctx.strokeStyle = data.color || '#000';
  ctx.lineWidth = data.lineWidth || 8;

  ctx.beginPath();
  ctx.moveTo(data.lastX, data.lastY);
  ctx.lineTo(data.x, data.y);
  ctx.stroke();
});

socket.on('clearCanvas', () => {
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('error', (msg) => {
  alert('Error: ' + msg);
});

// ================== FUNGSI LAIN ==================
function clearCanvas() {
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (currentRoom) socket.emit('clearCanvas', currentRoom);
}

function sendChat() {
  const input = document.getElementById('message');
  if (!input.value.trim() || !currentRoom) return;

  socket.emit('chat', {
    roomCode: currentRoom,
    username: username,
    message: input.value.trim()
  });
  input.value = '';
}

// Enter key untuk chat
document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && document.getElementById('message') === document.activeElement) {
    sendChat();
  }
});

// ================== TOOLBAR ==================
function changeColor(color) {
  if (ctx) ctx.strokeStyle = color;
}

function changeLineWidth(width) {
  if (ctx) ctx.lineWidth = parseInt(width);
}