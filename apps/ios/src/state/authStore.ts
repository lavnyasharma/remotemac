import { create } from 'zustand';
import { apiClient, APIError, type AuthUser } from '../services/api/apiClient';
import { getItem, setItem, deleteItem } from '../services/auth/keychain';

const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const EMAIL_KEY = 'auth.email';
/** Access tokens live 15 minutes on the backend; refresh a little before that. */
const ACCESS_TOKEN_MAX_AGE_MS = 10 * 60 * 1000;

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: AuthUser | null;
  accessToken: string | null;
  /** When `accessToken` was issued (ms since epoch) — decides when it needs refreshing. */
  accessTokenIssuedAt: number;
  refreshToken: string | null;
  error: string | null;
  isBusy: boolean;
  bootstrap: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  /**
   * The current access token, refreshed first if it's close to expiring. Returns null when
   * a refresh isn't possible right now (offline) — callers retry later. Signs out only when
   * the backend definitively rejects the refresh token.
   */
  getFreshAccessToken: () => Promise<string | null>;
}

/** Refresh tokens are single-use (rotated on every refresh), so two refreshes racing with
 * the same token would revoke the session — every caller shares one in-flight refresh. */
let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Auth session state (build plan §25's authStore). Persists only the
 * refresh token and email in the Keychain (§26) — the access token is
 * short-lived and kept in memory only.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  accessTokenIssuedAt: 0,
  refreshToken: null,
  error: null,
  isBusy: false,

  bootstrap: async () => {
    const refreshToken = await getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      set({ status: 'signedOut' });
      return;
    }
    try {
      const refreshed = await apiClient.refresh(refreshToken);
      const email = await getItem(EMAIL_KEY);
      await setItem(REFRESH_TOKEN_KEY, refreshed.refreshToken);
      set({
        status: 'signedIn',
        user: email ? { id: '', email } : null,
        accessToken: refreshed.accessToken,
        accessTokenIssuedAt: Date.now(),
        refreshToken: refreshed.refreshToken,
      });
    } catch {
      // Expired refresh token, offline, or a corrupted keychain entry — send the user
      // back through sign-in rather than getting stuck on launch.
      await deleteItem(REFRESH_TOKEN_KEY);
      set({ status: 'signedOut' });
    }
  },

  signIn: async (email, password) => {
    set({ isBusy: true, error: null });
    try {
      const response = await apiClient.login(email, password);
      await setItem(REFRESH_TOKEN_KEY, response.refreshToken);
      await setItem(EMAIL_KEY, response.user.email);
      set({
        status: 'signedIn',
        user: response.user,
        accessToken: response.accessToken,
        accessTokenIssuedAt: Date.now(),
        refreshToken: response.refreshToken,
        isBusy: false,
      });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Sign in failed', isBusy: false });
      return false;
    }
  },

  register: async (email, password) => {
    set({ isBusy: true, error: null });
    try {
      const response = await apiClient.register(email, password);
      await setItem(REFRESH_TOKEN_KEY, response.refreshToken);
      await setItem(EMAIL_KEY, response.user.email);
      set({
        status: 'signedIn',
        user: response.user,
        accessToken: response.accessToken,
        accessTokenIssuedAt: Date.now(),
        refreshToken: response.refreshToken,
        isBusy: false,
      });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Registration failed', isBusy: false });
      return false;
    }
  },

  signOut: async () => {
    const { refreshToken } = get();
    if (refreshToken) {
      await apiClient.logout(refreshToken).catch(() => {});
    }
    await deleteItem(REFRESH_TOKEN_KEY);
    // Device registration (services/auth/deviceIdentity.ts) deliberately survives sign-out,
    // so signing back in with the same account keeps the same paired state. A different
    // account signing in on this same install would hit a publicIdentifier conflict
    // registering a device — an accepted limitation for personal-use software.
    set({ status: 'signedOut', user: null, accessToken: null, refreshToken: null, error: null });
  },

  getFreshAccessToken: async () => {
    const { status, accessToken, accessTokenIssuedAt } = get();
    if (status !== 'signedIn') return null;
    if (accessToken && Date.now() - accessTokenIssuedAt < ACCESS_TOKEN_MAX_AGE_MS) return accessToken;
    if (inFlightRefresh) return inFlightRefresh;

    inFlightRefresh = (async () => {
      const { refreshToken } = get();
      if (!refreshToken) return null;
      try {
        const refreshed = await apiClient.refresh(refreshToken);
        await setItem(REFRESH_TOKEN_KEY, refreshed.refreshToken);
        set({
          accessToken: refreshed.accessToken,
          accessTokenIssuedAt: Date.now(),
          refreshToken: refreshed.refreshToken,
        });
        return refreshed.accessToken;
      } catch (error) {
        if (error instanceof APIError && error.status === 401) {
          await get().signOut();
        }
        return null;
      } finally {
        inFlightRefresh = null;
      }
    })();
    return inFlightRefresh;
  },
}));
