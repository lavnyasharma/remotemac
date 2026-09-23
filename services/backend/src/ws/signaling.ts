import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import type WebSocket from "ws";
import { parseMessage, serializeMessage, ProtocolValidationError, type PayloadOf } from "@remote-mac/protocol";
import type { Db } from "../db/pool.js";
import { requireUserId } from "../middleware/authenticate.js";
import { findDeviceById, touchDeviceLastSeen } from "../repositories/devicesRepository.js";
import { consumePairingCode } from "../repositories/pairingCodesRepository.js";
import {
  createPendingDevicePair,
  findDevicePairById,
  resolveDevicePair,
  findApprovedPartnerDeviceIds,
  findApprovedPairBetween,
  listPendingDevicePairsForMac,
} from "../repositories/devicePairsRepository.js";
import { createSession, findSessionById, endSession } from "../repositories/sessionsRepository.js";
import { sha256Hex } from "../services/hash.js";
import type { ConnectionRegistry } from "./connectionRegistry.js";
import { SessionPartnerCache } from "./connectionRegistry.js";

declare module "fastify" {
  interface FastifyRequest {
    deviceId?: string;
  }
}

export interface SignalingRoutesOptions {
  db: Db;
  registry: ConnectionRegistry;
}

const connectQuerySchema = z.object({ deviceId: z.string().uuid() });

function requireDeviceId(request: FastifyRequest): string {
  if (!request.deviceId) {
    throw new Error("WebSocket handler reached without a validated deviceId");
  }
  return request.deviceId;
}

function sendError(socket: WebSocket, message: string, inReplyTo?: string): void {
  socket.send(
    serializeMessage({
      protocolVersion: 1,
      type: "error",
      payload: { message, ...(inReplyTo ? { inReplyTo } : {}) },
    }),
  );
}

interface PgUniqueViolation {
  code: string;
}

function isUniqueViolation(error: unknown): error is PgUniqueViolation {
  return typeof error === "object" && error !== null && (error as PgUniqueViolation).code === "23505";
}

export const signalingRoutes: FastifyPluginAsync<SignalingRoutesOptions> = async (app, opts) => {
  const { db, registry } = opts;
  const sessionPartners = new SessionPartnerCache();

  app.decorateRequest("deviceId", undefined);

  app.get(
    "/ws",
    {
      websocket: true,
      preHandler: [
        app.authenticate,
        async (request, reply) => {
          const parsedQuery = connectQuerySchema.safeParse(request.query);
          if (!parsedQuery.success) {
            return reply.code(400).send({ error: "A valid deviceId query parameter is required" });
          }

          const device = await findDeviceById(db, parsedQuery.data.deviceId);
          if (!device || device.userId !== requireUserId(request)) {
            return reply.code(403).send({ error: "Device does not belong to the authenticated user" });
          }

          request.deviceId = device.id;
        },
      ],
    },
    (socket, request) => {
      const deviceId = requireDeviceId(request);

      // Fire-and-forget background work (presence broadcasts, backlog replay) must never
      // produce an unhandled rejection — e.g. it can race a pool shutdown during a close
      // event — so every call here is explicitly caught and logged rather than left bare.
      const background = (promise: Promise<void>, description: string): void => {
        promise.catch((error: unknown) => {
          app.log.warn({ err: error }, `Signaling background task failed: ${description}`);
        });
      };

      // Attach handlers synchronously before any async work, per @fastify/websocket's guidance,
      // so messages arriving during the presence/backlog work below aren't dropped.
      socket.on("message", (raw) => {
        background(
          handleIncoming(db, registry, sessionPartners, socket, deviceId, raw.toString(), app.log),
          "handle message",
        );
      });

      socket.on("close", () => {
        registry.delete(deviceId, socket);
        background(announcePresence(db, registry, deviceId, false), "announce offline presence");
      });

      registry.set(deviceId, socket);
      background(announcePresence(db, registry, deviceId, true), "announce online presence");
      background(sendCurrentPartnerPresence(db, registry, deviceId), "send current partner presence");
      background(flushPendingPairingRequests(db, registry, deviceId), "flush pending pairing requests");
    },
  );
};

async function announcePresence(
  db: Db,
  registry: ConnectionRegistry,
  deviceId: string,
  online: boolean,
): Promise<void> {
  await touchDeviceLastSeen(db, deviceId);
  const device = await findDeviceById(db, deviceId);
  const partners = await findApprovedPartnerDeviceIds(db, deviceId);

  const statusMessage = serializeMessage({
    protocolVersion: 1,
    type: "device.status",
    payload: { deviceId, online, lastSeenAt: device?.lastSeenAt ?? null },
  });

  for (const partnerId of partners) {
    registry.send(partnerId, statusMessage);
  }
}

/**
 * Tells a newly-connected device the *current* online status of every approved partner.
 * `announcePresence` only pushes a status change forward from the moment it happens — a
 * device that (re)connects after its partner already came online has no way to learn that
 * without this, and shows it as offline until the partner's next connect/disconnect event.
 */
async function sendCurrentPartnerPresence(db: Db, registry: ConnectionRegistry, deviceId: string): Promise<void> {
  const partners = await findApprovedPartnerDeviceIds(db, deviceId);
  for (const partnerId of partners) {
    const partnerDevice = await findDeviceById(db, partnerId);
    registry.send(
      deviceId,
      serializeMessage({
        protocolVersion: 1,
        type: "device.status",
        payload: { deviceId: partnerId, online: registry.isConnected(partnerId), lastSeenAt: partnerDevice?.lastSeenAt ?? null },
      }),
    );
  }
}

/** Re-delivers pairing requests a Mac hasn't yet acted on, in case it missed them while offline. */
async function flushPendingPairingRequests(
  db: Db,
  registry: ConnectionRegistry,
  deviceId: string,
): Promise<void> {
  const device = await findDeviceById(db, deviceId);
  if (!device || device.deviceType !== "mac") return;

  const pending = await listPendingDevicePairsForMac(db, deviceId);
  for (const pair of pending) {
    const remoteDevice = await findDeviceById(db, pair.remoteDeviceId);
    if (!remoteDevice) continue;
    registry.send(
      deviceId,
      serializeMessage({
        protocolVersion: 1,
        type: "pair.incoming",
        payload: {
          devicePairId: pair.id,
          remoteDeviceId: pair.remoteDeviceId,
          remoteDeviceName: remoteDevice.name,
        },
      }),
    );
  }
}

async function handleIncoming(
  db: Db,
  registry: ConnectionRegistry,
  sessionPartners: SessionPartnerCache,
  socket: WebSocket,
  deviceId: string,
  raw: string,
  log: { warn: (obj: unknown, msg: string) => void },
): Promise<void> {
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(raw);
  } catch {
    sendError(socket, "Message is not valid JSON");
    return;
  }

  let message;
  try {
    message = parseMessage(parsedRaw);
  } catch (error) {
    const reason = error instanceof ProtocolValidationError ? error.message : "Malformed message";
    log.warn({ err: error }, "Rejected invalid WebSocket message");
    sendError(socket, reason);
    return;
  }

  switch (message.type) {
    case "pair.request":
      await handlePairRequest(db, registry, socket, deviceId, message.payload);
      return;
    case "pair.approve":
      await handlePairResolve(db, registry, socket, deviceId, message.payload.pairingRequestId, "approved");
      return;
    case "pair.reject":
      await handlePairResolve(
        db,
        registry,
        socket,
        deviceId,
        message.payload.pairingRequestId,
        "rejected",
        message.payload.reason,
      );
      return;
    case "session.ping":
      socket.send(
        serializeMessage({
          protocolVersion: 1,
          type: "session.pong",
          payload: { sentAt: message.payload.sentAt },
        }),
      );
      return;
    case "session.start":
      await handleSessionStart(db, registry, sessionPartners, socket, deviceId, message.payload);
      return;
    case "session.end":
      await handleSessionEnd(db, registry, sessionPartners, socket, deviceId, message.payload);
      return;
    case "webrtc.offer":
    case "webrtc.answer":
    case "webrtc.ice":
      await relayWebrtcMessage(db, registry, sessionPartners, socket, deviceId, message.payload.sessionId, raw);
      return;
    default:
      sendError(socket, `Message type "${message.type}" is not handled over this connection`, message.requestId);
  }
}

async function handlePairRequest(
  db: Db,
  registry: ConnectionRegistry,
  socket: WebSocket,
  deviceId: string,
  payload: PayloadOf<"pair.request">,
): Promise<void> {
  const requestingDevice = await findDeviceById(db, deviceId);
  if (!requestingDevice) {
    sendError(socket, "Unknown device");
    return;
  }

  const redeemed = await consumePairingCode(db, sha256Hex(payload.pairingCode));
  if (!redeemed) {
    sendError(socket, "Pairing code is invalid or has expired");
    return;
  }

  // A pairing code is only redeemable by a device on the same account as the Mac that
  // minted it (build plan §8: "Pairing must be associated with authenticated users") —
  // without this check, any signed-in device could redeem another user's code and create
  // a device_pair naming a remote device it doesn't actually own.
  if (requestingDevice.userId !== redeemed.userId) {
    sendError(socket, "Pairing code does not belong to your account");
    return;
  }

  let pair;
  try {
    pair = await createPendingDevicePair(db, {
      userId: redeemed.userId,
      macDeviceId: redeemed.macDeviceId,
      remoteDeviceId: deviceId,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // A pending request between these two exact devices already exists — but if it's
      // already *approved*, this isn't a conflict, it's the Mac side having lost track of
      // its own pairing state (a cleared keychain, a fresh install) and minting a new code
      // for a device it's already paired with. Redeeming it should complete instantly
      // instead of dead-ending the client on an error it has no way to recover from.
      const existing = await findApprovedPairBetween(db, redeemed.macDeviceId, deviceId);
      if (existing) {
        const completeMessage = serializeMessage({
          protocolVersion: 1,
          type: "pair.complete",
          payload: { devicePairId: existing.id },
        });
        socket.send(completeMessage);
        registry.send(redeemed.macDeviceId, completeMessage);
        return;
      }
      sendError(socket, "A pairing request between these devices is already pending or approved");
      return;
    }
    throw error;
  }

  registry.send(
    redeemed.macDeviceId,
    serializeMessage({
      protocolVersion: 1,
      type: "pair.incoming",
      payload: {
        devicePairId: pair.id,
        remoteDeviceId: deviceId,
        remoteDeviceName: requestingDevice.name,
      },
    }),
  );
}

async function handlePairResolve(
  db: Db,
  registry: ConnectionRegistry,
  socket: WebSocket,
  actingDeviceId: string,
  devicePairId: string,
  resolution: "approved" | "rejected",
  reason?: string,
): Promise<void> {
  const pair = await findDevicePairById(db, devicePairId);
  if (!pair || pair.macDeviceId !== actingDeviceId) {
    sendError(socket, "Pairing request not found", devicePairId);
    return;
  }

  const resolved = await resolveDevicePair(db, devicePairId, resolution);
  if (!resolved) {
    sendError(socket, "Pairing request was already resolved", devicePairId);
    return;
  }

  if (resolution === "approved") {
    const completeMessage = serializeMessage({
      protocolVersion: 1,
      type: "pair.complete",
      payload: { devicePairId },
    });
    registry.send(resolved.macDeviceId, completeMessage);
    registry.send(resolved.remoteDeviceId, completeMessage);
  } else {
    registry.send(
      resolved.remoteDeviceId,
      serializeMessage({
        protocolVersion: 1,
        type: "pair.reject",
        payload: { pairingRequestId: devicePairId, ...(reason ? { reason } : {}) },
      }),
    );
  }
}

/** The other device in an approved pair, given one side's id — null if `deviceId` isn't in it. */
function partnerDeviceId(pair: { macDeviceId: string; remoteDeviceId: string }, deviceId: string): string | null {
  if (pair.macDeviceId === deviceId) return pair.remoteDeviceId;
  if (pair.remoteDeviceId === deviceId) return pair.macDeviceId;
  return null;
}

async function handleSessionStart(
  db: Db,
  registry: ConnectionRegistry,
  sessionPartners: SessionPartnerCache,
  socket: WebSocket,
  deviceId: string,
  payload: PayloadOf<"session.start">,
): Promise<void> {
  const pair = await findDevicePairById(db, payload.devicePairId);
  const partnerId = pair ? partnerDeviceId(pair, deviceId) : null;
  if (!pair || pair.status !== "approved" || !partnerId) {
    sendError(socket, "Device pair not found or not approved");
    return;
  }

  const session = await createSession(db, pair.id);
  sessionPartners.set(session.id, { macDeviceId: pair.macDeviceId, remoteDeviceId: pair.remoteDeviceId });

  // Both the initiator (who sent this without a sessionId) and the partner need the
  // server-assigned id, so they tag every `webrtc.*` message for this session identically.
  const startMessage = serializeMessage({
    protocolVersion: 1,
    type: "session.start",
    payload: { devicePairId: pair.id, sessionId: session.id },
  });
  socket.send(startMessage);
  registry.send(partnerId, startMessage);
}

async function handleSessionEnd(
  db: Db,
  registry: ConnectionRegistry,
  sessionPartners: SessionPartnerCache,
  socket: WebSocket,
  deviceId: string,
  payload: PayloadOf<"session.end">,
): Promise<void> {
  const session = await findSessionById(db, payload.sessionId);
  if (!session) {
    sendError(socket, "Session not found");
    return;
  }
  const pair = await findDevicePairById(db, session.devicePairId);
  const partnerId = pair ? partnerDeviceId(pair, deviceId) : null;
  if (!partnerId) {
    sendError(socket, "Session does not belong to this device");
    return;
  }

  await endSession(db, session.id, payload.reason);
  sessionPartners.delete(session.id);
  registry.send(
    partnerId,
    serializeMessage({
      protocolVersion: 1,
      type: "session.end",
      payload: { sessionId: session.id, ...(payload.reason ? { reason: payload.reason } : {}) },
    }),
  );
}

/**
 * Forwards a `webrtc.offer`/`webrtc.answer`/`webrtc.ice` message verbatim to the other
 * device in the session's pair. The backend never inspects SDP/ICE contents (build plan
 * §10: the WebSocket only signals — it doesn't relay call media) — it just authorizes
 * and routes.
 *
 * Checks `sessionPartners` (populated by `handleSessionStart`, cleared by `handleSessionEnd`)
 * before touching Postgres. Trickle ICE can send a dozen-plus candidates per side while a call
 * is connecting, each previously paying two sequential DB round trips here — exactly the
 * latency a "connecting…" spinner shouldn't have. A cache miss (e.g. after a process restart —
 * `sessionPartners` is in-memory only, same rationale as `ConnectionRegistry`) falls back to
 * the authoritative DB check and repopulates the cache.
 */
async function relayWebrtcMessage(
  db: Db,
  registry: ConnectionRegistry,
  sessionPartners: SessionPartnerCache,
  socket: WebSocket,
  deviceId: string,
  sessionId: string,
  raw: string,
): Promise<void> {
  const cachedPair = sessionPartners.get(sessionId);
  if (cachedPair) {
    const partnerId = partnerDeviceId(cachedPair, deviceId);
    if (!partnerId) {
      sendError(socket, "Session does not belong to this device");
      return;
    }
    registry.send(partnerId, raw);
    return;
  }

  const session = await findSessionById(db, sessionId);
  if (!session || session.status !== "active") {
    sendError(socket, "Session not found or has ended");
    return;
  }
  const pair = await findDevicePairById(db, session.devicePairId);
  const partnerId = pair ? partnerDeviceId(pair, deviceId) : null;
  if (!pair || !partnerId) {
    sendError(socket, "Session does not belong to this device");
    return;
  }

  sessionPartners.set(sessionId, { macDeviceId: pair.macDeviceId, remoteDeviceId: pair.remoteDeviceId });
  registry.send(partnerId, raw);
}
