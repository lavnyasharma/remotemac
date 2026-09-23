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

async function registerMac(email: string): Promise<{ accessToken: string; macDeviceId: string }> {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "correct-horse-battery" },
  });
  const accessToken = registerResponse.json().accessToken;

  const deviceResponse = await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { deviceType: "mac", name: "Test Mac", platform: "macos", publicIdentifier: "mac-1" },
  });

  return { accessToken, macDeviceId: deviceResponse.json().device.id };
}

test("mints a 6-digit pairing code for an owned mac device", async () => {
  const { accessToken, macDeviceId } = await registerMac("mac-owner@example.com");

  const response = await app.inject({
    method: "POST",
    url: "/pairing/request",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { macDeviceId },
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.match(body.pairingCode, /^\d{6}$/);
  assert.ok(body.expiresAt);
});

test("rejects minting a code for a device that isn't a mac", async () => {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "phone-owner@example.com", password: "correct-horse-battery" },
  });
  const accessToken = registerResponse.json().accessToken;

  const deviceResponse = await app.inject({
    method: "POST",
    url: "/devices",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { deviceType: "iphone", name: "iPhone", platform: "ios", publicIdentifier: "iphone-1" },
  });

  const response = await app.inject({
    method: "POST",
    url: "/pairing/request",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { macDeviceId: deviceResponse.json().device.id },
  });

  assert.equal(response.statusCode, 404);
});

test("rejects minting a code for a device owned by someone else", async () => {
  const { macDeviceId } = await registerMac("mac-owner-2@example.com");

  const otherRegisterResponse = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "attacker@example.com", password: "correct-horse-battery" },
  });
  const attackerToken = otherRegisterResponse.json().accessToken;

  const response = await app.inject({
    method: "POST",
    url: "/pairing/request",
    headers: { authorization: `Bearer ${attackerToken}` },
    payload: { macDeviceId },
  });

  assert.equal(response.statusCode, 404);
});
