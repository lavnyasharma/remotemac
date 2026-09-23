import { getItem, setItem, deleteItem } from './keychain';

const KEYCHAIN_KEY = 'deviceIdentity.publicIdentifier';

function generateUuidV4(): string {
  // No crypto.randomUUID dependency — this identifier is just a public,
  // non-secret install id (paired with account-scoped device registration),
  // so Math.random()-based generation is an acceptable, dependency-free choice.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * A stable, locally-generated identifier for this iPhone installation, used
 * as the `publicIdentifier` when registering with the backend. Mirrors
 * apps/mac/RemoteMac's DeviceIdentity.swift.
 */
export async function loadOrCreateDeviceIdentity(): Promise<string> {
  const existing = await getItem(KEYCHAIN_KEY);
  if (existing) return existing;

  const generated = generateUuidV4();
  await setItem(KEYCHAIN_KEY, generated);
  return generated;
}

/**
 * Mints and stores a fresh identifier, discarding the old one. The backend keys a device's
 * hardware identity to whichever account first registered it (see the backend's
 * `DeviceOwnerConflictError`) — Keychain-backed, this identifier otherwise survives a plain
 * reinstall, so an install that ends up signed into a *different* account than whoever
 * registered it originally would 409 forever on every registration attempt with no local way
 * to recover. Called only after that conflict is confirmed server-side.
 */
export async function resetDeviceIdentity(): Promise<string> {
  await deleteItem(KEYCHAIN_KEY);
  return loadOrCreateDeviceIdentity();
}
