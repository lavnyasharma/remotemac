import type { TextStyle } from 'react-native';

/**
 * iOS Dynamic Type text styles at the "Large" (default) size, per the HIG typography
 * specification — using these instead of ad hoc per-screen font sizes keeps a real, legible
 * hierarchy and scales correctly with the system's text-size setting since RN maps `fontSize`
 * through the OS's font-scale automatically.
 */
export const typography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' } satisfies TextStyle,
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' } satisfies TextStyle,
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' } satisfies TextStyle,
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' } satisfies TextStyle,
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' } satisfies TextStyle,
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' } satisfies TextStyle,
  bodyEmphasized: { fontSize: 17, lineHeight: 22, fontWeight: '600' } satisfies TextStyle,
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' } satisfies TextStyle,
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' } satisfies TextStyle,
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' } satisfies TextStyle,
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400' } satisfies TextStyle,
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400' } satisfies TextStyle,
} as const;

export type TypographyToken = keyof typeof typography;
