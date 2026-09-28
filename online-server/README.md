# Legends of the Rift — Online Server

This folder is the real-time server used by the game's **ONLINE** menu. The normal AI battle remains entirely client-side and does not depend on this server.

## Run locally

```bash
npm install
npm start
```

The server listens on port `2567` by default. The game can connect to:

`ws://localhost:2567`

## Deploy

Deploy this folder as a long-running Node.js WebSocket service. Set the service's start command to `npm start` and expose its assigned port. After deployment, enter the resulting `wss://...` WebSocket address in the game's **ONLINE → SERVER** field.

The included server provides:
- 2-player room creation with 6-character codes
- room joining and disconnect handling
- synchronized player inputs
- host-authoritative periodic game snapshots
- match start and finish events
- a `/health` endpoint

The frontend remains a static HTML game, so your existing Vercel deployment can continue serving the game files while this small server handles the persistent WebSocket connection.
