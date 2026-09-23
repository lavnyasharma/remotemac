import { AppState } from 'react-native';
import { create } from 'zustand';
import type { MediaStream } from 'react-native-webrtc';
import { apiClient } from '../services/api/apiClient';
import { SignalingClient, type ConnectionStatus } from '../services/signaling/signalingClient';
import { WebRTCClient, type DataChannelStatus, type PeerConnectionState } from '../services/webrtc/webrtcClient';
import type { IncomingMessage } from '../types/protocol';
import { useAuthStore } from './authStore';

/** Reconnect backoff: 1s, 2s, 4s, ... capped at 30s, with jitter so a backend restart
 * doesn't get every client reconnecting in the same instant. */
function backoffDelayMs(attempt: number): number {
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

/** A peer connection in 'disconnected' often recovers by itself within a few seconds (brief
 * packet loss); only rebuild the session if it's still down after this long. */
const PEER_DISCONNECT_GRACE_MS = 4000;

export type PairingStatus =
  | { kind: 'idle' }
  | { kind: 'redeeming' }
  | { kind: 'awaitingApproval' }
  | { kind: 'paired'; devicePairId: string }
  | { kind: 'rejected'; reason?: string }
  | { kind: 'failed'; message: string };

export type WebrtcTestStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'success'; rttMs: number }
  | { kind: 'failed'; message: string };

/** Screen Mode's own connection status — distinct from `webrtcTestStatus`'s ping/pong result. */
export type ScreenSessionStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'reconnecting' }
  | { kind: 'connected' }
  | { kind: 'failed'; message: string };

interface PairingState {
  connectionStatus: ConnectionStatus;
  /** Diagnostic-only: the most recent raw WS open/close/error event, surfaced in the UI
   * because Release-build console.log doesn't reach any log stream we can capture from a
   * physical device without Console.app. Remove once the WS connectivity issue is fixed. */
  lastWsDebug: string | null;
  pairingStatus: PairingStatus;
  pairedDeviceOnline: boolean;
  client: SignalingClient | null;
  dataChannelStatus: DataChannelStatus | 'idle';
  webrtcTestStatus: WebrtcTestStatus;
  screenSessionStatus: ScreenSessionStatus;
  remoteStream: MediaStream | null;
  /** The Mac's actual captured pixel dimensions (see `video.info` below) — needed to map a
   * tap on the video through `objectFit="contain"`'s letterboxing onto the right point,
   * rather than assuming the video fills its whole display box. */
  videoContentSize: { width: number; height: number } | null;
  connect: (deviceId: string, accessToken: string) => void;
  disconnect: () => void;
  submitPairingCode: (code: string) => void;
  testConnection: () => Promise<number | null>;
  testWebrtcConnection: (devicePairId: string) => Promise<void>;
  /** Establishes the WebRTC session for Screen Mode and leaves it open (no ping/pong test). */
  connectScreenSession: (devicePairId: string) => Promise<void>;
  /** Screen Mode was left — stop automatically re-establishing its session. */
  endScreenSession: () => void;
  /** Reconnect signaling right away (resetting the backoff) if it isn't connected. */
  reconnectNow: () => void;
  /** Fire-and-forget mouse/keyboard message over the "control" data channel. Silently
   * dropped if the channel isn't open — every message in the wire contract is a bare
   * best-effort event, never acked. */
  sendControlMessage: (message: { type: string; payload: unknown }) => void;
}

/** Rejects with `message` if `ms` elapses before the returned resolve/reject pair is used. */
function withTimeout<T>(ms: number, message: string): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    const timer = setTimeout(() => rej(new Error(message)), ms);
    resolve = (value) => {
      clearTimeout(timer);
      res(value);
    };
    reject = (error) => {
      clearTimeout(timer);
      rej(error);
    };
  });
  return { promise, resolve, reject };
}

/**
 * The signaling connection and pairing handshake (build plan §25's
 * connectionStore + pairingStore, combined — they're tightly coupled for
 * this phase, and splitting them added no real separation of concerns yet).
 *
 * Also owns the Phase 4 WebRTC test flow and Screen Mode's connection: the
 * iPhone always sends the *initial* offer, so both `testWebrtcConnection` and
 * `connectScreenSession` share `establishConnection` to drive session.start ->
 * offer -> answer -> ICE -> data-channel-open, using the same SignalingClient
 * this store already manages. `testWebrtcConnection` then runs a ping/pong on
 * top; `connectScreenSession` just leaves the channel open for control
 * messages and the Mac's later video-track renegotiation (a mid-session
 * `webrtc.offer` this store answers — see the message handler below). The
 * WebRTCClient instance itself is a plain service-layer object (see
 * webrtcClient.ts), not store state.
 */
export const usePairingStore = create<PairingState>((set, get) => {
  let deviceId: string | null = null;
  /** True between `connect()` and `disconnect()` — any drop in between is unintentional
   * and gets retried. */
  let wantConnected = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** The pair Screen Mode is showing, while it's on screen — its session is rebuilt
   * automatically whenever it drops. */
  let activeScreenPairId: string | null = null;
  let screenRetryAttempt = 0;
  let screenRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let peerDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let peerState: PeerConnectionState | null = null;
  let webrtcClient: WebRTCClient | null = null;
  let sessionId: string | null = null;
  let pendingSessionStart: { resolve: (sessionId: string) => void; reject: (error: Error) => void } | null = null;
  let pendingAnswer: { resolve: () => void; reject: (error: Error) => void } | null = null;

  const teardownWebrtc = () => {
    if (peerDisconnectTimer) {
      clearTimeout(peerDisconnectTimer);
      peerDisconnectTimer = null;
    }
    peerState = null;
    webrtcClient?.close();
    webrtcClient = null;
    sessionId = null;
    pendingSessionStart?.reject(new Error('Disconnected'));
    pendingSessionStart = null;
    pendingAnswer?.reject(new Error('Disconnected'));
    pendingAnswer = null;
  };

  /**
   * Shared by `testWebrtcConnection` and `connectScreenSession`: starts a
   * session, offers, waits for the Mac's answer, exchanges ICE, and resolves
   * once the "control" data channel is open. Leaves the connection open —
   * callers decide what happens next (a ping/pong test, or just leaving it
   * live for Screen Mode).
   */
  const establishConnection = async (devicePairId: string): Promise<WebRTCClient> => {
    const client = get().client;
    // `client.send()` further down silently no-ops if the socket isn't actually OPEN —
    // without this check, a disconnected/reconnecting socket used to fail as an opaque
    // 8-15s timeout ("Timed out waiting for...") with no indication the real problem was
    // never having sent anything at all.
    if (!client || get().connectionStatus !== 'connected') {
      throw new Error('Not connected to the signaling server.');
    }
    // The token handed to `connect()` expires after 15 minutes, which used to make every
    // screen session started after that fail on the ICE-server fetch.
    const token = await useAuthStore.getState().getFreshAccessToken();
    if (!token) throw new Error('Could not refresh your sign-in. Check your internet connection.');

    teardownWebrtc();
    set({ dataChannelStatus: 'idle', remoteStream: null, videoContentSize: null });

    const webrtc = new WebRTCClient();
    webrtcClient = webrtc;

    webrtc.onDataChannelStatusChange = (status) => set({ dataChannelStatus: status });
    webrtc.onIceCandidate = (candidate) => {
      if (!sessionId) return;
      client.send({ type: 'webrtc.ice', payload: { sessionId, ...candidate } });
    };
    webrtc.onRemoteStream = (stream) => set({ remoteStream: stream });
    webrtc.onConnectionStateChange = (state) => {
      if (webrtc !== webrtcClient) return; // a torn-down client's late events
      peerState = state;
      if (peerDisconnectTimer) {
        clearTimeout(peerDisconnectTimer);
        peerDisconnectTimer = null;
      }
      if (state === 'failed') {
        scheduleScreenRecovery(0);
      } else if (state === 'disconnected') {
        peerDisconnectTimer = setTimeout(() => {
          peerDisconnectTimer = null;
          if (webrtc === webrtcClient && peerState !== 'connected') scheduleScreenRecovery(0);
        }, PEER_DISCONNECT_GRACE_MS);
      }
    };
    // Base data-channel message handler — recognizes messages any caller needs regardless
    // of what it does on top (e.g. `testWebrtcConnection`'s ping/pong). Callers that need
    // their own messages too should wrap this (see `previous` there), not replace it.
    webrtc.onDataChannelMessage = (raw) => {
      try {
        const parsed = JSON.parse(raw) as { type?: string; width?: number; height?: number };
        if (parsed.type === 'video.info' && typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          set({ videoContentSize: { width: parsed.width, height: parsed.height } });
        }
      } catch {
        // Not JSON — ignore.
      }
    };

    const iceServers = await apiClient.getIceServers(token);

    const sessionStart = withTimeout<string>(8000, 'Timed out waiting for the server to start a session.');
    pendingSessionStart = sessionStart;
    client.send({ type: 'session.start', payload: { devicePairId } });
    sessionId = await sessionStart.promise;

    const sdp = await webrtc.createOffer(iceServers);
    client.send({ type: 'webrtc.offer', payload: { sessionId, sdp } });

    const answer = withTimeout<void>(15000, 'Timed out waiting for the Mac to answer.');
    pendingAnswer = answer;
    await answer.promise;

    const dataChannelOpen = withTimeout<void>(15000, 'The data channel did not open.');
    if (get().dataChannelStatus === 'open') {
      dataChannelOpen.resolve();
    } else {
      const previous = webrtc.onDataChannelStatusChange;
      webrtc.onDataChannelStatusChange = (status) => {
        previous?.(status);
        if (status === 'open') dataChannelOpen.resolve();
      };
    }
    await dataChannelOpen.promise;

    return webrtc;
  };

  /**
   * Rebuilds Screen Mode's session after it dropped, if Screen Mode is still open. Waits for
   * signaling first — `onSignalingConnected` below calls back in once it's up again.
   */
  const scheduleScreenRecovery = (delayMs: number) => {
    if (!activeScreenPairId || screenRetryTimer) return;
    set({ screenSessionStatus: { kind: 'reconnecting' } });
    screenRetryTimer = setTimeout(() => {
      screenRetryTimer = null;
      const pairId = activeScreenPairId;
      if (!pairId || get().connectionStatus !== 'connected') return;
      void startScreenSession(pairId, true);
    }, delayMs);
  };

  const startScreenSession = async (devicePairId: string, isRecovery: boolean) => {
    set({ screenSessionStatus: { kind: isRecovery ? 'reconnecting' : 'connecting' } });
    try {
      await establishConnection(devicePairId);
      if (activeScreenPairId !== devicePairId) return; // Screen Mode was closed meanwhile
      screenRetryAttempt = 0;
      set({ screenSessionStatus: { kind: 'connected' } });
    } catch (error) {
      if (activeScreenPairId !== devicePairId) return;
      const message = error instanceof Error ? error.message : 'Could not connect to the Mac.';
      set({ screenSessionStatus: { kind: 'failed', message: `${message} Retrying…` } });
      const delay = backoffDelayMs(screenRetryAttempt);
      screenRetryAttempt += 1;
      // Leave the status showing the failure until the retry actually starts.
      screenRetryTimer = setTimeout(() => {
        screenRetryTimer = null;
        if (activeScreenPairId === devicePairId && get().connectionStatus === 'connected') {
          void startScreenSession(devicePairId, true);
        }
      }, delay);
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (!wantConnected || reconnectTimer) return;
    const delay = backoffDelayMs(reconnectAttempt);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void reconnectSignaling();
    }, delay);
  };

  /** Opens a fresh signaling socket with a fresh token — the one from the original
   * `connect()` call is likely expired by the time a drop happens. */
  const reconnectSignaling = async () => {
    if (!wantConnected || !deviceId) return;
    clearReconnectTimer();
    set({ connectionStatus: 'connecting' });
    const token = await useAuthStore.getState().getFreshAccessToken();
    if (!wantConnected) return;
    if (useAuthStore.getState().status !== 'signedIn') {
      // The refresh token was rejected and the user got signed out — stop retrying.
      get().disconnect();
      return;
    }
    if (!token) {
      set({ connectionStatus: 'disconnected' });
      scheduleReconnect();
      return;
    }
    openSignaling(deviceId, token);
  };

  const onSignalingConnected = () => {
    reconnectAttempt = 0;
    // Signaling dropping doesn't necessarily take the peer-to-peer link with it — only
    // rebuild Screen Mode's session if it actually went down too.
    if (activeScreenPairId && peerState !== 'connected' && !screenRetryTimer) {
      const status = get().screenSessionStatus.kind;
      if (status !== 'connecting' && status !== 'reconnecting') {
        void startScreenSession(activeScreenPairId, true);
      } else if (status === 'reconnecting') {
        scheduleScreenRecovery(0);
      }
    }
  };

  // Coming back to the foreground is exactly when a connection is most likely to be dead
  // (iOS suspends sockets in the background) — check right away instead of waiting on the
  // heartbeat or the current backoff delay.
  AppState.addEventListener('change', (state) => {
    if (state !== 'active' || !wantConnected) return;
    if (get().connectionStatus === 'connected') {
      get().client?.probe();
    } else {
      reconnectAttempt = 0;
      void reconnectSignaling();
    }
  });

  function openSignaling(id: string, token: string): void {
    clearReconnectTimer();
    const previous = get().client;
    if (previous) {
      previous.onStatusChange = null;
      previous.onMessage = null;
      previous.disconnect();
    }

    const client = new SignalingClient(id, token);
    client.onStatusChange = (status: ConnectionStatus) => {
      if (get().client !== client) return;
      set({ connectionStatus: status });
      if (status === 'connected') onSignalingConnected();
      if (status === 'disconnected') scheduleReconnect();
    };
    client.onDebug = (detail: string) => set({ lastWsDebug: detail });
    client.onMessage = (message: IncomingMessage) => {
      switch (message.type) {
        case 'pair.complete':
          set({
            pairingStatus: { kind: 'paired', devicePairId: message.payload.devicePairId },
            pairedDeviceOnline: true,
          });
          break;
        case 'pair.reject':
          set({ pairingStatus: { kind: 'rejected', reason: message.payload.reason } });
          break;
        case 'device.status':
          set({ pairedDeviceOnline: message.payload.online });
          break;
        case 'session.start':
          // Always our own request's ack (we're always the offerer) — never a
          // partner-initiated session.
          pendingSessionStart?.resolve(message.payload.sessionId);
          pendingSessionStart = null;
          break;
        case 'session.end':
          teardownWebrtc();
          set({
            dataChannelStatus: 'idle',
            remoteStream: null,
            videoContentSize: null,
            screenSessionStatus: { kind: 'idle' },
          });
          // The Mac ended it (e.g. it restarted or reconnected) — if Screen Mode is still
          // open, bring the session back rather than leaving a frozen screen.
          if (activeScreenPairId) scheduleScreenRecovery(backoffDelayMs(screenRetryAttempt++));
          break;
        case 'webrtc.answer':
          if (webrtcClient && message.payload.sessionId === sessionId) {
            webrtcClient
              .setRemoteAnswer(message.payload.sdp)
              .then(() => pendingAnswer?.resolve())
              .catch((error: unknown) => pendingAnswer?.reject(error instanceof Error ? error : new Error('Failed to apply answer')));
          }
          break;
        case 'webrtc.offer': {
          // We never send the initial offer to ourselves, so any incoming
          // `webrtc.offer` is the Mac renegotiating mid-session (e.g. once it
          // starts screen capture and adds its video track).
          const sid = sessionId;
          if (webrtcClient && sid && message.payload.sessionId === sid) {
            const webrtc = webrtcClient;
            webrtc
              .createAnswerForOffer(message.payload.sdp)
              .then((sdp) => client.send({ type: 'webrtc.answer', payload: { sessionId: sid, sdp } }))
              .catch(() => {
                // Renegotiation failed — leave the existing data channel (and any
                // already-flowing video) alone rather than tearing the session down.
              });
          }
          break;
        }
        case 'webrtc.ice':
          if (webrtcClient && message.payload.sessionId === sessionId) {
            void webrtcClient.addRemoteIceCandidate({
              candidate: message.payload.candidate,
              sdpMid: message.payload.sdpMid,
              sdpMLineIndex: message.payload.sdpMLineIndex,
            });
          }
          break;
        case 'error':
          set({ pairingStatus: { kind: 'failed', message: message.payload.message } });
          pendingSessionStart?.reject(new Error(message.payload.message));
          pendingSessionStart = null;
          pendingAnswer?.reject(new Error(message.payload.message));
          pendingAnswer = null;
          break;
        case 'session.pong':
        case 'unknown':
          break;
      }
    };
    set({ client });
    client.connect();
  }

  return {
    connectionStatus: 'disconnected',
    lastWsDebug: null,
    pairingStatus: { kind: 'idle' },
    pairedDeviceOnline: false,
    client: null,
    dataChannelStatus: 'idle',
    webrtcTestStatus: { kind: 'idle' },
    screenSessionStatus: { kind: 'idle' },
    remoteStream: null,
    videoContentSize: null,

    connect: (id, token) => {
      teardownWebrtc();
      deviceId = id;
      wantConnected = true;
      reconnectAttempt = 0;
      openSignaling(id, token);
    },

    disconnect: () => {
      wantConnected = false;
      clearReconnectTimer();
      teardownWebrtc();
      get().client?.disconnect();
      set({
        client: null,
        connectionStatus: 'disconnected',
        dataChannelStatus: 'idle',
        remoteStream: null,
        videoContentSize: null,
        screenSessionStatus: { kind: 'idle' },
      });
    },

    reconnectNow: () => {
      if (!wantConnected || get().connectionStatus === 'connected') return;
      reconnectAttempt = 0;
      void reconnectSignaling();
    },
    submitPairingCode: (code: string) => {
      const client = get().client;
      // `client.send()` silently no-ops if the socket isn't OPEN yet (still connecting,
      // or already dropped) — setting "awaitingApproval" unconditionally after calling it
      // used to show a false "waiting for approval" that could never resolve, since the
      // request was never actually transmitted. Only show it once the send genuinely went
      // out; otherwise this is a real, reportable failure.
      if (!client || get().connectionStatus !== 'connected') {
        set({ pairingStatus: { kind: 'failed', message: 'Not connected to the server yet — try again in a moment.' } });
        return;
      }
      client.send({ type: 'pair.request', payload: { pairingCode: code } });
      // The server doesn't ack pair.request directly — the next signal is either an
      // `error` (invalid/expired code), or `pair.complete` once the Mac approves.
      // Reflecting "awaiting approval" optimistically avoids sitting on a bare
      // "redeeming" spinner with no feedback while that approval is pending.
      set({ pairingStatus: { kind: 'awaitingApproval' } });
    },

    testConnection: async () => {
      const client = get().client;
      if (!client) return null;
      const sentAt = Date.now();
      try {
        const receivedAt = await client.ping(sentAt);
        return receivedAt - sentAt;
      } catch {
        return null;
      }
    },

    /**
     * Drives the full Phase 4 flow over the existing signaling socket: starts
     * a session, offers, waits for the Mac's answer, exchanges ICE candidates,
     * and once the "control" data channel opens, sends a ping and waits for
     * the matching pong. Only proves the plumbing works end to end — no PTY
     * or media, per the build plan's Phase 4 scope.
     */
    testWebrtcConnection: async (devicePairId: string) => {
      set({ webrtcTestStatus: { kind: 'connecting' } });

      try {
        const webrtc = await establishConnection(devicePairId);

        let resolvePong: ((rttMs: number) => void) | null = null;
        const baseHandler = webrtc.onDataChannelMessage;
        webrtc.onDataChannelMessage = (raw) => {
          baseHandler?.(raw);
          try {
            const parsed = JSON.parse(raw) as { type?: string; sentAt?: number };
            if (parsed.type === 'pong' && typeof parsed.sentAt === 'number') {
              resolvePong?.(Date.now() - parsed.sentAt);
            }
          } catch {
            // Not JSON, or not our ping/pong shape — ignore.
          }
        };

        const pong = withTimeout<number>(5000, 'No pong received from the data channel.');
        resolvePong = pong.resolve;
        webrtc.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
        const rttMs = await pong.promise;

        set({ webrtcTestStatus: { kind: 'success', rttMs } });
      } catch (error) {
        set({ webrtcTestStatus: { kind: 'failed', message: error instanceof Error ? error.message : 'WebRTC test failed.' } });
      }
    },

    /**
     * Screen Mode's entry point: establishes the same session/offer/answer/ICE
     * handshake as `testWebrtcConnection`, but leaves the connection open for
     * mouse/keyboard control messages and the Mac's video renegotiation,
     * rather than running the ping/pong test on top of it.
     */
    connectScreenSession: async (devicePairId: string) => {
      activeScreenPairId = devicePairId;
      screenRetryAttempt = 0;
      if (screenRetryTimer) {
        clearTimeout(screenRetryTimer);
        screenRetryTimer = null;
      }
      await startScreenSession(devicePairId, false);
    },

    endScreenSession: () => {
      activeScreenPairId = null;
      if (screenRetryTimer) {
        clearTimeout(screenRetryTimer);
        screenRetryTimer = null;
      }
    },

    sendControlMessage: (message) => {
      try {
        webrtcClient?.send(JSON.stringify(message));
      } catch {
        // Data channel isn't open — every message on the wire is fire-and-forget,
        // so dropping it silently is the correct behavior, not an error.
      }
    },
  };
});
