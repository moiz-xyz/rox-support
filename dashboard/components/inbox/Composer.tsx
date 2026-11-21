"use client";

import * as React from "react";
import { Lock, Mic, Paperclip, Send, Square, Trash2, X, Reply } from "lucide-react";
import type { Message } from "@roxshield/support-sdk";
import { cx } from "@/lib/format";

const MAX_MB = 25;

export function Composer({
  onSend,
  onTyping,
  replyTo,
  onCancelReply,
  resolved,
  disabledReason,
  otherAgentTyping,
  prefill,
}: {
  onSend: (input: { body: string; files: File[]; isInternal: boolean; voice?: { file: File; durationMs: number } }) => void;
  onTyping: (isTyping: boolean, internal: boolean) => void;
  replyTo: Message | null;
  onCancelReply: () => void;
  resolved: boolean;
  disabledReason?: string | null;
  otherAgentTyping: { name: string; internal: boolean } | null;
  /** put text in the reply box (e.g. a quick answer to edit before sending) */
  prefill?: { text: string; nonce: number } | null;
}) {
  const [mode, setMode] = React.useState<"reply" | "note">("reply");
  const [text, setText] = React.useState("");
  const [files, setFiles] = React.useState<{ file: File; url: string | null }[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [rec, setRec] = React.useState<{ started: number; elapsed: number } | null>(null);
  const recorder = React.useRef<{ r: MediaRecorder; chunks: Blob[]; cancel: boolean } | null>(null);
  const area = React.useRef<HTMLTextAreaElement>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const note = mode === "note";

  React.useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setRec((r) => (r ? { ...r, elapsed: Date.now() - r.started } : r)), 250);
    return () => clearInterval(t);
  }, [rec?.started]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  React.useEffect(() => {
    if (!prefill) return;
    setMode("reply");
    setText(prefill.text);
    requestAnimationFrame(() => area.current?.focus());
  }, [prefill]);

  const add = (list: FileList | File[]) => {
    setError(null);
    const next: { file: File; url: string | null }[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`${f.name} exceeds ${MAX_MB} MB`);
        continue;
      }
      next.push({ file: f, url: /^image\/(png|jpeg|gif|webp)$/.test(f.type) ? URL.createObjectURL(f) : null });
    }
    setFiles((s) => [...s, ...next].slice(0, 10));
  };

  const submit = () => {
    if (!text.trim() && !files.length) return;
    onSend({ body: text, files: files.map((f) => f.file), isInternal: note });
    onTyping(false, note);
    setText("");
    setFiles([]);
    if (area.current) area.current.style.height = "auto";
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      const started = Date.now();
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const ctx = recorder.current;
        recorder.current = null;
        setRec(null);
        if (!ctx || ctx.cancel || !chunks.length) return;
        const type = (r.mimeType || "audio/webm").split(";")[0];
        const file = new File(chunks, `voice-message.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`, { type });
        onSend({ body: "", files: [], isInternal: note, voice: { file, durationMs: Date.now() - started } });
      };
      recorder.current = { r, chunks, cancel: false };
      r.start(250);
      setRec({ started, elapsed: 0 });
    } catch {
      setError("Microphone access is needed for voice messages.");
    }
  };
  const stopRec = (cancel: boolean) => {
    if (!recorder.current) return;
    recorder.current.cancel = cancel;
    recorder.current.r.stop();
  };

  return (
    <div className="border-t border-zinc-200 bg-white px-3 pt-2 pb-3 sm:px-4">
      <div className="mb-2 flex items-center gap-1">
        {(["reply", "note"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors",
              mode === m ? (m === "note" ? "bg-amber-100 text-amber-900" : "bg-zinc-100 text-zinc-900") : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            {m === "note" ? <Lock className="h-3.5 w-3.5" /> : <Reply className="h-3.5 w-3.5" />}
            {m === "note" ? "Internal note" : "Reply"}
          </button>
        ))}
        <span className="ml-auto truncate text-xs text-zinc-400">
          {otherAgentTyping ? `${otherAgentTyping.name} is writing ${otherAgentTyping.internal ? "a note" : "a reply"}…` : note ? "Only your team can see notes" : resolved ? "Replying will reopen this conversation" : ""}
        </span>
      </div>

      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 ring-1 ring-zinc-200 ring-inset">
          <Reply className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Replying to: {replyTo.body || "attachment"}</span>
          <button className="ml-auto" onClick={onCancelReply} aria-label="Cancel reply"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {files.map((f, i) => (
            <div key={i} className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 p-1 text-center text-[10px] text-zinc-500 ring-1 ring-zinc-200" title={f.file.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {f.url ? <img src={f.url} alt={f.file.name} className="absolute inset-0 h-full w-full object-cover" /> : f.file.name.slice(0, 20)}
              <button
                onClick={() => {
                  if (f.url) URL.revokeObjectURL(f.url);
                  setFiles((s) => s.filter((_, j) => j !== i));
                }}
                className="absolute top-1 right-1 rounded-full bg-zinc-900/75 p-0.5 text-white"
                aria-label={`Remove ${f.file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      <div
        className={cx(
          "flex items-end gap-1 rounded-xl border px-2 py-1.5 transition focus-within:ring-3",
          note ? "border-amber-300 bg-amber-50/50 focus-within:ring-amber-400/20" : "border-zinc-200 focus-within:border-brand-500 focus-within:ring-brand-500/15"
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) add(e.dataTransfer.files);
        }}
      >
        {rec ? (
          <div className="flex flex-1 items-center gap-2 px-1.5 py-1.5 text-sm text-red-600 tabular-nums" aria-live="polite">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Recording {Math.floor(rec.elapsed / 60000)}:{String(Math.floor((rec.elapsed / 1000) % 60)).padStart(2, "0")}
            <button onClick={() => stopRec(true)} className="ml-auto rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100" aria-label="Discard recording"><Trash2 className="h-4 w-4" /></button>
            <button onClick={() => stopRec(false)} className="rounded-lg bg-red-600 p-1.5 text-white hover:bg-red-700" aria-label="Stop and send"><Square className="h-4 w-4" /></button>
          </div>
        ) : (
          <>
            <textarea
              ref={area}
              rows={1}
              value={text}
              disabled={!!disabledReason}
              placeholder={disabledReason || (note ? "Add an internal note for your team…" : "Type your reply…")}
              title="Enter to send · Shift+Enter for a new line"
              aria-label={note ? "Internal note" : "Reply"}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm outline-none placeholder:text-zinc-400"
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                onTyping(e.target.value.length > 0, note);
              }}
              onBlur={() => onTyping(false, note)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              onPaste={(e) => {
                const pasted = Array.from(e.clipboardData.files);
                if (pasted.length) {
                  e.preventDefault();
                  add(pasted);
                }
              }}
            />
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => (e.target.files && add(e.target.files), (e.target.value = ""))} accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/csv,.docx,.xlsx,.pptx,.zip,audio/*" />
            <button onClick={() => fileInput.current?.click()} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Attach files" title="Attach files">
              <Paperclip className="h-4.5 w-4.5" />
            </button>
            {!text.trim() && !files.length ? (
              <button onClick={startRec} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Record voice message" title="Voice message" disabled={!!disabledReason}>
                <Mic className="h-4.5 w-4.5" />
              </button>
            ) : (
              <button onClick={submit} className={cx("rounded-lg p-2 text-white", note ? "bg-amber-500 hover:bg-amber-600" : "bg-brand-600 hover:bg-brand-700")} aria-label={note ? "Add note" : "Send reply"}>
                <Send className="h-4.5 w-4.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
