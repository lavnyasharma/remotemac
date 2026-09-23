import { create } from 'zustand';

interface ScreenPreferencesState {
  /** Whether Screen Mode shows the floating cursor joystick alongside the touchpad. */
  showJoystick: boolean;
  setShowJoystick: (value: boolean) => void;
  /**
   * Whether Screen Mode uses the relative touchpad (drag anywhere to move the cursor, like a
   * physical trackpad) or direct touch (the cursor jumps straight to wherever you touch the
   * mirrored screen, like a touchscreen). Pinch-to-zoom works either way.
   */
  showTrackpad: boolean;
  setShowTrackpad: (value: boolean) => void;
}

/**
 * User-facing Screen Mode preferences, surfaced as toggles in Settings. In-memory only for
 * now (the app has no on-device persistence layer yet — see authStore's use of the keychain
 * for the one thing that does need to survive a relaunch); this resets to the default each
 * launch, which is an acceptable trade-off until a persistence dependency is worth adding.
 */
export const useScreenPreferencesStore = create<ScreenPreferencesState>((set) => ({
  showJoystick: true,
  setShowJoystick: (value) => set({ showJoystick: value }),
  // Direct touch on the mirrored screen (plus the joystick and L/R click buttons) is the
  // primary experience — the touchpad strip is an optional add-on, not a requirement, so it
  // starts off rather than on.
  showTrackpad: false,
  setShowTrackpad: (value) => set({ showTrackpad: value }),
}));
