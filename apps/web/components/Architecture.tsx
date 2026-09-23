import Image from 'next/image';
import { architecture as a } from '@/lib/content';
import { Reveal } from './Reveal';
import { AmbientGlow } from './AmbientGlow';
import { ArchitectureDiagram } from './ArchitectureDiagram';

export function Architecture() {
  return (
    <section id="privacy" className="relative overflow-hidden border-t border-[var(--border)] py-16 sm:py-24">
      <AmbientGlow className="left-[50%] top-[20%] h-[440px] w-[440px] -translate-x-1/2" drift={50} />
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
              {a.eyebrow}
            </span>
            <h2 className="mt-4 text-balance text-[32px] font-bold leading-tight tracking-tight text-[var(--text)] sm:text-[38px]">
              {a.title}
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-[var(--text-2)]">{a.body}</p>

            <dl className="mt-10 flex flex-col gap-7">
              {a.points.map((point) => (
                <div key={point.title}>
                  <dt className="text-[16px] font-semibold text-[var(--text)]">{point.title}</dt>
                  <dd className="mt-1.5 text-[15px] leading-relaxed text-[var(--text-2)]">
                    {point.body}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <Reveal delay={0.12} className="flex items-center justify-center">
            <Image
              src="/screenshots/extra.png"
              alt="Architecture diagram: iPhone and Mac connect peer-to-peer, backend handles sign-in and pairing only"
              width={1600}
              height={1000}
              className="h-auto w-full max-w-[560px] rounded-2xl"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
