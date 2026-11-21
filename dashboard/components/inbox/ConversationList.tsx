"use client";

import * as React from "react";
import Link from "next/link";
import { Inbox, Search, SearchX } from "lucide-react";
import type { ConversationView } from "@roxshield/support-sdk";
import { Avatar, Badge, EmptyState, Select, Skeleton } from "@/components/ui";
import { useConversationList, VIEW_LABELS } from "@/lib/inbox";
import { useSupport } from "@/lib/support";
import { cx, priorityLabel, priorityTone, relativeTime, statusLabel, statusTone } from "@/lib/format";

export function ConversationList({ view, activeId }: { view: ConversationView; activeId: string | null }) {
  const { apps, agentsById } = useSupport();
  const [search, setSearch] = React.useState("");
  const [applicationId, setApplicationId] = React.useState("");
  const list = useConversationList(view, { search, applicationId });
  const sentinel = React.useRef<HTMLDivElement>(null);

  // infinite scroll
  React.useEffect(() => {
    const el = sentinel.current;
    if (!el || !list.hasMore) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && void list.loadMore());
    io.observe(el);
    return () => io.disconnect();
  }, [list.hasMore, list.loadMore]); // eslint-disable-line react-hooks/exhaustive-deps

  // re-render every minute so relative timestamps stay fresh
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-zinc-200 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-[15px] font-semibold">{VIEW_LABELS[view]}</h1>
          {!list.loading && <span className="text-xs text-zinc-400 tabular-nums">{list.items.length}{list.hasMore ? "+" : ""}</span>}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, #id or message"
            aria-label="Search conversations"
            className="h-8.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 pr-3 pl-8.5 text-sm outline-none placeholder:text-zinc-400 focus:border-brand-500 focus:bg-white focus:ring-3 focus:ring-brand-500/15"
          />
        </div>
        {apps.length > 1 && (
          <Select value={applicationId} onChange={(e) => setApplicationId(e.target.value)} className="h-8 w-full text-[13px]" aria-label="Filter by application">
            <option value="">All applications</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin" role="list">
        {list.loading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex gap-3 border-b border-zinc-100 px-4 py-3.5">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))
        ) : list.items.length === 0 ? (
          search ? (
            <EmptyState icon={<SearchX className="h-5 w-5" />} title="No matches" description="Try a different name, email, phone number or conversation #." />
          ) : (
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title={view === "mine" ? "Nothing assigned to you" : view === "unassigned" ? "No unassigned conversations" : "No conversations yet"}
              description={view === "mine" ? "New conversations are assigned automatically when you're online." : "New customer messages will appear here instantly."}
            />
          )
        ) : (
          list.items.map((c) => {
            const name = c.customer?.name || (c.customer?.isAnonymous ? "Visitor" : c.customer?.externalId) || "Customer";
            const active = c.id === activeId;
            const typing = list.isTyping(c.id);
            const assignee = c.assigneeId ? agentsById.get(c.assigneeId) ?? c.assignee : null;
            return (
              <Link
                key={c.id}
                href={`/inbox/${view}/${c.id}`}
                role="listitem"
                aria-current={active ? "true" : undefined}
                className={cx(
                  "relative flex gap-3 border-b border-zinc-100 px-4 py-3 transition-colors",
                  active ? "bg-brand-50/70" : "hover:bg-zinc-50"
                )}
              >
                {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-brand-600" />}
                <Avatar name={name} src={c.customer?.avatarUrl} size={36} online={c.customer?.online ?? false} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cx("truncate text-sm", c.unread > 0 ? "font-semibold text-zinc-900" : "font-medium text-zinc-800")}>{name}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-zinc-400 tabular-nums">{relativeTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className={cx("min-w-0 flex-1 truncate text-[13px]", typing ? "text-emerald-600 italic" : c.unread > 0 ? "text-zinc-700" : "text-zinc-500")}>
                      {typing ? "typing…" : (
                        <>
                          {c.lastMessageSender === "AGENT" && <span className="text-zinc-400">↩ </span>}
                          {c.lastMessagePreview || "No messages yet"}
                        </>
                      )}
                    </p>
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white tabular-nums" aria-label={`${c.unread} unread`}>
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-[11px] text-zinc-400">#{c.number}</span>
                    {(view === "all" || view === "mine" || view === "unassigned") && <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>}
                    {c.priority && c.priority !== "NORMAL" && c.priority !== "LOW" && <Badge tone={priorityTone[c.priority]}>{priorityLabel[c.priority]}</Badge>}
                    {apps.length > 1 && c.application && <span className="truncate text-[11px] text-zinc-400">{c.application.name}</span>}
                    <span className="ml-auto">
                      {assignee ? (
                        <span title={`Assigned to ${assignee.name}`}><Avatar name={assignee.name} src={assignee.avatarUrl} size={18} /></span>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-600">Unassigned</span>
                      )}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
        {list.hasMore && (
          <div ref={sentinel} className="p-4 text-center text-xs text-zinc-400">
            {list.loadingMore ? "Loading…" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
