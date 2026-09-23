import Foundation
import CoreMedia
@preconcurrency import WebRTC

/// Coarse connection state surfaced to `AppState`/UI. Distinct from `RTCPeerConnectionState`
/// (and `RTCIceConnectionState`) — this collapses both into what a status indicator needs.
enum WebRTCConnectionState: Equatable {
    case idle
    case negotiating
    case connected
    case disconnected
    case failed
}

enum WebRTCClientError: Error, LocalizedError {
    case missingLocalDescription

    var errorDescription: String? {
        switch self {
        case .missingLocalDescription: return "WebRTC did not produce an SDP answer."
        }
    }
}

/// Wraps a single `RTCPeerConnection` for this app's role as the WebRTC **answerer** (build
/// plan Phase 4 — the iPhone always offers). Exposes state via closures rather than coupling
/// directly to `AppState`, mirroring `SignalingClient`. Only proves the data channel works
/// (ping/pong); no media tracks are touched here — that's Phase 7.
///
/// Not `@MainActor`: `RTCPeerConnectionDelegate`/`RTCDataChannelDelegate` callbacks arrive on
/// WebRTC's internal signaling thread, not the main thread. Every callback below hops to the
/// main queue before touching `dataChannel` or invoking a closure, so callers (`AppState`,
/// `@MainActor`) can update `@Published` state directly from those closures. `@unchecked
/// Sendable` reflects that externally-enforced discipline, same rationale as `SignalingClient`.
final class WebRTCClient: NSObject, @unchecked Sendable {
    var onLocalIceCandidate: ((RTCIceCandidate) -> Void)?
    var onConnectionStateChange: ((WebRTCConnectionState) -> Void)?
    var onDataChannelOpen: (() -> Void)?
    var onDataChannelClosed: (() -> Void)?
    var onPong: ((Double) -> Void)?
    /// Fired when adding the video track (see `addVideoTrack`) requires renegotiation.
    /// `AppState` responds by creating a fresh offer — see build plan §18.
    var onRenegotiationNeeded: (() -> Void)?

    /// One factory for the process's lifetime — creating it per-connection is wasteful and
    /// `RTCInitializeSSL` only needs calling once. `RTCPeerConnectionFactory` isn't `Sendable`
    /// (it's an ObjC type WebRTC itself guarantees is thread-safe to use), so this is marked
    /// `nonisolated(unsafe)` rather than actor-isolated.
    private nonisolated(unsafe) static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        return RTCPeerConnectionFactory()
    }()

    private let peerConnection: RTCPeerConnection
    private var dataChannel: RTCDataChannel?
    private let inputInjector = InputInjector()

    // Video (build plan §18): only populated once `addVideoTrack` is called — this class
    // proves the data channel first (Phase 4) and only adds video once permissions/session
    // state say it's time (decided by `AppState`, not here).
    private var videoSource: RTCVideoSource?
    private var videoCapturer: RTCVideoCapturer?
    private var videoTrack: RTCVideoTrack?

    init?(iceServers: [IceServerConfig]) {
        let config = RTCConfiguration()
        config.iceServers = iceServers.map { server in
            RTCIceServer(urlStrings: server.urls.values, username: server.username, credential: server.credential)
        }
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually

        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        guard let connection = WebRTCClient.factory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: nil
        ) else {
            return nil
        }
        peerConnection = connection
        super.init()
        peerConnection.delegate = self
    }

    // MARK: - Answerer flow

    /// Sets the iPhone's offer as the remote description, creates and sets an answer, and
    /// returns the answer's SDP to send back over signaling. The data channel itself arrives
    /// separately via `didOpen dataChannel:` — the iPhone created it, not us.
    func acceptOffer(sdp: String) async throws -> String {
        let offer = RTCSessionDescription(type: .offer, sdp: sdp)
        try await setRemoteDescription(offer)
        let answer = try await createAnswer()
        try await setLocalDescription(answer)
        return answer.sdp
    }

    func addRemoteIceCandidate(candidate: String, sdpMid: String?, sdpMLineIndex: Int?) {
        let ice = RTCIceCandidate(sdp: candidate, sdpMLineIndex: Int32(sdpMLineIndex ?? 0), sdpMid: sdpMid)
        peerConnection.add(ice) { _ in }
    }

    func close() {
        dataChannel = nil
        videoTrack = nil
        videoCapturer = nil
        videoSource = nil
        peerConnection.close()
    }

    // MARK: - Video (build plan §18 — screen capture -> WebRTC video track)

    /// Adds a video track sourced from screen capture to the peer connection. The iPhone's
    /// initial offer never mentioned video — it doesn't know the Mac will start sending until
    /// permissions are confirmed — so adding a track here fires `peerConnectionShouldNegotiate`
    /// below, which `AppState` uses to renegotiate with the Mac as the offerer this one time.
    /// `relayWebrtcMessage` on the backend routes a `webrtc.offer`/`webrtc.answer` by session,
    /// not by role, so that's a legitimate use of the same signaling messages.
    @discardableResult
    func addVideoTrack() -> Bool {
        guard videoTrack == nil else { return true } // already added, e.g. a second call after a race
        let source = WebRTCClient.factory.videoSource(forScreenCast: true)
        let capturer = RTCVideoCapturer(delegate: source)
        let track = WebRTCClient.factory.videoTrack(with: source, trackId: "screen0")
        guard let sender = peerConnection.add(track, streamIds: ["remotemac"]) else { return false }
        videoSource = source
        videoCapturer = capturer
        videoTrack = track

        // `videoSource(forScreenCast: true)` disables WebRTC's own resolution/framerate
        // adaptation, so without explicit preferences here the encoder has no configured way
        // to gracefully trade quality for latency under CPU/bandwidth pressure. Screen content
        // is mostly static with bursts of change (typing, scrolling) — a steady framerate reads
        // as "smooth" far more than sharpness does, so resolution should give way before frames
        // do, and a bitrate ceiling keeps congestion control targeting a sane operating point.
        if let transceiver = peerConnection.transceivers.first(where: { $0.sender.senderId == sender.senderId }) {
            let capabilities = WebRTCClient.factory.rtpSenderCapabilities(forKind: kRTCMediaStreamTrackKindVideo)
            let h264Codecs = capabilities.codecs.filter { $0.name == kRTCVideoCodecH264Name }
            let otherCodecs = capabilities.codecs.filter { $0.name != kRTCVideoCodecH264Name }
            try? transceiver.setCodecPreferences(h264Codecs + otherCodecs)
        }

        let params = sender.parameters
        if let encoding = params.encodings.first {
            encoding.maxBitrateBps = NSNumber(value: 6_000_000)
        }
        params.degradationPreference = NSNumber(value: RTCDegradationPreference.maintainFramerate.rawValue)
        sender.parameters = params

        return true
    }

    /// Feeds one captured frame into the video source. Safe to call from any thread (e.g.
    /// ScreenCaptureKit's own sample-handler queue) — `RTCVideoSource` synchronizes internally.
    func pushVideoSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        guard
            let videoSource, let videoCapturer,
            let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
        else { return }
        let timeStampNs = Int64(CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds * 1_000_000_000)
        let rtcBuffer = RTCCVPixelBuffer(pixelBuffer: pixelBuffer)
        let frame = RTCVideoFrame(buffer: rtcBuffer, rotation: ._0, timeStampNs: timeStampNs)
        videoSource.capturer(videoCapturer, didCapture: frame)
    }

    // MARK: - Renegotiation (Mac-initiated, for the video track above)

    /// Creates and sets a fresh offer for `AppState` to send as `webrtc.offer`. Only ever
    /// called after the initial answerer handshake already completed — this is the one place
    /// the Mac acts as an offerer.
    func createRenegotiationOffer() async throws -> String {
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let offer = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<RTCSessionDescription, Error>) in
            peerConnection.offer(for: constraints) { sdp, error in
                if let sdp {
                    continuation.resume(returning: sdp)
                } else {
                    continuation.resume(throwing: error ?? WebRTCClientError.missingLocalDescription)
                }
            }
        }
        try await setLocalDescription(offer)
        return offer.sdp
    }

    func acceptRenegotiationAnswer(sdp: String) async throws {
        try await setRemoteDescription(RTCSessionDescription(type: .answer, sdp: sdp))
    }

    // MARK: - Ping/pong (data-channel proof; see build plan Phase 4)

    /// Sends a ping and expects the peer to echo a pong carrying the same `sentAt` — the
    /// round-trip latency isn't consumed here, just the fact that a reply arrives at all
    /// (via `onPong`). Payload is a bare JSON object, not a `ProtocolMessage` — it never
    /// touches the backend, so it doesn't need the shared wire schema.
    func sendPing() {
        send(["type": "ping", "sentAt": Date().timeIntervalSince1970 * 1000])
    }

    /// Tells the iPhone the captured frame's actual pixel dimensions, so it can compute the
    /// exact letterboxed rect `RTCView`'s `objectFit="contain"` renders into and map a tap
    /// through it correctly — without this the iPhone can only assume the video fills its
    /// whole display box, which is wrong whenever the Mac's display aspect ratio doesn't
    /// match the phone's video area (the common case).
    func sendVideoInfo(width: Int, height: Int) {
        send(["type": "video.info", "width": width, "height": height])
    }

    private func sendPong(sentAt: Double) {
        send(["type": "pong", "sentAt": sentAt])
    }

    private func send(_ payload: [String: Any]) {
        guard let dataChannel, dataChannel.readyState == .open else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        dataChannel.sendData(RTCDataBuffer(data: data, isBinary: false))
    }

    // MARK: - SDP helpers

    private func setRemoteDescription(_ sdp: RTCSessionDescription) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            peerConnection.setRemoteDescription(sdp) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    private func setLocalDescription(_ sdp: RTCSessionDescription) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            peerConnection.setLocalDescription(sdp) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    private func createAnswer() async throws -> RTCSessionDescription {
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<RTCSessionDescription, Error>) in
            peerConnection.answer(for: constraints) { sdp, error in
                if let sdp {
                    continuation.resume(returning: sdp)
                } else {
                    continuation.resume(throwing: error ?? WebRTCClientError.missingLocalDescription)
                }
            }
        }
    }
}

extension WebRTCClient: RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        DispatchQueue.main.async { [weak self] in
            self?.onRenegotiationNeeded?()
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        DispatchQueue.main.async { [weak self] in
            self?.onLocalIceCandidate?(candidate)
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    /// The iPhone (offerer) created the "control" data channel; this is how we receive it —
    /// the Mac never calls `dataChannelForLabel:configuration:` itself.
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.dataChannel = dataChannel
            dataChannel.delegate = self
            if dataChannel.readyState == .open {
                self.onDataChannelOpen?()
            }
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        DispatchQueue.main.async { [weak self] in
            self?.onConnectionStateChange?(WebRTCConnectionState(newState))
        }
    }
}

extension WebRTCClient: RTCDataChannelDelegate {
    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        DispatchQueue.main.async { [weak self] in
            switch dataChannel.readyState {
            case .open:
                self?.onDataChannelOpen?()
            case .closed:
                self?.onDataChannelClosed?()
            case .connecting, .closing:
                break
            @unknown default:
                break
            }
        }
    }

    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        guard
            let object = try? JSONSerialization.jsonObject(with: buffer.data) as? [String: Any],
            let type = object["type"] as? String
        else { return }

        // Mouse/keyboard input (build plan §19-20) — envelope is {type, payload}, distinct
        // from the ping/pong envelope below. Injected directly on this callback thread
        // (fire-and-forget, no reply expected) rather than hopping to main first.
        if type.hasPrefix("mouse.") || type.hasPrefix("keyboard.") {
            guard let payload = object["payload"] as? [String: Any] else { return }
            inputInjector.handle(type: type, payload: payload)
            return
        }

        guard let sentAt = object["sentAt"] as? Double else { return }
        switch type {
        case "ping":
            DispatchQueue.main.async { [weak self] in self?.sendPong(sentAt: sentAt) }
        case "pong":
            DispatchQueue.main.async { [weak self] in self?.onPong?(sentAt) }
        default:
            break
        }
    }
}

private extension WebRTCConnectionState {
    init(_ state: RTCPeerConnectionState) {
        switch state {
        case .new, .connecting: self = .negotiating
        case .connected: self = .connected
        case .disconnected, .closed: self = .disconnected
        case .failed: self = .failed
        @unknown default: self = .disconnected
        }
    }
}
