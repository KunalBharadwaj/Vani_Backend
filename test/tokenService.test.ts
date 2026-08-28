import { describe, it, expect } from "vitest";
import { uidFromString } from "../src/agora/tokenService";

const MAX_UINT32 = 4294967295; // 2^32 - 1

describe("uidFromString", () => {
  it("is deterministic for the same input", () => {
    expect(uidFromString("google-1234567890")).toBe(uidFromString("google-1234567890"));
  });

  it("always returns a positive unsigned 32-bit integer", () => {
    for (const id of ["", "a", "google-1", "some-very-long-user-identifier-000", "🙂"]) {
      const uid = uidFromString(id);
      expect(Number.isInteger(uid)).toBe(true);
      expect(uid).toBeGreaterThanOrEqual(1);
      expect(uid).toBeLessThanOrEqual(MAX_UINT32);
    }
  });

  it("maps distinct inputs to distinct uids (no trivial collisions)", () => {
    const ids = ["user-a", "user-b", "user-c", "1", "2", "3", "alice", "bob"];
    const uids = new Set(ids.map(uidFromString));
    expect(uids.size).toBe(ids.length);
  });

  it("never returns 0 (Agora reserves it), coercing to 1 when the hash lands on 0", () => {
    // We can't easily force a 0 hash, but we assert the contract holds broadly.
    for (let i = 0; i < 500; i++) {
      expect(uidFromString(`gen-${i}`)).not.toBe(0);
    }
  });
});
