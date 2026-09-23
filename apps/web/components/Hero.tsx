'use client';

import { type PointerEvent, type ReactNode, useRef } from 'react';
import Image from 'next/image';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { hero } from '@/lib/content';
import { REPO_URL } from '@/lib/config';
import { AmbientGlow } from './AmbientGlow';
import { Starfield } from './Starfield';

/**
 * A mount-safe parallax for above-the-fold art: `ParallaxPhone` elsewhere on the page ties its
 * reveal to scroll position, which works great for a section the user scrolls down TO, but
 * left this hero image invisible until the very first scroll event (its ScrollTrigger start/end
 * offsets aren't known until then). This instead tilts toward the pointer immediately on mount,
 * on its own transform so it layers over the entrance fade/slide below without fighting it.
 */
function HeroArt({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 150, damping: 22, mass: 0.5 };
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [7, -7]), spring);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-7, 7]), spring);

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    px.set((e.clientX - rect.left) / rect.width - 0.5);
    py.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const handleLeave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className="relative mx-auto w-full max-w-[420px] lg:mx-0 lg:max-w-none"
      style={{ perspective: 900 }}
    >
      <motion.div style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}>{children}</motion.div>
    </div>
  );
}

export function Hero() {
  const prefersReducedMotion = useReducedMotion();
  const rise = (delay: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay, ease: 'easeOut' as const },
        };

  // Section-wide pointer tracking, independent of HeroArt's own (tighter, art-box-relative)
  // tracking — this one drives the far-back starfield so the sky parallaxes at a different
  // rate than the device art floating in front of it, instead of the two moving as one plane.
  const skyX = useMotionValue(0);
  const skyY = useMotionValue(0);
  const handleSkyMove = (e: PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    skyX.set((e.clientX - rect.left) / rect.width - 0.5);
    skyY.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const handleSkyLeave = () => {
    skyX.set(0);
    skyY.set(0);
  };

  return (
    <section
      id="top"
      onPointerMove={prefersReducedMotion ? undefined : handleSkyMove}
      onPointerLeave={prefersReducedMotion ? undefined : handleSkyLeave}
      className="relative flex min-h-[100dvh] items-center overflow-hidden pt-28 pb-14 sm:pt-32 sm:pb-20"
    >
      <Starfield px={skyX} py={skyY} />
      <AmbientGlow className="left-[10%] top-[8%] h-[380px] w-[380px]" drift={70} />
      <AmbientGlow className="right-[8%] top-[35%] h-[420px] w-[420px]" drift={-55} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(0,113,227,0.1),transparent)]"
      />
      <div className="mx-auto grid w-full max-w-content items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-10">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <motion.span
            {...rise(0)}
            className="mb-14 rounded-full border border-[var(--border-strong)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--text-2)]"
          >
            {hero.eyebrow}
          </motion.span>

          <motion.h1
            {...rise(0.08)}
            className="text-balance text-[40px] font-bold leading-[1.08] tracking-tight text-[var(--text)] sm:text-[56px] lg:text-[60px]"
          >
            {hero.title[0]}
            <br />
            <span className="text-[#0071E3]">{hero.title[1]}</span>
          </motion.h1>

          <motion.p
            {...rise(0.1)}
            className="mt-14 max-w-xl text-balance text-[17px] leading-relaxed text-[var(--text-2)] sm:text-[19px]"
          >
            {hero.subtitle}
          </motion.p>

          <motion.div {...rise(0.15)} className="mt-20 flex flex-col items-center gap-4 sm:flex-row lg:items-start">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-[#0071E3] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_16px_30px_-12px_rgba(0,113,227,0.55)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              {hero.primaryCta}
            </a>
            <a
              href="#how-it-works"
              className="rounded-full border border-[var(--border-strong)] px-7 py-3.5 text-[15px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-3)]"
            >
              {hero.secondaryCta}
            </a>
          </motion.div>

          <motion.p {...rise(0.2)} className="mt-14 text-[13px] text-[var(--text-3)]">
            {hero.note}
          </motion.p>
        </div>

        {/* Both renders are transparent (no background of their own), so they float directly
            on the page instead of sitting in a bordered card — HeroArt adds the pointer-tilt
            parallax, this outer motion.div the entrance fade/slide (mount-triggered, so it's
            visible immediately rather than waiting on a scroll-tied reveal). */}
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, x: 28 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
        >
          <HeroArt>
            {/* Desktop composition: MacBook + iPhone + iPad with feature callouts, shown at lg
                and up alongside the two-column text layout. */}
            <div className="relative hidden aspect-[1536/1024] w-full lg:block">
              <Image
                src="/screenshots/hero_banner_desktop.png"
                alt="RemoteMac controlling a MacBook Pro from an iPhone: cursor control, keyboard typing, live screen view, scroll and drag gestures, app management, and a fast, secure connection"
                fill
                sizes="50vw"
                className="object-contain"
                priority
              />
            </div>
            {/* Mobile/tablet composition: the same feature callouts arranged around a single
                portrait iPhone, shown below lg where the layout stacks instead of splitting. */}
            <div className="relative aspect-[1086/1448] w-full lg:hidden">
              <Image
                src="/screenshots/hero_banner_mobile.png"
                alt="RemoteMac controlling a Mac from an iPhone: cursor control, keyboard typing, live screen view, scroll and drag gestures, app management, and a fast, secure connection"
                fill
                sizes="(min-width: 640px) 420px, 90vw"
                className="object-contain"
                priority
              />
            </div>
          </HeroArt>
        </motion.div>
      </div>
    </section>
  );
}
