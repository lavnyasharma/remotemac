import { z } from "zod";
import { PROTOCOL_VERSION } from "./envelope.js";

/**
 * Every WebSocket message that flows over the signaling connection.
 *
 * Only messages that genuinely travel over the WebSocket are modeled here.
 * `auth.*` is REST (see services/backend/src/routes/auth.ts) and is not part
 * of this union — the WebSocket authenticates using the REST-issued access
 * token during the connection handshake, not via a message.
 */

// ---- Device presence ----------------------------------------------------

const deviceOnlinePayload = z.object({
  deviceId: z.string().uuid(),
});

const deviceOfflinePayload = z.object({
  deviceId: z.string().uuid(),
});

const deviceStatusPayload = z.object({
  deviceId: z.string().uuid(),
  online: z.boolean(),
  lastSeenAt: z.string().datetime().nullable(),
});

// ---- Pairing --------------------------------------------------------------

const pairRequestPayload = z.object({
  pairingCode: z.string().min(6).max(12),
});

const pairApprovePayload = z.object({
  pairingRequestId: z.string().uuid(),
});

const pairRejectPayload = z.object({
  pairingRequestId: z.string().uuid(),
  reason: z.string().optional(),
});

const pairCompletePayload = z.object({
  devicePairId: z.string().uuid(),
});

/** Server -> Mac: pushed when a remote device redeems a pairing code, prompting an approve/reject UI. */
const pairIncomingPayload = z.object({
  devicePairId: z.string().uuid(),
  remoteDeviceId: z.string().uuid(),
  remoteDeviceName: z.string(),
});

// ---- WebRTC signaling -------------------------------------------------------

const webrtcOfferPayload = z.object({
  sessionId: z.string().uuid(),
  sdp: z.string(),
});

const webrtcAnswerPayload = z.object({
  sessionId: z.string().uuid(),
  sdp: z.string(),
});

const webrtcIcePayload = z.object({
  sessionId: z.string().uuid(),
  candidate: z.string(),
  sdpMid: z.string().nullable(),
  sdpMLineIndex: z.number().int().nullable(),
});

// ---- Session ----------------------------------------------------------------

const sessionStartPayload = z.object({
  devicePairId: z.string().uuid(),
  // Omitted (or, from a Swift `Codable` client, `null` — `JSONEncoder` writes `null` for a
  // nil optional rather than dropping the key) by the initiator, which doesn't have one
  // yet; the server generates it, then includes it both in its ack back to the initiator
  // and in the copy relayed to the partner device, so both sides agree on the id to tag
  // their `webrtc.*` messages with.
  sessionId: z.string().uuid().nullable().optional(),
});

const sessionEndPayload = z.object({
  sessionId: z.string().uuid(),
  reason: z.string().optional(),
});

const sessionPingPayload = z.object({
  sentAt: z.number(),
});

const sessionPongPayload = z.object({
  sentAt: z.number(),
});

// ---- Terminal (carried over the WebRTC data channel, not the WebSocket) -----

const terminalStartPayload = z.object({
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

const terminalInputPayload = z.object({
  data: z.string(),
});

const terminalOutputPayload = z.object({
  data: z.string(),
});

const terminalResizePayload = z.object({
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
});

const terminalInterruptPayload = z.object({});

const terminalExitPayload = z.object({
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
});

// ---- Mouse (data channel) ---------------------------------------------------

const normalizedCoordinate = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const mouseMovePayload = normalizedCoordinate;
const mouseDownPayload = normalizedCoordinate;
const mouseUpPayload = normalizedCoordinate;
const mouseClickPayload = normalizedCoordinate;
const mouseDoubleClickPayload = normalizedCoordinate;
const mouseScrollPayload = z.object({
  deltaX: z.number(),
  deltaY: z.number(),
});

// ---- Keyboard (data channel) -------------------------------------------------

const keyboardKeyPayload = z.object({
  key: z.string(),
  down: z.boolean(),
});

const keyboardTextPayload = z.object({
  text: z.string(),
});

const keyboardModifierPayload = z.object({
  modifier: z.enum(["shift", "control", "option", "command"]),
  down: z.boolean(),
});

// ---- Clipboard (data channel) -----------------------------------------------

const clipboardGetPayload = z.object({});
const clipboardSetPayload = z.object({
  text: z.string(),
});

// ---- Diagnostics --------------------------------------------------------------

const diagnosticsPingPayload = z.object({
  sentAt: z.number(),
});

const diagnosticsStatsPayload = z.object({
  transport: z.enum(["p2p", "turn"]),
  rttMs: z.number().nullable(),
  iceState: z.string(),
});

// ---- Error -------------------------------------------------------------------

/** Server -> client: a message the server rejected or a request it couldn't fulfil. */
const errorPayload = z.object({
  message: z.string(),
  inReplyTo: z.string().optional(),
});

export const messageSchemas = {
  "device.online": deviceOnlinePayload,
  "device.offline": deviceOfflinePayload,
  "device.status": deviceStatusPayload,

  "pair.request": pairRequestPayload,
  "pair.approve": pairApprovePayload,
  "pair.reject": pairRejectPayload,
  "pair.complete": pairCompletePayload,
  "pair.incoming": pairIncomingPayload,

  "webrtc.offer": webrtcOfferPayload,
  "webrtc.answer": webrtcAnswerPayload,
  "webrtc.ice": webrtcIcePayload,

  "session.start": sessionStartPayload,
  "session.end": sessionEndPayload,
  "session.ping": sessionPingPayload,
  "session.pong": sessionPongPayload,

  "terminal.start": terminalStartPayload,
  "terminal.input": terminalInputPayload,
  "terminal.output": terminalOutputPayload,
  "terminal.resize": terminalResizePayload,
  "terminal.interrupt": terminalInterruptPayload,
  "terminal.exit": terminalExitPayload,

  "mouse.move": mouseMovePayload,
  "mouse.down": mouseDownPayload,
  "mouse.up": mouseUpPayload,
  "mouse.click": mouseClickPayload,
  "mouse.doubleClick": mouseDoubleClickPayload,
  "mouse.scroll": mouseScrollPayload,

  "keyboard.key": keyboardKeyPayload,
  "keyboard.text": keyboardTextPayload,
  "keyboard.modifier": keyboardModifierPayload,

  "clipboard.get": clipboardGetPayload,
  "clipboard.set": clipboardSetPayload,

  "diagnostics.ping": diagnosticsPingPayload,
  "diagnostics.stats": diagnosticsStatsPayload,

  error: errorPayload,
} as const;

export type MessageType = keyof typeof messageSchemas;

export type PayloadOf<T extends MessageType> = z.infer<(typeof messageSchemas)[T]>;

export type Message = {
  [K in MessageType]: {
    protocolVersion: typeof PROTOCOL_VERSION;
    type: K;
    requestId?: string;
    payload: PayloadOf<K>;
  };
}[MessageType];

export class ProtocolValidationError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProtocolValidationError";
  }
}

/**
 * Parses and validates a raw (already JSON-decoded) message against the
 * protocol schema. Throws {@link ProtocolValidationError} for anything that
 * doesn't match a known message type or fails payload validation — callers
 * must never forward an unvalidated message (Rule 9).
 */
export function parseMessage(raw: unknown): Message {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("type" in raw) ||
    typeof (raw as { type: unknown }).type !== "string"
  ) {
    throw new ProtocolValidationError("Message is not a valid envelope");
  }

  const type = (raw as { type: string }).type;
  const schema = messageSchemas[type as MessageType];
  if (!schema) {
    throw new ProtocolValidationError(`Unknown message type: ${type}`);
  }

  const envelope = raw as { protocolVersion?: unknown; requestId?: unknown; payload?: unknown };
  if (envelope.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolValidationError(
      `Unsupported protocol version: ${String(envelope.protocolVersion)}`,
    );
  }

  const payloadResult = schema.safeParse(envelope.payload);
  if (!payloadResult.success) {
    throw new ProtocolValidationError(
      `Invalid payload for message type "${type}"`,
      payloadResult.error,
    );
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    type,
    ...(typeof envelope.requestId === "string" ? { requestId: envelope.requestId } : {}),
    payload: payloadResult.data,
  } as Message;
}

/** Serializes a validated message to a JSON string ready to send on the wire. */
export function serializeMessage(message: Message): string {
  return JSON.stringify(message);
}
