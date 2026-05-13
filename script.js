// ================== KONFIGURASI SOCKET ==================
const socket = io('https://pictionary-backend-production.up.railway.app', {
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 10000
});

let currentRoom = null;
let username = '';
let isDrawing = false;
let canvas, ctx;
let painting = false;
let lastX = 0, lastY = 0;
let currentColor = '#000000';
let currentLineWidth = 8;
let isEraser = false;

// ================== INISIALISASI ==================
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
  
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = currentLineWidth;

  setupCanvasEvents();
  console.log('🎨 Lomba Gambar UI siap!');
});

// ================== SOCKET CONNECTION ==================
socket.on('connect', () => {
  console.log('✅ Terhubung ke server');
});

socket.on('roomCreated', (roomCode) => {
  currentRoom = roomCode;
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  document.getElementById('phaseDisplay').textContent = 'Menunggu Host Mulai';
});

socket.on('joinedRoom', (roomCode) => {
  currentRoom = roomCode;
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'block';
});

socket.on('gameStarted', () => {
  document.getElementById('phaseDisplay').textContent = '🖌️ WAKTU MENGGAMBAR!';
});

socket.on('timerUpdate', (timeLeft) => {
  const timerEl = document.getElementById('timerDisplay');
  timerEl.textContent = timeLeft < 10 ? '0' + timeLeft : timeLeft;
  
  if (timeLeft <= 10) timerEl.style.color = '#ff4757';
});

socket.on('phaseChange', (data) => {
  document.getElementById('phaseDisplay').textContent = data.phase === 'voting' 
    ? '⭐ WAKTU VOTING!' : '🖌️ WAKTU MENGGAMBAR!';
});

socket.on('drawing', (data) => {
  if (!ctx) return;
  ctx.strokeStyle = data.color;
  ctx.lineWidth = data.lineWidth;
  ctx.beginPath();
  ctx.moveTo(data.lastX, data.lastY);
  ctx.lineTo(data.x, data.y);
  ctx.stroke();
});

socket.on('clearCanvas', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('chat', (data) => {
  const chatDiv = document.getElementById('chat');
  const msgHTML = `<div><strong>${data.username}:</strong> ${data.message}</div>`;
  chatDiv.innerHTML += msgHTML;
  chatDiv.scrollTop = chatDiv.scrollHeight;
});

socket.on('error', (msg) => alert(msg));

// ================== CANVAS DRAWING ==================
function setupCanvasEvents() {
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);

  // Touch Support (HP)
  canvas.addEventListener('touchstart', e => { e.preventDefault(); startDrawing(e.touches[0]); });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); draw(e.touches[0]); });
  canvas.addEventListener('touchend', stopDrawing);
}

function startDrawing(e) {
  if (!isDrawing) return;
  painting = true;
  const pos = getMousePos(e);
  lastX = pos.x;
  lastY = pos.y;
}

function draw(e) {
  if (!painting || !isDrawing) return;
  const pos = getMousePos(e);

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
    color: isEraser ? '#ffffff' : currentColor,
    lineWidth: currentLineWidth
  });

  lastX = pos.x;
  lastY = pos.y;
}

function stopDrawing() {
  painting = false;
}

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

// ================== TOOLBAR FUNCTIONS ==================
function changeColor(color) {
  currentColor = color;
  isEraser = false;
  ctx.strokeStyle = color;
}

function changeBrushSize(size) {
  currentLineWidth = parseInt(size);
  document.getElementById('brushSizeValue').textContent = size;
  ctx.lineWidth = currentLineWidth;
  isEraser = false;
}

function setEraser() {
  isEraser = true;
  ctx.strokeStyle = '#ffffff'; // warna putih = penghapus
}

// ================== GAME FUNCTIONS ==================
function createRoom() {
  username = document.getElementById('username').value.trim() || 'Player' + Math.floor(Math.random() * 1000);
  socket.emit('createRoom', username);
}

function joinRoom() {
  username = document.getElementById('username').value.trim() || 'Player' + Math.floor(Math.random() * 1000);
  const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
  
  if (!roomCode) return alert('Masukkan kode room!');
  socket.emit('joinRoom', { roomCode, username });
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (currentRoom) socket.emit('clearCanvas', currentRoom);
}

function sendChat() {
  const input = document.getElementById('message');
  const msg = input.value.trim();
  
  if (msg && currentRoom) {
    socket.emit('chat', {
      roomCode: currentRoom,
      username: username,
      message: msg
    });
    input.value = '';
  }
}