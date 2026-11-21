import { Emitter } from "./emitter";
import { HttpClient, SupportError } from "./http";
import { ConnectionState, RealtimeConnection } from "./realtime";
import { CallController } from "./call";
import { SupportEvents } from "./events";
import type {
  Agent,
  AgentStatus,
  Application,
  Attachment,
  Call,
  Conversation,
  ConversationView,
  Customer,
  IceConfig,
  Message,
  Paginated,
  Priority,
  QuickAnswer,
  QuickAnswerDraft,
  QuickAnswerSettings,
  QuickAnswerSuggestion,
  QuickAnswerTestResult,
  SupportNotification,
} from "./types";

export interface AgentClientOptions {
  /** Socket.IO path on the backend (default /api/support/realtime). */
  socketPath?: string;
  apiUrl: string;
  /** Persist tokens between reloads (defaults to localStorage). */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  onSessionExpired?: () => void;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  obtainedAt: number;
}

type AgentEvents = {
  connection: (s: ConnectionState) => void;
  ready: (info: any, reconnect: boolean) => void;
  event: (name: string, payload: any) => void;
  session: (agent: Agent | null) => void;
};

const STORAGE_KEY = "rox-support:agent-session";

/** Dashboard-side client: agent auth (rotating refresh tokens), REST surface and realtime. */
export class SupportAgentClient extends Emitter<AgentEvents> {
  readonly http: HttpClient;
  readonly realtime: RealtimeConnection;
  readonly calls: CallController;
  private tokens: Tokens | null = null;
  private refreshing: Promise<boolean> | null = null;
  private iceCache: { cfg: IceConfig; at: number } | null = null;
  readonly apiUrl: string;

  constructor(private readonly opts: AgentClientOptions) {
    super();
    this.apiUrl = opts.apiUrl.replace(/\/+$/, "");
    this.tokens = this.load();
    this.http = new HttpClient({
      baseUrl: `${this.apiUrl}/api/support`,
      getToken: async () => {
        if (this.tokens && this.isExpiring()) await this.refresh();
        return this.tokens?.accessToken ?? null;
      },
      onUnauthorized: () => this.refresh(),
    });
    this.realtime = new RealtimeConnection({
      url: this.apiUrl,
      path: opts.socketPath || "/api/support/realtime",
      getToken: async () => {
        if (this.isExpiring()) await this.refresh();
        return this.tokens?.accessToken ?? "";
      },
    });
    this.realtime.on("state", (s) => this.emit("connection", s));
    this.realtime.on("ready", (info, r) => this.emit("ready", info, r));
    this.realtime.on("event", (n, p) => this.emit("event", n, p));
    this.calls = new CallController({ realtime: this.realtime, side: "agent", getIceConfig: () => this.iceConfig() });
  }

  private get storage() {
    if (this.opts.storage) return this.opts.storage;
    try {
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
      return null;
    }
  }

  private load(): Tokens | null {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private save(t: Tokens | null) {
    this.tokens = t;
    if (t) this.storage?.setItem(STORAGE_KEY, JSON.stringify(t));
    else this.storage?.removeItem(STORAGE_KEY);
  }

  private isExpiring() {
    if (!this.tokens) return false;
    return Date.now() > this.tokens.obtainedAt + this.tokens.expiresIn * 1000 - 60_000;
  }

  get isAuthenticated() {
    return !!this.tokens;
  }

  async login(email: string, password: string) {
    const res = await fetch(`${this.http.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new SupportError(Array.isArray(body?.message) ? body.message.join(", ") : body?.message || "Login failed", res.status);
    this.save({ accessToken: body.accessToken, refreshToken: body.refreshToken, expiresIn: body.expiresIn, obtainedAt: Date.now() });
    this.emit("session", body.agent);
    return body.agent as Agent;
  }

  /** Single-flight refresh; returns false (and clears the session) when the refresh token is dead. */
  refresh(): Promise<boolean> {
    if (!this.tokens) return Promise.resolve(false);
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const res = await fetch(`${this.http.baseUrl}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: this.tokens!.refreshToken }),
        });
        if (!res.ok) throw new Error("refresh failed");
        const body = await res.json();
        this.save({ ...body, obtainedAt: Date.now() });
        return true;
      } catch {
        this.save(null);
        this.realtime.disconnect();
        this.emit("session", null);
        this.opts.onSessionExpired?.();
        return false;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  async logout() {
    await this.http.post("/auth/logout").catch(() => undefined);
    this.save(null);
    this.realtime.disconnect();
    this.emit("session", null);
  }

  connect() {
    if (this.tokens) this.realtime.connect();
  }

  // ── profile & agents ──
  me() {
    return this.http.get<Agent>("/auth/me");
  }
  updateMe(data: { name?: string; title?: string; avatarUrl?: string; status?: AgentStatus }) {
    return this.http.patch<Agent>("/agents/me", data);
  }
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post("/auth/change-password", { currentPassword, newPassword });
  }
  setStatus(status: AgentStatus) {
    return this.realtime.connected ? this.realtime.request(SupportEvents.AGENT_SET_STATUS, { status }) : this.updateMe({ status });
  }
  agents(applicationId?: string) {
    return this.http.get<Agent[]>("/agents", { applicationId });
  }
  createAgent(data: Record<string, any>) {
    return this.http.post<Agent>("/agents", data);
  }
  updateAgent(id: string, data: Record<string, any>) {
    return this.http.patch<Agent>(`/agents/${id}`, data);
  }

  // ── applications ──
  applications() {
    return this.http.get<Application[]>("/applications");
  }
  createApplication(data: Record<string, any>) {
    return this.http.post<Application>("/applications", data);
  }
  updateApplication(id: string, data: Record<string, any>) {
    return this.http.patch<Application>(`/applications/${id}`, data);
  }
  updateSettings(id: string, data: Record<string, any>) {
    return this.http.patch<Record<string, any>>(`/applications/${id}/settings`, data);
  }
  rotateSecret(id: string) {
    return this.http.post<Application>(`/applications/${id}/rotate-secret`);
  }

  // ── quick answers ──
  quickAnswers(applicationId: string) {
    return this.http.get<QuickAnswer[]>("/quick-answers", { applicationId });
  }
  createQuickAnswer(data: Partial<QuickAnswer> & { applicationId: string; title: string; answer: string }) {
    return this.http.post<QuickAnswer>("/quick-answers", data);
  }
  updateQuickAnswer(id: string, data: Partial<QuickAnswer>) {
    return this.http.patch<QuickAnswer>(`/quick-answers/${id}`, data);
  }
  deleteQuickAnswer(id: string) {
    return this.http.request<{ ok: true }>("DELETE", `/quick-answers/${id}`);
  }
  quickAnswerUsed(id: string) {
    return this.http.post<{ ok: true }>(`/quick-answers/${id}/used`);
  }
  quickAnswerSettings(applicationId: string) {
    return this.http.get<QuickAnswerSettings>("/quick-answers/settings", { applicationId });
  }
  updateQuickAnswerSettings(applicationId: string, data: Partial<QuickAnswerSettings>) {
    return this.http.request<QuickAnswerSettings>("PATCH", "/quick-answers/settings", data, { applicationId });
  }
  /** Try a message and/or a screenshot against the saved answers. */
  testQuickAnswers(applicationId: string, input: { text?: string; file?: Blob }) {
    const form = new FormData();
    form.append("applicationId", applicationId);
    if (input.text) form.append("text", input.text);
    if (input.file) form.append("file", input.file);
    return this.http.upload<QuickAnswerTestResult>("/quick-answers/test", form);
  }
  quickAnswerSuggestion(conversationId: string) {
    return this.http.get<QuickAnswerSuggestion | null>(`/quick-answers/conversations/${conversationId}/suggestion`);
  }
  dismissQuickAnswerSuggestion(conversationId: string) {
    return this.http.request<{ ok: true }>("DELETE", `/quick-answers/conversations/${conversationId}/suggestion`);
  }
  quickAnswerDraft(conversationId: string) {
    return this.http.post<QuickAnswerDraft>(`/quick-answers/conversations/${conversationId}/draft`);
  }
  exportQuickAnswers(applicationId: string) {
    return this.http.get<{ version: number; items: QuickAnswer[]; settings: QuickAnswerSettings }>("/quick-answers/export", { applicationId });
  }
  importQuickAnswers(applicationId: string, items: unknown[]) {
    return this.http.post<{ imported: number }>("/quick-answers/import", { applicationId, items });
  }

  // ── conversations ──
  conversations(q: { view?: ConversationView; applicationId?: string; search?: string; cursor?: string; limit?: number; priority?: Priority; assigneeId?: string; customerId?: string } = {}) {
    return this.http.get<Paginated<Conversation>>("/conversations", q);
  }
  counts(applicationId?: string) {
    return this.http.get<Record<ConversationView | "unreadMine", number>>("/conversations/counts", { applicationId });
  }
  conversation(id: string) {
    return this.http.get<Conversation>(`/conversations/${id}`);
  }
  updateConversation(id: string, data: { status?: string; priority?: Priority; subject?: string; tags?: string[] }) {
    return this.http.patch<Conversation>(`/conversations/${id}`, data);
  }
  assign(id: string, agentId: string | null, note?: string) {
    return this.http.post<Conversation>(`/conversations/${id}/assign`, { agentId, note });
  }
  assignments(id: string) {
    return this.http.get<any[]>(`/conversations/${id}/assignments`);
  }
  messages(id: string, opts: { before?: string; after?: string; limit?: number } = {}) {
    return this.http.get<{ items: Message[]; hasMore: boolean }>(`/conversations/${id}/messages`, opts);
  }
  async sendMessage(input: { conversationId: string; body?: string; isInternal?: boolean; replyToId?: string; attachmentIds?: string[]; type?: "TEXT" | "VOICE"; clientMessageId: string }) {
    if (this.realtime.connected) {
      try {
        return await this.realtime.request<{ message: Message; conversationId: string }>(SupportEvents.MESSAGE_SEND, input);
      } catch (e: any) {
        if (e instanceof SupportError && e.status >= 400 && e.status < 500) throw e;
      }
    }
    const { conversationId, ...body } = input;
    return this.http.post<{ message: Message; conversationId: string }>(`/conversations/${conversationId}/messages`, body);
  }
  markRead(id: string) {
    return this.realtime.connected
      ? this.realtime.request(SupportEvents.CONVERSATION_READ, { conversationId: id }).catch(() => undefined)
      : this.http.post(`/conversations/${id}/read`).catch(() => undefined);
  }
  uploadAttachment(file: Blob & { name?: string }, conversationId: string, opts: { onProgress?: (f: number) => void; width?: number; height?: number; durationMs?: number } = {}) {
    const form = new FormData();
    form.append("file", file, file.name || "upload");
    form.append("conversationId", conversationId);
    if (opts.width) form.append("width", String(Math.round(opts.width)));
    if (opts.height) form.append("height", String(Math.round(opts.height)));
    if (opts.durationMs) form.append("durationMs", String(Math.round(opts.durationMs)));
    return this.http.upload<Attachment>("/attachments", form, opts.onProgress);
  }

  private typingAt = new Map<string, number>();
  typing(conversationId: string, isTyping: boolean, internal = false) {
    const now = Date.now();
    if (isTyping) {
      if (now - (this.typingAt.get(conversationId) ?? 0) < 2500) return;
      this.typingAt.set(conversationId, now);
    } else this.typingAt.delete(conversationId);
    this.realtime.send(isTyping ? SupportEvents.TYPING_START : SupportEvents.TYPING_STOP, { conversationId, internal });
  }

  // ── contacts, calls, notifications, stats ──
  customers(q: { search?: string; applicationId?: string; cursor?: string; limit?: number } = {}) {
    return this.http.get<Paginated<Customer & { application: { id: string; name: string }; conversationCount: number; callCount: number }>>("/customers", q);
  }
  customer(id: string) {
    return this.http.get<Customer & { conversations: Conversation[]; stats: any; roxShield: any; application: any; userAgent?: string | null }>(`/customers/${id}`);
  }
  callHistory(q: { customerId?: string; agentId?: string; status?: string; before?: string; limit?: number } = {}) {
    return this.http.get<Call[]>("/calls", q);
  }
  conversationCalls(id: string) {
    return this.http.get<Call[]>(`/conversations/${id}/calls`);
  }
  notifications(q: { unread?: boolean; before?: string; limit?: number } = {}) {
    return this.http.get<{ items: SupportNotification[]; unread: number }>("/notifications", {
      ...q,
      unread: q.unread === undefined ? undefined : String(q.unread),
    });
  }
  markNotificationsRead(ids?: string[]) {
    return this.http.post("/notifications/read", { ids });
  }
  stats(days = 7, applicationId?: string) {
    return this.http.get<any>("/stats/overview", { days, applicationId });
  }
  auditLogs(q: Record<string, any> = {}) {
    return this.http.get<any[]>("/audit-logs", q);
  }

  async iceConfig(): Promise<IceConfig> {
    if (this.iceCache && Date.now() - this.iceCache.at < (this.iceCache.cfg.ttlSec * 1000) / 2) return this.iceCache.cfg;
    const cfg = await this.http.get<IceConfig>("/calls/ice-servers");
    this.iceCache = { cfg, at: Date.now() };
    return cfg;
  }

  destroy() {
    this.calls.destroy();
    this.realtime.disconnect();
    this.removeAllListeners();
  }
}
