import { RtcTokenBuilder, RtcRole } from "agora-token";

const APP_ID = process.env.AGORA_APP_ID || "";
const APP_CERT = process.env.AGORA_APP_CERT || "";

// Token expires in 1 hour. The frontend will request a fresh one before expiry.
const TOKEN_EXPIRY_SECONDS = 3600;

/**
 * Convert a string user ID (e.g. Google "1234567890") to a stable
 * unsigned 32-bit integer that Agora uses as a numeric UID.
 * Uses the same djb2 hash Agora recommends for string→uint mapping.
 */
export function uidFromString(userId: string): number {
    let hash = 5381;
    for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) + hash) ^ userId.charCodeAt(i);
    }
    // Force to unsigned 32-bit integer, then clamp to Agora's safe range (1–2^32-1)
    return (hash >>> 0) || 1;
}

/**
 * Generate an Agora RTC token for the given channel and user.
 * @param channelName  The Agora channel name — we use the room ID.
 * @param userId       The app user's string ID. Converted to a uint32 UID.
 * @param role         "publisher" for users who send media, "subscriber" for listeners.
 */
export function generateRtcToken(
    channelName: string,
    userId: string,
    role: "publisher" | "subscriber" = "publisher"
): { token: string; uid: number } {
    if (!APP_ID || !APP_CERT) {
        throw new Error(
            "AGORA_APP_ID and AGORA_APP_CERT must be set in environment variables"
        );
    }

    const uid = uidFromString(userId);
    const agoraRole = role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const expiryTs = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;

    const token = RtcTokenBuilder.buildTokenWithUid(
        APP_ID,
        APP_CERT,
        channelName,
        uid,
        agoraRole,
        expiryTs,
        expiryTs
    );

    return { token, uid };
}
