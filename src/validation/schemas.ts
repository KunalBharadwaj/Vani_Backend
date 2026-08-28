import { z } from "zod";

// ── HTTP request bodies ──────────────────────────────────────────────────────

export const chatRequestSchema = z.object({
  text: z.string().min(1, "text is required"),
  currentTime: z.string().optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

// ── WebSocket client → server messages ───────────────────────────────────────
// The first "auth" message is validated separately (see authMessageSchema); this
// union covers every JSON control message accepted after authentication.

export const authMessageSchema = z.object({
  type: z.literal("auth"),
  token: z.string().min(1),
});
export type AuthMessage = z.infer<typeof authMessageSchema>;

export const wsClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), roomId: z.string().min(1) }),
  z.object({ type: z.literal("sync_step_1"), svBase64: z.string() }),
  z.object({ type: z.literal("assign_owner"), targetUserId: z.string().min(1) }),
  z.object({ type: z.literal("message"), payload: z.unknown() }),
  z.object({
    type: z.literal("webrtc:requestCall"),
    targetUserId: z.string().optional(),
    wantsAudio: z.boolean().optional(),
    wantsVideo: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("webrtc:callAccepted"),
    targetUserId: z.string().optional(),
    acceptedAudio: z.boolean().optional(),
    acceptedVideo: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("webrtc:callDeclined"),
    targetUserId: z.string().optional(),
  }),
]);
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;
