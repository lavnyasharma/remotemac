import Foundation

/// Swift mirror of the message subset in `packages/protocol/src/messages.ts` that the
/// Mac host actually sends or receives. This is hand-maintained rather than generated —
/// keep it in sync with the TypeScript source of truth when either side changes.
enum ProtocolMessage {
    case deviceStatus(DeviceStatusPayload)
    case pairIncoming(PairIncomingPayload)
    case pairComplete(PairCompletePayload)
    case sessionPong(SessionPongPayload)
    case sessionStart(SessionStartPayload)
    case sessionEnd(SessionEndPayload)
    case webrtcOffer(WebrtcSdpPayload)
    case webrtcAnswer(WebrtcSdpPayload)
    case webrtcIce(WebrtcIcePayload)
    case error(ErrorPayload)
    case unknown(type: String)
}

struct DeviceStatusPayload: Decodable {
    let deviceId: String
    let online: Bool
    let lastSeenAt: String?
}

struct PairIncomingPayload: Decodable {
    let devicePairId: String
    let remoteDeviceId: String
    let remoteDeviceName: String
}

struct PairCompletePayload: Decodable {
    let devicePairId: String
}

struct SessionPongPayload: Decodable {
    let sentAt: Double
}

/// `session.start` is both sent (without `sessionId` — the server assigns one) and
/// received (as the server's ack, and as the notice relayed to the partner device),
/// so it's `Codable` rather than split into separate in/out payload types.
struct SessionStartPayload: Codable {
    let devicePairId: String
    let sessionId: String?
}

struct SessionEndPayload: Codable {
    let sessionId: String
    let reason: String?
}

/// Shared shape for `webrtc.offer` and `webrtc.answer` — both carry just a sessionId and SDP.
struct WebrtcSdpPayload: Codable {
    let sessionId: String
    let sdp: String
}

struct WebrtcIcePayload: Codable {
    let sessionId: String
    let candidate: String
    let sdpMid: String?
    let sdpMLineIndex: Int?
}

struct ErrorPayload: Decodable {
    let message: String
    let inReplyTo: String?
}

struct PairApprovePayload: Encodable {
    let pairingRequestId: String
}

struct PairRejectPayload: Encodable {
    let pairingRequestId: String
    let reason: String?
}

struct SessionPingPayload: Codable {
    let sentAt: Double
}

enum ProtocolDecodeError: Error {
    case invalidEnvelope
}

/// Wire envelope shape: `{ protocolVersion, type, requestId?, payload }`.
private struct EnvelopeTypeProbe: Decodable {
    let type: String
}

private struct Envelope<Payload: Decodable>: Decodable {
    let protocolVersion: Int
    let type: String
    let requestId: String?
    let payload: Payload
}

private struct OutgoingEnvelope<Payload: Encodable>: Encodable {
    let protocolVersion = 1
    let type: String
    let payload: Payload
}

extension ProtocolMessage {
    static func decode(from data: Data) throws -> ProtocolMessage {
        let decoder = JSONDecoder()
        let probe: EnvelopeTypeProbe
        do {
            probe = try decoder.decode(EnvelopeTypeProbe.self, from: data)
        } catch {
            throw ProtocolDecodeError.invalidEnvelope
        }

        switch probe.type {
        case "device.status":
            return .deviceStatus(try decoder.decode(Envelope<DeviceStatusPayload>.self, from: data).payload)
        case "pair.incoming":
            return .pairIncoming(try decoder.decode(Envelope<PairIncomingPayload>.self, from: data).payload)
        case "pair.complete":
            return .pairComplete(try decoder.decode(Envelope<PairCompletePayload>.self, from: data).payload)
        case "session.pong":
            return .sessionPong(try decoder.decode(Envelope<SessionPongPayload>.self, from: data).payload)
        case "session.start":
            return .sessionStart(try decoder.decode(Envelope<SessionStartPayload>.self, from: data).payload)
        case "session.end":
            return .sessionEnd(try decoder.decode(Envelope<SessionEndPayload>.self, from: data).payload)
        case "webrtc.offer":
            return .webrtcOffer(try decoder.decode(Envelope<WebrtcSdpPayload>.self, from: data).payload)
        case "webrtc.answer":
            return .webrtcAnswer(try decoder.decode(Envelope<WebrtcSdpPayload>.self, from: data).payload)
        case "webrtc.ice":
            return .webrtcIce(try decoder.decode(Envelope<WebrtcIcePayload>.self, from: data).payload)
        case "error":
            return .error(try decoder.decode(Envelope<ErrorPayload>.self, from: data).payload)
        default:
            return .unknown(type: probe.type)
        }
    }
}

enum OutgoingProtocolMessage {
    case pairApprove(PairApprovePayload)
    case pairReject(PairRejectPayload)
    case sessionPing(SessionPingPayload)
    case sessionStart(SessionStartPayload)
    case sessionEnd(SessionEndPayload)
    case webrtcOffer(WebrtcSdpPayload)
    case webrtcAnswer(WebrtcSdpPayload)
    case webrtcIce(WebrtcIcePayload)

    func encoded() throws -> Data {
        let encoder = JSONEncoder()
        switch self {
        case .pairApprove(let payload):
            return try encoder.encode(OutgoingEnvelope(type: "pair.approve", payload: payload))
        case .pairReject(let payload):
            return try encoder.encode(OutgoingEnvelope(type: "pair.reject", payload: payload))
        case .sessionPing(let payload):
            return try encoder.encode(OutgoingEnvelope(type: "session.ping", payload: payload))
        case .sessionStart(let payload):
            return try encoder.encode(OutgoingEnvelope(type: "session.start", payload: payload))
        case .sessionEnd(let payload):
            return try encoder.encode(OutgoingEnvelope(type: "session.end", payload: payload))
        case .webrtcOffer(let payload):
            return try encoder.encode(OutgoingEnvelope(type: "webrtc.offer", payload: payload))
        case .webrtcAnswer(let payload):
            return try encoder.encode(OutgoingEnvelope(type: "webrtc.answer", payload: payload))
        case .webrtcIce(let payload):
            return try encoder.encode(OutgoingEnvelope(type: "webrtc.ice", payload: payload))
        }
    }
}
