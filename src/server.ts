import express from "express";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import { joinRoom, broadcast, broadcastBinary, assignOwner } from "./rooms/roomManager.js";
import { getYDoc } from "./yjs/yjsServer.js";
import {
    startMediasoup,
    getOrCreateRouter,
    createWebRtcTransport,
    connectTransport,
    loadProducer,
    loadConsumer,
    resumeConsumer
} from "./sfu/sfuService.js";
import { handleGoogleCallback, JWT_SECRET } from "./auth/oauth.js";
import { logSession, getUserSessions } from "./db/sqlite.js";
import * as Y from "yjs";

const app = express();
app.set("trust proxy", 1); // Trust first proxy (Render) to set secure cookies properly
const server = http.createServer(app);

// Middlewares
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(passport.initialize());

// OAuth 2.0 Routes
app.get("/auth/google", (req, res, next) => {
    const redirectParams = req.query.redirect_to as string;
    const state = redirectParams ? Buffer.from(redirectParams).toString('base64') : undefined;
    passport.authenticate("google", { scope: ["profile", "email"], state })(req, res, next);
});
app.get("/auth/google/callback", passport.authenticate("google", { session: false, failureRedirect: "/login" }), handleGoogleCallback);

app.get("/", (req, res) => {
    res.send("Backend running and ready for Raspberry Pi 5!");
});

app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy" });
});

// Auth Middleware for API routes
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.headers.authorization?.split(" ")[1] || req.cookies?.auth_token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.status(403).json({ error: "Forbidden" });
        (req as any).user = user;
        next();
    });
};

app.post("/api/sessions", authenticateToken, async (req, res) => {
    try {
        const { roomId, pdfFileName } = req.body;
        const user = (req as any).user;
        if (!roomId || !pdfFileName) return res.status(400).json({ error: "Missing fields" });
        await logSession(user.id, roomId, pdfFileName);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/sessions", authenticateToken, async (req, res) => {
    try {
        const user = (req as any).user;
        const sessions = await getUserSessions(user.id);
        res.json(sessions);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

const wss = new WebSocketServer({ noServer: true });

// Protect WebSocket upgrades with JWT
server.on("upgrade", (request, socket, head) => {
    try {
        const url = new URL(request.url || "", `http://${request.headers.host}`);
        const token = url.searchParams.get("token");

        if (!token) {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
        }

        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                socket.destroy();
                return;
            }

            // Authentication passed, attach user to WebSocket upgrade
            wss.handleUpgrade(request, socket, head, (ws) => {
                // @ts-ignore
                ws.user = decoded;
                wss.emit("connection", ws, request);
            });
        });
    } catch (e) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
    }
});

wss.on("connection", (ws) => {
    let currentRoom: string | null = null;
    ws.binaryType = "arraybuffer"; // Important for Yjs sync

    // Example: Log authenticated user
    // @ts-ignore
    const user = ws.user;
    console.log(`User ${user?.name || 'Unknown'} connected.`);

    ws.on("message", async (message, isBinary) => {
        if (isBinary && currentRoom) {
            const doc = await getYDoc(currentRoom);
            const raw = new Uint8Array(message as ArrayBuffer);

            // Our Wrapped Protocol
            if (raw[0] === 1) { // 1 = Sync Request (client sent State Vector)
                const sv = raw.slice(1);
                const syncUpdate = Y.encodeStateAsUpdate(doc, sv);
                const reply = new Uint8Array(syncUpdate.length + 1);
                reply[0] = 2; // 2 = Sync Update Output
                reply.set(syncUpdate, 1);
                ws.send(reply);
                return;
            }

            if (raw[0] === 0) { // 0 = Normal Update wrapper
                const update = raw.slice(1);
                Y.applyUpdate(doc, update);
                broadcastBinary(currentRoom, message, ws); // relay wrapper identically
                return;
            }

            // Fallback for legacy unwrapped packet
            Y.applyUpdate(doc, raw);
            broadcastBinary(currentRoom, message, ws);
            return;
        }

        try {
            const data = JSON.parse(message.toString());

            if (data.type === "join") {
                currentRoom = data.roomId;
                if (currentRoom) {
                    // @ts-ignore
                    joinRoom(currentRoom, ws, ws.user);
                    const doc = await getYDoc(currentRoom); // Initialize doc instance from persistence

                    // Send entire existing document state wrapped
                    const fullUpdate = Y.encodeStateAsUpdate(doc);
                    const initPayload = new Uint8Array(fullUpdate.length + 1);
                    initPayload[0] = 2; // 2 = Sync Update Output Wrapper
                    initPayload.set(fullUpdate, 1);
                    ws.send(initPayload);

                    console.log(`User joined room ${currentRoom}`);
                }
            }

            if (data.type === "assign_owner" && currentRoom) {
                // @ts-ignore
                assignOwner(currentRoom, ws.user.id, data.targetUserId);
            }

            if (data.type === "message" && currentRoom) {
                // Chat or general messaging broadcast
                broadcast(currentRoom, data.payload, ws);
            }

            if (data.type.startsWith("webrtc:") && currentRoom) {
                // SFU Signaling placeholder (mediasoup events will route here)
                console.log("SFU WebRTC Signal Received:", data.type);

                try {
                    switch (data.type) {
                        case "webrtc:getRouterRtpCapabilities":
                            const router = await getOrCreateRouter(currentRoom);
                            ws.send(JSON.stringify({
                                type: "webrtc:routerRtpCapabilities",
                                rtpCapabilities: router.rtpCapabilities
                            }));
                            break;

                        case "webrtc:createTransport":
                            const transport = await createWebRtcTransport(currentRoom);
                            ws.send(JSON.stringify({
                                type: "webrtc:transportCreated",
                                id: transport.id,
                                iceParameters: transport.iceParameters,
                                iceCandidates: transport.iceCandidates,
                                dtlsParameters: transport.dtlsParameters
                            }));
                            break;

                        case "webrtc:connectTransport":
                            await connectTransport(data.transportId, data.dtlsParameters);
                            ws.send(JSON.stringify({ type: "webrtc:transportConnected" }));
                            break;

                        case "webrtc:produce":
                            const producer = await loadProducer(data.transportId, data.kind, data.rtpParameters);
                            ws.send(JSON.stringify({ type: "webrtc:produced", id: producer.id }));
                            // Notify others in room
                            broadcast(currentRoom, { type: "webrtc:newProducer", producerId: producer.id }, ws);
                            break;

                        case "webrtc:consume":
                            const consumer = await loadConsumer(data.transportId, data.producerId, data.rtpCapabilities);
                            if (consumer) {
                                ws.send(JSON.stringify({
                                    type: "webrtc:consumed",
                                    id: consumer.id,
                                    producerId: data.producerId,
                                    kind: consumer.kind,
                                    rtpParameters: consumer.rtpParameters
                                }));
                            }
                            break;

                        case "webrtc:resumeConsumer":
                            await resumeConsumer(data.consumerId);
                            ws.send(JSON.stringify({ type: "webrtc:consumerResumed" }));
                            break;
                    }
                } catch (e) {
                    console.error(`SFU error handling ${data.type}:`, e);
                }
            }
        } catch (err) {
            console.error("Failed to parse message", err);
        }
    });

    ws.on("close", () => {
        console.log("Client disconnected");
    });
});

// Start mediasoup then HTTP server
startMediasoup().then(() => {
    const port = process.env.PORT || 3001;
    server.listen(port, () => {
        console.log(`Realtime Server running on port ${port} with Mediasoup WebRTC enabled!`);
    });
});