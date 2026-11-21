// Usage: pnpm --filter @roxshield/support-sdk test:webrtc   (needs Google Chrome installed)
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = await build({ entryPoints: [path.join(here, "entry.ts")], bundle: true, format: "iife", write: false, target: "chrome110" });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("[page error]", e));
  // getUserMedia requires a secure context → serve from a localhost origin
  await page.route("http://localhost/test", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>webrtc</title>" }));
  await page.goto("http://localhost/test");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const r = await page.evaluate(() => window.runCallTests());
  console.log(JSON.stringify(r, null, 2));

  const h = r.happyPath;
  assert.equal(h.customerPhaseAfterStart, "outgoing");
  assert.equal(h.agentPhaseRinging, "incoming");
  assert.equal(h.connected, true);
  assert.equal(h.agentIncomingCleared, true);
  assert.ok(h.customerInboundBytes > 1000, "customer receives audio");
  assert.ok(h.agentInboundBytes > 1000, "agent receives audio");
  assert.equal(h.remoteStreamTracks, 1);
  assert.equal(h.customerTrackDisabled, true);
  assert.equal(h.stillConnectedAfterIceRestart, true);
  assert.deepEqual(h.ended, { customer: "ENDED", agent: "ENDED" });
  assert.equal(h.micReleased, true);
  assert.deepEqual(r.noAgents, { phase: "ended", endStatus: "MISSED", endReason: "no_agents_available" });
  assert.equal(r.declined.endStatus, "REJECTED");
  assert.equal(r.declined.agentIncoming, 0);
  const v = r.videoCall;
  assert.equal(v.callerCameraOnWhileRinging, true, "video call opens the camera");
  assert.equal(v.incomingMedia, "VIDEO");
  assert.ok(v.agentVideoBytes > 20_000, "agent receives the customer's camera");
  assert.ok(v.customerVideoBytes > 20_000, "customer receives the agent's camera");
  assert.equal(v.agentRemoteCameraTracks, 1);
  assert.equal(v.videoSupported, true);
  assert.equal(v.screenBytesGrew, true, "screen share frames flow");
  assert.equal(v.customerRemoteScreenTracks, 1);
  assert.equal(v.cameraStreamReleased, true);
  const u = r.upgradeToVideo;
  assert.equal(u.cameraInitiallyOff, true);
  assert.ok(u.videoBytesAfterUpgrade > 20_000, "voice call upgraded to video without renegotiation");
  console.log("\n✅ WebRTC call engine: all assertions passed");
} finally {
  await browser.close();
}
