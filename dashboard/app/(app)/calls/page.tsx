"use client";

import * as React from "react";
import Link from "next/link";
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import type { Call } from "@roxshield/support-sdk";
import { Avatar, Badge, Button, EmptyState, Select, Skeleton } from "@/components/ui";
import { useSupport } from "@/lib/support";
import { dateTime, duration } from "@/lib/format";

const STATUS_TONE: Record<string, "green" | "red" | "amber" | "neutral"> = { ENDED: "green", MISSED: "red", REJECTED: "amber", CANCELLED: "neutral", FAILED: "red", ONGOING: "green", RINGING: "amber" };

export default function CallsPage() {
  const { client, me } = useSupport();
  const [status, setStatus] = React.useState("");
  const [rows, setRows] = React.useState<Call[] | null>(null);
  const [more, setMore] = React.useState(true);

  React.useEffect(() => {
    if (!me) return;
    setRows(null);
    client.callHistory({ status: status || undefined, limit: 50 }).then((r) => (setRows(r), setMore(r.length === 50))).catch(() => setRows([]));
  }, [client, me, status]);

  const loadMore = async () => {
    const last = rows?.[rows.length - 1];
    if (!last) return;
    const r = await client.callHistory({ status: status || undefined, before: last.startedAt, limit: 50 });
    setRows((s) => [...(s ?? []), ...r]);
    setMore(r.length === 50);
  };

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Calls</h1>
            <p className="mt-1 text-sm text-zinc-500">Voice call history, including missed calls.</p>
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All calls</option>
            <option value="ENDED">Completed</option>
            <option value="MISSED">Missed</option>
            <option value="REJECTED">Declined</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Direction</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Agent</th>
                  <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                  <th className="px-4 py-2.5 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {!rows
                  ? Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-6" /></td></tr>)
                  : rows.map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-2.5">
                          <Link href={`/inbox/all/${c.conversationId}`} className="flex items-center gap-2.5">
                            <Avatar name={c.customer?.name || "Visitor"} size={28} />
                            <span className="font-medium">{c.customer?.name || "Visitor"}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-600">
                          <span className="inline-flex items-center gap-1.5">
                            {c.status === "MISSED" ? <PhoneMissed className="h-3.5 w-3.5 text-red-500" /> : c.initiatedBy === "CUSTOMER" ? <PhoneIncoming className="h-3.5 w-3.5 text-zinc-400" /> : <PhoneOutgoing className="h-3.5 w-3.5 text-zinc-400" />}
                            {c.initiatedBy === "CUSTOMER" ? "Inbound" : "Outbound"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status.toLowerCase()}</Badge></td>
                        <td className="px-4 py-2.5 text-zinc-600">{c.agent?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{c.durationSec !== null ? duration(c.durationSec) : "—"}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-500">{dateTime(c.startedAt)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {rows && rows.length === 0 && <EmptyState icon={<Phone className="h-5 w-5" />} title="No calls yet" description="Customers can call you from the support widget." />}
          {rows && rows.length > 0 && more && (
            <div className="border-t border-zinc-100 p-3 text-center"><Button size="sm" onClick={loadMore}>Load more</Button></div>
          )}
        </div>
      </div>
    </div>
  );
}
