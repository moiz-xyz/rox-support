"use client";

import * as React from "react";
import { Plus, Users } from "lucide-react";
import type { Agent, AgentRole } from "@roxshield/support-sdk";
import { Avatar, Badge, Button, EmptyState, Field, Input, Modal, Select, Skeleton, Toggle, useToast } from "@/components/ui";
import { useSupport } from "@/lib/support";
import { agentStatusColor, agentStatusLabel, cx, relativeTime } from "@/lib/format";

const ROLE_LABEL: Record<AgentRole, string> = { SUPER_ADMIN: "Super admin", ADMIN: "Admin", AGENT: "Agent" };

export default function AgentsPage() {
  const { agents, refreshAgents, me, apps } = useSupport();
  const [editing, setEditing] = React.useState<Agent | "new" | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const canManage = me?.role === "SUPER_ADMIN" || me?.role === "ADMIN";

  React.useEffect(() => {
    if (me) void refreshAgents().finally(() => setLoaded(true));
  }, [me, refreshAgents]);

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
            <p className="mt-1 text-sm text-zinc-500">Who can answer conversations and calls, and for which applications.</p>
          </div>
          {canManage && <Button variant="primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add agent</Button>}
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Agent</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Applications</th>
                  <th className="px-4 py-2.5 text-right font-medium">Workload</th>
                  <th className="px-4 py-2.5 text-right font-medium">Last seen</th>
                  {canManage && <th className="w-20 px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {!loaded && !agents.length
                  ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><Skeleton className="h-7" /></td></tr>)
                  : agents.map((a) => {
                      const status = a.online ? a.effectiveStatus : "OFFLINE";
                      const load = a.openConversations ?? 0;
                      return (
                        <tr key={a.id} className={cx("hover:bg-zinc-50", !a.isActive && "opacity-50")}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={a.name} src={a.avatarUrl} size={32} />
                              <div>
                                <div className="font-medium">{a.name}{a.id === me?.id && <span className="ml-1.5 text-xs text-zinc-400">(you)</span>}</div>
                                <div className="text-xs text-zinc-500">{a.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5"><Badge tone={a.role === "AGENT" ? "neutral" : "brand"}>{ROLE_LABEL[a.role]}</Badge>{a.canViewAll && a.role === "AGENT" && <Badge className="ml-1">Sees all</Badge>}</td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-zinc-700"><span className={cx("h-2 w-2 rounded-full", agentStatusColor[status])} />{a.isActive ? (status === "OFFLINE" ? "Offline" : agentStatusLabel[status]) : "Deactivated"}</span>
                          </td>
                          <td className="px-4 py-2.5 text-zinc-600">
                            {a.role === "SUPER_ADMIN" ? "All" : (a.applicationIds ?? []).map((id) => apps.find((x) => x.id === id)?.name).filter(Boolean).join(", ") || <span className="text-amber-600">None</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="ml-auto flex w-28 items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                                <div className={cx("h-full rounded-full", load >= a.maxConcurrent ? "bg-red-500" : "bg-brand-500")} style={{ width: `${Math.min(100, (load / Math.max(1, a.maxConcurrent)) * 100)}%` }} />
                              </div>
                              <span className="text-xs text-zinc-500 tabular-nums">{load}/{a.maxConcurrent}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-zinc-500">{a.online ? "now" : relativeTime(a.lastSeenAt)}</td>
                          {canManage && (
                            <td className="px-4 py-2.5 text-right">
                              {(me?.role === "SUPER_ADMIN" || a.role !== "SUPER_ADMIN") && <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Edit</Button>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
          {loaded && agents.length === 0 && <EmptyState icon={<Users className="h-5 w-5" />} title="No agents" />}
        </div>
      </div>
      {editing && <AgentModal agent={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => void refreshAgents()} />}
    </div>
  );
}

function AgentModal({ agent, onClose, onSaved }: { agent: Agent | null; onClose: () => void; onSaved: () => void }) {
  const { client, apps, me } = useSupport();
  const toast = useToast();
  const [form, setForm] = React.useState({
    name: agent?.name ?? "",
    email: agent?.email ?? "",
    password: "",
    title: agent?.title ?? "",
    role: (agent?.role ?? "AGENT") as AgentRole,
    canViewAll: agent?.canViewAll ?? false,
    maxConcurrent: agent?.maxConcurrent ?? 10,
    isActive: agent?.isActive ?? true,
    applicationIds: agent?.applicationIds ?? (apps.length === 1 ? [apps[0].id] : []),
  });
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const self = agent?.id === me?.id;

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, any> = {
        name: form.name,
        title: form.title || undefined,
        maxConcurrent: Number(form.maxConcurrent),
        canViewAll: form.canViewAll,
        applicationIds: form.applicationIds,
      };
      if (!self) body.role = form.role;
      if (agent) {
        if (!self) body.isActive = form.isActive;
        if (form.password) body.password = form.password;
        await client.updateAgent(agent.id, body);
      } else {
        await client.createAgent({ ...body, email: form.email, password: form.password });
      }
      toast({ title: agent ? "Agent updated" : "Agent added", tone: "success" });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={agent ? `Edit ${agent.name}` : "Add agent"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={save} disabled={!form.name || (!agent && (!form.email || form.password.length < 8))}>{agent ? "Save changes" : "Add agent"}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Job title"><Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Support specialist" /></Field>
        </div>
        {!agent && <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>}
        <Field label={agent ? "Reset password" : "Password"} hint={agent ? "Leave blank to keep the current password. Resetting signs the agent out." : "At least 8 characters. Share it securely."}>
          <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role">
            <Select value={form.role} onChange={(e) => set("role", e.target.value as AgentRole)} disabled={self} className="w-full">
              <option value="AGENT">Agent</option>
              <option value="ADMIN">Admin</option>
              {me?.role === "SUPER_ADMIN" && <option value="SUPER_ADMIN">Super admin</option>}
            </Select>
          </Field>
          <Field label="Max concurrent conversations" hint="Used by automatic assignment">
            <Input type="number" min={1} max={200} value={form.maxConcurrent} onChange={(e) => set("maxConcurrent", Number(e.target.value))} />
          </Field>
        </div>
        {form.role !== "SUPER_ADMIN" && (
          <Field label="Applications" hint="Conversations and calls from these applications reach this agent.">
            <div className="grid gap-1.5 rounded-lg border border-zinc-200 p-2.5">
              {apps.length === 0 && <span className="text-sm text-zinc-400">No applications yet</span>}
              {apps.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-brand-600"
                    checked={form.applicationIds.includes(a.id)}
                    onChange={(e) => set("applicationIds", e.target.checked ? [...form.applicationIds, a.id] : form.applicationIds.filter((x) => x !== a.id))}
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </Field>
        )}
        {form.role === "AGENT" && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">See all conversations</div>
              <div className="text-xs text-zinc-500">Otherwise agents only see unassigned conversations and their own.</div>
            </div>
            <Toggle checked={form.canViewAll} onChange={(v) => set("canViewAll", v)} label="See all conversations" />
          </div>
        )}
        {agent && !self && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-xs text-zinc-500">Deactivating signs the agent out immediately.</div>
            </div>
            <Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} label="Active" />
          </div>
        )}
      </div>
    </Modal>
  );
}
