"use client";

import * as React from "react";
import { ImagePlus, X } from "lucide-react";
import type { QuickAnswer } from "@roxshield/support-sdk";
import { Badge, Button, Field, Input, Modal, Toggle, useToast } from "@/components/ui";
import { useSupport } from "@/lib/support";

export interface QuickAnswerDraftForm {
  id?: string;
  applicationId: string;
  title: string;
  answer: string;
  phrases: string[];
  screenTexts: string[];
  imageHashes: string[];
  enabled: boolean;
  approved: boolean;
}

export function emptyQuickAnswer(applicationId: string): QuickAnswerDraftForm {
  return { applicationId, title: "", answer: "", phrases: [], screenTexts: [], imageHashes: [], enabled: true, approved: true };
}

export function fromQuickAnswer(q: QuickAnswer): QuickAnswerDraftForm {
  return {
    id: q.id,
    applicationId: q.applicationId,
    title: q.title,
    answer: q.answer,
    phrases: q.phrases,
    screenTexts: q.screenTexts,
    imageHashes: q.imageHashes,
    enabled: q.enabled,
    approved: q.approved,
  };
}

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/** Distinctive lines of OCR text (mirrors the server's suggestion rules). */
function screenLines(ocr: string): string[] {
  const out: string[] = [];
  for (const raw of ocr.split(/\r?\n/)) {
    const l = raw.replace(/\s+/g, " ").trim();
    const letters = (l.match(/\p{L}/gu) || []).length;
    if (l.length < 4 || l.length > 40 || letters < 3 || /^\d{1,2}[:.]\d{2}/.test(l)) continue;
    if (!out.some((o) => o.toLowerCase() === l.toLowerCase())) out.push(l);
    if (out.length >= 6) break;
  }
  return out;
}

export function QuickAnswerForm({
  open,
  initial,
  onClose,
  onSaved,
  heading,
}: {
  open: boolean;
  initial: QuickAnswerDraftForm | null;
  onClose: () => void;
  onSaved: (q: QuickAnswer) => void;
  heading?: string;
}) {
  const { client, me } = useSupport();
  const toast = useToast();
  const isAdmin = me?.role === "ADMIN" || me?.role === "SUPER_ADMIN";
  const [f, setF] = React.useState<QuickAnswerDraftForm | null>(initial);
  const [phrasesText, setPhrasesText] = React.useState("");
  const [screensText, setScreensText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setF(initial);
    setPhrasesText(initial?.phrases.join("\n") ?? "");
    setScreensText(initial?.screenTexts.join("\n") ?? "");
  }, [initial]);

  if (!f) return null;

  const addScreenshot = async (file: File) => {
    setReading(true);
    try {
      const r = await client.testQuickAnswers(f.applicationId, { file });
      const hash = r.imageHash;
      if (hash) setF((cur) => (cur && !cur.imageHashes.includes(hash) ? { ...cur, imageHashes: [...cur.imageHashes, hash] } : cur));
      const found = r.ocrText ? screenLines(r.ocrText) : [];
      const have = new Set(lines(screensText).map((l) => l.toLowerCase()));
      const add = found.filter((l) => !have.has(l.toLowerCase()));
      if (add.length) setScreensText((s) => [...lines(s), ...add].join("\n"));
      toast({ title: "Screenshot added", description: add.length ? `Read ${add.length} line(s) of text from it — remove any that aren't useful.` : "No readable text found; the picture fingerprint was saved.", tone: "success" });
    } catch (e: any) {
      toast({ title: "Could not read that screenshot", description: e?.message, tone: "error" });
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    const payload = {
      title: f.title.trim(),
      answer: f.answer.trim(),
      phrases: lines(phrasesText),
      screenTexts: lines(screensText),
      imageHashes: f.imageHashes,
      enabled: f.enabled,
      ...(isAdmin ? { approved: f.approved } : {}),
    };
    if (!payload.title || !payload.answer) {
      toast({ title: "Add a title and the answer text", tone: "error" });
      return;
    }
    if (!payload.phrases.length && !payload.screenTexts.length && !payload.imageHashes.length) {
      toast({ title: "Add at least one keyword, screen text or screenshot", tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const saved = f.id ? await client.updateQuickAnswer(f.id, payload) : await client.createQuickAnswer({ applicationId: f.applicationId, ...payload });
      toast({ title: f.id ? "Quick answer updated" : "Quick answer saved", description: !f.id && !isAdmin ? "An admin needs to approve it before it is sent automatically." : undefined, tone: "success" });
      onSaved(saved);
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={heading ?? (f.id ? "Edit quick answer" : "New quick answer")}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Title" hint="For your team, e.g. “Manage device apps screen”.">
          <Input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>

        <Field label="Answer sent to the customer" hint="Write it the way you'd reply — Urdu, Roman Urdu or English.">
          <textarea
            dir="auto"
            rows={5}
            maxLength={4000}
            value={f.answer}
            onChange={(e) => setF({ ...f, answer: e.target.value })}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
            placeholder="Customer ke device mein ja ke Permission Monitor ko on karein…"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What customers type" hint="One phrase per line. Spelling mistakes and Roman Urdu variants are handled.">
            <textarea
              dir="auto"
              rows={6}
              value={phrasesText}
              onChange={(e) => setPhrasesText(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-[13px] outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
              placeholder={"permission monitor\nmanage device apps\nphone lock ho gaya"}
            />
          </Field>
          <Field label="Words on the screenshot" hint="Text visible on that screen, one per line. Used when a customer sends a screenshot.">
            <textarea
              dir="auto"
              rows={6}
              value={screensText}
              onChange={(e) => setScreensText(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-[13px] outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
              placeholder={"Manage device apps\nPermission monitor"}
            />
          </Field>
        </div>

        <div>
          <div className="mb-1.5 text-[13px] font-medium text-zinc-700">Example screenshots</div>
          <div className="flex flex-wrap items-center gap-2">
            {f.imageHashes.map((h) => (
              <Badge key={h} tone="blue">
                Picture {h.slice(0, 6)}
                <button type="button" aria-label="Remove screenshot" onClick={() => setF({ ...f, imageHashes: f.imageHashes.filter((x) => x !== h) })}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <Button size="sm" loading={reading} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-3.5 w-3.5" /> Add screenshot
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void addScreenshot(file);
              }}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-500">We read the text on it and remember what it looks like, so the same screen is recognised next time.</p>
        </div>

        <div className="flex flex-wrap gap-6 rounded-lg bg-zinc-50 px-3 py-2.5">
          <label className="flex items-center gap-2 text-sm">
            <Toggle checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label="Enabled" /> Enabled
          </label>
          {isAdmin ? (
            <label className="flex items-center gap-2 text-sm">
              <Toggle checked={f.approved} onChange={(v) => setF({ ...f, approved: v })} label="Approved for automatic replies" /> Approved for automatic replies
            </label>
          ) : (
            <span className="text-xs text-zinc-500">Agents' answers are suggested to the team; an admin approves them for automatic replies.</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
