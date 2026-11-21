# Socket events

**Endpoint:** Socket.IO v4 at `SUPPORT_SOCKET_PATH` (default `/api/support/realtime`) on the backend origin.

```ts
io("https://shield-api.roxanlabs.com", {
  path: "/api/support/realtime",
  transports: ["websocket", "polling"],
  auth: (cb) => cb({ token: "<agent access token | customer session token>" }),
});
```

* The token is checked in the handshake. Invalid → `connect_error` with `err.data.status = 401`.
* When a token expires mid-connection the next event returns `401`, the server emits
  `session:error {code:"token_expired"}` and disconnects; reconnect with a fresh token
  (the SDK does this automatically).
* Rooms are assigned by the server; clients cannot join rooms.

## Acknowledgements

Every client → server event takes an ack callback and gets exactly one of:

```json
{ "ok": true,  "data": { … } }
{ "ok": false, "error": { "message": "Conversation not found", "status": 404 } }
```

Status codes mirror HTTP (`400` invalid, `401` session, `403` forbidden, `404` not found / not yours,
`409` conflict, `429` rate limited).

Rate limits (per principal): `message:send` 20/10 s · typing 20/10 s · `call:signal` 300/10 s ·
`call:start` 5/min · everything else 60/10 s.

## Client → server

| Event | Who | Payload | Ack `data` |
|---|---|---|---|
| `message:send` | both | `{ conversationId?, body?, attachmentIds?, replyToId?, type?: "TEXT"\|"VOICE", isInternal?, clientMessageId }` — customers may omit `conversationId` (active conversation is found/created); `isInternal` is ignored for customers | `{ message, conversationId, duplicate }` |
| `message:delivered` | both | `{ messageIds: string[] }` | — |
| `conversation:read` | both | `{ conversationId }` | `{ readAt }` |
| `typing:start` / `typing:stop` | both | `{ conversationId, internal? }` (`internal` = agent writing a note → not shown to the customer) | — |
| `sync` | both | `{ since: ISO date }` | customer: `{ serverTime, conversations, messages }` · agent: `{ serverTime, conversations }` |
| `agent:set-status` | agent | `{ status: "ONLINE"\|"AWAY"\|"BUSY"\|"OFFLINE" }` | `{ status }` |
| `call:start` | both | customer: `{ conversationId?, media? }` · agent: `{ conversationId, media? }` | `{ call, available? }` (customer gets `call.status = "MISSED"` immediately when no agent is available) |
| `call:accept` | callee | `{ callId }` | `{ call, role: "answerer", iceServers }` |
| `call:reject` | callee | `{ callId }` | `{ success }` |
| `call:cancel` / `call:end` | party | `{ callId, reason? }` | `{ success }` |
| `call:signal` | party | `{ callId, data: { type: "offer"\|"answer", sdp } \| { type: "candidate", candidate } \| { type: "renegotiate" } }` (≤ 64 KB) | — |
| `call:media-state` | party | `{ callId, muted, video?, screen? }` (`video` = camera on, `screen` = sharing screen) | — |
| `call:rejoin` | party | `{ callId }` — after a socket reconnect during a call | `{ success, initiatedBy }` |

## Server → client

| Event | Sent to | Payload |
|---|---|---|
| `session:ready` | the connecting socket | agent: `{ kind, agentId, status, activeCallIds, serverTime }` · customer: `{ kind, customerId, serverTime }` |
| `session:error` | socket | `{ code, message }` |
| `message:new` | conversation audience | `{ message, conversation? }` — customers never receive internal notes or internal system entries |
| `message:status` | sender side | `{ conversationId, messageIds, status: "DELIVERED", at }` |
| `message:read` | sender side | `{ conversationId, reader: "AGENT"\|"CUSTOMER", readAt }` |
| `typing` | other side (+ other agents) | `{ conversationId, who, isTyping, agent?, internal? }` |
| `conversation:new` | agents of the app | `{ conversation }` |
| `conversation:updated` | conversation audience; customer gets the customer view | `{ conversation }` |
| `conversation:assigned` | old ∪ new audience | `{ conversation, previousAssigneeId }` |
| `agent:presence` | all agents | `{ agentId, online, status }` (offline is debounced 5 s) |
| `customer:presence` | agents who can see the customer's active conversation | `{ customerId, conversationId, online, at }` |
| `quickanswer:suggestion` | agents who can see the conversation | `{ conversationId, suggestion: QuickAnswerSuggestion \| null }` — see [quick-answers.md](quick-answers.md) |
| `notification:new` | `agent:<id>` | `SupportNotification` row (`NEW_CONVERSATION`, `NEW_MESSAGE`, `ASSIGNED`, `TRANSFERRED`, `MISSED_CALL`) |
| `call:incoming` | ringing agents / the customer | `{ call, customer?, conversation?, ringTimeoutSec }` |
| `call:accepted` | the caller's socket | `{ call, role: "offerer" }` → the caller creates the SDP offer |
| `call:taken` | other ringing agents / other customer tabs | `{ callId, by? }` |
| `call:signal` | the other party's socket | `{ callId, data, from }` |
| `call:media-state` | the other party | `{ callId, from, muted, video, screen }` |
| `call:rejoin` | the other party | `{ callId, from }` → offerer performs an ICE restart |
| `call:ended` | both parties + ringing agents | `{ callId, status: "ENDED"\|"MISSED"\|"REJECTED"\|"CANCELLED"\|"FAILED", reason, durationSec }` |

## Conversation audience (routing rules)

| Conversation state | Agent-side events go to |
|---|---|
| Unassigned | `app:<appId>:agents` (everyone who works on the app) |
| Assigned | `agent:<assigneeId>` + `app:<appId>:supervisors` (admins, super admins, `canViewAll` agents) |

Customer-side events go to `customer:<customerId>` only.
