# Security

This documents the security-relevant decisions actually implemented so far (backend Phase 1: auth, device registry, pairing, WebSocket signaling; Mac and iPhone clients from Phases 2–3). It will grow as later phases add WebRTC, Accessibility-based input control, and packaging/signing.

## Passwords

- Hashed with **Argon2id** (`argon2` package, `hashPassword`/`verifyPassword` in [`src/services/passwordHash.ts`](../services/backend/src/services/passwordHash.ts)). Plaintext passwords are never stored or logged.
- Login timing does not reveal whether an email is registered: `verifyPasswordOrDummy` runs the same Argon2 verification cost against a precomputed dummy hash when no user is found, and the error response (`"Invalid email or password"`) is identical for both cases.

## Tokens

- **Access tokens** are short-lived (15 minutes) HS256 JWTs (`jose`), signed with `JWT_SECRET`. They carry only the user id as `sub` — no roles or device info, since authorization is re-checked per resource on every request (see below).
- **Refresh tokens** are opaque random values (32 bytes, base64url), not JWTs. Only their SHA-256 hash is stored (`refresh_tokens.token_hash`), so a database read alone can't produce a usable token. Every `/auth/refresh` call **rotates** the token: the old one is marked revoked (pointing at its replacement via `replaced_by_id`) and a new one is issued. Reusing a revoked/expired/unknown refresh token is rejected with 401.
- `/auth/logout` revokes the presented refresh token immediately.

## Pairing codes

- Generated with `crypto.randomInt` (cryptographically secure), 6 digits, 5-minute expiry, single-use.
- Only the SHA-256 hash of the code is stored. Redemption (`consumePairingCode`) is a single `UPDATE ... WHERE used_at IS NULL AND expires_at > now() RETURNING *` — this closes the check-then-use race between two concurrent redemption attempts at the database level, not in application code.
- A device pair only reaches `approved` status when the **Mac side** explicitly sends `pair.approve` over its own authenticated WebSocket connection — the iPhone that redeemed the code cannot approve its own request (`handlePairResolve` checks that the acting connection's device id matches `pair.macDeviceId`).
- Redeeming a code also checks that the requesting device belongs to the **same account** as the Mac that minted it (`handlePairRequest` compares `requestingDevice.userId` to `redeemed.userId`) — without this, any signed-in device on any account could redeem another user's pairing code and create a `device_pairs` row naming a remote device it doesn't own. Found and fixed via hands-on testing of the iOS app against the real backend; covered by a regression test in `signaling.test.ts`.

## Authorization boundaries

- Every `/devices` and `/pairing` route requires a valid access token (`app.authenticate` preHandler) and additionally checks resource ownership against `request.userId` at the query level (e.g. `DELETE /devices/:id` only deletes a row where `user_id` matches the caller; a device belonging to another user returns 404, not 403, to avoid confirming the id exists).
- The WebSocket upgrade at `/ws` is authenticated the same way as REST (`app.authenticate` runs as a `preHandler`, before the HTTP upgrade completes — see [`docs/protocol.md`](protocol.md)), plus a second check that the `deviceId` query parameter actually belongs to the authenticated user. Both checks reject with a normal HTTP status **before** the socket upgrades, so an unauthorized client never gets a WebSocket to send anything over.
- Every message received on that socket is validated twice: once structurally (`parseMessage` from `@remote-mac/protocol`, which rejects unknown types and malformed payloads) and once for authorization (e.g. `pair.approve`/`pair.reject` re-check that the connection's device id is the pair's `mac_device_id` before touching the database).

## What the backend never sees

Per the architecture boundary in [`docs/architecture.md`](architecture.md): screen frames and mouse/keyboard events are WebRTC data-channel/video-track traffic between the Mac and iPhone directly. The WebSocket signaling connection only carries pairing and SDP/ICE messages — sending a data-channel-only message type over the WebSocket is rejected with an `error` message rather than silently accepted.

## Known gaps (tracked for later phases)

- No rate limiting yet on `/auth/login`, `/auth/register`, or pairing code redemption attempts — planned for Phase 10 hardening.
- No account lockout or brute-force protection on pairing code guessing (6 digits = 1,000,000 possibilities, mitigated today only by the 5-minute expiry and single-use consumption).
- `JWT_SECRET` is a single shared HMAC secret (the simplest secure option at this scale); key rotation isn't implemented.
