import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';

function DebugConsole() {
    const [logs, setLogs] = useState([]);
    const [isVisible, setIsVisible] = useState(false);
    const logsEndRef = useRef(null);

    useEffect(() => {
        const originalOnevent = socket.onevent;
        const originalEmit = socket.emit;

        // Patch socket to capture incoming events
        socket.onevent = (packet) => {
            const args = packet.data || [];
            addLog('⬇️ RECV', args[0], args[1]);
            if (originalOnevent) originalOnevent.call(socket, packet);
        };

        // Patch emit to capture outgoing events
        socket.emit = (...args) => {
            addLog('⬆️ SEND', args[0], args[1]);
            return originalEmit.apply(socket, args);
        };

        return () => {
            socket.onevent = originalOnevent;
            socket.emit = originalEmit;
        };
    }, []);

    const addLog = (type, event, data) => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [...prev.slice(-49), { time, type, event, data: JSON.stringify(data) }]);
    };

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs]);

    if (!isVisible) {
        return (
            <button
                onClick={() => setIsVisible(true)}
                style={{
                    position: 'fixed', bottom: '10px', right: '10px',
                    background: 'rgba(0,0,0,0.8)', color: '#00ff00',
                    border: '1px solid #00ff00', borderRadius: '5px',
                    padding: '5px 10px', fontSize: '0.8em', zIndex: 9999
                }}
            >
                📟 Debug Logs
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed', bottom: '10px', right: '10px',
            width: '400px', height: '300px',
            background: 'rgba(0, 0, 0, 0.9)',
            border: '1px solid #00ff00',
            borderRadius: '10px',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'monospace', fontSize: '0.8em',
            zIndex: 9999, overflow: 'hidden',
            boxShadow: '0 0 20px rgba(0, 255, 0, 0.2)'
        }}>
            <div style={{
                padding: '5px 10px', background: '#003300', borderBottom: '1px solid #00ff00',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#00ff00'
            }}>
                <span>📟 System Logs</span>
                <button
                    onClick={() => setIsVisible(false)}
                    style={{ background: 'transparent', border: 'none', color: '#00ff00', cursor: 'pointer' }}
                >
                    ❌
                </button>
            </div>
            <div style={{
                flex: 1, overflowY: 'auto', padding: '10px', color: '#fff'
            }}>
                {logs.map((log, i) => (
                    <div key={i} style={{ marginBottom: '5px', borderBottom: '1px solid #333' }}>
                        <span style={{ color: '#666' }}>[{log.time}]</span>{' '}
                        <span style={{ color: log.type === '⬆️ SEND' ? '#ff00ea' : '#00ffea', fontWeight: 'bold' }}>{log.type}</span>{' '}
                        <span style={{ color: '#ffd700' }}>{log.event}</span>
                        {log.data && <div style={{ color: '#aaa', fontSize: '0.9em', whiteSpace: 'pre-wrap' }}>{log.data}</div>}
                    </div>
                ))}
                <div ref={logsEndRef} />
            </div>
        </div>
    );
}

export default DebugConsole;
