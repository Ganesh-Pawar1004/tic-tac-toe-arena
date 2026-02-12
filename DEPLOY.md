# 🚀 Deployment Guide for Tic-Tac-Toe Arena

This guide explains how to deploy the **Tic-Tac-Toe Arena** (Node.js + React) to a production environment like Render, Heroku, or Railway.

## 1. Prerequisites

*   **Node.js** (v18+)
*   **Git** installed
*   A user account on a deployment platform (e.g., [Render](https://render.com/), [Heroku](https://heroku.com/), or [Railway](https://railway.app/)).

## 2. Environment Variables

Create a `.env` file in the root directory (or configure these variables in your host's dashboard):

```env
PORT=3000
NODE_ENV=production
```

## 3. Deployment Steps (Example: Render.com)

1.  **Push to GitHub**: Ensure your code is pushed to a GitHub repository.
2.  **Create Web Service**:
    *   Go to Render Dashboard -> New -> Web Service.
    *   Connect your GitHub repository.
3.  **Configure Settings**:
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install && npm run build`
        *   *Note: This runs `npm install` for the server, then `npm run build` which installs client deps and builds React.*
    *   **Start Command**: `npm start`
4.  **Deploy**: Click "Create Web Service".

## 4. How it Works

*   The project is a **Monorepo** (Single Repository) containing both Backend and Frontend.
*   **Backend (`/`)**: Node.js + Express + Socket.io.
    *   Serves the API/Sockets.
    *   Serves the React static files from `client/dist`.
*   **Frontend (`/client`)**: React + Vite.
    *   Built into static HTML/JS/CSS files.
*   The `npm run build` script in the root `package.json` automates the entire process of installing client dependencies and creating the production build.

## 5. Troubleshooting during Deployment

*   **"Missing script: build"**: Ensure your root `package.json` has the scripts:
    ```json
    "scripts": {
        "start": "node server.js",
        "build": "npm install --prefix client && npm run build --prefix client"
    }
    ```
*   **Port Issues**: The server automatically uses `process.env.PORT` (standard for all hosts). Do not hardcode port 3000.

---
**Enjoy your Arena!** ⚔️
