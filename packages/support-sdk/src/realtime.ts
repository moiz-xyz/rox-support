import { io, Socket } from "socket.io-client";
import { Emitter } from "./emitter";
import { SupportError } from "./http";
import { SupportEvents } from "./events";

export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

type RealtimeEvents = {
  state: (state: ConnectionState) => void;
  /** fired after every (re)connect once the server confirmed the session */
  ready: (info: any, isReconnect: boolean) => void;
  event: (name: string, payload: any) => void;
};

export interface RealtimeOptions {
  url: string;
  path: string;
  /** Called on every (re)connect so expired tokens are refreshed transparently. */
  getToken: () => Promise<string>;
}

/**
 * Socket.IO wrapper: token-per-connect auth, promise-based acks and a single event stream.
 * Messages are never only delivered here — on reconnect, clients call `sync` to fill gaps.
 */
export class RealtimeConnection extends Emitter<RealtimeEvents> {
  private socket: Socket | null = null;
  private _state: ConnectionState = "idle";
  private everConnected = false;

  constructor(private readonly opts: RealtimeOptions) {
    super();
  }

  get state() {
    return this._state;
  }

  get id() {
    return this.socket?.id;
  }

  private setState(s: ConnectionState) {
    if (this._state === s) return;
    this._state = s;
    this.emit("state", s);
  }

  connect() {
    if (this.socket) return;
    this.setState("connecting");
    const socket = io(this.opts.url, {
      path: this.opts.path,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      auth: (cb) => {
        this.opts.getToken().then(
          (token) => cb({ token }),
          () => cb({ token: "" })
        );
      },
    });
    this.socket = socket;

    socket.on("connect", () => this.setState("connected"));
    socket.on("disconnect", (reason) => {
      // "io server disconnect" = server kicked us (e.g. expired token) → reconnect manually with a fresh token
      if (reason === "io server disconnect") setTimeout(() => socket.connect(), 500);
      this.setState("reconnecting");
    });
    socket.io.on("reconnect_attempt", () => this.setState("reconnecting"));
    socket.on("connect_error", (err: any) => {
      this.setState(this.everConnected ? "reconnecting" : "connecting");
      if (err?.data?.status === 401 || err?.data?.status === 403) {
        // socket.io stops auto-retrying after middleware errors — retry with a fresh token
        setTimeout(() => socket.connect(), 3000);
      }
    });
    socket.on(SupportEvents.READY, (info) => {
      const reconnect = this.everConnected;
      this.everConnected = true;
      this.emit("ready", info, reconnect);
    });
    socket.onAny((name, payload) => this.emit("event", name, payload));
  }

  /** Emit with acknowledgement; rejects with SupportError on server errors or timeout. */
  request<T = any>(event: string, payload: any, timeoutMs = 15_000): Promise<T> {
    const socket = this.socket;
    if (!socket || !socket.connected) return Promise.reject(new SupportError("Not connected", 0));
    return new Promise<T>((resolve, reject) => {
      socket.timeout(timeoutMs).emit(event, payload, (err: any, res: any) => {
        if (err) return reject(new SupportError("Request timed out", 0));
        if (res?.ok) return resolve(res.data as T);
        reject(new SupportError(res?.error?.message || "Request failed", res?.error?.status ?? 500));
      });
    });
  }

  /** Fire-and-forget (typing indicators, delivery receipts). */
  send(event: string, payload: any) {
    if (this.socket?.connected) this.socket.emit(event, payload, () => undefined);
  }

  get connected() {
    return !!this.socket?.connected;
  }

  disconnect() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.everConnected = false;
    this.setState("disconnected");
  }
}
