'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';

/**
 * The architecture facts from docs/architecture.md and docs/security.md, drawn as a scroll-
 * scrubbed diagram: the dashed iPhone–Backend–Mac line and the three nodes settle in first,
 * then the solid "direct · peer-to-peer" line draws itself as you keep scrolling — motion
 * that mirrors what the diagram is actually saying (signaling first, then a direct link).
 */
export function ArchitectureDiagram() {
  const rootRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const nodes = nodesRef.current;
    const path = pathRef.current;
    const glow = glowRef.current;
    if (!root || !nodes || !path || !glow) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

    const tl = gsap.timeline({
      scrollTrigger: { trigger: root, start: 'top 80%', end: 'bottom 55%', scrub: true },
    });

    tl.fromTo(
      Array.from(nodes.children),
      { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, stagger: 0.12, ease: 'none', duration: 0.4 }
    )
      .fromTo(path, { drawSVG: '0%' }, { drawSVG: '100%', ease: 'none', duration: 0.5 }, 0.3)
      .fromTo(glow, { autoAlpha: 0, scale: 0.5 }, { autoAlpha: 1, scale: 1, ease: 'none', duration: 0.3 }, 0.75);

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  return (
    <div ref={rootRef} className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg-2)] p-8">
      <div ref={nodesRef} className="flex items-center justify-between gap-3">
        <Node label="iPhone" />
        <Node label="Backend" sub="sign-in · pairing · signaling" muted />
        <Node label="Mac" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 px-2">
        <span className="h-px flex-1 border-t border-dashed border-[var(--border-strong)]" />
        <span className="h-px flex-1 border-t border-dashed border-[var(--border-strong)]" />
      </div>
      <p className="mt-2 text-center text-[11px] text-[var(--text-3)]">sign-in and pairing only</p>

      <div className="relative mt-10 flex items-center justify-center">
        <svg viewBox="0 0 200 2" className="h-[2px] w-full overflow-visible" preserveAspectRatio="none">
          <path
            ref={pathRef}
            d="M0 1 H200"
            stroke="#0071E3"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          <circle ref={glowRef} cx="100" cy="1" r="10" fill="#0071E3" opacity="0.35" style={{ filter: 'blur(4px)' }} />
        </svg>
        <span className="absolute rounded-full bg-[var(--bg-2)] px-3 text-[11px] font-semibold text-[var(--text)]">
          direct · peer-to-peer
        </span>
      </div>
      <p className="mt-3 text-center text-[13px] text-[var(--text-2)]">
        Screen · Keyboard · Mouse · Clipboard
      </p>
    </div>
  );
}

function Node({ label, sub, muted }: { label: string; sub?: string; muted?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-[12px] font-semibold ${
          muted
            ? 'border-dashed border-[var(--border-strong)] bg-transparent text-[var(--text-3)]'
            : 'border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)]'
        }`}
      >
        {label}
      </div>
      {sub && <span className="max-w-[90px] text-[10px] leading-tight text-[var(--text-3)]">{sub}</span>}
    </div>
  );
}
