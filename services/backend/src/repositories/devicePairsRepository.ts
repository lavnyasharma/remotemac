import type { Db } from "../db/pool.js";
import type { DevicePair, DevicePairStatus } from "@remote-mac/types";

interface DevicePairRow {
  id: string;
  user_id: string;
  mac_device_id: string;
  remote_device_id: string;
  status: DevicePairStatus;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: DevicePairRow): DevicePair {
  return {
    id: row.id,
    userId: row.user_id,
    macDeviceId: row.mac_device_id,
    remoteDeviceId: row.remote_device_id,
    status: row.status,
    approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createPendingDevicePair(
  db: Db,
  input: { userId: string; macDeviceId: string; remoteDeviceId: string },
): Promise<DevicePair> {
  const result = await db.query<DevicePairRow>(
    `INSERT INTO device_pairs (user_id, mac_device_id, remote_device_id, status)
     VALUES ($1, $2, $3, 'pending') RETURNING *`,
    [input.userId, input.macDeviceId, input.remoteDeviceId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create device pair");
  return mapRow(row);
}

export async function findDevicePairById(db: Db, id: string): Promise<DevicePair | null> {
  const result = await db.query<DevicePairRow>(`SELECT * FROM device_pairs WHERE id = $1`, [id]);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function listDevicePairsForUser(db: Db, userId: string): Promise<DevicePair[]> {
  const result = await db.query<DevicePairRow>(
    `SELECT * FROM device_pairs WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(mapRow);
}

/** Transitions a pending pair to approved/rejected. Returns null if it wasn't pending. */
export async function resolveDevicePair(
  db: Db,
  id: string,
  resolution: "approved" | "rejected",
): Promise<DevicePair | null> {
  const result = await db.query<DevicePairRow>(
    `UPDATE device_pairs
     SET status = $2::device_pair_status,
         approved_at = CASE WHEN $2::device_pair_status = 'approved' THEN now() ELSE approved_at END,
         updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, resolution],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function revokeDevicePair(db: Db, id: string, userId: string): Promise<DevicePair | null> {
  const result = await db.query<DevicePairRow>(
    `UPDATE device_pairs SET status = 'revoked', updated_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'approved'
     RETURNING *`,
    [id, userId],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/** Pending pairing requests waiting on this Mac's approval — replayed when it reconnects. */
export async function listPendingDevicePairsForMac(db: Db, macDeviceId: string): Promise<DevicePair[]> {
  const result = await db.query<DevicePairRow>(
    `SELECT * FROM device_pairs WHERE mac_device_id = $1 AND status = 'pending' ORDER BY created_at ASC`,
    [macDeviceId],
  );
  return result.rows.map(mapRow);
}

/** The approved pair (if any) between this exact Mac and remote device. */
export async function findApprovedPairBetween(
  db: Db,
  macDeviceId: string,
  remoteDeviceId: string,
): Promise<DevicePair | null> {
  const result = await db.query<DevicePairRow>(
    `SELECT * FROM device_pairs WHERE mac_device_id = $1 AND remote_device_id = $2 AND status = 'approved'`,
    [macDeviceId, remoteDeviceId],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/** Every approved pair involving `deviceId`, most recently approved first. */
export async function listApprovedPairsForDevice(db: Db, deviceId: string): Promise<DevicePair[]> {
  const result = await db.query<DevicePairRow>(
    `SELECT * FROM device_pairs WHERE status = 'approved' AND (mac_device_id = $1 OR remote_device_id = $1)
     ORDER BY approved_at DESC`,
    [deviceId],
  );
  return result.rows.map(mapRow);
}

/** The device ids on the other end of every approved pair involving `deviceId`. */
export async function findApprovedPartnerDeviceIds(db: Db, deviceId: string): Promise<string[]> {
  const result = await db.query<{ partner_id: string }>(
    `SELECT CASE WHEN mac_device_id = $1 THEN remote_device_id ELSE mac_device_id END AS partner_id
     FROM device_pairs
     WHERE status = 'approved' AND (mac_device_id = $1 OR remote_device_id = $1)`,
    [deviceId],
  );
  return result.rows.map((row) => row.partner_id);
}
