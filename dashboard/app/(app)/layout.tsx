"use client";

import { Shell } from "@/components/Shell";
import { ActiveCallBar, IncomingCalls } from "@/components/calls/CallUI";
import { ToastProvider } from "@/components/ui";
import { SupportProvider } from "@/lib/support";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <SupportProvider>
        <Shell>{children}</Shell>
        <IncomingCalls />
        <ActiveCallBar />
      </SupportProvider>
    </ToastProvider>
  );
}
