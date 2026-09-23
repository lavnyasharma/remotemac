import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEnv, corsOrigins } from "./env.js";

const validBase = {
  DATABASE_URL: "postgres://localhost/db",
  JWT_SECRET: "a".repeat(32),
};

test("applies defaults for missing optional vars", () => {
  const env = loadEnv({ ...validBase, NODE_ENV: "development" });
  assert.equal(env.PORT, 3000);
  assert.equal(env.CORS_ORIGINS, "");
});

test("parses CORS_ORIGINS into a trimmed list", () => {
  const env = loadEnv({ ...validBase, CORS_ORIGINS: "https://a.example, https://b.example" });
  assert.deepEqual(corsOrigins(env), ["https://a.example", "https://b.example"]);
});

test("throws when DATABASE_URL is missing", () => {
  assert.throws(() => loadEnv({ JWT_SECRET: "a".repeat(32) }));
});

test("throws when JWT_SECRET is missing", () => {
  assert.throws(() => loadEnv({ DATABASE_URL: "postgres://localhost/db" }));
});

test("throws when JWT_SECRET is too short", () => {
  assert.throws(() => loadEnv({ ...validBase, JWT_SECRET: "too-short" }));
});

test("succeeds when required vars are present", () => {
  const env = loadEnv({ ...validBase, NODE_ENV: "production" });
  assert.equal(env.NODE_ENV, "production");
});

test("rejects an invalid NODE_ENV", () => {
  assert.throws(() => loadEnv({ ...validBase, NODE_ENV: "bogus" }));
});
