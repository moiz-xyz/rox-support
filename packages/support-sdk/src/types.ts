/** Wire types shared by the widget and the dashboard. Mirrors the backend serializers. */

export type ParticipantType = "CUSTOMER" | "AGENT" | "SYSTEM";
export type MessageType = "TEXT" | "ATTACHMENT" | "VOICE" | "NOTE" | "SYSTEM" | "CALL";
export type MessageStatus = "SENT" | "DELIVERED" | "READ";
export type ConversationStatus = "OPEN" | "PENDING" | "RESOLVED";
export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type AgentRole = "SUPER_ADMIN" | "ADMIN" | "AGENT";
export type AgentStatus = "ONLINE" | "AWAY" | "BUSY" | "OFFLINE";
export type CallStatus = "RINGING" | "ONGOING" | "ENDED" | "MISSED" | "REJECTED" | "CANCELLED" | "FAILED";
export type CallMedia = "AUDIO" | "VIDEO";
export type ConversationView = "all" | "unassigned" | "mine" | "open" | "pending" | "resolved";

export interface PublicAgent {
  id: string;
  name: string;
  title: string | null;
  avatarUrl: string | null;
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  kind: "IMAGE" | "FILE" | "AUDIO";
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  url: string;
  downloadUrl: string;
  createdAt: string;
  conversationId?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderType: ParticipantType;
  type: MessageType;
  body: string | null;
  clientMessageId: string | null;
  replyTo: { id: string; body: string | null; senderType: ParticipantType; type: MessageType } | null;
  status: MessageStatus;
  deliveredAt: string | null;
  readAt: string | null;
  metadata: Record<string, any> | null;
  attachments: Attachment[];
  agent: PublicAgent | null;
  deleted: boolean;
  createdAt: string;
  // agent audience only
  isInternal?: boolean;
  senderAgentId?: string | null;
  senderCustomerId?: string | null;
  // client-side only
  pending?: boolean;
  failed?: boolean;
  localPreviews?: { url: string; name: string; kind: string; progress?: number }[];
}

export interface Customer {
  id: string;
  applicationId: string;
  externalId: string;
  isAnonymous: boolean;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  metadata: Record<string, any> | null;
  roxUserId: string | null;
  roxTenantId: string | null;
  lastSeenAt: string | null;
  online: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  number: number;
  applicationId: string;
  status: ConversationStatus;
  subject: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastMessageSender: ParticipantType | null;
  assignee: PublicAgent | null;
  createdAt: string;
  resolvedAt: string | null;
  unread: number;
  // agent audience only
  customerId?: string;
  customer?: Customer;
  application?: { id: string; name: string; publicId: string };
  priority?: Priority;
  tags?: string[];
  assigneeId?: string | null;
  channel?: string;
  unreadByCustomer?: number;
  agentLastReadAt?: string | null;
  customerLastReadAt?: string | null;
  firstResponseAt?: string | null;
  reopenedCount?: number;
  updatedAt?: string;
}

export interface Agent {
  id: string;
  email: string;
  name: string;
  role: AgentRole;
  title: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  canViewAll: boolean;
  maxConcurrent: number;
  status: AgentStatus;
  online: boolean;
  effectiveStatus: AgentStatus;
  lastSeenAt: string | null;
  applicationIds?: string[];
  openConversations?: number;
  createdAt: string;
}

export interface Call {
  id: string;
  conversationId: string;
  status: CallStatus;
  media: CallMedia;
  initiatedBy: ParticipantType;
  agent: PublicAgent | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  endReason: string | null;
  applicationId?: string;
  customerId?: string;
  customer?: Customer;
  agentId?: string | null;
  rejectedBy?: string[];
}

export interface PublicConfig {
  appId: string;
  name: string;
  allowAnonymous: boolean;
  appearance: { primaryColor: string; brandName: string; logoUrl: string | null; position: "bottom-right" | "bottom-left" };
  welcomeTitle: string;
  welcomeMessage: string;
  offlineMessage: string;
  features: { calls: boolean; attachments: boolean; voiceMessages: boolean; maxUploadMb: number };
  availability: { withinBusinessHours: boolean; onlineAgents: number; online: boolean };
}

export interface WidgetSession {
  sessionToken: string;
  expiresIn: number;
  visitorToken?: string;
  customer: { id: string; name: string | null; email: string | null; isAnonymous: boolean };
  socket: { path: string };
  config: PublicConfig;
}

export interface IceConfig {
  iceServers: RTCIceServer[];
  ttlSec: number;
}

export interface Application {
  id: string;
  publicId: string;
  name: string;
  description: string | null;
  platform: string;
  secretHint: string;
  allowedOrigins: string[];
  allowAnonymous: boolean;
  isRoxShieldIdentity: boolean;
  roxTenantId: string | null;
  isActive: boolean;
  settings?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  secret?: string;
}

export interface SupportNotification {
  id: string;
  agentId: string;
  type: string;
  title: string;
  body: string | null;
  conversationId: string | null;
  callId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface IncomingCallPayload {
  call: Call;
  customer?: Customer;
  conversation?: { id: string; number: number; subject: string | null };
  ringTimeoutSec: number;
}

// ── quick answers (keyword / screenshot matching on the server, no AI service) ──

export type QuickAnswerMode = "OFF" | "SUGGEST" | "AUTO";

export interface QuickAnswer {
  id: string;
  applicationId: string;
  title: string;
  phrases: string[];
  screenTexts: string[];
  imageHashes: string[];
  answer: string;
  enabled: boolean;
  /** only approved answers are sent automatically */
  approved: boolean;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  uses?: number;
}

export interface QuickAnswerSettings {
  mode: QuickAnswerMode;
  autoThreshold: number;
  suggestThreshold: number;
  botName: string;
  footer: string;
  handoffWords: string[];
  handoffMessage: string;
  maxAutoRepliesPerConversation: number;
  pauseAfterAgentReplyMin: number;
}

export interface QuickAnswerSuggestion {
  conversationId: string;
  messageId: string;
  quickAnswerId: string;
  title: string;
  answer: string;
  score: number;
  source: "text" | "screen" | "image";
  matched: string[];
  approved: boolean;
  createdAt: string;
}

export interface QuickAnswerMatch {
  id: string;
  title: string;
  score: number;
  source: "text" | "screen" | "image";
  matched: string[];
  answer: string;
  approved: boolean;
}

export interface QuickAnswerTestResult {
  results: QuickAnswerMatch[];
  best: QuickAnswerMatch | null;
  ambiguous: boolean;
  ocrText: string | null;
  imageHash: string | null;
  wouldAutoReply: boolean;
  settings: QuickAnswerSettings;
}

export interface QuickAnswerDraft {
  applicationId: string;
  title: string;
  phrases: string[];
  screenTexts: string[];
  imageHashes: string[];
  answer: string;
  screenshotAttachmentId: string | null;
  ocrText: string | null;
}
