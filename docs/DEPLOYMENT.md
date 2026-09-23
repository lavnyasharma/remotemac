# Deployment

How to take the backend from `localhost` to a real, publicly reachable server, so the Mac and
iPhone apps work from anywhere on the internet, not just the same LAN.

This covers the backend only (Render). iOS/Mac distribution (TestFlight, notarized `.dmg`) and
a TURN server are separate, later steps — see the bottom of this doc.

## 1. One-time Render setup

1. Create a free account at [render.com](https://render.com) if you don't have one.
2. From the Render dashboard: **New → Blueprint**.
3. Connect this repo (Render will ask for GitHub access to it).
4. Render reads [`render.yaml`](../render.yaml) at the repo root and shows you a preview: one
   **Postgres database** (`remotemac-db`) and one **web service** (`remotemac-backend`), both on
   the free plan. Confirm and deploy.
5. First deploy will: build the Docker image from
   [`services/backend/Dockerfile`](../services/backend/Dockerfile), provision the database, run
   migrations automatically (the blueprint's `preDeployCommand`), then start the server.
6. Once it's live, open the service page and copy its URL — it should be
   `https://remotemac-backend.onrender.com`, but Render appends a suffix if that name was
   already taken by someone else. **If it differs from that, update the URL** — it's
   currently hard-coded as a prediction in:
   - [`apps/mac/RemoteMac/Config/BackendEnvironment.swift`](../apps/mac/RemoteMac/Config/BackendEnvironment.swift) (`.production` case)
   - [`apps/ios/src/config/backendEnvironment.ts`](../apps/ios/src/config/backendEnvironment.ts) (`PRODUCTION_API_BASE_URL`/`PRODUCTION_WS_BASE_URL`)
7. Confirm it's actually up: `curl https://<your-service>.onrender.com/health` should return
   `{"status":"ok",...}`.

## 2. Free-tier tradeoffs (read before relying on this)

- **Cold starts**: a free web service spins down after ~15 minutes idle and takes ~30-60s to
  wake on the next request. First reconnect after a while away from home will be slow, not
  broken.
- **Free Postgres expires**: Render's free database is deleted after a fixed number of days
  (currently 30) unless upgraded. You'll need to recreate it (and re-pair your devices) or
  upgrade before then.
- **Fix for both**: in `render.yaml`, change `plan: free` to `plan: starter` on both the
  `databases` and `services` entries (~$7/mo each, ~$14/mo total) and redeploy. Nothing else
  changes.

## 3. Rebuild and reinstall the apps

The apps only use this production URL in **release** builds (`__DEV__`/`DEBUG` false) — debug
builds (what `react-native run-ios` and Xcode's Run button produce) still default to your local
dev backend. To actually test against the deployed backend from your phone:

- **iOS**: build a Release configuration (Xcode: Product → Scheme → Edit Scheme → Run → Build
  Configuration → Release, or `react-native run-ios --mode Release`), or temporarily point a
  debug build at it by setting `DEV_TARGET` logic aside and hard-coding the URL — easiest for a
  one-off test is a Release build.
- **Mac**: build a Release configuration
  (`xcodebuild ... -configuration Release`) — Debug builds always use `localhost`.

## 4. Security note

This backend was previously only reachable from `localhost` during development. Now that it's
public, two things that were low-priority became load-bearing and were addressed as part of this
deployment:

- Rate limiting on `/auth/login`, `/auth/register`, and `/pairing/request` (see
  [`docs/security.md`](security.md) — this closes a previously-documented gap).
- TLS: Render terminates HTTPS/WSS for you automatically on the `*.onrender.com` URL; no
  certificate setup needed.

Still open (unchanged from `docs/security.md`): no brute-force lockout on pairing-code guessing
over the WebSocket (mitigated today only by 6-digit codes, 5-minute expiry, and single-use
consumption).

## 5. Not done yet (optional, later)

- **TURN server**: WebRTC currently falls back to a public STUN server only. This works on most
  networks but can fail on restrictive ones (notably some cellular carriers). Adding a coturn
  VPS (or a hosted TURN provider — Render itself can't host TURN, since it doesn't expose UDP or
  arbitrary ports) and filling in `TURN_URL` (comma-separated for multiple URLs)/`TURN_USERNAME`/
  `TURN_PASSWORD` in the Render service's env vars needs no app code changes — the client already reads ICE servers from the backend
  (`GET /webrtc/ice-servers`, wired into both apps).
- **Custom domain**: currently using Render's free `*.onrender.com` subdomain. A real domain
  (e.g. `api.remotemac.app`) is a Render dashboard + DNS change, not a code change — update the
  same two `PRODUCTION_*` URLs listed in step 1 afterward.
- **TestFlight / notarized `.dmg`**: needs an Apple Developer Program membership ($99/yr). Until
  then, both apps install by building straight from Xcode onto your own devices (free, but
  re-signs every ~7 days on a free Apple ID).
