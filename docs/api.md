# REST API

Base: `https://<backend>/api/support`. JSON in/out. Errors use Nest's shape
`{ statusCode, message, error }`. Unknown body fields are rejected (`400`).

Auth header: `Authorization: Bearer <token>`.
🅰 = agent token · 🅲 = customer session token · 🌐 = public · 🔑 = existing Rox Shield JWT.
Roles: SA = SUPER_ADMIN, AD = ADMIN.

## Agent auth

| Method | Path | Auth | Body / notes |
|---|---|---|---|
| POST | `/auth/login` | 🌐 (20/min/IP, 8 failures/15 min/email) | `{ email, password }` → `{ accessToken, refreshToken, expiresIn, agent }`. While no agents exist, the Rox Shield `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` bootstrap the first super admin. |
| POST | `/auth/refresh` | 🌐 | `{ refreshToken }` → new pair (rotation; reuse of an old refresh token revokes the session) |
| POST | `/auth/logout` | 🅰 | |
| GET | `/auth/me` | 🅰 | current agent |
| POST | `/auth/change-password` | 🅰 | `{ currentPassword, newPassword }` (signs out other sessions) |

## Agents

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/agents?applicationId=` | 🅰 | with live presence + `openConversations` |
| PATCH | `/agents/me` | 🅰 | `{ name?, title?, avatarUrl?, status? }` |
| POST | `/agents` | 🅰 SA/AD | `{ email, name, password, role?, title?, canViewAll?, maxConcurrent?, applicationIds? }` |
| PATCH | `/agents/:id` | 🅰 SA/AD | same fields + `isActive`, `password` (reset). Deactivation disconnects the agent. |
| DELETE | `/agents/:id` | 🅰 SA/AD | open conversations become unassigned; messages are kept |

## Applications & settings

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/applications` | 🅰 | apps the agent can access (secret only as a hint) |
| GET | `/applications/:id` | 🅰 | |
| POST | `/applications` | 🅰 SA | `{ name, description?, platform?, allowedOrigins?, allowAnonymous?, isRoxShieldIdentity?, roxTenantId? }` → includes `secret` **once** |
| PATCH | `/applications/:id` | 🅰 SA/AD | same + `isActive` |
| POST | `/applications/:id/rotate-secret` | 🅰 SA | returns the new `secret` once |
| PATCH | `/applications/:id/settings` | 🅰 SA/AD | `primaryColor, brandName, logoUrl, position, welcomeTitle, welcomeMessage, offlineMessage, businessHours, callsEnabled, attachmentsEnabled, voiceMessagesEnabled, maxUploadMb (1–25), autoAssign, assignmentStrategy (ROUND_ROBIN\|LEAST_BUSY), reopenWindowHours, ringTimeoutSec` |
| DELETE | `/applications/:id` | 🅰 SA | deletes the app and all of its support data |

## Conversations (agents)

| Method | Path | Notes |
|---|---|---|
| GET | `/conversations?view=&applicationId=&status=&priority=&assigneeId=&customerId=&search=&cursor=&limit=` | `view`: `all \| unassigned \| mine \| open \| pending \| resolved`. `assigneeId=none` = unassigned. Returns `{ items, nextCursor }`. |
| GET | `/conversations/counts?applicationId=` | sidebar counters |
| GET | `/conversations/:id` | |
| PATCH | `/conversations/:id` | `{ status?, priority?, subject?, tags? }` — RESOLVED frees the customer's active slot; reopening fails with 409 if they already have another active conversation |
| POST | `/conversations/:id/assign` | `{ agentId \| null, note? }` — plain agents may claim unassigned conversations or hand off their own |
| GET | `/conversations/:id/assignments` | assignment / transfer history |
| POST | `/conversations/:id/read` | marks customer messages read, emits receipts |
| GET | `/conversations/:id/messages?before=&after=&limit=` | oldest → newest; `before`/`after` are message ids |
| POST | `/conversations/:id/messages` | REST fallback of `message:send`: `{ body?, isInternal?, replyToId?, attachmentIds?, type?, clientMessageId? }` |
| GET | `/conversations/:id/calls` | call history of the conversation |

## Contacts, calls, notifications, stats

| Method | Path | Notes |
|---|---|---|
| GET | `/customers?search=&applicationId=&cursor=&limit=` | contacts with conversation/call counts |
| GET | `/customers/:id` | profile, stats, conversations, **live Rox Shield account** (user role, branch, shop, plan, KYC, device counts) when linked |
| GET | `/calls?customerId=&agentId=&status=&before=&limit=` | call history |
| GET | `/calls/ice-servers` | 🅰/🅲 STUN/TURN config with short-lived TURN credentials |
| GET | `/notifications?unread=true&before=&limit=` | `{ items, unread }` |
| POST | `/notifications/read` | `{ ids? }` (omit = all) |
| GET | `/stats/overview?days=&applicationId=` | dashboard metrics |
| GET | `/audit-logs?entityType=&entityId=&agentId=&before=&limit=` | SA only |

## Attachments

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/attachments` | 🅰/🅲 (30/min) | `multipart/form-data`: `file`, `conversationId` (optional for customers), `width?`, `height?`, `durationMs?`. MIME allow-list + magic-byte check; SVG/HTML/executables rejected; size limit = app setting (≤ `SUPPORT_MAX_UPLOAD_MB`). Returns the attachment with signed `url`/`downloadUrl`. Attach it by passing its id in `attachmentIds` when sending. |
| GET | `/attachments/:id/url` | 🅰/🅲 | fresh signed URLs (they expire after `SUPPORT_ATTACHMENT_URL_TTL_SEC`, default 12 h) |
| GET | `/attachments/:id/content?exp=&sig=&dl=1` | 🌐 signed | streams the file with `nosniff`, sandboxing CSP and `Content-Disposition` |

Allowed types: PNG, JPEG, GIF, WebP, PDF, TXT, CSV, DOCX, XLSX, PPTX, ZIP, WebM/Ogg/MP3/M4A/WAV audio.

## Widget (customers)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/widget/session` | 🌐 (30/min/IP) | `{ appId, identityToken? , visitorToken? }` → `{ sessionToken, expiresIn, visitorToken?, customer, socket, config }` |
| GET | `/widget/config/:appId` | 🌐 | public appearance + availability |
| GET | `/widget/me` | 🅲 | customer, config, active conversation |
| POST | `/widget/me` | 🅲 | anonymous visitors only: `{ name?, email? }` |
| POST | `/widget/push-token` | 🅲 | `{ token, platform? }` — FCM token for mobile push |
| GET | `/widget/conversations` | 🅲 | own conversations |
| GET | `/widget/conversations/active` | 🅲 | the active conversation or `null` |
| GET | `/widget/conversations/:id/messages?before=&after=&limit=` | 🅲 | internal notes excluded |
| POST | `/widget/messages` | 🅲 | `{ conversationId?, body?, attachmentIds?, replyToId?, type?, clientMessageId? }` |
| POST | `/widget/conversations/:id/read` | 🅲 | |
| GET | `/widget/sync?since=` | 🅲 | reconnect catch-up |
| GET | `/widget/calls` | 🅲 | own call history |
| GET | `/widget/ice-servers` | 🅲 | |

## Rox Shield identity bridge

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/identity/rox-shield` | 🔑 existing Rox Shield JWT | `{ appId? }` (defaults to `SUPPORT_ROX_SHIELD_APP_ID`). App must have `isRoxShieldIdentity`. Returns `{ appId, identityToken, expiresIn: 300 }` for the signed-in shop user. |

## Customer identity token format

HS256 JWT signed with the application secret (`rsk_…`):

```json
{ "sub": "<your customer id>", "name": "…", "email": "…", "phone": "…", "avatarUrl": "…",
  "metadata": { "plan": "Pro" }, "iat": 1730000000, "exp": 1730000300 }
```

`sub`, `iat`, `exp` required; lifetime ≤ `SUPPORT_IDENTITY_TOKEN_MAX_TTL_SEC` (1 h). Use
`createCustomerToken()` from `@roxshield/support-sdk/server`.
