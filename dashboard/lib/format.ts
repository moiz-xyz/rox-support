import type { AgentStatus, ConversationStatus, Priority } from "@roxshield/support-sdk";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function initials(name?: string | null) {
  const parts = (name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function relativeTime(iso?: string | null) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function dateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return "Today";
  if (d.toDateString() === new Date(Date.now() - 86400_000).toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export function duration(sec?: number | null) {
  if (sec === null || sec === undefined) return "—";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const statusTone: Record<ConversationStatus, "green" | "amber" | "neutral"> = { OPEN: "green", PENDING: "amber", RESOLVED: "neutral" };
export const statusLabel: Record<ConversationStatus, string> = { OPEN: "Open", PENDING: "Pending", RESOLVED: "Resolved" };
export const priorityTone: Record<Priority, "neutral" | "blue" | "amber" | "red"> = { LOW: "neutral", NORMAL: "blue", HIGH: "amber", URGENT: "red" };
export const priorityLabel: Record<Priority, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };
export const agentStatusColor: Record<AgentStatus, string> = { ONLINE: "bg-emerald-500", AWAY: "bg-amber-400", BUSY: "bg-red-500", OFFLINE: "bg-zinc-300" };
export const agentStatusLabel: Record<AgentStatus, string> = { ONLINE: "Online", AWAY: "Away", BUSY: "Busy", OFFLINE: "Appear offline" };

export function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
