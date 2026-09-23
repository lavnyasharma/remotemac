import { loadEnv, type Env } from "../config/env.js";

export function createTestEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): Env {
  return loadEnv({
    NODE_ENV: "test",
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://localhost/remotemac_test",
    JWT_SECRET: "test-secret-at-least-32-characters-long",
    ...overrides,
  });
}
