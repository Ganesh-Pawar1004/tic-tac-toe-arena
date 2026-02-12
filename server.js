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

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    // console.log(`🔌 User connected: ${socket.id}`);

    socket.on('create_room', (data, callback) => {
        // console.log("EVENT: create_room", socket.id);
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            host: socket.id,
            hostPlayerId: data.playerId,
            players: [{ id: socket.id, name: "Host", isHost: true, playerId: data.playerId, connected: true }],
            rounds: parseInt(data.rounds) || 3, // Ensure integer
            state: 'lobby' // lobby, playing, finished
        };

        socket.join(roomCode);
        console.log(`Room created: ${roomCode} by ${socket.id}`);

        // Callback to client with room code
        callback({ success: true, roomCode: roomCode });
    });

    socket.on('join_room', (data, callback) => {
        console.log("EVENT: join_room", socket.id, data);
        const room = rooms[data.roomCode];
        if (!room) {
            return callback({ success: false, message: "Room not found" });
        }
        if (room.state !== 'lobby') {
            return callback({ success: false, message: "Game already in progress" });
        }

        // Check if player is rejoining (though rejoin_game should handle this, 
        // sometimes users might clear storage and try to join again with same name? 
        // For now, assume new join unless rejoined).
        const player = {
            id: socket.id,
            name: data.name || `Player ${room.players.length + 1}`,
            isHost: false,
            playerId: data.playerId,
            connected: true
        };
        room.players.push(player);
        socket.join(data.roomCode);

        console.log(`${player.name} joined room ${data.roomCode}`);

        // Notify everyone in the room (including sender) to update lobby
        io.to(data.roomCode).emit('update_lobby', { players: room.players, roomCode: data.roomCode });

        callback({ success: true, roomCode: data.roomCode, isHost: false });
    });

    socket.on('start_game', (data) => {
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
            pairs: pairs.map(p => ({ id: p.id, status: 'playing', p1Name: p.p1, p2Name: p.p2 }))
        });

        // Notify host/spectators (Global update)
        io.to(data.roomCode).emit('matches_updated', { pairs: pairs.map(p => ({ id: p.id, status: 'playing' })) });
    });

    socket.on('make_move', (data) => {
        console.log(`♟️ MOVE REQUEST:`, data);
        const room = rooms[data.roomCode];
        if (!room) {
            console.error(`❌ Room ${data.roomCode} not found`);
            return;
        }

        const pair = room.pairs.find(p => p.id === data.pairId);
        if (!pair) {
            console.error(`❌ Pair ${data.pairId} not found`);
            return;
        }
        if (pair.status !== 'playing') {
            console.warn(`⚠️ Move rejected: Match not in playing state (${pair.status})`);
            return;
        }

        const isTurn = pair.turn === socket.id;
        const isFree = pair.board[data.index] === null;

        if (isFree && isTurn) {
            console.log(`✅ Valid Move at ${data.index} by ${socket.id}`);
            const symbol = socket.id === pair.p1 ? 'X' : 'O';
            pair.board[data.index] = symbol;

            let roundOver = false;
            let roundWinner = null; // 'p1', 'p2', 'draw'

            // Check Win
            if (checkWin(pair.board)) {
                roundWinner = socket.id === pair.p1 ? 'p1' : 'p2';
                pair.score[roundWinner]++;
                roundOver = true;
            } else if (pair.board.every(c => c !== null)) {
                roundWinner = 'draw';
                roundOver = true;
            }

            if (roundOver) {
                pair.currentRound++;
                pair.status = 'transition'; // Block moves

                // Notify result of this round
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
                    // Next Round after delay
                    setTimeout(() => {
                        pair.status = 'playing'; // Resume play
                        pair.board = Array(9).fill(null);
                        pair.winner = null;

                        // Swap starting turn
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
    });

    socket.on('rejoin_game', (data, callback) => {
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

        if (room.state === 'playing') {
            // Find their game
            const pair = room.pairs.find(p => p.p1 === player.id || p.p2 === player.id || p.p1 === data.playerId || p.p2 === data.playerId);
            // Note: pair stores socket IDs. We need to update pair socket IDs too if they changed! 
            // Actually, we should store playerId in pairs to be safe, but let's fix the socket IDs in the pair.

            // Re-find pair by looking for the OLD socket ID? strict mapping is hard if we lost the old socket ID.
            // Better: Players in room have the *new* ID now (we just updated `player.id = socket.id`).
            // We need to update the pair logic.

            // Let's iterate pairs and find which one *was* this player.
            // Since we updated `player.id` in the `players` array, we need to know who they were in the pair.
            // The pair stores `p1` and `p2` as strings (IDs). 
            // This is tricky. We should store `p1Id` and `p2Id` (socket IDs) AND `p1PlayerId` etc.
            // OR, since loop updated `player.id`, we can find the player object in `room.players` by `playerId` (already done).
            // But `pairs` has copies of IDs? No, `pairs` has strings.

            // Fix: We need to update the PAIR data to point to the new socket ID.
            const match = room.pairs.find(p => {
                const p1Obj = room.players.find(pl => pl.id === p.p1); // This lookup might fail if p.p1 is old socket ID
                // We need to check if the pair's p1 matches the *old* ID? 
                // We don't have the old ID easily unless we stored it.

                // Let's rely on `playerId` being in `room.players`.
                // We can search room.pairs for a p1/p2 that *corresponds* to this player *before* we updated the ID?
                // No, we already updated it.

                // Alternative: Add `previousSocketId` to player? 
                // Or: Store `playerId` in the pair from the start!
                return false;
            });

            // CRITICAL: We need to support updating the pair. 
            // Let's modify `start_game` to store `playerId` in pairs too.
            // For now, let's just loop through pairs and see if any p1/p2 match the *current* player's `playerId`?
            // `pair` structure: { p1: socketId, p2: socketId ... }
            // We can't map back easily without extra data.

            // QUICK FIX FOR NOW: 
            // In `rejoin`, we iterate all pairs. For each p1/p2, we look correctly in `room.players` to see if that player has `playerId` === `data.playerId`.
            // But `room.players` has the NEW socket ID.
            // The pair has the OLD socket ID.

            // So: 
            // 1. Find the pair where `p1` (old ID) corresponds to the player? 
            //    We can't find the player by old ID because we overwrote it.

            // REFINED STRATEGY: 
            // When updating `player.id`, first capture the `oldSocketId`.
            // Then update the pair.
        }
        let gameState = {
            state: room.state,
            isHost: player.isHost,
            roomCode: data.roomCode
        };

        if (room.state === 'playing' && room.pairs) {
            // Find and Update Pair
            const pair = room.pairs.find(p => p.p1 === oldSocketId || p.p2 === oldSocketId);
            if (pair) {
                if (pair.p1 === oldSocketId) pair.p1 = socket.id;
                if (pair.p2 === oldSocketId) pair.p2 = socket.id;
                if (pair.turn === oldSocketId) pair.turn = socket.id;

                // Update pairId string to match new IDs? 
                // Currently pairId is `id-id`. If we change it, client might break.
                // Client uses pairId for moves. 
                // Ideally we should have used a UUID for pairId, not socket IDs.
                // But changing it now requires updating clients too. 
                // The client stores `pairId`. If we keep old pairId string, we must handle it.
                // Client sends `pairId`. Server looks up `p.id === data.pairId`.
                // If we DON'T update `p.id`, we are good, as long as `p.p1` and `p.p2` are updated.
                // So KEEP pair.id as is.

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
    });

    socket.on('disconnect', () => {
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
    });
});

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
        io.to(roomCode).emit('tournament_over', { results });
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
});
