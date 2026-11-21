# Voice calling (WebRTC)

Audio never travels through Socket.IO or the backend. Socket.IO carries **signaling only**
(SDP offers/answers and ICE candidates); media flows peer-to-peer over SRTP, or through a TURN
relay when a direct path is impossible.

## Call flow

```
Customer (widget)            Backend (Socket.IO + DB)                 Agents (dashboard)
      │ getUserMedia (mic prompt)
      │── call:start ─────────────►  SupportCall RINGING, ring timer
      │◄─ ack {call} ─────────────┤── call:incoming ───────────────────►  ringing UI + ringtone
      │                            │                         (assignee first if available,
      │                            │                          otherwise every available agent)
      │                            │◄── call:accept {callId} ─────────────  getUserMedia, build RTCPeerConnection
      │                            │   atomic RINGING→ONGOING (first wins)
      │◄─ call:accepted (offerer) ─┤── call:taken ─────────────────────►  other agents stop ringing
      │ createOffer                │──► ack {role: answerer, iceServers}
      │── call:signal offer ──────►│── call:signal ────────────────────►  setRemote, createAnswer
      │◄─ call:signal answer ──────┤◄── call:signal answer ───────────────
      │◄═══════ ICE candidates trickle both ways via call:signal ═══════►
      │◄═══════════════ SRTP audio (P2P or via TURN) ════════════════════►
      │── call:end ───────────────►│ ENDED, duration, "Voice call · 4:12" in the conversation
      │                            │── call:ended ──────────────────────►
```

Roles are deterministic — **the caller is always the offerer** — so there is no offer glare.
The answerer builds its `RTCPeerConnection` *before* sending `call:accept`, because the server tells
the caller first and the offer can arrive before the accept ack (this race is reproduced in the
browser test).

**Statuses:** `RINGING → ONGOING → ENDED`, or `MISSED` (ring timeout / no agents available),
`REJECTED` (all ringing agents declined, or the customer declined), `CANCELLED` (caller hung up
while ringing), `FAILED` (server restart).

**Missed calls** create a `CALL` timeline entry and `MISSED_CALL` notifications (assignee, or all
agents of the app); a customer who misses an agent's call gets an FCM push when registered.

**Reconnects:** if a party's socket drops mid-call the server waits
`SUPPORT_CALL_RECONNECT_GRACE_MS` (15 s). The reconnecting client sends `call:rejoin`; the server
rebinds its socket and tells the other side, and the offerer performs an **ICE restart**. The
peer connection also self-heals (`disconnected` → ICE restart after 3 s, `failed` → immediately).

**Multi-tab:** signaling is bound to the exact socket that placed or answered the call, so other
tabs of the same customer/agent never receive media or stray candidates.

## Controls

| Control | Implementation |
|---|---|
| Mute / unmute | disables the local audio track; the other side is told via `call:media-state` |
| Speaker on/off | mutes the remote `<audio>` element |
| Output device | `HTMLMediaElement.setSinkId` (Chrome/Edge; hidden where unsupported) |
| Duration | from `answeredAt`; the server stores `durationSec` |
| Echo/noise | `echoCancellation`, `noiseSuppression`, `autoGainControl` constraints |

## Video later

Everything is media-agnostic: `call:start { media: "VIDEO" }` is accepted and stored,
`CallController` requests video when `media === "VIDEO"`, and `PeerSession` adds whatever tracks
the stream has. Adding video = render `remoteStream` video tracks in a `<video>` element and add a
camera toggle (`PeerSession.setVideoEnabled`). No backend or signaling changes are needed.

## STUN / TURN

* **STUN** (default Google STUN) discovers public addresses — enough for most home/office networks.
* **TURN** relays media when both sides are behind symmetric NAT (common on Pakistani mobile
  carriers and corporate Wi-Fi). Without TURN, some calls will connect signaling but never
  carry audio. **Run a TURN server in production.**

### coturn (recommended)

```ini
# /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=<long random string>      # == SUPPORT_TURN_SECRET
realm=turn.roxanlabs.com
cert=/etc/letsencrypt/live/turn.roxanlabs.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.roxanlabs.com/privkey.pem
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
total-quota=200
```

Open UDP/TCP 3478, TCP 5349 and the relay range (default UDP 49152–65535) in the firewall.

```env
SUPPORT_TURN_URLS=turn:turn.roxanlabs.com:3478?transport=udp,turn:turn.roxanlabs.com:3478?transport=tcp,turns:turn.roxanlabs.com:5349?transport=tcp
SUPPORT_TURN_SECRET=<same as static-auth-secret>
```

The backend then hands out time-limited credentials (`username = <expiry>:<user id>`,
`credential = base64(HMAC-SHA1(secret, username))`, default 6 h) from `/calls/ice-servers` and
`/widget/ice-servers`; the static secret never leaves the server. A managed TURN service works too
— set `SUPPORT_TURN_USERNAME` / `SUPPORT_TURN_CREDENTIAL` instead.

## Browser requirements

* HTTPS (or `localhost`) — `getUserMedia` is blocked on insecure origins.
* Microphone permission; the widget explains blocked/missing microphones.
* Android WebView: grant `RECORD_AUDIO` and handle `onPermissionRequest` (see `android.md`).
* The dashboard sends `Permissions-Policy: microphone=(self)`. If you embed the widget in an
  iframe, add `allow="microphone"`.

## Tests

`pnpm --filter @roxshield/support-sdk test:webrtc` runs two `CallController`s in real Chrome with
a fake microphone and an in-page signaling server that mirrors the backend (including the
early-offer race). It asserts: ringing → connected on both sides, audio RTP bytes received on both
sides, mute signaling, ICE restart keeps the call up, hangup releases the microphone, plus the
missed (no agents) and declined paths.

## Video calls and screen sharing

Every call — voice or video — negotiates the same three media slots, on web and Android alike:

| Order | Slot | Source |
|---|---|---|
| audio m-line | microphone | `getUserMedia({audio})` / WebRTC `AudioTrack` |
| 1st video transceiver | camera | `getUserMedia({video})` / `Camera2Enumerator` |
| 2nd video transceiver | screen share | `getDisplayMedia()` / `ScreenCapturerAndroid` (MediaProjection) |

The caller (offerer) creates both video transceivers as `sendrecv`; the answerer adopts them after
`setRemoteDescription(offer)` (sorted by `mid`: first = camera, second = screen) and makes them
`sendrecv`. Turning the camera or screen share on/off is `sender.replaceTrack(track | null)` on its
slot — **no renegotiation**, so a voice call can become a video call at any time, and screen sharing
can start mid-call. Peers that only negotiated audio (older app versions) keep working; the UI hides
the video buttons (`videoSupported = false`).

Which slots are live is announced with `call:media-state { muted, video, screen }`, relayed by the
backend to the other party. Clients show the remote **screen** large when it is on (letterboxed),
otherwise the remote **camera** (cropped), with the local camera as a mirrored picture-in-picture.

`call:start { media: "VIDEO" }` marks the call as a video call: the caller's camera starts on, and the
callee is offered **Video** / **Voice** / **Decline**.

**Android specifics (rox-admin):** screen capture needs the system consent dialog
(`MediaProjectionManager.createScreenCaptureIntent()`) and a foreground service of type
`mediaProjection` (`SupportScreenShareService`, with a "Stop sharing" notification). The call lives in
`SupportHub`, so the user can leave the support screen — e.g. to show the agent another part of the
app — while a "return to call" bar stays at the top.

**Bandwidth:** camera ≈ 1–2 Mbps per direction (720p/24fps), screen share ≈ 0.5–1.5 Mbps (15fps,
`contentHint = "detail"`). Direct (P2P) calls cost the backend nothing; relayed calls cost that
bandwidth on the TURN server.
