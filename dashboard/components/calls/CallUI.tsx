"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Mic, MicOff, Minimize2, MonitorUp, MonitorX, Phone, PhoneIncoming, PhoneOff, Video, VideoOff, Volume2, VolumeX, Loader2 } from "lucide-react";
import { CallController, listAudioOutputs, supportsOutputSelection } from "@roxshield/support-sdk";
import { Avatar } from "@/components/ui";
import { useSupport } from "@/lib/support";
import { cx, duration } from "@/lib/format";

/** WebAudio ringtone — no audio files to host. */
function useRingtone(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    let ctx: AudioContext | null = null;
    const ring = () => {
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const [s, e] of [[0, 0.4], [0.55, 0.95]]) {
        const g = ctx.createGain();
        g.connect(ctx.destination);
        g.gain.setValueAtTime(0, now + s);
        g.gain.linearRampToValueAtTime(0.07, now + s + 0.03);
        g.gain.setValueAtTime(0.07, now + e - 0.03);
        g.gain.linearRampToValueAtTime(0, now + e);
        for (const f of [660, 880]) {
          const o = ctx.createOscillator();
          o.frequency.value = f;
          o.connect(g);
          o.start(now + s);
          o.stop(now + e);
        }
      }
    };
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ring();
    } catch {
      /* blocked until user interaction */
    }
    const t = setInterval(ring, 2500);
    return () => {
      clearInterval(t);
      void ctx?.close();
    };
  }, [active]);
}

/** Stack of ringing calls (top-right), like a professional contact-centre app. */
export function IncomingCalls() {
  const { call, client } = useSupport();
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const ringing = call.incoming;
  useRingtone(ringing.length > 0 && call.phase !== "connected" && call.phase !== "connecting");
  if (!ringing.length) return null;

  const answer = async (callId: string, conversationId: string, video: boolean) => {
    setBusy(callId);
    setError(null);
    try {
      await client.calls.accept(callId, { video });
      router.push(`/inbox/all/${conversationId}`);
    } catch (e: any) {
      setError(e?.message || "Could not answer");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[55] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-3">
      {ringing.map((inc) => {
        const name = inc.customer?.name || "Visitor";
        return (
          <div key={inc.call.id} role="alertdialog" aria-label={`Incoming call from ${name}`} className="overflow-hidden rounded-2xl bg-zinc-950 text-white shadow-2xl ring-1 ring-white/10 animate-slide-up">
            <div className="flex items-center gap-3 px-4 pt-4">
              <span className="relative">
                <span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ring" />
                <Avatar name={name} src={inc.customer?.avatarUrl} size={44} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-emerald-400 uppercase">
                  {inc.call.media === "VIDEO" ? <Video className="h-3.5 w-3.5" /> : <PhoneIncoming className="h-3.5 w-3.5" />} Incoming {inc.call.media === "VIDEO" ? "video" : "voice"} call
                </div>
                <div className="truncate font-semibold">{name}</div>
                <div className="truncate text-xs text-zinc-400">
                  {inc.customer?.email || inc.customer?.phone || inc.customer?.externalId}
                  {inc.conversation ? ` · #${inc.conversation.number}` : ""}
                </div>
              </div>
            </div>
            {error && busy === null && <p className="px-4 pt-2 text-xs text-red-300">{error}</p>}
            <div className={cx("mt-4 grid gap-px bg-white/10", inc.call.media === "VIDEO" ? "grid-cols-3" : "grid-cols-2")}>
              <button
                className="flex items-center justify-center gap-2 bg-zinc-950 py-3 text-sm font-medium text-red-300 hover:bg-red-500/15"
                onClick={() => void client.calls.reject(inc.call.id)}
              >
                <PhoneOff className="h-4 w-4" /> Decline
              </button>
              {inc.call.media === "VIDEO" && (
                <button
                  className="flex items-center justify-center gap-2 bg-zinc-800 py-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-60"
                  disabled={busy === inc.call.id}
                  onClick={() => answer(inc.call.id, inc.call.conversationId, false)}
                  title="Answer without your camera"
                >
                  <Phone className="h-4 w-4" /> Voice
                </button>
              )}
              <button
                className="flex items-center justify-center gap-2 bg-emerald-600 py-3 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
                disabled={busy === inc.call.id}
                onClick={() => answer(inc.call.id, inc.call.conversationId, inc.call.media === "VIDEO")}
              >
                {busy === inc.call.id ? <Loader2 className="h-4 w-4 animate-spin" /> : inc.call.media === "VIDEO" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}{" "}
                {inc.call.media === "VIDEO" ? "Video" : "Answer"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Floating in-call control bar; survives navigation because it lives in the app layout. */
export function ActiveCallBar() {
  const { call, client } = useSupport();
  const router = useRouter();
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [now, setNow] = React.useState(Date.now());
  const [speakerOff, setSpeakerOff] = React.useState(false);
  const [outputs, setOutputs] = React.useState<MediaDeviceInfo[]>([]);
  const active = ["outgoing", "connecting", "connected", "reconnecting", "ended"].includes(call.phase);

  React.useEffect(() => {
    if (audioRef.current && call.remoteStream && audioRef.current.srcObject !== call.remoteStream) {
      audioRef.current.srcObject = call.remoteStream;
      void audioRef.current.play().catch(() => undefined);
    }
  }, [call.remoteStream]);
  React.useEffect(() => {
    if (call.phase !== "connected") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    if (supportsOutputSelection()) void listAudioOutputs().then(setOutputs);
    return () => clearInterval(t);
  }, [call.phase]);

  if (!active) return <audio ref={audioRef} autoPlay playsInline className="hidden" />;

  const name = call.peer?.name || call.call?.customer?.name || "Customer";
  const label =
    call.phase === "outgoing"
      ? "Ringing…"
      : call.phase === "connecting"
        ? "Connecting…"
        : call.phase === "reconnecting"
          ? "Reconnecting…"
          : call.phase === "connected"
            ? duration(call.answeredAt ? (now - call.answeredAt) / 1000 : 0)
            : call.error || (call.endStatus === "MISSED" ? "No answer" : call.endStatus === "REJECTED" ? "Declined" : "Call ended");

  return (
    <div className="fixed bottom-5 left-1/2 z-[55] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 animate-slide-up" role="region" aria-label="Active call">
      <audio ref={audioRef} autoPlay playsInline muted={speakerOff} className="hidden" />
      {call.phase !== "ended" && <VideoStage name={name} />}
      <div className="flex items-center gap-3 rounded-2xl bg-zinc-950 px-3 py-2.5 text-white shadow-2xl ring-1 ring-white/10">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => call.call && router.push(`/inbox/all/${call.call.conversationId}`)}>
          <span className="relative">
            {call.phase === "connected" && <span className="absolute -top-0.5 -right-0.5 z-10 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-zinc-950" />}
            <Avatar name={name} size={36} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className={cx("block text-xs tabular-nums", call.phase === "ended" ? "text-zinc-400" : "text-emerald-400")} aria-live="polite">
              {label}
              {call.remoteMuted && call.phase === "connected" ? " · customer muted" : ""}
              {call.remoteScreenOn ? " · sharing screen" : ""}
            </span>
          </span>
        </button>
        {call.phase !== "ended" && (
          <div className="flex items-center gap-1.5">
            {outputs.length > 1 && (
              <select aria-label="Speaker device" className="hidden h-9 max-w-36 rounded-lg bg-white/10 px-2 text-xs sm:block" onChange={(e) => void (audioRef.current as any)?.setSinkId?.(e.target.value)}>
                {outputs.map((o) => (
                  <option key={o.deviceId} value={o.deviceId} className="text-zinc-900">{o.label || "Speaker"}</option>
                ))}
              </select>
            )}
            <CallButton active={call.muted} onClick={() => client.calls.toggleMute()} label={call.muted ? "Unmute" : "Mute"}>
              {call.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </CallButton>
            {call.videoSupported && (
              <CallButton active={call.cameraOn} onClick={() => void client.calls.toggleCamera().catch(() => undefined)} label={call.cameraOn ? "Turn camera off" : "Turn camera on"}>
                {call.cameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </CallButton>
            )}
            {call.videoSupported && CallController.screenShareSupported && call.phase !== "outgoing" && (
              <CallButton active={call.screenSharing} onClick={() => void client.calls.toggleScreenShare()} label={call.screenSharing ? "Stop sharing" : "Share your screen"}>
                {call.screenSharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
              </CallButton>
            )}
            <CallButton active={speakerOff} onClick={() => setSpeakerOff((s) => !s)} label={speakerOff ? "Unmute speaker" : "Mute speaker"}>
              {speakerOff ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </CallButton>
            <button onClick={() => void client.calls.hangup()} className="flex h-9 items-center gap-1.5 rounded-xl bg-red-600 px-3 text-sm font-medium hover:bg-red-500" aria-label="End call">
              <PhoneOff className="h-4 w-4" /> End
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CallButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} aria-pressed={active} className={cx("flex h-9 w-9 items-center justify-center rounded-xl transition-colors", active ? "bg-white text-zinc-900" : "bg-white/10 hover:bg-white/20")}>
      {children}
    </button>
  );
}

/** Plays a MediaStream in a <video>; audio always comes from the call's <audio> element. */
function StreamVideo({ stream, mirror, className }: { stream: MediaStream | null; mirror?: boolean; className?: string }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) void v.play().catch(() => undefined);
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className={cx("bg-black", mirror && "-scale-x-100", className)} />;
}

/**
 * Video window above the call bar: shows the customer's screen share (or camera) big, with
 * your own camera as a small preview. Hidden when nobody has video on.
 */
function VideoStage({ name }: { name: string }) {
  const { call } = useSupport();
  const [expanded, setExpanded] = React.useState(false);
  const remoteMain = call.remoteScreenOn ? call.remoteScreen : call.remoteCameraOn ? call.remoteCamera : null;
  const remoteSide = call.remoteScreenOn && call.remoteCameraOn ? call.remoteCamera : null;
  const anyVideo = call.cameraOn || call.screenSharing || call.remoteCameraOn || call.remoteScreenOn;
  if (!anyVideo) return null;

  return (
    <div
      className={cx(
        "overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10",
        expanded ? "fixed inset-4 bottom-24 z-[56]" : "relative mb-3 aspect-video w-full"
      )}
    >
      {remoteMain ? (
        <StreamVideo stream={remoteMain} className={cx("h-full w-full", call.remoteScreenOn ? "object-contain" : "object-cover")} />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-zinc-400">
          <Avatar name={name} size={64} />
          <span className="text-sm">{call.phase === "outgoing" ? "Ringing…" : `${name}'s camera is off`}</span>
        </div>
      )}
      {remoteSide && <StreamVideo stream={remoteSide} className="absolute top-3 left-3 h-24 w-36 rounded-xl object-cover ring-1 ring-white/20" />}
      {call.cameraOn && call.cameraStream && (
        <StreamVideo stream={call.cameraStream} mirror className="absolute right-3 bottom-3 h-24 w-36 rounded-xl object-cover ring-1 ring-white/20 sm:h-28 sm:w-44" />
      )}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {call.screenSharing && (
          <span className="flex items-center gap-1.5 rounded-lg bg-emerald-600/90 px-2 py-1 text-xs font-medium text-white">
            <MonitorUp className="h-3.5 w-3.5" /> You are sharing your screen
          </span>
        )}
        {call.remoteScreenOn && (
          <span className="rounded-lg bg-black/60 px-2 py-1 text-xs font-medium text-white">{name}&apos;s screen</span>
        )}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80"
          aria-label={expanded ? "Shrink video" : "Enlarge video"}
          title={expanded ? "Shrink" : "Enlarge"}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
