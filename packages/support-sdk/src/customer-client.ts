import { Emitter } from "./emitter";
import { HttpClient, SupportError } from "./http";
import { ConnectionState, RealtimeConnection } from "./realtime";
import { CallController } from "./call";
import { SupportEvents } from "./events";
import type { Attachment, Call, Conversation, IceConfig, Message, PublicConfig, WidgetSession } from "./types";

export interface CustomerClientOptions {
  /** Socket.IO path on the backend (default /api/support/realtime). */
  socketPath?: string;
  /** Base URL of the Rox Shield backend, e.g. https://shield-api.roxanlabs.com */
  apiUrl: string;
  /** Public application id (app_xxx). Not a secret. */
  appId: string;
  /**
   * Returns a fresh identity token signed by YOUR backend with the application secret.
   * Called on start and whenever the support session expires. Omit for anonymous visitors
   * (only if the application allows them).
   */
  getIdentityToken?: () => Promise<string | null | undefined> | string | null | undefined;
  /** Where anonymous visitor tokens are persisted (defaults to localStorage). */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

type CustomerEvents = {
  ready: (s: { customer: WidgetSession["customer"]; config: PublicConfig }) => void;
  connection: (s: ConnectionState) => void;
  message: (m: Message, conversation?: Conversation) => void;
  messageStatus: (p: { conversationId: string; messageIds: string[]; status: string; at: string }) => void;
  messagesRead: (p: { conversationId: string; reader: "AGENT" | "CUSTOMER"; readAt: string }) => void;
  conversation: (c: Conversation) => void;
  typing: (p: { conversationId: string; isTyping: boolean; agent?: { id: string; name: string } }) => void;
  synced: (p: { conversations: Conversation[]; messages: Message[] }) => void;
  error: (e: Error) => void;
};

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Customer-side client used by @roxshield/support-widget (and usable directly, e.g. in a custom UI
 * or a React Native app). Handles session exchange, token refresh, realtime + offline catch-up.
 */
export class SupportCustomerClient extends Emitter<CustomerEvents> {
  readonly http: HttpClient;
  readonly realtime: RealtimeConnection;
  readonly calls: CallController;

  private session: WidgetSession | null = null;
  private sessionExpiresAt = 0;
  private refreshing: Promise<WidgetSession> | null = null;
  private lastSyncAt: string | null = null;
  private iceCache: { cfg: IceConfig; at: number } | null = null;

  constructor(private readonly opts: CustomerClientOptions) {
    super();
    const base = opts.apiUrl.replace(/\/+$/, "");
    this.http = new HttpClient({
      baseUrl: `${base}/api/support`,
      getToken: () => this.session?.sessionToken ?? null,
      onUnauthorized: async () => {
        try {
          await this.refreshSession(true);
          return true;
        } catch {
          return false;
        }
      },
    });
    this.realtime = new RealtimeConnection({
      url: base,
      path: opts.socketPath || "/api/support/realtime",
      getToken: async () => (await this.refreshSession()).sessionToken,
    });
    this.realtime.on("state", (s) => this.emit("connection", s));
    this.realtime.on("ready", (_info, reconnect) => {
      if (reconnect) void this.sync();
      else this.lastSyncAt = new Date().toISOString();
    });
    this.realtime.on("event", (name, payload) => this.onEvent(name, payload));
    this.calls = new CallController({ realtime: this.realtime, side: "customer", getIceConfig: () => this.iceConfig() });
  }

  get config() {
    return this.session?.config ?? null;
  }
  get customer() {
    return this.session?.customer ?? null;
  }

  private get storage() {
    if (this.opts.storage) return this.opts.storage;
    try {
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
      return null;
    }
  }
  private get visitorKey() {
    return `rox-support:visitor:${this.opts.appId}`;
  }

  /** Exchange identity (or the stored visitor token) for a support session, then connect. */
  async start() {
    const session = await this.refreshSession(true);
    this.emit("ready", { customer: session.customer, config: session.config });
    this.realtime.connect();
    return session;
  }

  private async refreshSession(force = false): Promise<WidgetSession> {
    if (!force && this.session && Date.now() < this.sessionExpiresAt - 60_000) return this.session;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const identityToken = (await this.opts.getIdentityToken?.()) || undefined;
      const visitorToken = identityToken ? undefined : this.storage?.getItem(this.visitorKey) || undefined;
      const res = await fetch(`${this.http.baseUrl}/widget/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: this.opts.appId, identityToken, visitorToken }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new SupportError(body?.message || "Could not start a support session", res.status, body);
      const session = body as WidgetSession;
      if (session.visitorToken) this.storage?.setItem(this.visitorKey, session.visitorToken);
      this.session = session;
      this.sessionExpiresAt = Date.now() + session.expiresIn * 1000;
      return session;
    })().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private onEvent(name: string, payload: any) {
    switch (name) {
      case SupportEvents.MESSAGE_NEW:
        this.emit("message", payload.message, payload.conversation);
        if (payload.message.senderType === "AGENT") {
          this.realtime.send(SupportEvents.MESSAGE_DELIVERED, { messageIds: [payload.message.id] });
        }
        break;
      case SupportEvents.MESSAGE_STATUS:
        this.emit("messageStatus", payload);
        break;
      case SupportEvents.MESSAGES_READ:
        this.emit("messagesRead", payload);
        break;
      case SupportEvents.CONVERSATION_UPDATED:
        this.emit("conversation", payload.conversation);
        break;
      case SupportEvents.TYPING:
        if (payload.who === "agent") this.emit("typing", payload);
        break;
      case SupportEvents.ERROR:
        this.emit("error", new SupportError(payload?.message || "Session error", 401));
        break;
    }
  }

  /** Catch up on anything missed while disconnected — the database is the source of truth. */
  async sync() {
    const since = this.lastSyncAt ?? new Date(Date.now() - 3600_000).toISOString();
    try {
      const res = await this.realtime.request<{ serverTime: string; conversations: Conversation[]; messages: Message[] }>(SupportEvents.SYNC, {
        since,
      });
      this.lastSyncAt = res.serverTime;
      this.emit("synced", { conversations: res.conversations, messages: res.messages });
      const ids = res.messages.filter((m) => m.senderType === "AGENT" && m.status === "SENT").map((m) => m.id);
      if (ids.length) this.realtime.send(SupportEvents.MESSAGE_DELIVERED, { messageIds: ids });
    } catch (e: any) {
      this.emit("error", e);
    }
  }

  // ── conversations & messages ──
  activeConversation() {
    return this.http.get<Conversation | null>("/widget/conversations/active");
  }
  conversations() {
    return this.http.get<Conversation[]>("/widget/conversations");
  }
  messages(conversationId: string, opts: { before?: string; after?: string; limit?: number } = {}) {
    return this.http.get<{ items: Message[]; hasMore: boolean }>(`/widget/conversations/${conversationId}/messages`, opts);
  }

  /** Socket first (with ack), REST fallback. `clientMessageId` makes the retry safe. */
  async sendMessage(input: { conversationId?: string; body?: string; attachmentIds?: string[]; replyToId?: string; type?: "TEXT" | "VOICE"; clientMessageId?: string }) {
    const payload = { ...input, clientMessageId: input.clientMessageId ?? uid() };
    if (this.realtime.connected) {
      try {
        return await this.realtime.request<{ message: Message; conversationId: string }>(SupportEvents.MESSAGE_SEND, payload);
      } catch (e: any) {
        if (e instanceof SupportError && e.status >= 400 && e.status < 500) throw e;
      }
    }
    return this.http.post<{ message: Message; conversationId: string }>("/widget/messages", payload);
  }

  uploadAttachment(file: Blob & { name?: string }, opts: { conversationId?: string; onProgress?: (f: number) => void; width?: number; height?: number; durationMs?: number; signal?: AbortSignal } = {}) {
    const form = new FormData();
    form.append("file", file, file.name || "upload");
    if (opts.conversationId) form.append("conversationId", opts.conversationId);
    if (opts.width) form.append("width", String(Math.round(opts.width)));
    if (opts.height) form.append("height", String(Math.round(opts.height)));
    if (opts.durationMs) form.append("durationMs", String(Math.round(opts.durationMs)));
    return this.http.upload<Attachment & { conversationId: string }>("/attachments", form, opts.onProgress, opts.signal);
  }

  markRead(conversationId: string) {
    if (this.realtime.connected) return this.realtime.request(SupportEvents.CONVERSATION_READ, { conversationId }).catch(() => undefined);
    return this.http.post(`/widget/conversations/${conversationId}/read`).catch(() => undefined);
  }

  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private typingSentAt = 0;
  /** Call on every keystroke; throttled and auto-stopped after 3s of inactivity. */
  typing(conversationId: string | undefined) {
    if (!conversationId) return;
    const now = Date.now();
    if (now - this.typingSentAt > 2500) {
      this.typingSentAt = now;
      this.realtime.send(SupportEvents.TYPING_START, { conversationId });
    }
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTyping(conversationId), 3000);
  }
  stopTyping(conversationId: string | undefined) {
    if (!conversationId) return;
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingSentAt = 0;
    this.realtime.send(SupportEvents.TYPING_STOP, { conversationId });
  }

  updateProfile(data: { name?: string; email?: string }) {
    return this.http.post<{ id: string; name: string | null; email: string | null }>("/widget/me", data);
  }

  registerPushToken(token: string, platform: "android" | "ios" | "web" = "android") {
    return this.http.post("/widget/push-token", { token, platform });
  }

  callHistory() {
    return this.http.get<Call[]>("/widget/calls");
  }

  async iceConfig(): Promise<IceConfig> {
    if (this.iceCache && Date.now() - this.iceCache.at < (this.iceCache.cfg.ttlSec * 1000) / 2) return this.iceCache.cfg;
    const cfg = await this.http.get<IceConfig>("/widget/ice-servers");
    this.iceCache = { cfg, at: Date.now() };
    return cfg;
  }

  /** Forget the anonymous visitor on this device (e.g. on logout in the host app). */
  resetVisitor() {
    this.storage?.removeItem(this.visitorKey);
  }

  destroy() {
    this.calls.destroy();
    this.realtime.disconnect();
    this.removeAllListeners();
  }
}
