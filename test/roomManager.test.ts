import { describe, it, expect, beforeEach } from "vitest";
import {
  rooms,
  joinRoom,
  assignOwner,
  broadcast,
  broadcastBinary,
} from "../src/rooms/roomManager";

// Minimal stand-in for a `ws` WebSocket: records sent frames and lets tests
// fire lifecycle events (notably "close") that roomManager wires up.
class FakeWs {
  readyState = 1; // 1 === OPEN
  sent: unknown[] = [];
  private handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
  on(event: string, cb: (...a: unknown[]) => void) {
    (this.handlers[event] ||= []).push(cb);
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  fire(event: string) {
    (this.handlers[event] || []).forEach((cb) => cb());
  }
  lastJson() {
    return JSON.parse(this.sent[this.sent.length - 1] as string);
  }
}

const mkWs = () => new FakeWs() as unknown as any;

beforeEach(() => rooms.clear());

describe("joinRoom", () => {
  it("creates the room and makes the first user host + owner", () => {
    const ws = mkWs();
    joinRoom("r1", ws, { id: "u1", name: "Alice" });

    const room = rooms.get("r1");
    expect(room).toBeDefined();
    expect(room!.hostId).toBe("u1");
    expect(room!.ownerId).toBe("u1");
    expect(room!.clients.size).toBe(1);
  });

  it("broadcasts room:state that lists every member", () => {
    const a = mkWs();
    const b = mkWs();
    joinRoom("r1", a, { id: "u1", name: "Alice" });
    joinRoom("r1", b, { id: "u2", name: "Bob" });

    const state = (b as unknown as FakeWs).lastJson();
    expect(state.type).toBe("room:state");
    expect(state.hostId).toBe("u1");
    expect(state.users.map((u: any) => u.id).sort()).toEqual(["u1", "u2"]);
  });

  it("is a no-op for a null roomId", () => {
    joinRoom(null, mkWs(), { id: "u1" });
    expect(rooms.size).toBe(0);
  });
});

describe("close / cleanup", () => {
  it("deletes the room once the last client leaves", () => {
    const ws = mkWs();
    joinRoom("r1", ws, { id: "u1", name: "Alice" });
    (ws as unknown as FakeWs).fire("close");
    expect(rooms.has("r1")).toBe(false);
  });

  it("hands host+owner to the next client when the host disconnects", () => {
    const host = mkWs();
    const other = mkWs();
    joinRoom("r1", host, { id: "u1", name: "Alice" });
    joinRoom("r1", other, { id: "u2", name: "Bob" });

    (host as unknown as FakeWs).fire("close");

    const room = rooms.get("r1")!;
    expect(room.clients.size).toBe(1);
    expect(room.hostId).toBe("u2");
    expect(room.ownerId).toBe("u2");
  });
});

describe("assignOwner", () => {
  it("lets the host reassign ownership", () => {
    joinRoom("r1", mkWs(), { id: "u1" });
    joinRoom("r1", mkWs(), { id: "u2" });
    assignOwner("r1", "u1", "u2"); // host u1 assigns owner to u2
    expect(rooms.get("r1")!.ownerId).toBe("u2");
  });

  it("ignores ownership changes requested by a non-host", () => {
    joinRoom("r1", mkWs(), { id: "u1" });
    joinRoom("r1", mkWs(), { id: "u2" });
    assignOwner("r1", "u2", "u2"); // u2 is not the host
    expect(rooms.get("r1")!.ownerId).toBe("u1");
  });
});

describe("broadcast", () => {
  it("sends JSON to every open client except the sender", () => {
    const a = mkWs();
    const b = mkWs();
    const c = mkWs();
    joinRoom("r1", a, { id: "u1" });
    joinRoom("r1", b, { id: "u2" });
    joinRoom("r1", c, { id: "u3" });

    const fa = a as unknown as FakeWs;
    const fb = b as unknown as FakeWs;
    const fc = c as unknown as FakeWs;
    fa.sent.length = fb.sent.length = fc.sent.length = 0;

    broadcast("r1", { type: "message", payload: "hi" }, a);

    expect(fa.sent.length).toBe(0); // sender excluded
    expect(fb.lastJson()).toEqual({ type: "message", payload: "hi" });
    expect(fc.lastJson()).toEqual({ type: "message", payload: "hi" });
  });

  it("skips clients whose socket is not OPEN", () => {
    const a = mkWs();
    const b = mkWs();
    joinRoom("r1", a, { id: "u1" });
    joinRoom("r1", b, { id: "u2" });
    const fb = b as unknown as FakeWs;
    fb.readyState = 3; // CLOSED
    fb.sent.length = 0;

    broadcast("r1", { type: "message", payload: "x" }, a);
    expect(fb.sent.length).toBe(0);
  });

  it("broadcastBinary forwards the raw payload untouched", () => {
    const a = mkWs();
    const b = mkWs();
    joinRoom("r1", a, { id: "u1" });
    joinRoom("r1", b, { id: "u2" });
    const fb = b as unknown as FakeWs;
    fb.sent.length = 0;

    const bin = new Uint8Array([1, 2, 3]);
    broadcastBinary("r1", bin, a);
    expect(fb.sent[0]).toBe(bin); // same reference, not JSON-stringified
  });
});
