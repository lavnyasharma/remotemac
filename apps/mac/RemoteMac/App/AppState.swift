import Foundation
import AppKit
import Network

enum AppStage: Equatable {
    case launching
    case onboarding
    case ready
}

enum OnboardingStep: Int, CaseIterable {
    case signIn
    case nameMac
    case pairIPhone
    case testConnection
}

enum PairingUIState: Equatable {
    case idle
    case requestingCode
    case codeReady(code: String, expiresAt: Date)
    case awaitingApproval(devicePairId: String, remoteDeviceName: String)
    case paired
    case failed(String)
}

/// Surfaces why screen sharing isn't running, distinct from `WebRTCConnectionState` (which is
/// about the peer connection itself, not the video track layered on top of it — build plan §18.
enum ScreenShareState: Equatable {
    case idle
    case missingPermissions
    case starting
    case active
    case failed(String)
}

private enum KeychainKey {
    static let refreshToken = "auth.refreshToken"
    static let macDeviceId = "device.macDeviceId"
    static let macDeviceName = "device.macDeviceName"
}

/// The app's single source of truth. Owns onboarding progress, the signaling
/// connection, and pairing state; views only read `@Published` state and call
/// intent methods here — no networking or Keychain access happens in a View.
@MainActor
final class AppState: ObservableObject {
    @Published private(set) var stage: AppStage = .launching
    @Published var onboardingStep: OnboardingStep = .signIn
    @Published private(set) var connectionStatus: ConnectionStatus = .disconnected
    @Published private(set) var pairingState: PairingUIState = .idle
    @Published private(set) var macDeviceName: String?
    @Published private(set) var pairedRemoteOnline: Bool = false
    @Published private(set) var pairedRemoteDeviceName: String?
    @Published private(set) var webrtcConnectionState: WebRTCConnectionState = .idle
    @Published private(set) var lastPingRoundTripMs: Double?
    @Published private(set) var screenShareState: ScreenShareState = .idle
    @Published private(set) var screenRecordingPermissionGranted: Bool = ScreenCaptureManager.hasPermission()
    @Published private(set) var accessibilityPermissionGranted: Bool = InputInjector.isAuthorized()
    @Published var lastError: String?
    @Published var isBusy: Bool = false

    private let api: APIClient
    private let keychain: KeychainStore
    private let deviceIdentity: DeviceIdentity
    private var signaling: SignalingClient?
    private var webrtcClient: WebRTCClient?
    private var activeWebRTCSessionId: String?
    /// An offer that arrived before `startWebRTCSession`'s async ICE-server fetch finished
    /// creating `webrtcClient` — the iPhone can send it that fast, and `handleWebRTCOffer`
    /// used to just silently drop it (`guard let client = webrtcClient else { return }`) with
    /// no error and no retry, hanging the Mac in `.negotiating` until the 20s timeout below.
    /// Applied as soon as the client becomes available instead of discarded.
    private var pendingOffer: WebrtcSdpPayload?
    private var screenCapture: ScreenCaptureManager?

    private var accessToken: String?
    /// When `accessToken` was issued — the backend expires it after 15 minutes.
    private var accessTokenIssuedAt = Date.distantPast
    private var refreshToken: String?
    /// Refresh tokens are single-use (rotated on every refresh), so concurrent refreshes with
    /// the same token would revoke the session — everyone awaits this one in-flight refresh.
    private var refreshTask: Task<String?, Never>?
    private var macDeviceId: String?
    private var hasBootstrapped = false

    /// True while signaling should be up (signed in, device registered, not manually
    /// disconnected) — any drop in that state is unintentional and gets retried.
    private var shouldStayConnected = false
    private var reconnectAttempt = 0
    private var reconnectTask: Task<Void, Never>?
    private let pathMonitor = NWPathMonitor()
    private var lastPathStatus: NWPath.Status?
    private var wakeObserver: NSObjectProtocol?

    private static let accessTokenMaxAge: TimeInterval = 10 * 60

    init(
        api: APIClient = APIClient(),
        keychain: KeychainStore = KeychainStore(),
        deviceIdentity: DeviceIdentity = DeviceIdentity()
    ) {
        self.api = api
        self.keychain = keychain
        self.deviceIdentity = deviceIdentity
        startConnectivityMonitoring()
    }

    // MARK: - Connectivity monitoring

    /// Sleep and network changes are when a live connection most often dies without the
    /// socket noticing — check right away instead of waiting for the heartbeat or backoff.
    private func startConnectivityMonitoring() {
        wakeObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.connectivityChanged() }
        }
        pathMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                let previous = self.lastPathStatus
                self.lastPathStatus = path.status
                // The first callback just reports the current state; only react to changes.
                guard previous != nil, path.status == .satisfied else { return }
                self.connectivityChanged()
            }
        }
        pathMonitor.start(queue: .main)
    }

    private func connectivityChanged() {
        guard shouldStayConnected else { return }
        if connectionStatus == .connected {
            signaling?.probe()
        } else {
            reconnectNow()
        }
    }

    // MARK: - Tokens

    private func storeTokens(accessToken: String, refreshToken: String) {
        self.accessToken = accessToken
        self.accessTokenIssuedAt = Date()
        self.refreshToken = refreshToken
        try? keychain.set(refreshToken, forKey: KeychainKey.refreshToken)
    }

    /// The current access token, refreshed first if it's close to expiring. Nil when a
    /// refresh isn't possible right now (offline, or the refresh token was rejected).
    private func freshAccessToken() async -> String? {
        if let accessToken, Date().timeIntervalSince(accessTokenIssuedAt) < Self.accessTokenMaxAge {
            return accessToken
        }
        if let refreshTask { return await refreshTask.value }
        guard let refreshToken else { return nil }
        let task = Task<String?, Never> { [api] in
            guard let refreshed = try? await api.refresh(refreshToken: refreshToken) else { return nil }
            storeTokens(accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken)
            return refreshed.accessToken
        }
        refreshTask = task
        let token = await task.value
        refreshTask = nil
        return token
    }

    // MARK: - Bootstrap

    func bootstrap() async {
        // `MenuBarExtra`'s content (and its `.task` modifier) is torn down and rebuilt
        // every time the menu is opened, so this can be invoked many times per launch.
        // Only the very first call should actually refresh credentials and open a
        // connection — later calls are a no-op, or they'd churn the signaling socket
        // (tearing down a perfectly healthy connection) every time the user checks status.
        // Set the guard synchronously, before the first `await`, so two calls that land
        // back-to-back (menu opened twice in quick succession) can't both slip through and
        // race each other rotating the same refresh token.
        guard !hasBootstrapped else { return }
        hasBootstrapped = true
        do {
            guard
                let refreshToken = try keychain.getString(forKey: KeychainKey.refreshToken),
                let macDeviceId = try keychain.getString(forKey: KeychainKey.macDeviceId),
                let macDeviceName = try keychain.getString(forKey: KeychainKey.macDeviceName)
            else {
                stage = .onboarding
                return
            }

            let refreshed = try await api.refresh(refreshToken: refreshToken)
            storeTokens(accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken)

            // The cached macDeviceId is only valid for the account that registered it —
            // Keychain storage can survive a rebuild/reinstall even across different accounts
            // (see DeviceIdentity.reset()'s doc comment), so signing into a different account
            // here would otherwise silently try to connect with a device id this account
            // doesn't own, and every WS connection would 403 forever with no local way to
            // recover. Confirm it's still actually in this account's device list first.
            let ownedDevices = try? await api.listDevices(accessToken: refreshed.accessToken)
            if let ownedDevices, ownedDevices.contains(where: { $0.id == macDeviceId }) {
                self.macDeviceId = macDeviceId
                self.macDeviceName = macDeviceName
                stage = .ready
                connectSignaling()
                await restorePairingState()
            } else {
                await registerMacDevice(name: macDeviceName)
                stage = self.macDeviceId != nil ? .ready : .onboarding
            }
        } catch {
            // Any failure here (expired refresh token, offline, a corrupted keychain entry)
            // sends the user back through onboarding rather than getting stuck on launch.
            stage = .onboarding
        }
    }

    // MARK: - Permissions (build plan §18, §21)

    func refreshPermissionStatus() {
        screenRecordingPermissionGranted = ScreenCaptureManager.hasPermission()
        accessibilityPermissionGranted = InputInjector.isAuthorized()
    }

    func requestScreenRecordingPermission() {
        _ = ScreenCaptureManager.requestPermission()
        refreshPermissionStatus()
    }

    func requestAccessibilityPermission() {
        _ = InputInjector.requestAuthorization()
        refreshPermissionStatus()
    }

    func openScreenRecordingSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") else { return }
        NSWorkspace.shared.open(url)
    }

    func openAccessibilitySettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") else { return }
        NSWorkspace.shared.open(url)
    }

    // MARK: - Onboarding: sign in

    func signIn(email: String, password: String) async {
        await performAuth { try await self.api.login(email: email, password: password) }
    }

    func register(email: String, password: String) async {
        await performAuth { try await self.api.register(email: email, password: password) }
    }

    private func performAuth(_ call: @escaping () async throws -> AuthResponse) async {
        isBusy = true
        defer { isBusy = false }
        do {
            let response = try await call()
            storeTokens(accessToken: response.accessToken, refreshToken: response.refreshToken)
            lastError = nil
            onboardingStep = .nameMac
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - Onboarding: name this Mac

    func registerMacDevice(name: String) async {
        guard let accessToken else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            let publicIdentifier = try deviceIdentity.loadOrCreate()
            let device = try await registerWithIdentity(publicIdentifier, name: name, accessToken: accessToken)
            macDeviceId = device.id
            macDeviceName = device.name
            try keychain.set(device.id, forKey: KeychainKey.macDeviceId)
            try keychain.set(device.name, forKey: KeychainKey.macDeviceName)
            lastError = nil
            connectSignaling()
            // This exact Mac (by publicIdentifier) may already be paired with an iPhone from
            // a previous run — re-registering it re-adopts the same device id, so check
            // before sending the user through "generate a code" again for a pairing that
            // already exists.
            await restorePairingState()
            onboardingStep = .pairIPhone
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Registers this install's hardware identity, minting a fresh one and retrying exactly
    /// once if the backend reports it's already claimed by a different account (409) — see
    /// `DeviceIdentity.reset()`'s doc comment for why that can happen on a reused install.
    private func registerWithIdentity(_ publicIdentifier: String, name: String, accessToken: String) async throws -> DeviceResponse {
        do {
            return try await api.registerDevice(
                name: name, platform: "macos", deviceType: "mac",
                publicIdentifier: publicIdentifier, accessToken: accessToken
            )
        } catch APIError.server(409, _) {
            let freshIdentifier = try deviceIdentity.reset()
            return try await api.registerDevice(
                name: name, platform: "macos", deviceType: "mac",
                publicIdentifier: freshIdentifier, accessToken: accessToken
            )
        }
    }

    // MARK: - Onboarding: pair iPhone

    func requestPairingCode() async {
        guard let macDeviceId else { return }
        pairingState = .requestingCode
        guard let accessToken = await freshAccessToken() else {
            pairingState = .failed("Could not reach the server. Check your internet connection.")
            return
        }
        do {
            let response = try await api.requestPairingCode(macDeviceId: macDeviceId, accessToken: accessToken)
            let expiresAt = ISO8601DateFormatter().date(from: response.expiresAt) ?? Date().addingTimeInterval(300)
            pairingState = .codeReady(code: response.pairingCode, expiresAt: expiresAt)
        } catch {
            pairingState = .failed(error.localizedDescription)
        }
    }

    func approveIncomingPair() {
        guard case .awaitingApproval(let devicePairId, _) = pairingState else { return }
        signaling?.send(.pairApprove(PairApprovePayload(pairingRequestId: devicePairId)))
    }

    func rejectIncomingPair() {
        guard case .awaitingApproval(let devicePairId, _) = pairingState else { return }
        signaling?.send(.pairReject(PairRejectPayload(pairingRequestId: devicePairId, reason: nil)))
        pairingState = .idle
    }

    func advanceToTestConnection() {
        onboardingStep = .testConnection
    }

    /// Restores "who is this Mac paired with" from the backend on launch. `pairingState`
    /// otherwise starts every process fresh at `.idle`, which is why a Mac that was paired in
    /// a previous run showed no paired-device status at all until a live pairing/status
    /// message happened to arrive — this fills that gap in with what's actually on record.
    private func restorePairingState() async {
        guard let accessToken, let macDeviceId else { return }
        guard let pair = try? await api.listDevicePairs(deviceId: macDeviceId, accessToken: accessToken).first else {
            return
        }
        pairedRemoteDeviceName = pair.device.name
        pairingState = .paired
    }

    // MARK: - Onboarding: test connection

    func testConnection() async -> TimeInterval? {
        guard let signaling else { return nil }
        let sentAt = Date().timeIntervalSince1970
        do {
            let receivedAt = try await signaling.ping(sentAt: sentAt)
            return receivedAt - sentAt
        } catch {
            lastError = error.localizedDescription
            return nil
        }
    }

    func completeOnboarding() {
        stage = .ready
    }

    // MARK: - Signaling / presence

    private func connectSignaling() {
        guard let accessToken, let macDeviceId else { return }
        shouldStayConnected = true
        reconnectTask?.cancel()
        reconnectTask = nil

        // Tear down any existing connection (and silence its callbacks) before opening a
        // new one. Otherwise the backend closes the old socket as soon as the new one
        // registers (`ConnectionRegistry.set`), and that close event — arriving after we've
        // already switched `signaling` to the new client — can overwrite the fresh
        // `.connected` status with `.disconnected` moments later.
        signaling?.onStatusChange = nil
        signaling?.onMessage = nil
        signaling?.disconnect()

        let client = SignalingClient(deviceId: macDeviceId, accessToken: accessToken)
        client.onMessage = { [weak self] message in
            self?.handle(message)
        }
        client.onStatusChange = { [weak self] status in
            guard let self else { return }
            self.connectionStatus = status
            switch status {
            case .connected: self.reconnectAttempt = 0
            case .disconnected: self.scheduleReconnect()
            case .connecting: break
            }
        }
        signaling = client
        client.connect()
    }

    /// Retries after an unintentional drop: 1s, 2s, 4s, ... capped at 30s, with jitter so a
    /// backend restart doesn't get every client reconnecting in the same instant.
    private func scheduleReconnect() {
        guard shouldStayConnected, reconnectTask == nil else { return }
        let base = min(30, pow(2, Double(reconnectAttempt)))
        let delay = base / 2 + Double.random(in: 0...(base / 2))
        reconnectAttempt += 1
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            self.reconnectTask = nil
            await self.refreshThenConnectSignaling()
        }
    }

    /// Skips any pending backoff and reconnects immediately.
    private func reconnectNow() {
        reconnectTask?.cancel()
        reconnectTask = nil
        reconnectAttempt = 0
        Task { await refreshThenConnectSignaling() }
    }

    /// Drops the signaling connection without signing out — credentials, device
    /// registration, and pairing state all survive. Distinct from `signOut()`.
    func disconnectSignaling() {
        shouldStayConnected = false
        reconnectTask?.cancel()
        reconnectTask = nil
        signaling?.disconnect()
        signaling = nil
        connectionStatus = .disconnected
        teardownWebRTCSession()
    }

    /// The access token is short-lived (15 minutes) — reusing a stale one here would just
    /// repeat the same silent auth failure that left the socket disconnected in the first
    /// place, forcing a full app relaunch (the only other path that refreshes) to recover.
    /// Refreshing first mirrors what `bootstrap()` does on launch.
    func reconnectSignaling() {
        shouldStayConnected = true
        reconnectNow()
    }

    private func refreshThenConnectSignaling() async {
        guard shouldStayConnected, macDeviceId != nil else { return }
        connectionStatus = .connecting
        guard await freshAccessToken() != nil else {
            // Offline, or the server is unreachable — keep retrying on the backoff schedule.
            connectionStatus = .disconnected
            scheduleReconnect()
            return
        }
        guard shouldStayConnected else { return }
        connectSignaling()
    }

    private func handle(_ message: ProtocolMessage) {
        switch message {
        case .pairIncoming(let payload):
            pairingState = .awaitingApproval(devicePairId: payload.devicePairId, remoteDeviceName: payload.remoteDeviceName)
        case .pairComplete:
            if case .awaitingApproval(_, let remoteDeviceName) = pairingState {
                pairedRemoteDeviceName = remoteDeviceName
            }
            pairingState = .paired
            pairedRemoteOnline = true
        case .deviceStatus(let payload):
            pairedRemoteOnline = payload.online
        case .error(let payload):
            lastError = payload.message
        case .sessionStart(let payload):
            // The iPhone is always the WebRTC offerer; this relayed notice (sessionId now
            // filled in by the backend) is the Mac's signal to stand up an `RTCPeerConnection`
            // and wait for the offer that follows. `sessionId == nil` would mean this is the
            // server's ack of a session *we* started — the Mac never does that, so this branch
            // only fires for a genuine incoming session.
            if let sessionId = payload.sessionId {
                startWebRTCSession(sessionId: sessionId)
            }
        case .sessionEnd:
            teardownWebRTCSession()
        case .webrtcOffer(let payload):
            Task { await handleWebRTCOffer(payload) }
        case .webrtcIce(let payload):
            guard payload.sessionId == activeWebRTCSessionId else { return }
            webrtcClient?.addRemoteIceCandidate(
                candidate: payload.candidate,
                sdpMid: payload.sdpMid,
                sdpMLineIndex: payload.sdpMLineIndex
            )
        case .webrtcAnswer(let payload):
            // Normally the Mac only ever sends an answer (the iPhone offers first). The one
            // exception is the renegotiation the Mac itself starts to add the video track
            // (see `addVideoTrack`/`renegotiate`) — there, the Mac is the offerer and this is
            // the iPhone's answer to it.
            guard payload.sessionId == activeWebRTCSessionId, let client = webrtcClient else { return }
            Task {
                do {
                    try await client.acceptRenegotiationAnswer(sdp: payload.sdp)
                } catch {
                    lastError = error.localizedDescription
                }
            }
        case .sessionPong, .unknown:
            break
        }
    }

    // MARK: - WebRTC (build plan Phase 4 — data channel only, no media)

    private func startWebRTCSession(sessionId: String) {
        print("[RM-WS] startWebRTCSession sessionId=\(sessionId)")
        teardownWebRTCSession()
        activeWebRTCSessionId = sessionId
        webrtcConnectionState = .negotiating
        Task {
            do {
                // The token from launch expires after 15 minutes — a stale one here used to
                // fail every session started after that.
                guard let accessToken = await freshAccessToken() else {
                    throw SignalingError.notConnected
                }
                let iceServers = try await api.fetchIceServers(accessToken: accessToken)
                guard sessionId == activeWebRTCSessionId else { return } // session ended while awaiting the fetch
                guard let client = WebRTCClient(iceServers: iceServers) else {
                    webrtcConnectionState = .failed
                    return
                }
                wireWebRTCClient(client, sessionId: sessionId)
                webrtcClient = client
                if let offer = pendingOffer, offer.sessionId == sessionId {
                    pendingOffer = nil
                    await handleWebRTCOffer(offer)
                }
            } catch {
                lastError = error.localizedDescription
                webrtcConnectionState = .failed
            }
        }
        // The offer this waits for only ever comes from the iPhone that started the session —
        // if its own signaling connection drops mid-handshake (before it manages to send that
        // offer), nothing here would otherwise time out: `webrtcConnectionState` would sit at
        // `.negotiating` forever with no way to retry short of quitting the app.
        Task {
            try? await Task.sleep(nanoseconds: 20_000_000_000)
            guard sessionId == activeWebRTCSessionId, webrtcConnectionState == .negotiating else { return }
            lastError = "The connection with your iPhone timed out before it could finish setting up. Try again."
            teardownWebRTCSession()
        }
    }

    private func wireWebRTCClient(_ client: WebRTCClient, sessionId: String) {
        client.onLocalIceCandidate = { [weak self] candidate in
            self?.signaling?.send(.webrtcIce(WebrtcIcePayload(
                sessionId: sessionId,
                candidate: candidate.sdp,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: Int(candidate.sdpMLineIndex)
            )))
        }
        client.onConnectionStateChange = { [weak self] state in
            guard let self, sessionId == self.activeWebRTCSessionId else { return }
            self.webrtcConnectionState = state
            // The iPhone rebuilds a failed session itself; stop capturing the screen for a
            // connection nobody can see in the meantime.
            if state == .failed { self.teardownWebRTCSession() }
        }
        client.onDataChannelOpen = { [weak self] in
            // First test with simple ping/pong (build plan Phase 4) — proves the data channel
            // is reliable before anything (PTY, Phase 5) is built on top of it.
            self?.webrtcClient?.sendPing()
            self?.maybeStartScreenShare(sessionId: sessionId)
        }
        client.onDataChannelClosed = { [weak self] in
            self?.lastPingRoundTripMs = nil
        }
        client.onPong = { [weak self] sentAt in
            self?.lastPingRoundTripMs = Date().timeIntervalSince1970 * 1000 - sentAt
        }
        client.onRenegotiationNeeded = { [weak self] in
            Task { await self?.renegotiate(sessionId: sessionId) }
        }
    }

    // MARK: - Screen share (build plan §18 — video track added once the data channel is up)

    /// Starts screen capture and adds the video track, but only once both permissions are
    /// granted — otherwise this just records why, for the UI to show (`screenShareState`).
    /// Does not loop or retry on its own; call again (e.g. after the user grants a permission
    /// and reconnects) to re-attempt.
    private func maybeStartScreenShare(sessionId: String) {
        guard sessionId == activeWebRTCSessionId, let client = webrtcClient else { return }
        refreshPermissionStatus()
        guard screenRecordingPermissionGranted, accessibilityPermissionGranted else {
            screenShareState = .missingPermissions
            return
        }
        guard screenShareState != .starting, screenShareState != .active else { return }
        screenShareState = .starting

        let capture = ScreenCaptureManager()
        capture.onFrame = { [weak client] sampleBuffer in
            client?.pushVideoSampleBuffer(sampleBuffer)
        }
        capture.onStopped = { [weak self] error in
            guard let self else { return }
            Task { @MainActor in
                guard sessionId == self.activeWebRTCSessionId else { return }
                self.screenShareState = error.map { .failed($0.localizedDescription) } ?? .idle
            }
        }
        screenCapture = capture

        Task {
            do {
                try await capture.start()
                guard sessionId == activeWebRTCSessionId else { return } // session ended mid-start
                guard client.addVideoTrack() else {
                    screenShareState = .failed("Could not add the video track.")
                    return
                }
                if let size = capture.capturedSize {
                    client.sendVideoInfo(width: size.width, height: size.height)
                }
                screenShareState = .active
            } catch {
                screenShareState = .failed(error.localizedDescription)
            }
        }
    }

    /// The Mac-initiated renegotiation for the video track added above. `relayWebrtcMessage`
    /// on the backend routes `webrtc.offer` by session, not by role, so the Mac legitimately
    /// sending one here (instead of only ever answering) is fine.
    private func renegotiate(sessionId: String) async {
        guard sessionId == activeWebRTCSessionId, let client = webrtcClient else { return }
        do {
            let offerSdp = try await client.createRenegotiationOffer()
            signaling?.send(.webrtcOffer(WebrtcSdpPayload(sessionId: sessionId, sdp: offerSdp)))
        } catch {
            lastError = error.localizedDescription
            screenShareState = .failed(error.localizedDescription)
        }
    }

    private func handleWebRTCOffer(_ payload: WebrtcSdpPayload) async {
        guard payload.sessionId == activeWebRTCSessionId else { return }
        guard let client = webrtcClient else {
            // Arrived before the async ICE-server fetch in `startWebRTCSession` finished
            // creating the client — hold onto it, `startWebRTCSession` applies it once ready.
            pendingOffer = payload
            return
        }
        do {
            let answerSdp = try await client.acceptOffer(sdp: payload.sdp)
            signaling?.send(.webrtcAnswer(WebrtcSdpPayload(sessionId: payload.sessionId, sdp: answerSdp)))
        } catch {
            lastError = error.localizedDescription
            webrtcConnectionState = .failed
        }
    }

    private func teardownWebRTCSession() {
        webrtcClient?.close()
        webrtcClient = nil
        pendingOffer = nil
        activeWebRTCSessionId = nil
        webrtcConnectionState = .idle
        lastPingRoundTripMs = nil

        let capture = screenCapture
        screenCapture = nil
        screenShareState = .idle
        Task { await capture?.stop() }
    }

    // MARK: - Sign out

    func signOut() {
        shouldStayConnected = false
        reconnectTask?.cancel()
        reconnectTask = nil
        signaling?.disconnect()
        signaling = nil
        teardownWebRTCSession()

        let tokenToRevoke = refreshToken
        Task { try? await api.logout(refreshToken: tokenToRevoke ?? "") }

        try? keychain.delete(forKey: KeychainKey.refreshToken)
        try? keychain.delete(forKey: KeychainKey.macDeviceId)
        try? keychain.delete(forKey: KeychainKey.macDeviceName)

        accessToken = nil
        refreshToken = nil
        macDeviceId = nil
        macDeviceName = nil
        pairedRemoteDeviceName = nil
        pairedRemoteOnline = false
        pairingState = .idle
        connectionStatus = .disconnected
        onboardingStep = .signIn
        stage = .onboarding
    }
}
