import { createPool, type Db } from "../db/pool.js";

/**
 * Integration tests run against a real local Postgres database rather than a
 * mock — pairing/auth authorization logic has DB constraints (unique partial
 * indexes, foreign keys) load-bearing enough that a mock could pass while the
 * real schema rejects the query, or vice versa.
 *
 * Set TEST_DATABASE_URL to point elsewhere; otherwise this defaults to a
 * local `remotemac_test` database (see README.md for setup).
 */
export function createTestPool(): Db {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://localhost/remotemac_test";
  return createPool(url);
}

const TABLES = [
  "refresh_tokens",
  "pairing_codes",
  "sessions",
  "device_pairs",
  "devices",
  "users",
] as const;

export async function resetTestDb(db: Db): Promise<void> {
  await db.query(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}
