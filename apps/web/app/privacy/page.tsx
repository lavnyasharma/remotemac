import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { REPO_URL } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How RemoteMac handles data today, and what is still to come before wider release.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main id="main" className="mx-auto max-w-2xl px-5 pb-24 pt-36 sm:px-8 sm:pt-44">
        <h1 className="text-[32px] font-bold tracking-tight text-[var(--text)]">Privacy</h1>
        <p className="mt-6 text-[16px] leading-relaxed text-[var(--text-2)]">
          RemoteMac is a personal, source-available project, not yet distributed on the App
          Store. A formal privacy policy will be published before that happens. Until then, here
          is exactly how it handles data today, based on the current implementation:
        </p>
        <ul className="mt-6 flex flex-col gap-4 text-[16px] leading-relaxed text-[var(--text-2)]">
          <li>
            The backend stores an account (email and an Argon2id password hash), a device
            registry, and pairing state — nothing else.
          </li>
          <li>
            Once your iPhone and Mac are paired, screen frames, mouse and keyboard input, and
            clipboard data travel directly between them over WebRTC. The backend does not receive
            or store this data.
          </li>
          <li>
            No command history, keystroke log, or screen recording is persisted anywhere.
          </li>
        </ul>
        <p className="mt-6 text-[16px] leading-relaxed text-[var(--text-2)]">
          For the full technical detail, see{' '}
          <a
            href={`${REPO_URL}/blob/main/docs/security.md`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#3B82F6]"
          >
            docs/security.md
          </a>{' '}
          and{' '}
          <a
            href={`${REPO_URL}/blob/main/docs/architecture.md`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#3B82F6]"
          >
            docs/architecture.md
          </a>{' '}
          in the repository.
        </p>
      </main>
      <Footer />
    </>
  );
}
