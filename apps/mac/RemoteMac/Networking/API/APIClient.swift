import Foundation

enum APIError: Error, LocalizedError {
    case server(status: Int, message: String)
    case decoding(Error)
    case network(Error)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .server(_, let message):
            return message
        case .decoding:
            return "Received an unexpected response from the server."
        case .network(let error):
            return error.localizedDescription
        case .unauthorized:
            return "You need to sign in again."
        }
    }
}

/// REST client for the backend's auth/devices/pairing endpoints
/// (see docs: services/backend). Does not manage token storage or refresh
/// scheduling — callers (AppState) own that.
final class APIClient: @unchecked Sendable {
    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(baseURL: URL = BackendEnvironment.current.apiBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    func register(email: String, password: String) async throws -> AuthResponse {
        try await post("/auth/register", body: ["email": email, "password": password])
    }

    func login(email: String, password: String) async throws -> AuthResponse {
        try await post("/auth/login", body: ["email": email, "password": password])
    }

    func refresh(refreshToken: String) async throws -> RefreshResponse {
        try await post("/auth/refresh", body: ["refreshToken": refreshToken])
    }

    func logout(refreshToken: String) async throws {
        _ = try await performRaw(makeRequest(path: "/auth/logout", method: "POST", body: ["refreshToken": refreshToken], accessToken: nil))
    }

    func registerDevice(
        name: String,
        platform: String,
        deviceType: String,
        publicIdentifier: String,
        accessToken: String
    ) async throws -> DeviceResponse {
        let wrapper: CreateDeviceResponseWrapper = try await post(
            "/devices",
            body: [
                "deviceType": deviceType,
                "name": name,
                "platform": platform,
                "publicIdentifier": publicIdentifier,
            ],
            accessToken: accessToken
        )
        return wrapper.device
    }

    func listDevices(accessToken: String) async throws -> [DeviceResponse] {
        let wrapper: ListDevicesResponseWrapper = try await get("/devices", accessToken: accessToken)
        return wrapper.devices
    }

    func requestPairingCode(macDeviceId: String, accessToken: String) async throws -> PairingCodeResponse {
        try await post("/pairing/request", body: ["macDeviceId": macDeviceId], accessToken: accessToken)
    }

    func listDevicePairs(deviceId: String, accessToken: String) async throws -> [DevicePairEntry] {
        let wrapper: ListDevicePairsResponseWrapper = try await get("/devices/\(deviceId)/pairs", accessToken: accessToken)
        return wrapper.pairs
    }

    func fetchIceServers(accessToken: String) async throws -> [IceServerConfig] {
        let wrapper: IceServersResponseWrapper = try await get("/webrtc/ice-servers", accessToken: accessToken)
        return wrapper.iceServers
    }

    // MARK: - Low-level helpers

    private func post<Response: Decodable>(
        _ path: String,
        body: [String: String],
        accessToken: String? = nil
    ) async throws -> Response {
        try await perform(makeRequest(path: path, method: "POST", body: body, accessToken: accessToken))
    }

    private func get<Response: Decodable>(_ path: String, accessToken: String? = nil) async throws -> Response {
        try await perform(makeRequest(path: path, method: "GET", body: nil, accessToken: accessToken))
    }

    private func makeRequest(path: String, method: String, body: [String: String]?, accessToken: String?) -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        if let body {
            request.httpBody = try? encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func perform<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let (data, _) = try await performRaw(request)
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    @discardableResult
    private func performRaw(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.network(error)
        }
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.network(URLError(.badServerResponse))
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 401 { throw APIError.unauthorized }
            let message = (try? decoder.decode(APIErrorBody.self, from: data))?.error
                ?? "Request failed (\(httpResponse.statusCode))"
            throw APIError.server(status: httpResponse.statusCode, message: message)
        }
        return (data, httpResponse)
    }
}
