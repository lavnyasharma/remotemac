import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { REPO_URL } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Terms of use for RemoteMac, a personal, source-available project.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <>
      <Nav />
      <main id="main" className="mx-auto max-w-2xl px-5 pb-24 pt-36 sm:px-8 sm:pt-44">
        <h1 className="text-[32px] font-bold tracking-tight text-[var(--text)]">Terms</h1>
        <p className="mt-6 text-[16px] leading-relaxed text-[var(--text-2)]">
          RemoteMac is a personal, source-available project, currently distributed only as
          source code you build yourself — it is not yet on the App Store or TestFlight. A
          formal terms of service will be published alongside that wider release.
        </p>
        <p className="mt-6 text-[16px] leading-relaxed text-[var(--text-2)]">
          Until then, the project's source and issue tracker are on{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-medium text-[#3B82F6]">
            GitHub
          </a>
          .
        </p>
      </main>
      <Footer />
    </>
  );
}
