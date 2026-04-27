import type { types } from "mediasoup";

// Static parts of the mediasoup config
export const sfuConfig = {
    worker: {
        logLevel: "warn",
        logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"] as any[],
        rtcMinPort: 10000,
        rtcMaxPort: 10100,
    },
    router: {
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
                parameters: { "x-google-start-bitrate": 1000 },
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
        // listenInfos is a GETTER so it reads ANNOUNCED_IP at call-time,
        // not at module-load time. This guarantees the auto-detected IP
        // (set by resolvePublicIp() in sfuService.ts before any transport
        // is created) is always used correctly.
        get listenInfos(): types.TransportListenInfo[] {
            const ip = process.env.ANNOUNCED_IP || "127.0.0.1";
            return [
                { protocol: "udp", ip: "0.0.0.0", announcedAddress: ip },
                { protocol: "tcp", ip: "0.0.0.0", announcedAddress: ip },
            ] as types.TransportListenInfo[];
        },
        initialAvailableOutgoingBitrate: 1000000,
        minimumAvailableOutgoingBitrate: 600000,
        maxSctpMessageSize: 262144,
    }
};