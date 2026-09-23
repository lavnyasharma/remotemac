import type { Db } from "../db/pool.js";

interface PairingCodeRow {
  id: string;
  mac_device_id: string;
  user_id: string;
  code_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface PairingCode {
  id: string;
  macDeviceId: string;
  userId: string;
  expiresAt: string;
}

export async function createPairingCode(
  db: Db,
  input: { macDeviceId: string; userId: string; codeHash: string; expiresAt: Date },
): Promise<PairingCode> {
  const result = await db.query<PairingCodeRow>(
    `INSERT INTO pairing_codes (mac_device_id, user_id, code_hash, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.macDeviceId, input.userId, input.codeHash, input.expiresAt.toISOString()],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create pairing code");
  return { id: row.id, macDeviceId: row.mac_device_id, userId: row.user_id, expiresAt: row.expires_at.toISOString() };
}

/**
 * Atomically finds an unused, unexpired pairing code by its hash and marks it
 * used in the same statement — a single UPDATE ... WHERE ... RETURNING avoids
 * a check-then-use race between two concurrent redemption attempts.
 */
export async function consumePairingCode(db: Db, codeHash: string): Promise<PairingCode | null> {
  const result = await db.query<PairingCodeRow>(
    `UPDATE pairing_codes
     SET used_at = now()
     WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING *`,
    [codeHash],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, macDeviceId: row.mac_device_id, userId: row.user_id, expiresAt: row.expires_at.toISOString() };
}
