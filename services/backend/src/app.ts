import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { loadEnv, corsOrigins, type Env } from "./config/env.js";
import { createLoggerOptions } from "./logging/logger.js";
import { createPool, type Db } from "./db/pool.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { deviceRoutes } from "./routes/devices.js";
import { pairingRoutes } from "./routes/pairing.js";
import { webrtcRoutes } from "./routes/webrtc.js";
import authenticatePlugin from "./middleware/authenticate.js";
import { signalingRoutes } from "./ws/signaling.js";
import { ConnectionRegistry } from "./ws/connectionRegistry.js";

export interface BuildAppOptions {
  env?: Env;
  /** Inject a pool (e.g. in tests). When omitted, buildApp creates one from DATABASE_URL and closes it when the app closes. */
  db?: Db;
}

/**
 * Builds (but does not start) the Fastify application. Kept separate from
 * server.ts so tests can build an app instance with `.inject()` without
 * binding a real port.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();

  const app = Fastify({ logger: createLoggerOptions(env) });

  const db = options.db ?? createPool(env.DATABASE_URL, env.DATABASE_SSL);
  if (!options.db) {
    app.addHook("onClose", async () => {
      await db.end();
    });
  }

  await app.register(cors, {
    origin: corsOrigins(env).length > 0 ? corsOrigins(env) : false,
  });
  // A generous global ceiling (this is a single-user backend, not a public API) plus tighter
  // per-route limits on the endpoints an attacker would actually want to hammer — credential
  // guessing against /auth/login and /auth/register — registered below on those routes via
  // each route's own `config.rateLimit`. Previously an open gap (see docs/security.md); now
  // that this backend is reachable from the public internet rather than just localhost, it's
  // load-bearing rather than theoretical.
  //
  // Skipped entirely under NODE_ENV=test: the test suite legitimately fires far more than 5-10
  // requests a minute at these same routes across many independent test cases, which isn't the
  // scenario this defends against.
  if (env.NODE_ENV !== "test") {
    await app.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: "1 minute",
    });
  }
  await app.register(websocket);
  await app.register(authenticatePlugin, { jwtSecret: env.JWT_SECRET });

  await app.register(healthRoutes);
  await app.register(authRoutes, { db, jwtSecret: env.JWT_SECRET });
  await app.register(deviceRoutes, { db });
  await app.register(pairingRoutes, { db });
  await app.register(webrtcRoutes, { env });
  await app.register(signalingRoutes, { db, registry: new ConnectionRegistry() });

  return app;
}
