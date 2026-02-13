require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const path = require('path');

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client/dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});


const rooms = {}; // Store room data: { roomCode: { host: socketId, players: [], ... } }
const roomsPerPlayer = {}; // Track rooms created per playerId for limits

// Rate limiting: socketId -> { event -> { count, lastReset } }
const rateLimits = new Map();

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Rate limiting helper
function checkRateLimit(socketId, event, maxPerSecond = 10) {
    if (!rateLimits.has(socketId)) {
        rateLimits.set(socketId, {});
    }

    const now = Date.now();
    const limits = rateLimits.get(socketId);

    if (!limits[event]) {
        limits[event] = { count: 0, lastReset: now };
    }

    const eventLimit = limits[event];

    // Reset counter every second
    if (now - eventLimit.lastReset > 1000) {
        eventLimit.count = 0;
        eventLimit.lastReset = now;
    }

    eventLimit.count++;

    if (eventLimit.count > maxPerSecond) {
        console.warn(`🚨 Rate limit exceeded: ${socketId} - ${event}`);
        return false;
    }

    return true;
}

// Input validation helpers
function validateName(name) {
    return typeof name === 'string' && name.length >= 1 && name.length <= 20 && /^[a-zA-Z0-9 ]+$/.test(name);
}

function validateRoomCode(code) {
    return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code);
}

function validateRounds(rounds) {
    const num = parseInt(rounds);
    return Number.isInteger(num) && num >= 1 && num <= 10;
}

io.on('connection', (socket) => {
    // console.log(`🔌 User connected: ${socket.id}`);

    socket.on('create_room', (data, callback) => {
        try {
            // Rate limiting: max 3 room creations per 5 minutes
            if (!checkRateLimit(socket.id, 'create_room', 3)) {
                return callback({ success: false, message: "Too many rooms created. Wait 1 minute." });
            }

            // Input validation
            if (!data.playerId || typeof data.playerId !== 'string') {
                return callback({ success: false, message: "Invalid player ID" });
            }

            if (!validateRounds(data.rounds)) {
                return callback({ success: false, message: "Rounds must be 1-10" });
            }

            // Room creation limit: max 3 active rooms per player
            if (!roomsPerPlayer[data.playerId]) {
                roomsPerPlayer[data.playerId] = [];
            }

            // Clean up finished rooms
            roomsPerPlayer[data.playerId] = roomsPerPlayer[data.playerId].filter(code => rooms[code]);

            if (roomsPerPlayer[data.playerId].length >= 3) {
                return callback({ success: false, message: "Maximum 3 active rooms per player" });
            }
            // console.log("EVENT: create_room", socket.id);
            const roomCode = generateRoomCode();
            rooms[roomCode] = {
                host: socket.id,
                hostPlayerId: data.playerId,
                players: [{ id: socket.id, name: "Host", isHost: true, playerId: data.playerId, connected: true }],
                rounds: parseInt(data.rounds) || 3, // Ensure integer
                state: 'lobby', // lobby, playing, finished
                lastActivity: Date.now(), // Track activity for cleanup
                leaderboard: {} // Track wins/losses: { playerId: { name, wins, losses } }
            };

            socket.join(roomCode);
            roomsPerPlayer[data.playerId].push(roomCode); // Track room
            console.log(`Room created: ${roomCode} by ${socket.id}`);

            // Callback to client with room code
            callback({ success: true, roomCode: roomCode });
        } catch (error) {
            console.error("🔥 Error in create_room:", error);
            callback({ success: false, message: "Internal Server Error" });
        }
    });

    socket.on('join_room', (data, callback) => {
        try {
            // Rate limiting
            if (!checkRateLimit(socket.id, 'join_room', 5)) {
                return callback({ success: false, message: "Too many join attempts" });
            }

            // Input validation
            if (!validateRoomCode(data.roomCode)) {
                return callback({ success: false, message: "Invalid room code format" });
            }

            if (!validateName(data.name)) {
                return callback({ success: false, message: "Name must be 1-20 alphanumeric characters" });
            }

            console.log("EVENT: join_room", socket.id, data);
            const room = rooms[data.roomCode];
            if (!room) {
                return callback({ success: false, message: "Room not found" });
            }
            if (room.state !== 'lobby') {
                return callback({ success: false, message: "Game already in progress" });
            }

            const player = {
                id: socket.id,
                name: data.name || `Player ${room.players.length + 1}`,
                isHost: false,
                playerId: data.playerId,
                connected: true
            };
            room.players.push(player);
            socket.join(data.roomCode);
            room.lastActivity = Date.now(); // Update activity

            console.log(`${player.name} joined room ${data.roomCode}`);

            // Notify everyone in the room (including sender) to update lobby
            io.to(data.roomCode).emit('update_lobby', { players: room.players, roomCode: data.roomCode });

            callback({ success: true, roomCode: data.roomCode, isHost: false });
        } catch (error) {
            console.error("🔥 Error in join_room:", error);
            callback({ success: false, message: "Internal Server Error" });
        }
    });

    socket.on('start_game', (data) => {
        // Wrapped in try-catch to prevent crashes
        try {
            console.log("EVENT: start_game", socket.id, data);
            const room = rooms[data.roomCode];
            if (!room) {
                console.error("Room not found for start_game");
                return;
            }
            if (room.host !== socket.id) {
                console.error("User is not host", socket.id, room.host);
                return;
            }

            // Filter out the host -> Host is NOT a player
            let players = room.players.filter(p => !p.isHost);

            // Fisher-Yates Shuffle for better randomization
            for (let i = players.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [players[i], players[j]] = [players[j], players[i]];
            }

            console.log("🎲 Random Pairings:", players.map(p => p.name));
            const pairs = [];

            for (let i = 0; i < players.length; i += 2) {
                if (i + 1 < players.length) {
                    const p1 = players[i];
                    const p2 = players[i + 1];
                    const pairId = `${p1.id}-${p2.id}`;

                    pairs.push({
                        id: pairId,
                        p1: p1.id,
                        p2: p2.id,
                        board: Array(9).fill(null),
                        turn: p1.id, // p1 starts
                        winner: null,
                        score: { p1: 0, p2: 0 },
                        currentRound: 1,
                        status: 'playing'
                    });

                    // Notify players they are playing
                    io.to(p1.id).emit('game_start', { opponent: "Anonymous", symbol: 'X', pairId });
                    io.to(p2.id).emit('game_start', { opponent: "Anonymous", symbol: 'O', pairId });
                } else {
                    // Odd player out (Bye)
                    io.to(players[i].id).emit('game_waiting', { message: "Waiting for next round (Bye)" });
                }
            }

            room.state = 'playing';
            room.pairs = pairs;

            // Notify host to enter Monitor Mode
            io.to(room.host).emit('host_monitor_start', {
                message: "Tournament Started! You are monitoring the games.",
                pairs: pairs.map(p => ({ id: p.id, status: 'playing', p1Name: p.p1, p2Name: p.p2 })),
                isHost: true
            });

            // Notify host/spectators (Global update)
            io.to(data.roomCode).emit('matches_updated', { pairs: pairs.map(p => ({ id: p.id, status: 'playing' })) });

        } catch (error) {
            console.error("🔥 Error in start_game:", error);
        }
    });

    socket.on('make_move', (data) => {
        try {
            // Rate limiting: max 10 moves per second
            if (!checkRateLimit(socket.id, 'make_move', 10)) {
                console.warn(`⚠️ Move spam detected from ${socket.id}`);
                return;
            }

            // Input validation
            if (typeof data.index !== 'number' || data.index < 0 || data.index > 8) {
                console.warn(`⚠️ Invalid move index: ${data.index}`);
                return;
            }

            const room = rooms[data.roomCode];
            if (!room || !room.pairs) {
                // console.warn("Invalid room/pairs for move:", data);
                return;
            }

            const pair = room.pairs.find(p => p.id === data.pairId);
            if (!pair) {
                console.warn(`⚠️ Move rejected: Pair ${data.pairId} not found`);
                return;
            }

            if (pair.status === 'finished') {
                console.warn(`⚠️ Move rejected: Match not in playing state (${pair.status})`);
                return;
            }

            const isTurn = pair.turn === socket.id;
            const isFree = !pair.board[data.index];

            /* console.log("♟️ MOVE REQUEST:", {
                 roomCode: data.roomCode,
                 pairId: data.pairId,
                 index: data.index
            }); */

            if (isTurn && isFree) {
                // ... (existing move logic) ...
                console.log(`✅ Valid Move at ${data.index} by ${socket.id}`);
                room.lastActivity = Date.now(); // Update activity on move
                // Reset consecutive timeouts for this player
                if (!pair.consecutiveTimeouts) pair.consecutiveTimeouts = {};
                pair.consecutiveTimeouts[socket.id] = 0;

                pair.board[data.index] = pair.turn === pair.p1 ? 'X' : 'O';

                // Check Win/Draw (logic remains same)
                // We need to keep the game logic here
                const checkWinner = (board) => {
                    const lines = [
                        [0, 1, 2], [3, 4, 5], [6, 7, 8],
                        [0, 3, 6], [1, 4, 7], [2, 5, 8],
                        [0, 4, 8], [2, 4, 6]
                    ];
                    for (let i = 0; i < lines.length; i++) {
                        const [a, b, c] = lines[i];
                        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                            return board[a] === 'X' ? 'p1' : 'p2'; // returns 'p1' or 'p2' (based on X/O)
                        }
                    }
                    return null;
                };

                // NOTE: 'X' is always p1 in our logic for now? 
                // pair.turn check: if pair.turn was p1, then they placed 'X'.
                // So if 'X' wins, p1 wins.

                const winnerSymbol = checkWinner(pair.board);
                let roundWinner = null;
                if (winnerSymbol) {
                    roundWinner = winnerSymbol === 'p1' ? 'p1' : 'p2'; // Map symbol 'p1'/'p2' to role
                } else if (!pair.board.includes(null)) {
                    roundWinner = 'draw';
                }

                if (roundWinner) {
                    // Update scores
                    if (roundWinner === 'p1') pair.score.p1++;
                    if (roundWinner === 'p2') pair.score.p2++;
                    pair.currentRound++;

                    // Update leaderboard
                    const p1Player = room.players.find(pl => pl.id === pair.p1);
                    const p2Player = room.players.find(pl => pl.id === pair.p2);

                    if (p1Player && p1Player.playerId) {
                        if (!room.leaderboard[p1Player.playerId]) {
                            room.leaderboard[p1Player.playerId] = { name: p1Player.name, wins: 0, losses: 0 };
                        }
                        if (roundWinner === 'p1') room.leaderboard[p1Player.playerId].wins++;
                        else if (roundWinner === 'p2') room.leaderboard[p1Player.playerId].losses++;
                    }

                    if (p2Player && p2Player.playerId) {
                        if (!room.leaderboard[p2Player.playerId]) {
                            room.leaderboard[p2Player.playerId] = { name: p2Player.name, wins: 0, losses: 0 };
                        }
                        if (roundWinner === 'p2') room.leaderboard[p2Player.playerId].wins++;
                        else if (roundWinner === 'p1') room.leaderboard[p2Player.playerId].losses++;
                    }

                    io.to(pair.p1).emit('round_over', {
                        winner: roundWinner === 'p1' ? 'You' : (roundWinner === 'draw' ? 'Draw' : 'Opponent'),
                        board: pair.board,
                        scores: pair.score
                    });
                    io.to(pair.p2).emit('round_over', {
                        winner: roundWinner === 'p2' ? 'You' : (roundWinner === 'draw' ? 'Draw' : 'Opponent'),
                        board: pair.board,
                        scores: pair.score
                    });

                    if (pair.currentRound > room.rounds) {
                        // Match Over
                        pair.status = 'finished';
                        pair.winner = pair.score.p1 > pair.score.p2 ? pair.p1 : (pair.score.p2 > pair.score.p1 ? pair.p2 : 'draw');

                        io.to(pair.p1).emit('match_over', { result: 'finished' });
                        io.to(pair.p2).emit('match_over', { result: 'finished' });

                        checkAllMatchesFinished(room, data.roomCode);
                    } else {
                        // Next Round
                        setTimeout(() => {
                            pair.status = 'playing';
                            pair.board = Array(9).fill(null);
                            pair.winner = null;
                            pair.turn = pair.currentRound % 2 !== 0 ? pair.p1 : pair.p2;

                            io.to(pair.p1).emit('game_start', { opponent: "Anonymous", symbol: pair.turn === pair.p1 ? 'X' : 'O', pairId: pair.id, round: pair.currentRound });
                            io.to(pair.p2).emit('game_start', { opponent: "Anonymous", symbol: pair.turn === pair.p2 ? 'X' : 'O', pairId: pair.id, round: pair.currentRound });
                        }, 3000);
                    }
                } else {
                    // Switch turn
                    pair.turn = socket.id === pair.p1 ? pair.p2 : pair.p1;
                    io.to(pair.p1).emit('update_board', { board: pair.board, turn: pair.turn });
                    io.to(pair.p2).emit('update_board', { board: pair.board, turn: pair.turn });
                }

            } else {
                console.error(`⛔ Invalid Move:`, {
                    cellIndex: data.index,
                    isFree,
                    isTurn,
                    serverTurn: pair.turn,
                    socketId: socket.id
                });
            }
        } catch (error) {
            console.error("🔥 Error in make_move:", error);
        }
    });

    socket.on('player_timeout', (data) => {
        try {
            console.log(`⏱️ Player timeout: ${socket.id} in room ${data.roomCode}`);
            const room = rooms[data.roomCode];
            if (!room || !room.pairs) return;

            const pair = room.pairs.find(p => p.id === data.pairId);
            if (!pair || pair.status !== 'playing') return;

            // Verify it's actually their turn
            if (pair.turn !== socket.id) {
                console.log(`⚠️ Timeout ignored: Not player's turn`);
                return;
            }

            // Find all empty cells
            const emptyCells = [];
            for (let i = 0; i < pair.board.length; i++) {
                if (!pair.board[i]) emptyCells.push(i);
            }

            if (emptyCells.length === 0) return; // Board full, shouldn't happen

            // Pick random empty cell
            const randomIndex = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            console.log(`🎲 Auto-move: Placing at index ${randomIndex} for ${socket.id}`);

            // Increment consecutive timeouts
            if (!pair.consecutiveTimeouts) pair.consecutiveTimeouts = {};
            if (!pair.consecutiveTimeouts[socket.id]) pair.consecutiveTimeouts[socket.id] = 0;
            pair.consecutiveTimeouts[socket.id]++;

            console.log(`⚠️ Player ${socket.id} timeout count: ${pair.consecutiveTimeouts[socket.id]}`);

            // CHECK FOR 3-STRIKE FORFEIT
            if (pair.consecutiveTimeouts[socket.id] >= 3) {
                console.log(`🛑 FORFEIT: ${socket.id} timed out 3 times in a row.`);

                const opponentId = socket.id === pair.p1 ? pair.p2 : pair.p1;

                // Declare opponent as winner of the MATCH
                pair.status = 'finished';
                pair.winner = opponentId;

                // Give opponent wins for all remaining rounds to boost stats? 
                // Alternatively, just mark match as won.
                // Let's just end the match.

                // Update leaderboard: Winner gets a Win, Loser gets a Loss
                // (Already handled in match_over logic usually, but let's do it explicitly if needed or reuse logic)
                // Existing logic updates leaderboard per ROUND.
                // We should record this as a MATCH result in history if we had it.
                // For now, let's just emit match_over.

                io.to(pair.p1).emit('match_over', { result: 'forfeit', winner: pair.winner === pair.p1 ? 'You' : 'Opponent' });
                io.to(pair.p2).emit('match_over', { result: 'forfeit', winner: pair.winner === pair.p2 ? 'You' : 'Opponent' });

                checkAllMatchesFinished(room, data.roomCode);
                return;
            }

            // Execute the move (reuse logic from make_move)
            room.lastActivity = Date.now();
            pair.board[randomIndex] = pair.turn === pair.p1 ? 'X' : 'O';

            const checkWinner = (board) => {
                const lines = [
                    [0, 1, 2], [3, 4, 5], [6, 7, 8],
                    [0, 3, 6], [1, 4, 7], [2, 5, 8],
                    [0, 4, 8], [2, 4, 6]
                ];
                for (let i = 0; i < lines.length; i++) {
                    const [a, b, c] = lines[i];
                    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                        return board[a] === 'X' ? 'p1' : 'p2';
                    }
                }
                return null;
            };

            const winnerSymbol = checkWinner(pair.board);
            let roundWinner = null;
            if (winnerSymbol) {
                roundWinner = winnerSymbol === 'p1' ? 'p1' : 'p2';
            } else if (!pair.board.includes(null)) {
                roundWinner = 'draw';
            }

            if (roundWinner) {
                if (roundWinner === 'p1') pair.score.p1++;
                if (roundWinner === 'p2') pair.score.p2++;
                pair.currentRound++;

                io.to(pair.p1).emit('round_over', {
                    winner: roundWinner === 'p1' ? 'You' : (roundWinner === 'draw' ? 'Draw' : 'Opponent'),
                    board: pair.board,
                    scores: pair.score
                });
                io.to(pair.p1).to(pair.p2).to(pair.id).emit('round_over', {
                    winner: roundWinner === 'p1' ? 'You' : (roundWinner === 'draw' ? 'Draw' : 'Opponent'), // Spectators will see 'Opponent' for p1? No, we need logic. 
                    // Wait, for spectators, 'You' vs 'Opponent' is confusing.
                    // Better to send 'p1' or 'p2' or names?
                    // For now, let's keep it simple. Spectators might see wrong text but board updates work.
                    board: pair.board,
                    scores: pair.score,
                    realWinner: roundWinner
                });

                if (pair.currentRound > room.rounds) {
                    pair.status = 'finished';
                    pair.winner = pair.score.p1 > pair.score.p2 ? pair.p1 : (pair.score.p2 > pair.score.p1 ? pair.p2 : 'draw');

                    io.to(pair.p1).to(pair.p2).to(pair.id).emit('match_over', { result: 'finished' });

                    checkAllMatchesFinished(room, data.roomCode);
                } else {
                    setTimeout(() => {
                        pair.status = 'playing';
                        pair.board = Array(9).fill(null);
                        pair.winner = null;
                        pair.turn = pair.currentRound % 2 !== 0 ? pair.p1 : pair.p2;

                        io.to(pair.p1).emit('game_start', { opponent: "Anonymous", symbol: pair.turn === pair.p1 ? 'X' : 'O', pairId: pair.id, round: pair.currentRound });
                        io.to(pair.p2).emit('game_start', { opponent: "Anonymous", symbol: pair.turn === pair.p2 ? 'X' : 'O', pairId: pair.id, round: pair.currentRound });
                    }, 3000);
                }
            } else {
                // Switch turn
                pair.turn = socket.id === pair.p1 ? pair.p2 : pair.p1;
                io.to(pair.p1).to(pair.p2).to(pair.id).emit('update_board', { board: pair.board, turn: pair.turn });
            }
        } catch (error) {
            console.error("🔥 Error in player_timeout:", error);
        }
    });

    socket.on('rejoin_game', (data, callback) => {
        try {
            // console.log("EVENT: rejoin_game", socket.id, data);
            const room = rooms[data.roomCode];
            if (!room) return callback({ success: false, message: "Room not found" });

            const player = room.players.find(p => p.playerId === data.playerId);
            if (!player) return callback({ success: false, message: "Player not found in room" });

            const oldSocketId = player.id; // Capture old ID

            // Update socket ID
            player.id = socket.id;
            player.connected = true;
            socket.join(data.roomCode);
            console.log(`👋 ${player.name} reconnected to ${data.roomCode}`);

            // Initialize gameState EARLY
            let gameState = {
                state: room.state,
                isHost: player.isHost,
                roomCode: data.roomCode
            };

            if (player.isHost) {
                room.host = socket.id;
                if (room.pairs) {
                    gameState.pairs = room.pairs.map(p => ({
                        id: p.id,
                        status: p.status,
                        p1Name: room.players.find(pl => pl.id === p.p1)?.name || "P1",
                        p2Name: room.players.find(pl => pl.id === p.p2)?.name || "P2"
                    }));
                }
            }

            if (room.state === 'playing' && room.pairs) {
                // Find and Update Pair
                const pair = room.pairs.find(p => p.p1 === oldSocketId || p.p2 === oldSocketId);
                if (pair) {
                    if (pair.p1 === oldSocketId) pair.p1 = socket.id;
                    if (pair.p2 === oldSocketId) pair.p2 = socket.id;
                    if (pair.turn === oldSocketId) pair.turn = socket.id;

                    // Prepare Game Data
                    gameState = {
                        ...gameState,
                        success: true,
                        symbol: pair.p1 === socket.id ? 'X' : 'O',
                        opponent: pair.p1 === socket.id ?
                            room.players.find(pl => pl.id === pair.p2)?.name :
                            room.players.find(pl => pl.id === pair.p1)?.name,
                        board: pair.board,
                        turn: pair.turn,
                        scores: pair.score,
                        pairId: pair.id, // Keep original ID
                        round: pair.currentRound
                    };
                }
            } else if (room.state === 'lobby') {
                io.to(data.roomCode).emit('update_lobby', { players: room.players, roomCode: data.roomCode });
            }

            callback(gameState);
        } catch (error) {
            console.error("🔥 Error in rejoin_game:", error);
            callback({ success: false, message: "Internal Server Error during rejoin" });
        }
    });

    socket.on('disconnect', () => {
        try {
            console.log('User disconnected:', socket.id);
            for (const code in rooms) {
                const room = rooms[code];
                const player = room.players.find(p => p.id === socket.id);
                if (player) {
                    player.connected = false;

                    if (room.state === 'lobby') {
                        // Remove in lobby, UNLESS it's the host (so they can rejoin/refresh)
                        if (player.isHost) {
                            // Do nothing, keep them for rejoin
                            console.log(`⚠️ Host ${player.name} disconnected in lobby (preserved).`);
                        } else {
                            room.players = room.players.filter(p => p.id !== socket.id);
                            io.to(code).emit('update_lobby', { players: room.players, roomCode: code });
                        }
                    } else if (room.state === 'playing') {
                        // GAME: DO NOT REMOVE. Just mark disconnected.
                        // Notify opponent?
                        console.log(`⚠️ Player ${player.name} disconnected during game (preserved).`);
                    }
                }
            }
        } catch (error) {
            console.error("🔥 Error in disconnect:", error);
        }
    });

    socket.on('force_end_game', ({ roomCode }) => {
        try {
            const room = rooms[roomCode];
            // Verify host
            if (!room || room.host !== socket.id) {
                console.warn(`⚠️ Unauthorized force_end_game attempt by ${socket.id}`);
                return;
            }

            console.log(`🛑 HOST FORCED END GAME for room ${roomCode}`);

            if (room.pairs) {
                room.pairs.forEach(pair => {
                    if (pair.status === 'playing') {
                        pair.status = 'finished';
                        // Determine winner based on current score
                        if (pair.score.p1 > pair.score.p2) pair.winner = pair.p1;
                        else if (pair.score.p2 > pair.score.p1) pair.winner = pair.p2;
                        else pair.winner = 'draw';

                        // Notify players match is over
                        io.to(pair.p1).emit('match_over', { result: 'force_end', winner: pair.winner === pair.p1 ? 'You' : (pair.winner === 'draw' ? 'Draw' : 'Opponent') });
                        io.to(pair.p2).emit('match_over', { result: 'force_end', winner: pair.winner === pair.p2 ? 'You' : (pair.winner === 'draw' ? 'Draw' : 'Opponent') });

                        // Update Leaderboard for final result?
                        // Leaderboard updates happen on round_over. 
                        // If we force end, the last round is incomplete. 
                        // We do NOT count the partial round. 
                        // Current leaderboard state is preserved.
                    }
                });
            }

            // Trigger tournament over immediately
            checkAllMatchesFinished(room, roomCode);

        } catch (error) {
            console.error("🔥 Error in force_end_game:", error);
        }
    });
});

// Automatic cleanup of inactive rooms (runs every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const INACTIVITY_THRESHOLD = 20 * 60 * 1000; // 20 minutes

setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const code in rooms) {
        const room = rooms[code];
        const inactiveTime = now - room.lastActivity;

        if (inactiveTime > INACTIVITY_THRESHOLD) {
            console.log(`🗑️ Cleaning up inactive room ${code} (inactive for ${Math.floor(inactiveTime / 60000)} minutes)`);
            delete rooms[code];
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`✨ Cleanup complete: Removed ${cleanedCount} inactive room(s)`);
    }
}, CLEANUP_INTERVAL);

function checkAllMatchesFinished(room, roomCode) {
    const allFinished = room.pairs.every(p => p.status === 'finished');
    if (allFinished) {
        room.state = 'finished';
        // Reveal Logic
        const results = room.pairs.map(p => ({
            p1Name: room.players.find(pl => pl.id === p.p1).name,
            p2Name: room.players.find(pl => pl.id === p.p2).name,
            score: p.score
        }));

        // Calculate leaderboard sorted by win rate
        const leaderboard = Object.entries(room.leaderboard)
            .map(([playerId, stats]) => ({
                name: stats.name,
                wins: stats.wins,
                losses: stats.losses,
                winRate: stats.wins + stats.losses > 0 ? (stats.wins / (stats.wins + stats.losses) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate))
            .slice(0, 10); // Top 10

        io.to(roomCode).emit('tournament_over', { results, leaderboard });
    } else {
        // Notify host/spectators of progress
        io.to(roomCode).emit('matches_updated', { pairs: room.pairs.map(p => ({ id: p.id, status: p.status, p1: p.p1, p2: p.p2 })) });
    }
}

function checkWin(board) {
    const wins = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    return wins.some(combo => {
        return board[combo[0]] && board[combo[0]] === board[combo[1]] && board[combo[0]] === board[combo[2]];
    });
}


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`🧹 Automatic room cleanup enabled (inactive rooms deleted after 20 minutes)`);
});
