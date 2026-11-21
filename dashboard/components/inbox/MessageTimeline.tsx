"use client";

import * as React from "react";
import { AlertCircle, Check, CheckCheck, Clock3, Download, FileText, Lock, Phone, PhoneMissed, Reply, X, Zap } from "lucide-react";
import type { Message } from "@roxshield/support-sdk";
import { Avatar } from "@/components/ui";
import { bytes, cx, dayLabel, timeOf } from "@/lib/format";

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(\bhttps?:\/\/[^\s<>"']+)/gi);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//i.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
            {p}
          </a>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}

function Receipt({ m }: { m: Message }) {
  if (m.failed) return <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-label="Failed" />;
  if (m.pending) return <Clock3 className="h-3 w-3" aria-label="Sending" />;
  if (m.isInternal) return null;
  if (m.status === "READ") return <CheckCheck className="h-3.5 w-3.5 text-brand-600" aria-label="Seen by customer" />;
  if (m.status === "DELIVERED") return <CheckCheck className="h-3.5 w-3.5" aria-label="Delivered" />;
  return <Check className="h-3.5 w-3.5" aria-label="Sent" />;
}

function AttachmentView({ m, onImage }: { m: Message; onImage: (url: string) => void }) {
  const images = m.attachments.filter((a) => a.kind === "IMAGE");
  const previews = m.pending || m.failed ? m.localPreviews ?? [] : [];
  return (
    <div className="space-y-1.5">
      {(images.length > 0 || previews.some((p) => p.kind === "IMAGE")) && (
        <div className={cx("grid gap-1.5", images.length + previews.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {images.map((a) => (
            <button key={a.id} onClick={() => onImage(a.url)} className="block overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-200" aria-label={`Open ${a.fileName}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.fileName} loading="lazy" className="max-h-64 w-full object-cover" width={a.width ?? undefined} height={a.height ?? undefined} />
            </button>
          ))}
          {previews.filter((p) => p.kind === "IMAGE").map((p, i) => (
            <div key={i} className="relative overflow-hidden rounded-xl bg-zinc-100 opacity-70">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.name} className="max-h-64 w-full object-cover" />
              {m.pending && <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded bg-white/60"><div className="h-full bg-brand-600 transition-all" style={{ width: `${(p.progress ?? 0) * 100}%` }} /></div>}
            </div>
          ))}
        </div>
      )}
      {m.attachments.filter((a) => a.kind === "AUDIO").map((a) => (
        <audio key={a.id} controls preload="metadata" src={a.url} className="h-10 w-64 max-w-full" />
      ))}
      {m.attachments.filter((a) => a.kind === "FILE").map((a) => (
        <a key={a.id} href={a.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex max-w-72 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-800 hover:bg-zinc-50">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><FileText className="h-4.5 w-4.5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{a.fileName}</span>
            <span className="text-xs text-zinc-500">{bytes(a.sizeBytes)}</span>
          </span>
          <Download className="h-4 w-4 text-zinc-400" />
        </a>
      ))}
      {previews.filter((p) => p.kind !== "IMAGE").map((p, i) => (
        <div key={i} className="max-w-72 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-500 opacity-80">
          {p.kind === "AUDIO" ? "Voice message" : p.name}
          {m.pending && <div className="mt-1.5 h-1 overflow-hidden rounded bg-zinc-100"><div className="h-full bg-brand-600" style={{ width: `${(p.progress ?? 0) * 100}%` }} /></div>}
        </div>
      ))}
    </div>
  );
}

export function MessageTimeline({
  messages,
  meId,
  customerName,
  customerTyping,
  hasMore,
  onLoadOlder,
  onReply,
  onDiscard,
}: {
  messages: Message[];
  meId?: string;
  customerName: string;
  customerTyping: boolean;
  hasMore: boolean;
  onLoadOlder: () => Promise<void>;
  onReply: (m: Message) => void;
  onDiscard: (m: Message) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const stick = React.useRef(true);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const lastId = messages[messages.length - 1]?.id;

  React.useLayoutEffect(() => {
    if (ref.current && stick.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lastId, customerTyping, messages.length]);

  // images and attachments change the height after render — stay pinned to the newest message
  React.useEffect(() => {
    const el = ref.current;
    const inner = el?.firstElementChild;
    if (!el || !inner || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const older = async () => {
    const el = ref.current;
    if (!el || loadingOlder) return;
    const before = el.scrollHeight;
    setLoadingOlder(true);
    await onLoadOlder().finally(() => setLoadingOlder(false));
    requestAnimationFrame(() => ref.current && (ref.current.scrollTop = ref.current.scrollHeight - before));
  };

  let lastDay = "";
  return (
    <div
      ref={ref}
      className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60 px-4 py-4 scroll-thin sm:px-6"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (el.scrollTop < 60 && hasMore) void older();
      }}
      role="log"
      aria-live="polite"
    >
      <div>
      {hasMore && (
        <div className="mb-4 text-center">
          <button onClick={older} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50">
            {loadingOlder ? "Loading…" : "Load earlier messages"}
          </button>
        </div>
      )}
      {messages.map((m, i) => {
        const day = dayLabel(m.createdAt);
        const showDay = day !== lastDay;
        lastDay = day;
        const dayNode = showDay ? (
          <div className="my-5 flex items-center gap-3 text-[11px] font-medium text-zinc-400">
            <div className="h-px flex-1 bg-zinc-200" />
            {day}
            <div className="h-px flex-1 bg-zinc-200" />
          </div>
        ) : null;

        if (m.type === "CALL") {
          const missed = ["MISSED", "REJECTED", "FAILED"].includes(m.metadata?.status);
          return (
            <React.Fragment key={m.id}>
              {dayNode}
              <div className="my-3 flex justify-center">
                <span className={cx("inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium ring-1", missed ? "text-red-600 ring-red-200" : "text-zinc-700 ring-zinc-200")}>
                  {missed ? <PhoneMissed className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                  {m.body} · {timeOf(m.createdAt)}
                </span>
              </div>
            </React.Fragment>
          );
        }
        if (m.senderType === "SYSTEM") {
          return (
            <React.Fragment key={m.id}>
              {dayNode}
              <div className="my-2.5 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-500">
                {m.isInternal && <Lock className="h-3 w-3 text-zinc-400" aria-label="Visible to agents only" />}
                <span>{m.body}</span>
                <span className="text-zinc-300">·</span>
                <span className="text-zinc-400">{timeOf(m.createdAt)}</span>
                {m.metadata?.note && <span className="text-zinc-400">— “{m.metadata.note}”</span>}
              </div>
            </React.Fragment>
          );
        }

        const fromCustomer = m.senderType === "CUSTOMER";
        const note = m.isInternal;
        const bot = !!m.metadata?.bot;
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const sameAuthor = (a?: Message) => a && a.senderType === m.senderType && a.agent?.id === m.agent?.id && a.type !== "SYSTEM" && a.type !== "CALL" && !!a.isInternal === !!note;
        const grouped = sameAuthor(prev) && !showDay;
        const lastInGroup = !sameAuthor(next);
        const authorName = fromCustomer ? customerName : m.agent?.id === meId ? "You" : m.agent?.name || "Agent";

        return (
          <React.Fragment key={m.id}>
            {dayNode}
            <div className={cx("group flex gap-2.5", fromCustomer ? "justify-start" : "justify-end", grouped ? "mt-1" : "mt-4")}>
              {fromCustomer && <div className="w-8 shrink-0">{lastInGroup && <Avatar name={customerName} size={30} />}</div>}
              <div className={cx("flex max-w-[min(36rem,80%)] flex-col", fromCustomer ? "items-start" : "items-end")}>
                {!grouped && (
                  <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-zinc-500">
                    {note && <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><Lock className="h-3 w-3" />Internal note ·</span>}
                    {bot && <Zap className="h-3 w-3 text-violet-600" />}
                    <span className="font-medium text-zinc-600">{authorName}</span>
                    {bot && <span className="text-violet-700">· automatic reply</span>}
                  </div>
                )}
                <div className="flex items-end gap-1.5">
                  {!fromCustomer && !m.pending && (
                    <button onClick={() => onReply(m)} className="mb-1 rounded-md p-1 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-200/60 hover:text-zinc-700 focus:opacity-100" aria-label="Reply to message">
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <div className="space-y-1.5">
                    <AttachmentView m={m} onImage={setLightbox} />
                    {(m.body || m.replyTo) && (
                      <div
                        dir="auto"
                        className={cx(
                          "rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
                          m.failed
                            ? "bg-red-50 text-red-800 ring-1 ring-red-200"
                            : note
                              ? "bg-amber-50 text-amber-950 ring-1 ring-amber-200"
                              : fromCustomer
                                ? "bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200"
                                : bot
                                  ? "bg-violet-600 text-white"
                                  : "bg-brand-600 text-white",
                          fromCustomer ? "rounded-bl-md" : "rounded-br-md",
                          m.pending && "opacity-70"
                        )}
                      >
                        {m.replyTo && (
                          <div className={cx("mb-1.5 border-l-2 pl-2 text-xs opacity-80", fromCustomer || note ? "border-zinc-300" : "border-white/60")}>
                            {m.replyTo.body || "Attachment"}
                          </div>
                        )}
                        {m.body && <Linkified text={m.body} />}
                      </div>
                    )}
                  </div>
                  {fromCustomer && (
                    <button onClick={() => onReply(m)} className="mb-1 rounded-md p-1 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-200/60 hover:text-zinc-700 focus:opacity-100" aria-label="Reply to message">
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {(lastInGroup || m.failed) && (
                  <div className="mt-1 flex items-center gap-1 px-1 text-[11px] text-zinc-400">
                    {m.failed ? (
                      <>
                        <span className="text-red-600">{(m.metadata as any)?.error || "Failed to send"}</span>
                        <button onClick={() => onDiscard(m)} className="ml-1 inline-flex items-center gap-0.5 text-zinc-500 hover:text-zinc-800"><X className="h-3 w-3" />Dismiss</button>
                      </>
                    ) : (
                      <>
                        <span>{timeOf(m.createdAt)}</span>
                        {!fromCustomer && <Receipt m={m} />}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}
      {customerTyping && (
        <div className="mt-4 flex items-end gap-2.5" aria-label={`${customerName} is typing`}>
          <Avatar name={customerName} size={30} />
          <div className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-3.5 py-3 shadow-xs ring-1 ring-zinc-200">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}
      </div>
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/85 p-6 animate-fade-in" onClick={() => setLightbox(null)} role="dialog" aria-label="Image preview">
          <button className="absolute top-4 right-4 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close"><X className="h-5 w-5" /></button>
          <a href={lightbox} target="_blank" rel="noopener noreferrer" className="absolute top-4 right-16 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Open original" onClick={(e) => e.stopPropagation()}><Download className="h-5 w-5" /></a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
