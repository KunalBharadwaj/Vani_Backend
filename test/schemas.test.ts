import { describe, it, expect } from "vitest";
import { chatRequestSchema, wsClientMessageSchema } from "../src/validation/schemas";

describe("chatRequestSchema", () => {
  it("accepts a request with just text", () => {
    expect(chatRequestSchema.safeParse({ text: "hello" }).success).toBe(true);
  });

  it("accepts an optional currentTime", () => {
    expect(chatRequestSchema.safeParse({ text: "hi", currentTime: "noon" }).success).toBe(true);
  });

  it("rejects a missing or empty text", () => {
    expect(chatRequestSchema.safeParse({}).success).toBe(false);
    expect(chatRequestSchema.safeParse({ text: "" }).success).toBe(false);
  });
});

describe("wsClientMessageSchema", () => {
  it("accepts a valid join message", () => {
    expect(wsClientMessageSchema.safeParse({ type: "join", roomId: "r1" }).success).toBe(true);
  });

  it("rejects a join without a roomId", () => {
    expect(wsClientMessageSchema.safeParse({ type: "join" }).success).toBe(false);
  });

  it("rejects assign_owner without a targetUserId", () => {
    expect(wsClientMessageSchema.safeParse({ type: "assign_owner" }).success).toBe(false);
    expect(wsClientMessageSchema.safeParse({ type: "assign_owner", targetUserId: "u2" }).success).toBe(true);
  });

  it("accepts a webrtc:requestCall with optional flags", () => {
    const ok = wsClientMessageSchema.safeParse({
      type: "webrtc:requestCall",
      targetUserId: "u2",
      wantsAudio: true,
      wantsVideo: false,
    });
    expect(ok.success).toBe(true);
  });

  it("strips unknown fields but still validates", () => {
    const res = wsClientMessageSchema.safeParse({ type: "join", roomId: "r1", extra: "ignored" });
    expect(res.success).toBe(true);
    if (res.success) expect("extra" in res.data).toBe(false);
  });

  it("rejects an unknown message type", () => {
    expect(wsClientMessageSchema.safeParse({ type: "nope" }).success).toBe(false);
  });
});
