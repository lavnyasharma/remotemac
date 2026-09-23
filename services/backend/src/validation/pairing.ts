import { z } from "zod";

export const pairingRequestBodySchema = z.object({
  macDeviceId: z.string().uuid(),
});
