import * as Keychain from 'react-native-keychain';

/**
 * Thin key-value wrapper around iOS Keychain for small sensitive values —
 * refresh tokens and device identity. Never used for plaintext passwords
 * (those never leave the sign-in form), and never a substitute for
 * AsyncStorage (build plan §26). Mirrors apps/mac/RemoteMac's KeychainStore.
 *
 * `react-native-keychain`'s generic-password API stores one value per
 * `service` string, so each logical key gets its own service namespace.
 */
const SERVICE_PREFIX = 'app.remotemac.ios';

function serviceFor(key: string): string {
  return `${SERVICE_PREFIX}.${key}`;
}

export async function setItem(key: string, value: string): Promise<void> {
  await Keychain.setGenericPassword(key, value, { service: serviceFor(key) });
}

export async function getItem(key: string): Promise<string | null> {
  const result = await Keychain.getGenericPassword({ service: serviceFor(key) });
  if (!result) return null;
  return result.password;
}

export async function deleteItem(key: string): Promise<void> {
  await Keychain.resetGenericPassword({ service: serviceFor(key) });
}
