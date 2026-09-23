/**
 * Which backend this build talks to. Mirrors the dev/staging/production
 * split in CLAUDE_BUILD_PLAN.md §47 and apps/mac/RemoteMac's
 * BackendEnvironment.swift — even for a personal project, the URL is never
 * hard-coded into business logic. A release build (`__DEV__` false — a
 * TestFlight/ad-hoc archive, not `react-native run-ios`) always uses the
 * production backend below; only debug builds use the dev switch.
 *
 * `localhost` resolves to the Mac itself from the iOS *Simulator* (it shares
 * the host's network stack), but from a physical iPhone `localhost` means
 * the phone itself — testing against a physical device needs the Mac's LAN
 * IP instead. Flip DEV_TARGET below when switching between the two; find
 * the Mac's current LAN IP with `ipconfig getifaddr en0` (Wi-Fi).
 */
type DevTarget = 'simulator' | 'device';
const DEV_TARGET: DevTarget = 'simulator';
const DEV_LAN_HOST = '10.35.8.147';

// A lookup table, not a direct `DEV_TARGET === 'device'` comparison — since DEV_TARGET is a
// const meant to be hand-toggled between builds, TypeScript narrows it to its single literal
// value and (correctly, if unhelpfully here) flags a same-value comparison as unreachable.
const DEV_HOST_BY_TARGET: Record<DevTarget, string> = { simulator: 'localhost', device: DEV_LAN_HOST };
const DEV_HOST = DEV_HOST_BY_TARGET[DEV_TARGET];

// render.yaml names the backend service "remotemac-backend", which Render turns into this
// exact *.onrender.com hostname unless that name was already taken — check the actual URL on
// the Render dashboard after the first deploy and update this if it differs. No custom domain
// is configured yet.
const PRODUCTION_API_BASE_URL = 'https://remotemac-backend.onrender.com';
const PRODUCTION_WS_BASE_URL = 'wss://remotemac-backend.onrender.com/ws';

const API_BASE_URL = __DEV__ ? `http://${DEV_HOST}:3000` : PRODUCTION_API_BASE_URL;
const WS_BASE_URL = __DEV__ ? `ws://${DEV_HOST}:3000/ws` : PRODUCTION_WS_BASE_URL;

export const backendEnvironment = {
  apiBaseURL: API_BASE_URL,
  webSocketBaseURL: WS_BASE_URL,
};
