/**
 * Semantic color tokens for the app's visual identity: a permanently dark, glowing-accent
 * surface language (deep near-black backgrounds, elevated card surfaces, a single vivid blue
 * accent used for glow and primary actions). HIG's dark-mode.md carves out exactly this case —
 * "in rare cases, consider using only a dark appearance... for an app that supports immersive
 * media viewing" — and this app's whole purpose is looking at and controlling a Mac's screen,
 * so a light variant would work against the product rather than for it. This was a deliberate,
 * reference-driven product decision, not a default.
 */
export interface ThemeColors {
  // Backgrounds, primary -> tertiary hierarchy
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  groupedBackground: string;
  groupedBackgroundSecondary: string;

  // Card / row surfaces, elevated above the background
  surface: string;
  surfaceSecondary: string;

  // Foreground / text
  label: string;
  labelSecondary: string;
  labelTertiary: string;
  placeholderText: string;

  separator: string;
  opaqueSeparator: string;

  // A single accent means one thing throughout the app: the interactive/primary-action color.
  accent: string;
  accentContrast: string;
  /** A translucent wash of the accent, for glow halos and tinted icon tiles. */
  accentSoft: string;

  // Status colors — one color, one meaning, used consistently everywhere a status appears.
  positive: string;
  negative: string;
  warning: string;

  // Fill colors for controls/cards drawn on top of a background.
  fill: string;
  fillSecondary: string;

  // A small tint palette for settings-row icon tiles — distinct hues so a glance at the tile
  // color alone hints at the row's category, the way iOS's own Settings app does it.
  tileIndigo: string;
  tileTeal: string;
}

const darkColors: ThemeColors = {
  background: '#000000',
  backgroundSecondary: '#0C0C0E',
  backgroundTertiary: '#19191C',
  groupedBackground: '#000000',
  groupedBackgroundSecondary: '#121214',

  surface: '#121214',
  surfaceSecondary: '#1A1A1D',

  label: '#FFFFFF',
  labelSecondary: '#9A9DAE',
  labelTertiary: '#6B6E80',
  placeholderText: '#5B5E70',

  separator: 'rgba(255,255,255,0.08)',
  opaqueSeparator: '#25262F',

  // Apple's actual system blue — not an invented indigo/purple.
  accent: '#0071E3',
  accentContrast: '#FFFFFF',
  accentSoft: 'rgba(0,113,227,0.16)',

  positive: '#32D74B',
  negative: '#FF453A',
  warning: '#FF9F0A',

  fill: 'rgba(255,255,255,0.10)',
  fillSecondary: 'rgba(255,255,255,0.06)',

  tileIndigo: '#7C6CFF',
  tileTeal: '#2DD4CF',
};

export const Colors = { light: darkColors, dark: darkColors };

/** Screen Mode's own alias — same palette, kept as a name for call sites that predate the
 *  app going dark-only everywhere, and to make clear that surface is intentionally load-bearing
 *  there (it's the one screen where "dark" isn't just a preference but the actual content). */
export const consoleColors: ThemeColors = darkColors;

/**
 * A soft native glow (a real iOS shadow — GPU-blurred, no hard edges) behind an accent-colored
 * icon tile. Used sparingly, on its own: no layered fake-blur circles behind it, which just
 * produced visible concentric rings instead of a soft halo.
 */
export function glowShadow(color: string) {
  return {
    shadowColor: color,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  } as const;
}
