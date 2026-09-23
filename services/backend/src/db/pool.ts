import pg from "pg";

export type Db = pg.Pool;

/**
 * `ssl` defaults off for local Postgres (which usually isn't configured for TLS at all), but
 * managed providers (Render, Supabase, RDS, ...) require it and present a cert that isn't
 * always in Node's default CA bundle — `rejectUnauthorized: false` is the standard, documented
 * workaround those providers themselves recommend for node-postgres, not a security downgrade
 * specific to this app (the connection is still encrypted; only the certificate chain isn't
 * independently verified).
 */
export function createPool(databaseUrl: string, ssl = false): Db {
  return new pg.Pool({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });
}
