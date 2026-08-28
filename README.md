# Vani — Realtime Backend

The realtime server behind [Vani](https://github.com/KunalBharadwaj/Vani_Frontend):
a collaborative notes / PDF / whiteboard app with live audio-video and an AI
assistant. It multiplexes **CRDT document sync**, **presence/roles**, and **call
signaling** over a single WebSocket, plus REST endpoints for auth, Agora tokens,
and AI.

[![Node](https://img.shields.io/badge/Node-22-339933)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-36%20passing-brightgreen)](#-testing--ci)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088ff)](.github/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-ISC-green)](#license)

**Frontend:** [KunalBharadwaj/Vani_Frontend](https://github.com/KunalBharadwaj/Vani_Frontend) &nbsp;·&nbsp; **Live:** https://vani-frontend.vercel.app

---

## Highlights (the hard parts)

- **Single WebSocket, two payload kinds** — **binary** frames are Yjs CRDT
  updates; **JSON** frames are control/signaling messages. Media never touches
  the server (Agora handles it); we only relay call invitations.
- **Yjs sync hub + durable store** — applies and rebroadcasts binary updates,
  persists them to **LevelDB**, sends full state on join, and answers periodic
  state-vector requests with a minimal diff (anti-entropy).
- **Rooms & roles** — per-room membership with a **host/owner** model and
  automatic host-fallback when a host disconnects, so rooms never deadlock.
- **Auth done properly** — Google OAuth2 → stateless JWT in an httpOnly cookie,
  a CSRF nonce, a WebSocket auth handshake (4001 on invalid/expired), and a
  fail-fast startup check for missing production secrets.
- **Validated inputs** — request bodies and WS messages are parsed with **zod**.
- **Agora RTC tokens** — stable string→uint32 UID mapping and short-lived tokens.

## Architecture

Full write-up with diagrams (system context, auth sequence, CRDT sync protocol,
module map, and the WebSocket message contract): **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Tech stack

| Area | Tech |
|------|------|
| Server | Node 22, Express 5, TypeScript (ESM) |
| Realtime | `ws`, Yjs, y-leveldb |
| Media | agora-token |
| Auth | Passport (Google OAuth2), jsonwebtoken |
| AI | Groq (`openai/gpt-oss-20b`), Google Gemini |
| Data | MongoDB (optional session logging), LevelDB |
| Validation / tests | zod, Vitest |

## 🧪 Testing & CI

- **36 unit tests** (Vitest) covering the room manager (roles, host-fallback,
  broadcast targeting), the Agora UID hashing, the JWT auth middleware, the AI
  command parsers, and the zod schemas.
- **CI** (GitHub Actions) runs **type-check/build → tests** on every push and PR.

```bash
npm test          # unit tests
npm run build     # tsc type-check + compile
```

## Getting started

```bash
npm install
cp .env.example .env    # fill in OAuth, JWT, Agora, Groq/Gemini, Mongo
npm run dev             # tsx watch on :3001
```

Production:

```bash
npm run build && npm start
```

See [`.env.example`](./.env.example) for every required variable. In production,
the server refuses to boot without `JWT_SECRET`, `GOOGLE_CLIENT_ID`, and
`GOOGLE_CLIENT_SECRET`.

## WebSocket contract (summary)

The client authenticates first (`{ type: "auth", token }`), then joins a room
(`{ type: "join", roomId }`), then exchanges binary Yjs updates and JSON
signaling. Full table in [ARCHITECTURE.md](./ARCHITECTURE.md#websocket-message-contract).

## Authors

- **Kunal Bharadwaj** — [@KunalBharadwaj](https://github.com/KunalBharadwaj)
- **Aman Raghuwanshi** — [@raghuwanshi313](https://github.com/raghuwanshi313)

## License

ISC
