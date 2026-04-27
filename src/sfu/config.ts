import type { types } from "mediasoup";

// The announced IP/hostname is what mediasoup advertises inside ICE candidates.
// In production (Render), set the ANNOUNCED_IP environment variable to your server's
// public IP. If not set, falls back to 127.0.0.1 for local development.
const announcedIp = process.env.ANNOUNCED_IP || "127.0.0.1";

// Mediasoup configurations
export const sfuConfig = {
    worker: {
        logLevel: "warn",
        logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"] as any[],
        // Port range for RTC connections
        rtcMinPort: 10000,
        rtcMaxPort: 10100,
    },
    router: {
        // Defines the video/audio capabilities of the router (room)
        mediaCodecs: [
            {
                kind: "audio",
                mimeType: "audio/opus",
                clockRate: 48000,
                channels: 2,
            },
            {
                kind: "video",
                mimeType: "video/VP8",
                clockRate: 90000,
                parameters: {
                    "x-google-start-bitrate": 1000,
                },
            },
            {
                kind: "video",
                mimeType: "video/H264",
                clockRate: 90000,
                parameters: {
                    "packetization-mode": 1,
                    "profile-level-id": "42e01f",
                    "level-asymmetry-allowed": 1,
                },
            }
        ] as unknown as types.RtpCodecCapability[],
    },
    webRtcTransport: {
        // Both UDP and TCP listen infos are required.
        // Render and many cloud providers block UDP — TCP is the reliable fallback.
        listenInfos: [
            {
                protocol: "udp",
                ip: "0.0.0.0",
                announcedAddress: announcedIp,
            },
            {
                protocol: "tcp",
                ip: "0.0.0.0",
                announcedAddress: announcedIp,
            },
        ] as types.TransportListenInfo[],
        initialAvailableOutgoingBitrate: 1000000,
        minimumAvailableOutgoingBitrate: 600000,
        maxSctpMessageSize: 262144,
    }
};