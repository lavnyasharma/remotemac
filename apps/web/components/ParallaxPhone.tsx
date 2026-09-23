'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * The actual Apple product-page move: the device doesn't just fade in once, it scrubs into
 * place tied directly to scroll position — scale up, untilt, sharpen — and reverses cleanly
 * if you scroll back up. That scrub tween owns exactly one element's transform; a second,
 * independent tween (on a nested element) handles the pointer-follow tilt, so the two never
 * fight over the same property. Skipped entirely under prefers-reduced-motion.
 */
export function ParallaxPhone({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const triggerEl = triggerRef.current;
    const scene = sceneRef.current;
    const tilt = tiltRef.current;
    if (!triggerEl || !scene || !tilt) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);

    gsap.set(scene, { transformPerspective: 1000, transformOrigin: '50% 100%' });

    const reveal = gsap.fromTo(
      scene,
      { autoAlpha: 0, scale: 0.82, y: 90, rotateX: 22 },
      {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        rotateX: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: triggerEl,
          start: 'top 92%',
          end: 'top 38%',
          scrub: true,
        },
      }
    );

    // Pointer-follow tilt on a nested element — its own transform, so it layers on top of
    // the scroll-scrubbed one above instead of overwriting it.
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let onMove: ((e: PointerEvent) => void) | null = null;
    let onLeave: (() => void) | null = null;

    if (canHover) {
      gsap.set(tilt, { transformPerspective: 700 });
      onMove = (e: PointerEvent) => {
        const rect = triggerEl.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        gsap.to(tilt, { rotateY: px * 12, rotateX: -py * 12, duration: 0.6, ease: 'power2.out' });
      };
      onLeave = () => gsap.to(tilt, { rotateY: 0, rotateX: 0, duration: 0.8, ease: 'power3.out' });
      triggerEl.addEventListener('pointermove', onMove);
      triggerEl.addEventListener('pointerleave', onLeave);
    }

    return () => {
      reveal.scrollTrigger?.kill();
      reveal.kill();
      if (onMove) triggerEl.removeEventListener('pointermove', onMove);
      if (onLeave) triggerEl.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div ref={triggerRef} className={className}>
      <div ref={sceneRef} style={{ willChange: 'transform, opacity' }}>
        <div ref={tiltRef} style={{ transformStyle: 'preserve-3d' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
