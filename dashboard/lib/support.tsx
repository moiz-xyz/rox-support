"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SupportAgentClient, SupportEvents } from "@roxshield/support-sdk";
import type { Agent, AgentStatus, Application, CallSnapshot, ConnectionState, Conversation } from "@roxshield/support-sdk";

export const API_URL = (process.env.NEXT_PUBLIC_SUPPORT_API_URL || "http://localhost:5089").replace(/\/+$/, "");

let singleton: SupportAgentClient | null = null;
/** One agent client per tab, shared by every page (survives client-side navigation). */
export function getClient() {
  if (!singleton) singleton = new SupportAgentClient({ apiUrl: API_URL });
  return singleton;
}

type Counts = Record<"all" | "unassigned" | "mine" | "open" | "pending" | "resolved" | "unreadMine", number>;

interface SupportContextValue {
  client: SupportAgentClient;
  me: Agent | null;
  setMe: (a: Agent) => void;
  connection: ConnectionState;
  counts: Counts | null;
  refreshCounts: () => void;
  agents: Agent[];
  agentsById: Map<string, Agent>;
  refreshAgents: () => Promise<void>;
  apps: Application[];
  refreshApps: () => Promise<void>;
  unreadNotifications: number;
  setUnreadNotifications: React.Dispatch<React.SetStateAction<number>>;
  call: CallSnapshot;
  setStatus: (s: AgentStatus) => Promise<void>;
  /** subscribe to raw realtime events */
  subscribe: (fn: (name: string, payload: any) => void) => () => void;
  canSee: (c: Pick<Conversation, "assigneeId">) => boolean;
  isSupervisor: boolean;
}

const Ctx = React.createContext<SupportContextValue | null>(null);

export function useSupport() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useSupport must be used inside <SupportProvider>");
  return v;
}

// ── attention helpers ──
export function chime(kind: "message" | "call" = "message") {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const notes = kind === "message" ? [880, 1320] : [660, 880, 660];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.type = "sine";
      o.connect(gain);
      o.start(now + i * 0.12);
      o.stop(now + i * 0.12 + 0.1);
    });
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + notes.length * 0.12 + 0.2);
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    /* autoplay blocked until the agent interacts with the page */
  }
}

export function browserNotify(title: string, body?: string, onClick?: () => void, tag?: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
    const n = new Notification(title, { body, tag, icon: "/icon.svg" });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    /* ignore */
  }
}

export function SupportProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const client = React.useMemo(() => getClient(), []);
  const [me, setMe] = React.useState<Agent | null>(null);
  const [connection, setConnection] = React.useState<ConnectionState>(client.realtime.state);
  const [counts, setCounts] = React.useState<Counts | null>(null);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [apps, setApps] = React.useState<Application[]>([]);
  const [unreadNotifications, setUnreadNotifications] = React.useState(0);
  const [call, setCall] = React.useState<CallSnapshot>(client.calls.snapshot);
  const meRef = React.useRef(me);
  meRef.current = me;

  const refreshCountsNow = React.useCallback(() => {
    client.counts().then(setCounts).catch(() => undefined);
  }, [client]);
  const countsTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshCounts = React.useCallback(() => {
    if (countsTimer.current) clearTimeout(countsTimer.current);
    countsTimer.current = setTimeout(refreshCountsNow, 400);
  }, [refreshCountsNow]);

  const refreshAgents = React.useCallback(async () => setAgents(await client.agents()), [client]);
  const refreshApps = React.useCallback(async () => setApps(await client.applications()), [client]);

  // bootstrap the session
  React.useEffect(() => {
    if (!client.isAuthenticated) {
      router.replace("/login");
      return;
    }
    let alive = true;
    client
      .me()
      .then((a) => {
        if (!alive) return;
        setMe(a);
        client.connect();
        refreshCountsNow();
        void refreshAgents().catch(() => undefined);
        void refreshApps().catch(() => undefined);
        client.notifications({ unread: true, limit: 1 }).then((n) => setUnreadNotifications(n.unread)).catch(() => undefined);
      })
      .catch(() => router.replace("/login"));
    const offs = [
      client.on("connection", setConnection),
      client.on("session", (a) => !a && router.replace("/login")),
      client.calls.on("change", setCall),
    ];
    return () => {
      alive = false;
      offs.forEach((o) => o());
    };
  }, [client, router, refreshAgents, refreshApps, refreshCountsNow]);

  // global realtime side effects: presence, counts, notifications
  React.useEffect(() => {
    return client.on("event", (name, payload) => {
      switch (name) {
        case SupportEvents.AGENT_PRESENCE:
          setAgents((list) => list.map((a) => (a.id === payload.agentId ? { ...a, online: payload.online, effectiveStatus: payload.status } : a)));
          if (payload.agentId === meRef.current?.id) setMe((m) => (m ? { ...m, effectiveStatus: payload.status, online: payload.online } : m));
          break;
        case SupportEvents.CONVERSATION_NEW:
        case SupportEvents.CONVERSATION_UPDATED:
        case SupportEvents.CONVERSATION_ASSIGNED:
          refreshCounts();
          break;
        case SupportEvents.MESSAGE_NEW:
          if (payload.conversation) refreshCounts();
          if (payload.message?.senderType === "CUSTOMER" && payload.conversation) {
            const c = payload.conversation as Conversation;
            const mine = c.assigneeId === meRef.current?.id || !c.assigneeId;
            if (mine && document.hidden) {
              chime("message");
              browserNotify(c.customer?.name || "New message", payload.message.body || "Sent an attachment", () => router.push(`/inbox/all/${c.id}`), c.id);
            }
          }
          break;
        case SupportEvents.NOTIFICATION_NEW:
          setUnreadNotifications((n) => n + 1);
          if (payload.type !== "NEW_MESSAGE") chime("message");
          browserNotify(payload.title, payload.body ?? undefined, () => payload.conversationId && router.push(`/inbox/all/${payload.conversationId}`), payload.id);
          break;
        case SupportEvents.CALL_INCOMING:
          browserNotify("Incoming support call", payload.customer?.name || "A customer is calling", undefined, payload.call?.id);
          break;
      }
    });
  }, [client, refreshCounts, router]);

  const setStatus = React.useCallback(
    async (status: AgentStatus) => {
      await client.setStatus(status);
      setMe((m) => (m ? { ...m, status, effectiveStatus: status } : m));
    },
    [client]
  );

  const subscribe = React.useCallback((fn: (name: string, payload: any) => void) => client.on("event", fn), [client]);
  const isSupervisor = !!me && (me.role !== "AGENT" || me.canViewAll);
  const canSee = React.useCallback(
    (c: Pick<Conversation, "assigneeId">) => isSupervisor || !c.assigneeId || c.assigneeId === meRef.current?.id,
    [isSupervisor]
  );
  const agentsById = React.useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const value: SupportContextValue = {
    client,
    me,
    setMe,
    connection,
    counts,
    refreshCounts,
    agents,
    agentsById,
    refreshAgents,
    apps,
    refreshApps,
    unreadNotifications,
    setUnreadNotifications,
    call,
    setStatus,
    subscribe,
    canSee,
    isSupervisor,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
