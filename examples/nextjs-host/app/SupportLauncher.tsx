"use client";

import { SupportWidget } from "@roxshield/support-widget";

export function SupportLauncher() {
  return (
    <SupportWidget
      apiUrl={process.env.NEXT_PUBLIC_SUPPORT_API_URL!}
      appId={process.env.NEXT_PUBLIC_SUPPORT_APP_ID!}
      // fetched on start and whenever the support session expires
      getCustomerToken={async () => {
        const res = await fetch("/api/support-token", { cache: "no-store" });
        return res.status === 200 ? res.text() : null;
      }}
      welcomeTitle="Hi! 👋"
    />
  );
}
