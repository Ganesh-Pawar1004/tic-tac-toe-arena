import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import CreateRoomModal from './CreateRoomModal';
import { motion } from 'framer-motion';

function Landing() {
    const navigate = useNavigate();
    const [showHostModal, setShowHostModal] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [playerName, setPlayerName] = useState('');

    const handleJoin = () => {
        if (!joinCode || !playerName) return alert("Please enter both Room Code and Name");

        const playerId = localStorage.getItem('playerId');

        socket.emit('join_room', { roomCode: joinCode, name: playerName, playerId }, (response) => {
            if (response.success) {
                localStorage.setItem('lastRoom', response.roomCode); // Save for reconnection
                navigate(`/lobby/${response.roomCode}`, { state: { isHost: false, name: playerName } });
            } else {
                alert(response.message);
            }
        });
    };

    return (
        <div className="landing-page">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="actions"
            >
                <button
                    className="btn primary large"
                    onClick={() => setShowHostModal(true)}
                >
                    Host Tournament 🏆
                </button>

                <div className="divider" style={{ margin: '20px 0', opacity: 0.5 }}>OR</div>

                <div className="join-form" style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="Room Code"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    />
                    <input
                        type="text"
                        placeholder="Your Name"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                    />
                    <button className="btn secondary" onClick={handleJoin}>Join Room 🚀</button>
                </div>
            </motion.div>

            {showHostModal && (
                <CreateRoomModal onClose={() => setShowHostModal(false)} />
            )}
        </div>
    );
}

export default Landing;
