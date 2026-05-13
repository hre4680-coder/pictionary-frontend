// ================== KONFIGURASI ==================
const socket = io('https://pictionary-backend.up.railway.app', {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

let currentRoom = null;
let username = '';
let isDrawing = false;
let canvas, ctx;
let lastX = 0;
let lastY = 0;

// ================== INISIALISASI ==================
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
  
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 5;

  // Event Listener Canvas
  setupCanvasEvents();
});

// ================== SOCKET CONNECTION DEBUG ==================
socket.on('connect', () => {
  console.log('✅ Socket Connected! ID:', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('❌ Socket Connection Error:', err.message);
});

socket.on('disconnect', () => {
  console.warn('⚠️ Socket Disconnected');
});

// ================== ROOM HANDLING ==================
function createRoom() {
  username = document.getElementById('username').value.trim();
  if (!username) username = 'Player' + Math.floor(Math.random() * 1000);

  console.log('📤 Mengirim createRoom:', username);
  socket.emit('createRoom', username);
}

function joinRoom() {
  username = document.getElementById('username').value.trim();
  if (!username) username = 'Player' + Math.floor(Math.random() * 1000);

  const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
  
  if (!roomCode) {
    alert('Masukkan kode room!');
    return;
  }

  console.log('📤 Join room:', roomCode);
  socket.emit('joinRoom', { roomCode, username });
}

// ================== CANVAS DRAWING ==================
function setupCanvasEvents() {
  let painting = false;

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);

  // Support untuk HP / Touch
  canvas.addEventListener('touchstart', handleTouchStart);
  canvas.addEventListener('touchmove', handleTouchMove);
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

  // Kirim ke server
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

// Touch Support
function handleTouchStart(e) {
  e.preventDefault();
  if (!isDrawing) return;
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousedown', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  canvas.dispatchEvent(mouseEvent);
}

function handleTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousemove', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  canvas.dispatchEvent(mouseEvent);
}

// ================== SOCKET LISTENERS ==================
socket.on('roomCreated', (roomCode) => {
  console.log('✅ Room berhasil dibuat:', roomCode);
  currentRoom = roomCode;
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  document.getElementById('roomDisplay').textContent = roomCode;
  
  isDrawing = true;
  initCanvasForNewGame();
});

socket.on('joinedRoom', (roomCode) => {
  console.log('✅ Berhasil join room:', roomCode);
  currentRoom = roomCode;
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  document.getElementById('roomDisplay').textContent = roomCode;
  
  isDrawing = false; // pemain biasa tidak langsung bisa gambar
  initCanvasForNewGame();
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
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('error', (msg) => {
  alert(msg);
});

// ================== HELPER FUNCTIONS ==================
function initCanvasForNewGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 5;
}

function clearCanvas() {
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (currentRoom) {
    socket.emit('clearCanvas', currentRoom);
  }
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

// Allow Enter key on chat
document.getElementById('message').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChat();
});

// ================== TOOLBAR (Warna & Ukuran) ==================
function changeColor(color) {
  ctx.strokeStyle = color;
}

function changeLineWidth(width) {
  ctx.lineWidth = width;
}