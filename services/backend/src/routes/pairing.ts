import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db/pool.js";
import { pairingRequestBodySchema } from "../validation/pairing.js";
import { findDeviceById } from "../repositories/devicesRepository.js";
import { createPairingCode } from "../repositories/pairingCodesRepository.js";
import { generatePairingCode } from "../services/pairingCode.js";
import { requireUserId } from "../middleware/authenticate.js";

export interface PairingRoutesOptions {
  db: Db;
}

/**
 * REST surface for pairing: minting a code. Redeeming a code and the
 * approve/reject handshake happen over the authenticated WebSocket
 * (see src/ws/signaling.ts) because the Mac needs a realtime prompt.
 */
export const pairingRoutes: FastifyPluginAsync<PairingRoutesOptions> = async (app, opts) => {
  const { db } = opts;

  app.post(
    "/pairing/request",
    { preHandler: app.authenticate, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const userId = requireUserId(request);
      const parsed = pairingRequestBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid request body" });

      const device = await findDeviceById(db, parsed.data.macDeviceId);
      if (!device || device.userId !== userId || device.deviceType !== "mac") {
        return reply.code(404).send({ error: "Mac device not found" });
      }

      const generated = generatePairingCode();
      await createPairingCode(db, {
        macDeviceId: device.id,
        userId,
        codeHash: generated.hash,
        expiresAt: generated.expiresAt,
      });

      return reply.code(201).send({
        pairingCode: generated.code,
        expiresAt: generated.expiresAt.toISOString(),
      });
    },
  );
};
