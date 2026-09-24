/**
 * Site-wide constants. RemoteMac has no production marketing domain yet — this is a clear,
 * overridable placeholder (set NEXT_PUBLIC_SITE_URL when one exists) rather than a guess.
 */
// `||` (not `??`): an empty string from an env var left set-but-blank must fall back too,
// not just an unset one, or downstream `new URL(SITE_URL)` calls crash the build.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://remotemac.app';

export const SITE_NAME = 'RemoteMac';

/** The actual, current distribution channel — source only, no App Store/TestFlight yet. */
export const REPO_URL = 'https://github.com/lavnyasharma/remotemac';
export const GETTING_STARTED_URL = `${REPO_URL}/blob/main/docs/GETTING_STARTED.md`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

/**
 * GA4 measurement ID (e.g. "G-XXXXXXXXXX"). Unset until a GA4 property is created — analytics
 * stays off rather than shipping a fake/placeholder ID. Set NEXT_PUBLIC_GA_MEASUREMENT_ID once
 * one exists (see apps/web/.env.local.example).
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
