import type { types } from "mediasoup";

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
        listenInfos: [
            {
                protocol: "udp",
                ip: "0.0.0.0", // Catch-all for dev
                // IMPORTANT: Set ANNOUNCED_IP env var to your server's public IP on Render/Railway.
                // Without this, mediasoup sends 127.0.0.1 as the ICE candidate → WebRTC fails in production.
                announcedAddress: process.env.ANNOUNCED_IP || "127.0.0.1",
            }
        ] as types.TransportListenInfo[],
        initialAvailableOutgoingBitrate: 1000000,
        minimumAvailableOutgoingBitrate: 600000,
        maxSctpMessageSize: 262144,
    }
};