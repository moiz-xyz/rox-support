// Realistic API fixtures for DB-free UI tests (shapes mirror the backend serializers).
const now = Date.now();
const ago = (min) => new Date(now - min * 60_000).toISOString();
export const API = "http://localhost:5089";

const att = (id, kind, fileName, mimeType, extra = {}) => ({
  id,
  fileName,
  mimeType,
  kind,
  sizeBytes: 248_133,
  url: `${API}/api/support/attachments/${id}/content?exp=9999999999&sig=x`,
  downloadUrl: `${API}/api/support/attachments/${id}/content?exp=9999999999&sig=x&dl=1`,
  createdAt: ago(30),
  ...extra,
});

export const me = {
  id: "agent-1", email: "sara@roxanlabs.com", name: "Sara Ahmed", role: "ADMIN", title: "Support lead", avatarUrl: null,
  isActive: true, canViewAll: false, maxConcurrent: 10, status: "ONLINE", online: true, effectiveStatus: "ONLINE",
  lastSeenAt: ago(0), applicationIds: ["app-1", "app-2"], createdAt: ago(9000),
};
export const agents = [
  { ...me, openConversations: 4 },
  { ...me, id: "agent-2", email: "hamza@roxanlabs.com", name: "Hamza Khan", role: "AGENT", title: "Support specialist", status: "BUSY", effectiveStatus: "BUSY", openConversations: 7 },
  { ...me, id: "agent-3", email: "zara@roxanlabs.com", name: "Zara Malik", role: "AGENT", title: null, online: false, status: "ONLINE", effectiveStatus: "OFFLINE", openConversations: 2, lastSeenAt: ago(180) },
];
const settings = { primaryColor: "#4f46e5", brandName: "Rox Shield", position: "bottom-right", welcomeTitle: "Hi there", welcomeMessage: "Ask us anything — we usually reply within a few minutes.", offlineMessage: "We're offline right now.", callsEnabled: true, attachmentsEnabled: true, voiceMessagesEnabled: true, maxUploadMb: 10, autoAssign: true, assignmentStrategy: "ROUND_ROBIN", reopenWindowHours: 72, ringTimeoutSec: 30, businessHours: null };
export const apps = [
  { id: "app-1", publicId: "app_Q2x9mT4kLp1", name: "Rox Shield Admin App", description: null, platform: "ANDROID", secretHint: "rsk_…9fA2", allowedOrigins: [], allowAnonymous: false, isRoxShieldIdentity: true, roxTenantId: null, isActive: true, settings, createdAt: ago(20000), updatedAt: ago(100) },
  { id: "app-2", publicId: "app_W7cR2nB8vYe", name: "Rox Shield Website", description: null, platform: "WEB", secretHint: "rsk_…k3Lm", allowedOrigins: ["https://roxanlabs.com"], allowAnonymous: true, isRoxShieldIdentity: false, roxTenantId: null, isActive: true, settings, createdAt: ago(15000), updatedAt: ago(100) },
];
const customer = (id, name, extra = {}) => ({
  id, applicationId: "app-1", externalId: `rox_user:${id}`, isAnonymous: false, name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, phone: "+92 300 1234567",
  avatarUrl: null, metadata: { shop: "Karachi Mobiles", role: "ADMIN" }, roxUserId: "u1", roxTenantId: "t1", lastSeenAt: ago(2), online: true, createdAt: ago(40000), ...extra,
});
const conv = (n, id, cust, extra = {}) => ({
  id, number: n, applicationId: "app-1", status: "OPEN", subject: null, lastMessageAt: ago(n % 50), lastMessagePreview: "My device is still locked after I paid the installment", lastMessageSender: "CUSTOMER",
  assignee: { id: "agent-1", name: "Sara Ahmed", title: "Support lead", avatarUrl: null }, assigneeId: "agent-1", createdAt: ago(300), resolvedAt: null, unread: 0,
  customerId: cust.id, customer: cust, application: { id: "app-1", name: "Rox Shield Admin App", publicId: "app_Q2x9mT4kLp1" }, priority: "NORMAL", tags: ["billing"], channel: "WIDGET",
  unreadByCustomer: 0, agentLastReadAt: ago(5), customerLastReadAt: ago(3), firstResponseAt: ago(296), reopenedCount: 0, updatedAt: ago(1), ...extra,
});
const ayesha = customer("c-1", "Ayesha Khan");
export const conversations = [
  conv(1042, "conv-1", ayesha, { unread: 2, lastMessageAt: ago(1), priority: "HIGH" }),
  conv(1041, "conv-2", customer("c-2", "Bilal Raza", { online: false, lastSeenAt: ago(90) }), { lastMessagePreview: "Thanks, that worked!", lastMessageSender: "AGENT", lastMessageAt: ago(14) }),
  conv(1040, "conv-3", customer("c-3", "Mehwish Ali"), { assignee: null, assigneeId: null, lastMessagePreview: "📷 Photo", lastMessageAt: ago(32), unread: 1 }),
  conv(1039, "conv-4", customer("c-4", "Usman Tariq", { online: false }), { status: "PENDING", lastMessagePreview: "Can you send me the invoice as PDF?", lastMessageAt: ago(75), priority: "URGENT" }),
  conv(1038, "conv-5", customer("c-5", "Visitor", { isAnonymous: true, name: null, externalId: "visitor_8fK2", online: false }), { assignee: null, assigneeId: null, lastMessagePreview: "Do you have the S24 in stock?", lastMessageAt: ago(240), application: { id: "app-2", name: "Rox Shield Website", publicId: "app_W7cR2nB8vYe" } }),
  conv(1037, "conv-6", customer("c-6", "Kashif Mehmood", { online: false }), { lastMessagePreview: "📞 Voice call · 4:12", lastMessageSender: "SYSTEM", lastMessageAt: ago(600) }),
];
const msg = (id, senderType, body, min, extra = {}) => ({
  id, conversationId: "conv-1", senderType, type: "TEXT", body, clientMessageId: null, replyTo: null, status: "READ", deliveredAt: ago(min), readAt: ago(min),
  metadata: null, attachments: [], agent: senderType === "AGENT" ? { id: "agent-1", name: "Sara Ahmed", title: "Support lead", avatarUrl: null } : null, deleted: false, createdAt: ago(min), isInternal: false, ...extra,
});
export const messages = [
  msg("m1", "CUSTOMER", "Hi, my phone is still showing the lock screen even though I paid this month's installment.", 300),
  msg("m2", "SYSTEM", "Automatically assigned to Sara Ahmed", 299, { type: "SYSTEM", isInternal: true }),
  msg("m3", "AGENT", "Hi Ayesha! Sorry about that — let me check your device status. Could you share a screenshot of the lock screen?", 296),
  msg("m4", "CUSTOMER", null, 290, { type: "ATTACHMENT", attachments: [att("a1", "IMAGE", "lock-screen.png", "image/png", { width: 600, height: 400 })] }),
  msg("m5", "CUSTOMER", "Here it is", 290),
  msg("m6", "AGENT", "Payment shows as received at 10:42 but the device hasn't polled since. Re-sending the unlock command.", 285, { type: "NOTE", isInternal: true }),
  msg("m7", "SYSTEM", "Voice call · 4:12", 200, { type: "CALL", metadata: { status: "ENDED", durationSec: 252 } }),
  msg("m8", "AGENT", "I've re-synced the device from our side. Please restart your phone and keep it connected to the internet for a minute.", 60, { replyTo: { id: "m5", body: "Here it is", senderType: "CUSTOMER", type: "TEXT" } }),
  msg("m9", "CUSTOMER", null, 3, { type: "ATTACHMENT", attachments: [att("a2", "FILE", "payment-receipt-june.pdf", "application/pdf")], status: "DELIVERED" }),
  msg("m10", "CUSTOMER", "Restarted it — still locked. I've attached my payment receipt.", 1, { status: "DELIVERED" }),
];
export const customerDetail = {
  ...ayesha, userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36",
  application: { id: "app-1", name: "Rox Shield Admin App", publicId: "app_Q2x9mT4kLp1", isRoxShieldIdentity: true },
  stats: { conversations: 3, calls: 2, messages: 27 },
  conversations: [conversations[0], { ...conv(998, "conv-old", ayesha, { status: "RESOLVED", lastMessagePreview: "Device unlocked, thank you", lastMessageAt: ago(20000) }) }],
  roxShield: {
    user: { id: "u1", name: "Ayesha Khan", email: "ayesha@example.com", isActive: true, role: "ADMIN", branch: "Saddar" },
    tenant: { id: "t1", name: "Karachi Mobiles", slug: "karachi-mobiles", isActive: true, isPremium: true, isPaid: true, isKycVerified: true, deviceKeys: 42, trialEndsAt: null, supportNumber: null, preferredAppVersion: "V2", devices: 318, customers: 287, users: 6, createdAt: ago(90000) },
  },
};
export const calls = [
  { id: "call-1", conversationId: "conv-1", status: "ENDED", media: "AUDIO", initiatedBy: "CUSTOMER", agent: { id: "agent-1", name: "Sara Ahmed", title: null, avatarUrl: null }, startedAt: ago(204), answeredAt: ago(204), endedAt: ago(200), durationSec: 252, endReason: "hangup", customer: ayesha, customerId: "c-1" },
  { id: "call-2", conversationId: "conv-3", status: "MISSED", media: "AUDIO", initiatedBy: "CUSTOMER", agent: null, startedAt: ago(500), answeredAt: null, endedAt: ago(499), durationSec: null, endReason: "no_answer", customer: conversations[2].customer, customerId: "c-3" },
];
export const stats = {
  rangeDays: 7, conversations: { open: 18, pending: 5, unassigned: 3, new: 64, resolved: 51 }, avgFirstResponseSec: 154,
  calls: { total: 23, missed: 2, avgDurationSec: 241 },
  daily: Array.from({ length: 7 }, (_, i) => ({ day: new Date(now - (6 - i) * 86400_000).toISOString(), count: [6, 9, 7, 12, 10, 4, 16][i] })),
  agents: agents.map((a) => ({ id: a.id, name: a.name, avatarUrl: null, status: a.effectiveStatus === "OFFLINE" ? "ONLINE" : a.effectiveStatus, online: a.online, openConversations: a.openConversations })),
};
export const notifications = { items: [{ id: "n1", agentId: "agent-1", type: "MISSED_CALL", title: "Missed call from Mehwish Ali", body: "Nobody answered", conversationId: "conv-3", callId: "call-2", readAt: null, createdAt: ago(500) }], unread: 1 };
export const counts = { all: 24, unassigned: 3, mine: 9, open: 18, pending: 5, resolved: 51, unreadMine: 2 };

// widget side
export const widgetConfig = {
  appId: "app_W7cR2nB8vYe", name: "Rox Shield Website", allowAnonymous: true,
  appearance: { primaryColor: "#4f46e5", brandName: "Rox Shield", logoUrl: null, position: "bottom-right" },
  welcomeTitle: "Hi there 👋", welcomeMessage: "Ask us anything — we usually reply within a few minutes.", offlineMessage: "We're offline right now.",
  features: { calls: true, attachments: true, voiceMessages: true, maxUploadMb: 10 }, availability: { withinBusinessHours: true, onlineAgents: 2, online: true },
};
export const widgetConversation = { ...conversations[0], unread: 0 };
export const widgetMessages = messages.filter((m) => !m.isInternal).map(({ isInternal, ...m }) => m);
