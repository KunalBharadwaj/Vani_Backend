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
    callbackURL: "/auth/google/callback"
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

    // Set HTTP-only cookie for standard API requests 
    res.cookie("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    });

    // Redirect client back to the Next.js frontend (passing token to help with external client WebSocket init)
    res.redirect(`${FRONTEND_URL}/?token=${token}`);
}
