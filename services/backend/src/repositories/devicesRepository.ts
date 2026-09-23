import type { Db } from "../db/pool.js";
import type { Device, DevicePlatform } from "@remote-mac/types";

interface DeviceRow {
  id: string;
  user_id: string;
  device_type: "mac" | "iphone";
  name: string;
  platform: DevicePlatform;
  public_identifier: string;
  last_seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: DeviceRow): Device {
  return {
    id: row.id,
    userId: row.user_id,
    deviceType: row.device_type,
    name: row.name,
    platform: row.platform,
    publicIdentifier: row.public_identifier,
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class DeviceOwnerConflictError extends Error {
  constructor() {
    super("Device is already registered to a different account");
  }
}

/**
 * Registers a device, or re-adopts it if this exact publicIdentifier was already
 * registered by the same user — re-running onboarding (reinstall, keychain surviving
 * a signed-out state, etc.) must not dead-end on a unique-constraint conflict. A
 * publicIdentifier already owned by a *different* user is a genuine anomaly, so that
 * case still fails instead of silently reassigning the device.
 */
export async function createDevice(
  db: Db,
  input: {
    userId: string;
    deviceType: "mac" | "iphone";
    name: string;
    platform: DevicePlatform;
    publicIdentifier: string;
  },
): Promise<Device> {
  const result = await db.query<DeviceRow>(
    `INSERT INTO devices (user_id, device_type, name, platform, public_identifier)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (public_identifier) DO UPDATE
       SET name = EXCLUDED.name, platform = EXCLUDED.platform, updated_at = now()
       WHERE devices.user_id = EXCLUDED.user_id
     RETURNING *`,
    [input.userId, input.deviceType, input.name, input.platform, input.publicIdentifier],
  );
  const row = result.rows[0];
  if (!row) throw new DeviceOwnerConflictError();
  return mapRow(row);
}

export async function listDevicesForUser(db: Db, userId: string): Promise<Device[]> {
  const result = await db.query<DeviceRow>(
    `SELECT * FROM devices WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return result.rows.map(mapRow);
}

export async function findDeviceById(db: Db, id: string): Promise<Device | null> {
  const result = await db.query<DeviceRow>(`SELECT * FROM devices WHERE id = $1`, [id]);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/** Deletes a device only if it belongs to the given user. Returns whether a row was deleted. */
export async function deleteDeviceForUser(db: Db, id: string, userId: string): Promise<boolean> {
  const result = await db.query(`DELETE FROM devices WHERE id = $1 AND user_id = $2`, [id, userId]);
  return (result.rowCount ?? 0) > 0;
}

export async function touchDeviceLastSeen(db: Db, id: string): Promise<void> {
  await db.query(`UPDATE devices SET last_seen_at = now(), updated_at = now() WHERE id = $1`, [id]);
}
