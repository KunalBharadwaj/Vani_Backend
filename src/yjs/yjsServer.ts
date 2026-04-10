import * as Y from "yjs";
// @ts-ignore
import { LeveldbPersistence } from "y-leveldb";
import path from "path";

const docs = new Map<string, Y.Doc>();

// Create LevelDB instance in the local data directory
const persistence = new LeveldbPersistence(path.join(process.cwd(), "data", "yjs-storage"));

export async function getYDoc(roomId: string) {
    if (!docs.has(roomId)) {
        const doc = await persistence.getYDoc(roomId);
        docs.set(roomId, doc);

        doc.on("update", (update: Uint8Array) => {
            // Persist updates durably to LevelDB.
            // Broadcasting is handled by server.ts via broadcastBinary() —
            // do NOT broadcast here or updates will be sent twice.
            persistence.storeUpdate(roomId, update);
        });
    }
    return docs.get(roomId)!;
}