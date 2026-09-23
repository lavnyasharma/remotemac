import { backendEnvironment } from '../../config/backendEnvironment';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
}

export type DeviceType = 'mac' | 'iphone';
export type DevicePlatform = 'ios' | 'macos';

export interface DeviceResponse {
  id: string;
  userId: string;
  deviceType: DeviceType;
  name: string;
  platform: DevicePlatform;
  publicIdentifier: string;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RTCIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface DevicePairResponse {
  pairId: string;
  device: DeviceResponse;
}

export class APIError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * REST client for the backend's auth/devices endpoints (see
 * services/backend). Does not manage token storage or refresh scheduling —
 * callers (authStore) own that. Mirrors apps/mac/RemoteMac's APIClient.swift.
 */
class APIClient {
  constructor(private readonly baseURL: string = backendEnvironment.apiBaseURL) {}

  register(email: string, password: string): Promise<AuthResponse> {
    return this.post('/auth/register', { email, password });
  }

  login(email: string, password: string): Promise<AuthResponse> {
    return this.post('/auth/login', { email, password });
  }

  refresh(refreshToken: string): Promise<RefreshResponse> {
    return this.post('/auth/refresh', { refreshToken });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.request('/auth/logout', 'POST', { refreshToken });
  }

  async registerDevice(input: {
    name: string;
    platform: DevicePlatform;
    deviceType: DeviceType;
    publicIdentifier: string;
    accessToken: string;
  }): Promise<DeviceResponse> {
    const { accessToken, ...body } = input;
    const { device } = await this.post<{ device: DeviceResponse }>('/devices', body, accessToken);
    return device;
  }

  async listDevices(accessToken: string): Promise<DeviceResponse[]> {
    const { devices } = await this.get<{ devices: DeviceResponse[] }>('/devices', accessToken);
    return devices;
  }

  async deleteDevice(deviceId: string, accessToken: string): Promise<void> {
    await this.request(`/devices/${deviceId}`, 'DELETE', undefined, accessToken);
  }

  async getIceServers(accessToken: string): Promise<RTCIceServerConfig[]> {
    const { iceServers } = await this.get<{ iceServers: RTCIceServerConfig[] }>(
      '/webrtc/ice-servers',
      accessToken,
    );
    return iceServers;
  }

  /**
   * Lets this device restore "who am I paired with" on launch, since a live
   * `pair.complete` WebSocket message only arrives while connected at the
   * moment a pairing happens.
   */
  async listDevicePairs(deviceId: string, accessToken: string): Promise<DevicePairResponse[]> {
    const { pairs } = await this.get<{ pairs: DevicePairResponse[] }>(`/devices/${deviceId}/pairs`, accessToken);
    return pairs;
  }

  private post<T>(path: string, body: Record<string, unknown>, accessToken?: string): Promise<T> {
    return this.request<T>(path, 'POST', body, accessToken);
  }

  private get<T>(path: string, accessToken?: string): Promise<T> {
    return this.request<T>(path, 'GET', undefined, accessToken);
  }

  private async request<T>(
    path: string,
    method: string,
    body?: Record<string, unknown>,
    accessToken?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseURL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new APIError(error instanceof Error ? error.message : 'Network request failed');
    }

    if (!response.ok) {
      const message = await response
        .json()
        .then((data: { error?: string }) => data.error)
        .catch(() => undefined);
      throw new APIError(message ?? `Request failed (${response.status})`, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}

export const apiClient = new APIClient();
