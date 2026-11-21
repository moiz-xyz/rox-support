// DB-free UI smoke tests: the built dashboard (next start) against a stubbed backend.
// Usage: node tests/ui/run.mjs <screenshot-dir>   (dashboard must be running on :3400)
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import * as F from "./fixtures.mjs";

const require = createRequire(path.resolve("packages/support-sdk/package.json"));
const { chromium } = require("playwright-core");
const OUT = process.argv[2] || "/tmp/rox-support-ui";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3400";

const IMG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#111827"/><rect x="200" y="60" width="200" height="280" rx="24" fill="#1f2937" stroke="#374151" stroke-width="4"/><text x="300" y="190" fill="#f87171" font-family="sans-serif" font-size="22" text-anchor="middle">Device locked</text><text x="300" y="220" fill="#9ca3af" font-family="sans-serif" font-size="14" text-anchor="middle">Contact your shop</text></svg>`;

function api(route) {
  const url = new URL(route.request().url());
  const p = url.pathname.replace(/^\/api\/support/, "");
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  if (p.startsWith("/realtime")) return route.fulfill({ status: 503, body: "" }); // no socket in this test
  if (p.includes("/attachments/") && p.endsWith("/content")) return route.fulfill({ contentType: "image/svg+xml", body: IMG });
  const table = {
    "/auth/me": F.me,
    "/conversations/counts": F.counts,
    "/agents": F.agents,
    "/applications": F.apps,
    "/notifications": F.notifications,
    "/stats/overview": F.stats,
    "/calls": F.calls,
    "/customers": { items: F.conversations.map((c) => ({ ...c.customer, application: { id: "app-1", name: c.application.name }, conversationCount: 3, callCount: 1 })), nextCursor: null },
    "/widget/session": { sessionToken: "x", expiresIn: 7200, customer: { id: "c-1", name: "Ayesha Khan", email: null, isAnonymous: false }, socket: { path: "/api/support/realtime" }, config: F.widgetConfig },
    "/widget/conversations/active": F.widgetConversation,
    "/widget/conversations": [F.widgetConversation],
  };
  if (table[p]) return json(table[p]);
  if (p === "/conversations") return json({ items: url.searchParams.get("view") === "unassigned" ? F.conversations.filter((c) => !c.assigneeId) : F.conversations, nextCursor: null });
  let m;
  if ((m = /^\/conversations\/([^/]+)$/.exec(p))) return json(F.conversations.find((c) => c.id === m[1]) ?? F.conversations[0]);
  if (/^\/conversations\/[^/]+\/messages$/.test(p)) return json({ items: F.messages, hasMore: false });
  if (/^\/widget\/conversations\/[^/]+\/messages$/.test(p)) return json({ items: F.widgetMessages, hasMore: false });
  if (/^\/conversations\/[^/]+\/calls$/.test(p)) return json(F.calls.slice(0, 1));
  if (/^\/conversations\/[^/]+\/assignments$/.test(p)) return json([{ id: "as1", reason: "AUTO", toAgent: { id: "agent-1", name: "Sara Ahmed" }, assignedBy: null, createdAt: new Date(Date.now() - 299 * 60000).toISOString() }]);
  if (/^\/customers\/[^/]+$/.test(p)) return json(F.customerDetail);
  if (p.endsWith("/read")) return json({ success: true });
  if (p === "/widget/messages") {
    const body = JSON.parse(route.request().postData() || "{}");
    return json({ message: { ...F.widgetMessages[0], id: `srv-${Date.now()}`, body: body.body, clientMessageId: body.clientMessageId, status: "SENT", createdAt: new Date().toISOString() }, conversationId: "conv-1" });
  }
  console.warn("unstubbed", route.request().method(), p);
  return json({ message: "not stubbed" }, 404);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const results = [];
async function shoot(name, url, viewport, after) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  await ctx.route(`${F.API}/**`, api);
  await ctx.addInitScript(() => {
    localStorage.setItem("rox-support:agent-session", JSON.stringify({ accessToken: "a", refreshToken: "r".repeat(40), expiresIn: 3600, obtainedAt: Date.now() }));
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource|WebSocket|socket\.io|503/.test(m.text()) && errors.push(`${name} console: ${m.text()}`));
  await page.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  if (after) await after(page).catch((e) => errors.push(`${name}: step failed — ${e.message.split("\n")[0]}`));
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  results.push({ name, file, horizontalOverflow: overflow });
  await ctx.close();
}

const desktop = { width: 1440, height: 900 };
const laptop = { width: 1180, height: 800 };
const phone = { width: 390, height: 844 };

await shoot("login-desktop", "/login", desktop);
await shoot("dashboard-desktop", "/dashboard", desktop);
await shoot("inbox-desktop", "/inbox/all/conv-1", desktop);
await shoot("inbox-laptop-panel", "/inbox/all/conv-1", laptop, async (p) => {
  await p.getByRole("button", { name: "Toggle customer details" }).click();
  await p.waitForTimeout(300);
});
await shoot("inbox-note-mode", "/inbox/mine/conv-1", desktop, async (p) => {
  await p.getByRole("button", { name: "Internal note" }).click();
  await p.getByRole("textbox", { name: "Internal note" }).fill("Escalating to Hamza — device hasn't polled in 3 days.");
});
await shoot("inbox-list-mobile", "/inbox/all", phone);
await shoot("inbox-chat-mobile", "/inbox/all/conv-1", phone);
await shoot("agents-desktop", "/agents", desktop);
await shoot("settings-apps", "/settings", desktop, async (p) => {
  await p.getByRole("tab", { name: "Applications & widget" }).click();
  await p.waitForTimeout(300);
});
await shoot("contacts-desktop", "/contacts", desktop);
await shoot("calls-desktop", "/calls", desktop);
await shoot("widget-embedded-mobile", "/embed?appId=app_W7cR2nB8vYe#token=t", phone, async (p) => {
  const host = p.locator("[data-rox-support-widget]");
  await host.waitFor();
  await p.waitForTimeout(800);
  // send a message through the composer (inside the shadow root — Playwright pierces it)
  await p.getByRole("textbox", { name: "Message" }).fill("Is there any update on my device?");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(800);
});

// floating launcher mode, hosted by the example Next.js app on :3500
const openLauncher = async (p) => {
  await p.getByRole("button", { name: /Chat with/ }).click();
  await p.waitForTimeout(900);
};
await shoot("host-launcher-desktop", "http://localhost:3500/", desktop);
await shoot("host-widget-open-desktop", "http://localhost:3500/", desktop, openLauncher);
await shoot("host-widget-open-mobile", "http://localhost:3500/", phone, openLauncher);

await browser.close();
console.log(JSON.stringify({ results, errors }, null, 2));
if (errors.length || results.some((r) => r.horizontalOverflow)) process.exit(1);
