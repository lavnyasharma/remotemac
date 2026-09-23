import type { Db } from "../db/pool.js";

interface RefreshTokenRow {
  id: string;
  user_id: string;
  device_id: string | null;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_id: string | null;
  created_at: Date;
}

export interface RefreshToken {
  id: string;
  userId: string;
  deviceId: string | null;
  expiresAt: string;
  revokedAt: string | null;
}

function mapRow(row: RefreshTokenRow): RefreshToken {
  return {
    id: row.id,
    userId: row.user_id,
    deviceId: row.device_id,
    expiresAt: row.expires_at.toISOString(),
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
  };
}

export async function createRefreshToken(
  db: Db,
  input: { userId: string; deviceId: string | null; tokenHash: string; expiresAt: Date },
): Promise<RefreshToken> {
  const result = await db.query<RefreshTokenRow>(
    `INSERT INTO refresh_tokens (user_id, device_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.userId, input.deviceId, input.tokenHash, input.expiresAt.toISOString()],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create refresh token");
  return mapRow(row);
}

export async function findActiveRefreshTokenByHash(
  db: Db,
  tokenHash: string,
): Promise<RefreshToken | null> {
  const result = await db.query<RefreshTokenRow>(
    `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/** Revokes a refresh token, optionally recording the token that replaced it (rotation). */
export async function revokeRefreshToken(
  db: Db,
  id: string,
  replacedById?: string,
): Promise<void> {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = now(), replaced_by_id = $2 WHERE id = $1`,
    [id, replacedById ?? null],
  );
}
