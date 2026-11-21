"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { Avatar, Badge, Card, EmptyState, Skeleton } from "@/components/ui";
import { useSupport } from "@/lib/support";
import { dateTime, relativeTime, statusLabel, statusTone } from "@/lib/format";

export default function ContactPage() {
  const { id } = useParams<{ id: string }>();
  const { client, me } = useSupport();
  const [c, setC] = React.useState<Awaited<ReturnType<typeof client.customer>> | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (me) client.customer(id).then(setC).catch((e) => setError(e?.message || "Not found"));
  }, [client, id, me]);

  if (error) return <EmptyState icon={<ArrowLeft className="h-5 w-5" />} title="Contact unavailable" description={error} />;

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
        <Link href="/contacts" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-4 w-4" /> Contacts</Link>
        {!c ? (
          <Skeleton className="mt-6 h-40" />
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Avatar name={c.name || "Visitor"} src={c.avatarUrl} size={56} online={c.online} />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold tracking-tight">{c.name || (c.isAnonymous ? "Anonymous visitor" : c.externalId)}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
                  {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{c.email}</span>}
                  {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{c.phone}</span>}
                  <Badge>{c.application?.name}</Badge>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <Card className="p-5">
                <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Details</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-zinc-500">Customer ID</dt><dd className="truncate font-mono text-xs">{c.externalId}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-zinc-500">First seen</dt><dd>{dateTime(c.createdAt)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-zinc-500">Last seen</dt><dd>{c.online ? "Online now" : relativeTime(c.lastSeenAt)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-zinc-500">Messages sent</dt><dd className="tabular-nums">{c.stats.messages}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-zinc-500">Calls</dt><dd className="tabular-nums">{c.stats.calls}</dd></div>
                  {c.metadata && Object.entries(c.metadata).filter(([, v]) => typeof v !== "object").map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2"><dt className="text-zinc-500">{k}</dt><dd className="truncate">{String(v)}</dd></div>
                  ))}
                </dl>
                {c.roxShield?.tenant && (
                  <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm ring-1 ring-zinc-200 ring-inset">
                    <div className="text-xs text-zinc-500">Rox Shield shop</div>
                    <div className="font-semibold">{c.roxShield.tenant.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">{c.roxShield.tenant.devices} devices · {c.roxShield.tenant.customers} customers</div>
                  </div>
                )}
              </Card>
              <Card className="md:col-span-2">
                <h2 className="border-b border-zinc-100 px-5 py-4 text-sm font-semibold">Support history</h2>
                {c.conversations.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-zinc-400">No conversations.</p>
                ) : (
                  <div className="divide-y divide-zinc-50">
                    {c.conversations.map((x) => (
                      <Link key={x.id} href={`/inbox/all/${x.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50">
                        <span className="w-12 text-xs text-zinc-400">#{x.number}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{x.lastMessagePreview || "No messages"}</span>
                        {x.assignee && <span className="hidden text-xs text-zinc-500 sm:inline">{x.assignee.name}</span>}
                        <Badge tone={statusTone[x.status]}>{statusLabel[x.status]}</Badge>
                        <span className="w-14 text-right text-xs text-zinc-400">{relativeTime(x.lastMessageAt)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
