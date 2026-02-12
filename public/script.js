const socket = io();

// DOM Elements
const landingScreen = document.getElementById('landing-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const resultsScreen = document.getElementById('results-screen');

const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const joinCodeInput = document.getElementById('join-code');
const playerNameInput = document.getElementById('player-name');
const roomCodeDisplay = document.getElementById('room-code-display');
const playersListUl = document.getElementById('players-ul');
const playerCountSpan = document.getElementById('player-count');
const hostControls = document.getElementById('host-controls');
const lobbyStatus = document.getElementById('lobby-status');

// UI Helpers
const hostMonitorScreen = document.getElementById('host-monitor-screen');

function showScreen(screen) {
    [landingScreen, lobbyScreen, gameScreen, resultsScreen, hostMonitorScreen].forEach(s => s?.classList.add('hidden'));
    screen.classList.remove('hidden');
}

// Event Listeners
createBtn.addEventListener('click', () => {
    socket.emit('create_room', {}, (response) => {
        if (response.success) {
            setupLobby(response.roomCode, true);
        }
    });
});

joinBtn.addEventListener('click', () => {
    const code = joinCodeInput.value.toUpperCase();
    const name = playerNameInput.value.trim();
    if (!code || !name) return alert("Please enter Room Code and Name");

    socket.emit('join_room', { roomCode: code, name: name }, (response) => {
        if (response.success) {
            setupLobby(response.roomCode, false);
        } else {
            alert(response.message);
        }
    });
});

function setupLobby(code, isHost) {
    roomCodeDisplay.innerText = code;
    showScreen(lobbyScreen);
    if (isHost) {
        hostControls.classList.remove('hidden');
        lobbyStatus.innerText = "You are the Host. Start when ready.";
    } else {
        hostControls.classList.add('hidden');
        lobbyStatus.innerText = "Waiting for host to start...";
    }
}

// Socket Events
socket.on('update_lobby', (data) => {
    updatePlayerList(data.players);
});

function updatePlayerList(players) {
    playersListUl.innerHTML = '';
    // playersListUl should be treated as a container div now, not a UL in strict semantic terms, but we can style it.
    playersListUl.className = 'lobby-grid'; // Switch to grid class

    playerCountSpan.innerText = players.length;
    players.forEach(p => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
            <div class="avatar">${p.avatar || '😀'}</div>
            <div class="name">${p.name}</div>
            ${p.isHost ? '<div class="badge host">HOST</div>' : ''}
        `;
        playersListUl.appendChild(card);
    });
}
// Remove old UL specific logic if any (replaced innerHTML)

const startGameBtn = document.getElementById('start-game-btn');
const ticTacToeBoard = document.getElementById('tic-tac-toe-board');
const myScoreSpan = document.getElementById('my-score');
const opponentScoreSpan = document.getElementById('opponent-score');
let currentPairId = null;
let mySymbol = null;
let isMyTurn = false;

// Host Start Game
startGameBtn.addEventListener('click', () => {
    const rounds = document.getElementById('rounds-input').value; // Todo: send rounds config
    const roomCode = roomCodeDisplay.innerText;
    socket.emit('start_game', { roomCode });
});

// Game Board Interaction
ticTacToeBoard.addEventListener('click', (e) => {
    if (!isMyTurn) return;
    const cell = e.target;
    if (cell.classList.contains('cell') && !cell.innerText) {
        const index = cell.getAttribute('data-index');
        socket.emit('make_move', {
            roomCode: roomCodeDisplay.innerText,
            pairId: currentPairId,
            index: parseInt(index)
        });
        // Optimistic update (optional, but safer to wait for server)
    }
});

// Socket Game Events
socket.on('start_countdown', (data) => {
    showCountdown(data.duration);
});

function showCountdown(seconds) {
    const overlay = document.createElement('div');
    overlay.className = 'countdown-overlay';
    document.body.appendChild(overlay);

    let left = seconds;
    overlay.innerText = left;

    const interval = setInterval(() => {
        left--;
        if (left > 0) {
            overlay.innerText = left;
        } else {
            overlay.innerText = "FIGHT!";
            clearInterval(interval);
            setTimeout(() => {
                overlay.classList.add('fade-out');
                setTimeout(() => overlay.remove(), 500);
            }, 800);
        }
    }, 1000);
}

socket.on('game_start', (data) => {
    // data: { opponent, symbol, pairId, isSpectator }
    currentPairId = data.pairId;
    mySymbol = data.symbol;
    isMyTurn = mySymbol === 'X'; // X starts

    document.querySelector('.opponent-info .name').innerText = data.opponent;

    if (!data.isSpectator) {
        resetBoard();
    }

    showScreen(gameScreen);
    updateTurnIndicator();
});

socket.on('update_board', (data) => {
    // data: { board, turn }
    renderBoard(data.board);
    isMyTurn = socket.id === data.turn;
    updateTurnIndicator();
});

// Emoji Interaction
document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!currentPairId) return;
        socket.emit('send_emoji', {
            roomCode: roomCodeDisplay.innerText,
            pairId: currentPairId,
            emoji: btn.innerText
        });
    });
});

socket.on('receive_emoji', (data) => {
    // data: { emoji, sender }
    const display = document.getElementById('emoji-display');
    const msg = document.createElement('div');
    msg.className = 'emoji-float';
    msg.innerText = `${data.sender}: ${data.emoji}`;
    display.appendChild(msg);

    setTimeout(() => msg.remove(), 2000);
});

socket.on('round_over', (data) => {
    // data: { winner, board, scores }
    renderBoard(data.board);
    myScoreSpan.innerText = data.scores[mySymbol === 'X' ? 'p1' : 'p2'];
    opponentScoreSpan.innerText = data.scores[mySymbol === 'X' ? 'p2' : 'p1'];

    // Toast notification or overlay for round result
    const notification = document.createElement('div');
    notification.className = 'round-notification';
    notification.innerText = `${data.winner} won this round! Next round starting...`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
        resetBoard();
    }, 2800);
});

socket.on('match_over', (data) => {
    showScreen(document.getElementById('spectator-screen'));
    lobbyStatus.innerText = "Match Finished! Waiting for others...";
});

socket.on('matches_updated', (data) => {
    // Update spectator list
    const activeList = document.getElementById('active-matches-list');
    activeList.innerHTML = '<h3>Active Matches</h3>';

    data.pairs.forEach((p, index) => {
        const div = document.createElement('div');
        div.className = 'match-item';
        div.innerHTML = `<span>Match ${index + 1}: ${p.status}</span>`;

        if (p.status === 'playing') {
            const watchBtn = document.createElement('button');
            watchBtn.innerText = 'Watch';
            watchBtn.className = 'btn secondary small';
            watchBtn.onclick = () => {
                socket.emit('spectate_match', { roomCode: roomCodeDisplay.innerText, pairId: p.id });
                // Switch to game screen in "Spectator Mode"
                showScreen(gameScreen);
                document.querySelector('.opponent-info .name').innerText = "Spectating Match " + (index + 1);
                // Disable interactions
                isMyTurn = false;
            };
            div.appendChild(watchBtn);
        }
        activeList.appendChild(div);
    });
});

socket.on('tournament_over', (data) => {
    showScreen(resultsScreen);
    const container = document.getElementById('final-reveal-container');
    container.innerHTML = '';

    data.results.forEach(res => {
        const div = document.createElement('div');
        div.className = 'result-card';
        // Logic to highlight "My" match
        div.innerHTML = `
            <h3>${res.p1Name} vs ${res.p2Name}</h3>
            <p>Score: ${res.score.p1} - ${res.score.p2}</p>
        `;
        container.appendChild(div);
    });
});

socket.on('game_waiting', (data) => {
    showScreen(lobbyScreen);
    lobbyStatus.innerText = data.message;
});

function resetBoard() {
    document.querySelectorAll('.cell').forEach(cell => {
        cell.innerText = '';
        cell.classList.remove('x', 'o');
    });
}

function renderBoard(board) {
    board.forEach((symbol, index) => {
        const cell = document.querySelector(`.cell[data-index="${index}"]`);
        if (cell) {
            cell.innerText = symbol || '';
            if (symbol) cell.classList.add(symbol.toLowerCase());
        }
    });
}

function updateTurnIndicator() {
    // Visual cue for turn
    if (isMyTurn) {
        gameScreen.classList.add('my-turn');
    } else {
        gameScreen.classList.remove('my-turn');
    }
}

socket.on('host_monitor_start', (data) => {
    showScreen(hostMonitorScreen);
    const list = document.getElementById('monitor-matches-list');
    list.innerHTML = '';

    data.pairs.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'monitor-card';
        card.innerHTML = `
            <h3>Match ${i + 1}</h3>
            <div class="status">${p.status}</div>
            <button class="btn small" onclick="spectateMatch('${p.id}')">Spectate</button>
        `;
        list.appendChild(card);
    });
});

window.spectateMatch = function (pairId) {
    socket.emit('spectate_match', { roomCode: roomCodeDisplay.innerText, pairId: pairId });
    showScreen(gameScreen);
    document.querySelector('.opponent-info .name').innerText = "Spectating Match...";
    isMyTurn = false;
    updateTurnIndicator(); // Remove glow
}
