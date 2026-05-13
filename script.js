const socket = io('https://pictionary-backend-production.up.railway.app', { reconnection: true });
  let currentRoom = null, username = '', isHost = false;
  let canDraw = false; // hanya true saat fase drawing
  let canvas, ctx;
  let painting = false, lastX, lastY;
  let currentColor = '#000000', lineWidth = 8, isEraser = false;
  let myDrawingData = null; // menyimpan base64 gambar sendiri setelah selesai menggambar

  // DOM
  const lobbyDiv = document.getElementById('lobbySection');
  const gameDiv = document.getElementById('gameSection');
  const startBtn = document.getElementById('startGameBtn');
  const phaseEl = document.getElementById('phaseDisplay');
  const timerEl = document.getElementById('timerDisplay');
  const roomCodeSpan = document.getElementById('roomCodeDisplay');
  const chatDiv = document.getElementById('chatMessages');
  const playerListDiv = document.getElementById('playerListContainer');
  const playerCountSpan = document.getElementById('playerCount');

  document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('myCanvas');
    ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = lineWidth;
    setupCanvasEvents();
  });

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
    const stop = () => painting = false;
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
  function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

  function showGameUI(roomCode) {
    lobbyDiv.classList.add('hidden');
    gameDiv.classList.remove('hidden');
    roomCodeSpan.innerHTML = `🔑 Kode: <strong style="color:#fbbf24;">${roomCode}</strong>`;
    startBtn.style.display = isHost ? 'inline-block' : 'none';
  }

  // Socket events
  socket.on('connect', () => console.log('Connected'));
  socket.on('roomCreated', (roomCode) => { currentRoom = roomCode; isHost = true; showGameUI(roomCode); phaseEl.textContent = 'Menunggu mulai'; canDraw = false; });
  socket.on('joinedRoom', (roomCode) => { currentRoom = roomCode; isHost = false; showGameUI(roomCode); phaseEl.textContent = 'Menunggu mulai'; canDraw = false; });
  socket.on('playerList', (players) => {
    playerListDiv.innerHTML = players.map(p => `<span class="player-badge">${escapeHtml(p.username)}</span>`).join('');
    playerCountSpan.textContent = players.length;
  });
  socket.on('gameStarted', (settings) => {
    phaseEl.textContent = '🎨 MENGGAMBAR!';
    canDraw = true;
    addChatMessage('Sistem', `Mulai menggambar! Durasi ${settings.duration} detik`);
  });
  socket.on('timerUpdate', (sec) => { timerEl.textContent = sec < 10 ? '0'+sec : sec; if(sec<=5) timerEl.style.color='#ff5e6e'; });
  socket.on('timeoutDrawing', () => {
    canDraw = false;
    phaseEl.textContent = '⏳ Mengirim gambar...';
    // ambil base64 gambar dari canvas
    myDrawingData = canvas.toDataURL();
    socket.emit('submitDrawing', { roomCode: currentRoom, imageData: myDrawingData });
    addChatMessage('Sistem', 'Waktu habis! Gambar dikirim ke penilai.');
  });
  socket.on('votingPhase', (data) => {
    // data = { images: [{playerId, username, imageData}] }
    phaseEl.textContent = '⭐ VOTING! Pilih gambar terbaik';
    showVotingModal(data.images);
  });
  socket.on('winnerResult', (winner) => {
    showWinnerModal(winner);
  });
  socket.on('nextRound', (round) => {
    phaseEl.textContent = `🎨 RONDE ${round}`;
    canDraw = true;
    clearCanvas();
    myDrawingData = null;
    closeModals();
  });
  socket.on('gameEnded', (finalWinner) => {
    alert(`🏆 GAME SELESAI! Pemenang: ${finalWinner.username}`);
    location.reload();
  });
  socket.on('chat', (data) => addChatMessage(data.username, data.message));
  socket.on('error', (msg) => alert(msg));

  function addChatMessage(sender, msg) {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(msg)}`;
    chatDiv.appendChild(div);
    chatDiv.scrollTop = chatDiv.scrollHeight;
  }
  function escapeHtml(str) { return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }

  function createRoom() {
    username = document.getElementById('username').value.trim() || 'Pemain_'+Math.floor(Math.random()*1000);
    socket.emit('createRoom', username);
  }
  function joinRoom() {
    username = document.getElementById('username').value.trim() || 'Pemain_'+Math.floor(Math.random()*1000);
    const code = document.getElementById('roomCode').value.trim().toUpperCase();
    if(!code) return alert('Masukkan kode');
    socket.emit('joinRoom', { roomCode: code, username });
  }
  function startGame() {
    if(isHost && currentRoom) {
      socket.emit('startGame', currentRoom);
    } else alert('Hanya host');
  }
  function sendChat() {
    const inp = document.getElementById('chatInput');
    const msg = inp.value.trim();
    if(msg && currentRoom) {
      socket.emit('chat', { roomCode: currentRoom, username, message: msg });
      inp.value = '';
    }
  }

  // Voting modal
  let votingImages = [];
  function showVotingModal(images) {
    votingImages = images;
    let modalHtml = `<div id="votingModal" class="voting-modal"><div class="voting-container"><h2>⭐ Beri Rating untuk Setiap Gambar ⭐</h2><div class="gallery">`;
    images.forEach((img, idx) => {
      modalHtml += `
        <div class="gallery-item" data-idx="${idx}">
          <div><strong>${escapeHtml(img.username)}</strong></div>
          <img src="${img.imageData}" />
          <div class="rating-stars" data-imgidx="${idx}">
            <i class="far fa-star" data-rate="1"></i>
            <i class="far fa-star" data-rate="2"></i>
            <i class="far fa-star" data-rate="3"></i>
            <i class="far fa-star" data-rate="4"></i>
            <i class="far fa-star" data-rate="5"></i>
          </div>
          <button class="submit-rating-btn" data-imgidx="${idx}">Kirim Rating</button>
        </div>
      `;
    });
    modalHtml += `</div></div></div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    // Attach event listeners
    document.querySelectorAll('.rating-stars').forEach(starDiv => {
      const idx = starDiv.dataset.imgidx;
      const stars = starDiv.querySelectorAll('i');
      stars.forEach(star => {
        star.addEventListener('click', () => {
          const rate = parseInt(star.dataset.rate);
          stars.forEach((s, i) => {
            if(i < rate) s.className = 'fas fa-star selected';
            else s.className = 'far fa-star';
          });
          starDiv.dataset.selectedRating = rate;
        });
      });
    });
    document.querySelectorAll('.submit-rating-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const imgIdx = btn.dataset.imgidx;
        const starDiv = document.querySelector(`.rating-stars[data-imgidx="${imgIdx}"]`);
        const rating = starDiv.dataset.selectedRating;
        if(!rating) return alert('Pilih bintang dulu');
        socket.emit('submitVote', { roomCode: currentRoom, targetPlayerId: votingImages[imgIdx].playerId, rating: parseInt(rating) });
        btn.disabled = true;
        btn.innerText = 'Sudah dinilai';
      });
    });
  }
  function closeModals() {
    const modal = document.getElementById('votingModal');
    if(modal) modal.remove();
    const winnerModal = document.getElementById('winnerModal');
    if(winnerModal) winnerModal.remove();
  }
  function showWinnerModal(winner) {
    closeModals();
    const modal = `
      <div id="winnerModal" class="winner-modal">
        <div class="winner-card">
          <h2>🏆 Pemenang Ronde Ini 🏆</h2>
          <h3>${escapeHtml(winner.username)}</h3>
          <img src="${winner.imageData}" />
          <p>⭐ Rata-rata: ${winner.averageRating} bintang</p>
          <button onclick="socket.emit('continueGame', '${currentRoom}')" class="btn-gold">Lanjut ke Ronde Berikutnya</button>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modal);
  }

  window.createRoom = createRoom;
  window.joinRoom = joinRoom;
  window.startGame = startGame;
  window.clearCanvas = clearCanvas;
  window.changeColor = changeColor;
  window.updateBrushSize = updateBrushSize;
  window.setEraser = setEraser;
  window.sendChat = sendChat;