'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * A soft, single-hue light bloom that drifts slowly as the page scrolls — the ambient depth
 * layer behind Apple's product sections, never a second color mixed in (see the earlier
 * gradient-text feedback: light falloff to transparent is not the same thing as a color
 * gradient on content). Purely decorative — aria-hidden, and inert under reduced motion.
 */
export function AmbientGlow({
  className,
  drift = 60,
}: {
  className?: string;
  drift?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const tween = gsap.to(el, {
      y: drift,
      ease: 'none',
      scrollTrigger: { trigger: el.parentElement ?? el, start: 'top bottom', end: 'bottom top', scrub: true },
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [drift]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute -z-10 rounded-full bg-[radial-gradient(circle,rgba(0,113,227,0.16),transparent_70%)] blur-2xl ${className ?? ''}`}
      style={{ willChange: 'transform' }}
    />
  );
}
