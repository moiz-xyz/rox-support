import * as React from "react";
import { createPortal } from "react-dom";
import { CallController, SupportCustomerClient } from "@roxshield/support-sdk";
import type { Message } from "@roxshield/support-sdk";
import { widgetCss } from "./styles";
import * as I from "./icons";
import { CallOverlay, Composer, MessageList } from "./components";
import { useSupportChat } from "./useSupportChat";
import { contrastOn, formatDay, initials } from "./utils";

export interface SupportWidgetAppearance {
  /** Brand colour (hex). Defaults to the colour configured in the dashboard. */
  primaryColor?: string;
  brandName?: string;
  logoUrl?: string;
  position?: "bottom-right" | "bottom-left";
  /** Distance from the viewport edges in px. */
  offsetX?: number;
  offsetY?: number;
  zIndex?: number;
}

export interface SupportWidgetProps {
  /** Public application id from the Rox Support dashboard (Settings → Applications). Not a secret. */
  appId: string;
  /** Rox Shield backend base URL, e.g. "https://shield-api.roxanlabs.com". */
  apiUrl: string;
  /**
   * Short-lived identity token signed by YOUR backend (see createCustomerToken in
   * @roxshield/support-sdk/server). Prefer `getCustomerToken` so the widget can refresh it.
   */
  customerToken?: string;
  /** Called whenever a fresh identity token is needed. Return null for anonymous visitors. */
  getCustomerToken?: () => Promise<string | null | undefined> | string | null | undefined;
  /** Overrides for what is configured in the dashboard. */
  appearance?: SupportWidgetAppearance;
  welcomeTitle?: string;
  welcomeMessage?: string;
  /** "floating" (launcher + popup, default) or "embedded" (fills its container — e.g. an Android WebView). */
  mode?: "floating" | "embedded";
  defaultOpen?: boolean;
  /** Feature switches can only turn features off; the dashboard decides what is available. */
  enableCalls?: boolean;
  enableAttachments?: boolean;
  enableVoiceMessages?: boolean;
  /** Show browser notifications for agent replies while the tab is hidden. Default true. */
  notifications?: boolean;
  onOpenChange?: (open: boolean) => void;
  onUnreadChange?: (count: number) => void;
  /** Escape hatch: the underlying client (e.g. to register a push token). */
  onReady?: (client: SupportCustomerClient) => void;
}

export interface SupportWidgetHandle {
  open(): void;
  close(): void;
  toggle(): void;
  startCall(media?: "AUDIO" | "VIDEO"): Promise<void>;
  client: SupportCustomerClient | null;
}

/** Shadow-DOM host so the widget is immune to (and harmless for) the host page's CSS. */
function useShadowRoot() {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [root, setRoot] = React.useState<ShadowRoot | null>(null);
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    setRoot(shadow);
  }, []);
  return { hostRef, root };
}

export const SupportWidget = React.forwardRef<SupportWidgetHandle, SupportWidgetProps>(function SupportWidget(props, ref) {
  const { hostRef, root } = useShadowRoot();
  const tokenRef = React.useRef(props);
  tokenRef.current = props;

  // One client per (apiUrl, appId), owned by an effect (StrictMode-safe, never created during SSR).
  // Token getters are read through a ref so re-renders don't reconnect.
  const [client, setClient] = React.useState<SupportCustomerClient | null>(null);
  React.useEffect(() => {
    const c = new SupportCustomerClient({
      apiUrl: props.apiUrl,
      appId: props.appId,
      getIdentityToken: () => (tokenRef.current.getCustomerToken ? tokenRef.current.getCustomerToken() : tokenRef.current.customerToken),
    });
    setClient(c);
    return () => {
      c.destroy();
      setClient(null);
    };
  }, [props.apiUrl, props.appId]);

  // The host element always renders (empty during SSR); content is portalled once both are ready.
  return (
    <div ref={hostRef} data-rox-support-widget="" style={props.mode === "embedded" ? { width: "100%", height: "100%" } : undefined}>
      {root && client && createPortal(<WidgetApp key={`${props.apiUrl}|${props.appId}`} {...props} client={client} handleRef={ref} />, root as unknown as Element)}
    </div>
  );
});

function WidgetApp(props: SupportWidgetProps & { client: SupportCustomerClient; handleRef: React.ForwardedRef<SupportWidgetHandle> }) {
  const embedded = props.mode === "embedded";
  const [open, setOpen] = React.useState(embedded || !!props.defaultOpen);
  const [replyTo, setReplyTo] = React.useState<Message | null>(null);
  const { state, call, send, retry, discard, loadOlder, typing, saveProfile, openHistory, viewConversation } = useSupportChat(props.client, {
    isOpen: open,
    notify: props.notifications !== false,
  });

  const setOpenAndNotify = React.useCallback(
    (v: boolean | ((o: boolean) => boolean)) => {
      setOpen((prev) => {
        const next = typeof v === "function" ? v(prev) : v;
        if (next !== prev) props.onOpenChange?.(next);
        return embedded ? true : next;
      });
    },
    [embedded, props.onOpenChange] // eslint-disable-line react-hooks/exhaustive-deps
  );

  React.useEffect(() => props.onUnreadChange?.(state.unread), [state.unread]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (state.status === "ready") props.onReady?.(props.client);
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps
  // an agent calling the customer pops the widget open
  React.useEffect(() => {
    if (call.phase === "incoming") setOpenAndNotify(true);
  }, [call.phase, setOpenAndNotify]);

  const cfg = state.config;
  const features = cfg?.features;
  const callsEnabled = props.enableCalls !== false && !!features?.calls;
  const filesEnabled = props.enableAttachments !== false && !!features?.attachments;
  const voiceEnabled = props.enableVoiceMessages !== false && !!features?.voiceMessages && filesEnabled;
  const primary = props.appearance?.primaryColor || cfg?.appearance.primaryColor || "#4f46e5";
  const brandName = props.appearance?.brandName || cfg?.appearance.brandName || "Support";
  const logoUrl = props.appearance?.logoUrl || cfg?.appearance.logoUrl || null;
  const position = props.appearance?.position || cfg?.appearance.position || "bottom-right";
  const online = !!cfg?.availability.online;
  const callActive = call.phase !== "idle";

  const startCall = React.useCallback(async (media: "AUDIO" | "VIDEO" = "AUDIO") => {
    setOpenAndNotify(true);
    try {
      await props.client.calls.start({
        conversationId: state.conversation?.status !== "RESOLVED" ? state.conversation?.id : undefined,
        media,
        peer: { name: brandName, avatarUrl: logoUrl },
      });
    } catch {
      /* surfaced through the call snapshot */
    }
  }, [props.client, state.conversation, brandName, logoUrl, setOpenAndNotify]);

  React.useImperativeHandle(
    props.handleRef,
    () => ({
      open: () => setOpenAndNotify(true),
      close: () => setOpenAndNotify(false),
      toggle: () => setOpenAndNotify((o) => !o),
      startCall,
      client: props.client,
    }),
    [setOpenAndNotify, startCall, props.client]
  );

  const style = {
    "--rxs-primary": primary,
    "--rxs-primary-contrast": contrastOn(primary),
    "--rxs-offset-x": `${props.appearance?.offsetX ?? 20}px`,
    "--rxs-offset-y": `${props.appearance?.offsetY ?? 20}px`,
    "--rxs-z": String(props.appearance?.zIndex ?? 2147483000),
  } as React.CSSProperties;

  const askProfile = state.customer?.isAnonymous && !state.customer.name && state.messages.some((m) => m.senderType === "CUSTOMER" && !m.pending);
  const viewingPast = !!state.viewingId;

  return (
    <div className={`rxs-root ${position === "bottom-left" ? "rxs-left" : "rxs-right"} ${embedded ? "rxs-embedded" : ""} ${open ? "rxs-open" : ""}`} style={style}>
      <style>{widgetCss}</style>
      {open && (
        <section className="rxs-panel" role="dialog" aria-label={`${brandName} support chat`}>
          <header className="rxs-header">
            <div className="rxs-header-logo">{logoUrl ? <img src={logoUrl} alt="" /> : initials(brandName)}</div>
            <div className="rxs-header-text">
              <div className="rxs-header-title">{brandName}</div>
              <div className="rxs-header-sub">
                <span className={`rxs-dot ${online ? "rxs-on" : ""}`} />
                {state.typing ? `${state.typing.name} is typing…` : online ? "We're online" : "We'll reply as soon as we can"}
              </div>
            </div>
            {callsEnabled && (
              <>
                <button className="rxs-icon-btn" onClick={() => void startCall("AUDIO")} disabled={callActive || state.status !== "ready"} aria-label="Call support" title={online ? "Call support" : "No agents online — calls may be missed"}>
                  <I.IconPhone />
                </button>
                <button className="rxs-icon-btn" onClick={() => void startCall("VIDEO")} disabled={callActive || state.status !== "ready"} aria-label="Video call support" title={online ? "Video call" : "No agents online — calls may be missed"}>
                  <I.IconVideo />
                </button>
              </>
            )}
            <button className="rxs-icon-btn" onClick={() => (state.history ? viewConversation(null) : openHistory())} aria-label="Conversation history" title="Conversation history">
              <I.IconClock />
            </button>
            {!embedded && (
              <button className="rxs-icon-btn" onClick={() => setOpenAndNotify(false)} aria-label="Minimise chat">
                <I.IconChevronDown />
              </button>
            )}
          </header>

          {state.connection === "reconnecting" && <div className="rxs-banner">Connection lost — reconnecting…</div>}
          {viewingPast && (
            <div className="rxs-banner" style={{ background: "var(--rxs-surface)", color: "var(--rxs-muted)" }}>
              Viewing a past conversation · <button style={{ color: "var(--rxs-primary)", fontWeight: 600 }} onClick={() => viewConversation(null)}>Back to current</button>
            </div>
          )}

          {state.status === "loading" ? (
            <div className="rxs-body" aria-busy="true">
              <div className="rxs-skeleton" style={{ height: 64, marginBottom: 16 }} />
              <div className="rxs-skeleton" style={{ height: 36, width: "60%", marginBottom: 10 }} />
              <div className="rxs-skeleton" style={{ height: 36, width: "45%", marginLeft: "auto", marginBottom: 10 }} />
              <div className="rxs-skeleton" style={{ height: 36, width: "70%" }} />
            </div>
          ) : state.status === "error" ? (
            <div className="rxs-body" style={{ display: "grid", placeItems: "center", textAlign: "center", color: "var(--rxs-muted)" }}>
              <div>
                <I.IconAlert width={28} height={28} />
                <p>{state.error}</p>
              </div>
            </div>
          ) : state.history ? (
            <div className="rxs-body">
              <div className="rxs-day" style={{ marginTop: 0 }}>Your conversations</div>
              {state.history.length === 0 && <p className="rxs-system">No conversations yet.</p>}
              {state.history.map((c) => (
                <button key={c.id} className="rxs-file" style={{ width: "100%", textAlign: "left" }} onClick={() => viewConversation(c)}>
                  <span className="rxs-file-icon"><I.IconChat /></span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <div className="rxs-file-name">{c.lastMessagePreview || `Conversation #${c.number}`}</div>
                    <div className="rxs-file-size">{formatDay(c.lastMessageAt)} · {c.status === "RESOLVED" ? "Resolved" : "Open"}</div>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <MessageList
              messages={state.messages}
              typing={state.typing}
              hasMore={state.hasMore}
              loadingMore={state.loadingMore}
              onLoadMore={loadOlder}
              onReply={setReplyTo}
              onRetry={retry}
              onDiscard={discard}
              header={
                !state.hasMore && (
                  <div className="rxs-welcome">
                    <h3>{props.welcomeTitle || cfg?.welcomeTitle}</h3>
                    <p>{online ? props.welcomeMessage || cfg?.welcomeMessage : cfg?.offlineMessage}</p>
                  </div>
                )
              }
              footer={askProfile ? <IntroCard onSave={saveProfile} /> : null}
            />
          )}

          {!viewingPast && !state.history && (
            <Composer
              disabled={state.status !== "ready"}
              placeholder={online ? "Write a message…" : "Leave us a message…"}
              allowFiles={filesEnabled}
              allowVoice={voiceEnabled}
              maxUploadMb={features?.maxUploadMb ?? 10}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onTyping={typing}
              onSend={(input) => {
                send({ ...input, replyTo });
                setReplyTo(null);
              }}
            />
          )}

          {callActive && (
            <CallOverlay
              call={call}
              brandName={brandName}
              logoUrl={logoUrl}
              onAccept={(id, video) => void props.client.calls.accept(id, { video }).catch(() => undefined)}
              onReject={(id) => void props.client.calls.reject(id)}
              onHangup={() => void props.client.calls.hangup()}
              onToggleMute={() => props.client.calls.toggleMute()}
              onToggleCamera={() => void props.client.calls.toggleCamera().catch(() => undefined)}
              onToggleScreen={() => void props.client.calls.toggleScreenShare()}
              onSwitchCamera={() => void props.client.calls.switchCamera()}
              screenShareSupported={CallController.screenShareSupported}
            />
          )}
        </section>
      )}

      {!embedded && (
        <button className="rxs-launcher" onClick={() => setOpenAndNotify((o) => !o)} aria-label={open ? "Close support chat" : `Chat with ${brandName}`} aria-expanded={open}>
          {open ? <I.IconClose /> : <I.IconChat />}
          {!open && state.unread > 0 && <span className="rxs-badge" aria-label={`${state.unread} unread`}>{state.unread > 9 ? "9+" : state.unread}</span>}
          {!open && call.phase === "incoming" && <span className="rxs-badge" style={{ background: "var(--rxs-success)" }}><I.IconPhone width={11} height={11} /></span>}
        </button>
      )}
    </div>
  );
}

function IntroCard({ onSave }: { onSave: (d: { name?: string; email?: string }) => Promise<void> }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  if (saved) return null;
  return (
    <div className="rxs-intro">
      <p>Let us know how to reach you if you leave.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() && !email.trim()) return;
          await onSave({ name: name.trim() || undefined, email: email.trim() || undefined }).catch(() => undefined);
          setSaved(true);
        }}
      >
        <input className="rxs-input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
        <input className="rxs-input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" />
        <button className="rxs-btn" type="submit">Save</button>
      </form>
    </div>
  );
}
