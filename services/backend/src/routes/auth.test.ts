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

test("register creates a user and returns tokens", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "alice@example.com", password: "correct-horse-battery" },
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.equal(body.user.email, "alice@example.com");
  assert.ok(body.accessToken);
  assert.ok(body.refreshToken);
});

test("register rejects a duplicate email", async () => {
  const payload = { email: "bob@example.com", password: "correct-horse-battery" };
  await app.inject({ method: "POST", url: "/auth/register", payload });

  const second = await app.inject({ method: "POST", url: "/auth/register", payload });
  assert.equal(second.statusCode, 409);
});

test("register rejects an invalid body", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "not-an-email", password: "short" },
  });
  assert.equal(response.statusCode, 400);
});

test("login succeeds with correct credentials", async () => {
  await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "carol@example.com", password: "correct-horse-battery" },
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "carol@example.com", password: "correct-horse-battery" },
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.json().accessToken);
});

test("login fails with wrong password", async () => {
  await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "dave@example.com", password: "correct-horse-battery" },
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "dave@example.com", password: "wrong-password" },
  });

  assert.equal(response.statusCode, 401);
});

test("login fails for an unknown email with the same error shape as a wrong password", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "nobody@example.com", password: "whatever123" },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "Invalid email or password");
});

test("refresh rotates the token and invalidates the old one", async () => {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "erin@example.com", password: "correct-horse-battery" },
  });
  const { refreshToken } = registerResponse.json();

  const refreshResponse = await app.inject({
    method: "POST",
    url: "/auth/refresh",
    payload: { refreshToken },
  });
  assert.equal(refreshResponse.statusCode, 200);
  const rotated = refreshResponse.json();
  assert.ok(rotated.refreshToken);
  assert.notEqual(rotated.refreshToken, refreshToken);

  const reuseResponse = await app.inject({
    method: "POST",
    url: "/auth/refresh",
    payload: { refreshToken },
  });
  assert.equal(reuseResponse.statusCode, 401);
});

test("refresh rejects an unknown token", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/auth/refresh",
    payload: { refreshToken: "not-a-real-token" },
  });
  assert.equal(response.statusCode, 401);
});

test("logout revokes the refresh token", async () => {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "frank@example.com", password: "correct-horse-battery" },
  });
  const { refreshToken } = registerResponse.json();

  const logoutResponse = await app.inject({
    method: "POST",
    url: "/auth/logout",
    payload: { refreshToken },
  });
  assert.equal(logoutResponse.statusCode, 204);

  const refreshResponse = await app.inject({
    method: "POST",
    url: "/auth/refresh",
    payload: { refreshToken },
  });
  assert.equal(refreshResponse.statusCode, 401);
});
