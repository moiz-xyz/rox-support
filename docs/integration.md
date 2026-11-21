# Integrating the widget into a Next.js / React app

Three steps: create an application in the dashboard, mint customer tokens on your server, render
`<SupportWidget/>`. A complete working example lives in [`examples/nextjs-host`](../examples/nextjs-host).

## 1. Create an application

Dashboard → **Settings → Applications & widget → New application** (super admin).

* **App ID** (`app_…`) — public, goes into browser code.
* **Signing secret** (`rsk_…`) — shown **once**. Store it server-side only
  (`ROX_SUPPORT_APP_SECRET`). Rotate it from the same screen if it ever leaks.
* **Allowed origins** — e.g. `https://shop.example.com`, `*.example.com`.
* **Allow anonymous visitors** — for marketing sites where people aren't signed in.

## 2. Install

The packages live in this repo. Options:

```bash
# a) monorepo / workspace link (what examples/nextjs-host does)
"@roxshield/support-widget": "workspace:*"

# b) build tarballs and install them anywhere
cd rox-support && pnpm build:packages
cd packages/support-sdk && pnpm pack       # roxshield-support-sdk-0.1.0.tgz
cd ../support-widget && pnpm pack          # roxshield-support-widget-0.1.0.tgz
npm i ./roxshield-support-sdk-0.1.0.tgz ./roxshield-support-widget-0.1.0.tgz

# c) publish both to a private registry (GitHub Packages / Verdaccio) and npm i as usual
```

Peer dependencies: `react` and `react-dom` ≥ 18.2. The widget ships ESM + CJS + types and is
marked `"use client"`.

```ts
// next.config.ts — only needed for workspace links (option a)
const nextConfig = { transpilePackages: ["@roxshield/support-sdk", "@roxshield/support-widget"] };
```

## 3. Mint customer tokens on your server

Never trust a customer id from the browser. Your backend — which already knows who is signed in —
signs a short-lived token with the app secret:

```ts
// app/api/support-token/route.ts
import { createCustomerToken } from "@roxshield/support-sdk/server";
import { getCurrentUser } from "@/lib/auth"; // your session

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("", { status: 204 }); // anonymous (if the app allows it)

  const token = createCustomerToken({
    appSecret: process.env.ROX_SUPPORT_APP_SECRET!,
    customer: {
      id: user.id,                       // stable id in YOUR system → becomes the contact
      name: user.name,
      email: user.email,
      phone: user.phone,
      metadata: { plan: user.plan, orders: user.orderCount }, // shown to agents
    },
    expiresInSec: 300,
  });
  return new Response(token, { headers: { "Cache-Control": "no-store" } });
}
```

Not using Node? Any JWT library works: HS256, secret = `rsk_…`, claims
`{ sub, name?, email?, phone?, avatarUrl?, metadata?, iat, exp }`, lifetime ≤ 1 h.

## 4. Render the widget

```tsx
// app/SupportLauncher.tsx
"use client";
import { SupportWidget } from "@roxshield/support-widget";

export function SupportLauncher() {
  return (
    <SupportWidget
      apiUrl="https://shield-api.roxanlabs.com"
      appId="app_XXXXXXXXXXXX"
      getCustomerToken={async () => {
        const res = await fetch("/api/support-token", { cache: "no-store" });
        return res.status === 200 ? res.text() : null;
      }}
    />
  );
}
```

```tsx
// app/layout.tsx
import { SupportLauncher } from "./SupportLauncher";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SupportLauncher />
      </body>
    </html>
  );
}
```

`getCustomerToken` is called when the widget starts and again whenever the 2-hour support session
expires, so users stay connected without reloading. You can pass a fixed `customerToken` instead,
but it will expire.

## Props

| Prop | Type | Default | |
|---|---|---|---|
| `appId` | `string` | — | public application id |
| `apiUrl` | `string` | — | backend origin (no `/api`) |
| `getCustomerToken` | `() => string \| null \| Promise<…>` | — | preferred; return `null` for anonymous |
| `customerToken` | `string` | — | static alternative |
| `appearance` | `{ primaryColor?, brandName?, logoUrl?, position?: "bottom-right"\|"bottom-left", offsetX?, offsetY?, zIndex? }` | dashboard settings | per-site overrides |
| `welcomeTitle` / `welcomeMessage` | `string` | dashboard settings | |
| `mode` | `"floating" \| "embedded"` | `"floating"` | `embedded` fills its parent (WebViews, help pages) |
| `defaultOpen` | `boolean` | `false` | |
| `enableCalls` / `enableAttachments` / `enableVoiceMessages` | `boolean` | `true` | can only switch features **off** |
| `notifications` | `boolean` | `true` | desktop notifications for replies while the tab is hidden |
| `onOpenChange` | `(open) => void` | | |
| `onUnreadChange` | `(count) => void` | | e.g. badge your own "Help" button |
| `onReady` | `(client) => void` | | access to `SupportCustomerClient` |

Imperative control via `ref`:

```tsx
const support = useRef<SupportWidgetHandle>(null);
<SupportWidget ref={support} … />
<button onClick={() => support.current?.open()}>Contact support</button>
<button onClick={() => support.current?.startCall()}>Call us</button>
```

## Styling & isolation

The widget renders inside a **shadow root**: your CSS can't break it and its CSS can't leak into
your app. Brand colour, logo, name, position, welcome/offline texts and business hours are managed
in the dashboard (per application) and can be overridden per site with `appearance`.

## What the customer gets

Floating launcher with unread badge · conversation history (and past conversations) · text with
links · image/screenshot paste & drag-and-drop with previews and upload progress · files (PDF,
Office, ZIP…) · voice messages · reply-to · typing indicator · sent/delivered/seen ticks ·
online/offline availability · call button with ringing, mute, speaker selection, duration ·
incoming calls from agents · reconnect banner and automatic catch-up · full-screen on phones.

## Headless use

Building your own UI (or a React Native app)? Use the SDK directly:

```ts
import { SupportCustomerClient } from "@roxshield/support-sdk";

const client = new SupportCustomerClient({ apiUrl, appId, getIdentityToken });
await client.start();
client.on("message", (m) => render(m));
await client.sendMessage({ body: "Hello" });
await client.calls.start(); // WebRTC voice call
```

## Rox Shield's own users

For apps whose users are Rox Shield shop accounts, you don't need an app secret on the client at
all: enable **Rox Shield accounts** on the application and call
`POST /api/support/identity/rox-shield` with the user's existing Rox Shield JWT to get an identity
token. Agents then see the shop's live account (plan, KYC, devices, branch…) next to the chat.
See [`android.md`](android.md).
