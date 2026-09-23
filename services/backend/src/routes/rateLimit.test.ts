import { test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createTestEnv } from "../testUtils/env.js";
import { createTestPool, resetTestDb } from "../testUtils/db.js";
import type { Db } from "../db/pool.js";

// Each test below builds its own app (and clears the DB first) rather than sharing one via a
// file-level before/after — a rate-limit bucket is keyed per route per IP for a full minute, so
// two tests sharing an app would bleed quota into each other and make the exact counts here
// flaky depending on run order. Built with NODE_ENV "development", not "test": buildApp skips
// registering @fastify/rate-limit under "test" specifically so the rest of the suite's
// rapid-fire requests aren't throttled, which means this file is the only place that exercises
// the limiter at all.
async function freshApp(): Promise<{ app: FastifyInstance; db: Db }> {
  const db = createTestPool();
  await resetTestDb(db);
  const app = await buildApp({ env: createTestEnv({ NODE_ENV: "development" }), db });
  return { app, db };
}

test("rate-limits repeated /auth/login attempts", async () => {
  const { app, db } = await freshApp();
  try {
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "ratelimit@example.com", password: "correct-horse-battery" },
    });

    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "ratelimit@example.com", password: "wrong-password" },
      });

    // The route allows 10/minute; the first 10 should be evaluated normally (and rejected for
    // the wrong password), the 11th should be turned away by the limiter before that.
    for (let i = 0; i < 10; i++) {
      const response = await attempt();
      assert.equal(response.statusCode, 401);
    }
    const limited = await attempt();
    assert.equal(limited.statusCode, 429);
  } finally {
    await app.close();
    await db.end();
  }
});

test("rate-limits repeated /auth/register attempts", async () => {
  const { app, db } = await freshApp();
  try {
    const attempt = (email: string) =>
      app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password: "correct-horse-battery" },
      });

    // The route allows 5/minute.
    for (let i = 0; i < 5; i++) {
      const response = await attempt(`user${i}@example.com`);
      assert.equal(response.statusCode, 201);
    }
    const limited = await attempt("one-too-many@example.com");
    assert.equal(limited.statusCode, 429);
  } finally {
    await app.close();
    await db.end();
  }
});
