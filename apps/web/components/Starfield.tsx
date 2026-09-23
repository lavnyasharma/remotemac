'use client';

import { motion, useReducedMotion, useSpring, useTransform, type MotionValue } from 'framer-motion';

/**
 * Deterministic PRNG (not Math.random) so the star field renders identically on server and
 * client — a hydration mismatch would otherwise flash every star into a new position on mount.
 */
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starLayerShadow(seed: number, count: number, w: number, h: number, color: string) {
  const random = mulberry32(seed);
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    dots.push(`${Math.round(random() * w)}px ${Math.round(random() * h)}px ${color}`);
  }
  return dots.join(',');
}

// Field is sized to comfortably cover the hero on desktop; the section clips it on narrower
// viewports, which is fine since it's purely decorative background texture.
const FIELD_W = 1400;
const FIELD_H = 640;

// Three depths (far/mid/near): smaller, dimmer, slower-twinkling stars move least under the
// pointer-parallax; larger, brighter ones move most — the standard multi-plane depth cue.
const LAYERS = [
  { shadow: starLayerShadow(1, 130, FIELD_W, FIELD_H, 'rgba(255,255,255,0.4)'), size: 1, depth: 5, duration: '6s', delay: '0s' },
  { shadow: starLayerShadow(2, 70, FIELD_W, FIELD_H, 'rgba(151,190,255,0.65)'), size: 1.5, depth: 12, duration: '4.5s', delay: '-1.5s' },
  { shadow: starLayerShadow(3, 28, FIELD_W, FIELD_H, 'rgba(255,255,255,0.9)'), size: 2, depth: 22, duration: '3.5s', delay: '-1s' },
] as const;

function StarLayer({
  layer,
  px,
  py,
  parallax,
}: {
  layer: (typeof LAYERS)[number];
  px: MotionValue<number>;
  py: MotionValue<number>;
  parallax: boolean;
}) {
  const springConfig = { stiffness: 40, damping: 20, mass: 0.6 };
  const x = useSpring(useTransform(px, [-0.5, 0.5], [layer.depth, -layer.depth]), springConfig);
  const y = useSpring(useTransform(py, [-0.5, 0.5], [layer.depth, -layer.depth]), springConfig);

  return (
    <motion.div
      className="animate-star-twinkle absolute left-0 top-0 rounded-full"
      style={{
        x: parallax ? x : 0,
        y: parallax ? y : 0,
        width: layer.size,
        height: layer.size,
        boxShadow: layer.shadow,
        animationDuration: layer.duration,
        animationDelay: layer.delay,
      }}
    />
  );
}

/**
 * Ambient night-sky background for the hero: three parallax-depth star layers that drift
 * gently toward the pointer (paired with `HeroArt`'s tilt, and moving less, so the device art
 * reads as closer than the sky behind it) and twinkle independently of it. Purely decorative —
 * aria-hidden, inert under reduced motion, and faded out on the light theme in globals.css.
 */
export function Starfield({ px, py }: { px: MotionValue<number>; py: MotionValue<number> }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="starfield pointer-events-none absolute inset-0 -z-20 overflow-hidden transition-opacity duration-500"
    >
      {LAYERS.map((layer, i) => (
        <StarLayer key={i} layer={layer} px={px} py={py} parallax={!prefersReducedMotion} />
      ))}
    </div>
  );
}
