import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { socket } from '../socket';
import { motion } from 'framer-motion';

function MonitorDashboard() {
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
            navigate(`/results/${roomCode}`, { state: { results: data.results, leaderboard: data.leaderboard } });
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

    useEffect(() => {
        console.log("📺 MonitorDashboard mounted. Matches:", matches);
    }, []);

    return (
        <div className="host-dashboard" style={{ padding: '20px', minHeight: '100vh', background: '#1a1a2e' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <h2 style={{ margin: 0, fontSize: '2rem', textShadow: '0 0 10px rgba(0,255,234,0.5)' }}>Tournament Monitor 👁️</h2>
                <button
                    onClick={() => {
                        if (window.confirm("⚠️ ARE YOU SURE?\n\nThis will immediately END all active matches and calculate final results. Any waiting players will be cut short.")) {
                            socket.emit('force_end_game', { roomCode });
                        }
                    }}
                    style={{
                        backgroundColor: '#ff0055',
                        color: 'white',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        boxShadow: '0 0 15px rgba(255, 0, 85, 0.4)',
                        fontSize: '1rem',
                        transition: 'transform 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <span>🛑</span> End Tournament
                </button>
            </div>

            <div className="status-bar" style={{ marginBottom: '20px', color: '#00ffea', fontSize: '1.2rem' }}>
                Active Matches: <span style={{ fontWeight: 'bold' }}>{matches.filter(m => m.status === 'playing').length}</span>
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

export default MonitorDashboard;
