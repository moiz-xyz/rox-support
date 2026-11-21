"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  ChevronsUpDown,
  CircleDot,
  Clock,
  Contact,
  Headphones,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  MessagesSquare,
  Phone,
  Settings,
  UserRound,
  UserRoundX,
  Users,
  CheckCircle2,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import type { AgentStatus, SupportNotification } from "@roxshield/support-sdk";
import { Avatar, Button, Menu, MenuItem } from "@/components/ui";
import { useSupport } from "@/lib/support";
import { agentStatusColor, agentStatusLabel, cx, relativeTime } from "@/lib/format";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "Inbox" },
  { href: "/inbox/all", label: "All conversations", icon: MessagesSquare, count: "all" },
  { href: "/inbox/unassigned", label: "Unassigned", icon: UserRoundX, count: "unassigned" },
  { href: "/inbox/mine", label: "My conversations", icon: UserRound, count: "mine" },
  { href: "/inbox/open", label: "Open", icon: CircleDot, count: "open" },
  { href: "/inbox/pending", label: "Pending", icon: Clock, count: "pending" },
  { href: "/inbox/resolved", label: "Resolved", icon: CheckCircle2 },
  { section: "Workspace" },
  { href: "/contacts", label: "Contacts", icon: Contact },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/quick-answers", label: "Quick answers", icon: Zap },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-60 shrink-0 border-r border-zinc-200 bg-white lg:flex lg:flex-col">
        <SidebarContent />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Navigation">
          <div className="absolute inset-0 bg-zinc-950/40 animate-fade-in" onClick={() => setDrawer(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-white shadow-xl animate-slide-up">
            <SidebarContent />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar onMenu={() => setDrawer(true)} />
        <ConnectionBanner />
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <div className="flex h-12 items-center gap-2 border-b border-zinc-200 bg-white px-3 lg:hidden">
      <Button variant="ghost" size="icon" onClick={onMenu} aria-label="Open navigation">
        <MenuIcon className="h-5 w-5" />
      </Button>
      <span className="font-semibold">Rox Support</span>
      <div className="ml-auto">
        <NotificationsBell />
      </div>
    </div>
  );
}

function ConnectionBanner() {
  const { connection } = useSupport();
  if (connection !== "reconnecting") return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-50 py-1.5 text-xs font-medium text-amber-800">
      <WifiOff className="h-3.5 w-3.5" /> Connection lost — reconnecting. Messages will sync automatically.
    </div>
  );
}

function SidebarContent() {
  const pathname = usePathname();
  const { counts } = useSupport();
  return (
    <>
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Headphones className="h-4.5 w-4.5" />
        </div>
        <span className="font-semibold tracking-tight">Rox Support</span>
        <div className="ml-auto hidden lg:block">
          <NotificationsBell />
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2 scroll-thin" aria-label="Main">
        {NAV.map((item, i) => {
          if ("section" in item) {
            return (
              <div key={i} className="px-2.5 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                {item.section}
              </div>
            );
          }
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const countKey = "count" in item ? (item.count as keyof NonNullable<typeof counts>) : undefined;
          const count = countKey && counts ? counts[countKey] : undefined;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              )}
            >
              <Icon className={cx("h-4 w-4", active ? "text-brand-600" : "text-zinc-400 group-hover:text-zinc-600")} />
              <span className="flex-1 truncate">{item.label}</span>
              {count !== undefined && count > 0 && (
                <span className={cx("min-w-5 rounded-md px-1.5 text-center text-[11px] font-semibold tabular-nums", countKey === "unassigned" ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-600")}>
                  {count > 999 ? "999+" : count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <AgentFooter />
    </>
  );
}

function AgentFooter() {
  const { me, setStatus, client } = useSupport();
  const router = useRouter();
  if (!me) return <div className="m-2.5 h-12 skeleton" />;
  const status = (me.online ? me.effectiveStatus : me.status) as AgentStatus;
  return (
    <div className="border-t border-zinc-200 p-2.5">
      <Menu
        width={224}
        trigger={({ toggle }) => (
          <button onClick={toggle} className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-zinc-50" aria-label="Account and status">
            <span className="relative">
              <Avatar name={me.name} src={me.avatarUrl} size={32} />
              <span className={cx("absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-white", agentStatusColor[status])} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{me.name}</span>
              <span className="block truncate text-xs text-zinc-500">{agentStatusLabel[status]}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 text-zinc-400" />
          </button>
        )}
      >
        {(close) => (
          <>
            <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">Status</div>
            {(["ONLINE", "AWAY", "BUSY", "OFFLINE"] as AgentStatus[]).map((s) => (
              <MenuItem key={s} active={me.status === s} onClick={() => void setStatus(s).finally(close)}>
                <span className={cx("h-2 w-2 rounded-full", agentStatusColor[s])} /> {agentStatusLabel[s]}
              </MenuItem>
            ))}
            <div className="my-1 border-t border-zinc-100" />
            <MenuItem onClick={() => (close(), router.push("/settings"))}>
              <Settings className="h-4 w-4 text-zinc-400" /> Profile & settings
            </MenuItem>
            <MenuItem danger onClick={() => void client.logout().then(() => router.replace("/login"))}>
              <LogOut className="h-4 w-4" /> Sign out
            </MenuItem>
          </>
        )}
      </Menu>
    </div>
  );
}

function NotificationsBell() {
  const { client, unreadNotifications, setUnreadNotifications, subscribe } = useSupport();
  const router = useRouter();
  const [items, setItems] = React.useState<SupportNotification[] | null>(null);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(() => client.notifications({ limit: 20 }).then((r) => (setItems(r.items), setUnreadNotifications(r.unread))), [client, setUnreadNotifications]);
  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);
  React.useEffect(() => subscribe((name, p) => name === "notification:new" && setItems((s) => (s ? [p, ...s].slice(0, 20) : s))), [subscribe]);

  const markAll = async () => {
    await client.markNotificationsRead();
    setUnreadNotifications(0);
    setItems((s) => s?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? s);
  };

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unreadNotifications ? ` (${unreadNotifications} unread)` : ""}`}>
        <Bell className="h-4.5 w-4.5" />
        {unreadNotifications > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadNotifications > 9 ? "9+" : unreadNotifications}
          </span>
        )}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-10 right-0 z-50 w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-xl border border-zinc-200 bg-white shadow-xl animate-fade-in lg:right-auto lg:left-0">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              <div className="flex items-center gap-1">
                {"Notification" in globalThis && typeof Notification !== "undefined" && Notification.permission === "default" && (
                  <Button size="sm" variant="ghost" onClick={() => void Notification.requestPermission()}>Enable desktop alerts</Button>
                )}
                <Button size="sm" variant="ghost" onClick={markAll} aria-label="Mark all as read"><CheckCheck className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto scroll-thin">
              {!items ? (
                <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-12 skeleton" />)}</div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center px-4 py-10 text-center text-sm text-zinc-500"><Inbox className="mb-2 h-6 w-6 text-zinc-300" />You're all caught up</div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setOpen(false);
                      if (!n.readAt) void client.markNotificationsRead([n.id]).then(() => setUnreadNotifications((c) => Math.max(0, c - 1)));
                      if (n.conversationId) router.push(`/inbox/all/${n.conversationId}`);
                    }}
                    className={cx("flex w-full gap-3 border-b border-zinc-50 px-4 py-3 text-left hover:bg-zinc-50", !n.readAt && "bg-brand-50/40")}
                  >
                    <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-600")} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{n.title}</span>
                      {n.body && <span className="block truncate text-[13px] text-zinc-500">{n.body}</span>}
                      <span className="text-[11px] text-zinc-400">{relativeTime(n.createdAt)}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
