"use client";

import * as React from "react";
import { SupportWidget } from "@roxshield/support-widget";
import { API_URL } from "@/lib/support";

declare global {
  interface Window {
    /** Optional bridge injected by native apps (Android: addJavascriptInterface(bridge, "RoxSupportBridge")). */
    RoxSupportBridge?: { getIdentityToken?: () => string; getPushToken?: () => string; onUnreadChange?: (count: number) => void; close?: () => void };
  }
}

/**
 * Full-screen widget host for native apps (Android WebView / iOS WKWebView).
 *   https://support.example.com/embed?appId=app_xxx#token=<identity token>
 * The token travels in the URL fragment so it never reaches server logs. Native apps can
 * instead expose window.RoxSupportBridge.getIdentityToken() to supply fresh tokens on demand.
 */
export default function EmbedPage() {
  const [params, setParams] = React.useState<{ appId: string; token: string | null; color?: string } | null>(null);
  const usedToken = React.useRef(false);

  React.useEffect(() => {
    const q = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    setParams({ appId: q.get("appId") || "", token: hash.get("token"), color: q.get("color") || undefined });
    // drop the token from the address bar / history
    if (hash.get("token")) history.replaceState(null, "", location.pathname + location.search);
  }, []);

  if (!params) return null;
  if (!params.appId) return <p style={{ padding: 24, fontFamily: "system-ui" }}>Missing appId.</p>;

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <SupportWidget
        mode="embedded"
        apiUrl={API_URL}
        appId={params.appId}
        appearance={params.color ? { primaryColor: `#${params.color.replace(/^#/, "")}` } : undefined}
        getCustomerToken={() => {
          const fromBridge = window.RoxSupportBridge?.getIdentityToken?.();
          if (fromBridge) return fromBridge;
          // the fragment token is single-use (it is short-lived anyway)
          if (!usedToken.current && params.token) {
            usedToken.current = true;
            return params.token;
          }
          return null;
        }}
        onUnreadChange={(n) => window.RoxSupportBridge?.onUnreadChange?.(n)}
        onReady={(client) => {
          // native apps can hand over their FCM token so agent replies / missed calls arrive as push notifications
          const pushToken = window.RoxSupportBridge?.getPushToken?.();
          if (pushToken) void client.registerPushToken(pushToken, "android").catch(() => undefined);
        }}
      />
    </div>
  );
}
