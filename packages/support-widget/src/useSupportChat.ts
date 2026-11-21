import * as React from "react";
import type { CallSnapshot, ConnectionState, Conversation, Message, PublicConfig, SupportCustomerClient } from "@roxshield/support-sdk";
import { imageSize, uid } from "./utils";

export interface StagedFile {
  id: string;
  file: File;
  previewUrl: string | null;
  kind: "IMAGE" | "FILE" | "AUDIO";
  durationMs?: number;
}

interface PendingSend {
  body: string;
  files: StagedFile[];
  replyToId?: string;
  voice?: boolean;
}

export interface ChatState {
  status: "loading" | "ready" | "error";
  error: string | null;
  config: PublicConfig | null;
  customer: { id: string; name: string | null; email: string | null; isAnonymous: boolean } | null;
  conversation: Conversation | null;
  messages: Message[];
  hasMore: boolean;
  loadingMore: boolean;
  typing: { name: string } | null;
  connection: ConnectionState;
  unread: number;
  history: Conversation[] | null;
  viewingId: string | null; // a past conversation opened read-only
}

const initial: ChatState = {
  status: "loading",
  error: null,
  config: null,
  customer: null,
  conversation: null,
  messages: [],
  hasMore: false,
  loadingMore: false,
  typing: null,
  connection: "idle",
  unread: 0,
  history: null,
  viewingId: null,
};

function upsert(list: Message[], m: Message): Message[] {
  const idx = list.findIndex((x) => x.id === m.id || (!!m.clientMessageId && x.clientMessageId === m.clientMessageId));
  if (idx === -1) {
    const next = [...list, m];
    next.sort((a, b) => (a.pending ? 1 : 0) - (b.pending ? 1 : 0) || a.createdAt.localeCompare(b.createdAt));
    return next;
  }
  const copy = list.slice();
  // keep a newer status (READ beats DELIVERED beats SENT)
  const rank = { SENT: 0, DELIVERED: 1, READ: 2 } as const;
  const prev = copy[idx];
  copy[idx] = rank[prev.status] > rank[m.status] && !prev.pending ? { ...m, status: prev.status, readAt: prev.readAt } : m;
  return copy;
}

export function useSupportChat(client: SupportCustomerClient, opts: { isOpen: boolean; notify: boolean }) {
  const [state, setState] = React.useState<ChatState>(initial);
  const [call, setCall] = React.useState<CallSnapshot>(client.calls.snapshot);
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const openRef = React.useRef(opts.isOpen);
  openRef.current = opts.isOpen;
  const pending = React.useRef(new Map<string, PendingSend>());
  const typingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = React.useCallback((p: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => {
    setState((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) }));
  }, []);

  const loadConversation = React.useCallback(
    async (conversation: Conversation | null) => {
      if (!conversation) {
        patch({ conversation: null, messages: [], hasMore: false });
        return;
      }
      const page = await client.messages(conversation.id, { limit: 40 });
      patch((s) => ({
        conversation,
        // keep optimistic messages that have not been confirmed yet
        messages: [...page.items, ...s.messages.filter((m) => m.pending || m.failed)],
        hasMore: page.hasMore,
        unread: openRef.current ? 0 : conversation.unread,
      }));
    },
    [client, patch]
  );

  // ── lifecycle ──
  React.useEffect(() => {
    let cancelled = false;
    const offs = [
      client.on("connection", (c) => patch({ connection: c })),
      client.on("message", (m, conversation) => {
        const s = stateRef.current;
        if (s.viewingId) return;
        if (s.conversation && m.conversationId !== s.conversation.id) {
          // server moved us to a new/reopened conversation
          void loadConversation(conversation ?? { ...s.conversation, id: m.conversationId, status: "OPEN" });
          return;
        }
        patch((st) => ({
          messages: upsert(st.messages, m),
          conversation: conversation ?? st.conversation,
          typing: m.senderType === "AGENT" ? null : st.typing,
          unread: m.senderType === "AGENT" && (!openRef.current || document.hidden) ? st.unread + 1 : st.unread,
        }));
        if (m.senderType === "AGENT") {
          if (openRef.current && !document.hidden) void client.markRead(m.conversationId);
          if (opts.notify && (document.hidden || !openRef.current)) showNotification(m, s.config);
        }
      }),
      client.on("messageStatus", (p) =>
        patch((s) => ({
          messages: s.messages.map((m) => (p.messageIds.includes(m.id) && m.status === "SENT" ? { ...m, status: "DELIVERED", deliveredAt: p.at } : m)),
        }))
      ),
      client.on("messagesRead", (p) => {
        if (p.reader !== "AGENT") return;
        patch((s) => ({
          messages: s.messages.map((m) =>
            m.conversationId === p.conversationId && m.senderType === "CUSTOMER" ? { ...m, status: "READ", readAt: p.readAt } : m
          ),
        }));
      }),
      client.on("conversation", (c) => patch((s) => (s.conversation?.id === c.id ? { conversation: { ...s.conversation, ...c } } : {}))),
      client.on("typing", (p) => {
        if (stateRef.current.conversation?.id !== p.conversationId) return;
        if (typingTimer.current) clearTimeout(typingTimer.current);
        patch({ typing: p.isTyping ? { name: p.agent?.name || "Support" } : null });
        if (p.isTyping) typingTimer.current = setTimeout(() => patch({ typing: null }), 6000);
      }),
      client.on("synced", ({ messages, conversations }) => {
        const s = stateRef.current;
        const conv = conversations.find((c) => c.id === s.conversation?.id);
        let next = s.messages;
        for (const m of messages) if (!s.conversation || m.conversationId === s.conversation.id) next = upsert(next, m);
        patch({ messages: next, conversation: conv ? { ...s.conversation!, ...conv } : s.conversation });
        if (!s.conversation) {
          const active = conversations.find((c) => c.status !== "RESOLVED");
          if (active) void loadConversation(active);
        }
      }),
      client.calls.on("change", setCall),
    ];

    (async () => {
      try {
        const session = await client.start();
        if (cancelled) return;
        patch({ config: session.config, customer: session.customer });
        let conversation = await client.activeConversation();
        if (!conversation) conversation = (await client.conversations())[0] ?? null;
        if (cancelled) return;
        await loadConversation(conversation);
        patch({ status: "ready" });
      } catch (e: any) {
        if (!cancelled) patch({ status: "error", error: e?.message || "Support is unavailable right now" });
      }
    })();

    return () => {
      cancelled = true;
      offs.forEach((off) => off());
    };
  }, [client, loadConversation, patch, opts.notify]);

  // mark read when the panel becomes visible
  React.useEffect(() => {
    if (!opts.isOpen || !state.conversation) return;
    const markIfVisible = () => {
      if (document.hidden) return;
      patch({ unread: 0 });
      if (state.messages.some((m) => m.senderType === "AGENT" && m.status !== "READ")) void client.markRead(state.conversation!.id);
    };
    markIfVisible();
    document.addEventListener("visibilitychange", markIfVisible);
    return () => document.removeEventListener("visibilitychange", markIfVisible);
  }, [opts.isOpen, state.conversation?.id, state.messages.length, client, patch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions ──
  const deliver = React.useCallback(
    async (clientMessageId: string) => {
      const job = pending.current.get(clientMessageId);
      if (!job) return;
      const s = stateRef.current;
      let conversationId = s.conversation && s.conversation.status !== "RESOLVED" ? s.conversation.id : undefined;
      try {
        const attachmentIds: string[] = [];
        for (const [i, f] of job.files.entries()) {
          const dims = f.kind === "IMAGE" ? await imageSize(f.file) : null;
          const att = await client.uploadAttachment(f.file, {
            conversationId,
            width: dims?.width,
            height: dims?.height,
            durationMs: f.durationMs,
            onProgress: (fraction) =>
              patch((st) => ({
                messages: st.messages.map((m) =>
                  m.clientMessageId === clientMessageId && m.localPreviews
                    ? { ...m, localPreviews: m.localPreviews.map((p, j) => (j === i ? { ...p, progress: fraction } : p)) }
                    : m
                ),
              })),
          });
          conversationId = att.conversationId;
          attachmentIds.push(att.id);
        }
        const res = await client.sendMessage({
          conversationId,
          body: job.body || undefined,
          attachmentIds: attachmentIds.length ? attachmentIds : undefined,
          replyToId: job.replyToId,
          type: job.voice ? "VOICE" : "TEXT",
          clientMessageId,
        });
        pending.current.delete(clientMessageId);
        job.files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
        const cur = stateRef.current.conversation;
        if (!cur || cur.id !== res.conversationId) {
          const fresh = await client.activeConversation();
          patch((st) => ({ messages: upsert(st.messages, res.message) }));
          if (fresh) await loadConversation(fresh);
        } else {
          patch((st) => ({ messages: upsert(st.messages, res.message) }));
        }
        if (opts.notify && "Notification" in window && Notification.permission === "default") {
          void Notification.requestPermission().catch(() => undefined);
        }
      } catch (e: any) {
        patch((st) => ({
          messages: st.messages.map((m) => (m.clientMessageId === clientMessageId ? { ...m, pending: false, failed: true, metadata: { error: e?.message } } : m)),
        }));
      }
    },
    [client, loadConversation, patch, opts.notify]
  );

  const send = React.useCallback(
    (input: { body: string; files: StagedFile[]; replyTo?: Message | null; voice?: boolean }) => {
      const body = input.body.trim();
      if (!body && !input.files.length) return;
      const clientMessageId = uid();
      const s = stateRef.current;
      const local: Message = {
        id: `local-${clientMessageId}`,
        conversationId: s.conversation?.id ?? "",
        senderType: "CUSTOMER",
        type: input.voice ? "VOICE" : input.files.length ? "ATTACHMENT" : "TEXT",
        body: body || null,
        clientMessageId,
        replyTo: input.replyTo ? { id: input.replyTo.id, body: input.replyTo.body, senderType: input.replyTo.senderType, type: input.replyTo.type } : null,
        status: "SENT",
        deliveredAt: null,
        readAt: null,
        metadata: null,
        attachments: [],
        agent: null,
        deleted: false,
        createdAt: new Date().toISOString(),
        pending: true,
        localPreviews: input.files.map((f) => ({ url: f.previewUrl || "", name: f.file.name, kind: f.kind, progress: 0 })),
      };
      pending.current.set(clientMessageId, { body, files: input.files, replyToId: input.replyTo?.id, voice: input.voice });
      patch((st) => ({ messages: upsert(st.messages, local), viewingId: null }));
      if (s.conversation) client.stopTyping(s.conversation.id);
      void deliver(clientMessageId);
    },
    [client, deliver, patch]
  );

  const retry = React.useCallback(
    (m: Message) => {
      if (!m.clientMessageId || !pending.current.has(m.clientMessageId)) return;
      patch((st) => ({ messages: st.messages.map((x) => (x.clientMessageId === m.clientMessageId ? { ...x, pending: true, failed: false } : x)) }));
      void deliver(m.clientMessageId);
    },
    [deliver, patch]
  );

  const discard = React.useCallback(
    (m: Message) => {
      if (m.clientMessageId) pending.current.delete(m.clientMessageId);
      patch((st) => ({ messages: st.messages.filter((x) => x.clientMessageId !== m.clientMessageId) }));
    },
    [patch]
  );

  const loadOlder = React.useCallback(async () => {
    const s = stateRef.current;
    const first = s.messages.find((m) => !m.pending && !m.id.startsWith("local-"));
    const convId = s.viewingId ?? s.conversation?.id;
    if (!convId || !first || s.loadingMore) return;
    patch({ loadingMore: true });
    try {
      const page = await client.messages(convId, { before: first.id, limit: 40 });
      patch((st) => ({ messages: [...page.items, ...st.messages], hasMore: page.hasMore, loadingMore: false }));
    } catch {
      patch({ loadingMore: false });
    }
  }, [client, patch]);

  const openHistory = React.useCallback(async () => {
    patch({ history: await client.conversations() });
  }, [client, patch]);

  const viewConversation = React.useCallback(
    async (c: Conversation | null) => {
      if (!c) {
        patch({ history: null, viewingId: null });
        const active = await client.activeConversation();
        await loadConversation(active ?? stateRef.current.conversation);
        return;
      }
      const page = await client.messages(c.id, { limit: 40 });
      patch({ history: null, viewingId: c.id, messages: page.items, hasMore: page.hasMore });
    },
    [client, loadConversation, patch]
  );

  const typing = React.useCallback(() => client.typing(stateRef.current.conversation?.id), [client]);

  const saveProfile = React.useCallback(
    async (data: { name?: string; email?: string }) => {
      const c = await client.updateProfile(data);
      patch((s) => ({ customer: s.customer ? { ...s.customer, ...c } : s.customer }));
    },
    [client, patch]
  );

  return { state, call, send, retry, discard, loadOlder, typing, saveProfile, openHistory, viewConversation };
}

function showNotification(m: Message, config: PublicConfig | null) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const n = new Notification(m.agent?.name ? `${m.agent.name} replied` : config?.appearance.brandName || "New reply", {
      body: m.body || (m.attachments.length ? "Sent an attachment" : "New message"),
      icon: config?.appearance.logoUrl || undefined,
      tag: `rox-support-${m.conversationId}`,
    });
    n.onclick = () => window.focus();
  } catch {
    /* some browsers (iOS) do not support the Notification constructor */
  }
}
