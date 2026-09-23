import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type WebSocket from "ws";
import { buildApp } from "../app.js";
import { createTestEnv } from "../testUtils/env.js";
import { createTestPool, resetTestDb } from "../testUtils/db.js";
import { findDevicePairById } from "../repositories/devicePairsRepository.js";
import type { Db } from "../db/pool.js";

let app: FastifyInstance;
let db: Db;

before(async () => {
  db = createTestPool();
  app = await buildApp({ env: createTestEnv(), db });
  await app.ready();
});

after(async () => {
  await app.close();
  await db.end();
});

beforeEach(async () => {
  await resetTestDb(db);
});

interface Session {
  accessToken: string;
  macDeviceId: string;
  iphoneDeviceId: string;
}

async function setUpPairOfDevices(email: string): Promise<Session> {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "correct-horse-battery" },
  });
  const accessToken = registerResponse.json().accessToken;

  const macResponse = await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { deviceType: "mac", name: "Test Mac", platform: "macos", publicIdentifier: `mac-${email}` },
  });
  const iphoneResponse = await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { deviceType: "iphone", name: "Test iPhone", platform: "ios", publicIdentifier: `iphone-${email}` },
  });

  return {
    accessToken,
    macDeviceId: macResponse.json().device.id,
    iphoneDeviceId: iphoneResponse.json().device.id,
  };
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for a message")), 2000);
    socket.once("message", (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()));
    });
  });
}

/**
 * Like `nextMessage`, but skips past any interleaved presence/status broadcasts (e.g. the
 * `device.status` a socket gets immediately on connect if its partner is already online) to
 * find the next message of a specific type.
 */
function nextMessageOfType(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error(`Timed out waiting for a "${type}" message`));
    }, 2000);
    const onMessage = (data: Buffer): void => {
      const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
      if (parsed.type === type) {
        clearTimeout(timeout);
        socket.off("message", onMessage);
        resolve(parsed);
      }
    };
    socket.on("message", onMessage);
  });
}

test("rejects a connection without a bearer token", async () => {
  await assert.rejects(
    () => app.injectWS(`/ws?deviceId=00000000-0000-0000-0000-000000000000`),
    /Unexpected server response: 401/,
  );
});

test("rejects a connection for a device that isn't the caller's", async () => {
  const alice = await setUpPairOfDevices("alice-ws@example.com");
  const bob = await setUpPairOfDevices("bob-ws@example.com");

  await assert.rejects(
    () =>
      app.injectWS(`/ws?deviceId=${bob.macDeviceId}`, {
        headers: { authorization: `Bearer ${alice.accessToken}` },
      }),
    /Unexpected server response: 403/,
  );
});

test("full pairing handshake: redeem code, approve, both sides notified", async () => {
  const session = await setUpPairOfDevices("pairing-flow@example.com");

  const pairingResponse = await app.inject({
    method: "POST",
    url: "/pairing/request",
    headers: { authorization: `Bearer ${session.accessToken}` },
    payload: { macDeviceId: session.macDeviceId },
  });
  const { pairingCode } = pairingResponse.json();

  const macSocket = await app.injectWS(`/ws?deviceId=${session.macDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  const iphoneSocket = await app.injectWS(`/ws?deviceId=${session.iphoneDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });

  try {
    const incomingPromise = nextMessage(macSocket);
    iphoneSocket.send(JSON.stringify({ protocolVersion: 1, type: "pair.request", payload: { pairingCode } }));

    const incoming = await incomingPromise;
    assert.equal(incoming.type, "pair.incoming");
    const devicePairId = (incoming.payload as { devicePairId: string }).devicePairId;
    assert.ok(devicePairId);

    const macCompletePromise = nextMessage(macSocket);
    const iphoneCompletePromise = nextMessage(iphoneSocket);
    macSocket.send(
      JSON.stringify({ protocolVersion: 1, type: "pair.approve", payload: { pairingRequestId: devicePairId } }),
    );

    const [macComplete, iphoneComplete] = await Promise.all([macCompletePromise, iphoneCompletePromise]);
    assert.equal(macComplete.type, "pair.complete");
    assert.equal(iphoneComplete.type, "pair.complete");

    const pair = await findDevicePairById(db, devicePairId);
    assert.equal(pair?.status, "approved");
  } finally {
    macSocket.terminate();
    iphoneSocket.terminate();
  }
});

test("a device connecting after its paired partner learns its current online status immediately", async () => {
  const session = await setUpPairOfDevices("presence-sync@example.com");

  const pairingResponse = await app.inject({
    method: "POST",
    url: "/pairing/request",
    headers: { authorization: `Bearer ${session.accessToken}` },
    payload: { macDeviceId: session.macDeviceId },
  });
  const { pairingCode } = pairingResponse.json();

  const macSocket = await app.injectWS(`/ws?deviceId=${session.macDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  const firstIphoneSocket = await app.injectWS(`/ws?deviceId=${session.iphoneDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });

  try {
    const incomingPromise = nextMessage(macSocket);
    firstIphoneSocket.send(JSON.stringify({ protocolVersion: 1, type: "pair.request", payload: { pairingCode } }));
    const devicePairId = (await incomingPromise).payload as { devicePairId: string };

    const macCompletePromise = nextMessage(macSocket);
    macSocket.send(
      JSON.stringify({ protocolVersion: 1, type: "pair.approve", payload: { pairingRequestId: devicePairId.devicePairId } }),
    );
    await macCompletePromise;
  } finally {
    firstIphoneSocket.terminate();
  }

  // The iPhone reconnects (e.g. app relaunch) well after the Mac is already connected —
  // it should learn the Mac is online right away, not just on the Mac's next status change.
  const secondIphoneSocket = await app.injectWS(`/ws?deviceId=${session.iphoneDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  try {
    const status = await nextMessage(secondIphoneSocket);
    assert.equal(status.type, "device.status");
    assert.equal((status.payload as { deviceId: string }).deviceId, session.macDeviceId);
    assert.equal((status.payload as { online: boolean }).online, true);
  } finally {
    macSocket.terminate();
    secondIphoneSocket.terminate();
  }
});

test("redeeming a new code for an already-approved pair completes instantly instead of erroring", async () => {
  const session = await setUpPairOfDevices("already-paired@example.com");

  const macSocket = await app.injectWS(`/ws?deviceId=${session.macDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  const iphoneSocket = await app.injectWS(`/ws?deviceId=${session.iphoneDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });

  try {
    // Complete a first pairing handshake.
    const firstCodeResponse = await app.inject({
      method: "POST",
      url: "/pairing/request",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { macDeviceId: session.macDeviceId },
    });
    const incomingPromise = nextMessage(macSocket);
    iphoneSocket.send(
      JSON.stringify({
        protocolVersion: 1,
        type: "pair.request",
        payload: { pairingCode: firstCodeResponse.json().pairingCode },
      }),
    );
    const devicePairId = (await incomingPromise).payload as { devicePairId: string };
    const firstCompletePromise = nextMessage(macSocket);
    macSocket.send(
      JSON.stringify({
        protocolVersion: 1,
        type: "pair.approve",
        payload: { pairingRequestId: devicePairId.devicePairId },
      }),
    );
    await firstCompletePromise;

    // The Mac (e.g. having lost track of its own pairing state) mints a *second* code for
    // the same account and the same iPhone redeems it — this must not dead-end on
    // "already pending or approved" since the two devices are, in fact, already paired.
    const secondCodeResponse = await app.inject({
      method: "POST",
      url: "/pairing/request",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { macDeviceId: session.macDeviceId },
    });

    const iphoneCompletePromise = nextMessage(iphoneSocket);
    iphoneSocket.send(
      JSON.stringify({
        protocolVersion: 1,
        type: "pair.request",
        payload: { pairingCode: secondCodeResponse.json().pairingCode },
      }),
    );
    const complete = await iphoneCompletePromise;
    assert.equal(complete.type, "pair.complete");
  } finally {
    macSocket.terminate();
    iphoneSocket.terminate();
  }
});

test("rejects an expired or unknown pairing code with an error message", async () => {
  const session = await setUpPairOfDevices("bad-code@example.com");

  const iphoneSocket = await app.injectWS(`/ws?deviceId=${session.iphoneDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });

  try {
    const errorPromise = nextMessage(iphoneSocket);
    iphoneSocket.send(JSON.stringify({ protocolVersion: 1, type: "pair.request", payload: { pairingCode: "000000" } }));

    const error = await errorPromise;
    assert.equal(error.type, "error");
  } finally {
    iphoneSocket.terminate();
  }
});

test("only the mac side of a pending pair can approve it", async () => {
  const session = await setUpPairOfDevices("wrong-approver@example.com");

  const pairingResponse = await app.inject({
    method: "POST",
    url: "/pairing/request",
    headers: { authorization: `Bearer ${session.accessToken}` },
    payload: { macDeviceId: session.macDeviceId },
  });
  const { pairingCode } = pairingResponse.json();

  const macSocket = await app.injectWS(`/ws?deviceId=${session.macDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  const iphoneSocket = await app.injectWS(`/ws?deviceId=${session.iphoneDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });

  try {
    const incomingPromise = nextMessage(macSocket);
    iphoneSocket.send(JSON.stringify({ protocolVersion: 1, type: "pair.request", payload: { pairingCode } }));
    const incoming = await incomingPromise;
    const devicePairId = (incoming.payload as { devicePairId: string }).devicePairId;

    const errorPromise = nextMessage(iphoneSocket);
    iphoneSocket.send(
      JSON.stringify({ protocolVersion: 1, type: "pair.approve", payload: { pairingRequestId: devicePairId } }),
    );
    const error = await errorPromise;
    assert.equal(error.type, "error");

    const pair = await findDevicePairById(db, devicePairId);
    assert.equal(pair?.status, "pending");
  } finally {
    macSocket.terminate();
    iphoneSocket.terminate();
  }
});

async function approvePair(session: Session): Promise<string> {
  const pairingResponse = await app.inject({
    method: "POST",
    url: "/pairing/request",
    headers: { authorization: `Bearer ${session.accessToken}` },
    payload: { macDeviceId: session.macDeviceId },
  });
  const { pairingCode } = pairingResponse.json();

  const macSocket = await app.injectWS(`/ws?deviceId=${session.macDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  const iphoneSocket = await app.injectWS(`/ws?deviceId=${session.iphoneDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  try {
    const incomingPromise = nextMessage(macSocket);
    iphoneSocket.send(JSON.stringify({ protocolVersion: 1, type: "pair.request", payload: { pairingCode } }));
    const devicePairId = ((await incomingPromise).payload as { devicePairId: string }).devicePairId;

    const macCompletePromise = nextMessage(macSocket);
    macSocket.send(
      JSON.stringify({ protocolVersion: 1, type: "pair.approve", payload: { pairingRequestId: devicePairId } }),
    );
    await macCompletePromise;
    return devicePairId;
  } finally {
    macSocket.terminate();
    iphoneSocket.terminate();
  }
}

test("session.start assigns a sessionId and notifies the partner device", async () => {
  const session = await setUpPairOfDevices("session-start@example.com");
  const devicePairId = await approvePair(session);

  const macSocket = await app.injectWS(`/ws?deviceId=${session.macDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  const iphoneSocket = await app.injectWS(`/ws?deviceId=${session.iphoneDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });

  try {
    const macAckPromise = nextMessageOfType(iphoneSocket, "session.start");
    const partnerNoticePromise = nextMessageOfType(macSocket, "session.start");
    iphoneSocket.send(JSON.stringify({ protocolVersion: 1, type: "session.start", payload: { devicePairId } }));

    const ack = await macAckPromise;
    const notice = await partnerNoticePromise;
    const ackPayload = ack.payload as { devicePairId: string; sessionId: string };
    const noticePayload = notice.payload as { devicePairId: string; sessionId: string };
    assert.equal(ackPayload.devicePairId, devicePairId);
    assert.ok(ackPayload.sessionId);
    assert.equal(noticePayload.sessionId, ackPayload.sessionId);
  } finally {
    macSocket.terminate();
    iphoneSocket.terminate();
  }
});

test("relays webrtc.offer/answer/ice between the two devices of a session", async () => {
  const session = await setUpPairOfDevices("webrtc-relay@example.com");
  const devicePairId = await approvePair(session);

  const macSocket = await app.injectWS(`/ws?deviceId=${session.macDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  const iphoneSocket = await app.injectWS(`/ws?deviceId=${session.iphoneDeviceId}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });

  try {
    const startAckPromise = nextMessageOfType(iphoneSocket, "session.start");
    iphoneSocket.send(JSON.stringify({ protocolVersion: 1, type: "session.start", payload: { devicePairId } }));
    const { sessionId } = (await startAckPromise).payload as { sessionId: string };

    const offerPromise = nextMessageOfType(macSocket, "webrtc.offer");
    iphoneSocket.send(
      JSON.stringify({ protocolVersion: 1, type: "webrtc.offer", payload: { sessionId, sdp: "offer-sdp" } }),
    );
    const offer = await offerPromise;
    assert.equal((offer.payload as { sdp: string }).sdp, "offer-sdp");

    const answerPromise = nextMessageOfType(iphoneSocket, "webrtc.answer");
    macSocket.send(
      JSON.stringify({ protocolVersion: 1, type: "webrtc.answer", payload: { sessionId, sdp: "answer-sdp" } }),
    );
    const answer = await answerPromise;
    assert.equal((answer.payload as { sdp: string }).sdp, "answer-sdp");

    const icePromise = nextMessageOfType(macSocket, "webrtc.ice");
    iphoneSocket.send(
      JSON.stringify({
        protocolVersion: 1,
        type: "webrtc.ice",
        payload: { sessionId, candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 },
      }),
    );
    const ice = await icePromise;
    assert.equal((ice.payload as { candidate: string }).candidate, "candidate:1");
  } finally {
    macSocket.terminate();
    iphoneSocket.terminate();
  }
});

test("rejects a webrtc message for a session the device isn't part of", async () => {
  const owner = await setUpPairOfDevices("webrtc-owner@example.com");
  const devicePairId = await approvePair(owner);
  const outsider = await setUpPairOfDevices("webrtc-outsider@example.com");

  const macSocket = await app.injectWS(`/ws?deviceId=${owner.macDeviceId}`, {
    headers: { authorization: `Bearer ${owner.accessToken}` },
  });
  const iphoneSocket = await app.injectWS(`/ws?deviceId=${owner.iphoneDeviceId}`, {
    headers: { authorization: `Bearer ${owner.accessToken}` },
  });
  const outsiderSocket = await app.injectWS(`/ws?deviceId=${outsider.iphoneDeviceId}`, {
    headers: { authorization: `Bearer ${outsider.accessToken}` },
  });

  try {
    const startAckPromise = nextMessageOfType(iphoneSocket, "session.start");
    iphoneSocket.send(JSON.stringify({ protocolVersion: 1, type: "session.start", payload: { devicePairId } }));
    const { sessionId } = (await startAckPromise).payload as { sessionId: string };

    const errorPromise = nextMessageOfType(outsiderSocket, "error");
    outsiderSocket.send(
      JSON.stringify({ protocolVersion: 1, type: "webrtc.offer", payload: { sessionId, sdp: "should-not-relay" } }),
    );
    const error = await errorPromise;
    assert.equal(error.type, "error");
  } finally {
    macSocket.terminate();
    iphoneSocket.terminate();
    outsiderSocket.terminate();
  }
});

test("rejects redeeming a pairing code from a device on a different account", async () => {
  const owner = await setUpPairOfDevices("code-owner@example.com");
  const attacker = await setUpPairOfDevices("code-attacker@example.com");

  const pairingResponse = await app.inject({
    method: "POST",
    url: "/pairing/request",
    headers: { authorization: `Bearer ${owner.accessToken}` },
    payload: { macDeviceId: owner.macDeviceId },
  });
  const { pairingCode } = pairingResponse.json();

  const attackerSocket = await app.injectWS(`/ws?deviceId=${attacker.iphoneDeviceId}`, {
    headers: { authorization: `Bearer ${attacker.accessToken}` },
  });

  try {
    const errorPromise = nextMessage(attackerSocket);
    attackerSocket.send(JSON.stringify({ protocolVersion: 1, type: "pair.request", payload: { pairingCode } }));
    const error = await errorPromise;
    assert.equal(error.type, "error");

    const result = await db.query<{ count: string }>(
      `SELECT count(*)::text FROM device_pairs WHERE remote_device_id = $1`,
      [attacker.iphoneDeviceId],
    );
    assert.equal(result.rows[0]?.count, "0");
  } finally {
    attackerSocket.terminate();
  }
});
