# Installation & deployment

## Components

| Component | Runs as | Default port |
|---|---|---|
| Support backend | part of `rox-shield-backend` (pm2 `5089-shield-api`) | 5089 |
| Agent dashboard | `rox-support/dashboard` (`next start`) | 3400 |
| Example host | `rox-support/examples/nextjs-host` (optional) | 3500 |
| TURN server | coturn (recommended) | 3478 / 5349 |

## 1. Database

The support module adds 12 tables (`SupportApplication`, `SupportSettings`, `SupportAgent`,
`SupportAgentApplication`, `SupportCustomer`, `SupportConversation`, `SupportMessage`,
`SupportAttachment`, `SupportCall`, `SupportAssignment`, `SupportNotification`,
`SupportAuditLog`) and 9 enums to `prisma/schema.prisma`. They have **no foreign keys into
existing tables**, so creating them never touches existing rows.

Sync them with your usual process. If you want to review an **additive-only** SQL script first
(only `CREATE TYPE / CREATE TABLE / CREATE INDEX` + FKs between the new tables), generate it
without touching any database:

```bash
cd rox-shield-backend
# schema as it was before the support module
python3 - <<'EOF'
s = open("prisma/schema.prisma").read()
open("/tmp/schema-before-support.prisma", "w").write(s[: s.index("// ==========================================\n// 🎧 ROX SUPPORT")])
EOF
npx prisma migrate diff --from-schema /tmp/schema-before-support.prisma \
                        --to-schema prisma/schema.prisma --script > /tmp/rox-support-tables.sql
# review, then apply in one transaction:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f /tmp/rox-support-tables.sql
npx prisma generate
```

Optional, for fast message search at large volume:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX support_message_body_trgm ON "SupportMessage" USING gin (body gin_trgm_ops);
```

Until the tables exist the backend still boots (the support module logs a warning); support
endpoints return errors.

## 2. Backend configuration

Add to `rox-shield-backend/.env` (full list with comments in `.env.example`, section 8):

```env
SUPPORT_JWT_SECRET=<64+ random chars>
SUPPORT_ENCRYPTION_KEY=<64+ random chars>       # never change once apps exist (encrypts app secrets)
SUPPORT_DASHBOARD_ORIGINS=https://support.roxanlabs.com
SUPPORT_PUBLIC_URL=https://shield-api.roxanlabs.com
SUPPORT_STORAGE_DRIVER=firebase                 # existing FIREBASE_STORAGE_BUCKET (default)
SUPPORT_TURN_URLS=turn:turn.roxanlabs.com:3478?transport=udp,turns:turn.roxanlabs.com:5349?transport=tcp
SUPPORT_TURN_SECRET=<coturn static-auth-secret>
SUPPORT_ROX_SHIELD_APP_ID=app_…                 # after creating the app in the dashboard
```

Generate secrets with `openssl rand -base64 48`.

Storage: chat messages live in PostgreSQL. Images, files and voice notes go to `support/…` in the
existing `FIREBASE_STORAGE_BUCKET` (firebase-service-account.json), without public download tokens;
clients only get short-lived signed links through the backend. The only thing written to the server's
disk is the OCR language data for quick answers (`storage/tessdata`, downloaded once, ~10 MB per language).

Quick answers (optional, all have defaults):

```env
SUPPORT_OCR_ENABLED=true      # read text from customer screenshots
SUPPORT_OCR_LANGS=eng         # e.g. eng+urd to also read Urdu text on screens
```

Deploy as usual: `pnpm install && pnpm build && pm2 restart 5089-shield-api`
(`pnpm install` is needed once for the quick-answer packages `tesseract.js` and `sharp`).

## 3. Reverse proxy (WebSockets!)

Socket.IO needs the upgrade headers. If nginx already proxies the API host, make sure this
location exists (it also covers the existing `/ws/*` gateways):

```nginx
location /api/support/realtime/ {
    proxy_pass http://127.0.0.1:5089;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
}

# uploads up to 25 MB
location /api/support/attachments {
    client_max_body_size 26m;
    proxy_pass http://127.0.0.1:5089;
    proxy_set_header X-Real-IP $remote_addr;
}
```

`X-Real-IP` matters: rate limits for public endpoints are per client IP.

## 4. Agent dashboard

```bash
cd rox-support
pnpm install
pnpm build:packages
cd dashboard
echo "NEXT_PUBLIC_SUPPORT_API_URL=https://shield-api.roxanlabs.com" > .env.production
pnpm build
pm2 start "pnpm start" --name rox-support-dashboard     # :3400
```

Serve it on its own HTTPS host (e.g. `support.roxanlabs.com`) — microphone access requires HTTPS.
Put that origin into `SUPPORT_DASHBOARD_ORIGINS`.

## 5. First login

1. Open the dashboard and sign in with the Rox Shield **`SUPER_ADMIN_EMAIL` /
   `SUPER_ADMIN_PASSWORD`**. While no support agents exist, this creates the first super-admin
   agent (bcrypt copy of the password). Change the password afterwards in Settings → Profile.
2. Settings → **New application** for each product (website, Android app, …). Copy the secret.
3. Agents → **Add agent**, choose role and applications.
4. Agents set their status (Online / Away / Busy) from the sidebar. Only **connected + Online**
   agents get auto-assigned conversations and ringing calls.

## 6. TURN

See [`webrtc.md`](webrtc.md#coturn-recommended). Without TURN, calls on restrictive networks
(many mobile carriers) may connect but carry no audio.

## 7. Tests

```bash
# backend unit + realtime integration (no DB needed)
cd rox-shield-backend && npx jest src/support

# WebRTC engine in real Chrome (no DB needed)
cd rox-support && pnpm --filter @roxshield/support-sdk test:webrtc

# dashboard + widget UI smoke test against a stubbed API (no DB needed)
cd rox-support/dashboard && pnpm build && pnpm start &   # :3400
cd rox-support && node tests/ui/run.mjs /tmp/ui-shots

# full end-to-end against a running backend WITH the Support tables
cd rox-support
SUPPORT_API_URL=http://localhost:5089 SUPPORT_ADMIN_EMAIL=… SUPPORT_ADMIN_PASSWORD=… node tests/e2e/run.mjs
```

The end-to-end script creates an "E2E …" application and two agents, runs the customer↔agent
scenarios (auth, messaging, receipts, notes, typing, uploads, access control, round-robin,
call signaling, missed calls, reconnect catch-up, reopen, transfer, anonymous visitors) and
deletes everything it created.

## Operational notes

* Calls in progress during a backend restart are marked `FAILED` at boot.
* The backend is single-instance today; see *Scaling* in `architecture.md` before running more
  than one process.
* Audit log: Settings → Audit log (super admins).
