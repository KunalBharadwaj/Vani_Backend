import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { authenticateToken } from "../src/auth/middleware";
import { JWT_SECRET } from "../src/auth/oauth";

// Drive the middleware and resolve with the outcome, whichever path it takes:
// an error response (res.status().json()) or a successful next().
function run(req: any) {
  return new Promise<{ status?: number; body?: any; nextCalled: boolean; user?: any }>((resolve) => {
    let status: number | undefined;
    const res: any = {
      status(code: number) { status = code; return this; },
      json(body: any) { resolve({ status, body, nextCalled: false }); },
    };
    const next = () => resolve({ status: undefined, body: undefined, nextCalled: true, user: req.user });
    authenticateToken(req, res, next);
  });
}

const sign = (payload: object) => jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });

describe("authenticateToken", () => {
  it("responds 401 when no token is provided", async () => {
    const out = await run({ headers: {}, cookies: {} });
    expect(out.status).toBe(401);
    expect(out.nextCalled).toBe(false);
  });

  it("responds 403 when the token is invalid", async () => {
    const out = await run({ headers: { authorization: "Bearer not-a-real-jwt" }, cookies: {} });
    expect(out.status).toBe(403);
    expect(out.nextCalled).toBe(false);
  });

  it("responds 403 when the token is expired", async () => {
    const expired = jwt.sign({ id: "u1" }, JWT_SECRET, { expiresIn: -10 });
    const out = await run({ headers: { authorization: `Bearer ${expired}` }, cookies: {} });
    expect(out.status).toBe(403);
  });

  it("calls next() and attaches req.user for a valid Bearer token", async () => {
    const req: any = { headers: { authorization: `Bearer ${sign({ id: "u1", name: "Alice" })}` }, cookies: {} };
    const out = await run(req);
    expect(out.nextCalled).toBe(true);
    expect(req.user.id).toBe("u1");
    expect(req.user.name).toBe("Alice");
  });

  it("accepts the token from the auth_token cookie as a fallback", async () => {
    const req: any = { headers: {}, cookies: { auth_token: sign({ id: "u2" }) } };
    const out = await run(req);
    expect(out.nextCalled).toBe(true);
    expect(req.user.id).toBe("u2");
  });
});
