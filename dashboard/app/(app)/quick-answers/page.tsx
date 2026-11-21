"use client";

import * as React from "react";
import { Download, FlaskConical, ImagePlus, Pencil, Plus, Search, ShieldCheck, Trash2, Upload, X, Zap } from "lucide-react";
import type { QuickAnswer, QuickAnswerMode, QuickAnswerSettings, QuickAnswerTestResult } from "@roxshield/support-sdk";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Skeleton, useToast } from "@/components/ui";
import { QuickAnswerForm, QuickAnswerDraftForm, emptyQuickAnswer, fromQuickAnswer } from "@/components/quick-answers/QuickAnswerForm";
import { useSupport } from "@/lib/support";
import { cx } from "@/lib/format";

const MODES: { id: QuickAnswerMode; label: string; help: string }[] = [
  { id: "OFF", label: "Off", help: "Nothing happens." },
  { id: "SUGGEST", label: "Suggest to agents", help: "Agents see a suggested answer above the reply box and send it with one click." },
  { id: "AUTO", label: "Auto-reply", help: "Confident matches are answered automatically as the assistant. Everything else goes to the team." },
];

export default function QuickAnswersPage() {
  const { client, apps, me } = useSupport();
  const toast = useToast();
  const isAdmin = me?.role === "ADMIN" || me?.role === "SUPER_ADMIN";
  const [appId, setAppId] = React.useState<string>("");
  const [items, setItems] = React.useState<QuickAnswer[] | null>(null);
  const [settings, setSettings] = React.useState<QuickAnswerSettings | null>(null);
  const [editing, setEditing] = React.useState<QuickAnswerDraftForm | null>(null);
  const [q, setQ] = React.useState("");
  const importRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!appId && apps.length) setAppId(apps[0].id);
  }, [apps, appId]);

  const load = React.useCallback(async () => {
    if (!appId) return;
    setItems(null);
    try {
      const [list, s] = await Promise.all([client.quickAnswers(appId), client.quickAnswerSettings(appId)]);
      setItems(list);
      setSettings(s);
    } catch (e: any) {
      setItems([]);
      toast({ title: "Could not load quick answers", description: e?.message, tone: "error" });
    }
  }, [client, appId, toast]);
  React.useEffect(() => void load(), [load]);

  const filtered = (items ?? []).filter((i) => {
    const s = q.trim().toLowerCase();
    return !s || i.title.toLowerCase().includes(s) || i.answer.toLowerCase().includes(s) || i.phrases.some((p) => p.toLowerCase().includes(s));
  });
  const pending = (items ?? []).filter((i) => !i.approved).length;

  const exportAll = async () => {
    try {
      const data = await client.exportQuickAnswers(appId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `quick-answers-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, tone: "error" });
    }
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data.items;
      const r = await client.importQuickAnswers(appId, list);
      toast({ title: `Imported ${r.imported} quick answer(s)`, tone: "success" });
      void load();
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message ?? "Not a valid export file", tone: "error" });
    }
  };

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Zap className="h-5 w-5 text-brand-600" /> Quick answers
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500">Saved replies for common problems, matched from what customers type or the screenshot they send. Runs on your server — no AI service.</p>
          </div>
          {apps.length > 1 && (
            <Select value={appId} onChange={(e) => setAppId(e.target.value)} aria-label="Application">
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          )}
        </div>

        {!appId ? (
          <div className="mt-8"><Skeleton className="h-40" /></div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 lg:grid-cols-5">
              <SettingsCard appId={appId} settings={settings} onSaved={setSettings} isAdmin={isAdmin} />
              <Tester appId={appId} />
            </div>

            <Card className="mt-4">
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3">
                <h2 className="mr-2 text-sm font-semibold">
                  Answers {items && <span className="font-normal text-zinc-400">· {items.length}</span>}
                </h2>
                {isAdmin && pending > 0 && <Badge tone="amber">{pending} waiting for approval</Badge>}
                <div className="relative ml-auto w-full sm:w-64">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search answers" className="h-8 pl-8" aria-label="Search answers" />
                </div>
                <Button size="sm" onClick={() => void exportAll()} title="Download all answers as a backup file">
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
                {isAdmin && (
                  <>
                    <Button size="sm" onClick={() => importRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" /> Import
                    </Button>
                    <input
                      ref={importRef}
                      type="file"
                      accept="application/json,.json"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void importFile(file);
                      }}
                    />
                  </>
                )}
                <Button size="sm" variant="primary" onClick={() => setEditing(emptyQuickAnswer(appId))}>
                  <Plus className="h-3.5 w-3.5" /> New answer
                </Button>
              </div>

              {!items ? (
                <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
              ) : !filtered.length ? (
                <EmptyState
                  icon={<Zap className="h-5 w-5" />}
                  title={items.length ? "No answers match your search" : "No quick answers yet"}
                  description={items.length ? undefined : "Add your most common customer problems, or use “Save as quick answer” from any conversation."}
                  action={!items.length ? <Button variant="primary" onClick={() => setEditing(emptyQuickAnswer(appId))}><Plus className="h-4 w-4" /> Add the first one</Button> : undefined}
                />
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {filtered.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium">{i.title}</span>
                          {!i.enabled && <Badge>Off</Badge>}
                          {!i.approved && <Badge tone="amber">Suggest only · needs approval</Badge>}
                        </div>
                        <p dir="auto" className="mt-0.5 line-clamp-2 text-[13px] text-zinc-600">{i.answer}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {i.phrases.slice(0, 5).map((p) => <Badge key={p} tone="brand">{p}</Badge>)}
                          {i.phrases.length > 5 && <Badge>+{i.phrases.length - 5}</Badge>}
                          {i.screenTexts.length > 0 && <Badge tone="blue">{i.screenTexts.length} screen text{i.screenTexts.length > 1 ? "s" : ""}</Badge>}
                          {i.imageHashes.length > 0 && <Badge tone="blue">{i.imageHashes.length} screenshot{i.imageHashes.length > 1 ? "s" : ""}</Badge>}
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-400">Used {i.uses ?? 0}× · added by {i.createdByName}</p>
                      </div>
                      {isAdmin && (
                        <div className="flex shrink-0 items-center gap-1">
                          {!i.approved && (
                            <Button
                              size="sm"
                              variant="success"
                              onClick={async () => {
                                try {
                                  const u = await client.updateQuickAnswer(i.id, { approved: true });
                                  setItems((s) => s?.map((x) => (x.id === i.id ? { ...x, ...u } : x)) ?? s);
                                } catch (e: any) {
                                  toast({ title: "Could not approve", description: e?.message, tone: "error" });
                                }
                              }}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" /> Approve
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" aria-label={`Edit ${i.title}`} onClick={() => setEditing(fromQuickAnswer(i))}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete ${i.title}`}
                            onClick={async () => {
                              if (!confirm(`Delete “${i.title}”?`)) return;
                              try {
                                await client.deleteQuickAnswer(i.id);
                                setItems((s) => s?.filter((x) => x.id !== i.id) ?? s);
                              } catch (e: any) {
                                toast({ title: "Could not delete", description: e?.message, tone: "error" });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>

      <QuickAnswerForm
        open={!!editing}
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          setItems((s) => {
            if (!s) return s;
            const exists = s.some((x) => x.id === saved.id);
            return exists ? s.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)) : [{ ...saved, uses: 0 }, ...s];
          });
        }}
      />
    </div>
  );
}

function SettingsCard({ appId, settings, onSaved, isAdmin }: { appId: string; settings: QuickAnswerSettings | null; onSaved: (s: QuickAnswerSettings) => void; isAdmin: boolean }) {
  const { client } = useSupport();
  const toast = useToast();
  const [s, setS] = React.useState<QuickAnswerSettings | null>(settings);
  const [handoff, setHandoff] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    setS(settings);
    setHandoff(settings?.handoffWords.join(", ") ?? "");
  }, [settings]);

  if (!s) return <Card className="p-5 lg:col-span-3"><Skeleton className="h-48" /></Card>;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const save = async () => {
    setSaving(true);
    try {
      const next = await client.updateQuickAnswerSettings(appId, {
        ...s,
        handoffWords: handoff.split(",").map((w) => w.trim()).filter(Boolean),
      });
      onSaved(next);
      toast({ title: "Settings saved", tone: "success" });
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 lg:col-span-3">
      <h2 className="text-sm font-semibold">How answers are used</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={s.mode === m.id}
            disabled={!isAdmin}
            onClick={() => setS({ ...s, mode: m.id })}
            className={cx(
              "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-default",
              s.mode === m.id ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-zinc-200 hover:bg-zinc-50"
            )}
          >
            <div className="text-sm font-medium">{m.label}</div>
            <div className="mt-0.5 text-xs text-zinc-500">{m.help}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={`Auto-reply when the match is at least ${pct(s.autoThreshold)}`} hint="Higher = fewer but safer automatic replies.">
          <input type="range" min={50} max={99} value={Math.round(s.autoThreshold * 100)} disabled={!isAdmin} onChange={(e) => setS({ ...s, autoThreshold: Number(e.target.value) / 100 })} className="w-full accent-brand-600" />
        </Field>
        <Field label={`Suggest to agents from ${pct(s.suggestThreshold)}`} hint="Lower = more suggestions, some less relevant.">
          <input type="range" min={20} max={95} value={Math.round(s.suggestThreshold * 100)} disabled={!isAdmin} onChange={(e) => setS({ ...s, suggestThreshold: Number(e.target.value) / 100 })} className="w-full accent-brand-600" />
        </Field>
        <Field label="Assistant name" hint="Shown to customers on automatic replies.">
          <Input value={s.botName} maxLength={40} disabled={!isAdmin} onChange={(e) => setS({ ...s, botName: e.target.value })} />
        </Field>
        <Field label="Max automatic replies per conversation">
          <Input type="number" min={1} max={20} value={s.maxAutoRepliesPerConversation} disabled={!isAdmin} onChange={(e) => setS({ ...s, maxAutoRepliesPerConversation: Number(e.target.value) || 1 })} />
        </Field>
        <Field label="Added under every automatic reply">
          <textarea dir="auto" rows={2} maxLength={500} value={s.footer} disabled={!isAdmin} onChange={(e) => setS({ ...s, footer: e.target.value })} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
        </Field>
        <Field label="Pause after an agent replies (minutes)" hint="The assistant stays quiet while a person is talking to the customer.">
          <Input type="number" min={0} max={1440} value={s.pauseAfterAgentReplyMin} disabled={!isAdmin} onChange={(e) => setS({ ...s, pauseAfterAgentReplyMin: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Words that mean “I want a person”" hint="Comma separated. After an automatic reply, these hand the chat to the team.">
          <Input dir="auto" value={handoff} disabled={!isAdmin} onChange={(e) => setHandoff(e.target.value)} />
        </Field>
        <Field label="Message sent when handing over">
          <textarea dir="auto" rows={2} maxLength={500} value={s.handoffMessage} disabled={!isAdmin} onChange={(e) => setS({ ...s, handoffMessage: e.target.value })} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
        </Field>
      </div>
      {isAdmin ? (
        <div className="mt-4">
          <Button variant="primary" loading={saving} onClick={() => void save()}>Save settings</Button>
        </div>
      ) : (
        <p className="mt-4 text-xs text-zinc-500">Only admins can change these settings.</p>
      )}
    </Card>
  );
}

function Tester({ appId }: { appId: string }) {
  const { client } = useSupport();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<QuickAnswerTestResult | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      setResult(await client.testQuickAnswers(appId, { text: text.trim() || undefined, file: file ?? undefined }));
    } catch (e: any) {
      toast({ title: "Test failed", description: e?.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 lg:col-span-2">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold"><FlaskConical className="h-4 w-4 text-zinc-400" /> Try it</h2>
      <p className="mt-0.5 text-xs text-zinc-500">Type what a customer might send, or attach a screenshot.</p>
      <textarea
        dir="auto"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="mera phone lock ho gaya hai"
        className="mt-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {file ? (
          <Badge tone="blue">
            {file.name.slice(0, 24)}
            <button type="button" aria-label="Remove screenshot" onClick={() => setFile(null)}><X className="h-3 w-3" /></button>
          </Badge>
        ) : (
          <Button size="sm" onClick={() => fileRef.current?.click()}><ImagePlus className="h-3.5 w-3.5" /> Screenshot</Button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => (setFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
        <Button size="sm" variant="primary" loading={busy} disabled={!text.trim() && !file} onClick={() => void run()} className="ml-auto">Test</Button>
      </div>

      {result && (
        <div className="mt-4 space-y-2">
          {result.ocrText !== null && (
            <details className="rounded-lg bg-zinc-50 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium text-zinc-600">Text read from the screenshot</summary>
              <pre dir="auto" className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-zinc-700">{result.ocrText || "(no text found)"}</pre>
            </details>
          )}
          {!result.results.length ? (
            <p className="text-sm text-zinc-500">No saved answer matches. This would go to the team.</p>
          ) : (
            result.results.map((r, i) => (
              <div key={r.id} className={cx("rounded-lg border px-3 py-2", i === 0 ? "border-brand-200 bg-brand-50/50" : "border-zinc-200")}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm font-medium">{r.title}</span>
                  <span className="text-xs font-semibold tabular-nums">{Math.round(r.score * 100)}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                  <div className={cx("h-full rounded-full", r.score >= result.settings.autoThreshold ? "bg-emerald-500" : r.score >= result.settings.suggestThreshold ? "bg-amber-500" : "bg-zinc-400")} style={{ width: `${Math.round(r.score * 100)}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">Matched {r.source === "text" ? "message" : r.source === "screen" ? "screenshot text" : "screenshot picture"}: {r.matched.join(", ")}</p>
              </div>
            ))
          )}
          {result.results.length > 0 && (
            <p className="text-xs text-zinc-600">
              {result.wouldAutoReply
                ? "✅ Would be answered automatically."
                : result.ambiguous
                  ? "Two answers are too close — would be suggested to agents, not sent."
                  : result.best && result.best.score >= result.settings.suggestThreshold
                    ? result.settings.mode === "OFF"
                      ? "Quick answers are off for this application."
                      : "Would be suggested to agents."
                    : "Too weak — would go to the team without a suggestion."}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
