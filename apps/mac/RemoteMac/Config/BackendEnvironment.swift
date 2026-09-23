import Foundation

/// Which backend this build talks to. Mirrors the dev/staging/production
/// split in CLAUDE_BUILD_PLAN.md §47 — even for a personal project, the
/// URL is never hard-coded into business logic.
enum BackendEnvironment {
    case development
    case staging
    case production

    /// The environment a build uses by default. Overridable at runtime via
    /// the `REMOTEMAC_API_BASE_URL` / `REMOTEMAC_WS_BASE_URL` environment
    /// variables, primarily for local development against `npm run dev`.
    static let current: BackendEnvironment = {
        #if DEBUG
        return .development
        #else
        return .production
        #endif
    }()

    var apiBaseURL: URL {
        if let override = ProcessInfo.processInfo.environment["REMOTEMAC_API_BASE_URL"],
           let url = URL(string: override) {
            return url
        }
        switch self {
        case .development:
            return URL(string: "http://localhost:3000")!
        case .staging:
            return URL(string: "https://staging-api.remotemac.app")!
        case .production:
            // render.yaml names the service "remotemac-backend", which Render turns into
            // this exact *.onrender.com hostname unless that name was already taken — check
            // the actual URL on the Render dashboard after the first deploy and update this
            // (and webSocketBaseURL below) if it differs. No custom domain is configured yet.
            return URL(string: "https://remotemac-backend.onrender.com")!
        }
    }

    var webSocketBaseURL: URL {
        if let override = ProcessInfo.processInfo.environment["REMOTEMAC_WS_BASE_URL"],
           let url = URL(string: override) {
            return url
        }
        switch self {
        case .development:
            return URL(string: "ws://localhost:3000/ws")!
        case .staging:
            return URL(string: "wss://staging-api.remotemac.app/ws")!
        case .production:
            return URL(string: "wss://remotemac-backend.onrender.com/ws")!
        }
    }
}
