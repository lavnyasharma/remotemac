import type { Db } from "../db/pool.js";
import type { Session, SessionStatus } from "@remote-mac/types";

interface SessionRow {
  id: string;
  device_pair_id: string;
  started_at: Date;
  ended_at: Date | null;
  status: SessionStatus;
  disconnect_reason: string | null;
}

function mapRow(row: SessionRow): Session {
  return {
    id: row.id,
    devicePairId: row.device_pair_id,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    status: row.status,
    disconnectReason: row.disconnect_reason,
  };
}

export async function createSession(db: Db, devicePairId: string): Promise<Session> {
  const result = await db.query<SessionRow>(
    `INSERT INTO sessions (device_pair_id) VALUES ($1) RETURNING *`,
    [devicePairId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create session");
  return mapRow(row);
}

export async function findSessionById(db: Db, id: string): Promise<Session | null> {
  const result = await db.query<SessionRow>(`SELECT * FROM sessions WHERE id = $1`, [id]);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function endSession(db: Db, id: string, reason?: string): Promise<Session | null> {
  const result = await db.query<SessionRow>(
    `UPDATE sessions SET status = 'ended', ended_at = now(), disconnect_reason = $2
     WHERE id = $1 AND status = 'active'
     RETURNING *`,
    [id, reason ?? null],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}
