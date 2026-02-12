import { io } from 'socket.io-client';

// Use current origin in production (Render, etc.), fall back to localhost:3000 for local dev
const URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : undefined;

export const socket = io(URL, {
    autoConnect: false
});
