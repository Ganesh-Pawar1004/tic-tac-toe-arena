import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

function Results() {
    const location = useLocation();
    const navigate = useNavigate();
    const results = location.state?.results || [];

    const copyResults = () => {
        const text = `🏆 Tournament Results 🏆\n\n` + results.map(r =>
            `${r.p1Name} vs ${r.p2Name}: ${r.score.p1}-${r.score.p2} (${r.score.p1 > r.score.p2 ? r.p1Name : (r.score.p2 > r.score.p1 ? r.p2Name : 'Draw')} Won)`
        ).join('\n');
        navigator.clipboard.writeText(text);
        alert("Results copied to clipboard! 📋");
    };

    return (
        <div className="results-screen" style={{ textAlign: 'center', padding: '20px' }}>
            <h1 style={{ fontSize: '3em', marginBottom: '20px', textShadow: '0 0 20px #ffd700' }}>🏆 Tournament Results 🏆</h1>

            <div className="results-grid" style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: '30px',
                maxWidth: '1200px', margin: '0 auto'
            }}>
                {results.map((res, i) => (
                    <motion.div
                        key={i}
                        className="result-card"
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.2 }}
                        style={{
                            background: 'rgba(255,255,255,0.05)', padding: '25px',
                            borderRadius: '20px', border: '1px solid rgba(255,215,0,0.3)',
                            backdropFilter: 'blur(10px)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
                        }}
                    >
                        <h3 style={{ color: '#00ffea', marginBottom: '15px' }}>Match {i + 1}</h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.2em' }}>
                            <span style={{ fontWeight: res.score.p1 > res.score.p2 ? 'bold' : 'normal', color: res.score.p1 > res.score.p2 ? '#00ff00' : '#fff' }}>
                                {res.p1Name}
                            </span>
                            <span style={{ fontWeight: 'bold', fontSize: '1.5em', color: '#ffd700', padding: '0 15px' }}>
                                {res.score.p1} - {res.score.p2}
                            </span>
                            <span style={{ fontWeight: res.score.p2 > res.score.p1 ? 'bold' : 'normal', color: res.score.p2 > res.score.p1 ? '#00ff00' : '#fff' }}>
                                {res.p2Name}
                            </span>
                        </div>
                        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', color: '#aaa' }}>
                            Winner: <span style={{ color: '#fff', fontWeight: 'bold' }}>
                                {res.score.p1 > res.score.p2 ? res.p1Name : (res.score.p2 > res.score.p1 ? res.p2Name : 'Draw')}
                            </span>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="actions" style={{ marginTop: '50px', display: 'flex', gap: '20px', justifyContent: 'center' }}>
                <button onClick={copyResults} style={{ background: '#00ffea', color: '#000', fontWeight: 'bold' }}>
                    📋 Copy Summary
                </button>
                <button className="secondary" onClick={() => navigate('/')}>
                    🏠 Back to Lobby
                </button>
            </div>
        </div>
    );
}

export default Results;
