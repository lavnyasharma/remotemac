import { backendEnvironment } from '../../config/backendEnvironment';
import {
  parseIncomingMessage,
  serializeOutgoingMessage,
  type IncomingMessage,
  type OutgoingMessage,
} from '../../types/protocol';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

/** How often a heartbeat `session.ping` goes out while connected. */
const HEARTBEAT_INTERVAL_MS = 20_000;
/** Silence longer than this means the socket is dead even if the OS hasn't noticed yet —
 * common right after a Wi-Fi <-> cellular switch, where a TCP connection can hang for minutes. */
const STALE_AFTER_MS = 45_000;
/** How long `probe()` waits for any reply before declaring the socket dead. */
const PROBE_TIMEOUT_MS = 5_000;

/** Pulls the fields that actually matter off a WS close/error event without risking a
 * circular-reference crash from JSON.stringify on the event's `.target` back-reference. */
function safeStringify(event: unknown): string {
  const e = event as { code?: unknown; reason?: unknown; message?: unknown; type?: unknown };
  return JSON.stringify({ code: e?.code, reason: e?.reason, message: e?.message, type: e?.type });
}

/**
 * Authenticated WebSocket connection to the backend's `/ws` signaling
 * endpoint (see docs/protocol.md). Carries pairing and presence messages
 * only — terminal/screen/input data goes over WebRTC once Phase 4 exists,
 * never through here. Mirrors apps/mac/RemoteMac's SignalingClient.swift.
 *
 * React Native's WebSocket accepts a non-standard third `options.headers`
 * argument, which is how the Authorization bearer token reaches the
 * upgrade request — the same mechanism the backend expects from the Mac
 * client (docs/protocol.md's "Connecting to /ws").
 */
export class SignalingClient {
  private socket: WebSocket | null = null;
  private pendingPing: { resolve: (receivedAt: number) => void; reject: (error: Error) => void } | null = null;
  private pingTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private probeTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastReceivedAt = 0;
  /** Set once this socket has reported 'disconnected', so close + error (which RN fires
   * back to back) and a heartbeat-detected death only ever report it once. */
  private closed = false;

  onMessage: ((message: IncomingMessage) => void) | null = null;
  onStatusChange: ((status: ConnectionStatus) => void) | null = null;
  /** Diagnostic-only: raw open/close/error event details, since Release-build console.log
   * isn't reachable via CLI from a physical device. Remove once WS connectivity is fixed. */
  onDebug: ((detail: string) => void) | null = null;

  constructor(
    private readonly deviceId: string,
    private readonly accessToken: string,
    private readonly baseURL: string = backendEnvironment.webSocketBaseURL,
  ) {}

  connect(): void {
    this.onStatusChange?.('connecting');

    const url = `${this.baseURL}?deviceId=${encodeURIComponent(this.deviceId)}`;
    this.onDebug?.(`connect() url=${url} tokenPrefix=${this.accessToken.slice(0, 12)}`);
    const socket = new WebSocket(url, undefined, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    socket.onopen = () => {
      this.onDebug?.('onopen');
      this.lastReceivedAt = Date.now();
      this.startHeartbeat();
      this.onStatusChange?.('connected');
    };
    socket.onclose = (event: unknown) => {
      this.onDebug?.(`onclose ${safeStringify(event)}`);
      this.markClosed(new Error('Connection closed'));
    };
    socket.onerror = (event: unknown) => {
      this.onDebug?.(`onerror ${safeStringify(event)}`);
      this.markClosed(new Error('Connection error'));
    };
    socket.onmessage = (event) => {
      this.lastReceivedAt = Date.now();
      this.clearProbe();
      this.handleMessage(String(event.data));
    };

    this.socket = socket;
  }

  /** Intentional close: reports nothing, so the owner's reconnect logic doesn't fire. */
  disconnect(): void {
    this.closed = true;
    this.detachAndClose();
    this.failPendingPing(new Error('Disconnected'));
  }

  /**
   * Checks the socket is actually alive rather than trusting `readyState` — after the app
   * was backgrounded or the network changed, a socket can still claim OPEN while nothing
   * gets through. No reply within a few seconds is treated as a drop.
   */
  probe(): void {
    if (this.closed || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.probeTimeout) return;
    this.send({ type: 'session.ping', payload: { sentAt: Date.now() } });
    this.probeTimeout = setTimeout(() => {
      this.probeTimeout = null;
      this.markClosed(new Error('Connection timed out'));
    }, PROBE_TIMEOUT_MS);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastReceivedAt > STALE_AFTER_MS) {
        this.markClosed(new Error('Connection timed out'));
        return;
      }
      this.send({ type: 'session.ping', payload: { sentAt: Date.now() } });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private clearProbe(): void {
    if (this.probeTimeout) {
      clearTimeout(this.probeTimeout);
      this.probeTimeout = null;
    }
  }

  /** Unintentional loss of the connection — reported exactly once as 'disconnected'. */
  private markClosed(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.detachAndClose();
    this.failPendingPing(error);
    this.onStatusChange?.('disconnected');
  }

  private detachAndClose(): void {
    this.stopHeartbeat();
    this.clearProbe();
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;
    socket.close();
  }

  send(message: OutgoingMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.onDebug?.(`send() DROPPED type=${message.type} readyState=${this.socket?.readyState}`);
      return;
    }
    this.socket.send(serializeOutgoingMessage(message));
  }

  /**
   * Sends `session.ping` and resolves with the receive timestamp once the
   * matching `session.pong` arrives (or rejects after a 5s timeout). Only
   * one ping should be in flight at a time — used for the "test connection"
   * action, a single user-initiated check.
   */
  ping(sentAt: number): Promise<number> {
    this.send({ type: 'session.ping', payload: { sentAt } });
    return new Promise<number>((resolve, reject) => {
      this.pendingPing = { resolve, reject };
      this.pingTimeout = setTimeout(() => {
        this.failPendingPing(new Error('The connection did not respond in time.'));
      }, 5000);
    });
  }

  private failPendingPing(error: Error): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
    this.pendingPing?.reject(error);
    this.pendingPing = null;
  }

  private handleMessage(raw: string): void {
    const message = parseIncomingMessage(raw);
    if (message.type === 'session.pong') {
      if (this.pingTimeout) {
        clearTimeout(this.pingTimeout);
        this.pingTimeout = null;
      }
      this.pendingPing?.resolve(Date.now());
      this.pendingPing = null;
    }
    this.onMessage?.(message);
  }
}
