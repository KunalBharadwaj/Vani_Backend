import * as Y from "yjs";
import { WebSocket } from "ws";

const docs = new Map<string, Y.Doc>();
export function getYDoc(roomId: string) {
    if(!docs.has(roomId)) {
        docs.set(roomId, new Y.Doc());
    }
    return docs.get(roomId)!;
}

export function setupYjsConnection(ws: WebSocket, roomId: string) {
    const doc = getYDoc(roomId);

    ws.on("message", (message) => {
        console.log("Yjs raw message", message.toString());
    });
}