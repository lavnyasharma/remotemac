# Protocol

Defined in [`packages/protocol`](../packages/protocol) as the source of truth; this document describes the shape and intent.

## Envelope

Every message is a JSON object:

```json
{
  "protocolVersion": 1,
  "type": "keyboard.text",
  "requestId": "optional-id",
  "payload": {}
}
```

`protocolVersion` must match `PROTOCOL_VERSION` exactly, or the message is rejected. `requestId` is optional and lets a sender correlate a response to a request; it is not required for fire-and-forget messages (e.g. `mouse.move`).

All inbound messages are parsed with `parseMessage()`, which validates both the message `type` and its `payload` shape against a zod schema before any handler sees it. There is no code path that forwards or acts on an unvalidated message.

## Connecting to `/ws`

`GET wss://.../ws?deviceId=<uuid>` with `Authorization: Bearer <access token>`. Both are checked as Fastify `preHandler`s — before the HTTP upgrade completes — so an invalid token (401) or a `deviceId` that doesn't belong to the authenticated user (403) never reaches an open socket. See [`docs/security.md`](security.md) for the full authorization boundary.

## Transport split

Two different transports carry protocol messages, and a message type belongs to exactly one:

- **WebSocket (`wss://.../ws`), backend-mediated**: device presence, pairing, WebRTC signaling (SDP/ICE), and session lifecycle. The backend needs to observe and authorize these.
- **WebRTC data channel, peer-to-peer**: mouse and keyboard messages (plus planned terminal, clipboard, and diagnostics messages). The backend never sees these once the data channel is open.

The WebRTC video track (`screen`) carries the remote desktop feed and is not a JSON message at all.

## Message types

### Device presence (WebSocket)

`device.online`, `device.offline`, `device.status`

### Pairing (WebSocket)

`pair.request` (client → server: redeem a pairing code), `pair.incoming` (server → Mac: a device redeemed your code, approve/reject it), `pair.approve`, `pair.reject`, `pair.complete`

### WebRTC signaling (WebSocket)

`webrtc.offer`, `webrtc.answer`, `webrtc.ice`

### Session (WebSocket)

`session.start`, `session.end`, `session.ping`, `session.pong`

### Mouse (data channel: `control`)

`mouse.move`, `mouse.down`, `mouse.up`, `mouse.click`, `mouse.doubleClick`, `mouse.scroll`

Mouse coordinates are normalized to `[0, 1]` on both axes; the Mac converts them to display pixels.

### Keyboard (data channel: `keyboard`)

`keyboard.key`, `keyboard.text`, `keyboard.modifier`

### Planned — upcoming premium features (schemas defined, not implemented)

- Terminal (data channel: `terminal`): `terminal.start`, `terminal.input`, `terminal.output`, `terminal.resize`, `terminal.interrupt`, `terminal.exit`
- Clipboard (data channel: `clipboard`): `clipboard.get`, `clipboard.set`
- Diagnostics (data channel: `diagnostics`): `diagnostics.ping`, `diagnostics.stats`

### Error (WebSocket, server → client)

`error` — sent when a received message fails validation, or names a type the connection doesn't support (e.g. a data-channel-only message type arriving on the WebSocket). Payload: `{ message, inReplyTo? }`.

## Authentication is not a message type

`auth.login` / `auth.refresh` / `auth.logout` are REST endpoints (`services/backend/src/routes/auth.ts`, added in Phase 1), not WebSocket messages. The WebSocket connection is authenticated using the REST-issued access token during the connection handshake (e.g. a bearer token or signed query parameter), not via an in-band message — this keeps "is this socket authenticated" a yes/no answered once at connect time, rather than a piece of mutable per-message state.

## Versioning

`PROTOCOL_VERSION` is bumped for any breaking change to envelope or payload shapes. A version mismatch is a hard rejection, not a best-effort upgrade — the client and server are expected to be deployed close together for a personal-use project of this size.
