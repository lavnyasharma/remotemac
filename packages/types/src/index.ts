export type Uuid = string;
export type IsoTimestamp = string;

export type DevicePlatform = "ios" | "macos";

export interface User {
  id: Uuid;
  email: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface Device {
  id: Uuid;
  userId: Uuid;
  deviceType: "mac" | "iphone";
  name: string;
  platform: DevicePlatform;
  publicIdentifier: string;
  lastSeenAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export type DevicePairStatus = "pending" | "approved" | "rejected" | "revoked";

export interface DevicePair {
  id: Uuid;
  userId: Uuid;
  macDeviceId: Uuid;
  remoteDeviceId: Uuid;
  status: DevicePairStatus;
  approvedAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export type SessionStatus = "active" | "ended";

export interface Session {
  id: Uuid;
  devicePairId: Uuid;
  startedAt: IsoTimestamp;
  endedAt: IsoTimestamp | null;
  status: SessionStatus;
  disconnectReason: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: IsoTimestamp;
}
