import type { Metadata, Viewport } from 'next';
import { GoogleAnalytics } from '@next/third-parties/google';
import './globals.css';
import { SITE_URL, SITE_NAME, GA_MEASUREMENT_ID } from '@/lib/config';

const title = 'RemoteMac — Control Your Mac From Your iPhone';
const description =
  "RemoteMac mirrors your Mac's screen to your iPhone and lets you control it — cursor, keyboard, and all — over a direct, peer-to-peer connection. Pair once, then control your Mac from anywhere your iPhone has a connection.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: title,
    template: `%s — ${SITE_NAME}`,
  },
  description,
  keywords: [
    'RemoteMac',
    'control Mac from iPhone',
    'iPhone Mac remote',
    'Mac remote control',
    'control your Mac remotely',
    'iPhone remote for Mac',
    'remote desktop Mac iPhone',
  ],
  applicationName: SITE_NAME,
  authors: [{ name: 'RemoteMac' }],
  category: 'technology',
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

// Runs before paint (no framework hydration wait) to avoid a flash of the wrong theme —
// reads the persisted choice, falling back to the OS preference exactly once.
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description,
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/app-icon.png`,
    },
    {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      operatingSystem: 'iOS, macOS',
      applicationCategory: 'UtilitiesApplication',
      description,
      url: SITE_URL,
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-sans antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
        {/* Only fires with a real GA4 property configured, and never in local dev, so dev
            traffic and placeholder IDs never pollute analytics. */}
        {GA_MEASUREMENT_ID && process.env.NODE_ENV === 'production' && (
          <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
        )}
      </body>
    </html>
  );
}
