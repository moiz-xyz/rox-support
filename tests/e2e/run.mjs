/**
 * End-to-end test against a RUNNING rox-shield-backend whose database has the Support* tables.
 * Creates its own test application + agents + customers, runs the customer↔agent scenarios,
 * then deletes everything it created (deleting the application cascades its data).
 *
 *   SUPPORT_API_URL=http://localhost:5089 \
 *   SUPPORT_ADMIN_EMAIL=... SUPPORT_ADMIN_PASSWORD=... \
 *   node tests/e2e/run.mjs
 *
 * SUPPORT_ADMIN_* = an existing SUPER_ADMIN support agent, or (first run, no agents yet) the
 * Rox Shield SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD which bootstraps one.
 * Real audio is covered by packages/support-sdk test:webrtc; here calls are exercised at the
 * signaling / persistence level.
 */
import { createRequire } from "node:module";
import path from "node:path";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const require = createRequire(path.resolve("packages/support-sdk/package.json"));
const { io } = require("socket.io-client");

const API = (process.env.SUPPORT_API_URL || "http://localhost:5089").replace(/\/+$/, "");
const SOCKET_PATH = process.env.SUPPORT_SOCKET_PATH || "/api/support/realtime";
const RUN = Date.now().toString(36);
const created = { appId: null, agents: [] };
const sockets = [];
let passed = 0;

// ───────────────────────── helpers ─────────────────────────
async function http(method, p, { token, body, form } = {}) {
  const res = await fetch(`${API}/api/support${p}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}
const ok = (r, label) => {
  if (r.status >= 300) throw new Error(`${label} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
function identityToken(secret, customer, ttl = 300) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const iat = Math.floor(Date.now() / 1000);
  const h = b({ alg: "HS256", typ: "JWT" });
  const p = b({ sub: customer.id, name: customer.name, email: customer.email, iat, exp: iat + ttl });
  return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`;
}
function connect(token) {
  const s = io(API, { path: SOCKET_PATH, transports: ["websocket"], auth: { token }, reconnection: false, forceNew: true });
  sockets.push(s);
  const events = [];
  s.onAny((n, p) => events.push([n, p]));
  const ready = new Promise((resolve, reject) => {
    s.once("session:ready", resolve);
    s.once("connect_error", reject);
  });
  const waitFor = (name, pred = () => true, ms = 5000) =>
    new Promise((resolve, reject) => {
      const hit = events.find(([n, p]) => n === name && pred(p));
      if (hit) return resolve(hit[1]);
      const t = setTimeout(() => (s.off(name, fn), reject(new Error(`timeout waiting for ${name}`))), ms);
      const fn = (p) => pred(p) && (clearTimeout(t), s.off(name, fn), resolve(p));
      s.on(name, fn);
    });
  const req = (event, payload) => new Promise((resolve) => s.timeout(8000).emit(event, payload, (err, res) => resolve(err ? { ok: false, error: { message: "timeout" } } : res)));
  const clear = () => events.splice(0);
  return { s, ready, waitFor, req, events, clear };
}
async function step(name, fn) {
  process.stdout.write(`• ${name} … `);
  await fn();
  passed++;
  console.log("ok");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b00000000049454e44ae426082", "hex");

// ───────────────────────── run ─────────────────────────
async function main() {
  const admin = ok(await http("POST", "/auth/login", { body: { email: process.env.SUPPORT_ADMIN_EMAIL, password: process.env.SUPPORT_ADMIN_PASSWORD } }), "admin login");
  assert.equal(admin.agent.role, "SUPER_ADMIN", "SUPPORT_ADMIN_* must be a SUPER_ADMIN agent");
  const A = admin.accessToken;

  const app = ok(await http("POST", "/applications", { token: A, body: { name: `E2E ${RUN}`, platform: "WEB", allowAnonymous: true } }), "create app");
  created.appId = app.id;
  ok(await http("PATCH", `/applications/${app.id}/settings`, { token: A, body: { ringTimeoutSec: 10, autoAssign: true, assignmentStrategy: "ROUND_ROBIN" } }), "settings");

  const mkAgent = async (n) => {
    const a = ok(await http("POST", "/agents", { token: A, body: { email: `e2e-${n}-${RUN}@example.test`, name: `E2E Agent ${n}`, password: "E2e-password-123", applicationIds: [app.id] } }), "create agent");
    created.agents.push(a.id);
    const login = ok(await http("POST", "/auth/login", { body: { email: a.email, password: "E2e-password-123" } }), "agent login");
    return { ...a, token: login.accessToken };
  };
  const agentA = await mkAgent("a");
  const agentB = await mkAgent("b");
  const sockA = connect(agentA.token);
  const sockB = connect(agentB.token);
  await Promise.all([sockA.ready, sockB.ready]);

  const c1 = { id: `cust-1-${RUN}`, name: "E2E Customer One", email: "one@example.test" };
  const c2 = { id: `cust-2-${RUN}`, name: "E2E Customer Two", email: "two@example.test" };
  let s1, s2, sess1, sess2, conv1, conv2;

  await step("1-2. customer opens the widget and authenticates with a signed token", async () => {
    sess1 = ok(await http("POST", "/widget/session", { body: { appId: app.publicId, identityToken: identityToken(app.secret, c1) } }), "session 1");
    sess2 = ok(await http("POST", "/widget/session", { body: { appId: app.publicId, identityToken: identityToken(app.secret, c2) } }), "session 2");
    assert.equal(sess1.customer.name, c1.name);
    assert.equal(sess1.config.features.calls, true);
    s1 = connect(sess1.sessionToken);
    s2 = connect(sess2.sessionToken);
    await Promise.all([s1.ready, s2.ready]);
  });

  await step("14a. forged / unsigned identity tokens are rejected", async () => {
    const forged = await http("POST", "/widget/session", { body: { appId: app.publicId, identityToken: identityToken("rsk_attacker", c1) } });
    assert.equal(forged.status, 401);
    const longLived = await http("POST", "/widget/session", { body: { appId: app.publicId, identityToken: identityToken(app.secret, c1, 86400) } });
    assert.equal(longLived.status, 401);
  });

  await step("3-4. customer sends a message → an agent receives it instantly (auto-assigned)", async () => {
    const res = await s1.req("message:send", { body: "Hello, I need help with my device", clientMessageId: `m1-${RUN}` });
    assert.ok(res.ok, JSON.stringify(res));
    conv1 = res.data.conversationId;
    const got = await Promise.race([
      sockA.waitFor("message:new", (p) => p.message.conversationId === conv1),
      sockB.waitFor("message:new", (p) => p.message.conversationId === conv1),
    ]);
    assert.equal(got.message.body, "Hello, I need help with my device");
    const assigned = await Promise.race([
      sockA.waitFor("conversation:assigned", (p) => p.conversation.id === conv1),
      sockB.waitFor("conversation:assigned", (p) => p.conversation.id === conv1),
    ]);
    assert.ok(assigned.conversation.assigneeId, "auto-assigned");
  });

  await step("idempotent retries: same clientMessageId does not duplicate", async () => {
    const res = await s1.req("message:send", { body: "Hello, I need help with my device", clientMessageId: `m1-${RUN}` });
    assert.equal(res.data.duplicate, true);
  });

  const conv1Row = ok(await http("GET", `/conversations/${conv1}`, { token: A }), "conv1");
  const owner = conv1Row.assigneeId === agentA.id ? { agent: agentA, sock: sockA } : { agent: agentB, sock: sockB };
  const other = owner.agent === agentA ? { agent: agentB, sock: sockB } : { agent: agentA, sock: sockA };

  await step("5-6. agent replies → customer receives it instantly; read receipts flow back", async () => {
    const res = await owner.sock.req("message:send", { conversationId: conv1, body: "Hi! Let me check that for you.", clientMessageId: `r1-${RUN}` });
    assert.ok(res.ok, JSON.stringify(res));
    const got = await s1.waitFor("message:new", (p) => p.message.id === res.data.message.id);
    assert.equal(got.message.agent.name, owner.agent.name);
    assert.equal(got.message.isInternal, undefined, "customers never see internal fields");
    await s1.req("conversation:read", { conversationId: conv1 });
    const read = await owner.sock.waitFor("message:read", (p) => p.conversationId === conv1 && p.reader === "CUSTOMER");
    assert.ok(read.readAt);
  });

  await step("internal notes reach agents but never the customer", async () => {
    s1.clear();
    const res = await owner.sock.req("message:send", { conversationId: conv1, body: "Internal: check device poll logs", isInternal: true, clientMessageId: `n1-${RUN}` });
    assert.equal(res.data.message.type, "NOTE");
    await sleep(500);
    assert.ok(!s1.events.some(([n, p]) => n === "message:new" && p.message.id === res.data.message.id));
    const page = ok(await http("GET", `/widget/conversations/${conv1}/messages`, { token: sess1.sessionToken }), "customer history");
    assert.ok(!page.items.some((m) => m.body?.startsWith("Internal:")));
  });

  await step("typing indicators", async () => {
    await s1.req("typing:start", { conversationId: conv1 });
    await owner.sock.waitFor("typing", (p) => p.conversationId === conv1 && p.who === "customer" && p.isTyping);
  });

  let imageAtt;
  await step("7-8. customer uploads an image → agent sees it and can open it", async () => {
    const form = new FormData();
    form.append("file", new Blob([PNG], { type: "image/png" }), "screenshot.png");
    form.append("conversationId", conv1);
    imageAtt = ok(await http("POST", "/attachments", { token: sess1.sessionToken, form }), "upload");
    const res = await s1.req("message:send", { conversationId: conv1, attachmentIds: [imageAtt.id], clientMessageId: `img-${RUN}` });
    assert.ok(res.ok);
    const got = await owner.sock.waitFor("message:new", (p) => p.message.id === res.data.message.id);
    assert.equal(got.message.attachments[0].kind, "IMAGE");
    const img = await fetch(got.message.attachments[0].url);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/png");
    assert.equal(Buffer.from(await img.arrayBuffer()).length, PNG.length);
  });

  await step("14b. upload validation and attachment access control", async () => {
    const fake = new FormData();
    fake.append("file", new Blob(["<script>alert(1)</script>"], { type: "image/png" }), "evil.png");
    assert.equal((await http("POST", "/attachments", { token: sess1.sessionToken, form: fake })).status, 400);
    const forged = await fetch(`${API}/api/support/attachments/${imageAtt.id}/content?exp=9999999999&sig=forged`);
    assert.equal(forged.status, 403);
    // customer 2 cannot refresh a URL for customer 1's attachment
    assert.equal((await http("GET", `/attachments/${imageAtt.id}/url`, { token: sess2.sessionToken })).status, 404);
  });

  await step("15-16. a second customer is assigned round-robin to the other agent", async () => {
    const res = await s2.req("message:send", { body: "Different customer here", clientMessageId: `c2-${RUN}` });
    conv2 = res.data.conversationId;
    assert.notEqual(conv2, conv1);
    const assigned = await other.sock.waitFor("conversation:assigned", (p) => p.conversation.id === conv2, 6000);
    assert.equal(assigned.conversation.assigneeId, other.agent.id);
  });

  await step("14c. customers and plain agents cannot reach conversations that aren't theirs", async () => {
    assert.equal((await http("GET", `/widget/conversations/${conv1}/messages`, { token: sess2.sessionToken })).status, 404);
    assert.equal((await http("GET", `/conversations/${conv1}`, { token: other.agent.token })).status, 404);
    assert.equal((await http("GET", `/conversations`, { token: sess1.sessionToken })).status, 401, "customer token is not an agent token");
    const denied = await s2.req("typing:start", { conversationId: conv1 });
    assert.equal(denied.ok, false);
  });

  await step("9-11. customer calls → agent rings, accepts → signaling relays → call ends and is stored", async () => {
    const start = await s1.req("call:start", { conversationId: conv1 });
    assert.ok(start.ok, JSON.stringify(start));
    const callId = start.data.call.id;
    await owner.sock.waitFor("call:incoming", (p) => p.call.id === callId);
    const accept = await owner.sock.req("call:accept", { callId });
    assert.equal(accept.data.role, "answerer");
    assert.ok(accept.data.iceServers.length >= 1);
    const accepted = await s1.waitFor("call:accepted", (p) => p.call.id === callId);
    assert.equal(accepted.role, "offerer");
    // second accept must lose
    const again = await other.sock.req("call:accept", { callId });
    assert.equal(again.ok, false);
    await s1.req("call:signal", { callId, data: { type: "offer", sdp: "v=0 test-offer" } });
    const sig = await owner.sock.waitFor("call:signal", (p) => p.callId === callId);
    assert.equal(sig.data.sdp, "v=0 test-offer");
    await owner.sock.req("call:signal", { callId, data: { type: "answer", sdp: "v=0 test-answer" } });
    await s1.waitFor("call:signal", (p) => p.callId === callId && p.data.type === "answer");
    // a stranger cannot inject signaling
    const inject = await s2.req("call:signal", { callId, data: { type: "candidate", candidate: {} } });
    assert.equal(inject.ok, false);
    await sleep(1100);
    await s1.req("call:end", { callId });
    const ended = await owner.sock.waitFor("call:ended", (p) => p.callId === callId);
    assert.equal(ended.status, "ENDED");
    assert.ok(ended.durationSec >= 1);
    const history = ok(await http("GET", `/conversations/${conv1}/calls`, { token: owner.agent.token }), "call history");
    assert.equal(history[0].status, "ENDED");
  });

  await step("missed calls are tracked and notify agents", async () => {
    const start = await s2.req("call:start", { conversationId: conv2 });
    const callId = start.data.call.id;
    await other.sock.waitFor("call:incoming", (p) => p.call.id === callId);
    const ended = await s2.waitFor("call:ended", (p) => p.callId === callId, 15000); // ringTimeoutSec = 10
    assert.equal(ended.status, "MISSED");
    const notif = await other.sock.waitFor("notification:new", (p) => p.type === "MISSED_CALL" && p.callId === callId);
    assert.ok(notif.title);
  });

  await step("12-13. customer disconnects, misses messages, reconnects and catches up", async () => {
    const before = new Date().toISOString();
    s1.s.disconnect();
    await sleep(300);
    const m1 = await owner.sock.req("message:send", { conversationId: conv1, body: "Are you still there?", clientMessageId: `off1-${RUN}` });
    const m2 = await owner.sock.req("message:send", { conversationId: conv1, body: "Your device is unlocked now.", clientMessageId: `off2-${RUN}` });
    const again = connect(sess1.sessionToken);
    await again.ready;
    const sync = await again.req("sync", { since: before });
    const ids = sync.data.messages.map((m) => m.id);
    assert.ok(ids.includes(m1.data.message.id) && ids.includes(m2.data.message.id), "missed messages returned by sync");
    const history = ok(await http("GET", `/widget/conversations/${conv1}/messages`, { token: sess1.sessionToken }), "history");
    assert.ok(history.items.length >= 5);
    s1 = again;
  });

  await step("resolve → customer is told; a new customer message reopens the conversation", async () => {
    ok(await http("PATCH", `/conversations/${conv1}`, { token: owner.agent.token, body: { status: "RESOLVED" } }), "resolve");
    const upd = await s1.waitFor("conversation:updated", (p) => p.conversation.id === conv1 && p.conversation.status === "RESOLVED");
    assert.ok(upd);
    const res = await s1.req("message:send", { body: "One more question", clientMessageId: `re-${RUN}` });
    assert.equal(res.data.conversationId, conv1, "reopened inside the window instead of duplicating");
    const row = ok(await http("GET", `/conversations/${conv1}`, { token: owner.agent.token }), "conv");
    assert.equal(row.status, "OPEN");
    assert.equal(row.reopenedCount, 1);
  });

  await step("manual transfer between agents", async () => {
    const r = ok(await http("POST", `/conversations/${conv1}/assign`, { token: owner.agent.token, body: { agentId: other.agent.id, note: "Handing over" } }), "transfer");
    assert.equal(r.assigneeId, other.agent.id);
    await other.sock.waitFor("notification:new", (p) => p.type === "TRANSFERRED" && p.conversationId === conv1);
    assert.equal((await http("GET", `/conversations/${conv1}`, { token: owner.agent.token })).status, 404, "previous owner (plain agent) loses access");
  });

  await step("anonymous visitors keep their history on the same device", async () => {
    const v = ok(await http("POST", "/widget/session", { body: { appId: app.publicId } }), "visitor");
    assert.ok(v.visitorToken && v.customer.isAnonymous);
    const back = ok(await http("POST", "/widget/session", { body: { appId: app.publicId, visitorToken: v.visitorToken } }), "visitor again");
    assert.equal(back.customer.id, v.customer.id);
    assert.equal(back.visitorToken, undefined);
  });
}

async function cleanup() {
  sockets.forEach((s) => s.disconnect());
  try {
    const admin = (await http("POST", "/auth/login", { body: { email: process.env.SUPPORT_ADMIN_EMAIL, password: process.env.SUPPORT_ADMIN_PASSWORD } })).body;
    for (const id of created.agents) await http("DELETE", `/agents/${id}`, { token: admin.accessToken });
    if (created.appId) await http("DELETE", `/applications/${created.appId}`, { token: admin.accessToken });
    console.log(`cleanup: removed application + ${created.agents.length} agents`);
  } catch (e) {
    console.error("cleanup failed — remove the 'E2E …' application and agents manually", e);
  }
}

main()
  .then(() => console.log(`\n✅ ${passed} end-to-end scenarios passed`))
  .catch((e) => {
    console.error(`\n❌ failed after ${passed} passing scenarios:\n`, e);
    process.exitCode = 1;
  })
  .finally(cleanup);
