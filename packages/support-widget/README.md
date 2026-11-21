# @roxshield/support-widget

Drop-in support widget for React / Next.js: chat, image & file sharing, voice messages and WebRTC
voice calls, talking to the Rox Support backend. Renders in a shadow root (style-isolated), ships
ESM + CJS + types, marked `"use client"`.

```tsx
import { SupportWidget } from "@roxshield/support-widget";

<SupportWidget
  apiUrl="https://shield-api.roxanlabs.com"
  appId="app_XXXXXXXXXXXX"
  getCustomerToken={async () => (await fetch("/api/support-token")).text()}
/>
```

Props, theming, imperative API and server-side token minting: see
[`docs/integration.md`](../../docs/integration.md).
