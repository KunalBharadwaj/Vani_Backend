import * as Y from "yjs";
import { WebSocket } from "ws";
import { rooms } from "../rooms/roomManager.js";
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
            // Save updates durably to the LevelDB disk partition
            persistence.storeUpdate(roomId, update);

            const room = rooms.get(roomId);
            if (!room) return;

            room.clients.forEach((_, client) => {
                if (client.readyState === 1) { // WebSocket.OPEN
                    client.send(update);
                }
            });
        });
    }
    return docs.get(roomId)!;
}