import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { socket } from '../socket';
import { motion } from 'framer-motion';

function HostDashboard() {
    const { roomCode } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [matches, setMatches] = useState(location.state?.pairs || []);

    useEffect(() => {
        function onMatchesUpdated(data) {
            // data: { pairs: [ { id, status, p1Name, p2Name } ] }
            setMatches(data.pairs);
        }

        function onTournamentOver(data) {
            navigate(`/results/${roomCode}`, { state: { results: data.results } });
        }

        socket.on('matches_updated', onMatchesUpdated);
        socket.on('tournament_over', onTournamentOver);

        return () => {
            socket.off('matches_updated', onMatchesUpdated);
            socket.off('tournament_over', onTournamentOver);
        };
    }, [roomCode, navigate]);

    const spectateMatch = (pairId) => {
        // Navigate to Game component but in spectator mode
        // Game component needs to handle 'isSpectator'
        socket.emit('spectate_match', { roomCode, pairId });
        navigate(`/game/${roomCode}`, { state: { isSpectator: true, pairId } });
    };

    return (
        <div className="host-dashboard">
            <h2>Tournament Monitor 👁️</h2>
            <div className="status-bar" style={{ marginBottom: '20px', color: '#00ffea' }}>
                Active Matches: {matches.filter(m => m.status === 'playing').length}
            </div>

            <div className="carousel-container" style={{
                display: 'flex', overflowX: 'auto', gap: '20px', padding: '20px',
                scrollSnapType: 'x mandatory'
            }}>
                {matches.map((m, i) => (
                    <motion.div
                        key={m.id}
                        className="monitor-card"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        style={{
                            minWidth: '250px', background: 'linear-gradient(145deg, #2b1055, #7597de)',
                            padding: '20px', borderRadius: '20px',
                            border: '2px solid rgba(255,255,255,0.1)',
                            scrollSnapAlign: 'start', cursor: 'pointer'
                        }}
                        whileHover={{ scale: 1.05, borderColor: '#ffd700' }}
                        onClick={() => spectateMatch(m.id)}
                    >
                        <h3>Match {i + 1}</h3>
                        <div style={{ fontSize: '1.2em', margin: '10px 0' }}>
                            {m.p1Name || 'P1'} vs {m.p2Name || 'P2'}
                        </div>
                        <div className="status" style={{
                            background: m.status === 'playing' ? 'rgba(0,255,0,0.2)' : 'rgba(255,255,255,0.1)',
                            padding: '5px 10px', borderRadius: '10px', display: 'inline-block'
                        }}>
                            {m.status.toUpperCase()}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

export default HostDashboard;
