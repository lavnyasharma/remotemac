import type { Config } from 'tailwindcss';

// Brand tokens are lifted from the real apps' design system (apps/ios/src/theme/colors.ts,
// apps/mac AppIcon): system blue accent, indigo/teal tile tints, glow shadows. Light mode is a
// new, original surface built for the marketing site — the apps themselves are dark-only by
// deliberate product decision (screen mirroring is an "immersive media" case per HIG dark-mode.md),
// but a marketing site is read in daylight as often as at night.
const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#0071E3',
          soft: 'rgba(0,113,227,0.12)',
        },
        indigo: '#7C6CFF',
        teal: '#2DD4CF',
        surface: {
          light: '#FFFFFF',
          'light-2': '#F5F5F7',
          dark: '#000000',
          'dark-2': '#0A0A0C',
          'dark-3': '#151517',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['SF Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      maxWidth: {
        content: '1180px',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.06)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'star-twinkle': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 3.2s ease-in-out infinite',
        'fade-up': 'fade-up 0.6s ease-out both',
        float: 'float 6s ease-in-out infinite',
        'star-twinkle': 'star-twinkle 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
