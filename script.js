// ================== KONFIGURASI SOCKET ==================
const socket = io('https://pictionary-backend-production.up.railway.app', {
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 10000
});

let currentRoom = null;
let username = '';
let isDrawing = false;      // Status apakah user diizinkan menggambar
let isHost = false;         // Penanda apakah user yang membuat room (opsional)
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

// Room berhasil dibuat
socket.on('roomCreated', (roomCode) => {
  currentRoom = roomCode;
  isHost = true;
  
  // Sembunyikan lobby, tampilkan game
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  
  // Tampilkan kode room di area game (buat elemen jika belum ada)
  showRoomCode(roomCode);
  
  document.getElementById('phaseDisplay').textContent = 'Menunggu Host Mulai';
  isDrawing = false; // Belum bisa menggambar sampai game dimulai
});

// Berhasil bergabung ke room
socket.on('joinedRoom', (roomCode) => {
  currentRoom = roomCode;
  isHost = false;
  
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  
  showRoomCode(roomCode);
  isDrawing = false;
});

// Game dimulai (biasanya oleh host)
socket.on('gameStarted', () => {
  document.getElementById('phaseDisplay').textContent = '🖌️ WAKTU MENGGAMBAR!';
  isDrawing = true;   // Izinkan menggambar
  console.log('🎉 Game dimulai, sekarang bisa menggambar!');
});

// Update timer
socket.on('timerUpdate', (timeLeft) => {
  const timerEl = document.getElementById('timerDisplay');
  timerEl.textContent = timeLeft < 10 ? '0' + timeLeft : timeLeft;
  
  if (timeLeft <= 10) timerEl.style.color = '#ff4757';
  else timerEl.style.color = ''; // reset ke default CSS
});

// Perubahan fase (menggambar / voting)
socket.on('phaseChange', (data) => {
  if (data.phase === 'voting') {
    document.getElementById('phaseDisplay').textContent = '⭐ WAKTU VOTING!';
    isDrawing = false;   // Tidak bisa menggambar saat voting
  } else {
    document.getElementById('phaseDisplay').textContent = '🖌️ WAKTU MENGGAMBAR!';
    isDrawing = true;    // Bisa menggambar lagi
  }
});

// Menerima drawing dari server (untuk ditampilkan ke semua client)
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

// Hapus canvas
socket.on('clearCanvas', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Chat message
socket.on('chat', (data) => {
  const chatDiv = document.getElementById('chat');
  const msgHTML = `<div><strong>${escapeHtml(data.username)}:</strong> ${escapeHtml(data.message)}</div>`;
  chatDiv.innerHTML += msgHTML;
  chatDiv.scrollTop = chatDiv.scrollHeight;
});

// Error handling
socket.on('error', (msg) => {
  alert(msg);
  console.error('Error:', msg);
});

// ================== FUNGSI BANTUAN UI ==================
// Menampilkan kode room di pojok atau di header game
function showRoomCode(roomCode) {
  // Cek apakah sudah ada elemen penampil kode room
  let roomCodeElem = document.getElementById('roomCodeDisplay');
  if (!roomCodeElem) {
    // Buat elemen baru di dalam .game-header
    const header = document.querySelector('.game-header');
    if (header) {
      const div = document.createElement('div');
      div.id = 'roomCodeDisplay';
      div.style.background = '#FFB34720';
      div.style.padding = '6px 16px';
      div.style.borderRadius = '40px';
      div.style.fontWeight = 'bold';
      div.style.fontSize = '0.9rem';
      div.style.border = '1px solid #FFD966';
      header.appendChild(div);
      roomCodeElem = div;
    }
  }
  if (roomCodeElem) {
    roomCodeElem.innerHTML = `🔑 Kode Room: <span style="color:#FFD966;">${roomCode}</span>`;
  } else {
    // Fallback alert jika header tidak ditemukan
    alert(`Kode Room Anda: ${roomCode}`);
  }
}

// Escape HTML untuk keamanan chat
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
    return c;
  });
}

// ================== CANVAS DRAWING ==================
function setupCanvasEvents() {
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);

  // Support layar sentuh
  canvas.addEventListener('touchstart', e => { e.preventDefault(); startDrawing(e.touches[0]); });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); draw(e.touches[0]); });
  canvas.addEventListener('touchend', stopDrawing);
}

function startDrawing(e) {
  if (!isDrawing) return;   // Hanya boleh menggambar jika game sudah mulai dan fase menggambar
  painting = true;
  const pos = getMousePos(e);
  lastX = pos.x;
  lastY = pos.y;
}

function draw(e) {
  if (!painting || !isDrawing) return;
  const pos = getMousePos(e);
  
  // Gambar lokal dulu untuk respons cepat
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
  const scaleX = canvas.width / rect.width;   // jika canvas punya ukuran asli 800x500
  const scaleY = canvas.height / rect.height;
  let clientX, clientY;
  
  if (e.touches) {
    clientX = e.clientX;
    clientY = e.clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  
  let x = (clientX - rect.left) * scaleX;
  let y = (clientY - rect.top) * scaleY;
  
  // Batasi ke dalam canvas
  x = Math.min(Math.max(0, x), canvas.width);
  y = Math.min(Math.max(0, y), canvas.height);
  
  return { x, y };
}

// ================== TOOLBAR FUNCTIONS ==================
function changeColor(color) {
  currentColor = color;
  isEraser = false;
  ctx.strokeStyle = color;
}

function changeBrushSize(size) {
  currentLineWidth = parseInt(size);
  const span = document.getElementById('brushSizeValue');
  if (span) span.textContent = size;
  ctx.lineWidth = currentLineWidth;
  if (isEraser) {
    // Jika sedang mode penghapus, tetap pakai warna putih
    ctx.strokeStyle = '#ffffff';
  } else {
    ctx.strokeStyle = currentColor;
  }
}

function setEraser() {
  isEraser = true;
  ctx.strokeStyle = '#ffffff';
}

// ================== GAME FUNCTIONS (dipanggil dari HTML) ==================
function createRoom() {
  username = document.getElementById('username').value.trim();
  if (username === '') {
    username = 'Peserta_' + Math.floor(Math.random() * 1000);
  }
  socket.emit('createRoom', username);
}

function joinRoom() {
  username = document.getElementById('username').value.trim();
  if (username === '') {
    username = 'Peserta_' + Math.floor(Math.random() * 1000);
  }
  const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!roomCode) {
    alert('Masukkan kode room!');
    return;
  }
  socket.emit('joinRoom', { roomCode, username });
}

function clearCanvas() {
  if (!currentRoom) return;
  // Hapus canvas lokal
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Kirim sinyal ke server agar semua client juga terhapus
  socket.emit('clearCanvas', currentRoom);
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

// ================== EKSTRA: TAMPILKAN KODE ROOM SAAT JOIN JUGA ==================
// (sudah ditangani di event joinedRoom)