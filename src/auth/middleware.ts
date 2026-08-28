import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { JWT_SECRET } from "./oauth.js";

/**
 * Express middleware that authenticates a request via a JWT taken from the
 * `Authorization: Bearer <token>` header or the `auth_token` cookie.
 * - 401 when no token is present.
 * - 403 when a token is present but invalid/expired.
 * On success, attaches the decoded payload to `req.user` and calls next().
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.split(" ")[1] || req.cookies?.auth_token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.status(403).json({ error: "Forbidden" });
        (req as any).user = user;
        next();
    });
}
