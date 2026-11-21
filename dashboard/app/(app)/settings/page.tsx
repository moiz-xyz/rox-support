"use client";

import * as React from "react";
import { AppWindow, Copy, KeyRound, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import type { Application } from "@roxshield/support-sdk";
import { Badge, Button, Card, Field, Input, Modal, Select, Toggle, useToast } from "@/components/ui";
import { API_URL, useSupport } from "@/lib/support";
import { cx, dateTime } from "@/lib/format";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "applications", label: "Applications & widget" },
  { id: "audit", label: "Audit log", superOnly: true },
] as const;

export default function SettingsPage() {
  const { me } = useSupport();
  const [tab, setTab] = React.useState<(typeof TABS)[number]["id"]>("profile");
  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <div className="mt-5 flex gap-1 border-b border-zinc-200" role="tablist">
          {TABS.filter((t) => !("superOnly" in t) || me?.role === "SUPER_ADMIN").map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors", tab === t.id ? "border-brand-600 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-6">{tab === "profile" ? <Profile /> : tab === "applications" ? <Applications /> : <Audit />}</div>
      </div>
    </div>
  );
}

function Profile() {
  const { client, me, setMe } = useSupport();
  const toast = useToast();
  const [form, setForm] = React.useState({ name: "", title: "", avatarUrl: "" });
  const [pw, setPw] = React.useState({ current: "", next: "" });
  const [perm, setPerm] = React.useState<string>("default");
  React.useEffect(() => {
    if (me) setForm({ name: me.name, title: me.title ?? "", avatarUrl: me.avatarUrl ?? "" });
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
  }, [me]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Your profile</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Customers see your name, title and photo.</p>
        <div className="mt-4 grid gap-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Photo URL"><Input value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="https://…" /></Field>
          <div>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  setMe(await client.updateMe({ name: form.name, title: form.title || undefined, avatarUrl: form.avatarUrl || undefined }));
                  toast({ title: "Profile saved", tone: "success" });
                } catch (e: any) {
                  toast({ title: "Could not save", description: e?.message, tone: "error" });
                }
              }}
            >
              Save profile
            </Button>
          </div>
        </div>
      </Card>
      <div className="grid gap-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Desktop notifications</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Get alerted about new conversations, messages and calls while this tab is in the background.</p>
          <div className="mt-3 flex items-center gap-3">
            <Badge tone={perm === "granted" ? "green" : perm === "denied" ? "red" : "amber"}>{perm === "granted" ? "Enabled" : perm === "denied" ? "Blocked in browser" : "Not enabled"}</Badge>
            {perm === "default" && <Button size="sm" onClick={() => void Notification.requestPermission().then(setPerm)}>Enable</Button>}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Change password</h2>
          <div className="mt-3 grid gap-3">
            <Input type="password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" aria-label="Current password" />
            <Input type="password" placeholder="New password (8+ characters)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" aria-label="New password" />
            <div>
              <Button
                disabled={pw.next.length < 8 || !pw.current}
                onClick={async () => {
                  try {
                    await client.changePassword(pw.current, pw.next);
                    toast({ title: "Password changed", description: "Please sign in again.", tone: "success" });
                    await client.logout();
                    location.href = "/login";
                  } catch (e: any) {
                    toast({ title: "Could not change password", description: e?.message, tone: "error" });
                  }
                }}
              >
                Update password
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Applications() {
  const { apps, refreshApps, me } = useSupport();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [revealed, setRevealed] = React.useState<Application | null>(null);
  const app = apps.find((a) => a.id === selected) ?? apps[0];
  const isSuper = me?.role === "SUPER_ADMIN";
  const canEdit = me?.role !== "AGENT";

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <Card className="h-fit p-2">
        {apps.map((a) => (
          <button key={a.id} onClick={() => setSelected(a.id)} className={cx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm", app?.id === a.id ? "bg-zinc-100 font-medium" : "hover:bg-zinc-50")}>
            <AppWindow className="h-4 w-4 text-zinc-400" />
            <span className="flex-1 truncate">{a.name}</span>
            {!a.isActive && <Badge tone="red">Off</Badge>}
          </button>
        ))}
        {apps.length === 0 && <p className="px-2.5 py-2 text-sm text-zinc-500">No applications yet.</p>}
        {isSuper && (
          <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New application</Button>
        )}
      </Card>
      {app ? <AppDetail key={app.id} app={app} canEdit={canEdit} isSuper={isSuper} onSecret={setRevealed} onSaved={() => void refreshApps()} /> : <Card className="p-8 text-center text-sm text-zinc-500">Create an application to get an app ID for the widget.</Card>}
      {creating && <CreateApp onClose={() => setCreating(false)} onCreated={(a) => (setRevealed(a), setSelected(a.id), void refreshApps())} />}
      {revealed?.secret && <SecretModal app={revealed} onClose={() => setRevealed(null)} />}
    </div>
  );
}

function AppDetail({ app, canEdit, isSuper, onSecret, onSaved }: { app: Application; canEdit: boolean; isSuper: boolean; onSecret: (a: Application) => void; onSaved: () => void }) {
  const { client } = useSupport();
  const toast = useToast();
  const s = (app.settings ?? {}) as Record<string, any>;
  const [general, setGeneral] = React.useState({
    name: app.name,
    allowedOrigins: app.allowedOrigins.join("\n"),
    allowAnonymous: app.allowAnonymous,
    isRoxShieldIdentity: app.isRoxShieldIdentity,
    isActive: app.isActive,
  });
  const [w, setW] = React.useState({
    primaryColor: s.primaryColor ?? "#4f46e5",
    brandName: s.brandName ?? "",
    logoUrl: s.logoUrl ?? "",
    position: s.position ?? "bottom-right",
    welcomeTitle: s.welcomeTitle ?? "",
    welcomeMessage: s.welcomeMessage ?? "",
    offlineMessage: s.offlineMessage ?? "",
    callsEnabled: s.callsEnabled ?? true,
    attachmentsEnabled: s.attachmentsEnabled ?? true,
    voiceMessagesEnabled: s.voiceMessagesEnabled ?? true,
    maxUploadMb: s.maxUploadMb ?? 10,
    autoAssign: s.autoAssign ?? true,
    assignmentStrategy: s.assignmentStrategy ?? "ROUND_ROBIN",
    reopenWindowHours: s.reopenWindowHours ?? 72,
    ringTimeoutSec: s.ringTimeoutSec ?? 30,
    businessHours: s.businessHours ? JSON.stringify(s.businessHours, null, 2) : "",
  });

  const save = async () => {
    try {
      let businessHours: any = null;
      if (w.businessHours.trim()) businessHours = JSON.parse(w.businessHours);
      await client.updateApplication(app.id, {
        name: general.name,
        allowedOrigins: general.allowedOrigins.split(/[\n,]/).map((x) => x.trim()).filter(Boolean),
        allowAnonymous: general.allowAnonymous,
        isRoxShieldIdentity: general.isRoxShieldIdentity,
        isActive: general.isActive,
      });
      await client.updateSettings(app.id, {
        primaryColor: w.primaryColor,
        brandName: w.brandName || undefined,
        logoUrl: w.logoUrl || undefined,
        position: w.position,
        welcomeTitle: w.welcomeTitle,
        welcomeMessage: w.welcomeMessage,
        offlineMessage: w.offlineMessage,
        callsEnabled: w.callsEnabled,
        attachmentsEnabled: w.attachmentsEnabled,
        voiceMessagesEnabled: w.voiceMessagesEnabled,
        maxUploadMb: Number(w.maxUploadMb),
        autoAssign: w.autoAssign,
        assignmentStrategy: w.assignmentStrategy,
        reopenWindowHours: Number(w.reopenWindowHours),
        ringTimeoutSec: Number(w.ringTimeoutSec),
        businessHours,
      });
      toast({ title: "Application saved", tone: "success" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Could not save", description: e instanceof SyntaxError ? "Business hours must be valid JSON" : e?.message, tone: "error" });
    }
  };

  const snippet = `import { SupportWidget } from "@roxshield/support-widget";

<SupportWidget
  apiUrl="${API_URL}"
  appId="${app.publicId}"
  getCustomerToken={async () => (await fetch("/api/support-token")).text()}
/>`;

  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{app.name}</h2>
            <p className="text-xs text-zinc-500">{app.platform} · created {dateTime(app.createdAt)}</p>
          </div>
          {isSuper && (
            <Button
              size="sm"
              onClick={async () => {
                if (!confirm("Rotate the signing secret? Tokens signed with the old secret stop working immediately — update your backend first.")) return;
                try {
                  onSecret(await client.rotateSecret(app.id));
                } catch (e: any) {
                  toast({ title: "Rotation failed", description: e?.message, tone: "error" });
                }
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Rotate secret
            </Button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CopyField label="App ID (public)" value={app.publicId} hint="Safe to put in browser code." />
          <CopyField label="Signing secret" value={app.secretHint} hint="Server-side only. Shown in full once when created or rotated." icon={<KeyRound className="h-3.5 w-3.5" />} noCopy />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Access & identity</h3>
        <div className="mt-4 grid gap-4">
          <Field label="Name"><Input value={general.name} onChange={(e) => setGeneral({ ...general, name: e.target.value })} disabled={!canEdit} /></Field>
          <Field label="Allowed origins" hint="One per line, e.g. https://shop.roxanlabs.com or *.roxanlabs.com. Empty allows any origin (identity still requires a signed token).">
            <textarea value={general.allowedOrigins} onChange={(e) => setGeneral({ ...general, allowedOrigins: e.target.value })} disabled={!canEdit} rows={3} className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-[13px] outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15" />
          </Field>
          <ToggleRow label="Allow anonymous visitors" hint="Visitors can chat without being signed in to your app (e.g. marketing sites)." checked={general.allowAnonymous} onChange={(v) => setGeneral({ ...general, allowAnonymous: v })} disabled={!canEdit} />
          <ToggleRow label="Rox Shield accounts" hint="Customers sign in with their Rox Shield login via POST /api/support/identity/rox-shield. Shows shop details to agents." checked={general.isRoxShieldIdentity} onChange={(v) => setGeneral({ ...general, isRoxShieldIdentity: v })} disabled={!canEdit} />
          <ToggleRow label="Application active" hint="Turning this off disconnects the widget everywhere." checked={general.isActive} onChange={(v) => setGeneral({ ...general, isActive: v })} disabled={!canEdit} />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Widget appearance</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Brand colour">
            <div className="flex gap-2">
              <input type="color" value={w.primaryColor} onChange={(e) => setW({ ...w, primaryColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-zinc-200" aria-label="Brand colour picker" />
              <Input value={w.primaryColor} onChange={(e) => setW({ ...w, primaryColor: e.target.value })} className="font-mono" />
            </div>
          </Field>
          <Field label="Position">
            <Select value={w.position} onChange={(e) => setW({ ...w, position: e.target.value })} className="w-full">
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
            </Select>
          </Field>
          <Field label="Brand name"><Input value={w.brandName} onChange={(e) => setW({ ...w, brandName: e.target.value })} /></Field>
          <Field label="Logo URL"><Input value={w.logoUrl} onChange={(e) => setW({ ...w, logoUrl: e.target.value })} placeholder="https://…" /></Field>
          <Field label="Welcome title"><Input value={w.welcomeTitle} onChange={(e) => setW({ ...w, welcomeTitle: e.target.value })} /></Field>
          <Field label="Welcome message"><Input value={w.welcomeMessage} onChange={(e) => setW({ ...w, welcomeMessage: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Offline message"><Input value={w.offlineMessage} onChange={(e) => setW({ ...w, offlineMessage: e.target.value })} /></Field></div>
        </div>
        <div className="mt-5 grid gap-3">
          <ToggleRow label="Voice calls" checked={w.callsEnabled} onChange={(v) => setW({ ...w, callsEnabled: v })} />
          <ToggleRow label="Image & file sharing" checked={w.attachmentsEnabled} onChange={(v) => setW({ ...w, attachmentsEnabled: v })} />
          <ToggleRow label="Voice messages" checked={w.voiceMessagesEnabled} onChange={(v) => setW({ ...w, voiceMessagesEnabled: v })} />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Routing & limits</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ToggleRow label="Automatic assignment" hint="Assign new conversations to an online agent with spare capacity." checked={w.autoAssign} onChange={(v) => setW({ ...w, autoAssign: v })} />
          <Field label="Strategy">
            <Select value={w.assignmentStrategy} onChange={(e) => setW({ ...w, assignmentStrategy: e.target.value })} className="w-full" disabled={!w.autoAssign}>
              <option value="ROUND_ROBIN">Round robin</option>
              <option value="LEAST_BUSY">Least busy</option>
            </Select>
          </Field>
          <Field label="Reopen window (hours)" hint="A customer message within this window reopens their last resolved conversation."><Input type="number" min={0} value={w.reopenWindowHours} onChange={(e) => setW({ ...w, reopenWindowHours: Number(e.target.value) })} /></Field>
          <Field label="Ring timeout (seconds)" hint="Unanswered calls become missed calls."><Input type="number" min={10} max={120} value={w.ringTimeoutSec} onChange={(e) => setW({ ...w, ringTimeoutSec: Number(e.target.value) })} /></Field>
          <Field label="Max upload size (MB)"><Input type="number" min={1} max={25} value={w.maxUploadMb} onChange={(e) => setW({ ...w, maxUploadMb: Number(e.target.value) })} /></Field>
          <div className="sm:col-span-2">
            <Field label="Business hours (JSON, optional)" hint='e.g. {"timezone":"Asia/Karachi","days":{"mon":[["09:00","18:00"]],"tue":[["09:00","18:00"]]}} — empty means always open.'>
              <textarea value={w.businessHours} onChange={(e) => setW({ ...w, businessHours: e.target.value })} rows={4} className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-[12px] outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15" />
            </Field>
          </div>
        </div>
        {canEdit && <div className="mt-5 flex justify-end"><Button variant="primary" onClick={save}>Save application</Button></div>}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Install</h3>
        <p className="mt-0.5 text-xs text-zinc-500">Add the widget to any React / Next.js app. Your backend signs the customer token with the secret — see docs/integration.md.</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 p-4 text-[12px] leading-relaxed text-zinc-100">{snippet}</pre>
      </Card>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={cx("flex items-center justify-between gap-4", disabled && "pointer-events-none opacity-60")}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-zinc-500">{hint}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function CopyField({ label, value, hint, icon, noCopy }: { label: string; value: string; hint?: string; icon?: React.ReactNode; noCopy?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-zinc-700">{label}</div>
      <div className="flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3">
        {icon}
        <code className="flex-1 truncate text-[13px]">{value}</code>
        {!noCopy && (
          <button onClick={() => void navigator.clipboard.writeText(value).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))} className="text-zinc-400 hover:text-zinc-700" aria-label={`Copy ${label}`}>
            {copied ? <span className="text-xs text-emerald-600">Copied</span> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function CreateApp({ onClose, onCreated }: { onClose: () => void; onCreated: (a: Application) => void }) {
  const { client } = useSupport();
  const toast = useToast();
  const [form, setForm] = React.useState({ name: "", platform: "WEB", allowedOrigins: "", allowAnonymous: false, isRoxShieldIdentity: false });
  const [saving, setSaving] = React.useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="New application"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={form.name.trim().length < 2}
            onClick={async () => {
              setSaving(true);
              try {
                const a = await client.createApplication({ ...form, allowedOrigins: form.allowedOrigins.split(/[\n,]/).map((x) => x.trim()).filter(Boolean) });
                onCreated(a);
                onClose();
              } catch (e: any) {
                toast({ title: "Could not create", description: e?.message, tone: "error" });
              } finally {
                setSaving(false);
              }
            }}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rox Shield Website" autoFocus /></Field>
        <Field label="Platform">
          <Select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full">
            <option value="WEB">Website</option>
            <option value="ANDROID">Android app</option>
            <option value="IOS">iOS app</option>
            <option value="INTERNAL">Internal tool</option>
          </Select>
        </Field>
        <Field label="Allowed origins (optional)"><Input value={form.allowedOrigins} onChange={(e) => setForm({ ...form, allowedOrigins: e.target.value })} placeholder="https://example.com, https://app.example.com" /></Field>
        <ToggleRow label="Allow anonymous visitors" checked={form.allowAnonymous} onChange={(v) => setForm({ ...form, allowAnonymous: v })} />
        <ToggleRow label="Rox Shield accounts" hint="For Rox Shield's own apps (rox-admin)." checked={form.isRoxShieldIdentity} onChange={(v) => setForm({ ...form, isRoxShieldIdentity: v })} />
      </div>
    </Modal>
  );
}

function SecretModal({ app, onClose }: { app: Application; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Modal open onClose={onClose} title="Save your signing secret" footer={<Button variant="primary" onClick={onClose}>I've stored it safely</Button>}>
      <div className="flex gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset">
        <ShieldAlert className="h-5 w-5 shrink-0" />
        <p>This is the only time the full secret is shown. Store it in your backend's environment (e.g. <code>ROX_SUPPORT_APP_SECRET</code>). Never put it in browser or mobile app code.</p>
      </div>
      <div className="mt-4 grid gap-3">
        <div>
          <div className="mb-1 text-xs font-medium text-zinc-500">App ID</div>
          <code className="block rounded-lg bg-zinc-100 px-3 py-2 text-[13px]">{app.publicId}</code>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-zinc-500">Secret</div>
          <div className="flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2">
            <code className="flex-1 break-all text-[13px] text-emerald-300">{app.secret}</code>
            <button onClick={() => void navigator.clipboard.writeText(app.secret!).then(() => setCopied(true))} className="text-zinc-400 hover:text-white" aria-label="Copy secret">
              {copied ? <span className="text-xs text-emerald-400">Copied</span> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Audit() {
  const { client } = useSupport();
  const [rows, setRows] = React.useState<any[] | null>(null);
  React.useEffect(() => {
    client.auditLogs({ limit: 100 }).then(setRows).catch(() => setRows([]));
  }, [client]);
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs text-zinc-500">
            <tr><th className="px-4 py-2.5 font-medium">When</th><th className="px-4 py-2.5 font-medium">Who</th><th className="px-4 py-2.5 font-medium">Action</th><th className="px-4 py-2.5 font-medium">Target</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 whitespace-nowrap text-zinc-500">{dateTime(r.createdAt)}</td>
                <td className="px-4 py-2">{r.agent?.name ?? r.actorType.toLowerCase()}</td>
                <td className="px-4 py-2"><code className="text-[12px]">{r.action}</code></td>
                <td className="px-4 py-2 text-zinc-500">{r.entityType} <code className="text-[11px]">{r.entityId.slice(0, 8)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows && rows.length === 0 && <p className="p-6 text-center text-sm text-zinc-400">No audit entries yet.</p>}
    </Card>
  );
}
