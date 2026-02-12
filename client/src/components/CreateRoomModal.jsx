import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { motion } from 'framer-motion';

function CreateRoomModal({ onClose }) {
    const navigate = useNavigate();
    const [roomName, setRoomName] = useState('');
    const [rounds, setRounds] = useState(3);

    const handleCreate = () => {
        if (!roomName) return alert("Please give your arena a name!");

        const playerId = localStorage.getItem('playerId');

        // Assuming server handles 'create_room' and returns roomCode
        socket.emit('create_room', { roomName, rounds: parseInt(rounds), playerId }, (response) => {
            // response: { roomCode, success }
            if (response) {
                const code = response.roomCode || response;
                localStorage.setItem('lastRoom', code); // Save for reconnection
                navigate(`/lobby/${code}`, { state: { isHost: true, roomName, rounds } });
            }
        });
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100
        }}>
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="container"
                style={{ width: '400px', background: '#2c003e' }}
            >
                <h2>Configure Arena 🏟️</h2>

                <label style={{ display: 'block', textAlign: 'left', margin: '10px 0' }}>Arena Name</label>
                <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. Thunderdome"
                    style={{ width: '90%' }}
                />

                <label style={{ display: 'block', textAlign: 'left', margin: '10px 0' }}>Rounds per Match</label>
                <input
                    type="number"
                    value={rounds}
                    onChange={(e) => setRounds(e.target.value)}
                    min="1" max="10"
                    style={{ width: '90%' }}
                />

                <div className="buttons" style={{ marginTop: '20px' }}>
                    <button onClick={handleCreate}>Create & Enter Lobby</button>
                    <button className="secondary" onClick={onClose}>Cancel</button>
                </div>
            </motion.div>
        </div>
    );
}

export default CreateRoomModal;
