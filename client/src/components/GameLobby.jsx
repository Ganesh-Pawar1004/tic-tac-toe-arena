import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { motion, AnimatePresence } from 'framer-motion';

function GameLobby() {
    const { roomCode } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const isHost = location.state?.isHost || false;
    const [players, setPlayers] = useState([]);

    useEffect(() => {
        // Listen for lobby updates
        function onUpdateLobby(data) {
            setPlayers(data.players);
        }

        if (roomCode) {
            localStorage.setItem('lastRoom', roomCode);
        }

        function onGameStart(data) {
            // data might contain different things for players vs host
            // For now, redirect everyone to Game
            navigate(`/game/${roomCode}`, { state: { ...location.state, ...data } });
        }

        function onHostMonitorStart(data) {
            console.log("📺 Host Monitor Start received:", data);
            if (isHost || data.isHost) {
                navigate(`/monitor/${roomCode}`, { state: { ...data, isHost: true } });
            }
        }

        socket.on('update_lobby', onUpdateLobby);
        socket.on('game_start', onGameStart); // Players listen for this
        socket.on('host_monitor_start', onHostMonitorStart); // Host listens for this

        // If we just refreshed or joined directly without state (edge case), we might need to fetch lobby info
        // For now assume flow is correct.

        return () => {
            socket.off('update_lobby', onUpdateLobby);
            socket.off('game_start', onGameStart);
            socket.off('host_monitor_start', onHostMonitorStart);
        };
    }, [roomCode, navigate, isHost, location.state]);

    const copyLink = () => {
        const url = `${window.location.origin}/join/${roomCode}`; // Or just the room code
        navigator.clipboard.writeText(url).then(() => alert("Link Copied! 📋"));
    };

    const startGame = () => {
        socket.emit('start_game', { roomCode });
    };

    return (
        <div className="lobby-screen">
            <h2>Arena: <span style={{ color: '#ffd700' }}>{roomCode}</span></h2>

            <div className="share-section" style={{ margin: '20px 0' }}>
                <button className="btn secondary small" onClick={() => navigator.clipboard.writeText(roomCode)}>
                    Copy Code: {roomCode} 📋
                </button>
            </div>

            {isHost && (
                <div className="host-controls" style={{ margin: '20px 0' }}>
                    <button className="btn primary large" onClick={startGame}>
                        START TOURNAMENT ⚔️
                    </button>
                </div>
            )}

            <h3>Gladiators Ready: {players.length}</h3>

            <motion.div
                className="lobby-grid"
                layout
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: '20px',
                    width: '100%',
                    maxWidth: '1200px',
                    margin: '0 auto'
                }}
            >
                <AnimatePresence>
                    {players.map((p) => (
                        <motion.div
                            key={p.id}
                            layout
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            className="player-card"
                            style={{
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
                                borderRadius: '15px', padding: '20px', margin: '10px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                boxShadow: '0 10px 20px rgba(0,0,0,0.3)',
                                minWidth: '120px'
                            }}
                        >
                            <div style={{ fontSize: '3em' }}>{p.avatar || '🗿'}</div>
                            <div style={{ fontWeight: 'bold', color: '#ffd700' }}>{p.name}</div>
                            {p.isHost && <span className="badge" style={{ background: '#ff4757', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7em' }}>HOST</span>}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </motion.div>

            {!isHost && <p className="pulsing-text">Waiting for host to start...</p>}
        </div>
    );
}

export default GameLobby;
