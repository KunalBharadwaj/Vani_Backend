import express from "express";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { WebSocketServer } from "ws";
import { joinRoom, broadcast, broadcastBinary, assignOwner } from "./rooms/roomManager.js";
import { getYDoc } from "./yjs/yjsServer.js";
import { generateRtcToken } from "./agora/tokenService.js";
import { handleGoogleCallback, JWT_SECRET } from "./auth/oauth.js";
import { logSession, getUserSessions } from "./db/mongo.js";
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
    // A-3: accept raw state query from frontend (which now contains base64 JSON of redirect + nonce)
    const state = req.query.state as string;
    passport.authenticate("google", { scope: ["profile", "email"], state })(req, res, next);
});
app.get("/auth/google/callback", passport.authenticate("google", { session: false, failureRedirect: "/login" }), handleGoogleCallback);

app.get("/", (req, res) => {
    res.send("Backend running and ready for Raspberry Pi 5!");
});

app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy" });
});

// A-1 / A-4: Endpoint to issue short-lived JWT directly if the httponly cookie is valid
app.get("/api/auth/me", (req, res) => {
    const cookieToken = req.cookies?.auth_token;
    if (!cookieToken) return res.status(401).json({ error: "No session" });

    jwt.verify(cookieToken, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.status(401).json({ error: "Invalid session" });
        // Return user data and the cookie token acting as a memory token for the frontend WS
        res.json({ user, token: cookieToken });
    });
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

// Agora RTC token endpoint.
// The frontend calls this before joining a channel to get a short-lived token.
// channel = roomId, uid = user's app string ID (server converts to uint32).
app.get("/api/agora/token", authenticateToken, (req, res) => {
    try {
        const channel = req.query.channel as string;
        const userId = (req as any).user?.id as string;
        if (!channel || !userId) {
            return res.status(400).json({ error: "channel and authenticated user required" });
        }
        const { token, uid } = generateRtcToken(channel, userId);
        res.json({ token, uid, appId: process.env.AGORA_APP_ID || "" });
    } catch (e: any) {
        console.error("Agora token error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

const wss = new WebSocketServer({ noServer: true });

// A-2: Do not look for token in WS URL query. Upgrade everyone to socket.
server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
    });
});

wss.on("connection", (ws) => {
    let currentRoom: string | null = null;
    ws.binaryType = "arraybuffer"; // Important for Yjs sync

    // A-4: Require explicit auth message on connection before anything else.
    let isAuthed = false;

    ws.on("message", async (message, isBinary) => {
        if (!isAuthed) {
            if (!isBinary) {
                try {
                    const data = JSON.parse(message.toString());
                    if (data.type === "auth" && data.token) {
                        jwt.verify(data.token, JWT_SECRET, (err: any, decoded: any) => {
                            if (err) {
                                ws.close(4001, "Unauthorized");
                                return;
                            }
                            isAuthed = true;
                            // @ts-ignore
                            ws.user = decoded;
                            console.log(`User ${decoded?.name || 'Unknown'} connected via explicit auth.`);
                            ws.send(JSON.stringify({ type: "auth_success" }));
                        });
                    } else {
                        ws.close(4000, "Auth payload missing or invalid");
                    }
                } catch (e) {
                    ws.close(4000, "Bad payload");
                }
            } else {
                ws.close(4000, "Must authenticate before sending binary");
            }
            return;
        }

        if (isBinary && currentRoom) {
            const doc = await getYDoc(currentRoom);
            const raw = new Uint8Array(message as ArrayBuffer);

            // Directly apply Yjs update without sniffing byte 0.
            try {
                Y.applyUpdate(doc, raw);
            } catch (err) {
                console.error("Failed to apply binary update:", err);
            }

            // Broadcast binary update to others
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

                    // Send entire existing document state as base64 in a typed JSON format to ensure safe joining sync
                    const fullUpdate = Y.encodeStateAsUpdate(doc);
                    ws.send(JSON.stringify({
                        type: "sync_step_2",
                        updateBase64: Buffer.from(fullUpdate).toString("base64")
                    }));

                    console.log(`User joined room ${currentRoom}`);
                }
            }

            if (data.type === "sync_step_1" && currentRoom) {
                const doc = await getYDoc(currentRoom);
                const sv = Buffer.from(data.svBase64, "base64");
                const syncUpdate = Y.encodeStateAsUpdate(doc, new Uint8Array(sv));
                ws.send(JSON.stringify({
                    type: "sync_step_2",
                    updateBase64: Buffer.from(syncUpdate).toString("base64")
                }));
            }

            if (data.type === "assign_owner" && currentRoom) {
                // @ts-ignore
                assignOwner(currentRoom, ws.user.id, data.targetUserId);
            }

            if (data.type === "message" && currentRoom) {
                // Chat or general messaging — forward to all others in room
                broadcast(currentRoom, data.payload, ws);
            }

            // webrtc:requestCall / callAccepted / callDeclined
            // These are lightweight UI signals ("ring" notifications).
            // Agora handles the actual media — we only forward the call invitation.
            if (data.type === "webrtc:requestCall" && currentRoom) {
                broadcast(currentRoom, {
                    type: "webrtc:incomingCallRequest",
                    // @ts-ignore
                    callerId: ws.user?.id || null,
                    // @ts-ignore
                    callerName: ws.user?.name || "Someone",
                    wantsAudio: !!data.wantsAudio,
                    wantsVideo: !!data.wantsVideo,
                }, ws);
            }

            if ((data.type === "webrtc:callAccepted" || data.type === "webrtc:callDeclined") && currentRoom) {
                broadcast(currentRoom, {
                    type: data.type,
                    // @ts-ignore
                    senderId: ws.user?.id || null,
                    // @ts-ignore
                    senderName: ws.user?.name || "Someone",
                    acceptedAudio: !!data.acceptedAudio,
                    acceptedVideo: !!data.acceptedVideo,
                }, ws);
            }

        } catch (err) {
            console.error("Failed to parse message", err);
        }
    });

    ws.on("close", () => {
        console.log("Client disconnected");
    });
});

// Bind the HTTP server immediately so Railway/Render's health checks pass
// regardless of any async initialisation.
const port = process.env.PORT || 3001;
server.listen(Number(port), "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
});