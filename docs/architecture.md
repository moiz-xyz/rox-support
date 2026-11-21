# Rox Support — Architecture

Rox Support is a real-time customer support platform (chat, files, voice notes, WebRTC voice calls)
built into the existing Rox Shield stack. It has three parts:

| Part | Where | What it is |
|---|---|---|
| **Support backend** | `rox-shield-backend/src/support/` | A NestJS module inside the existing backend: REST under `/api/support/*`, Socket.IO under `/api/support/realtime`, Prisma models in the shared database. |
| **Agent dashboard** | `rox-support/dashboard/` | Next.js 16 app for agents and admins (inbox, contacts, calls, agents, settings). |
| **Widget + SDK** | `rox-support/packages/` | `@roxshield/support-widget` (drop-in React component) built on `@roxshield/support-sdk` (headless REST + realtime + WebRTC client, plus a Node helper to sign customer tokens). |

```
┌──────────────────────────┐        ┌───────────────────────────────────────────────┐
│ Any Next.js / React app  │        │ rox-shield-backend (NestJS, one process)       │
│  <SupportWidget/>        │◄──────►│                                               │
│  (shadow DOM)            │  REST  │  /api/*            existing Rox Shield modules│
│        │                 │  + WS  │  /ws/audio …       existing raw-ws gateways   │
│        │ GET /api/support-token   │  /api/support/*    ◄── Support module (REST)  │
│        ▼                 │        │  /api/support/realtime ◄── Socket.IO          │
│  YOUR backend signs a    │        │        │                                      │
│  5-min identity token    │        │        ▼                                      │
│  with the app secret     │        │  PostgreSQL (shared, Support* tables)         │
└──────────────────────────┘        │  Local disk / Firebase Storage (attachments)  │
                                    │  firebase-admin (FCM push to customers)       │
┌──────────────────────────┐        └───────────────────────────────────────────────┘
│ Agent dashboard (Next.js)│◄─────── REST + Socket.IO ────────────┘
└──────────────────────────┘
        ▲            WebRTC audio (peer-to-peer, or relayed by TURN)            ▲
        └──────────────────────────────── widget ◄───────────────────────────────┘
```

## Phase 1 — what was found in the existing project

| Area | Finding | Decision |
|---|---|---|
| Backend | NestJS 11, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, Redis/BullMQ, firebase-admin, global `/api` prefix, Swagger opt-in. | Build support as a **module inside the backend** (same DB, same deploy, reuse Prisma/Firebase/Auth). |
| Auth | Tenant users log in with JWT (`JWT_ACCESS_SECRET`, `JwtAuthGuard`); a single env-based `SUPER_ADMIN`. | Agents get their own table and tokens (different audience + secret), but the **first super-admin agent is bootstrapped from the existing Rox Shield super-admin login**, and Rox Shield users reach support through the **existing JWT** (`POST /api/support/identity/rox-shield`). |
| Global guards | `HmacGuard` (APP_GUARD, soft mode unless `ENFORCE_HMAC=true`). | `/api/support/*` is exempt (one added line) — browser widgets can't hold per-user HMAC keys; support routes use their own short-lived tokens + rate limits. |
| Realtime | `WsAdapter` (raw `ws`) for parental audio/screen gateways; `socket.io` already a dependency. `WsAdapter` **destroys every WebSocket upgrade for paths it doesn't own**. | Socket.IO is attached to the same HTTP server on its own path, and the existing upgrade listeners are wrapped to ignore that one path. Covered by `realtime.server.spec.ts` (existing gateways still work; unknown paths still rejected). |
| Validation | Global `ValidationPipe` without `whitelist`. | Support controllers apply a strict pipe (`whitelist` + `forbidNonWhitelisted`) so extra fields can never reach Prisma. |
| Storage | Firebase Storage used for KYC with public download tokens. | The existing Firebase bucket (default, under `support/`, **without** public tokens); a local-disk driver exists only for offline development. Downloads always go through short-lived signed URLs. |
| Notifications | FCM via firebase-admin for devices. | Reused for customer push (support replies / missed calls) when a customer registers a push token and is offline. |
| Rate limiting | `ThrottlerModule` registered but not global; behind nginx every request comes from 127.0.0.1. | Principal-aware limiter (per agent / customer / IP) for REST and socket events. |
| Frontends | `rox-admin` and `rox-locker` are Android (Kotlin). No Next.js app in this workspace. | New Next.js dashboard; Android integration via a hosted `/embed` page in a WebView (see `android.md`). |
| DB process | Schema changes go in `prisma/schema.prisma`; the team syncs the DB. | 12 additive `Support*` models, no foreign keys into existing tables (soft links: `roxUserId`, `roxTenantId`). |

## Backend module layout

```
src/support/
├── support.module.ts           wiring
├── support.config.ts           all SUPPORT_* environment config (safe defaults)
├── common/                     token service, auth guard + decorators, rate limiter,
│                               crypto (AES-GCM, signed URLs), serializers, business hours
├── applications/               multi-app registry, signing secrets, widget settings
├── auth/                       agent login/refresh, customer sessions, Rox Shield identity bridge
├── agents/                     agent CRUD, roles, app access, status
├── customers/                  contacts + live Rox Shield account lookup
├── conversations/              list/search/views, access rules, assignment (auto + manual), status
├── messages/                   persist-first send, idempotency, receipts, reconnect sync
├── attachments/                upload validation (magic bytes), storage drivers, signed downloads
├── calls/                      call sessions, ringing, accept race, signaling relay, missed calls, TURN creds
├── notifications/              agent notifications (DB + socket), customer push (FCM)
├── stats/                      dashboard metrics
├── audit/                      audit log
├── realtime/                   Socket.IO server, rooms, presence, event names
└── widget/                     customer-facing REST endpoints
```

Controllers are thin; services own the logic; every service emits through `SupportRealtimeEmitter`
so routing rules live in one place.

## Identity & security model

**Three kinds of credentials, never interchangeable**

| Token | Issued by | Audience | Lifetime | Used for |
|---|---|---|---|---|
| Customer identity token | *Your* backend, HS256 with the app's `rsk_…` secret | — | ≤ 1 h (5 min recommended) | Proving who the customer is, once, to start a session |
| Customer session token | Support backend | `rox-support:customer` | 2 h | Widget REST + socket |
| Agent access / refresh | Support backend | `rox-support:agent` / `…:agent-refresh` | 1 h / 14 d, rotating | Dashboard |

* The browser never supplies a trusted customer id — only the signature over `sub` counts.
  `alg: none`, wrong secret, missing `sub`/`exp`, and lifetimes > 1 h are rejected (unit tested).
* App **public ids** (`app_…`) are not secrets. App **secrets** are AES-256-GCM encrypted at rest and
  shown once on creation/rotation.
* Anonymous visitors (only if the app allows it) get a random visitor token stored on the device;
  the server keeps only its SHA-256.
* `allowedOrigins` per app is enforced on session creation and socket handshake (defence in depth —
  identity still requires a signature).

**Authorization**

| Role | Sees |
|---|---|
| `SUPER_ADMIN` | Everything, all apps; manages apps, secrets, agents, audit log |
| `ADMIN` | All conversations of their apps; manages agents (not super admins) and app settings |
| `AGENT` | Unassigned conversations + their own, in their apps (or all, with `canViewAll`) |
| Customer | Only their own conversations in their own app; never internal notes |

Missing and forbidden resources both return **404**, so ids can't be probed.

## Data model (Prisma, `Support*`)

```
SupportApplication 1─1 SupportSettings
        │ 1─n SupportAgentApplication n─1 SupportAgent
        │ 1─n SupportCustomer 1─n SupportConversation 1─n SupportMessage 1─n SupportAttachment
        │                                │ 1─n SupportCall
        │                                │ 1─n SupportAssignment (history)
SupportAgent 1─n SupportNotification, SupportAuditLog
```

Key design points

* **One active conversation per customer per app** — `activeKey = "<appId>:<customerId>"` is set
  while OPEN/PENDING and nulled on RESOLVED; a unique index makes this race-safe across tabs.
* **Reopening** — a customer message within `reopenWindowHours` reopens the last resolved
  conversation; after that a new one starts. History is never deleted.
* **Idempotent sends** — `@@unique([conversationId, clientMessageId])`.
* **Unread counters** are denormalised on the conversation (`unreadByAgent`, `unreadByCustomer`)
  so the inbox list is a single indexed query.
* **Pagination** — keyset cursors on `(lastMessageAt, id)` for conversations and `(createdAt, id)`
  for messages.
* **Search** — case-insensitive match on customer name/email/phone/external id, subject, message
  text and `#number`. For very large volumes add a `pg_trgm` GIN index (see deployment.md).
* **Binary data never in the DB** — attachments store a storage key + SHA-256.
* **Audit** — `SupportAuditLog` records logins, assignments, status changes, agent/app changes,
  secret rotations, answered calls.

## Real-time model

* The database is the source of truth. Every message is persisted, then fanned out.
* Clients join no rooms themselves — the server decides membership from the authenticated principal:
  `agent:<id>`, `customer:<id>`, `app:<appId>:agents`, `app:<appId>:supervisors`, `agents`, `role:super-admins`.
* Conversation events go to *unassigned → all agents of the app*, *assigned → assignee + supervisors*.
  Customer events go only to `customer:<id>`.
* On reconnect, customers call `sync {since}` and agents re-fetch the open thread with `?after=` —
  nothing is lost while offline. Socket.IO connection-state recovery covers short blips too.
* Typing indicators and presence are ephemeral (not persisted).

See [`socket-events.md`](socket-events.md) and [`webrtc.md`](webrtc.md).

## Scaling beyond one process

The backend runs as a single pm2 process today, so presence, rate limits and live call state are
in-memory. To run several instances:

1. add `@socket.io/redis-adapter` (Redis is already deployed) in `SupportRealtimeServer`;
2. move `SupportPresenceService` and `SupportRateLimiter` to Redis;
3. keep calls sticky (or move `LiveCall` state to Redis) — the public interfaces don't change.
