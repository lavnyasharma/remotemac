import { Colors, type ThemeColors } from './colors';

export interface Theme {
  colors: ThemeColors;
  scheme: 'light' | 'dark';
}

/**
 * Always dark — a deliberate product decision (see colors.ts), not a default. Kept as a hook
 * (rather than a plain constant import) so call sites don't change if that decision ever does.
 */
export function useTheme(): Theme {
  return { colors: Colors.dark, scheme: 'dark' };
}
