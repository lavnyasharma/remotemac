'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * A single, brief, cancellable reveal — HIG motion.md's "aim for brevity and precision" and
 * "let people cancel motion" applied to scroll reveals: `whileInView` fires once and settles
 * fast, so it never blocks reading or repeats distractingly on re-scroll.
 */
export function Reveal({
  children,
  delay = 0,
  y = 10,
  className,
  as = 'div',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  /** Element to render as — 'li' keeps list markup valid when revealing a list item directly. */
  as?: 'div' | 'li';
}) {
  const prefersReducedMotion = useReducedMotion();

  const variants: Variants = prefersReducedMotion
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y },
        visible: { opacity: 1, y: 0 },
      };

  const MotionTag = as === 'li' ? motion.li : motion.div;

  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={variants}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
    >
      {children}
    </MotionTag>
  );
}
