"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Clock, Inbox, MessageCircle, Phone, PhoneMissed, Timer, UserRoundX, CheckCircle2 } from "lucide-react";
import { Avatar, Card, Select, Skeleton } from "@/components/ui";
import { useSupport } from "@/lib/support";
import { agentStatusColor, agentStatusLabel, cx, duration } from "@/lib/format";

export default function DashboardPage() {
  const { client, me, apps, connection } = useSupport();
  const [days, setDays] = React.useState(7);
  const [applicationId, setApplicationId] = React.useState("");
  const [stats, setStats] = React.useState<any>(null);

  const load = React.useCallback(() => {
    client.stats(days, applicationId || undefined).then(setStats).catch(() => undefined);
  }, [client, days, applicationId]);
  React.useEffect(() => {
    if (!me) return;
    setStats(null);
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [me, load]);

  const maxDaily = Math.max(1, ...(stats?.daily ?? []).map((d: any) => d.count));
  const hour = new Date().getHours();

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}{me ? `, ${me.name.split(" ")[0]}` : ""}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Here's how support is doing.{" "}
              <span className={cx("inline-flex items-center gap-1", connection === "connected" ? "text-emerald-600" : "text-amber-600")}>
                <span className={cx("h-1.5 w-1.5 rounded-full", connection === "connected" ? "bg-emerald-500" : "bg-amber-400")} />
                {connection === "connected" ? "Live" : "Connecting…"}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            {apps.length > 1 && (
              <Select value={applicationId} onChange={(e) => setApplicationId(e.target.value)} aria-label="Application">
                <option value="">All applications</option>
                {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            )}
            <Select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Range">
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </Select>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<Inbox className="h-4 w-4" />} label="Open" value={stats?.conversations.open} href="/inbox/open" />
          <Stat icon={<UserRoundX className="h-4 w-4" />} label="Unassigned" value={stats?.conversations.unassigned} href="/inbox/unassigned" tone={stats?.conversations.unassigned ? "amber" : undefined} />
          <Stat icon={<Clock className="h-4 w-4" />} label="Pending" value={stats?.conversations.pending} href="/inbox/pending" />
          <Stat icon={<CheckCircle2 className="h-4 w-4" />} label={`Resolved · ${days}d`} value={stats?.conversations.resolved} href="/inbox/resolved" />
          <Stat icon={<MessageCircle className="h-4 w-4" />} label={`New conversations · ${days}d`} value={stats?.conversations.new} />
          <Stat icon={<Timer className="h-4 w-4" />} label="Avg. first response" value={stats ? (stats.avgFirstResponseSec === null ? "—" : duration(stats.avgFirstResponseSec)) : undefined} />
          <Stat icon={<Phone className="h-4 w-4" />} label={`Calls · avg ${stats?.calls.avgDurationSec ? duration(stats.calls.avgDurationSec) : "—"}`} value={stats?.calls.total} href="/calls" />
          <Stat icon={<PhoneMissed className="h-4 w-4" />} label="Missed calls" value={stats?.calls.missed} href="/calls" tone={stats?.calls.missed ? "red" : undefined} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          <Card className="p-5 lg:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Conversation volume</h2>
              <span className="text-xs text-zinc-400">New conversations per day</span>
            </div>
            {!stats ? (
              <Skeleton className="mt-5 h-40" />
            ) : stats.daily.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-zinc-400">No conversations in this period</div>
            ) : (
              <div className="mt-5 flex h-40 items-end gap-1.5" role="img" aria-label="Daily conversation volume">
                {stats.daily.map((d: any) => (
                  <div key={d.day} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                    <div className="flex w-full flex-1 items-end justify-center"><div className="w-full max-w-10 rounded-t-md bg-brand-500/80 transition-colors group-hover:bg-brand-600" style={{ height: `${Math.max(4, (d.count / maxDaily) * 100)}%` }} /></div>
                    <span className="mt-1.5 text-[10px] text-zinc-400">{new Date(d.day).toLocaleDateString([], { day: "numeric", month: "short" })}</span>
                    <span className="pointer-events-none absolute -top-6 rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] text-white opacity-0 group-hover:opacity-100">{d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-semibold">
                Team
                {stats && (
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {stats.agents.filter((a: any) => a.online && a.status === "ONLINE").length} of {stats.agents.length} live
                  </span>
                )}
              </h2>
              <Link href="/agents" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">Manage <ArrowRight className="h-3 w-3" /></Link>
            </div>
            <div className="divide-y divide-zinc-50">
              {!stats
                ? [0, 1, 2].map((i) => <div key={i} className="px-5 py-3"><Skeleton className="h-8" /></div>)
                : stats.agents.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="relative">
                        <Avatar name={a.name} src={a.avatarUrl} size={30} />
                        <span className={cx("absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white", agentStatusColor[(a.online ? a.status : "OFFLINE") as keyof typeof agentStatusColor] ?? "bg-zinc-300")} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{a.name}</div>
                        <div className="text-xs text-zinc-500">{a.online ? agentStatusLabel[a.status as keyof typeof agentStatusLabel] : "Offline"}</div>
                      </div>
                      <span className="text-xs text-zinc-500 tabular-nums">{a.openConversations} open</span>
                    </div>
                  ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, href, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; href?: string; tone?: "amber" | "red" }) {
  const body = (
    <Card className={cx("h-full p-4 transition-shadow", href && "hover:shadow-md")}>
      <div className={cx("flex h-7 w-7 items-center justify-center rounded-lg", tone === "amber" ? "bg-amber-50 text-amber-600" : tone === "red" ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-500")}>{icon}</div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value === undefined ? <Skeleton className="h-7 w-12" /> : value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{label}</div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
