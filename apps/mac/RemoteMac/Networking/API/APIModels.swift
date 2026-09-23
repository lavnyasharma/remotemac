import Foundation

struct AuthUser: Decodable {
    let id: String
    let email: String
}

struct AuthResponse: Decodable {
    let user: AuthUser
    let accessToken: String
    let accessTokenExpiresAt: String
    let refreshToken: String
}

struct RefreshResponse: Decodable {
    let accessToken: String
    let accessTokenExpiresAt: String
    let refreshToken: String
}

struct DeviceResponse: Decodable {
    let id: String
    let userId: String
    let deviceType: String
    let name: String
    let platform: String
    let publicIdentifier: String
    let lastSeenAt: String?
    let createdAt: String
    let updatedAt: String
}

struct CreateDeviceResponseWrapper: Decodable {
    let device: DeviceResponse
}

struct ListDevicesResponseWrapper: Decodable {
    let devices: [DeviceResponse]
}

struct PairingCodeResponse: Decodable {
    let pairingCode: String
    let expiresAt: String
}

struct DevicePairEntry: Decodable {
    let pairId: String
    let device: DeviceResponse
}

struct ListDevicePairsResponseWrapper: Decodable {
    let pairs: [DevicePairEntry]
}

struct APIErrorBody: Decodable {
    let error: String
}

struct IceServerConfig: Decodable {
    let urls: IceServerURLs
    let username: String?
    let credential: String?
}

/// The backend returns a single URL string for STUN and may return either a string or an
/// array for TURN — decode both shapes into one representation rather than assuming which.
enum IceServerURLs: Decodable {
    case single(String)
    case multiple([String])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            self = .single(value)
        } else {
            self = .multiple(try container.decode([String].self))
        }
    }

    var values: [String] {
        switch self {
        case .single(let value): return [value]
        case .multiple(let values): return values
        }
    }
}

struct IceServersResponseWrapper: Decodable {
    let iceServers: [IceServerConfig]
}
