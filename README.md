# EDP Backend - Realtime Server

This is the Node.js backend for the collaborative notes and video calling application, designed for deployment on Raspberry Pi 5.

## Architecture
- **API & Signaling**: Express routing + WebSocket server.
- **Collaboration**: Yjs binary updates sent over WebSockets.
- **Video (Future Phase)**: WebRTC SFU integration stubbed out for signaling.

## Setup & Run

Install dependencies:
```bash
npm install
```

Start the dev server (with hot reload via `tsx` or `ts-node`):
```bash
npm run dev
```

Build and run for production (Raspberry Pi 5):
```bash
npm run build
npm start
```

## WebSocket Contract
The server uses a single WebSocket endpoint to multiplex Yjs updates and signaling JSON messages.

1. **Join Room**:
   ```json
   { "type": "join", "roomId": "room-123" }
   ```
2. **Yjs Sync**: Send binary `Uint8Array` payloads.
3. **WebRTC Setup**: Use JSON messages `webrtc:connect`, `webrtc:produce`, etc.