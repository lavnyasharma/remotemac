import { upcoming } from '@/lib/content';
import { Reveal } from './Reveal';

export function Upcoming() {
  return (
    <section id="upcoming" className="relative border-t border-[var(--border)] py-16 sm:py-24">
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
              {upcoming.eyebrow}
            </span>
            <h2 className="mt-4 text-balance text-[32px] font-bold tracking-tight text-[var(--text)] sm:text-[40px]">
              {upcoming.title}
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-[var(--text-2)]">{upcoming.body}</p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {upcoming.items.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.06}>
              <div className="h-full rounded-2xl border border-[var(--border)] p-6">
                <h3 className="text-[18px] font-semibold text-[var(--text)]">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-2)]">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
