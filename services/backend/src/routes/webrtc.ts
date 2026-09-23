import type { FastifyPluginAsync } from "fastify";
import type { Env } from "../config/env.js";

export interface WebrtcRoutesOptions {
  env: Env;
}

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * ICE server config the clients fetch at connection time rather than hardcoding — keeps
 * TURN credentials out of the Mac/iPhone source (build plan §13) and lets them change
 * without a client release. STUN-only (direct P2P) works without any TURN_* env vars set;
 * TURN is added on top when configured, for the cases direct connectivity can't reach.
 */
export const webrtcRoutes: FastifyPluginAsync<WebrtcRoutesOptions> = async (app, opts) => {
  const { env } = opts;

  app.get("/webrtc/ice-servers", { preHandler: app.authenticate }, async (_request, reply) => {
    const iceServers: IceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

    if (env.TURN_URL && env.TURN_USERNAME && env.TURN_PASSWORD) {
      // Comma-separated so one env var can carry a provider's UDP/TCP/TLS variants.
      const turnUrls = env.TURN_URL.split(",").map((url) => url.trim()).filter(Boolean);
      iceServers.push({
        urls: turnUrls.length === 1 ? turnUrls[0]! : turnUrls,
        username: env.TURN_USERNAME,
        credential: env.TURN_PASSWORD,
      });
    }

    return reply.send({ iceServers });
  });
};
