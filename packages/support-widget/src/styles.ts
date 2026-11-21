/**
 * All widget CSS lives inside the shadow root, so host-page styles can't break it and it can't leak
 * into the host. Theme is driven by CSS custom properties set on .rxs-root.
 */
export const widgetCss = `
:host { all: initial; }
.rxs-root {
  --rxs-primary: #4f46e5;
  --rxs-primary-contrast: #ffffff;
  --rxs-bg: #ffffff;
  --rxs-surface: #f6f7f9;
  --rxs-border: #e6e8ec;
  --rxs-text: #111827;
  --rxs-muted: #6b7280;
  --rxs-danger: #dc2626;
  --rxs-success: #16a34a;
  --rxs-radius: 18px;
  --rxs-shadow: 0 24px 60px -12px rgba(15, 23, 42, .28), 0 0 0 1px rgba(15, 23, 42, .05);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px; line-height: 1.45; color: var(--rxs-text);
  -webkit-font-smoothing: antialiased;
  position: fixed; z-index: var(--rxs-z, 2147483000); bottom: var(--rxs-offset-y, 20px);
}
.rxs-root.rxs-right { right: var(--rxs-offset-x, 20px); }
.rxs-root.rxs-left { left: var(--rxs-offset-x, 20px); }
.rxs-root.rxs-embedded { position: static; inset: auto; width: 100%; height: 100%; }
.rxs-root *, .rxs-root *::before, .rxs-root *::after { box-sizing: border-box; }
.rxs-root button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; padding: 0; }
.rxs-root button:disabled { cursor: not-allowed; opacity: .5; }
.rxs-root :focus-visible { outline: 2px solid var(--rxs-primary); outline-offset: 2px; border-radius: 8px; }
.rxs-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* launcher */
.rxs-launcher { width: 58px; height: 58px; border-radius: 50%; background: var(--rxs-primary); color: var(--rxs-primary-contrast);
  display: grid; place-items: center; box-shadow: 0 10px 30px -6px rgba(15,23,42,.35); transition: transform .2s ease, box-shadow .2s ease; position: relative; }
.rxs-launcher:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 14px 34px -6px rgba(15,23,42,.4); }
.rxs-launcher svg { width: 26px; height: 26px; transition: transform .25s ease, opacity .2s ease; }
.rxs-badge { position: absolute; top: -3px; right: -3px; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px;
  background: var(--rxs-danger); color: #fff; font-size: 11px; font-weight: 700; display: grid; place-items: center; border: 2px solid #fff; }

/* panel */
.rxs-panel { position: absolute; bottom: 74px; width: 384px; height: min(640px, calc(100vh - 110px)); background: var(--rxs-bg);
  border-radius: var(--rxs-radius); box-shadow: var(--rxs-shadow); display: flex; flex-direction: column; overflow: hidden;
  transform-origin: bottom right; animation: rxs-pop .22s cubic-bezier(.2,.9,.3,1.2); }
.rxs-left .rxs-panel { transform-origin: bottom left; left: 0; }
.rxs-right .rxs-panel { right: 0; }
.rxs-embedded .rxs-panel { position: relative; bottom: auto; width: 100%; height: 100%; border-radius: 0; box-shadow: none; animation: none; }
@keyframes rxs-pop { from { opacity: 0; transform: translateY(12px) scale(.96); } to { opacity: 1; transform: none; } }
@media (max-width: 480px) {
  .rxs-root:not(.rxs-embedded) .rxs-panel { position: fixed; inset: 0; width: 100%; height: 100%; border-radius: 0; bottom: 0; }
  .rxs-root.rxs-open:not(.rxs-embedded) .rxs-launcher { display: none; }
}

.rxs-header { background: var(--rxs-primary); color: var(--rxs-primary-contrast); padding: 16px 16px 14px; display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.rxs-header-logo { width: 38px; height: 38px; border-radius: 12px; background: rgba(255,255,255,.18); display: grid; place-items: center; overflow: hidden; flex-shrink: 0; font-weight: 700; }
.rxs-header-logo img { width: 100%; height: 100%; object-fit: cover; }
.rxs-header-text { flex: 1; min-width: 0; }
.rxs-header-title { font-weight: 650; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rxs-header-sub { font-size: 12px; opacity: .85; display: flex; align-items: center; gap: 6px; }
.rxs-dot { width: 8px; height: 8px; border-radius: 50%; background: #9ca3af; display: inline-block; }
.rxs-dot.rxs-on { background: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,.25); }
.rxs-icon-btn { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; transition: background .15s; }
.rxs-header .rxs-icon-btn:hover { background: rgba(255,255,255,.16); }
.rxs-icon-btn svg { width: 20px; height: 20px; }

.rxs-banner { font-size: 12px; padding: 6px 12px; text-align: center; background: #fef3c7; color: #92400e; flex-shrink: 0; }
.rxs-banner.rxs-error { background: #fee2e2; color: #991b1b; }

/* messages */
.rxs-body { flex: 1; overflow-y: auto; padding: 16px 14px 8px; background: var(--rxs-bg); scroll-behavior: smooth; overscroll-behavior: contain; }
.rxs-welcome { background: var(--rxs-surface); border-radius: 14px; padding: 14px 16px; margin-bottom: 14px; }
.rxs-welcome h3 { margin: 0 0 4px; font-size: 15px; font-weight: 650; }
.rxs-welcome p { margin: 0; color: var(--rxs-muted); }
.rxs-day { text-align: center; font-size: 11px; color: var(--rxs-muted); margin: 14px 0 8px; text-transform: uppercase; letter-spacing: .04em; }
.rxs-row { display: flex; gap: 8px; margin: 2px 0; align-items: flex-end; }
.rxs-row.rxs-mine { justify-content: flex-end; }
.rxs-row.rxs-gap { margin-top: 10px; }
.rxs-avatar { width: 28px; height: 28px; border-radius: 50%; background: #e5e7eb; color: #374151; font-size: 11px; font-weight: 700; display: grid; place-items: center; flex-shrink: 0; overflow: hidden; }
.rxs-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rxs-avatar.rxs-ghost { visibility: hidden; }
.rxs-bubble-wrap { max-width: 78%; display: flex; flex-direction: column; }
.rxs-mine .rxs-bubble-wrap { align-items: flex-end; }
.rxs-sender { font-size: 11px; color: var(--rxs-muted); margin: 0 0 3px 4px; }
.rxs-bubble { padding: 9px 13px; border-radius: 16px; background: var(--rxs-surface); white-space: pre-wrap; word-wrap: break-word; overflow-wrap: anywhere; }
.rxs-mine .rxs-bubble { background: var(--rxs-primary); color: var(--rxs-primary-contrast); border-bottom-right-radius: 6px; }
.rxs-row:not(.rxs-mine) .rxs-bubble { border-bottom-left-radius: 6px; }
.rxs-bubble a { color: inherit; text-decoration: underline; }
.rxs-bubble.rxs-failed { background: #fee2e2; color: #991b1b; }
.rxs-reply-quote { font-size: 12px; opacity: .8; border-left: 3px solid currentColor; padding-left: 8px; margin-bottom: 6px; max-height: 40px; overflow: hidden; }
.rxs-meta { font-size: 10.5px; color: var(--rxs-muted); margin: 3px 4px 0; display: flex; align-items: center; gap: 4px; }
.rxs-ticks { display: inline-flex; }
.rxs-ticks svg { width: 15px; height: 15px; }
.rxs-ticks.rxs-read { color: var(--rxs-primary); }
.rxs-system { text-align: center; font-size: 12px; color: var(--rxs-muted); margin: 10px auto; max-width: 85%; }
.rxs-call-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: var(--rxs-surface); color: var(--rxs-text); font-size: 12.5px; }
.rxs-call-pill svg { width: 15px; height: 15px; }
.rxs-call-pill.rxs-missed { color: var(--rxs-danger); }

.rxs-images { display: grid; gap: 4px; grid-template-columns: repeat(2, 1fr); margin-bottom: 4px; }
.rxs-images.rxs-single { grid-template-columns: 1fr; }
.rxs-img { border-radius: 12px; overflow: hidden; background: #eef0f3; display: block; max-height: 220px; }
.rxs-img img { width: 100%; height: 100%; max-height: 220px; object-fit: cover; display: block; }
.rxs-file { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 12px; background: var(--rxs-surface); border: 1px solid var(--rxs-border); color: var(--rxs-text); text-decoration: none; margin-bottom: 4px; min-width: 200px; }
.rxs-file-icon { width: 34px; height: 34px; border-radius: 9px; background: #fff; border: 1px solid var(--rxs-border); display: grid; place-items: center; flex-shrink: 0; }
.rxs-file-icon svg { width: 18px; height: 18px; color: var(--rxs-primary); }
.rxs-file-name { font-weight: 550; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.rxs-file-size { font-size: 11px; color: var(--rxs-muted); }
.rxs-audio { width: 230px; height: 36px; display: block; }
.rxs-progress { height: 3px; background: rgba(0,0,0,.08); border-radius: 2px; overflow: hidden; margin-top: 4px; }
.rxs-progress > div { height: 100%; background: var(--rxs-primary); transition: width .15s; }

.rxs-typing { display: inline-flex; gap: 4px; padding: 12px 14px; background: var(--rxs-surface); border-radius: 16px; border-bottom-left-radius: 6px; }
.rxs-typing span { width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; animation: rxs-bounce 1.2s infinite; }
.rxs-typing span:nth-child(2) { animation-delay: .15s; } .rxs-typing span:nth-child(3) { animation-delay: .3s; }
@keyframes rxs-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-4px); opacity: 1; } }

.rxs-skeleton { border-radius: 14px; background: linear-gradient(90deg, #f1f2f4 25%, #e7e9ec 37%, #f1f2f4 63%); background-size: 400% 100%; animation: rxs-shimmer 1.4s ease infinite; }
@keyframes rxs-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
.rxs-load-more { display: block; margin: 0 auto 10px; font-size: 12px; color: var(--rxs-primary); padding: 4px 10px; border-radius: 8px; }

/* intro card */
.rxs-intro { border: 1px solid var(--rxs-border); border-radius: 14px; padding: 12px; margin: 10px 0; background: #fff; }
.rxs-intro p { margin: 0 0 8px; font-size: 13px; color: var(--rxs-muted); }
.rxs-intro form { display: grid; gap: 6px; }
.rxs-input { width: 100%; border: 1px solid var(--rxs-border); border-radius: 10px; padding: 8px 10px; font: inherit; color: inherit; background: #fff; outline: none; }
.rxs-input:focus { border-color: var(--rxs-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--rxs-primary) 18%, transparent); }
.rxs-btn { background: var(--rxs-primary); color: var(--rxs-primary-contrast); border-radius: 10px; padding: 8px 12px; font-weight: 600; }

/* composer */
.rxs-composer { border-top: 1px solid var(--rxs-border); padding: 10px 12px 12px; background: #fff; flex-shrink: 0; }
.rxs-reply-bar { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--rxs-muted); background: var(--rxs-surface); border-radius: 10px; padding: 6px 10px; margin-bottom: 8px; }
.rxs-reply-bar span { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.rxs-staged { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; }
.rxs-chip { position: relative; width: 64px; height: 64px; border-radius: 12px; overflow: hidden; background: var(--rxs-surface); border: 1px solid var(--rxs-border); flex-shrink: 0; display: grid; place-items: center; font-size: 10px; color: var(--rxs-muted); text-align: center; padding: 4px; }
.rxs-chip img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rxs-chip-x { position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; border-radius: 50%; background: rgba(17,24,39,.75); color: #fff; display: grid; place-items: center; z-index: 1; }
.rxs-chip-x svg { width: 12px; height: 12px; }
.rxs-chip .rxs-progress { position: absolute; left: 4px; right: 4px; bottom: 4px; z-index: 1; background: rgba(255,255,255,.6); }
.rxs-input-row { display: flex; align-items: flex-end; gap: 6px; border: 1px solid var(--rxs-border); border-radius: 14px; padding: 4px 4px 4px 12px; transition: border-color .15s, box-shadow .15s; }
.rxs-input-row:focus-within { border-color: var(--rxs-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--rxs-primary) 15%, transparent); }
.rxs-textarea:focus-visible { outline: none; }
.rxs-textarea { flex: 1; resize: none; border: 0; outline: 0; font: inherit; color: inherit; max-height: 120px; min-height: 22px; padding: 8px 0; background: transparent; }
.rxs-tool { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: var(--rxs-muted); transition: background .15s, color .15s; flex-shrink: 0; }
.rxs-tool:hover { background: var(--rxs-surface); color: var(--rxs-text); }
.rxs-tool svg { width: 19px; height: 19px; }
.rxs-send { background: var(--rxs-primary); color: var(--rxs-primary-contrast); }
.rxs-send:hover { background: var(--rxs-primary); filter: brightness(1.08); color: var(--rxs-primary-contrast); }
.rxs-recording { display: flex; align-items: center; gap: 10px; flex: 1; padding: 8px 0; color: var(--rxs-danger); font-variant-numeric: tabular-nums; }
.rxs-rec-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--rxs-danger); animation: rxs-pulse 1s infinite; }
@keyframes rxs-pulse { 50% { opacity: .3; } }
.rxs-powered { text-align: center; font-size: 10.5px; color: #9ca3af; margin-top: 8px; }

/* call overlay */
.rxs-call { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 48px 24px 36px;
  color: #fff; background: radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--rxs-primary) 70%, #0b1020) 0%, #0b1020 75%); animation: rxs-fade .2s ease; }
@keyframes rxs-fade { from { opacity: 0; } }
.rxs-call-who { text-align: center; }
.rxs-call-avatar { width: 96px; height: 96px; border-radius: 50%; margin: 0 auto 18px; background: rgba(255,255,255,.12); display: grid; place-items: center; font-size: 32px; font-weight: 700; position: relative; overflow: hidden; }
.rxs-call-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rxs-ringing .rxs-call-avatar::after { content: ""; position: absolute; inset: -10px; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); animation: rxs-ring 1.6s ease-out infinite; }
@keyframes rxs-ring { from { transform: scale(.85); opacity: 1; } to { transform: scale(1.35); opacity: 0; } }
.rxs-call-name { font-size: 20px; font-weight: 650; }
.rxs-call-state { opacity: .75; margin-top: 4px; font-variant-numeric: tabular-nums; }
.rxs-call-controls { display: flex; gap: 18px; align-items: center; }
.rxs-call-btn { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.14); color: #fff; transition: background .15s, transform .15s; }
.rxs-call-btn:hover { background: rgba(255,255,255,.22); transform: translateY(-1px); }
.rxs-call-btn.rxs-active { background: #fff; color: #0b1020; }
.rxs-call-btn.rxs-hangup { background: var(--rxs-danger); width: 64px; height: 64px; }
.rxs-call-btn.rxs-answer { background: var(--rxs-success); width: 64px; height: 64px; }
.rxs-call-btn svg { width: 24px; height: 24px; }
.rxs-call-label { font-size: 11px; opacity: .7; text-align: center; margin-top: 6px; }
.rxs-call.rxs-has-video { background: #000; padding: 16px 16px 24px; justify-content: flex-end; }
.rxs-call-stage { position: absolute; inset: 0; background: #000; }
.rxs-call-stage video { width: 100%; height: 100%; object-fit: cover; background: #000; }
.rxs-call-stage video.rxs-contain { object-fit: contain; }
.rxs-call-pip { position: absolute; right: 12px; top: 12px; width: 96px; height: 128px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.25); z-index: 2; background: #111; }
.rxs-call-pip video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
.rxs-call-topbar { position: absolute; left: 12px; top: 12px; z-index: 2; background: rgba(0,0,0,.45); border-radius: 10px; padding: 6px 10px; font-size: 12.5px; }
.rxs-call-topbar b { display: block; font-size: 14px; }
.rxs-has-video .rxs-call-who { display: none; }
.rxs-has-video .rxs-call-controls, .rxs-has-video .rxs-call-bottom { position: relative; z-index: 2; }
.rxs-call-controls.rxs-compact { gap: 12px; flex-wrap: wrap; justify-content: center; }
.rxs-call-controls.rxs-compact .rxs-call-btn { width: 48px; height: 48px; }
.rxs-call-controls.rxs-compact .rxs-call-btn.rxs-hangup { width: 56px; height: 56px; }
.rxs-call-controls.rxs-compact .rxs-call-btn svg { width: 21px; height: 21px; }
.rxs-sharing-pill { position: absolute; left: 50%; transform: translateX(-50%); bottom: 132px; z-index: 2; background: rgba(22,163,74,.92); border-radius: 999px; padding: 6px 12px; font-size: 12px; white-space: nowrap; }
.rxs-call-err { background: rgba(220,38,38,.2); border: 1px solid rgba(248,113,113,.5); padding: 8px 12px; border-radius: 10px; font-size: 13px; text-align: center; max-width: 290px; }
.rxs-select { background: rgba(255,255,255,.12); color: #fff; border: 1px solid rgba(255,255,255,.2); border-radius: 8px; padding: 4px 8px; font: inherit; font-size: 12px; max-width: 220px; }

/* lightbox */
.rxs-lightbox { position: fixed; inset: 0; background: rgba(10,12,20,.88); display: grid; place-items: center; z-index: 10; padding: 24px; animation: rxs-fade .15s; }
.rxs-lightbox img { max-width: 100%; max-height: 100%; border-radius: 10px; }
.rxs-lightbox .rxs-icon-btn { position: absolute; top: 14px; right: 14px; color: #fff; background: rgba(255,255,255,.12); }
@media (prefers-reduced-motion: reduce) { .rxs-root * { animation: none !important; transition: none !important; } }
`;
