import Foundation

/// `print` is a synchronous stdout write that still runs in Release builds — fine for occasional
/// events, but this fires on every signaling message, which only makes sense as a debug aid.
@inline(__always)
private func debugLog(_ message: @autoclosure () -> String) {
    #if DEBUG
    print(message())
    #endif
}

enum ConnectionStatus: Equatable {
    case disconnected
    case connecting
    case connected
}

enum SignalingError: Error, LocalizedError {
    case timeout
    case notConnected

    var errorDescription: String? {
        switch self {
        case .timeout: return "The connection did not respond in time."
        case .notConnected: return "Not connected to the backend."
        }
    }
}

/// Authenticated WebSocket connection to the backend's `/ws` signaling
/// endpoint (see docs/protocol.md). Carries pairing and presence messages
/// only — terminal/screen/input data goes over WebRTC once Phase 4 exists,
/// never through here.
///
/// Not actor-isolated: `URLSession` is configured with `delegateQueue: .main`
/// so every callback below already lands on the main thread, and this class
/// is only ever driven from `AppState` (`@MainActor`). Marked `@unchecked
/// Sendable` to reflect that externally-enforced invariant to the compiler.
final class SignalingClient: NSObject, @unchecked Sendable {
    var onMessage: ((ProtocolMessage) -> Void)?
    var onStatusChange: ((ConnectionStatus) -> Void)?

    private let deviceId: String
    private let accessToken: String
    private let baseURL: URL
    private var session: URLSession!
    private var task: URLSessionWebSocketTask?
    private var pendingPing: CheckedContinuation<Double, Error>?
    private var heartbeatTimer: Timer?
    /// Set once this connection has reported `.disconnected` — URLSession can surface the same
    /// drop through several callbacks (receive failure, didClose, didCompleteWithError), and
    /// the owner's reconnect logic should only hear about it once.
    private var closed = false
    private var awaitingPong = false

    /// How often to send a WebSocket ping while connected, and how long to wait for its pong.
    /// A dead connection (e.g. after the network changed) otherwise isn't noticed for minutes.
    private static let heartbeatInterval: TimeInterval = 20
    private static let heartbeatTimeout: UInt64 = 10_000_000_000

    init(deviceId: String, accessToken: String, baseURL: URL = BackendEnvironment.current.webSocketBaseURL) {
        self.deviceId = deviceId
        self.accessToken = accessToken
        self.baseURL = baseURL
        super.init()
        self.session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
    }

    func connect() {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { return }
        components.queryItems = [URLQueryItem(name: "deviceId", value: deviceId)]
        guard let url = components.url else { return }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        debugLog("[RM-WS] connect() url=\(url) deviceId=\(deviceId) tokenPrefix=\(accessToken.prefix(12))")
        onStatusChange?(.connecting)
        let task = session.webSocketTask(with: request)
        self.task = task
        task.resume()
        listen()
    }

    /// Intentional close: reports nothing, so the owner's reconnect logic doesn't fire.
    func disconnect() {
        closed = true
        stopHeartbeat()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        session.invalidateAndCancel()
        failPendingPing(with: SignalingError.notConnected)
    }

    /// Checks the connection is actually alive — used after the Mac wakes or the network
    /// changes, when the socket can look open while nothing gets through.
    func probe() {
        guard !closed, let task, !awaitingPong else { return }
        awaitingPong = true
        task.sendPing { [weak self] error in
            DispatchQueue.main.async {
                self?.awaitingPong = false
                if error != nil { self?.markClosed() }
            }
        }
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: Self.heartbeatTimeout)
            guard let self, self.awaitingPong else { return }
            self.markClosed()
        }
    }

    private func startHeartbeat() {
        stopHeartbeat()
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: Self.heartbeatInterval, repeats: true) { [weak self] _ in
            self?.probe()
        }
    }

    private func stopHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    /// Unintentional loss of the connection — reported exactly once as `.disconnected`.
    private func markClosed() {
        guard !closed else { return }
        closed = true
        stopHeartbeat()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        session.invalidateAndCancel()
        failPendingPing(with: SignalingError.notConnected)
        onStatusChange?(.disconnected)
    }

    func send(_ message: OutgoingProtocolMessage) {
        guard let task else { return }
        guard let data = try? message.encoded() else {
            // Encoding a fixed, well-typed payload should never fail; if it does there is
            // nothing a caller could usefully retry.
            assertionFailure("Failed to encode a well-typed outgoing signaling message")
            return
        }
        task.send(.data(data)) { _ in }
    }

    /// Sends `session.ping` and resolves once the matching `session.pong` arrives (or after a
    /// 5s timeout). Only one ping should be in flight at a time — used for the onboarding
    /// "test connection" step, which is a single user-initiated action.
    func ping(sentAt: Double) async throws -> Double {
        send(.sessionPing(SessionPingPayload(sentAt: sentAt)))
        return try await withCheckedThrowingContinuation { continuation in
            self.pendingPing = continuation
            Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                self?.failPendingPing(with: SignalingError.timeout)
            }
        }
    }

    private func failPendingPing(with error: Error) {
        pendingPing?.resume(throwing: error)
        pendingPing = nil
    }

    private func listen() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let error):
                debugLog("[RM-WS] receive failure: \(error)")
                self.markClosed()
            case .success(let message):
                switch message {
                case .data(let data):
                    self.handle(data)
                case .string(let text):
                    self.handle(Data(text.utf8))
                @unknown default:
                    break
                }
                self.listen()
            }
        }
    }

    private func handle(_ data: Data) {
        guard let message = try? ProtocolMessage.decode(from: data) else {
            debugLog("[RM-WS] recv UNDECODABLE: \(String(data: data, encoding: .utf8) ?? "<binary>")")
            return
        }
        debugLog("[RM-WS] recv \(message)")
        if case .sessionPong = message {
            pendingPing?.resume(returning: Date().timeIntervalSince1970)
            pendingPing = nil
        }
        onMessage?(message)
    }
}

extension SignalingClient: URLSessionWebSocketDelegate {
    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        debugLog("[RM-WS] didOpenWithProtocol \(`protocol` ?? "nil")")
        guard !closed else { return }
        startHeartbeat()
        onStatusChange?(.connected)
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        let reasonText = reason.flatMap { String(data: $0, encoding: .utf8) } ?? "nil"
        debugLog("[RM-WS] didCloseWith code=\(closeCode.rawValue) reason=\(reasonText)")
        markClosed()
    }
}

extension SignalingClient: URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error else { return }
        debugLog("[RM-WS] didCompleteWithError \(error)")
        if let response = task.response as? HTTPURLResponse {
            debugLog("[RM-WS] didCompleteWithError httpStatus=\(response.statusCode) headers=\(response.allHeaderFields)")
        }
        markClosed()
    }
}
