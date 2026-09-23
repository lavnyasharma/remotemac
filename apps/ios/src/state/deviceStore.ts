import { create } from 'zustand';
import { apiClient, APIError, type DeviceResponse } from '../services/api/apiClient';
import { getItem, setItem } from '../services/auth/keychain';
import { loadOrCreateDeviceIdentity, resetDeviceIdentity } from '../services/auth/deviceIdentity';

const DEVICE_ID_KEY = 'device.iphoneDeviceId';
const DEVICE_NAME_KEY = 'device.iphoneDeviceName';

/** Registers this install's hardware identity, minting a fresh one and retrying exactly
 * once if the backend reports it's already claimed by a different account (409) — see
 * `resetDeviceIdentity`'s doc comment for why that can happen on a reused physical device. */
async function registerWithIdentity(publicIdentifier: string, accessToken: string): Promise<DeviceResponse> {
  try {
    return await apiClient.registerDevice({
      name: 'My iPhone',
      platform: 'ios',
      deviceType: 'iphone',
      publicIdentifier,
      accessToken,
    });
  } catch (error) {
    if (error instanceof APIError && error.status === 409) {
      const freshIdentifier = await resetDeviceIdentity();
      return apiClient.registerDevice({
        name: 'My iPhone',
        platform: 'ios',
        deviceType: 'iphone',
        publicIdentifier: freshIdentifier,
        accessToken,
      });
    }
    throw error;
  }
}

interface DeviceState {
  thisDeviceId: string | null;
  thisDeviceName: string | null;
  devices: DeviceResponse[];
  isLoading: boolean;
  error: string | null;
  ensureRegistered: (accessToken: string) => Promise<string>;
  refreshDevices: (accessToken: string) => Promise<void>;
  removeDevice: (deviceId: string, accessToken: string) => Promise<void>;
}

/**
 * This install's own device registration, plus the account's device list
 * (build plan §25's deviceStore).
 */
export const useDeviceStore = create<DeviceState>((set, get) => ({
  thisDeviceId: null,
  thisDeviceName: null,
  devices: [],
  isLoading: false,
  error: null,

  ensureRegistered: async (accessToken: string) => {
    const cached = get().thisDeviceId ?? (await getItem(DEVICE_ID_KEY));
    if (cached) {
      // The cached id is only valid for the account that registered it — Keychain
      // storage survives a reinstall (unlike a Mac-side ad-hoc-signed rebuild), so
      // signing into a *different* account here would otherwise silently reuse a
      // device id the new account doesn't own, and every /ws connection would 403
      // forever with no way to recover short of manually clearing Keychain. Confirm
      // it's still actually in this account's device list before trusting it.
      const owned = await apiClient
        .listDevices(accessToken)
        .then((devices) => devices.some((device) => device.id === cached))
        .catch(() => true); // network hiccup on this check shouldn't block startup — fall through and try the cached id
      if (owned) {
        if (!get().thisDeviceId) {
          const name = await getItem(DEVICE_NAME_KEY);
          set({ thisDeviceId: cached, thisDeviceName: name });
        }
        return cached;
      }
    }

    const publicIdentifier = await loadOrCreateDeviceIdentity();
    const device = await registerWithIdentity(publicIdentifier, accessToken);
    await setItem(DEVICE_ID_KEY, device.id);
    await setItem(DEVICE_NAME_KEY, device.name);
    set({ thisDeviceId: device.id, thisDeviceName: device.name });
    return device.id;
  },

  refreshDevices: async (accessToken: string) => {
    set({ isLoading: true, error: null });
    try {
      const devices = await apiClient.listDevices(accessToken);
      set({ devices, isLoading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load devices', isLoading: false });
    }
  },

  removeDevice: async (deviceId: string, accessToken: string) => {
    await apiClient.deleteDevice(deviceId, accessToken);
    set({ devices: get().devices.filter((device) => device.id !== deviceId) });
  },
}));
