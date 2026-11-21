"use client";

import * as React from "react";
import { SupportEvents } from "@roxshield/support-sdk";
import type { Conversation, ConversationView, Message } from "@roxshield/support-sdk";
import { useSupport } from "./support";
import { uid } from "./format";

export const VIEW_LABELS: Record<ConversationView, string> = {
  all: "All conversations",
  unassigned: "Unassigned",
  mine: "My conversations",
  open: "Open",
  pending: "Pending",
  resolved: "Resolved",
};

export function isView(v: string): v is ConversationView {
  return v in VIEW_LABELS;
}

function matchesView(c: Conversation, view: ConversationView, meId: string | undefined) {
  const active = c.status !== "RESOLVED";
  switch (view) {
    case "all":
      return true;
    case "unassigned":
      return active && !c.assigneeId;
    case "mine":
      return active && c.assigneeId === meId;
    case "open":
      return c.status === "OPEN";
    case "pending":
      return c.status === "PENDING";
    case "resolved":
      return c.status === "RESOLVED";
  }
}

const byRecent = (a: Conversation, b: Conversation) => b.lastMessageAt.localeCompare(a.lastMessageAt) || b.id.localeCompare(a.id);

/** Live conversation list for a view, kept in sync by socket events. */
export function useConversationList(view: ConversationView, filters: { search?: string; applicationId?: string }) {
  const { client, me, subscribe, canSee } = useSupport();
  const [items, setItems] = React.useState<Conversation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [typing, setTyping] = React.useState<Record<string, number>>({});
  const searching = !!filters.search?.trim();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const page = await client.conversations({ view, search: filters.search?.trim() || undefined, applicationId: filters.applicationId || undefined, limit: 30 });
      setItems(page.items);
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [client, view, filters.search, filters.applicationId]);

  React.useEffect(() => {
    if (!me) return;
    const t = setTimeout(load, filters.search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, me, filters.search]);

  const loadMore = React.useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await client.conversations({ view, search: filters.search?.trim() || undefined, applicationId: filters.applicationId || undefined, cursor, limit: 30 });
      setItems((s) => [...s, ...page.items.filter((c) => !s.some((x) => x.id === c.id))]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [client, cursor, loadingMore, view, filters.search, filters.applicationId]);

  React.useEffect(() => {
    const upsert = (c: Conversation) =>
      setItems((list) => {
        const fits = matchesView(c, view, me?.id) && canSee(c) && (!filters.applicationId || c.applicationId === filters.applicationId);
        const existing = list.findIndex((x) => x.id === c.id);
        if (!fits) return existing === -1 ? list : list.filter((x) => x.id !== c.id);
        if (searching && existing === -1) return list; // don't inject live items into search results
        const merged = existing === -1 ? c : { ...list[existing], ...c, customer: c.customer ?? list[existing].customer };
        const next = existing === -1 ? [merged, ...list] : list.map((x, i) => (i === existing ? merged : x));
        return next.sort(byRecent);
      });

    const off = subscribe((name, p) => {
      switch (name) {
        case SupportEvents.CONVERSATION_NEW:
        case SupportEvents.CONVERSATION_UPDATED:
        case SupportEvents.CONVERSATION_ASSIGNED:
          if (p.conversation?.customerId !== undefined || p.conversation?.id) upsert(p.conversation);
          break;
        case SupportEvents.MESSAGE_NEW:
          if (p.conversation) upsert(p.conversation);
          break;
        case SupportEvents.CUSTOMER_PRESENCE:
          setItems((list) => list.map((c) => (c.customerId === p.customerId && c.customer ? { ...c, customer: { ...c.customer, online: p.online, lastSeenAt: p.at } } : c)));
          break;
        case SupportEvents.TYPING:
          if (p.who === "customer") setTyping((t) => ({ ...t, [p.conversationId]: p.isTyping ? Date.now() : 0 }));
          break;
        case SupportEvents.MESSAGES_READ:
          if (p.reader === "AGENT") setItems((list) => list.map((c) => (c.id === p.conversationId ? { ...c, unread: 0 } : c)));
          break;
      }
    });
    return off;
  }, [subscribe, view, me?.id, canSee, filters.applicationId, searching]);

  // reconnect → reload (cheap, and guarantees nothing was missed)
  React.useEffect(() => client.on("ready", (_i, reconnect) => reconnect && void load()), [client, load]);

  const isTyping = (id: string) => (typing[id] ?? 0) > Date.now() - 6000;
  return { items, loading, hasMore: !!cursor, loadMore, loadingMore, reload: load, isTyping };
}

/** Messages + live state of one conversation. */
export function useThread(conversationId: string | null) {
  const { client, subscribe, me } = useSupport();
  const [conversation, setConversation] = React.useState<Conversation | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [customerTyping, setCustomerTyping] = React.useState(false);
  const [agentTyping, setAgentTyping] = React.useState<{ name: string; internal: boolean } | null>(null);
  const messagesRef = React.useRef(messages);
  messagesRef.current = messages;
  const typingTimers = React.useRef<{ c?: ReturnType<typeof setTimeout>; a?: ReturnType<typeof setTimeout> }>({});

  const upsert = React.useCallback((m: Message) => {
    setMessages((list) => {
      const i = list.findIndex((x) => x.id === m.id || (!!m.clientMessageId && x.clientMessageId === m.clientMessageId));
      if (i === -1) return [...list, m].sort((a, b) => (a.pending ? 1 : 0) - (b.pending ? 1 : 0) || a.createdAt.localeCompare(b.createdAt));
      const copy = list.slice();
      copy[i] = { ...m, status: rank(list[i].status) > rank(m.status) && !list[i].pending ? list[i].status : m.status };
      return copy;
    });
  }, []);

  const markRead = React.useCallback(() => {
    if (conversationId && !document.hidden) void client.markRead(conversationId);
  }, [client, conversationId]);

  React.useEffect(() => {
    if (!conversationId || !me) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setMessages([]);
    setConversation(null);
    setCustomerTyping(false);
    setAgentTyping(null);
    Promise.all([client.conversation(conversationId), client.messages(conversationId, { limit: 50 })])
      .then(([c, page]) => {
        if (!alive) return;
        setConversation(c);
        setMessages(page.items);
        setHasMore(page.hasMore);
        if (c.unread > 0) markRead();
      })
      .catch((e) => alive && setError(e?.status === 404 ? "This conversation doesn't exist or you no longer have access to it." : e?.message || "Failed to load"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [client, conversationId, me, markRead]);

  React.useEffect(() => {
    if (!conversationId) return;
    const off = subscribe((name, p) => {
      switch (name) {
        case SupportEvents.MESSAGE_NEW:
          if (p.message.conversationId !== conversationId) return;
          upsert(p.message);
          if (p.conversation) setConversation((c) => (c ? { ...c, ...p.conversation } : p.conversation));
          if (p.message.senderType === "CUSTOMER") {
            setCustomerTyping(false);
            markRead();
          }
          break;
        case SupportEvents.CONVERSATION_UPDATED:
        case SupportEvents.CONVERSATION_ASSIGNED:
          if (p.conversation?.id === conversationId) setConversation((c) => (c ? { ...c, ...p.conversation, customer: p.conversation.customer ?? c.customer } : p.conversation));
          break;
        case SupportEvents.MESSAGE_STATUS:
          if (p.conversationId === conversationId)
            setMessages((list) => list.map((m) => (p.messageIds.includes(m.id) && m.status === "SENT" ? { ...m, status: "DELIVERED" } : m)));
          break;
        case SupportEvents.MESSAGES_READ:
          if (p.conversationId === conversationId && p.reader === "CUSTOMER")
            setMessages((list) => list.map((m) => (m.senderType === "AGENT" && !m.isInternal ? { ...m, status: "READ", readAt: p.readAt } : m)));
          break;
        case SupportEvents.CUSTOMER_PRESENCE:
          setConversation((c) => (c && c.customerId === p.customerId && c.customer ? { ...c, customer: { ...c.customer, online: p.online, lastSeenAt: p.at } } : c));
          break;
        case SupportEvents.TYPING:
          if (p.conversationId !== conversationId) return;
          if (p.who === "customer") {
            clearTimeout(typingTimers.current.c);
            setCustomerTyping(p.isTyping);
            if (p.isTyping) typingTimers.current.c = setTimeout(() => setCustomerTyping(false), 6000);
          } else if (p.agent?.id !== me?.id) {
            clearTimeout(typingTimers.current.a);
            setAgentTyping(p.isTyping ? { name: p.agent.name, internal: !!p.internal } : null);
            if (p.isTyping) typingTimers.current.a = setTimeout(() => setAgentTyping(null), 6000);
          }
          break;
      }
    });
    const offReady = client.on("ready", (_i, reconnect) => {
      if (!reconnect) return;
      const last = [...messagesRef.current].reverse().find((m) => !m.pending && !m.id.startsWith("local-"));
      client.messages(conversationId, last ? { after: last.id, limit: 100 } : { limit: 50 }).then((page) => page.items.forEach(upsert)).catch(() => undefined);
      client.conversation(conversationId).then(setConversation).catch(() => undefined);
    });
    const onVisible = () => !document.hidden && markRead();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      offReady();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, conversationId, subscribe, upsert, markRead, me?.id]);

  const loadOlder = React.useCallback(async () => {
    const first = messagesRef.current.find((m) => !m.pending);
    if (!conversationId || !first) return;
    const page = await client.messages(conversationId, { before: first.id, limit: 50 });
    setMessages((list) => [...page.items, ...list]);
    setHasMore(page.hasMore);
  }, [client, conversationId]);

  /** Optimistic send with upload progress; failures stay in the thread with a retry action. */
  const send = React.useCallback(
    async (input: { body: string; files: File[]; isInternal: boolean; replyTo?: Message | null; voice?: { file: File; durationMs: number } }) => {
      if (!conversationId || !me) return;
      const clientMessageId = uid();
      const files = input.voice ? [input.voice.file] : input.files;
      const local: Message = {
        id: `local-${clientMessageId}`,
        conversationId,
        senderType: "AGENT",
        type: input.isInternal ? "NOTE" : input.voice ? "VOICE" : files.length ? "ATTACHMENT" : "TEXT",
        body: input.body.trim() || null,
        clientMessageId,
        replyTo: input.replyTo ? { id: input.replyTo.id, body: input.replyTo.body, senderType: input.replyTo.senderType, type: input.replyTo.type } : null,
        status: "SENT",
        deliveredAt: null,
        readAt: null,
        metadata: null,
        attachments: [],
        agent: { id: me.id, name: me.name, title: me.title, avatarUrl: me.avatarUrl },
        deleted: false,
        createdAt: new Date().toISOString(),
        isInternal: input.isInternal,
        pending: true,
        localPreviews: files.map((f) => ({ url: f.type.startsWith("image/") ? URL.createObjectURL(f) : "", name: f.name, kind: f.type.startsWith("image/") ? "IMAGE" : f.type.startsWith("audio/") ? "AUDIO" : "FILE", progress: 0 })),
      };
      upsert(local);
      try {
        const ids: string[] = [];
        for (const [i, f] of files.entries()) {
          const dims = f.type.startsWith("image/") ? await imageSize(f) : null;
          const att = await client.uploadAttachment(f, conversationId, {
            width: dims?.width,
            height: dims?.height,
            durationMs: input.voice?.durationMs,
            onProgress: (fraction) =>
              setMessages((list) =>
                list.map((m) => (m.clientMessageId === clientMessageId && m.localPreviews ? { ...m, localPreviews: m.localPreviews.map((lp, j) => (j === i ? { ...lp, progress: fraction } : lp)) } : m))
              ),
          });
          ids.push(att.id);
        }
        const res = await client.sendMessage({
          conversationId,
          body: input.body.trim() || undefined,
          isInternal: input.isInternal,
          replyToId: input.replyTo?.id,
          attachmentIds: ids.length ? ids : undefined,
          type: input.voice ? "VOICE" : "TEXT",
          clientMessageId,
        });
        upsert(res.message);
      } catch (e: any) {
        setMessages((list) => list.map((m) => (m.clientMessageId === clientMessageId ? { ...m, pending: false, failed: true, metadata: { error: e?.message } } : m)));
      }
    },
    [client, conversationId, me, upsert]
  );

  const discard = React.useCallback((m: Message) => setMessages((list) => list.filter((x) => x.id !== m.id)), []);

  return { conversation, setConversation, messages, hasMore, loading, error, loadOlder, send, discard, customerTyping, agentTyping };
}

function rank(s: string) {
  return s === "READ" ? 2 : s === "DELIVERED" ? 1 : 0;
}

function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
