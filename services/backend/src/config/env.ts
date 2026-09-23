import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1),
  /** Off by default for local/internal Postgres. Set to "true" for a managed Postgres reached
   *  over a connection that requires TLS (e.g. Supabase, or Render Postgres's *external* URL —
   *  Render's internal URL between services in the same project does not need it).
   *  Not `z.coerce.boolean()`: that coerces via `Boolean(string)`, so `"false"` (any non-empty
   *  string) would coerce to `true` — the opposite of what setting it to "false" should mean. */
  DATABASE_SSL: z
    .string()
    .optional()
    .transform((value) => value === "true"),

  JWT_SECRET: z.string().min(32),

  TURN_URL: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_PASSWORD: z.string().optional(),

  CORS_ORIGINS: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates process.env once at startup. Fails fast with a clear
 * error rather than letting an unset secret surface later as a confusing
 * runtime failure (Rule 12: never commit secrets, but also never silently
 * run without them).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
