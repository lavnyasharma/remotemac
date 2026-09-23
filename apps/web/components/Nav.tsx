'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { nav } from '@/lib/content';
import { REPO_URL } from '@/lib/config';
import { ThemeToggle } from './ThemeToggle';

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? 'border-b border-[var(--border)] bg-[var(--scrim)] backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-content items-center justify-between px-5 py-3.5 sm:px-8"
      >
        <a href="#top" className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text)]">
          <Image src="/icon.png" alt="" width={24} height={24} className="rounded-[6px]" priority />
          RemoteMac
        </a>

        <ul className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="text-[13px] font-medium text-[var(--text-2)] transition-colors hover:text-[var(--text)]"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-[var(--text)] px-4 py-2 text-[13px] font-semibold text-[var(--bg)] transition-opacity hover:opacity-85"
          >
            Get RemoteMac
          </a>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M5 5l14 14M19 5 5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="border-t border-[var(--border)] bg-[var(--bg)] px-5 pb-6 pt-2 md:hidden">
          <ul className="flex flex-col gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-2 py-3 text-[15px] font-medium text-[var(--text)]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block rounded-full bg-[var(--text)] px-4 py-3 text-center text-[14px] font-semibold text-[var(--bg)]"
          >
            Get RemoteMac
          </a>
        </div>
      )}
    </header>
  );
}
