import { Emitter } from "./emitter";
import { SupportEvents } from "./events";
import type { RealtimeConnection } from "./realtime";
import type { Call, CallMedia, IceConfig, IncomingCallPayload } from "./types";

export type SignalData =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "candidate"; candidate: RTCIceCandidateInit }
  | { type: "renegotiate" };

export type PeerState = "new" | "connecting" | "connected" | "reconnecting" | "failed" | "closed";

type PeerEvents = {
  state: (s: PeerState) => void;
  remoteStream: (s: MediaStream) => void;
  remoteCamera: (s: MediaStream) => void;
  remoteScreen: (s: MediaStream) => void;
};

/**
 * One WebRTC peer connection. Media goes peer-to-peer (or via TURN); Socket.IO only carries the
 * SDP/ICE signaling. Roles are deterministic — the call initiator is always the offerer — so no
 * glare handling is needed.
 *
 * Media layout (same on web and Android): every call negotiates
 *   m-line 0 = audio (microphone)
 *   1st video transceiver = camera
 *   2nd video transceiver = screen share
 * Turning the camera or screen share on/off is a `replaceTrack` on its slot — no renegotiation,
 * so an audio call can become a video call at any time. Peers that only negotiated audio (older
 * app versions) keep working; video simply isn't available with them.
 */
export class PeerSession extends Emitter<PeerEvents> {
  readonly pc: RTCPeerConnection;
  /** remote microphone audio */
  readonly remoteStream = new MediaStream();
  readonly remoteCamera = new MediaStream();
  readonly remoteScreen = new MediaStream();
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private _state: PeerState = "new";
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private cameraTx: RTCRtpTransceiver | null = null;
  private screenTx: RTCRtpTransceiver | null = null;
  /** tracks set before the video slots exist (answerer, before the offer arrives) */
  private pendingCamera: MediaStreamTrack | null | undefined;
  private pendingScreen: MediaStreamTrack | null | undefined;

  constructor(
    private readonly role: "offerer" | "answerer",
    iceServers: RTCIceServer[],
    public readonly localStream: MediaStream,
    private readonly signal: (data: SignalData) => void
  ) {
    super();
    this.pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
    for (const track of localStream.getAudioTracks()) this.pc.addTrack(track, localStream);
    if (role === "offerer") {
      this.cameraTx = this.pc.addTransceiver("video", { direction: "sendrecv" });
      this.screenTx = this.pc.addTransceiver("video", { direction: "sendrecv" });
    }

    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.signal({ type: "candidate", candidate: e.candidate.toJSON() });
    };
    this.pc.ontrack = (e) => this.onTrack(e);
    this.pc.onconnectionstatechange = () => this.onConnectionState();
  }

  get state() {
    return this._state;
  }

  /** false when the other side only negotiated audio (older client). */
  get videoSupported() {
    return !!this.cameraTx;
  }

  private setState(s: PeerState) {
    if (this._state === s) return;
    this._state = s;
    this.emit("state", s);
  }

  private onTrack(e: RTCTrackEvent) {
    const t = e.track;
    if (t.kind === "audio") {
      if (!this.remoteStream.getTracks().includes(t)) this.remoteStream.addTrack(t);
      this.emit("remoteStream", this.remoteStream);
      return;
    }
    const slot = this.slotOf(e.transceiver);
    const target = slot === "screen" ? this.remoteScreen : this.remoteCamera;
    if (!target.getTracks().includes(t)) target.addTrack(t);
    this.emit(slot === "screen" ? "remoteScreen" : "remoteCamera", target);
  }

  /** camera = first video transceiver (by mid order), screen = second */
  private slotOf(tx: RTCRtpTransceiver): "camera" | "screen" {
    if (tx === this.screenTx) return "screen";
    if (tx === this.cameraTx) return "camera";
    const videos = this.videoTransceivers();
    return videos.indexOf(tx) === 1 ? "screen" : "camera";
  }

  private videoTransceivers() {
    return this.pc
      .getTransceivers()
      .filter((t) => t.receiver.track?.kind === "video" && t.mid !== null)
      .sort((a, b) => Number(a.mid) - Number(b.mid) || String(a.mid).localeCompare(String(b.mid)));
  }

  private onConnectionState() {
    switch (this.pc.connectionState) {
      case "connecting":
        this.setState(this._state === "connected" ? "reconnecting" : "connecting");
        break;
      case "connected":
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.setState("connected");
        break;
      case "disconnected":
        // transient network change — give ICE a moment, then restart it
        this.setState("reconnecting");
        this.restartTimer = setTimeout(() => this.restartIce(), 3000);
        break;
      case "failed":
        this.setState("reconnecting");
        this.restartIce();
        break;
      case "closed":
        this.setState("closed");
        break;
    }
  }

  async start() {
    this.setState("connecting");
    if (this.role === "offerer") {
      await this.applyPending();
      await this.makeOffer();
    }
  }

  private async makeOffer(iceRestart = false) {
    const offer = await this.pc.createOffer({ iceRestart });
    await this.pc.setLocalDescription(offer);
    this.signal({ type: "offer", sdp: offer.sdp! });
  }

  /** Offerer re-offers with ICE restart; answerer asks the offerer to do so. */
  async restartIce() {
    if (this.pc.signalingState === "closed") return;
    if (this.role === "offerer") await this.makeOffer(true).catch(() => undefined);
    else this.signal({ type: "renegotiate" });
  }

  async handleSignal(data: SignalData) {
    if (this.pc.signalingState === "closed") return;
    switch (data.type) {
      case "offer": {
        await this.pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
        if (this.role === "answerer" && !this.cameraTx) this.adoptVideoSlots();
        await this.flushCandidates();
        await this.applyPending();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.signal({ type: "answer", sdp: answer.sdp! });
        break;
      }
      case "answer":
        if (this.pc.signalingState !== "have-local-offer") return;
        await this.pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        await this.flushCandidates();
        break;
      case "candidate":
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(data.candidate).catch(() => undefined);
        else this.pendingCandidates.push(data.candidate);
        break;
      case "renegotiate":
        if (this.role === "offerer") await this.makeOffer(true);
        break;
    }
  }

  /** Answerer: the offer created the video transceivers — make them send too. */
  private adoptVideoSlots() {
    const videos = this.videoTransceivers();
    if (videos[0]) {
      videos[0].direction = "sendrecv";
      this.cameraTx = videos[0];
    }
    if (videos[1]) {
      videos[1].direction = "sendrecv";
      this.screenTx = videos[1];
    }
  }

  private async applyPending() {
    if (this.pendingCamera !== undefined && this.cameraTx) {
      await this.cameraTx.sender.replaceTrack(this.pendingCamera).catch(() => undefined);
      this.pendingCamera = undefined;
    }
    if (this.pendingScreen !== undefined && this.screenTx) {
      await this.screenTx.sender.replaceTrack(this.pendingScreen).catch(() => undefined);
      this.pendingScreen = undefined;
    }
  }

  private async flushCandidates() {
    const queued = this.pendingCandidates.splice(0);
    for (const c of queued) await this.pc.addIceCandidate(c).catch(() => undefined);
  }

  /** Put a camera track on the camera slot (null = camera off). */
  async setCameraTrack(track: MediaStreamTrack | null) {
    if (!this.cameraTx) {
      this.pendingCamera = track;
      return;
    }
    await this.cameraTx.sender.replaceTrack(track);
  }

  /** Put a screen-capture track on the screen slot (null = stop sharing). */
  async setScreenTrack(track: MediaStreamTrack | null) {
    if (!this.screenTx) {
      this.pendingScreen = track;
      return;
    }
    await this.screenTx.sender.replaceTrack(track);
  }

  setMuted(muted: boolean) {
    for (const t of this.localStream.getAudioTracks()) t.enabled = !muted;
  }

  /** Bytes received on the inbound audio track — handy for diagnostics and tests. */
  async inboundAudioBytes(): Promise<number> {
    return this.inboundBytes("audio");
  }

  /** Bytes received on inbound video (camera + screen). */
  async inboundVideoBytes(): Promise<number> {
    return this.inboundBytes("video");
  }

  private async inboundBytes(kind: "audio" | "video") {
    let bytes = 0;
    (await this.pc.getStats()).forEach((r: any) => {
      if (r.type === "inbound-rtp" && r.kind === kind) bytes += r.bytesReceived || 0;
    });
    return bytes;
  }

  close() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
    for (const t of this.localStream.getTracks()) t.stop();
    this.setState("closed");
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "connected" | "reconnecting" | "ended";

export interface CallSnapshot {
  phase: CallPhase;
  call: Call | null;
  /** callee/caller details for UI */
  peer: { name: string; avatarUrl?: string | null } | null;
  muted: boolean;
  remoteMuted: boolean;
  answeredAt: number | null;
  endReason: string | null;
  endStatus: string | null;
  /** remote microphone audio */
  remoteStream: MediaStream | null;
  /** local microphone */
  localStream: MediaStream | null;
  /** local camera preview (null when the camera is off) */
  cameraStream: MediaStream | null;
  /** local screen capture (null when not sharing) */
  screenStream: MediaStream | null;
  cameraOn: boolean;
  screenSharing: boolean;
  /** the other side's camera / screen, plus whether they are currently sending it */
  remoteCamera: MediaStream | null;
  remoteScreen: MediaStream | null;
  remoteCameraOn: boolean;
  remoteScreenOn: boolean;
  /** false when talking to a client that only supports audio */
  videoSupported: boolean;
  error: string | null;
  /** agent dashboards can receive several ringing calls at once */
  incoming: IncomingCallPayload[];
}

type ControllerEvents = { change: (s: CallSnapshot) => void };

export interface CallControllerOptions {
  realtime: RealtimeConnection;
  getIceConfig: () => Promise<IceConfig>;
  /** self = "agent" (dashboard) or "customer" (widget) */
  side: "agent" | "customer";
  media?: { audio: boolean; video: boolean };
}

const IDLE: CallSnapshot = {
  phase: "idle",
  call: null,
  peer: null,
  muted: false,
  remoteMuted: false,
  answeredAt: null,
  endReason: null,
  endStatus: null,
  remoteStream: null,
  localStream: null,
  cameraStream: null,
  screenStream: null,
  cameraOn: false,
  screenSharing: false,
  remoteCamera: null,
  remoteScreen: null,
  remoteCameraOn: false,
  remoteScreenOn: false,
  videoSupported: true,
  error: null,
  incoming: [],
};

const CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 24, max: 30 },
  facingMode: "user",
};

/**
 * Call lifecycle state machine shared by the widget and the dashboard.
 *  start() → outgoing → (server: call:accepted) → connecting → connected → ended
 *  call:incoming → incoming → accept() → connecting → connected → ended
 * Camera and screen share can be toggled at any point of an active call.
 */
export class CallController extends Emitter<ControllerEvents> {
  private snap: CallSnapshot = { ...IDLE };
  private peer: PeerSession | null = null;
  private role: "offerer" | "answerer" | null = null;
  private endedTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: () => void;

  constructor(private readonly opts: CallControllerOptions) {
    super();
    this.unsubscribe = opts.realtime.on("event", (name, payload) => void this.onEvent(name, payload));
    opts.realtime.on("ready", (_info, reconnect) => {
      if (reconnect && this.snap.call && this.isActive()) {
        this.opts.realtime
          .request(SupportEvents.CALL_REJOIN, { callId: this.snap.call.id })
          .then(() => this.sendMediaState())
          .catch(() => this.teardown("ENDED", "connection_lost"));
      }
    });
  }

  get snapshot() {
    return this.snap;
  }

  private set(patch: Partial<CallSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.emit("change", this.snap);
  }

  private isActive() {
    return ["outgoing", "connecting", "connected", "reconnecting"].includes(this.snap.phase);
  }

  private async getMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support calls");
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  }

  private async getCamera() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support video");
    return navigator.mediaDevices.getUserMedia({ video: CAMERA_CONSTRAINTS });
  }

  private createPeer(role: "offerer" | "answerer", ice: IceConfig, stream: MediaStream, callId: string) {
    this.role = role;
    const peer = new PeerSession(role, ice.iceServers, stream, (data) =>
      this.opts.realtime.send(SupportEvents.CALL_SIGNAL, { callId, data })
    );
    peer.on("state", (s) => {
      if (s === "connected") {
        this.set({ phase: "connected", answeredAt: this.snap.answeredAt ?? Date.now(), videoSupported: peer.videoSupported });
        this.sendMediaState();
      } else if (s === "reconnecting") this.set({ phase: "reconnecting" });
    });
    peer.on("remoteStream", (rs) => this.set({ remoteStream: rs }));
    peer.on("remoteCamera", (rs) => this.set({ remoteCamera: rs }));
    peer.on("remoteScreen", (rs) => this.set({ remoteScreen: rs }));
    this.peer = peer;
    // camera / screen chosen before the peer existed (video call, or toggled while ringing)
    const cam = this.snap.cameraStream?.getVideoTracks()[0];
    if (cam) void peer.setCameraTrack(cam);
    const scr = this.snap.screenStream?.getVideoTracks()[0];
    if (scr) void peer.setScreenTrack(scr);
    this.set({ localStream: stream });
    return peer;
  }

  /** Place a call (customer → support, or agent → customer). media "VIDEO" starts with the camera on. */
  async start(input: { conversationId?: string; media?: CallMedia; peer?: CallSnapshot["peer"] } = {}) {
    if (this.isActive()) throw new Error("A call is already in progress");
    if (this.endedTimer) clearTimeout(this.endedTimer);
    const media = input.media ?? "AUDIO";
    this.set({ ...IDLE, incoming: this.snap.incoming, phase: "outgoing", peer: input.peer ?? null });
    let stream: MediaStream | null = null;
    try {
      stream = await this.getMicrophone();
      this.set({ localStream: stream });
      if (media === "VIDEO") await this.enableCamera().catch(() => undefined); // fall back to voice
      const res = await this.opts.realtime.request<{ call: Call; available?: boolean }>(SupportEvents.CALL_START, {
        conversationId: input.conversationId,
        media,
      });
      if (res.call.status !== "RINGING") {
        this.stopLocalMedia();
        this.finish(res.call.status, res.call.endReason || "unavailable", res.call);
        return res.call;
      }
      this.set({ call: res.call });
      return res.call;
    } catch (e: any) {
      stream?.getTracks().forEach((t) => t.stop());
      this.stopLocalMedia();
      this.set({ phase: "ended", error: friendlyMediaError(e), endStatus: "FAILED", localStream: null });
      this.scheduleReset();
      throw e;
    }
  }

  /** Answer a ringing call. `video` defaults to the call's media (VIDEO → camera on). */
  async accept(callId: string, options: { video?: boolean } = {}) {
    const incoming = this.snap.incoming.find((i) => i.call.id === callId);
    if (!incoming) throw new Error("Call is no longer ringing");
    if (this.isActive()) await this.hangup();
    let stream: MediaStream | null = null;
    try {
      stream = await this.getMicrophone();
      const withVideo = options.video ?? incoming.call.media === "VIDEO";
      if (withVideo) await this.enableCamera().catch(() => undefined);
      const ice = await this.opts.getIceConfig();
      // build the peer before accepting so an early offer is never dropped
      const peer = this.createPeer("answerer", ice, stream, callId);
      this.set({
        phase: "connecting",
        call: incoming.call,
        peer: incoming.customer
          ? { name: incoming.customer.name || "Visitor", avatarUrl: incoming.customer.avatarUrl }
          : incoming.call.agent
            ? { name: incoming.call.agent.name, avatarUrl: incoming.call.agent.avatarUrl }
            : null,
        incoming: this.snap.incoming.filter((i) => i.call.id !== callId),
        error: null,
        endReason: null,
        endStatus: null,
      });
      const res = await this.opts.realtime.request<{ call: Call }>(SupportEvents.CALL_ACCEPT, { callId });
      this.set({ call: res.call, answeredAt: Date.now() });
      await peer.start();
    } catch (e: any) {
      if (this.peer) {
        this.peer.close();
        this.peer = null;
      } else stream?.getTracks().forEach((t) => t.stop());
      this.stopLocalMedia();
      this.set({ phase: "ended", error: e?.message || friendlyMediaError(e), endStatus: "FAILED", localStream: null, remoteStream: null });
      this.scheduleReset();
      throw e;
    }
  }

  async reject(callId: string) {
    this.set({ incoming: this.snap.incoming.filter((i) => i.call.id !== callId) });
    await this.opts.realtime.request(SupportEvents.CALL_REJECT, { callId }).catch(() => undefined);
  }

  async hangup() {
    const call = this.snap.call;
    if (!call) return;
    await this.opts.realtime.request(SupportEvents.CALL_END, { callId: call.id }).catch(() => undefined);
    this.teardown(this.snap.phase === "outgoing" ? "CANCELLED" : "ENDED", "hangup");
  }

  toggleMute() {
    const muted = !this.snap.muted;
    this.peer?.setMuted(muted);
    this.snap.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.set({ muted });
    this.sendMediaState();
  }

  // ─────────────────────────── camera ───────────────────────────

  private async enableCamera() {
    if (this.snap.cameraStream) return;
    let cam: MediaStream;
    try {
      cam = await this.getCamera();
    } catch (e: any) {
      this.set({ error: friendlyMediaError(e, "camera") });
      throw e;
    }
    this.set({ cameraStream: cam, cameraOn: true, error: null });
    await this.peer?.setCameraTrack(cam.getVideoTracks()[0]);
    this.sendMediaState();
  }

  private async disableCamera() {
    const cam = this.snap.cameraStream;
    this.set({ cameraStream: null, cameraOn: false });
    await this.peer?.setCameraTrack(null).catch(() => undefined);
    cam?.getTracks().forEach((t) => t.stop()); // turns the camera light off
    this.sendMediaState();
  }

  /** Turn the camera on/off during a call (an audio call becomes a video call). */
  async toggleCamera() {
    if (this.snap.cameraOn) await this.disableCamera();
    else await this.enableCamera();
  }

  /** Switch between front and back camera (phones / tablets). */
  async switchCamera() {
    const current = this.snap.cameraStream?.getVideoTracks()[0];
    if (!current) return;
    const facing = current.getSettings().facingMode === "environment" ? "user" : "environment";
    const next = await navigator.mediaDevices.getUserMedia({ video: { ...CAMERA_CONSTRAINTS, facingMode: { exact: facing } } }).catch(() => null);
    if (!next) return;
    await this.peer?.setCameraTrack(next.getVideoTracks()[0]);
    this.snap.cameraStream?.getTracks().forEach((t) => t.stop());
    this.set({ cameraStream: next });
  }

  // ─────────────────────────── screen share ───────────────────────────

  static get screenShareSupported() {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices;
  }

  /** Share the screen (or a window / tab). Pass a stream to share something you captured yourself. */
  async startScreenShare(existing?: MediaStream) {
    if (this.snap.screenStream) return;
    let screen: MediaStream;
    try {
      screen =
        existing ??
        (await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false }));
    } catch (e: any) {
      if (e?.name !== "NotAllowedError") this.set({ error: e?.message || "Could not share the screen" });
      return; // user cancelled the picker
    }
    const track = screen.getVideoTracks()[0];
    if (!track) return;
    try {
      (track as any).contentHint = "detail"; // keep text sharp rather than smooth
    } catch {
      /* not supported */
    }
    track.addEventListener("ended", () => void this.stopScreenShare()); // browser's own "Stop sharing" bar
    this.set({ screenStream: screen, screenSharing: true, error: null });
    await this.peer?.setScreenTrack(track);
    this.sendMediaState();
  }

  async stopScreenShare() {
    const screen = this.snap.screenStream;
    if (!screen) return;
    this.set({ screenStream: null, screenSharing: false });
    await this.peer?.setScreenTrack(null).catch(() => undefined);
    screen.getTracks().forEach((t) => t.stop());
    this.sendMediaState();
  }

  async toggleScreenShare() {
    if (this.snap.screenSharing) await this.stopScreenShare();
    else await this.startScreenShare();
  }

  get peerSession() {
    return this.peer;
  }

  private sendMediaState() {
    const call = this.snap.call;
    if (!call || !this.isActive()) return;
    this.opts.realtime.send(SupportEvents.CALL_MEDIA_STATE, {
      callId: call.id,
      muted: this.snap.muted,
      video: this.snap.cameraOn,
      screen: this.snap.screenSharing,
    });
  }

  private async onEvent(name: string, payload: any) {
    switch (name) {
      case SupportEvents.CALL_INCOMING: {
        const p = payload as IncomingCallPayload;
        if (this.snap.incoming.some((i) => i.call.id === p.call.id)) return;
        this.set({ incoming: [...this.snap.incoming, p], phase: this.isActive() ? this.snap.phase : "incoming" });
        break;
      }
      case SupportEvents.CALL_TAKEN:
        this.dropIncoming(payload.callId);
        break;
      case SupportEvents.CALL_ACCEPTED: {
        // we placed the call → we are the offerer
        if (!this.snap.call || payload.call.id !== this.snap.call.id || !this.snap.localStream) return;
        const ice = await this.opts.getIceConfig();
        const peer = this.createPeer("offerer", ice, this.snap.localStream, payload.call.id);
        const agent = payload.call.agent;
        this.set({
          call: payload.call,
          phase: "connecting",
          answeredAt: Date.now(),
          peer: this.snap.peer ?? (agent ? { name: agent.name, avatarUrl: agent.avatarUrl } : null),
        });
        await peer.start();
        break;
      }
      case SupportEvents.CALL_SIGNAL:
        if (this.peer && this.snap.call?.id === payload.callId) {
          await this.peer.handleSignal(payload.data).catch((e) => console.warn("[rox-support] signal error", e));
          if (payload.data?.type === "offer" || payload.data?.type === "answer") this.set({ videoSupported: this.peer.videoSupported });
        }
        break;
      case SupportEvents.CALL_MEDIA_STATE:
        if (this.snap.call?.id === payload.callId)
          this.set({ remoteMuted: !!payload.muted, remoteCameraOn: !!payload.video, remoteScreenOn: !!payload.screen });
        break;
      case SupportEvents.CALL_REJOIN:
        if (this.snap.call?.id === payload.callId && this.role === "offerer") await this.peer?.restartIce();
        break;
      case SupportEvents.CALL_ENDED:
        if (this.snap.call?.id === payload.callId) this.teardown(payload.status, payload.reason, payload.durationSec);
        else this.dropIncoming(payload.callId);
        break;
    }
  }

  private dropIncoming(callId: string) {
    const incoming = this.snap.incoming.filter((i) => i.call.id !== callId);
    this.set({ incoming, phase: !incoming.length && this.snap.phase === "incoming" ? "idle" : this.snap.phase });
  }

  private stopLocalMedia() {
    this.snap.cameraStream?.getTracks().forEach((t) => t.stop());
    this.snap.screenStream?.getTracks().forEach((t) => t.stop());
    this.set({ cameraStream: null, screenStream: null, cameraOn: false, screenSharing: false });
  }

  private finish(status: string, reason: string, call?: Call) {
    this.set({
      phase: "ended",
      endStatus: status,
      endReason: reason,
      call: call ?? this.snap.call,
      localStream: null,
      remoteStream: null,
      remoteCamera: null,
      remoteScreen: null,
      remoteCameraOn: false,
      remoteScreenOn: false,
    });
    this.scheduleReset();
  }

  private teardown(status: string, reason: string, durationSec?: number) {
    this.peer?.close();
    this.peer = null;
    this.role = null;
    this.snap.localStream?.getTracks().forEach((t) => t.stop());
    this.stopLocalMedia();
    this.finish(status, reason, this.snap.call ? { ...this.snap.call, status: status as any, durationSec: durationSec ?? this.snap.call.durationSec } : undefined);
  }

  /** Keep the "call ended" card visible briefly, then return to idle. */
  private scheduleReset() {
    if (this.endedTimer) clearTimeout(this.endedTimer);
    this.endedTimer = setTimeout(() => {
      if (this.snap.phase === "ended") this.set({ ...IDLE, incoming: this.snap.incoming, phase: this.snap.incoming.length ? "incoming" : "idle" });
    }, 4000);
  }

  destroy() {
    this.unsubscribe();
    this.peer?.close();
    this.snap.localStream?.getTracks().forEach((t) => t.stop());
    this.stopLocalMedia();
    if (this.endedTimer) clearTimeout(this.endedTimer);
    this.removeAllListeners();
  }
}

function friendlyMediaError(e: any, device: "microphone" | "camera" = "microphone"): string {
  const name = e?.name || "";
  if (name === "NotAllowedError") return `${device === "camera" ? "Camera" : "Microphone"} access was blocked. Allow it in your browser settings.`;
  if (name === "NotFoundError") return `No ${device} was found on this device.`;
  if (name === "NotReadableError") return `Your ${device} is being used by another application.`;
  return e?.message || "Could not start the call";
}

/** Speaker selection where supported (Chrome/Edge). */
export async function listAudioOutputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput");
}

export function supportsOutputSelection(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}
