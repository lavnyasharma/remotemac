import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
});

export const loginBodySchema = registerBodySchema;

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});
