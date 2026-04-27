import * as Y from "yjs";
// @ts-ignore
import { LeveldbPersistence } from "y-leveldb";
import path from "path";
import fs from "fs";

const docs = new Map<string, Y.Doc>();

const dbPath = path.join(process.cwd(), "data", "yjs-storage");

// Remove stale LOCK file left behind if the server was killed (common on Windows)
const lockFile = path.join(dbPath, "LOCK");
if (fs.existsSync(lockFile)) {
    try {
        fs.unlinkSync(lockFile);
        console.log("[YJS] Removed stale LevelDB LOCK file.");
    } catch (e) {
        console.warn("[YJS] Could not remove LOCK file:", e);
    }
}

const persistence = new LeveldbPersistence(dbPath);

export async function getYDoc(roomId: string) {
    if (!docs.has(roomId)) {
        let doc: Y.Doc;
        try {
            // y-leveldb swallows errors internally and may return null — guard explicitly
            doc = await persistence.getYDoc(roomId);
            if (!doc) throw new Error("LevelDB returned null for room " + roomId);

            doc.on("update", (update: Uint8Array) => {
                // Persist updates durably to LevelDB.
                // Broadcasting is handled by server.ts via broadcastBinary() —
                // do NOT broadcast here or updates will be sent twice.
                persistence.storeUpdate(roomId, update).catch((err: unknown) => {
                    console.warn(`[YJS] Failed to persist update for room ${roomId}:`, err);
                });
            });
        } catch (err) {
            console.warn(`[YJS] LevelDB unavailable for room ${roomId}, using in-memory doc:`, err);
            doc = new Y.Doc();
        }
        docs.set(roomId, doc);
    }
    return docs.get(roomId)!;
}