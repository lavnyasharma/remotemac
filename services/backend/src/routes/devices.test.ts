import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createTestEnv } from "../testUtils/env.js";
import { createTestPool, resetTestDb } from "../testUtils/db.js";
import type { Db } from "../db/pool.js";

let app: FastifyInstance;
let db: Db;

before(async () => {
  db = createTestPool();
  app = await buildApp({ env: createTestEnv(), db });
});

after(async () => {
  await app.close();
  await db.end();
});

beforeEach(async () => {
  await resetTestDb(db);
});

async function registerAndGetToken(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "correct-horse-battery" },
  });
  return response.json().accessToken;
}

test("rejects device listing without a token", async () => {
  const response = await app.inject({ method: "GET", url: "/devices" });
  assert.equal(response.statusCode, 401);
});

test("registers a device and lists it back", async () => {
  const accessToken = await registerAndGetToken("mac-owner@example.com");

  const createResponse = await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceType: "mac",
      name: "Lavanya's MacBook Pro",
      platform: "macos",
      publicIdentifier: "mac-public-id-1",
    },
  });
  assert.equal(createResponse.statusCode, 201);
  const created = createResponse.json().device;
  assert.equal(created.name, "Lavanya's MacBook Pro");

  const listResponse = await app.inject({
    method: "GET",
    url: "/devices",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.json().devices.length, 1);
});

test("re-registering the same publicIdentifier for the same owner is idempotent", async () => {
  // Onboarding can restart (sign-out, a cleared session) while the Mac's locally-generated
  // publicIdentifier survives in the Keychain. Re-registering must re-adopt the existing
  // device rather than dead-ending the user on a 409.
  const accessToken = await registerAndGetToken("dup-owner@example.com");
  const payload = {
    deviceType: "mac",
    name: "Mac 1",
    platform: "macos",
    publicIdentifier: "duplicate-id",
  };

  const first = await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${accessToken}` },
    payload,
  });
  assert.equal(first.statusCode, 201);
  const firstDeviceId = first.json().device.id;

  const second = await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { ...payload, name: "Renamed Mac" },
  });
  assert.equal(second.statusCode, 201);
  const secondDevice = second.json().device;
  assert.equal(secondDevice.id, firstDeviceId);
  assert.equal(secondDevice.name, "Renamed Mac");

  const listResponse = await app.inject({
    method: "GET",
    url: "/devices",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.equal(listResponse.json().devices.length, 1);
});

test("rejects a publicIdentifier already owned by a different account", async () => {
  const ownerToken = await registerAndGetToken("owner-a@example.com");
  const otherToken = await registerAndGetToken("owner-b@example.com");
  const payload = {
    deviceType: "mac",
    name: "Mac 1",
    platform: "macos",
    publicIdentifier: "cross-account-id",
  };

  await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${ownerToken}` },
    payload,
  });
  const second = await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${otherToken}` },
    payload,
  });
  assert.equal(second.statusCode, 409);
});

test("lists a device's approved pairs, letting a client restore pairing state on launch", async () => {
  const accessToken = await registerAndGetToken("pairs-owner@example.com");

  const macResponse = await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { deviceType: "mac", name: "Owner's Mac", platform: "macos", publicIdentifier: "pairs-mac-1" },
  });
  const macDeviceId = macResponse.json().device.id;

  const iphoneResponse = await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { deviceType: "iphone", name: "Owner's iPhone", platform: "ios", publicIdentifier: "pairs-iphone-1" },
  });
  const iphoneDeviceId = iphoneResponse.json().device.id;

  const beforePairing = await app.inject({
    method: "GET",
    url: `/devices/${macDeviceId}/pairs`,
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.deepEqual(beforePairing.json().pairs, []);

  await db.query(
    `INSERT INTO device_pairs (user_id, mac_device_id, remote_device_id, status, approved_at)
     VALUES ((SELECT user_id FROM devices WHERE id = $1), $1, $2, 'approved', now())`,
    [macDeviceId, iphoneDeviceId],
  );

  const afterPairing = await app.inject({
    method: "GET",
    url: `/devices/${macDeviceId}/pairs`,
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const pairs = afterPairing.json().pairs;
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].device.id, iphoneDeviceId);
  assert.equal(pairs[0].device.name, "Owner's iPhone");
});

test("rejects listing another account's device pairs", async () => {
  const ownerToken = await registerAndGetToken("pairs-owner-2@example.com");
  const otherToken = await registerAndGetToken("pairs-other-2@example.com");

  const macResponse = await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { deviceType: "mac", name: "Owner's Mac", platform: "macos", publicIdentifier: "pairs-mac-2" },
  });
  const macDeviceId = macResponse.json().device.id;

  const response = await app.inject({
    method: "GET",
    url: `/devices/${macDeviceId}/pairs`,
    headers: { authorization: `Bearer ${otherToken}` },
  });
  assert.equal(response.statusCode, 404);
});

test("only deletes a device owned by the requester", async () => {
  const ownerToken = await registerAndGetToken("owner@example.com");
  const otherToken = await registerAndGetToken("other@example.com");

  const createResponse = await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: {
      deviceType: "iphone",
      name: "My iPhone",
      platform: "ios",
      publicIdentifier: "iphone-public-id-1",
    },
  });
  const deviceId = createResponse.json().device.id;

  const otherDeletesResponse = await app.inject({
    method: "DELETE",
    url: `/devices/${deviceId}`,
    headers: { authorization: `Bearer ${otherToken}` },
  });
  assert.equal(otherDeletesResponse.statusCode, 404);

  const ownerDeletesResponse = await app.inject({
    method: "DELETE",
    url: `/devices/${deviceId}`,
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(ownerDeletesResponse.statusCode, 204);
});
