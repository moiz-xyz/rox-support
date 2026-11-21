export function initials(name?: string | null) {
  const parts = (name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Split text into plain strings and safe links (rendered as React nodes, never as HTML). */
export function linkify(text: string): (string | { href: string; label: string })[] {
  const out: (string | { href: string; label: string })[] = [];
  const re = /\bhttps?:\/\/[^\s<>"']+/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const href = m[0].replace(/[.,;:!?)]+$/, "");
    out.push({ href, label: href });
    last = m.index + href.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** Contrast colour for text on the brand colour. */
export function contrastOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#111827" : "#ffffff";
}

/**
 * Ringback / ringtone generated with WebAudio — no audio assets to host.
 * "outgoing" = classic ringback, "incoming" = brighter double ring.
 */
export function createTone(kind: "outgoing" | "incoming") {
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const play = () => {
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = kind === "outgoing" ? [440, 480] : [660, 880];
    const bursts = kind === "outgoing" ? [[0, 1.6]] : [[0, 0.35], [0.5, 0.85]];
    for (const [start, end] of bursts) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.06, now + start + 0.03);
      gain.gain.setValueAtTime(0.06, now + end - 0.03);
      gain.gain.linearRampToValueAtTime(0, now + end);
      gain.connect(ctx.destination);
      for (const f of freqs) {
        const osc = ctx.createOscillator();
        osc.frequency.value = f;
        osc.connect(gain);
        osc.start(now + start);
        osc.stop(now + end);
      }
    }
  };
  return {
    start() {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        ctx = new AC();
        play();
        timer = setInterval(play, kind === "outgoing" ? 4000 : 2500);
      } catch {
        /* autoplay policies may block audio — the UI still shows the call */
      }
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      void ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}

export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}
