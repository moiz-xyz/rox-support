/**
 * Runs inside Chrome. Two CallControllers (customer + agent) talk to an in-page fake signaling
 * server that mirrors the backend semantics — including the real-world race where `call:accepted`
 * reaches the caller (who immediately sends the SDP offer) before the answerer's ack resolves.
 * Media is real WebRTC with Chrome's fake microphone, so we can assert RTP bytes flow.
 */
import { CallController } from "../../src/call";
import { Emitter } from "../../src/emitter";
import { SupportEvents as E } from "../../src/events";

type Side = "customer" | "agent";

class FakeRealtime extends Emitter<{ event: (n: string, p: any) => void; ready: (i: any, r: boolean) => void; state: (s: any) => void }> {
  connected = true;
  constructor(public side: Side, private server: FakeServer) {
    super();
  }
  deliver(name: string, payload: any) {
    // async, like a network hop
    setTimeout(() => this.emit("event", name, payload), 5 + Math.random() * 15);
  }
  request(event: string, payload: any) {
    return this.server.handle(this.side, event, payload);
  }
  send(event: string, payload: any) {
    void this.server.handle(this.side, event, payload).catch(() => undefined);
  }
}

class FakeServer {
  sides: Record<Side, FakeRealtime> = {} as any;
  call: any = null;
  agentsAvailable = true;
  log: string[] = [];

  other(side: Side): FakeRealtime {
    return this.sides[side === "agent" ? "customer" : "agent"];
  }

  async handle(side: Side, event: string, p: any): Promise<any> {
    this.log.push(`${side}:${event}${p?.data?.type ? `:${p.data.type}` : ""}`);
    switch (event) {
      case E.CALL_START: {
        if (!this.agentsAvailable) {
          return { call: { id: "c0", status: "MISSED", endReason: "no_agents_available", media: "AUDIO", conversationId: "conv" }, available: false };
        }
        this.call = { id: "call-1", status: "RINGING", media: p?.media === "VIDEO" ? "VIDEO" : "AUDIO", conversationId: "conv-1", initiatedBy: "CUSTOMER", agent: null };
        this.sides.agent.deliver(E.CALL_INCOMING, { call: this.call, customer: { name: "Ayesha" }, ringTimeoutSec: 30 });
        return { call: this.call, available: true };
      }
      case E.CALL_ACCEPT: {
        this.call = { ...this.call, status: "ONGOING", agent: { id: "a1", name: "Sara", title: null, avatarUrl: null } };
        // emit to the caller FIRST and delay our own ack → the offer can arrive before the ack
        this.sides.customer.deliver(E.CALL_ACCEPTED, { call: this.call, role: "offerer" });
        await new Promise((r) => setTimeout(r, 150));
        return { call: this.call, role: "answerer" };
      }
      case E.CALL_SIGNAL:
      case E.CALL_MEDIA_STATE:
        this.other(side).deliver(event, { ...p, from: side });
        return { ok: true };
      case E.CALL_END:
        this.other(side).deliver(E.CALL_ENDED, { callId: p.callId, status: "ENDED", reason: "hangup", durationSec: 3 });
        return { success: true };
      case E.CALL_REJECT:
        this.other(side).deliver(E.CALL_ENDED, { callId: p.callId, status: "REJECTED", reason: "declined" });
        return { success: true };
    }
    throw new Error(`unhandled ${event}`);
  }
}

const ice = async () => ({ iceServers: [] as RTCIceServer[], ttlSec: 3600 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, label: string, timeoutMs = 10_000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out: ${label}`);
    await sleep(25);
  }
}

function setup() {
  const server = new FakeServer();
  server.sides.customer = new FakeRealtime("customer", server);
  server.sides.agent = new FakeRealtime("agent", server);
  const customer = new CallController({ realtime: server.sides.customer as any, getIceConfig: ice, side: "customer" });
  const agent = new CallController({ realtime: server.sides.agent as any, getIceConfig: ice, side: "agent" });
  return { server, customer, agent };
}

async function happyPath() {
  const { server, customer, agent } = setup();
  const results: Record<string, any> = {};

  await customer.start({ peer: { name: "Support" } });
  results.customerPhaseAfterStart = customer.snapshot.phase;
  await until(() => agent.snapshot.incoming.length === 1, "agent rings");
  results.agentPhaseRinging = agent.snapshot.phase;

  await agent.accept(agent.snapshot.incoming[0].call.id);
  await until(() => customer.snapshot.phase === "connected" && agent.snapshot.phase === "connected", "both connected");
  results.connected = true;
  results.agentIncomingCleared = agent.snapshot.incoming.length === 0;

  await sleep(1500);
  results.customerInboundBytes = await customer.peerSession!.inboundAudioBytes();
  results.agentInboundBytes = await agent.peerSession!.inboundAudioBytes();
  results.remoteStreamTracks = customer.snapshot.remoteStream?.getAudioTracks().length ?? 0;

  customer.toggleMute();
  await until(() => agent.snapshot.remoteMuted, "agent sees customer muted");
  results.customerTrackDisabled = customer.snapshot.localStream?.getAudioTracks().every((t) => !t.enabled);
  customer.toggleMute();
  await until(() => !agent.snapshot.remoteMuted, "agent sees customer unmuted");

  // ICE restart (what happens after a network change / socket rejoin) must keep the call alive
  await customer.peerSession!.restartIce();
  await sleep(1200);
  results.stillConnectedAfterIceRestart = customer.snapshot.phase === "connected" && agent.snapshot.phase === "connected";

  await customer.hangup();
  await until(() => customer.snapshot.phase === "ended" && agent.snapshot.phase === "ended", "both ended");
  results.ended = { customer: customer.snapshot.endStatus, agent: agent.snapshot.endStatus };
  results.micReleased = customer.snapshot.localStream === null && agent.snapshot.localStream === null;
  results.signalingOrder = server.log.filter((l) => l.includes("signal")).slice(0, 3);
  customer.destroy();
  agent.destroy();
  return results;
}

async function noAgents() {
  const { server, customer, agent } = setup();
  server.agentsAvailable = false;
  await customer.start();
  const r = { phase: customer.snapshot.phase, endStatus: customer.snapshot.endStatus, endReason: customer.snapshot.endReason };
  customer.destroy();
  agent.destroy();
  return r;
}

async function declined() {
  const { customer, agent } = setup();
  await customer.start();
  await until(() => agent.snapshot.incoming.length === 1, "agent rings");
  await agent.reject(agent.snapshot.incoming[0].call.id);
  await until(() => customer.snapshot.phase === "ended", "customer sees decline");
  const r = { endStatus: customer.snapshot.endStatus, agentIncoming: agent.snapshot.incoming.length };
  customer.destroy();
  agent.destroy();
  return r;
}

/** A fake "screen": an animated canvas (headless Chrome has no screen picker). */
function fakeScreen(): MediaStream {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 360;
  const g = c.getContext("2d")!;
  let n = 0;
  setInterval(() => {
    g.fillStyle = `hsl(${(n += 7) % 360} 70% 50%)`;
    g.fillRect(0, 0, 640, 360);
    g.fillStyle = "#fff";
    g.fillText(`screen ${n}`, 20, 40);
  }, 50);
  return c.captureStream(15);
}

async function videoCall() {
  const { customer, agent } = setup();
  const r: Record<string, any> = {};
  await customer.start({ media: "VIDEO" });
  r.callerCameraOnWhileRinging = customer.snapshot.cameraOn && !!customer.snapshot.cameraStream;
  await until(() => agent.snapshot.incoming.length === 1, "agent rings");
  r.incomingMedia = agent.snapshot.incoming[0].call.media;
  await agent.accept(agent.snapshot.incoming[0].call.id); // VIDEO → camera on by default
  await until(() => customer.snapshot.phase === "connected" && agent.snapshot.phase === "connected", "video connected");
  await until(() => agent.snapshot.remoteCameraOn && customer.snapshot.remoteCameraOn, "both see camera on");
  await sleep(1500);
  r.agentVideoBytes = await agent.peerSession!.inboundVideoBytes();
  r.customerVideoBytes = await customer.peerSession!.inboundVideoBytes();
  r.agentRemoteCameraTracks = agent.snapshot.remoteCamera?.getVideoTracks().length ?? 0;
  r.videoSupported = customer.snapshot.videoSupported && agent.snapshot.videoSupported;

  // agent shares their screen
  const before = await customer.peerSession!.inboundVideoBytes();
  await agent.startScreenShare(fakeScreen());
  await until(() => customer.snapshot.remoteScreenOn, "customer sees screen share");
  await sleep(1500);
  r.screenBytesGrew = (await customer.peerSession!.inboundVideoBytes()) - before > 20_000;
  r.customerRemoteScreenTracks = customer.snapshot.remoteScreen?.getVideoTracks().length ?? 0;
  await agent.stopScreenShare();
  await until(() => !customer.snapshot.remoteScreenOn, "screen share stopped");

  // camera off → camera light off, other side notified
  await customer.toggleCamera();
  await until(() => !agent.snapshot.remoteCameraOn, "agent sees camera off");
  r.cameraStreamReleased = customer.snapshot.cameraStream === null;

  await agent.hangup();
  await until(() => customer.snapshot.phase === "ended", "ended");
  customer.destroy();
  agent.destroy();
  return r;
}

/** An audio call is upgraded to video mid-call — no renegotiation needed. */
async function upgradeToVideo() {
  const { customer, agent } = setup();
  await customer.start();
  await until(() => agent.snapshot.incoming.length === 1, "agent rings");
  await agent.accept(agent.snapshot.incoming[0].call.id);
  await until(() => customer.snapshot.phase === "connected" && agent.snapshot.phase === "connected", "connected");
  const r: Record<string, any> = { cameraInitiallyOff: !agent.snapshot.cameraOn && !customer.snapshot.cameraOn };
  const before = await customer.peerSession!.inboundVideoBytes();
  await agent.toggleCamera();
  await until(() => customer.snapshot.remoteCameraOn, "customer sees agent camera");
  await sleep(1500);
  r.videoBytesAfterUpgrade = (await customer.peerSession!.inboundVideoBytes()) - before;
  await customer.hangup();
  await until(() => agent.snapshot.phase === "ended", "ended");
  customer.destroy();
  agent.destroy();
  return r;
}

(window as any).runCallTests = async () => ({
  happyPath: await happyPath(),
  noAgents: await noAgents(),
  declined: await declined(),
  videoCall: await videoCall(),
  upgradeToVideo: await upgradeToVideo(),
});
