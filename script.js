// ======================== KONEKSI SOCKET ========================
  const socket = io('https://pictionary-backend-production.up.railway.app', {
    reconnection: true,
    reconnectionAttempts: 5
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
  let currentRound = 1;

  // DOM elements
  let lobbyDiv, gameDiv, startBtn, phaseEl, timerEl, roomCodeSpan, chatDiv, playerListContainer, playerCountSpan;

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
    phaseEl = document.getElementById('phaseDisplay');
    timerEl = document.getElementById('timerDisplay');
    roomCodeSpan = document.getElementById('roomCodeDisplay');
    chatDiv = document.getElementById('chatMessages');
    playerListContainer = document.getElementById('playerListContainer');
    playerCountSpan = document.getElementById('playerCount');

    setupStarRating();
  });

  function setupStarRating() {
    const stars = document.querySelectorAll('#starRating i');
    stars.forEach(star => {
      star.addEventListener('click', () => {
        const val = parseInt(star.dataset.value);
        stars.forEach((s, idx) => {
          if (idx < val) s.className = 'fas fa-star selected';
          else s.className = 'far fa-star';
        });
      });
    });
  }

  function getSelectedRating() {
    const selected = document.querySelectorAll('#starRating i.fas');
    return selected.length;
  }

  function showGameUI(roomCode) {
    lobbyDiv.classList.add('hidden');
    gameDiv.classList.remove('hidden');
    roomCodeSpan.innerHTML = `🔑 Kode: <strong style="color:#fbbf24;">${roomCode}</strong>`;
    if (isHost) {
      startBtn.style.display = 'inline-block';
    } else {
      startBtn.style.display = 'none';
    }
  }

  // Socket Events
  socket.on('connect', () => console.log('✅ Terhubung ke server'));
  socket.on('connect_error', (err) => alert('Koneksi gagal: ' + err.message));

  socket.on('roomCreated', (roomCode) => {
    currentRoom = roomCode;
    isHost = true;
    showGameUI(roomCode);
    phaseEl.textContent = 'Menunggu Host Mulai';
    isDrawingAllowed = false;
  });

  socket.on('joinedRoom', (roomCode) => {
    currentRoom = roomCode;
    isHost = false;
    showGameUI(roomCode);
    phaseEl.textContent = 'Menunggu dimulai...';
    isDrawingAllowed = false;
  });

  socket.on('playerList', (players) => {
    playerListContainer.innerHTML = players.map(p => `<span class="player-badge">${escapeHtml(p.username)}</span>`).join('');
    playerCountSpan.textContent = players.length;
  });

  socket.on('gameStarted', (data) => {
    if (data && data.settings) roomSettings = data.settings;
    phaseEl.textContent = '🎨 WAKTU MENGGAMBAR!';
    isDrawingAllowed = true;
    addChatMessage('Sistem', `Lomba dimulai! Durasi ${roomSettings.roundDuration} dt, Ronde ${roomSettings.maxRounds}`);
  });

  socket.on('timerUpdate', (seconds) => {
    timerEl.textContent = seconds < 10 ? '0' + seconds : seconds;
    if (seconds <= 5) timerEl.style.color = '#ff5e6e';
  });

  socket.on('phaseChange', (data) => {
    if (data.phase === 'voting') {
      phaseEl.textContent = '⭐ VOTING! Beri Rating';
      isDrawingAllowed = false;
      // Tampilkan modal rating untuk semua player
      if (data.showRatingModal) {
        document.getElementById('ratingModal').style.display = 'flex';
      }
    } else if (data.phase === 'drawing') {
      phaseEl.textContent = '🖌️ WAKTU MENGGAMBAR!';
      isDrawingAllowed = true;
    }
  });

  socket.on('timeoutNotification', (msg) => {
    showFloatingMessage(msg, 3000);
  });

  socket.on('showRatingReminder', () => {
    document.getElementById('ratingModal').style.display = 'flex';
  });

  socket.on('ratingResult', (data) => {
    // data: { winnerUsername, winnerImageData, averageStar, comments[] }
    showWinnerModal(data);
  });

  socket.on('nextRound', (round) => {
    currentRound = round;
    addChatMessage('Sistem', `Mulai Ronde ${round} / ${roomSettings.maxRounds}`);
    phaseEl.textContent = '🖌️ WAKTU MENGGAMBAR!';
    isDrawingAllowed = true;
    document.getElementById('ratingModal').style.display = 'none';
  });

  socket.on('gameEnded', (finalWinner) => {
    alert(`🏆 GAME SELESAI! Pemenang Umum: ${finalWinner.username} dengan skor ${finalWinner.score}`);
    // reload page atau kembali lobby
    location.reload();
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

  socket.on('clearCanvas', () => ctx.clearRect(0, 0, canvas.width, canvas.height));
  socket.on('chat', (data) => addChatMessage(data.username, data.message));
  socket.on('error', (msg) => alert(msg));

  // ========== CANVAS DRAWING ==========
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
      if (!isDrawingAllowed) return;
      e.preventDefault();
      painting = true;
      const pos = getPos(e);
      lastX = pos.x; lastY = pos.y;
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
      lastX = pos.x; lastY = pos.y;
    };
    const stop = () => painting = false;
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseleave', stop);
    canvas.addEventListener('touchstart', start);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stop);
  }

  // ========== FUNGSI TOOL ==========
  function changeColor(color) { currentColor = color; isEraser = false; ctx.strokeStyle = color; }
  function updateBrushSize(size) { currentLineWidth = parseInt(size); document.getElementById('brushSizeValue').innerText = size; ctx.lineWidth = currentLineWidth; if(isEraser) ctx.strokeStyle='#ffffff'; else ctx.strokeStyle=currentColor; }
  function setEraser() { isEraser = true; ctx.strokeStyle = '#ffffff'; }
  function clearCanvas() { if(!currentRoom) return; ctx.clearRect(0,0,canvas.width,canvas.height); socket.emit('clearCanvas', currentRoom); }

  // ========== GAME CONTROLS ==========
  function createRoom() {
    const inp = document.getElementById('username');
    username = inp.value.trim() || 'Pemain_' + Math.floor(Math.random()*1000);
    socket.emit('createRoom', username);
  }
  function joinRoom() {
    const inpName = document.getElementById('username');
    username = inpName.value.trim() || 'Pemain_' + Math.floor(Math.random()*1000);
    const code = document.getElementById('roomCode').value.trim().toUpperCase();
    if(!code) return alert('Masukkan kode room');
    socket.emit('joinRoom', { roomCode: code, username });
  }
  function startGame() {
    if(isHost && currentRoom) {
      socket.emit('startGame', currentRoom, roomSettings);
    } else alert('Hanya host yang bisa memulai');
  }
  function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if(msg && currentRoom) {
      socket.emit('chat', { roomCode: currentRoom, username, message: msg });
      input.value = '';
    }
  }
  function addChatMessage(sender, msg) {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(msg)}`;
    chatDiv.appendChild(div);
    chatDiv.scrollTop = chatDiv.scrollHeight;
  }
  function showFloatingMessage(text, duration=5000) {
    const div = document.createElement('div');
    div.className = 'floating-rating';
    div.innerText = text;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), duration);
  }
  function submitRating() {
    const rating = getSelectedRating();
    if(rating === 0) return alert('Pilih bintang dulu!');
    const comment = document.getElementById('ratingComment').value;
    // ambil snapshot canvas saat ini (gambar yang dinilai)
    const imageData = canvas.toDataURL();
    socket.emit('submitRating', {
      roomCode: currentRoom,
      rating,
      comment,
      imageData
    });
    document.getElementById('ratingModal').style.display = 'none';
    document.getElementById('ratingComment').value = '';
    showFloatingMessage('⭐ Terima kasih sudah memberi rating!', 2000);
  }
  function showWinnerModal(data) {
    const winnerDiv = document.getElementById('winnerInfo');
    winnerDiv.innerHTML = `<h2>${escapeHtml(data.winnerUsername)}</h2><p>⭐ Rata-rata: ${data.averageStar} bintang</p><p>Komentar: ${escapeHtml(data.comments.join(', '))}</p>`;
    const winnerCanvas = document.getElementById('winnerCanvas');
    const wCtx = winnerCanvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      winnerCanvas.width = img.width;
      winnerCanvas.height = img.height;
      wCtx.drawImage(img, 0, 0, winnerCanvas.width, winnerCanvas.height);
    };
    img.src = data.winnerImageData;
    document.getElementById('winnerModal').style.display = 'flex';
  }
  function closeWinnerModal() {
    document.getElementById('winnerModal').style.display = 'none';
    socket.emit('continueToNextRound', currentRoom);
  }
  function openSettings() {
    alert("Pengaturan: Durasi, Ronde (dapat ditambahkan nanti)");
  }
  function escapeHtml(str) { return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }

  window.createRoom = createRoom;
  window.joinRoom = joinRoom;
  window.startGame = startGame;
  window.clearCanvas = clearCanvas;
  window.changeColor = changeColor;
  window.updateBrushSize = updateBrushSize;
  window.setEraser = setEraser;
  window.sendChat = sendChat;
  window.submitRating = submitRating;
  window.closeWinnerModal = closeWinnerModal;
  window.openSettings = openSettings;