import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.js";
import { createTestEnv } from "./testUtils/env.js";
import { createTestPool } from "./testUtils/db.js";

test("GET /health returns ok", async () => {
  const db = createTestPool();
  const app = await buildApp({ env: createTestEnv(), db });

  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.status, "ok");
  assert.ok(typeof body.timestamp === "string");

  await app.close();
  await db.end();
});
