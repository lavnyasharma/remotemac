import type { LoggerOptions } from "pino";
import type { Env } from "../config/env.js";

/**
 * Log categories used across the backend, mirroring the Mac-side categories
 * in docs/architecture.md so events can be correlated across the stack.
 */
export type LogCategory =
  | "AUTH"
  | "PAIRING"
  | "WEBRTC"
  | "DEVICE"
  | "SESSION"
  | "NETWORK"
  | "ERROR";

const REDACT_PATHS = [
  "req.headers.authorization",
  "*.password",
  "*.accessToken",
  "*.refreshToken",
  "*.token",
];

/**
 * Logger options handed to Fastify, which instantiates pino itself — letting
 * Fastify own construction keeps `app.log`'s type correctly inferred as
 * `FastifyBaseLogger` instead of fighting pino's own `Logger<...>` generics.
 */
export function createLoggerOptions(env: Pick<Env, "NODE_ENV">): LoggerOptions {
  return {
    level: env.NODE_ENV === "test" ? "silent" : "info",
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    ...(env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
  };
}
