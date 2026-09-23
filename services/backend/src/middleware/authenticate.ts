import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "../services/tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  jwtSecret: string;
}

/**
 * Registers `app.authenticate`, a preHandler that verifies the bearer access
 * token and sets `request.userId`. Every route that touches user or device
 * data must use it — there is no other authorization boundary.
 */
const authenticatePlugin: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  app.decorateRequest("userId", undefined);

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      await reply.code(401).send({ error: "Missing bearer token" });
      return;
    }

    try {
      const { userId } = await verifyAccessToken(header.slice("Bearer ".length), opts.jwtSecret);
      request.userId = userId;
    } catch {
      await reply.code(401).send({ error: "Invalid or expired token" });
    }
  });
};

export default fp(authenticatePlugin, { name: "authenticate" });

/** Reads `request.userId`, throwing if a route forgot the `authenticate` preHandler. */
export function requireUserId(request: FastifyRequest): string {
  if (!request.userId) {
    throw new Error("Unauthenticated request reached a handler that requires a user");
  }
  return request.userId;
}
