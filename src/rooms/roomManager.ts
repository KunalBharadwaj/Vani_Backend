import { WebSocket } from "ws";

export type Room = {
    clients: Map<WebSocket, any>,
    hostId: string | null,
    ownerId: string | null
}

export const rooms = new Map<string, Room>();

export function broadcastRoomState(roomId: string) {
    const room = rooms.get(roomId);
    if (!room) return;
    const usersInRoom = Array.from(room.clients.values());
    const state = { type: "room:state", users: usersInRoom, hostId: room.hostId, ownerId: room.ownerId };
    broadcast(roomId, state);
}

export function joinRoom(roomId: string | null, ws: WebSocket, user: any) {
    if (!roomId) return;
    if (!rooms.has(roomId)) {
        rooms.set(roomId, { clients: new Map(), hostId: user.id, ownerId: user.id });
    }
    const room = rooms.get(roomId)!;
    room.clients.set(ws, user);

    broadcastRoomState(roomId);

    ws.on("close", () => {
        room.clients.delete(ws);

        if (room.clients.size === 0) {
            rooms.delete(roomId); // Clean up empty rooms
        } else {
            // Optional: fallback ownership if host drops out
            // making the next available person the host + owner, to prevent deadlocks
            if (user.id === room.hostId) {
                const nextUser = Array.from(room.clients.values())[0];
                room.hostId = nextUser?.id || null;
                room.ownerId = nextUser?.id || null;
            } else if (user.id === room.ownerId) {
                // If owner left but not host, fallback owner to host
                room.ownerId = room.hostId;
            }
            broadcastRoomState(roomId);
        }
    });
}

export function assignOwner(roomId: string, requesterUserId: string, newOwnerId: string) {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.hostId === requesterUserId) {
        room.ownerId = newOwnerId;
        broadcastRoomState(roomId);
    }
}

export function broadcastBinary(roomId: string, data: any, sender?: WebSocket) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.clients.forEach((_, client) => {
        if (client !== sender && client.readyState === 1) {
            client.send(data); // Send binary as-is, NOT JSON.stringify
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