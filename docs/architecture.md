# Architecture

## Overview

```text
                           +----------------------+
                           |       Render         |
                           |----------------------|
                           | Fastify backend       |
                           | WebSocket signaling   |
                           | Auth / Pairing        |
                           +----------+-----------+
                                      |
                              SDP / ICE only
                                      |
                         +------------+------------+
                         |                         |
                         v                         v
                 +---------------+         +---------------+
                 |    iPhone     |         |      Mac      |
                 | React Native  |         | Swift/SwiftUI |
                 | Native WebRTC |         | Native WebRTC |
                 +-------+-------+         +-------+-------+
                         |                         |
                         |         WebRTC          |
                         +<----------------------->+
                                                    |
                                                    +---------------------+
                                                    |                     |
                                                    v                     v
                                          ScreenCaptureKit             CGEvent
                                                    |                     |
                                                 Screen             Mouse/Keyboard
```

## Component responsibilities

### Backend (`services/backend`)

- Authenticates users (Argon2id password hashing + JWT access/refresh tokens).
- Owns the device registry and pairing authorization state.
- Brokers WebRTC signaling (SDP offer/answer, ICE candidates) over an authenticated WebSocket.
- Tracks device presence and session lifecycle metadata.
- Never relays screen or input data once a WebRTC connection is established.

### Mac host (`apps/mac/RemoteMac`)

- Menu-bar SwiftUI app; no persistent full window required after setup.
- Owns ScreenCaptureKit capture and `CGEvent` input injection — the actual execution environment.
- Holds device identity and auth tokens in the macOS Keychain.
- Approves or rejects incoming pairing requests locally; the backend cannot force a pairing through.

### iPhone app (`apps/ios`)

- React Native (bare, not Expo Go — native WebRTC and Speech Recognition modules are required).
- Renders the remote screen/touchpad view.
- Holds refresh tokens and pairing secrets in the iOS Keychain.

### Shared packages (`packages/`)

- `protocol`: the WebSocket/data-channel message schemas and runtime validation (zod). Both the backend and, once wired up, the iOS app depend on this so client and server can never silently drift.
- `types`: domain types mirroring the Postgres schema (`User`, `Device`, `DevicePair`, `Session`).
- `config`: shared `tsconfig` base.

## Data flow boundary

The backend is a signaling and authorization plane only. Once ICE negotiation succeeds and the WebRTC data channels/video track are up, all screen, mouse, and keyboard data flows directly between the iPhone and the Mac (peer-to-peer, or relayed through TURN when direct connectivity fails) — it never touches Render.

## Why this boundary matters

The security design goal is that the backend never receive screen frames or input events after a WebRTC connection is established, and that no history of keystrokes is persisted. Keeping the backend a thin signaling plane is what makes that guarantee possible.

## Planned (not implemented yet)

These are upcoming premium features. They'd follow the same boundary — peer-to-peer only, never through the backend:

- **Remote terminal**: a PTY (`forkpty`) shell on the Mac, rendered on the iPhone with a VT/ANSI parser.
- **Clipboard sync** between iPhone and Mac.
- **Voice input** via iOS Speech Recognition.
- **Connection diagnostics** (latency and stream stats).
