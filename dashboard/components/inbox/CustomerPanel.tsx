"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Copy, Lock, Mail, Phone, PhoneMissed, ShieldCheck, Smartphone, Tag, X } from "lucide-react";
import type { Call, Conversation } from "@roxshield/support-sdk";
import { Avatar, Badge, Button, Skeleton } from "@/components/ui";
import { useSupport } from "@/lib/support";
import { dateTime, duration, priorityLabel, priorityTone, relativeTime, statusLabel, statusTone } from "@/lib/format";

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-zinc-100 px-5 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, copy }: { label: string; value?: React.ReactNode; copy?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-[13px]">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-right font-medium text-zinc-800">
        <span className="truncate">{value ?? "—"}</span>
        {copy && (
          <button onClick={() => void navigator.clipboard?.writeText(copy)} className="rounded p-0.5 text-zinc-400 hover:text-zinc-700" aria-label={`Copy ${label}`} title="Copy">
            <Copy className="h-3 w-3" />
          </button>
        )}
      </span>
    </div>
  );
}

export function CustomerPanel({ conversation, onClose }: { conversation: Conversation | null; onClose?: () => void }) {
  const { client, subscribe } = useSupport();
  const [customer, setCustomer] = React.useState<Awaited<ReturnType<typeof client.customer>> | null>(null);
  const [calls, setCalls] = React.useState<Call[] | null>(null);
  const [assignments, setAssignments] = React.useState<any[] | null>(null);
  const [notes, setNotes] = React.useState<{ id: string; body: string | null; author: string; at: string }[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const customerId = conversation?.customerId;
  const conversationId = conversation?.id;

  React.useEffect(() => setTags(conversation?.tags ?? []), [conversation?.id, conversation?.tags]);

  React.useEffect(() => {
    if (!customerId || !conversationId) return;
    setCustomer(null);
    setCalls(null);
    setAssignments(null);
    void client.customer(customerId).then(setCustomer).catch(() => undefined);
    void client.conversationCalls(conversationId).then(setCalls).catch(() => setCalls([]));
    void client.assignments(conversationId).then(setAssignments).catch(() => setAssignments([]));
    void client
      .messages(conversationId, { limit: 100 })
      .then((p) => setNotes(p.items.filter((m) => m.type === "NOTE").map((m) => ({ id: m.id, body: m.body, author: m.agent?.name || "Agent", at: m.createdAt }))))
      .catch(() => undefined);
  }, [client, customerId, conversationId]);

  // keep calls / notes / assignments live
  React.useEffect(
    () =>
      subscribe((name, p) => {
        if (name === "message:new" && p.message.conversationId === conversationId) {
          if (p.message.type === "NOTE") setNotes((n) => [...n, { id: p.message.id, body: p.message.body, author: p.message.agent?.name || "Agent", at: p.message.createdAt }]);
          if (p.message.type === "CALL" && conversationId) void client.conversationCalls(conversationId).then(setCalls).catch(() => undefined);
        }
        if (name === "conversation:assigned" && p.conversation?.id === conversationId && conversationId) void client.assignments(conversationId).then(setAssignments).catch(() => undefined);
      }),
    [subscribe, client, conversationId]
  );

  const saveTags = async (next: string[]) => {
    if (!conversationId) return;
    setTags(next);
    await client.updateConversation(conversationId, { tags: next }).catch(() => undefined);
  };

  if (!conversation) return null;
  const name = conversation.customer?.name || (conversation.customer?.isAnonymous ? "Visitor" : conversation.customer?.externalId) || "Customer";
  const rox = customer?.roxShield;
  const meta = customer?.metadata && typeof customer.metadata === "object" ? Object.entries(customer.metadata).filter(([, v]) => v !== null && v !== "" && typeof v !== "object") : [];

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-start gap-3 border-b border-zinc-100 px-5 pt-5 pb-4">
        <Avatar name={name} src={conversation.customer?.avatarUrl} size={48} online={conversation.customer?.online ?? false} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">{name}</h3>
          <p className="text-xs text-zinc-500">{conversation.customer?.online ? <span className="text-emerald-600">Online</span> : `Last seen ${relativeTime(conversation.customer?.lastSeenAt)} ago`}</p>
          {conversation.customer?.isAnonymous && <Badge className="mt-1.5">Anonymous visitor</Badge>}
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details"><X className="h-4 w-4" /></Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        <Section title="Contact">
          <div className="space-y-1.5 text-[13px]">
            {conversation.customer?.email && (
              <a href={`mailto:${conversation.customer.email}`} className="flex items-center gap-2 text-zinc-700 hover:text-brand-700"><Mail className="h-3.5 w-3.5 text-zinc-400" />{conversation.customer.email}</a>
            )}
            {conversation.customer?.phone && (
              <a href={`tel:${conversation.customer.phone}`} className="flex items-center gap-2 text-zinc-700 hover:text-brand-700"><Phone className="h-3.5 w-3.5 text-zinc-400" />{conversation.customer.phone}</a>
            )}
          </div>
          <div className="mt-2">
            <Row label="Customer ID" value={<code className="text-xs">{conversation.customer?.externalId}</code>} copy={conversation.customer?.externalId} />
            <Row label="Application" value={conversation.application?.name} />
            <Row label="First seen" value={dateTime(conversation.customer?.createdAt)} />
            {customer?.userAgent && <Row label="Device" value={<span title={customer.userAgent}>{deviceOf(customer.userAgent)}</span>} />}
          </div>
          <Link href={`/contacts/${conversation.customerId}`} className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline">View full profile →</Link>
        </Section>

        {customer === null ? (
          <div className="space-y-2 px-5 py-4"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-16" /></div>
        ) : rox ? (
          <Section title="Rox Shield account">
            {rox.tenant && (
              <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-zinc-50 p-2.5 ring-1 ring-zinc-200 ring-inset">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-zinc-500 ring-1 ring-zinc-200"><Building2 className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{rox.tenant.name}</div>
                  <div className="text-xs text-zinc-500">{rox.tenant.slug}</div>
                </div>
                {rox.tenant.isKycVerified && <span title="KYC verified"><ShieldCheck className="h-4 w-4 text-emerald-600" /></span>}
              </div>
            )}
            {rox.user && <Row label="User role" value={rox.user.role} />}
            {rox.user?.branch && <Row label="Branch" value={rox.user.branch} />}
            {rox.tenant && (
              <>
                <Row label="Plan" value={<span className="flex gap-1">{rox.tenant.isPremium && <Badge tone="brand">Premium</Badge>}<Badge tone={rox.tenant.isPaid ? "green" : "amber"}>{rox.tenant.isPaid ? "Paid" : "Unpaid"}</Badge></span>} />
                <Row label="Status" value={<Badge tone={rox.tenant.isActive ? "green" : "red"}>{rox.tenant.isActive ? "Active" : "Suspended"}</Badge>} />
                <Row label="Devices" value={rox.tenant.devices} />
                <Row label="Customers" value={rox.tenant.customers} />
                <Row label="Device keys" value={rox.tenant.deviceKeys} />
                {rox.tenant.trialEndsAt && <Row label="Trial ends" value={dateTime(rox.tenant.trialEndsAt)} />}
                <Row label="App version" value={rox.tenant.preferredAppVersion} />
              </>
            )}
          </Section>
        ) : null}

        {meta.length > 0 && (
          <Section title="Attributes">
            {meta.map(([k, v]) => <Row key={k} label={k} value={String(v)} />)}
          </Section>
        )}

        <Section title="Conversation">
          <Row label="Status" value={<Badge tone={statusTone[conversation.status]}>{statusLabel[conversation.status]}</Badge>} />
          <Row label="Priority" value={<Badge tone={priorityTone[conversation.priority ?? "NORMAL"]}>{priorityLabel[conversation.priority ?? "NORMAL"]}</Badge>} />
          <Row label="Assignee" value={conversation.assignee?.name ?? <span className="text-amber-600">Unassigned</span>} />
          <Row label="Started" value={dateTime(conversation.createdAt)} />
          <Row label="First response" value={conversation.firstResponseAt ? duration((new Date(conversation.firstResponseAt).getTime() - new Date(conversation.createdAt).getTime()) / 1000) : "—"} />
          {!!conversation.reopenedCount && <Row label="Reopened" value={`${conversation.reopenedCount}×`} />}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700">
                <Tag className="h-3 w-3 text-zinc-400" />{t}
                <button onClick={() => void saveTags(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}><X className="h-3 w-3" /></button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tagInput.trim()) {
                  void saveTags([...new Set([...tags, tagInput.trim()])]);
                  setTagInput("");
                }
              }}
              placeholder="+ Add tag"
              aria-label="Add tag"
              className="h-6 w-24 rounded-md px-1.5 text-[12px] outline-none placeholder:text-zinc-400 focus:bg-zinc-50"
            />
          </div>
        </Section>

        <Section title={`Internal notes${notes.length ? ` · ${notes.length}` : ""}`}>
          {notes.length === 0 ? (
            <p className="text-[13px] text-zinc-400">No notes yet. Switch the composer to “Internal note” to leave one.</p>
          ) : (
            <div className="space-y-2">
              {notes.slice(-5).reverse().map((n) => (
                <div key={n.id} className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] ring-1 ring-amber-200 ring-inset">
                  <div className="mb-0.5 flex items-center gap-1 text-[11px] text-amber-800"><Lock className="h-3 w-3" />{n.author} · {relativeTime(n.at)}</div>
                  <p className="whitespace-pre-wrap text-amber-950">{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Previous conversations">
          {!customer ? (
            <Skeleton className="h-10" />
          ) : customer.conversations.filter((x) => x.id !== conversation.id).length === 0 ? (
            <p className="text-[13px] text-zinc-400">This is their first conversation.</p>
          ) : (
            <div className="-mx-2 space-y-0.5">
              {customer.conversations.filter((x) => x.id !== conversation.id).slice(0, 8).map((x) => (
                <Link key={x.id} href={`/inbox/all/${x.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50">
                  <span className="text-[11px] text-zinc-400">#{x.number}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-700">{x.lastMessagePreview || "No messages"}</span>
                  <Badge tone={statusTone[x.status]}>{statusLabel[x.status]}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Calls">
          {!calls ? (
            <Skeleton className="h-10" />
          ) : calls.length === 0 ? (
            <p className="text-[13px] text-zinc-400">No calls in this conversation.</p>
          ) : (
            <div className="space-y-1.5">
              {calls.slice(0, 6).map((cl) => (
                <div key={cl.id} className="flex items-center gap-2 text-[13px]">
                  {["MISSED", "REJECTED", "FAILED", "CANCELLED"].includes(cl.status) ? <PhoneMissed className="h-3.5 w-3.5 text-red-500" /> : <Phone className="h-3.5 w-3.5 text-emerald-600" />}
                  <span className="flex-1 text-zinc-700">{cl.status === "ENDED" ? `${duration(cl.durationSec)}${cl.agent ? ` · ${cl.agent.name}` : ""}` : cl.status.toLowerCase()}</span>
                  <span className="text-[11px] text-zinc-400">{relativeTime(cl.startedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Assignment history">
          {!assignments ? (
            <Skeleton className="h-10" />
          ) : assignments.length === 0 ? (
            <p className="text-[13px] text-zinc-400">Never assigned.</p>
          ) : (
            <ol className="space-y-1.5">
              {assignments.slice(0, 8).map((a) => (
                <li key={a.id} className="text-[12px] text-zinc-600">
                  <span className="font-medium text-zinc-800">{a.toAgent?.name ?? "Unassigned"}</span>
                  {a.reason === "AUTO" ? " · auto" : a.assignedBy ? ` · by ${a.assignedBy.name}` : ""}
                  <span className="text-zinc-400"> · {relativeTime(a.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </div>
  );
}

function deviceOf(ua: string) {
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Unknown";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /wv\)/.test(ua) ? "WebView" : "Browser";
  return (
    <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3 text-zinc-400" />{browser} · {os}</span>
  );
}
