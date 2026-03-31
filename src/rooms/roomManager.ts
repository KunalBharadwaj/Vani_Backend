import { WebSocket } from "ws";

export type Room = {
    clients: Map<WebSocket, any>
}

export const rooms = new Map<string, Room>();

export function joinRoom(roomId: string | null, ws: WebSocket, user: any) {
    if (!roomId) return;
    if (!rooms.has(roomId)) {
        rooms.set(roomId, { clients: new Map() });
    }
    const room = rooms.get(roomId)!;
    room.clients.set(ws, user);

    // Notify everyone in the room about the updated user list
    const usersInRoom = Array.from(room.clients.values());
    broadcast(roomId, { type: "room:presence", users: usersInRoom });

    ws.on("close", () => {
        room.clients.delete(ws);

        // Notify others someone left
        const updatedUsers = Array.from(room.clients.values());
        broadcast(roomId, { type: "room:presence", users: updatedUsers });

        if (room.clients.size === 0) {
            rooms.delete(roomId); // Clean up empty rooms
        }
    });
}

export function broadcast(roomId: string, data: any, sender?: WebSocket) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.clients.forEach((_, client) => {
        if (client !== sender && client.readyState === 1) {
            client.send(JSON.stringify(data));
        }
    });
}