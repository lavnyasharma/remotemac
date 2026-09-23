# RemoteMac

A private, personal remote-control bridge between an iPhone and a Mac: live remote screen viewing plus mouse and keyboard control, connected peer-to-peer over WebRTC. The cloud only handles auth, device registry, pairing, and signaling — it never sees screen frames or input events after a session connects.

Open source for personal use — build straight from source; no packaged distribution (App Store/TestFlight) yet. Free to use and modify for yourself, but you may not sell it, sell a modified/extended version of it, or offer it as a paid service — see [License](#license). Premium features are planned for a future release.

## Repository layout

```text
apps/ios/            React Native iPhone app
apps/mac/RemoteMac/   Swift/SwiftUI macOS menu-bar host app
services/backend/     Node.js/Fastify signaling + auth backend
packages/protocol/    Shared WebSocket message schemas (zod)
packages/types/       Shared domain types
packages/config/      Shared TypeScript config
infra/                Coturn, Docker, and deployment infra
docs/                 Architecture, protocol, and security documentation
```

## Status

The backend is deployed and live (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)). The Mac and
iPhone apps aren't on the App Store / TestFlight yet — that's planned in the next few months.
Until then, install them yourself by building from source with Xcode — see
[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for the step-by-step guide.

**Phase 3 — iPhone skeleton.** Backend (Phase 1) and the macOS menu-bar app (Phase 2) are complete: auth, device registration, pairing, and authenticated WebSocket signaling, all tested against a real Postgres database and a real build of the Mac app. The iPhone app (Phase 3, bare React Native — not Expo Go) now implements sign-in/registration, this device's own registration, the account's device list, and the pairing UI (enter code → live approve/reject over WebSocket → paired), talking to the same backend. Peer-to-peer WebRTC screen streaming and mouse/keyboard control (right-click, joystick, Mouse/Scroll/Drag modes) are now working on top of that.

## Known issues

The shared backend runs on **free servers**, so the connection isn't always reliable yet:

- **Slow first connect:** the free server sleeps when idle and takes about 30–60s to wake up.
- **Some networks can't connect:** there's no TURN relay server yet, so connections can fail on
  strict networks (some mobile carriers, office or hotel Wi-Fi).

**Want it rock solid? Host your own.** [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) walks you
through running the backend, database, HTTPS, and a TURN relay on your own Google Cloud VM (or
any VPS) with one `docker compose up`.

## Support the project

Getting RemoteMac on the App Store and TestFlight needs an Apple Developer membership
($99/year). If you'd like to see that happen, you can
[☕ buy me a coffee on GitHub Sponsors](https://github.com/sponsors/lavnyasharma).

## Upcoming premium features

Planned in the protocol/architecture but **not implemented yet**:

- **Remote terminal** — a real PTY-backed shell on your Mac, rendered on the iPhone
- **Clipboard sync** — copy on one device, paste on the other
- **Voice input** — dictate text to your Mac via iOS Speech Recognition
- **Connection diagnostics** — live latency and stream stats

Ideas and contributions are welcome — open an issue or a PR.

## Development

Requires Node.js 20+ and a local PostgreSQL server.

```bash
npm install
npm run build
```

### Backend local dev

Using a local Postgres (e.g. `brew install postgresql@16` on macOS):

```bash
createdb remotemac_dev
cp services/backend/.env.example services/backend/.env   # edit DATABASE_URL/JWT_SECRET
cd services/backend && npm run migrate:up
npm run dev --workspace=@remote-mac/backend
```

Or with Docker instead of a local Postgres install:

```bash
docker compose -f infra/docker/docker-compose.dev.yml up -d
```

The backend listens on `http://localhost:3000` by default (`GET /health`).

### Running tests

Backend tests run against a real Postgres database (no DB mocking) — see [docs/security.md](docs/security.md) for why. Create a dedicated test database once:

```bash
createdb remotemac_test
TEST_DATABASE_URL=postgres://localhost/remotemac_test npm run migrate:up --workspace=@remote-mac/backend
```

Then, from the repo root:

```bash
npm run build
npm test
```

`TEST_DATABASE_URL` defaults to `postgres://localhost/remotemac_test` if unset.

### macOS app

Requires Xcode and [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`). The `.xcodeproj` is generated, not committed — `apps/mac/RemoteMac/project.yml` is the source of truth for targets/settings.

```bash
brew install xcodegen   # once
cd apps/mac/RemoteMac
xcodegen generate
open RemoteMac.xcodeproj
```

Or build from the command line:

```bash
cd apps/mac/RemoteMac
xcodegen generate
xcodebuild -project RemoteMac.xcodeproj -scheme RemoteMac -configuration Debug -destination 'platform=macOS' build
```

By default the app talks to `http://localhost:3000` / `ws://localhost:3000/ws` in Debug builds (start the backend first — see above). Override with the `REMOTEMAC_API_BASE_URL` / `REMOTEMAC_WS_BASE_URL` environment variables (set as scheme environment variables in Xcode, or exported before `xcodebuild`) to point at a different backend.

### iOS app

Requires Xcode, [CocoaPods](https://cocoapods.org) (`gem`/`bundle install` — a `Gemfile` is checked in), and the iOS Simulator. This is a bare React Native app, not Expo Go — native modules (Keychain and WebRTC now; Speech Recognition later) require it.

```bash
cd apps/ios
npm install
bundle install
cd ios && bundle exec pod install && cd ..
```

Then, with the backend running (see above) and a simulator booted:

```bash
npx react-native start          # Metro bundler, keep running
npx react-native run-ios --simulator="iPhone 16"   # in another terminal
```

The app talks to `http://localhost:3000` / `ws://localhost:3000/ws` in Debug builds automatically (the simulator shares the host's network stack) — a physical device needs the Mac's LAN IP instead, since `localhost` there means the phone itself (see `src/config/backendEnvironment.ts`).

## Documentation

- [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) — run your own backend + TURN relay on a Google Cloud VM or any VPS
- [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) — how to install and use the apps today, before the App Store release
- [docs/architecture.md](docs/architecture.md) — system architecture and component responsibilities
- [docs/protocol.md](docs/protocol.md) — WebSocket/WebRTC message protocol
- [docs/security.md](docs/security.md) — auth, pairing, and transport security decisions

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to use, modify, and share for personal/noncommercial purposes. Commercial use, including selling this software, selling an extended or modified version of it, or offering it as a paid/hosted service, is not permitted. Paid premium features may be introduced by the project owner in the future.
