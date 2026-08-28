// Augment the `ws` WebSocket with the authenticated user we attach after the
// JWT auth handshake, so `ws.user` is typed instead of needing a suppression.
import "ws";
import type { UserPayload } from "./user.js";

declare module "ws" {
  interface WebSocket {
    /** Set once the socket has authenticated via the "auth" message. */
    user?: UserPayload;
  }
}
