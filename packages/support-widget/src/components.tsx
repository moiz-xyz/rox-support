import * as React from "react";
import type { CallSnapshot, Message } from "@roxshield/support-sdk";
import { listAudioOutputs, supportsOutputSelection } from "@roxshield/support-sdk";
import * as I from "./icons";
import { createTone, formatBytes, formatDay, formatDuration, formatTime, initials, linkify, pickRecorderMime, uid } from "./utils";
import type { StagedFile } from "./useSupportChat";

// ───────────────────────── message list ─────────────────────────

function Ticks({ m }: { m: Message }) {
  if (m.failed) return <I.IconAlert width={13} height={13} style={{ color: "var(--rxs-danger)" }} />;
  if (m.pending) return <I.IconClock width={12} height={12} />;
  const label = m.status === "READ" ? "Seen" : m.status === "DELIVERED" ? "Delivered" : "Sent";
  return (
    <span className={`rxs-ticks ${m.status === "READ" ? "rxs-read" : ""}`} title={label} aria-label={label}>
      {m.status === "SENT" ? <I.IconCheck /> : <I.IconCheckCheck />}
    </span>
  );
}

function Text({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((part, i) =>
        typeof part === "string" ? (
          <React.Fragment key={i}>{part}</React.Fragment>
        ) : (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow">
            {part.label}
          </a>
        )
      )}
    </>
  );
}

function Attachments({ m, onImage }: { m: Message; onImage: (url: string) => void }) {
  const images = m.attachments.filter((a) => a.kind === "IMAGE");
  const audio = m.attachments.filter((a) => a.kind === "AUDIO");
  const files = m.attachments.filter((a) => a.kind === "FILE");
  const previews = m.pending || m.failed ? m.localPreviews ?? [] : [];
  return (
    <>
      {(images.length > 0 || previews.some((p) => p.kind === "IMAGE")) && (
        <div className={`rxs-images ${images.length + previews.length === 1 ? "rxs-single" : ""}`}>
          {images.map((a) => (
            <button key={a.id} className="rxs-img" onClick={() => onImage(a.url)} aria-label={`Open image ${a.fileName}`}>
              <img src={a.url} alt={a.fileName} loading="lazy" width={a.width ?? undefined} height={a.height ?? undefined} />
            </button>
          ))}
          {previews
            .filter((p) => p.kind === "IMAGE")
            .map((p, i) => (
              <div key={i} className="rxs-img" style={{ opacity: 0.7 }}>
                <img src={p.url} alt={p.name} />
                {m.pending && <div className="rxs-progress"><div style={{ width: `${Math.round((p.progress ?? 0) * 100)}%` }} /></div>}
              </div>
            ))}
        </div>
      )}
      {audio.map((a) => (
        <audio key={a.id} className="rxs-audio" controls preload="metadata" src={a.url} />
      ))}
      {files.map((a) => (
        <a key={a.id} className="rxs-file" href={a.downloadUrl} target="_blank" rel="noopener noreferrer">
          <span className="rxs-file-icon"><I.IconFile /></span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <div className="rxs-file-name">{a.fileName}</div>
            <div className="rxs-file-size">{formatBytes(a.sizeBytes)}</div>
          </span>
          <I.IconDownload width={16} height={16} />
        </a>
      ))}
      {previews
        .filter((p) => p.kind !== "IMAGE")
        .map((p, i) => (
          <div key={i} className="rxs-file" style={{ opacity: 0.7 }}>
            <span className="rxs-file-icon">{p.kind === "AUDIO" ? <I.IconMic /> : <I.IconFile />}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <div className="rxs-file-name">{p.kind === "AUDIO" ? "Voice message" : p.name}</div>
              {m.pending && <div className="rxs-progress"><div style={{ width: `${Math.round((p.progress ?? 0) * 100)}%` }} /></div>}
            </span>
          </div>
        ))}
    </>
  );
}

function CallEntry({ m }: { m: Message }) {
  const status = m.metadata?.status;
  const missed = status === "MISSED" || status === "REJECTED" || status === "FAILED";
  return (
    <div className="rxs-system">
      <span className={`rxs-call-pill ${missed ? "rxs-missed" : ""}`}>
        {missed ? <I.IconPhoneOff /> : <I.IconPhone />}
        {m.body} · {formatTime(m.createdAt)}
      </span>
    </div>
  );
}

export function MessageList(props: {
  messages: Message[];
  typing: { name: string } | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onReply: (m: Message) => void;
  onRetry: (m: Message) => void;
  onDiscard: (m: Message) => void;
  header: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const stick = React.useRef(true);
  const lastId = props.messages[props.messages.length - 1]?.id;

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastId, props.typing, props.messages.length]);

  // images load after render and change the height — stay pinned to the newest message
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

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 40 && props.hasMore && !props.loadingMore) {
      const before = el.scrollHeight;
      props.onLoadMore();
      requestAnimationFrame(() => {
        if (ref.current) ref.current.scrollTop = ref.current.scrollHeight - before;
      });
    }
  };

  let lastDay = "";
  return (
    <div className="rxs-body" ref={ref} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions">
      <div>
      {props.hasMore && (
        <button className="rxs-load-more" onClick={props.onLoadMore} disabled={props.loadingMore}>
          {props.loadingMore ? "Loading…" : "Load earlier messages"}
        </button>
      )}
      {props.header}
      {props.messages.map((m, i) => {
        const day = formatDay(m.createdAt);
        const dayNode = day !== lastDay ? <div className="rxs-day">{day}</div> : null;
        lastDay = day;
        if (m.type === "CALL") return <React.Fragment key={m.id}>{dayNode}<CallEntry m={m} /></React.Fragment>;
        if (m.senderType === "SYSTEM") {
          return (
            <React.Fragment key={m.id}>
              {dayNode}
              <div className="rxs-system">{m.body}</div>
            </React.Fragment>
          );
        }
        const mine = m.senderType === "CUSTOMER";
        const prev = props.messages[i - 1];
        const next = props.messages[i + 1];
        const groupedWithPrev = prev && prev.senderType === m.senderType && prev.agent?.id === m.agent?.id && prev.type !== "SYSTEM" && prev.type !== "CALL" && !dayNode;
        const lastOfGroup = !next || next.senderType !== m.senderType || next.agent?.id !== m.agent?.id || next.type === "SYSTEM";
        return (
          <React.Fragment key={m.id}>
            {dayNode}
            <div className={`rxs-row ${mine ? "rxs-mine" : ""} ${groupedWithPrev ? "" : "rxs-gap"}`}>
              {!mine && (
                <div className={`rxs-avatar ${lastOfGroup ? "" : "rxs-ghost"}`} aria-hidden="true">
                  {m.agent?.avatarUrl ? <img src={m.agent.avatarUrl} alt="" /> : initials(m.agent?.name)}
                </div>
              )}
              <div className="rxs-bubble-wrap">
                {!mine && !groupedWithPrev && m.agent && <div className="rxs-sender">{m.agent.name}</div>}
                <Attachments m={m} onImage={setLightbox} />
                {(m.body || m.replyTo) && (
                  <div className={`rxs-bubble ${m.failed ? "rxs-failed" : ""}`} onDoubleClick={() => !m.pending && props.onReply(m)}>
                    {m.replyTo && <div className="rxs-reply-quote">{m.replyTo.body || "Attachment"}</div>}
                    {m.body && <Text text={m.body} />}
                  </div>
                )}
                {lastOfGroup || m.failed ? (
                  <div className="rxs-meta">
                    {m.failed ? (
                      <>
                        <span>Not sent.</span>
                        <button onClick={() => props.onRetry(m)} style={{ color: "var(--rxs-primary)", fontWeight: 600 }}>Retry</button>
                        <button onClick={() => props.onDiscard(m)}>Discard</button>
                      </>
                    ) : (
                      <>
                        <span>{formatTime(m.createdAt)}</span>
                        {mine && <Ticks m={m} />}
                        {!m.pending && (
                          <button onClick={() => props.onReply(m)} aria-label="Reply" title="Reply" style={{ display: "inline-flex" }}>
                            <I.IconReply width={13} height={13} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </React.Fragment>
        );
      })}
      {props.typing && (
        <div className="rxs-row rxs-gap" aria-label={`${props.typing.name} is typing`}>
          <div className="rxs-avatar">{initials(props.typing.name)}</div>
          <div className="rxs-typing"><span /><span /><span /></div>
        </div>
      )}
      {props.footer}
      </div>
      {lightbox && (
        <div className="rxs-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Image preview">
          <button className="rxs-icon-btn" aria-label="Close preview"><I.IconClose /></button>
          <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ───────────────────────── composer ─────────────────────────

export function Composer(props: {
  disabled: boolean;
  placeholder: string;
  allowFiles: boolean;
  allowVoice: boolean;
  maxUploadMb: number;
  replyTo: Message | null;
  onCancelReply: () => void;
  onSend: (input: { body: string; files: StagedFile[]; voice?: boolean }) => void;
  onTyping: () => void;
}) {
  const [text, setText] = React.useState("");
  const [staged, setStaged] = React.useState<StagedFile[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [recording, setRecording] = React.useState<{ startedAt: number; elapsed: number } | null>(null);
  const recorder = React.useRef<{ rec: MediaRecorder; chunks: Blob[]; stream: MediaStream; cancelled: boolean } | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const textarea = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecording((r) => (r ? { ...r, elapsed: Date.now() - r.startedAt } : r)), 250);
    return () => clearInterval(t);
  }, [recording?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => () => staged.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (files: FileList | File[]) => {
    setError(null);
    const next: StagedFile[] = [];
    for (const file of Array.from(files)) {
      if (file.size > props.maxUploadMb * 1024 * 1024) {
        setError(`${file.name} is larger than ${props.maxUploadMb} MB`);
        continue;
      }
      if (file.type === "image/svg+xml") {
        setError("SVG images are not supported");
        continue;
      }
      const isImage = /^image\/(png|jpeg|gif|webp)$/.test(file.type);
      next.push({ id: uid(), file, previewUrl: isImage ? URL.createObjectURL(file) : null, kind: isImage ? "IMAGE" : "FILE" });
    }
    setStaged((s) => [...s, ...next].slice(0, 10));
  };

  const submit = () => {
    if (props.disabled || (!text.trim() && !staged.length)) return;
    props.onSend({ body: text, files: staged });
    setText("");
    setStaged([]);
    setError(null);
    textarea.current?.focus();
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const startedAt = Date.now();
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const ctx = recorder.current;
        recorder.current = null;
        setRecording(null);
        if (!ctx || ctx.cancelled || !chunks.length) return;
        const type = (rec.mimeType || "audio/webm").split(";")[0];
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File(chunks, `voice-message.${ext}`, { type });
        props.onSend({ body: "", files: [{ id: uid(), file, previewUrl: null, kind: "AUDIO", durationMs: Date.now() - startedAt }], voice: true });
      };
      recorder.current = { rec, chunks, stream, cancelled: false };
      rec.start(250);
      setRecording({ startedAt, elapsed: 0 });
    } catch {
      setError("Microphone access is needed to record a voice message.");
    }
  };

  const stopRecording = (cancel = false) => {
    if (!recorder.current) return;
    recorder.current.cancelled = cancel;
    recorder.current.rec.stop();
  };

  return (
    <div
      className="rxs-composer"
      onDragOver={(e) => props.allowFiles && e.preventDefault()}
      onDrop={(e) => {
        if (!props.allowFiles) return;
        e.preventDefault();
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {props.replyTo && (
        <div className="rxs-reply-bar">
          <I.IconReply width={14} height={14} />
          <span>{props.replyTo.body || "Attachment"}</span>
          <button onClick={props.onCancelReply} aria-label="Cancel reply"><I.IconClose width={14} height={14} /></button>
        </div>
      )}
      {staged.length > 0 && (
        <div className="rxs-staged" aria-label="Attachments to send">
          {staged.map((s) => (
            <div key={s.id} className="rxs-chip" title={s.file.name}>
              {s.previewUrl ? <img src={s.previewUrl} alt={s.file.name} /> : <span>{s.file.name.slice(0, 18)}</span>}
              <button
                className="rxs-chip-x"
                aria-label={`Remove ${s.file.name}`}
                onClick={() => {
                  if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
                  setStaged((x) => x.filter((y) => y.id !== s.id));
                }}
              >
                <I.IconClose />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <div className="rxs-banner rxs-error" style={{ borderRadius: 8, marginBottom: 8 }}>{error}</div>}
      <div className="rxs-input-row">
        {recording ? (
          <>
            <div className="rxs-recording" aria-live="polite">
              <span className="rxs-rec-dot" /> Recording {formatDuration(recording.elapsed / 1000)}
            </div>
            <button className="rxs-tool" onClick={() => stopRecording(true)} aria-label="Cancel recording" title="Cancel"><I.IconTrash /></button>
            <button className="rxs-tool rxs-send" onClick={() => stopRecording(false)} aria-label="Send voice message" title="Send"><I.IconSend /></button>
          </>
        ) : (
          <>
            <textarea
              ref={textarea}
              className="rxs-textarea"
              rows={1}
              value={text}
              placeholder={props.placeholder}
              aria-label="Message"
              disabled={props.disabled}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                props.onTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              onPaste={(e) => {
                if (!props.allowFiles) return;
                const files = Array.from(e.clipboardData.files);
                if (files.length) {
                  e.preventDefault();
                  addFiles(files); // pasted screenshots
                }
              }}
            />
            {props.allowFiles && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  hidden
                  accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/csv,.docx,.xlsx,.pptx,.zip"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button className="rxs-tool" onClick={() => fileInput.current?.click()} aria-label="Attach a file" title="Attach a file or image" disabled={props.disabled}>
                  <I.IconPaperclip />
                </button>
              </>
            )}
            {props.allowVoice && !text.trim() && !staged.length && typeof MediaRecorder !== "undefined" ? (
              <button className="rxs-tool" onClick={startRecording} aria-label="Record a voice message" title="Voice message" disabled={props.disabled}>
                <I.IconMic />
              </button>
            ) : (
              <button className="rxs-tool rxs-send" onClick={submit} aria-label="Send" title="Send" disabled={props.disabled || (!text.trim() && !staged.length)}>
                <I.IconSend />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── call overlay ─────────────────────────

function StreamVideo(props: { stream: MediaStream | null; className?: string }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== props.stream) v.srcObject = props.stream;
    if (props.stream) void v.play().catch(() => undefined);
  }, [props.stream]);
  // audio always plays through the call's <audio> element
  return <video ref={ref} autoPlay playsInline muted className={props.className} />;
}

export function CallOverlay(props: {
  call: CallSnapshot;
  brandName: string;
  logoUrl: string | null;
  onAccept: (callId: string, video: boolean) => void;
  onReject: (callId: string) => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onSwitchCamera: () => void;
  screenShareSupported: boolean;
}) {
  const { call } = props;
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [now, setNow] = React.useState(Date.now());
  const [speakerOff, setSpeakerOff] = React.useState(false);
  const [outputs, setOutputs] = React.useState<MediaDeviceInfo[]>([]);
  const incoming = call.phase === "incoming" ? call.incoming[0] : null;

  React.useEffect(() => {
    if (audioRef.current && call.remoteStream && audioRef.current.srcObject !== call.remoteStream) {
      audioRef.current.srcObject = call.remoteStream;
      void audioRef.current.play().catch(() => undefined);
    }
  }, [call.remoteStream]);

  React.useEffect(() => {
    if (call.phase !== "connected" && call.phase !== "reconnecting") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    if (supportsOutputSelection()) void listAudioOutputs().then(setOutputs);
    return () => clearInterval(t);
  }, [call.phase]);

  React.useEffect(() => {
    if (call.phase !== "outgoing" && call.phase !== "incoming") return;
    const tone = createTone(call.phase === "outgoing" ? "outgoing" : "incoming");
    tone.start();
    return () => tone.stop();
  }, [call.phase]);

  if (call.phase === "idle") return null;

  const name = incoming?.call.agent?.name || call.peer?.name || props.brandName;
  const avatar = incoming?.call.agent?.avatarUrl || call.peer?.avatarUrl || props.logoUrl;
  const elapsed = call.answeredAt ? (now - call.answeredAt) / 1000 : 0;
  const isVideoCall = (incoming?.call.media ?? call.call?.media) === "VIDEO";
  const stateText =
    call.phase === "incoming"
      ? isVideoCall
        ? "Incoming video call…"
        : "is calling you…"
      : call.phase === "outgoing"
        ? "Calling support…"
        : call.phase === "connecting"
          ? "Connecting…"
          : call.phase === "reconnecting"
            ? "Reconnecting…"
            : call.phase === "connected"
              ? formatDuration(elapsed)
              : endedText(call);

  const remoteMain = call.remoteScreenOn ? call.remoteScreen : call.remoteCameraOn ? call.remoteCamera : null;
  const live = call.phase !== "incoming" && call.phase !== "ended";
  const showStage = live && (!!remoteMain || call.cameraOn);

  return (
    <div
      className={`rxs-call ${call.phase === "outgoing" || call.phase === "incoming" ? "rxs-ringing" : ""} ${showStage ? "rxs-has-video" : ""}`}
      role="dialog"
      aria-label={isVideoCall ? "Video call" : "Voice call"}
    >
      <audio ref={audioRef} autoPlay playsInline muted={speakerOff} />

      {showStage && (
        <>
          <div className="rxs-call-stage">
            {remoteMain ? (
              <StreamVideo stream={remoteMain} className={call.remoteScreenOn ? "rxs-contain" : ""} />
            ) : (
              // only my camera is on → show it full size until the other side turns theirs on
              <StreamVideo stream={call.cameraStream} />
            )}
          </div>
          {remoteMain && call.cameraOn && (
            <div className="rxs-call-pip">
              <StreamVideo stream={call.cameraStream} />
            </div>
          )}
          <div className="rxs-call-topbar">
            <b>{name}</b>
            {stateText}
            {call.remoteScreenOn ? " · sharing screen" : ""}
            {call.remoteMuted && call.phase === "connected" ? " · muted" : ""}
          </div>
          {call.screenSharing && <div className="rxs-sharing-pill">You are sharing your screen</div>}
        </>
      )}

      <div className="rxs-call-who">
        <div className="rxs-call-avatar">{avatar ? <img src={avatar} alt="" /> : initials(name)}</div>
        <div className="rxs-call-name">{name}</div>
        <div className="rxs-call-state" aria-live="polite">{stateText}</div>
        {call.remoteMuted && call.phase === "connected" && <div className="rxs-call-label" style={{ marginTop: 8 }}>{name} muted their microphone</div>}
        {call.screenSharing && <div className="rxs-call-label" style={{ marginTop: 8 }}>You are sharing your screen</div>}
      </div>

      {call.error && <div className="rxs-call-err" style={{ position: "relative", zIndex: 2 }}>{call.error}</div>}

      {call.phase === "incoming" && incoming ? (
        <div className="rxs-call-controls" style={{ gap: isVideoCall ? 28 : 48 }}>
          <div>
            <button className="rxs-call-btn rxs-hangup" onClick={() => props.onReject(incoming.call.id)} aria-label="Decline"><I.IconPhoneOff /></button>
            <div className="rxs-call-label">Decline</div>
          </div>
          {isVideoCall && (
            <div>
              <button className="rxs-call-btn" style={{ width: 64, height: 64 }} onClick={() => props.onAccept(incoming.call.id, false)} aria-label="Answer with voice only"><I.IconPhone /></button>
              <div className="rxs-call-label">Voice</div>
            </div>
          )}
          <div>
            <button className="rxs-call-btn rxs-answer" onClick={() => props.onAccept(incoming.call.id, isVideoCall)} aria-label={isVideoCall ? "Answer with video" : "Answer"}>
              {isVideoCall ? <I.IconVideo /> : <I.IconPhone />}
            </button>
            <div className="rxs-call-label">{isVideoCall ? "Video" : "Answer"}</div>
          </div>
        </div>
      ) : call.phase === "ended" ? (
        <div className="rxs-call-label" style={{ fontSize: 13 }}>Returning to chat…</div>
      ) : (
        <div className="rxs-call-bottom" style={{ display: "grid", gap: 16, justifyItems: "center" }}>
          {outputs.length > 1 && !showStage && (
            <select className="rxs-select" aria-label="Speaker" onChange={(e) => void (audioRef.current as any)?.setSinkId?.(e.target.value)}>
              {outputs.map((o) => (
                <option key={o.deviceId} value={o.deviceId}>{o.label || "Speaker"}</option>
              ))}
            </select>
          )}
          <div className="rxs-call-controls rxs-compact">
            <div>
              <button className={`rxs-call-btn ${call.muted ? "rxs-active" : ""}`} onClick={props.onToggleMute} aria-pressed={call.muted} aria-label={call.muted ? "Unmute" : "Mute"}>
                {call.muted ? <I.IconMicOff /> : <I.IconMic />}
              </button>
              <div className="rxs-call-label">{call.muted ? "Unmute" : "Mute"}</div>
            </div>
            {call.videoSupported && (
              <div>
                <button className={`rxs-call-btn ${call.cameraOn ? "rxs-active" : ""}`} onClick={props.onToggleCamera} aria-pressed={call.cameraOn} aria-label={call.cameraOn ? "Turn camera off" : "Turn camera on"}>
                  {call.cameraOn ? <I.IconVideo /> : <I.IconVideoOff />}
                </button>
                <div className="rxs-call-label">Camera</div>
              </div>
            )}
            {call.cameraOn && (
              <div>
                <button className="rxs-call-btn" onClick={props.onSwitchCamera} aria-label="Switch camera"><I.IconFlip /></button>
                <div className="rxs-call-label">Flip</div>
              </div>
            )}
            {call.videoSupported && props.screenShareSupported && call.phase !== "outgoing" && (
              <div>
                <button className={`rxs-call-btn ${call.screenSharing ? "rxs-active" : ""}`} onClick={props.onToggleScreen} aria-pressed={call.screenSharing} aria-label={call.screenSharing ? "Stop sharing" : "Share screen"}>
                  {call.screenSharing ? <I.IconScreenOff /> : <I.IconScreenShare />}
                </button>
                <div className="rxs-call-label">{call.screenSharing ? "Stop" : "Share"}</div>
              </div>
            )}
            <div>
              <button className={`rxs-call-btn ${speakerOff ? "rxs-active" : ""}`} onClick={() => setSpeakerOff((s) => !s)} aria-pressed={speakerOff} aria-label={speakerOff ? "Speaker on" : "Speaker off"}>
                {speakerOff ? <I.IconVolumeOff /> : <I.IconVolume />}
              </button>
              <div className="rxs-call-label">Speaker</div>
            </div>
            <div>
              <button className="rxs-call-btn rxs-hangup" onClick={props.onHangup} aria-label="End call"><I.IconPhoneOff /></button>
              <div className="rxs-call-label">End</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function endedText(call: CallSnapshot) {
  if (call.error) return "Call failed";
  switch (call.endStatus) {
    case "MISSED":
      return call.endReason === "no_agents_available" ? "No agents are available right now" : "No answer";
    case "REJECTED":
      return "Call declined";
    case "CANCELLED":
      return "Call cancelled";
    case "FAILED":
      return "Call failed";
    default:
      return call.call?.durationSec ? `Call ended · ${formatDuration(call.call.durationSec)}` : "Call ended";
  }
}
