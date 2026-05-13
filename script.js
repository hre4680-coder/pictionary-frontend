// ================== KONEKSI SOCKET ==================
const socket = io('https://pictionary-backend-production.up.railway.app', {
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 10000
});

let currentRoom = null;
let username = '';
let isDrawingAllowed = false;   // boleh gambar hanya jika game berjalan & fase menggambar
let isHost = false;
let canvas, ctx;
let painting = false;
let lastX = 0, lastY = 0;
let currentColor = '#000000';
let currentLineWidth = 8;
let isEraser = false;

// DOM elements
let lobbyDiv, gameDiv, startBtn, phaseEl, timerEl, roomCodeSpan, chatContainer;

// ================== INISIALISASI ==================
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('drawCanvas');
  ctx = canvas.getContext('2d');
  
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = currentLineWidth;

  lobbyDiv = document.getElementById('lobbySection');
  gameDiv = document.getElementById('gameSection');
  startBtn = document.getElementById('startGameBtn');
  phaseEl = document.getElementById('phaseDisplay');
  timerEl = document.getElementById('timerDisplay');
  roomCodeSpan = document.getElementById('roomCodeDisplay');
  chatContainer = document.getElementById('chatMessages');

  setupCanvasEvents();
  console.log('✅ UI & Canvas siap');
});

// ================== SOCKET EVENT ==================
socket.on('connect', () => console.log('✅ Terhubung ke server'));

socket.on('roomCreated', (roomCode) => {
  currentRoom = roomCode;
  isHost = true;
  showGameUI(roomCode);
  startBtn.style.display = 'flex';
  phaseEl.textContent = 'Menunggu Host Mulai';
  isDrawingAllowed = false;
});

socket.on('joinedRoom', (roomCode) => {
  currentRoom = roomCode;
  isHost = false;
  showGameUI(roomCode);
  startBtn.style.display = 'none';
  phaseEl.textContent = 'Menunggu dimulai...';
  isDrawingAllowed = false;
});

socket.on('gameStarted', () => {
  phaseEl.textContent = '🎨 WAKTU MENGGAMBAR!';
  isDrawingAllowed = true;
  addChatSystem('🎉 Lomba dimulai! Silakan menggambar!');
});

socket.on('timerUpdate', (timeLeft) => {
  timerEl.textContent = timeLeft < 10 ? '0' + timeLeft : timeLeft;
  if (timeLeft <= 5) timerEl.style.color = '#ff5e6e';
  else timerEl.style.color = '#FF8A5C';
});

socket.on('phaseChange', (data) => {
  if (data.phase === 'voting') {
    phaseEl.textContent = '⭐ WAKTU VOTING!';
    isDrawingAllowed = false;
    addChatSystem('⏳ Voting dimulai, tidak bisa menggambar!');
  } else {
    phaseEl.textContent = '🖌️ WAKTU MENGGAMBAR!';
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('chat', (data) => {
  addChatMessage(data.username, data.message);
});

socket.on('error', (msg) => alert(msg));

// ================== UI FUNCTIONS ==================
function showGameUI(roomCode) {
  lobbyDiv.style.display = 'none';
  gameDiv.style.display = 'block';
  roomCodeSpan.innerHTML = `🔑 Room: ${roomCode}`;
}

function addChatMessage(user, msg) {
  const div = document.createElement('div');
  div.innerHTML = `<strong>${escapeHtml(user)}:</strong> ${escapeHtml(msg)}`;
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addChatSystem(text) {
  const div = document.createElement('div');
  div.style.textAlign = 'center';
  div.style.opacity = '0.7';
  div.style.fontStyle = 'italic';
  div.innerText = text;
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ================== CANVAS DRAWING ==================
function setupCanvasEvents() {
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
    // kirim ke server
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

// ================== TOOLBAR ==================
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

// ================== GAME CONTROLS ==================
function createRoom() {
  username = document.getElementById('username').value.trim();
  if (username === '') username = 'Seniman_' + Math.floor(Math.random() * 1000);
  socket.emit('createRoom', username);
}
function joinRoom() {
  username = document.getElementById('username').value.trim();
  if (username === '') username = 'Peserta_' + Math.floor(Math.random() * 1000);
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!code) return alert('Masukkan kode room!');
  socket.emit('joinRoom', { roomCode: code, username });
}
function startGame() {
  if (isHost && currentRoom) {
    socket.emit('startGame', currentRoom);
    addChatSystem('🏁 Host memulai lomba! Selamat menggambar!');
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

// ================== PENGATURAN & TEMA ==================
function openSettings() {
  document.getElementById('themeModal').style.display = 'flex';
}
function closeModal() {
  document.getElementById('themeModal').style.display = 'none';
}
function setTheme(theme) {
  document.body.className = '';
  if (theme === 'sunset') document.body.classList.add('theme-sunset');
  if (theme === 'ocean') document.body.classList.add('theme-ocean');
  if (theme === 'forest') document.body.classList.add('theme-forest');
  if (theme === 'retro') document.body.classList.add('theme-retro');
  closeModal();
  // kirim info tema ke chat (optional)
  if (currentRoom) {
    socket.emit('chat', { roomCode: currentRoom, username: '🎨 Sistem', message: `Tema ruangan diubah menjadi ${theme.toUpperCase()}!` });
  }
}

// Perbaiki ukuran brush saat slider digeser (panggil dari html oninput)
window.updateBrushSize = updateBrushSize;
window.changeColor = changeColor;
window.setEraser = setEraser;
window.clearCanvas = clearCanvas;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.startGame = startGame;
window.sendChat = sendChat;
window.openSettings = openSettings;
window.setTheme = setTheme;
window.closeModal = closeModal;