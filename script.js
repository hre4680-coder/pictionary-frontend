// Ganti dengan URL Railway kamu
const socket = io('https://pictionary-backend.up.railway.app');

let currentRoom = null;
let username = '';
let isDrawing = false;
let canvas, ctx;

function initCanvas() {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#000';

  let painting = false;

  canvas.addEventListener('mousedown', (e) => {
    if (!isDrawing) return;
    painting = true;
    draw(e);
  });

  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', () => painting = false);
  canvas.addEventListener('mouseleave', () => painting = false);
}

function draw(e) {
  if (!painting) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);

  socket.emit('drawing', {
    roomCode: currentRoom,
    x: x,
    y: y,
    color: ctx.strokeStyle,
    lineWidth: ctx.lineWidth
  });
}

// Fungsi Lainnya
function createRoom() {
  username = document.getElementById('username').value || 'Player' + Math.floor(Math.random()*100);
  socket.emit('createRoom', username);
}

function joinRoom() {
  username = document.getElementById('username').value || 'Player' + Math.floor(Math.random()*100);
  const roomCode = document.getElementById('roomCode').value.toUpperCase();
  if (roomCode) socket.emit('joinRoom', { roomCode, username });
}

socket.on('roomCreated', (roomCode) => {
  currentRoom = roomCode;
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  document.getElementById('roomDisplay').textContent = roomCode;
  initCanvas();
  isDrawing = true; // pembuat room jadi drawer pertama
});

socket.on('joinedRoom', (roomCode) => {
  currentRoom = roomCode;
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  document.getElementById('roomDisplay').textContent = roomCode;
  initCanvas();
});

socket.on('drawing', (data) => {
  if (!ctx) return;
  ctx.lineTo(data.x, data.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(data.x, data.y);
});

socket.on('clearCanvas', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit('clearCanvas', currentRoom);
}

function sendChat() {
  const msg = document.getElementById('message').value;
  if (msg) {
    socket.emit('chat', { roomCode: currentRoom, username, message: msg });
    document.getElementById('message').value = '';
  }
}