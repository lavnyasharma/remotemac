/**
 * Single source of truth for the site's copy. Every claim here traces back to something
 * verified in the codebase (apps/ios/src, apps/mac/RemoteMac, docs/*.md) — no invented
 * features, stats, or distribution claims. Keeping copy here (not scattered in JSX) makes it
 * easy to audit against the app as the app changes.
 */

export const nav = [
  { label: 'Product', href: '#product' },
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Privacy', href: '#privacy' },
] as const;

export const hero = {
  eyebrow: 'iPhone + Mac',
  title: ['Your Mac.', 'Right there on your iPhone.'],
  subtitle:
    "See your Mac's screen and control it — cursor, keyboard, and all — from wherever your iPhone is. Pair once, then it's peer-to-peer.",
  primaryCta: 'Get RemoteMac',
  secondaryCta: 'See how it works',
  note: 'Source-available today. Build it yourself with Xcode — TestFlight and the App Store are next.',
} as const;

export type Feature = {
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  /** Shown instead of `image` below the `lg` breakpoint, when a shot was composed for portrait. */
  mobileImage?: string;
  alt: string;
};

export const features: Feature[] = [
  {
    eyebrow: 'Screen Mode',
    title: 'See it live, control it like you’re there.',
    body: "Your Mac's display streams to your iPhone the moment you open Screen Mode. Tap the mirrored screen to click where you touch, drag to move the cursor, pinch to zoom in on small targets, and use the on-screen joystick plus L/R buttons for precise clicks — Mouse, Scroll, and Drag modes cover the rest.",
    image: '/screenshots/main_photo_desktop.png',
    mobileImage: '/screenshots/main_photo_mobile.png',
    alt: "RemoteMac's Screen Mode mirroring a MacBook Pro's desktop onto an iPhone, with cursor control, keyboard typing, and scroll and drag gestures",
  },
  {
    eyebrow: 'Pairing',
    title: 'Pairs once, stays direct.',
    body: 'Your Mac shows a six-digit code; enter it on your iPhone to connect. From there, screen and input travel directly between the two devices.',
    image: '/screenshots/mob_connection.png',
    alt: 'RemoteMac pairing screen on iPhone: a six-digit code entered, paired successfully, with a Test Connection button',
  },
  {
    eyebrow: 'Devices',
    title: 'Every paired Mac, one list away.',
    body: 'The iPhone app keeps a simple list of your paired Macs with live online status, and a tap on “Add Mac” starts pairing a new one whenever you need to.',
    image: '/screenshots/homepage.png',
    alt: 'RemoteMac devices list on iPhone showing a paired, online MacBook Pro, and the empty state with an Add Mac button',
  },
  {
    eyebrow: 'The Mac app',
    title: 'Lives quietly in your menu bar.',
    body: 'No dock icon, no window to keep open — RemoteMac sits in the menu bar, shows connection and pairing status at a glance, and lets you open Settings, disconnect, or quit from right there.',
    image: '/screenshots/Mainmenu_mac.png',
    alt: "RemoteMac's real macOS menu bar dropdown: online, connected, paired with an iPhone",
  },
  {
    eyebrow: 'Settings',
    title: 'Everything about this Mac, in one place.',
    body: "Check your Mac's connection, see your paired iPhone's status, keep the Mac awake with the lid closed for always-on access, and confirm both permissions RemoteMac needs — all from one Settings panel.",
    image: '/screenshots/app_settings.png',
    alt: "RemoteMac's Settings panel on macOS showing This Mac, Paired iPhone, and Remote Access with Keep Mac Awake enabled",
  },
];

export const howItWorks = [
  {
    number: '01',
    title: 'Install on both',
    body: 'Build the Mac app and the iPhone app from source with Xcode, and sign in with the same account on both.',
  },
  {
    number: '02',
    title: 'Pair once',
    body: 'Your Mac shows a six-digit code. Enter it on your iPhone, then approve the request on your Mac.',
  },
  {
    number: '03',
    title: 'Control your Mac',
    body: "Open Screen Mode on your iPhone to see your Mac's screen and start controlling it immediately.",
  },
] as const;

export const architecture = {
  eyebrow: 'How it connects',
  title: 'Built around your two devices, not a server in the middle.',
  body: "RemoteMac's backend only handles three things: signing you in, keeping track of your devices, and introducing your iPhone and Mac to each other so they can connect. Once that handshake (WebRTC signaling) is done, your screen, mouse, and keyboard data travel directly between your iPhone and Mac — the backend doesn't see any of it.",
  points: [
    {
      title: 'Signing in and pairing only',
      body: 'The backend authenticates your account, keeps your device list, and brokers the initial connection request. That’s the extent of what it does.',
    },
    {
      title: 'Direct after that',
      body: 'Once your devices are connected, screen frames, keystrokes, and mouse input flow peer-to-peer over WebRTC — routed through a relay only when a direct path isn’t available.',
    },
    {
      title: 'You approve every pairing',
      body: 'A pairing code only connects a device once your Mac explicitly approves it — nothing pairs automatically.',
    },
  ],
} as const;

export const upcoming = {
  eyebrow: 'Coming soon',
  title: 'Upcoming premium features.',
  body: 'Planned, not built yet. Have an idea or want to help build one? Contributions are welcome on GitHub.',
  items: [
    { title: 'Remote terminal', body: 'A real shell on your Mac, right on your iPhone.' },
    { title: 'Clipboard sync', body: 'Copy on one device, paste on the other.' },
    { title: 'Voice input', body: 'Dictate text to your Mac with iOS speech recognition.' },
    { title: 'Connection diagnostics', body: 'Live latency and stream stats for every session.' },
  ],
} as const;

export const finalCta = {
  title: ['Your Mac.', 'Your iPhone.', 'One remote.'],
  primaryCta: 'Get RemoteMac',
  note: 'Free and source-available. Build it yourself today.',
} as const;

export const footer = {
  tagline: 'Control your Mac from your iPhone.',
  productLinks: [
    { label: 'Features', href: '#features' },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Architecture', href: '#privacy' },
  ],
  resourceLinks: [
    { label: 'Get RemoteMac', href: 'repo' },
    { label: 'Getting started guide', href: 'getting-started' },
    { label: 'Source on GitHub', href: 'repo' },
  ],
  legalLinks: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
  ],
} as const;
