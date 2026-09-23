/** 4pt-based spacing scale, reused everywhere instead of one-off margin/padding numbers. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

/** HIG accessibility.md: default control hit region on iOS is 44x44pt, minimum 28x28pt. */
export const minHitTarget = 44;
