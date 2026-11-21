# @roxshield/support-sdk

Headless client for Rox Support.

* `SupportCustomerClient` — customer sessions, messages, uploads, receipts, typing, reconnect sync, calls
* `SupportAgentClient` — agent auth (rotating refresh), full REST surface, realtime, calls
* `CallController` / `PeerSession` — WebRTC call state machine (Socket.IO signaling, STUN/TURN)
* `@roxshield/support-sdk/server` — `createCustomerToken()` for your backend (Node only, never ship to browsers)

```ts
import { createCustomerToken } from "@roxshield/support-sdk/server";
const token = createCustomerToken({ appSecret: process.env.ROX_SUPPORT_APP_SECRET!, customer: { id: user.id, name: user.name } });
```

Tests: `pnpm test:webrtc` (real Chrome, fake microphone). Protocol docs: `../../docs`.
