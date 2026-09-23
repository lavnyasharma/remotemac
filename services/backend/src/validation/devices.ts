import { z } from "zod";

export const createDeviceBodySchema = z.object({
  deviceType: z.enum(["mac", "iphone"]),
  name: z.string().min(1).max(100),
  platform: z.enum(["ios", "macos"]),
  publicIdentifier: z.string().min(1).max(200),
});
