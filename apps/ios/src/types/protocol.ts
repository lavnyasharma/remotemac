import { z } from 'zod';

/**
 * Hand-maintained TypeScript mirror of the message subset in
 * `packages/protocol/src/messages.ts` that the iPhone app actually sends or
 * receives — analogous to apps/mac/RemoteMac's ProtocolMessages.swift. Not
 * generated; keep in sync with the TypeScript source of truth when either
 * side changes.
 */
export const PROTOCOL_VERSION = 1 as const;

const deviceStatusPayload = z.object({
  deviceId: z.string(),
  online: z.boolean(),
  lastSeenAt: z.string().nullable(),
});

const pairCompletePayload = z.object({
  devicePairId: z.string(),
});

const pairRejectPayload = z.object({
  pairingRequestId: z.string(),
  reason: z.string().optional(),
});

const sessionPongPayload = z.object({
  sentAt: z.number(),
});

/**
 * `session.start` arrives here as the server's ack to our own request (carrying the
 * server-assigned `sessionId`) — we never receive a partner-initiated one, since the
 * iPhone is always the offerer (see webrtcClient.ts).
 */
const sessionStartPayload = z.object({
  devicePairId: z.string(),
  sessionId: z.string(),
});

const sessionEndPayload = z.object({
  sessionId: z.string(),
  reason: z.string().optional(),
});

const webrtcSdpPayload = z.object({
  sessionId: z.string(),
  sdp: z.string(),
});

const webrtcIcePayload = z.object({
  sessionId: z.string(),
  candidate: z.string(),
  sdpMid: z.string().nullable(),
  sdpMLineIndex: z.number().nullable(),
});

const errorPayload = z.object({
  message: z.string(),
  inReplyTo: z.string().optional(),
});

const incomingSchemas = {
  'device.status': deviceStatusPayload,
  'pair.complete': pairCompletePayload,
  'pair.reject': pairRejectPayload,
  'session.pong': sessionPongPayload,
  'session.start': sessionStartPayload,
  'session.end': sessionEndPayload,
  'webrtc.offer': webrtcSdpPayload,
  'webrtc.answer': webrtcSdpPayload,
  'webrtc.ice': webrtcIcePayload,
  error: errorPayload,
} as const;

export type IncomingMessageType = keyof typeof incomingSchemas;

export type IncomingMessage =
  | { type: 'device.status'; payload: z.infer<typeof deviceStatusPayload> }
  | { type: 'pair.complete'; payload: z.infer<typeof pairCompletePayload> }
  | { type: 'pair.reject'; payload: z.infer<typeof pairRejectPayload> }
  | { type: 'session.pong'; payload: z.infer<typeof sessionPongPayload> }
  | { type: 'session.start'; payload: z.infer<typeof sessionStartPayload> }
  | { type: 'session.end'; payload: z.infer<typeof sessionEndPayload> }
  // Only ever the Mac's mid-session renegotiation (e.g. once it starts screen
  // capture) — the iPhone's own initial offer is never echoed back to it.
  | { type: 'webrtc.offer'; payload: z.infer<typeof webrtcSdpPayload> }
  | { type: 'webrtc.answer'; payload: z.infer<typeof webrtcSdpPayload> }
  | { type: 'webrtc.ice'; payload: z.infer<typeof webrtcIcePayload> }
  | { type: 'error'; payload: z.infer<typeof errorPayload> }
  | { type: 'unknown'; rawType: string };

/**
 * Parses and validates a raw WebSocket text frame. Never trusts server input
 * blindly — an unknown type or a payload that fails schema validation both
 * degrade to `{ type: 'unknown' }` rather than throwing, since a single
 * malformed message shouldn't crash the socket's message handler.
 */
export function parseIncomingMessage(raw: string): IncomingMessage {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { type: 'unknown', rawType: '<invalid JSON>' };
  }

  if (typeof json !== 'object' || json === null || !('type' in json)) {
    return { type: 'unknown', rawType: '<missing type>' };
  }

  const type = (json as { type: unknown }).type;
  if (typeof type !== 'string' || !(type in incomingSchemas)) {
    return { type: 'unknown', rawType: typeof type === 'string' ? type : '<invalid type>' };
  }

  const schema = incomingSchemas[type as IncomingMessageType];
  const payload = 'payload' in json ? (json as { payload: unknown }).payload : undefined;
  const result = schema.safeParse(payload);
  if (!result.success) {
    return { type: 'unknown', rawType: type };
  }

  return { type, payload: result.data } as IncomingMessage;
}

export interface PairRequestPayload {
  pairingCode: string;
}

export interface SessionPingPayload {
  sentAt: number;
}

export interface SessionStartRequestPayload {
  devicePairId: string;
}

export interface SessionEndRequestPayload {
  sessionId: string;
  reason?: string;
}

export interface WebrtcSdpRequestPayload {
  sessionId: string;
  sdp: string;
}

export interface WebrtcIceRequestPayload {
  sessionId: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export type OutgoingMessage =
  | { type: 'pair.request'; payload: PairRequestPayload }
  | { type: 'session.ping'; payload: SessionPingPayload }
  | { type: 'session.start'; payload: SessionStartRequestPayload }
  | { type: 'session.end'; payload: SessionEndRequestPayload }
  | { type: 'webrtc.offer'; payload: WebrtcSdpRequestPayload }
  // Sent only in reply to the Mac's mid-session renegotiation offer above.
  | { type: 'webrtc.answer'; payload: WebrtcSdpRequestPayload }
  | { type: 'webrtc.ice'; payload: WebrtcIceRequestPayload };

export function serializeOutgoingMessage(message: OutgoingMessage): string {
  return JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...message });
}
