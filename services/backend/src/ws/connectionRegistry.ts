import type WebSocket from "ws";

/**
 * Tracks which device currently has an open signaling connection, in memory.
 * A single Render instance is the explicit target for this personal-use
 * deployment (see CLAUDE_BUILD_PLAN.md §49), so there is no need for a
 * shared/Redis-backed registry — presence is inherently per-process.
 */
export class ConnectionRegistry {
  private readonly connections = new Map<string, WebSocket>();

  /** Registers a device's socket, closing and replacing any prior connection for that device. */
  set(deviceId: string, socket: WebSocket): void {
    const existing = this.connections.get(deviceId);
    if (existing && existing !== socket) {
      existing.close(4000, "Replaced by a new connection");
    }
    this.connections.set(deviceId, socket);
  }

  /** Removes a device's socket, but only if it's still the one currently registered. */
  delete(deviceId: string, socket: WebSocket): void {
    if (this.connections.get(deviceId) === socket) {
      this.connections.delete(deviceId);
    }
  }

  get(deviceId: string): WebSocket | undefined {
    return this.connections.get(deviceId);
  }

  isConnected(deviceId: string): boolean {
    return this.connections.has(deviceId);
  }

  /** Sends a JSON string to a device if it's currently connected. Returns whether it was sent. */
  send(deviceId: string, json: string): boolean {
    const socket = this.connections.get(deviceId);
    if (!socket || socket.readyState !== socket.OPEN) return false;
    socket.send(json);
    return true;
  }
}

/**
 * Caches the two device ids on either end of an active session, in memory — same rationale
 * as {@link ConnectionRegistry} (a single Render instance, so no shared/Redis-backed store is
 * needed). Without this, relaying every `webrtc.ice` candidate for a session required two
 * sequential Postgres round trips (`findSessionById` then `findDevicePairById`); trickle ICE
 * can produce a dozen or more candidates per side while a call is connecting, so that latency
 * was paid repeatedly at exactly the moment a "connecting…" spinner is on screen. Populated
 * once per session (on `session.start`) instead.
 */
export class SessionPartnerCache {
  private readonly sessions = new Map<string, { macDeviceId: string; remoteDeviceId: string }>();

  set(sessionId: string, pair: { macDeviceId: string; remoteDeviceId: string }): void {
    this.sessions.set(sessionId, pair);
  }

  get(sessionId: string): { macDeviceId: string; remoteDeviceId: string } | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
