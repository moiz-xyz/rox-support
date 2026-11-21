"use client";

import * as React from "react";
import Link from "next/link";
import { Contact, Search } from "lucide-react";
import { Avatar, Badge, Button, EmptyState, Skeleton } from "@/components/ui";
import { useSupport } from "@/lib/support";
import { relativeTime } from "@/lib/format";

export default function ContactsPage() {
  const { client, me } = useSupport();
  const [search, setSearch] = React.useState("");
  const [rows, setRows] = React.useState<Awaited<ReturnType<typeof client.customers>>["items"] | null>(null);
  const [cursor, setCursor] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!me) return;
    const t = setTimeout(() => {
      setRows(null);
      client.customers({ search: search || undefined, limit: 40 }).then((r) => (setRows(r.items), setCursor(r.nextCursor))).catch(() => setRows([]));
    }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [client, me, search]);

  const more = async () => {
    if (!cursor) return;
    const r = await client.customers({ search: search || undefined, cursor, limit: 40 });
    setRows((s) => [...(s ?? []), ...r.items]);
    setCursor(r.nextCursor);
  };

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Contacts</h1>
            <p className="mt-1 text-sm text-zinc-500">Everyone who has talked to support, across all applications.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone, ID" aria-label="Search contacts" className="h-9 w-full rounded-lg border border-zinc-200 bg-white pr-3 pl-9 text-sm outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15" />
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Contact</th>
                  <th className="px-4 py-2.5 font-medium">Application</th>
                  <th className="px-4 py-2.5 text-right font-medium">Conversations</th>
                  <th className="px-4 py-2.5 text-right font-medium">Calls</th>
                  <th className="px-4 py-2.5 text-right font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {!rows
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-6" /></td></tr>
                    ))
                  : rows.map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-2.5">
                          <Link href={`/contacts/${c.id}`} className="flex items-center gap-2.5">
                            <Avatar name={c.name || "Visitor"} src={c.avatarUrl} size={30} online={c.online} />
                            <span>
                              <span className="block font-medium">{c.name || (c.isAnonymous ? "Visitor" : c.externalId)}</span>
                              <span className="block text-xs text-zinc-400">{c.externalId}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-600">{c.email || c.phone || "—"}</td>
                        <td className="px-4 py-2.5"><Badge>{c.application?.name}</Badge></td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{c.conversationCount}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{c.callCount}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-500">{c.online ? <span className="text-emerald-600">Online</span> : relativeTime(c.lastSeenAt)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {rows && rows.length === 0 && <EmptyState icon={<Contact className="h-5 w-5" />} title="No contacts found" description="Contacts appear when customers open the support widget." />}
          {cursor && (
            <div className="border-t border-zinc-100 p-3 text-center">
              <Button size="sm" onClick={more}>Load more</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
