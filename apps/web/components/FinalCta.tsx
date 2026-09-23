'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { finalCta } from '@/lib/content';
import { REPO_URL } from '@/lib/config';
import { Reveal } from './Reveal';

export function FinalCta() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden border-t border-[var(--border)] py-20 sm:py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[360px] bg-[radial-gradient(ellipse_60%_60%_at_50%_100%,rgba(0,113,227,0.1),transparent)]"
      />
      <div className="mx-auto grid max-w-content items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-10">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <Reveal>
            <h2 className="text-balance text-[36px] font-bold leading-[1.1] tracking-tight text-[var(--text)] sm:text-[52px]">
              {finalCta.title[0]}
              <br />
              {finalCta.title[1]}
              <br />
              <span className="text-[#0071E3]">{finalCta.title[2]}</span>
            </h2>
          </Reveal>

          <Reveal delay={0.08}>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-block rounded-full bg-[#0071E3] px-8 py-4 text-[16px] font-semibold text-white shadow-[0_16px_28px_-14px_rgba(0,113,227,0.5)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              {finalCta.primaryCta}
            </a>
            <p className="mt-4 text-[13px] text-[var(--text-3)]">{finalCta.note}</p>
          </Reveal>
        </div>

        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, x: 28 }}
          whileInView={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mx-auto w-full max-w-[420px] lg:mx-0 lg:max-w-none"
        >
          <div className="relative w-full overflow-hidden rounded-3xl">
            <Image
              src="/screenshots/homepage.png"
              alt="RemoteMac devices list on iPhone, ready to add a Mac"
              width={1536}
              height={1024}
              className="h-auto w-full"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
