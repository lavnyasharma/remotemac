'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { features, type Feature } from '@/lib/content';
import { Reveal } from './Reveal';
import { AmbientGlow } from './AmbientGlow';
import { ParallaxPhone } from './ParallaxPhone';

// Slow enough to read the active row's body text before it advances; the crossfade itself is
// what made the old, faster interval (1.8s) read as flickering rather than a deliberate slide.
const AUTO_ADVANCE_MS = 3200;

/**
 * One compact showcase instead of five stacked alternating image/text rows — every image here
 * is a real screenshot (see public/screenshots/*.png, sourced from the actual apps), and
 * clicking a row crossfades the stage to match rather than pushing the page taller.
 */
export function Features() {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [inView, setInView] = useState(true);
  const paused = hovered || !inView;
  const stageRef = useRef<HTMLDivElement>(null);

  // Auto-advances like a slideshow, resetting on every change (including a manual click) so a
  // click always gets the full dwell time instead of being cut short by a timer already in
  // flight. Paused on hover/focus (so it doesn't swap the image out from under someone reading)
  // and while the stage is scrolled out of view (so it isn't mid-crossfade the moment it
  // reappears) — two independent reasons to pause, tracked separately so one clearing doesn't
  // fight the other still holding it paused.
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setActive((prev) => (prev + 1) % features.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [active, paused]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), {
      threshold: 0.3,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="features"
      ref={stageRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="relative overflow-hidden border-t border-[var(--border)] py-16 sm:py-24"
    >
      <AmbientGlow className="left-[8%] top-[15%] h-[420px] w-[420px]" drift={80} />
      <AmbientGlow className="right-[5%] top-[60%] h-[360px] w-[360px]" drift={-60} />
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
              Feature
            </span>
            <h2 className="mt-4 text-balance text-[32px] font-bold tracking-tight text-[var(--text)] sm:text-[40px]">
              Everything you need to reach your Mac.
            </h2>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-14 grid gap-10 lg:grid-cols-[420px_minmax(0,1fr)] lg:items-center lg:gap-16">
            <div className="order-2 flex flex-col gap-2 lg:order-1">
              {features.map((f, index) => (
                <FeatureRow
                  key={f.title}
                  f={f}
                  isActive={index === active}
                  onActivate={() => setActive(index)}
                />
              ))}
            </div>

            <div className="order-1 lg:order-2">
              {/* No card chrome around the stage — every image here is a transparent render of
                  its own device (see public/screenshots/*.png), so it floats directly on the
                  section background instead of sitting inside a bordered box. ParallaxPhone
                  (scroll-scrubbed reveal + pointer tilt) wraps only the image, not the dots
                  below, so the tilt doesn't apply to an interactive control. */}
              <ParallaxPhone>
                <div className="relative flex h-[300px] items-center justify-center sm:h-[420px]">
                  {/* Every feature's image is mounted from the start and cross-fades by opacity
                      alone — swapping via AnimatePresence's mount/unmount made each transition
                      wait on that image's network fetch, so it popped in late and read as a
                      flicker rather than a smooth crossfade. */}
                  {features.map((f, index) => (
                    <motion.div
                      key={f.title}
                      animate={{ opacity: index === active ? 1 : 0 }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                      style={{ pointerEvents: index === active ? 'auto' : 'none' }}
                      className="absolute inset-0"
                      aria-hidden={index === active ? undefined : true}
                    >
                      <Image
                        src={f.image}
                        alt={f.alt}
                        fill
                        sizes="480px"
                        className={`object-contain ${f.mobileImage ? 'hidden lg:block' : ''}`}
                        priority={index === 0}
                      />
                      {f.mobileImage && (
                        <Image
                          src={f.mobileImage}
                          alt={f.alt}
                          fill
                          sizes="90vw"
                          className="object-contain lg:hidden"
                          priority={index === 0}
                        />
                      )}
                    </motion.div>
                  ))}
                </div>
              </ParallaxPhone>

              {/* Dots double as a touch-friendly carousel control on narrow screens, where the
                  tab list above stacks below the image instead of beside it. */}
              <div className="mt-5 flex items-center justify-center gap-2 lg:hidden">
                {features.map((f, index) => (
                  <button
                    key={f.title}
                    type="button"
                    onClick={() => setActive(index)}
                    aria-label={`Show ${f.eyebrow}`}
                    aria-pressed={index === active}
                    className={`h-1.5 rounded-full transition-all ${
                      index === active ? 'w-6 bg-[#0071E3]' : 'w-1.5 bg-[var(--border-strong)]'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FeatureRow({ f, isActive, onActivate }: { f: Feature; isActive: boolean; onActivate: () => void }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-pressed={isActive}
      className={`rounded-2xl border px-5 py-4 text-left transition-colors ${
        isActive
          ? 'border-[#0071E3]/30 bg-[#0071E3]/[0.07]'
          : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--surface)]'
      }`}
    >
      <span
        className={`text-[13px] font-semibold uppercase tracking-wide ${
          isActive ? 'text-[#3B82F6]' : 'text-[var(--text-3)]'
        }`}
      >
        {f.eyebrow}
      </span>
      <h3 className="mt-1 text-[19px] font-bold leading-snug tracking-tight text-[var(--text)]">{f.title}</h3>
      <AnimatePresence initial={false}>
        {isActive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <p className="pt-2 text-[15px] leading-relaxed text-[var(--text-2)]">{f.body}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
