// ================== KONEKSI SOCKET ==================
  const socket = io('https://pictionary-backend-production.up.railway.app', {
    reconnection: true,
    reconnectionAttempts: 10,
    timeout: 10000
  });

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
  let roomSettings = { roundDuration: 60, maxRounds: 3, category: 'acak' };

  // DOM elements
  let lobbyDiv, gameDiv, startBtn, settingsRoomBtn, phaseEl, timerEl, roomCodeSpan, chatContainer, playerListContainer, playerCountSpan;

  document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('drawCanvas');
    if (canvas) {
      ctx = canvas.getContext('2d');
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentLineWidth;
      setupCanvasEvents();
    }
    lobbyDiv = document.getElementById('lobbySection');
    gameDiv = document.getElementById('gameSection');
    startBtn = document.getElementById('startGameBtn');
    settingsRoomBtn = document.getElementById('settingsRoomBtn');
    phaseEl = document.getElementById('phaseDisplay');
    timerEl = document.getElementById('timerDisplay');
    roomCodeSpan = document.getElementById('roomCodeDisplay');
    chatContainer = document.getElementById('chatMessages');
    playerListContainer = document.getElementById('playerListContainer');
    playerCountSpan = document.getElementById('playerCount');
    console.log('✅ UI siap');
  });

  // Helper
  function showGameUI(roomCode) {
    lobbyDiv.classList.add('hidden');
    gameDiv.classList.remove('hidden');
    roomCodeSpan.innerHTML = `🔑 Kode: <strong style="color:#fbbf24;">${roomCode}</strong>`;
    if (isHost) {
      startBtn.style.display = 'inline-flex';
      settingsRoomBtn.style.display = 'inline-flex';
    } else {
      startBtn.style.display = 'none';
      settingsRoomBtn.style.display = 'none';
    }
  }

  function updatePlayerList(players) {
    if (!playerListContainer) return;
    playerListContainer.innerHTML = players.map(p => `<span class="player-badge">${escapeHtml(p.username)}</span>`).join('');
    if (playerCountSpan) playerCountSpan.textContent = players.length;
  }

  function addChatMessage(sender, msg) {
    if (!chatContainer) return;
    const div = document.createElement('div');
    div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(msg)}`;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function addSystemMessage(msg) {
    if (!chatContainer) return;
    const div = document.createElement('div');
    div.style.textAlign = 'center';
    div.style.opacity = '0.7';
    div.style.fontStyle = 'italic';
    div.innerText = msg;
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

  // ================== SOCKET EVENTS ==================
  socket.on('connect', () => console.log('✅ Terhubung ke server'));
  socket.on('connect_error', (err) => alert('Gagal koneksi ke server: ' + err.message));

  socket.on('roomCreated', (roomCode) => {
    currentRoom = roomCode;
    isHost = true;
    showGameUI(roomCode);
    phaseEl.textContent = 'Menunggu Host Mulai';
    isDrawingAllowed = false;
    addSystemMessage(`Room ${roomCode} berhasil dibuat. Anda adalah host.`);
  });

  socket.on('joinedRoom', (roomCode) => {
    currentRoom = roomCode;
    isHost = false;
    showGameUI(roomCode);
    phaseEl.textContent = 'Menunggu dimulai...';
    isDrawingAllowed = false;
    addSystemMessage(`Bergabung ke room ${roomCode}`);
  });

  socket.on('playerList', (players) => {
    updatePlayerList(players);
  });

  socket.on('gameStarted', (data) => {
    if (data && data.settings) {
      roomSettings = data.settings;
    }
    phaseEl.textContent = '🎨 WAKTU MENGGAMBAR!';
    isDrawingAllowed = true;
    addSystemMessage(`Lomba dimulai! Durasi ${roomSettings.roundDuration}dt, ${roomSettings.maxRounds} ronde. Selamat menggambar!`);
  });

  socket.on('timerUpdate', (seconds) => {
    timerEl.textContent = seconds < 10 ? '0' + seconds : seconds;
  });

  socket.on('phaseChange', (data) => {
    if (data.phase === 'voting') {
      phaseEl.textContent = '⭐ WAKTU VOTING!';
      isDrawingAllowed = false;
      addSystemMessage('Fase voting, tidak bisa menggambar.');
    } else if (data.phase === 'drawing') {
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
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  });

  socket.on('chat', (data) => {
    addChatMessage(data.username, data.message);
  });

  socket.on('error', (msg) => alert(msg));

  // ================== CANVAS DRAWING (support touch) ==================
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
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
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

  // ================== GAME ACTIONS ==================
  function createRoom() {
    const nameInput = document.getElementById('username');
    username = nameInput.value.trim();
    if (username === '') username = 'Seniman_' + Math.floor(Math.random() * 1000);
    socket.emit('createRoom', username);
  }
  function joinRoom() {
    const nameInput = document.getElementById('username');
    username = nameInput.value.trim();
    if (username === '') username = 'Peserta_' + Math.floor(Math.random() * 1000);
    const code = document.getElementById('roomCode').value.trim().toUpperCase();
    if (!code) return alert('Masukkan kode room!');
    socket.emit('joinRoom', { roomCode: code, username });
  }
  function startGame() {
    if (isHost && currentRoom) {
      socket.emit('startGame', currentRoom, roomSettings);
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

  // ================== SETTINGS & THEME ==================
  function openSettingsModal() {
    if (!isHost) { alert('Hanya host dapat mengatur room'); return; }
    document.getElementById('settingsModal').style.display = 'flex';
    document.getElementById('settingDuration').value = roomSettings.roundDuration;
    document.getElementById('settingRounds').value = roomSettings.maxRounds;
    document.getElementById('settingCategory').value = roomSettings.category;
  }
  function saveSettingsAndClose() {
    roomSettings = {
      roundDuration: parseInt(document.getElementById('settingDuration').value),
      maxRounds: parseInt(document.getElementById('settingRounds').value),
      category: document.getElementById('settingCategory').value
    };
    document.getElementById('settingsModal').style.display = 'none';
    addSystemMessage(`Host mengubah setting: durasi ${roomSettings.roundDuration}dt, ${roomSettings.maxRounds} ronde, kategori ${roomSettings.category}`);
  }
  function openThemeModal() {
    document.getElementById('themeModal').style.display = 'flex';
  }
  function closeModal() {
    document.getElementById('settingsModal').style.display = 'none';
    document.getElementById('themeModal').style.display = 'none';
  }
  function setTheme(theme) {
    document.body.className = '';
    if (theme === 'sunset') document.body.classList.add('theme-sunset');
    if (theme === 'ocean') document.body.classList.add('theme-ocean');
    if (theme === 'forest') document.body.classList.add('theme-forest');
    if (theme === 'retro') document.body.classList.add('theme-retro');
    closeModal();
    if (currentRoom) {
      socket.emit('chat', { roomCode: currentRoom, username: '🎨 Sistem', message: `Tema diubah menjadi ${theme.toUpperCase()}!` });
    }
  }

  // Global exports
  window.createRoom = createRoom;
  window.joinRoom = joinRoom;
  window.startGame = startGame;
  window.clearCanvas = clearCanvas;
  window.changeColor = changeColor;
  window.updateBrushSize = updateBrushSize;
  window.setEraser = setEraser;
  window.sendChat = sendChat;
  window.openSettingsModal = openSettingsModal;
  window.saveSettingsAndClose = saveSettingsAndClose;
  window.openThemeModal = openThemeModal;
  window.setTheme = setTheme;
  window.closeModal = closeModal;
