import Image from 'next/image';
import { footer } from '@/lib/content';
import { REPO_URL, GETTING_STARTED_URL, LICENSE_URL } from '@/lib/config';

function resolveHref(href: string) {
  if (href === 'repo') return REPO_URL;
  if (href === 'getting-started') return GETTING_STARTED_URL;
  return href;
}

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--border)] py-16">
      <div className="mx-auto max-w-content px-5 sm:px-8">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <a href="#top" className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text)]">
              <Image src="/icon.png" alt="" width={22} height={22} className="rounded-[5px]" />
              RemoteMac
            </a>
            <p className="mt-3 max-w-[220px] text-[13px] leading-relaxed text-[var(--text-3)]">
              {footer.tagline}
            </p>
          </div>

          <FooterColumn title="Product" links={footer.productLinks} />
          <FooterColumn
            title="Get RemoteMac"
            links={footer.resourceLinks.map((l) => ({ label: l.label, href: resolveHref(l.href) }))}
            external
          />
          <FooterColumn title="Legal" links={footer.legalLinks} />
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-[var(--border)] pt-8 text-[13px] text-[var(--text-3)]">
          <p className="max-w-[640px] leading-relaxed">
            &copy; {year} RemoteMac. A personal project, open source under the{' '}
            <a href={LICENSE_URL} target="_blank" rel="noreferrer" className="underline hover:text-[var(--text)]">
              PolyForm Noncommercial License
            </a>
            : free to use and modify for personal use, but reselling this software or a modified/extended version of
            it, or offering it as a paid service, isn&apos;t permitted. Premium features are planned for a future
            release.
          </p>
          <div className="flex items-center justify-between">
            <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer" className="hover:text-[var(--text)]">
              Contact via GitHub Issues
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
  external,
}: {
  title: string;
  links: readonly { label: string; href: string }[];
  external?: boolean;
}) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{title}</h3>
      <ul className="mt-4 flex flex-col gap-3">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noreferrer' : undefined}
              className="text-[14px] text-[var(--text-2)] transition-colors hover:text-[var(--text)]"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
