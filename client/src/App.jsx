import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { socket } from './socket';
import Landing from './components/Landing';
import GameLobby from './components/GameLobby';
import Game from './components/Game';
import MonitorDashboard from './components/MonitorDashboard'; // For Host Monitor
import Results from './components/Results';
import DebugConsole from './components/DebugConsole';

function App() {
    const navigate = useNavigate();
    const [isConnected, setIsConnected] = useState(socket.connected);

    useEffect(() => {
        // 1. Generate/Retrieve Player ID
        let myId = localStorage.getItem('playerId');
        if (!myId) {
            myId = crypto.randomUUID();
            localStorage.setItem('playerId', myId);
        }
        console.log("🆔 Player ID:", myId);

        function onConnect() {
            console.log("🟢 onConnect triggered! Socket ID:", socket.id);
            setIsConnected(true);

            // 2. Auto-Rejoin if we were in a room
            const lastRoom = localStorage.getItem('lastRoom');
            console.log("📂 Checking localStorage for lastRoom:", lastRoom);

            if (lastRoom) {
                console.log("🔄 Attempting to rejoin room:", lastRoom);
                socket.emit('rejoin_game', { roomCode: lastRoom, playerId: myId }, (response) => {
                    console.log("📩 Rejoin response received:", response);
                    if (response.success) {
                        console.log("✅ Rejoined successfully!", response);

                        if (response.isHost) {
                            // Host Logic
                            if (response.state === 'playing' || response.state === 'lobby') {
                                // For host, we might need to fetch the pairs data again?
                                // HostDashboard listens to 'host_monitor_start' or just renders.
                                // If state is playing, HostDashboard needs 'pairs'.
                                // For now, send them to Lobby if lobby, Monitor if playing.
                                const target = response.state === 'lobby' ? `/lobby/${lastRoom}` : `/monitor/${lastRoom}`;
                                // We need to pass state. For monitor, we need pairs.
                                // Server didn't send pairs in 'gameState' for host yet. 
                                // Let's just navigate causing a mount, 
                                // and maybe HostDashboard should "fetch" data or listen for an update?
                                // Simplified: Navigate to Lobby, let them click Start? 
                                // No, if playing, go to monitor.
                                navigate(target, { state: { ...response, isHost: true } });
                            }
                        } else {
                            // Player Logic
                            if (response.state === 'playing') {
                                navigate(`/game/${lastRoom}`, { state: { ...response } });
                            } else if (response.state === 'lobby') {
                                navigate(`/lobby/${lastRoom}`, { state: { ...response } });
                            }
                        }
                    } else {
                        console.warn("❌ Rejoin failed:", response.message);
                        localStorage.removeItem('lastRoom'); // Clear stale session
                        navigate('/'); // gracefully handle room not found
                    }
                });
            }
        }

        function onDisconnect() {
            setIsConnected(false);
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);

        // Connect manually when app starts
        if (socket.connected) {
            onConnect(); // Handle case where socket is already connected (e.g. Strict Mode)
        } else {
            socket.connect();
        }

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
        };
    }, []);

    return (
        <div className="container">
            <h1>Anonymous Arena</h1>
            <div className="connection-status" style={{ fontSize: '0.8em', color: isConnected ? '#00ff00' : '#ff0000' }}>
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
            <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/lobby/:roomCode" element={<GameLobby />} />
                <Route path="/game/:roomCode" element={<Game />} />
                <Route path="/monitor/:roomCode" element={<MonitorDashboard />} />
                <Route path="/results/:roomCode" element={<Results />} />
            </Routes>
            <DebugConsole />
        </div>
    );
}

export default App;
