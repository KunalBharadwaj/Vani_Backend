import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import "dotenv/config";

export const JWT_SECRET = process.env.JWT_SECRET || "super-secret-pi-key-change-me";
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || "mock-client-id",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "mock-client-secret",
    callbackURL: "/auth/google/callback",
    proxy: true
}, (accessToken, refreshToken, profile, done) => {
    // In a real app, you'd insert/update the user in your database here
    const user = {
        id: profile.id,
        name: profile.displayName,
        email: profile.emails?.[0]?.value,
        picture: profile.photos?.[0]?.value
    };
    return done(null, user);
}));

export function handleGoogleCallback(req: Request, res: Response) {
    const user = req.user as any;
    if (!user) {
        return res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
    }

    // Generate stateless JWT to be used for authenticating WebSocket connections
    const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email, picture: user.picture },
        JWT_SECRET,
        { expiresIn: "7d" }
    );

    // Set HTTP-only cookie for standard API requests.
    // Cross-site prod (Vercel → Render) needs sameSite "none" + secure;
    // local dev is same-site over http, so use "lax" (a "none" cookie without
    // secure is rejected by browsers, which would silently break dev login).
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("auth_token", token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7d, matches the JWT expiry
    });

    // Check for CSRF nonce and redirectPath
    let redirectPath = "/";
    let nonce = "";
    if (req.query.state) {
        try {
            const stateStr = Buffer.from(req.query.state as string, 'base64').toString('utf-8');
            const parsed = JSON.parse(stateStr);
            if (parsed.redirectTo) redirectPath = parsed.redirectTo;
            if (parsed.nonce) nonce = parsed.nonce;
            if (!redirectPath.startsWith('/')) redirectPath = '/' + redirectPath;
        } catch (e) { }
    }

    // #3: Do NOT put the JWT in the URL — it leaks into browser history,
    // server access logs, and Referer headers. Only the CSRF nonce is passed
    // back; the frontend reads the token from the httpOnly cookie via
    // GET /api/auth/me.
    const sep = redirectPath.includes('?') ? '&' : '?';
    res.redirect(`${FRONTEND_URL}${redirectPath}${sep}nonce=${nonce}`);
}
