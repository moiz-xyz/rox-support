"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, BookmarkPlus, Check, ChevronDown, Flag, MessageSquareDashed, PanelRight, Phone, RotateCcw, UserPlus, Search, Video } from "lucide-react";
import type { Conversation, Message, Priority } from "@roxshield/support-sdk";
import { Avatar, Badge, Button, EmptyState, Menu, MenuItem, Skeleton, useToast } from "@/components/ui";
import { useThread } from "@/lib/inbox";
import { useSupport } from "@/lib/support";
import { agentStatusColor, cx, priorityLabel, priorityTone, relativeTime, statusLabel, statusTone } from "@/lib/format";
import { MessageTimeline } from "./MessageTimeline";
import { Composer } from "./Composer";
import { SuggestionCard, useQuickAnswerSuggestion } from "./SuggestionCard";
import { QuickAnswerForm, QuickAnswerDraftForm } from "@/components/quick-answers/QuickAnswerForm";

export function ChatView({ conversationId, backHref, onTogglePanel, onConversation }: { conversationId: string; backHref: string; onTogglePanel: () => void; onConversation: (c: Conversation | null) => void }) {
  const { me, client, call, isSupervisor } = useSupport();
  const toast = useToast();
  const thread = useThread(conversationId);
  const [replyTo, setReplyTo] = React.useState<Message | null>(null);
  const [suggestion, setSuggestion] = useQuickAnswerSuggestion(conversationId);
  const [prefill, setPrefill] = React.useState<{ text: string; nonce: number } | null>(null);
  const [saveDraft, setSaveDraft] = React.useState<QuickAnswerDraftForm | null>(null);
  const [drafting, setDrafting] = React.useState(false);
  const c = thread.conversation;

  React.useEffect(() => onConversation(c), [c, onConversation]);
  React.useEffect(() => setReplyTo(null), [conversationId]);

  const run = async (fn: () => Promise<Conversation>, success?: string) => {
    try {
      const updated = await fn();
      thread.setConversation((prev) => (prev ? { ...prev, ...updated } : updated));
      if (success) toast({ title: success, tone: "success" });
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message, tone: "error" });
    }
  };

  if (thread.error) return <EmptyState icon={<MessageSquareDashed className="h-5 w-5" />} title="Conversation unavailable" description={thread.error} action={<Link href={backHref}><Button>Back to inbox</Button></Link>} />;

  const dismissSuggestion = () => {
    setSuggestion(null);
    void client.dismissQuickAnswerSuggestion(conversationId).catch(() => undefined);
  };

  const openSaveAsQuickAnswer = async () => {
    setDrafting(true);
    try {
      const d = await client.quickAnswerDraft(conversationId);
      setSaveDraft({ applicationId: d.applicationId, title: d.title, answer: d.answer, phrases: d.phrases, screenTexts: d.screenTexts, imageHashes: d.imageHashes, enabled: true, approved: true });
    } catch (e: any) {
      toast({ title: "Could not prepare the quick answer", description: e?.message, tone: "error" });
    } finally {
      setDrafting(false);
    }
  };

  const customerName = c?.customer?.name || (c?.customer?.isAnonymous ? "Visitor" : c?.customer?.externalId) || "Customer";
  const callBusy = call.phase !== "idle" && call.phase !== "ended";
  const canReply = !!c && (isSupervisor || !c.assigneeId || c.assigneeId === me?.id);

  return (
    <div className="flex h-full min-w-0 flex-col bg-white">
      {/* header */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-200 px-3 sm:px-4">
        <Link href={backHref} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 lg:hidden" aria-label="Back to conversations">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {!c ? (
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-3 w-20" /></div>
          </div>
        ) : (
          <>
            <Avatar name={customerName} src={c.customer?.avatarUrl} size={36} online={c.customer?.online ?? false} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-[15px] font-semibold">{customerName}</h2>
                <span className="hidden shrink-0 items-center gap-2 2xl:flex">
                  <span className="text-xs text-zinc-400">#{c.number}</span>
                  <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>
                </span>
              </div>
              <p className="truncate text-xs text-zinc-500">
                {thread.customerTyping ? <span className="text-emerald-600">typing…</span> : c.customer?.online ? <span className="text-emerald-600">Online now</span> : `Last seen ${relativeTime(c.customer?.lastSeenAt)} ago`}
                <span className="2xl:hidden"> · #{c.number} · {statusLabel[c.status]}</span>
                {c.application ? <span className="hidden md:inline"> · {c.application.name}</span> : null}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                title={c.customer?.online ? "Call customer" : "Customer must have the widget open to receive a call"}
                aria-label="Call customer"
                disabled={!c.customer?.online || callBusy}
                onClick={() =>
                  void client.calls.start({ conversationId: c.id, peer: { name: customerName, avatarUrl: c.customer?.avatarUrl } }).catch((e) => toast({ title: "Could not start call", description: e?.message, tone: "error" }))
                }
              >
                <Phone className="h-4.5 w-4.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={c.customer?.online ? "Video call" : "Customer must have the support screen open to receive a call"}
                aria-label="Video call customer"
                disabled={!c.customer?.online || callBusy}
                onClick={() =>
                  void client.calls
                    .start({ conversationId: c.id, media: "VIDEO", peer: { name: customerName, avatarUrl: c.customer?.avatarUrl } })
                    .catch((e) => toast({ title: "Could not start video call", description: e?.message, tone: "error" }))
                }
              >
                <Video className="h-4.5 w-4.5" />
              </Button>
              <Button variant="ghost" size="icon" title="Save as quick answer" aria-label="Save as quick answer" loading={drafting} onClick={() => void openSaveAsQuickAnswer()}>
                {!drafting && <BookmarkPlus className="h-4.5 w-4.5" />}
              </Button>
              <AssignMenu conversation={c} onAssign={(agentId) => run(() => client.assign(c.id, agentId), agentId ? "Conversation assigned" : "Conversation unassigned")} />
              <span className="hidden md:block">
                <PriorityMenu value={c.priority ?? "NORMAL"} onChange={(p) => run(() => client.updateConversation(c.id, { priority: p }))} />
              </span>
              {c.status === "RESOLVED" ? (
                <Button size="sm" onClick={() => run(() => client.updateConversation(c.id, { status: "OPEN" }), "Conversation reopened")}>
                  <RotateCcw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Reopen</span>
                </Button>
              ) : (
                <div className="flex">
                  <Button size="sm" variant="primary" className="rounded-r-none" onClick={() => run(() => client.updateConversation(c.id, { status: "RESOLVED" }), "Conversation resolved")}>
                    <Check className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Resolve</span>
                  </Button>
                  <Menu
                    align="right"
                    width={180}
                    trigger={({ toggle }) => (
                      <Button size="sm" variant="primary" className="rounded-l-none border-l border-brand-500 px-1.5" onClick={toggle} aria-label="More status options">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuItem active={c.status === "OPEN"} onClick={() => (close(), void run(() => client.updateConversation(c.id, { status: "OPEN" })))}>Mark as open</MenuItem>
                        <MenuItem active={c.status === "PENDING"} onClick={() => (close(), void run(() => client.updateConversation(c.id, { status: "PENDING" }), "Waiting on customer"))}>Mark as pending</MenuItem>
                      </>
                    )}
                  </Menu>
                </div>
              )}
              <Button variant="ghost" size="icon" onClick={onTogglePanel} aria-label="Toggle customer details" className="xl:hidden">
                <PanelRight className="h-4.5 w-4.5" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* timeline */}
      {thread.loading ? (
        <div className="flex-1 space-y-4 bg-zinc-50/60 p-6">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="ml-auto h-10 w-2/5" />
          <Skeleton className="h-16 w-3/5" />
          <Skeleton className="ml-auto h-10 w-1/3" />
        </div>
      ) : (
        <MessageTimeline
          messages={thread.messages}
          meId={me?.id}
          customerName={customerName}
          customerTyping={thread.customerTyping}
          hasMore={thread.hasMore}
          onLoadOlder={thread.loadOlder}
          onReply={setReplyTo}
          onDiscard={thread.discard}
        />
      )}

      {c && !c.assigneeId && (
        <div className="flex items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900">
          <span>This conversation isn't assigned to anyone yet.</span>
          <Button size="sm" variant="secondary" onClick={() => run(() => client.assign(c.id, me!.id), "You're now handling this conversation")}>
            <UserPlus className="h-3.5 w-3.5" /> Assign to me
          </Button>
        </div>
      )}

      {suggestion && c && (
        <SuggestionCard
          suggestion={suggestion}
          disabled={!canReply}
          onSend={() => {
            void thread.send({ body: suggestion.answer, files: [], isInternal: false });
            void client.quickAnswerUsed(suggestion.quickAnswerId).catch(() => undefined);
            dismissSuggestion();
          }}
          onEdit={() => {
            setPrefill({ text: suggestion.answer, nonce: Date.now() });
            void client.quickAnswerUsed(suggestion.quickAnswerId).catch(() => undefined);
            dismissSuggestion();
          }}
          onDismiss={dismissSuggestion}
        />
      )}

      <Composer
        prefill={prefill}
        resolved={c?.status === "RESOLVED"}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        disabledReason={!c ? "Loading…" : !canReply ? "This conversation is assigned to another agent" : null}
        otherAgentTyping={thread.agentTyping}
        onTyping={(t, internal) => c && client.typing(c.id, t, internal)}
        onSend={(input) => {
          void thread.send({ ...input, replyTo });
          setReplyTo(null);
        }}
      />

      <QuickAnswerForm
        open={!!saveDraft}
        initial={saveDraft}
        heading="Save as quick answer"
        onClose={() => setSaveDraft(null)}
        onSaved={() => setSaveDraft(null)}
      />
    </div>
  );
}

function AssignMenu({ conversation, onAssign }: { conversation: Conversation; onAssign: (agentId: string | null) => void }) {
  const { agents, me, isSupervisor } = useSupport();
  const [q, setQ] = React.useState("");
  const eligible = agents.filter((a) => a.isActive && (a.role === "SUPER_ADMIN" || !a.applicationIds || a.applicationIds.includes(conversation.applicationId)));
  const filtered = eligible.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));
  const current = conversation.assignee;
  const canTransfer = isSupervisor || conversation.assigneeId === me?.id || !conversation.assigneeId;
  return (
    <Menu
      align="right"
      width={260}
      trigger={({ toggle }) => (
        <Button size="sm" onClick={toggle} disabled={!canTransfer} aria-label="Assign conversation" title={current ? `Assigned to ${current.name}` : "Assign"}>
          {current ? <Avatar name={current.name} src={current.avatarUrl} size={18} /> : <UserPlus className="h-3.5 w-3.5" />}
          <span className="hidden max-w-24 truncate 2xl:inline">{current ? current.name : "Assign"}</span>
        </Button>
      )}
    >
      {(close) => (
        <>
          <div className="relative p-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an agent" className="h-8 w-full rounded-md bg-zinc-50 pl-7 text-sm outline-none" aria-label="Find an agent" />
          </div>
          <div className="max-h-64 overflow-y-auto scroll-thin">
            {me && conversation.assigneeId !== me.id && (
              <MenuItem onClick={() => (close(), onAssign(me.id))}>
                <Avatar name={me.name} src={me.avatarUrl} size={20} /> Assign to me
              </MenuItem>
            )}
            {filtered.filter((a) => a.id !== me?.id).map((a) => (
              <MenuItem key={a.id} active={a.id === conversation.assigneeId} onClick={() => (close(), onAssign(a.id))}>
                <span className="relative">
                  <Avatar name={a.name} src={a.avatarUrl} size={20} />
                  <span className={cx("absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-1 ring-white", agentStatusColor[a.online ? a.effectiveStatus : "OFFLINE"])} />
                </span>
                <span className="flex-1 truncate">{a.name}</span>
                <span className="text-[11px] text-zinc-400 tabular-nums">{a.openConversations ?? 0} open</span>
              </MenuItem>
            ))}
            {conversation.assigneeId && (isSupervisor || conversation.assigneeId === me?.id) && (
              <>
                <div className="my-1 border-t border-zinc-100" />
                <MenuItem danger onClick={() => (close(), onAssign(null))}>Unassign</MenuItem>
              </>
            )}
          </div>
        </>
      )}
    </Menu>
  );
}

function PriorityMenu({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <Menu
      align="right"
      width={160}
      trigger={({ toggle }) => (
        <Button size="sm" variant="ghost" onClick={toggle} aria-label={`Priority: ${priorityLabel[value]}`} title={`Priority: ${priorityLabel[value]}`}>
          <Flag className={cx("h-3.5 w-3.5", value === "URGENT" ? "text-red-500" : value === "HIGH" ? "text-amber-500" : "text-zinc-400")} />
        </Button>
      )}
    >
      {(close) =>
        (["URGENT", "HIGH", "NORMAL", "LOW"] as Priority[]).map((p) => (
          <MenuItem key={p} active={p === value} onClick={() => (close(), onChange(p))}>
            <Badge tone={priorityTone[p]}>{priorityLabel[p]}</Badge>
          </MenuItem>
        ))
      }
    </Menu>
  );
}
