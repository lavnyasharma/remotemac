import Image from 'next/image';
import { howItWorks } from '@/lib/content';
import { Reveal } from './Reveal';
import { ParallaxPhone } from './ParallaxPhone';
import { AmbientGlow } from './AmbientGlow';

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative overflow-hidden border-t border-[var(--border)] py-16 sm:py-24">
      <AmbientGlow className="right-[10%] top-[10%] h-[380px] w-[380px]" drift={-70} />
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
              How it works
            </span>
            <h2 className="mt-4 text-balance text-[32px] font-bold tracking-tight text-[var(--text)] sm:text-[40px]">
              From install to in control, in three steps.
            </h2>
          </div>
        </Reveal>

        <div className="mt-12 flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-14">
          <ol className="flex flex-1 flex-col gap-8">
            {howItWorks.map((step, i) => (
              <Reveal key={step.number} delay={i * 0.08} as="li" className="flex gap-5">
                <span className="text-[15px] font-semibold text-[var(--text-3)]">{step.number}</span>
                <div className="flex-1 border-l border-[var(--border)] pl-5">
                  <h3 className="text-[20px] font-semibold text-[var(--text)]">{step.title}</h3>
                  <p className="mt-2 max-w-md text-[16px] leading-relaxed text-[var(--text-2)]">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>

          <ParallaxPhone className="flex flex-1 justify-center">
            <div className="relative w-full max-w-[300px]">
              <Image
                src="/screenshots/mob_connection.png"
                alt="RemoteMac pairing screen on iPhone: the six-digit code entered, paired successfully"
                width={600}
                height={1200}
                className="h-auto w-full"
                priority
              />
            </div>
          </ParallaxPhone>
        </div>
      </div>
    </section>
  );
}
