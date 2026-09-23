'use client';

import Image from 'next/image';
import { Reveal } from './Reveal';
import { AmbientGlow } from './AmbientGlow';
import { StickyScroll } from './ui/sticky-scroll-reveal';

const STEPS = [
  {
    eyebrow: 'Step 1',
    title: 'Generate a pairing code',
    body: 'Open RemoteMac on your Mac and tap "Generate Code" — a six-digit code appears, ready to enter on your iPhone.',
    image: '/screenshots/carousel1.png',
    alt: 'RemoteMac onboarding on the Mac: "Pair your iPhone" step with a Generate Code button',
  },
  {
    eyebrow: 'Step 2',
    title: 'Approve the request',
    body: 'The moment your iPhone submits that code, your Mac asks you to confirm — tap Allow to let it connect.',
    image: '/screenshots/carousel2.png',
    alt: 'RemoteMac onboarding on the Mac: "My iPhone wants to pair" with Allow and Reject buttons',
  },
  {
    eyebrow: 'Step 3',
    title: 'You’re connected',
    body: 'Paired successfully — hit Continue and your iPhone can see and control this Mac from anywhere.',
    image: '/screenshots/carousel3.png',
    alt: 'RemoteMac onboarding on the Mac: "Paired successfully" with a Continue button',
  },
];

const STICKY_SCROLL_CONTENT = STEPS.map((step) => ({
  title: `${step.eyebrow} — ${step.title}`,
  description: step.body,
  content: (
    <div className="flex h-full w-full items-center justify-center p-2">
      <div className="relative aspect-[1813/868] w-full">
        <Image src={step.image} alt={step.alt} fill sizes="480px" className="object-contain" />
      </div>
    </div>
  ),
}));

export function OnboardingStack() {
  return (
    <section className="relative overflow-x-clip border-t border-[var(--border)] py-16 sm:py-24">
      <AmbientGlow className="left-[10%] top-[10%] h-[380px] w-[380px]" drift={70} />
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
              Getting started
            </span>
            <h2 className="mt-4 text-balance text-[32px] font-bold tracking-tight text-[var(--text)] sm:text-[40px]">
              A friendly first run, right on your Mac.
            </h2>
          </div>
        </Reveal>
      </div>

      {/* Desktop: the aceternity sticky-scroll-reveal component — a scrolling list of steps
          on the left with a sticky preview card on the right that swaps per active step. */}
      <div className="mx-auto mt-10 hidden max-w-content px-5 sm:px-8 lg:block">
        <StickyScroll content={STICKY_SCROLL_CONTENT} bordered contentClassName="h-80 w-[480px]" />
      </div>

      {/* Mobile/tablet: a plain stacked sequence, each step's image directly above its own
          text — no scroll-sync, since the sticky two-column stage doesn't fit a narrow screen. */}
      <div className="mx-auto mt-14 flex max-w-content flex-col gap-14 px-5 sm:px-8 lg:hidden">
        {STEPS.map((step) => (
          <div key={step.title}>
            <div className="relative aspect-[1813/868] w-full">
              <Image src={step.image} alt={step.alt} fill sizes="90vw" className="object-contain" />
            </div>
            <div className="mt-5">
              <span className="text-[13px] font-semibold uppercase tracking-wide text-[#3B82F6]">{step.eyebrow}</span>
              <h3 className="mt-2 text-[22px] font-bold leading-tight tracking-tight text-[var(--text)]">
                {step.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-2)]">{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
