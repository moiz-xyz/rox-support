# Rox Support

Real-time customer support platform for Rox Shield — chat, image & file sharing, voice messages and
WebRTC voice calls — that you own end to end and can drop into any Next.js / React app.

```
rox-support/
├── dashboard/                 Agent & admin web app (Next.js 16): inbox, contacts, calls, agents, settings
├── packages/
│   ├── support-sdk/           @roxshield/support-sdk    headless REST + Socket.IO + WebRTC client,
│   │                          and /server: createCustomerToken() for your backend
│   └── support-widget/        @roxshield/support-widget <SupportWidget/> (shadow-DOM isolated)
├── examples/nextjs-host/      Minimal host app showing the full integration
├── tests/
│   ├── ui/                    Screenshot/smoke tests against a stubbed API
│   └── e2e/                   End-to-end scenarios against a running backend
└── docs/                      architecture · api · socket-events · webrtc · integration · android · deployment

../rox-shield-backend/src/support/   The backend module (REST, Socket.IO, Prisma models)
```

## Quick start (local)

```bash
# 1. backend — add SUPPORT_* vars to rox-shield-backend/.env (see docs/deployment.md), sync the schema
cd ../rox-shield-backend && pnpm start:dev                     # :5089

# 2. packages + dashboard
cd ../rox-support
pnpm install
pnpm build:packages
cp dashboard/.env.example dashboard/.env.local
pnpm dev:dashboard                                             # http://localhost:3400
#   sign in with the Rox Shield SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD (bootstraps the first agent)
#   Settings → New application → copy the app id + secret

# 3. example host app with the widget
cp examples/nextjs-host/.env.example examples/nextjs-host/.env.local   # paste app id + secret
pnpm dev:example                                               # http://localhost:3500
```

## Using the widget

```tsx
import { SupportWidget } from "@roxshield/support-widget";

<SupportWidget
  apiUrl="https://shield-api.roxanlabs.com"
  appId="app_XXXXXXXXXXXX"
  getCustomerToken={async () => (await fetch("/api/support-token")).text()}
/>
```

`/api/support-token` is a tiny route on **your** server that signs the signed-in user with the app
secret (`createCustomerToken` from `@roxshield/support-sdk/server`). The browser never holds a
secret and can't impersonate another customer. Details: [docs/integration.md](docs/integration.md).

## Documentation

| | |
|---|---|
| [Architecture](docs/architecture.md) | Phase-1 findings, module layout, security model, data model, scaling |
| [REST API](docs/api.md) | every endpoint, auth and payload |
| [Socket events](docs/socket-events.md) | realtime protocol, acks, rooms |
| [WebRTC](docs/webrtc.md) | call flow, signaling, TURN/coturn, video later |
| [Integration](docs/integration.md) | Next.js / React install, props, theming, headless SDK |
| [Android](docs/android.md) | rox-admin WebView integration, identity bridge, FCM |
| [Deployment](docs/deployment.md) | env vars, DB sync, nginx, dashboard, tests |
