import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Db } from "../db/pool.js";
import type { Device } from "@remote-mac/types";
import { createDeviceBodySchema } from "../validation/devices.js";
import {
  createDevice,
  listDevicesForUser,
  deleteDeviceForUser,
  findDeviceById,
  DeviceOwnerConflictError,
} from "../repositories/devicesRepository.js";
import { listApprovedPairsForDevice } from "../repositories/devicePairsRepository.js";
import { requireUserId } from "../middleware/authenticate.js";

export interface DeviceRoutesOptions {
  db: Db;
}

interface PgUniqueViolation {
  code: string;
}

function isUniqueViolation(error: unknown): error is PgUniqueViolation {
  return typeof error === "object" && error !== null && (error as PgUniqueViolation).code === "23505";
}

export const deviceRoutes: FastifyPluginAsync<DeviceRoutesOptions> = async (app, opts) => {
  const { db } = opts;

  app.get("/devices", { preHandler: app.authenticate }, async (request, reply) => {
    const devices = await listDevicesForUser(db, requireUserId(request));
    return reply.send({ devices });
  });

  app.post("/devices", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createDeviceBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body" });

    try {
      const device = await createDevice(db, { userId: requireUserId(request), ...parsed.data });
      return reply.code(201).send({ device });
    } catch (error) {
      if (error instanceof DeviceOwnerConflictError) {
        return reply.code(409).send({ error: error.message });
      }
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "Device already registered" });
      }
      throw error;
    }
  });

  const deviceIdParamsSchema = z.object({ id: z.string().uuid() });

  // Lets a device restore "who am I paired with" on launch instead of relying solely on a
  // live `pair.complete`/`device.status` WebSocket message, which only arrives while it's
  // connected at the moment something changes.
  app.get<{ Params: { id: string } }>(
    "/devices/:id/pairs",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsedParams = deviceIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) return reply.code(400).send({ error: "Invalid device id" });

      const device = await findDeviceById(db, parsedParams.data.id);
      if (!device || device.userId !== requireUserId(request)) {
        return reply.code(404).send({ error: "Device not found" });
      }

      const approvedPairs = await listApprovedPairsForDevice(db, device.id);
      const resolved = await Promise.all(
        approvedPairs.map(async (pair): Promise<{ pairId: string; device: Device } | null> => {
          const partnerId = pair.macDeviceId === device.id ? pair.remoteDeviceId : pair.macDeviceId;
          const partner = await findDeviceById(db, partnerId);
          return partner ? { pairId: pair.id, device: partner } : null;
        }),
      );
      const pairs = resolved.filter((entry): entry is { pairId: string; device: Device } => entry !== null);

      return reply.send({ pairs });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/devices/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsedParams = deviceIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) return reply.code(400).send({ error: "Invalid device id" });

      const deleted = await deleteDeviceForUser(db, parsedParams.data.id, requireUserId(request));
      if (!deleted) return reply.code(404).send({ error: "Device not found" });
      return reply.code(204).send();
    },
  );
};
