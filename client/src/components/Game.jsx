import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { motion } from 'framer-motion';

function Game() {
    const { roomCode } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [isWaitingForOthers, setIsWaitingForOthers] = useState(false);
    const [roundResult, setRoundResult] = useState(null); // { winner: string, visible: boolean }

    // State from navigation or defaults
    const [board, setBoard] = useState(Array(9).fill(null));
    const [isMyTurn, setIsMyTurn] = useState(location.state?.symbol === 'X');
    const [mySymbol, setMySymbol] = useState(location.state?.symbol || null);
    const symbolRef = useRef(location.state?.symbol || null);
    const [opponentName, setOpponentName] = useState(location.state?.opponent || "Anonymous");
    const [score, setScore] = useState({ me: 0, them: 0 });
    const [timer, setTimer] = useState(60); // Updated to 60 seconds
    const [pairId, setPairId] = useState(location.state?.pairId || null);

    // Turn Indicator Glow
    const glowStyle = isMyTurn ? {
        boxShadow: '0 0 40px #00ff00, inset 0 0 30px rgba(0, 255, 0, 0.2)',
        borderColor: '#00ff00'
    } : {};

    // 1. Socket Event Listeners
    useEffect(() => {
        if (roomCode) {
            localStorage.setItem('lastRoom', roomCode);
        }

        function onUpdateBoard(data) {
            // console.log("🎨 onUpdateBoard:", data);
            setBoard(data.board);
            if (data.turn) {
                const isMyTurnNow = socket.id === data.turn;
                // console.log(`🔄 Turn Update: Mine? ${isMyTurnNow} (Socket: ${socket.id}, Turn: ${data.turn})`);
                setIsMyTurn(isMyTurnNow);
            }
        }

        function onGameStart(data) {
            // console.log("🚀 onGameStart:", data);
            if (data.symbol) {
                setMySymbol(data.symbol);
                symbolRef.current = data.symbol;
            }
            if (data.pairId) setPairId(data.pairId);
            setBoard(Array(9).fill(null));

            const startingTurn = data.symbol === 'X';
            console.log(`🏁 Game Started. I am ${data.symbol}. My Turn? ${startingTurn}`);
            setIsMyTurn(startingTurn);
        }

        function onRoundOver(data) {
            console.log("🔔 onRoundOver:", data);

            // Show overlay
            setRoundResult({ winner: data.winner, visible: true });

            // Hide after 3 seconds (sync with server restart)
            setTimeout(() => {
                setRoundResult(null);
            }, 3000);

            const iAmP1 = symbolRef.current === 'X';
            const myScore = iAmP1 ? data.scores.p1 : data.scores.p2;
            const theirScore = iAmP1 ? data.scores.p2 : data.scores.p1;
            setScore({ me: myScore, them: theirScore });
        }

        function onMatchOver(data) {
            console.log("🏆 onMatchOver:", data);
            setIsWaitingForOthers(true);
        }

        function onGameWaiting(data) {
            console.log("⏳ onGameWaiting:", data);
            // Optionally set state to show a waiting message if desired, 
            // but for now, we'll just log it to avoid popup spam.
            // The pulsing "Match Complete" overlay handles the main waiting state after match.
        }

        function onTournamentOver(data) {
            console.log("🏁 Tournament Over:", data);
            navigate(`/results/${roomCode}`, { state: { results: data.results } });
        }

        socket.on('update_board', onUpdateBoard);
        socket.on('game_start', onGameStart);
        socket.on('round_over', onRoundOver);
        socket.on('match_over', onMatchOver);
        socket.on('game_waiting', onGameWaiting);
        socket.on('tournament_over', onTournamentOver);

        return () => {
            socket.off('update_board', onUpdateBoard);
            socket.off('game_start', onGameStart);
            socket.off('round_over', onRoundOver);
            socket.off('match_over', onMatchOver);
            socket.off('game_waiting', onGameWaiting);
            socket.off('tournament_over', onTournamentOver);
        };
    }, []);

    // 2. Timer Logic
    useEffect(() => {
        const timerInterval = setInterval(() => {
            setTimer(t => t > 0 ? t - 1 : 0);
        }, 1000);
        return () => clearInterval(timerInterval);
    }, []);

    // Reset timer on turn change
    useEffect(() => {
        setTimer(60); // Reset to 60s
    }, [isMyTurn]);

    // 3. User Interaction
    const handleCellClick = (index) => {
        console.log(`🖱️ Cell Clicked: ${index}. MyTurn: ${isMyTurn}, CellEmpty: ${!board[index]}`);

        if (!isMyTurn) {
            console.warn("⚠️ Not my turn!");
            return;
        }
        if (board[index]) {
            console.warn("⚠️ Cell occupied!");
            return;
        }

        console.log("📤 Emitting make_move...");
        socket.emit('make_move', {
            roomCode,
            pairId,
            index
        });
    };

    if (!mySymbol || !pairId) {
        return (
            <div className="container" style={{ textAlign: 'center' }}>
                <h2>⚠️ Connection Lost</h2>
                <p>Please return to the lobby and rejoin.</p>
                <p style={{ fontSize: '0.8em', color: '#aaa' }}>Debug: Missing Symbol or PairID</p>
                <a href="/" style={{ color: '#ffd700' }}>Back to Home</a>
            </div>
        );
    }

    return (
        <motion.div
            className="game-container"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        >
            {isWaitingForOthers && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.85)', zIndex: 100,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                    borderRadius: '20px'
                }}>
                    <h2 style={{ color: '#ffd700', textShadow: '0 0 10px #ff8c00' }}>Match Complete!</h2>
                    <p style={{ color: '#fff', fontSize: '1.2em' }}>Waiting for other gladiators...</p>
                    <div className="pulsing-text" style={{ fontSize: '2em', marginTop: '20px' }}>⏳</div>
                </div>
            )}

            {roundResult && roundResult.visible && (
                <motion.div
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        background: 'rgba(20, 0, 40, 0.95)', border: '2px solid #ffd700',
                        padding: '40px', borderRadius: '20px', zIndex: 99,
                        textAlign: 'center', boxShadow: '0 0 50px rgba(255, 215, 0, 0.5)'
                    }}
                >
                    <h2 style={{ fontSize: '2.5em', margin: 0, color: '#fff' }}>
                        {roundResult.winner === 'You' ? '🎉 YOU WON! 🎉' : (roundResult.winner === 'Draw' ? '🤝 DRAW! 🤝' : '💀 ROUND LOST')}
                    </h2>
                    <p style={{ color: '#aaa', marginTop: '10px' }}>Next round starting...</p>
                </motion.div>
            )}

            <div className="game-header" style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '15px', marginBottom: '20px'
            }}>
                <div className="opponent-info" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '1.5em' }}>🕵️‍♂️</span>
                    <span>{opponentName}</span>
                </div>
                <div className="score" style={{ fontSize: '2em', fontWeight: 'bold', color: '#ffd700' }}>
                    {score.me} - {score.them}
                </div>
                <div className="timer" style={{
                    border: `2px solid ${timer < 10 ? 'red' : '#00ff00'}`,
                    borderRadius: '50%', width: '40px', height: '40px',
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    {timer}
                </div>
            </div>

            <motion.div
                className="board"
                style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 100px)', gap: '15px',
                    padding: '20px', borderRadius: '25px',
                    transition: 'all 0.3s',
                    ...glowStyle
                }}
            >
                {board.map((cell, i) => (
                    <motion.div
                        key={i}
                        className="cell"
                        onClick={() => handleCellClick(i)}
                        whileHover={{ scale: !cell && isMyTurn ? 1.05 : 1, backgroundColor: !cell && isMyTurn ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)' }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            width: '100px', height: '100px',
                            background: 'rgba(255,255,255,0.05)',
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            fontSize: '4em', borderRadius: '15px', cursor: 'pointer',
                            color: cell === 'X' ? '#00ffea' : '#ff0080',
                            textShadow: cell ? `0 0 20px ${cell === 'X' ? '#00ffea' : '#ff0080'}` : 'none'
                        }}
                    >
                        {cell}
                    </motion.div>
                ))}
            </motion.div>
        </motion.div>
    );
}

export default Game;
