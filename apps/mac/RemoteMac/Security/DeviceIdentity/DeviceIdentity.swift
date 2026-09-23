import Foundation

/// A stable, locally-generated identifier for this Mac installation, used as
/// the `publicIdentifier` when registering with the backend. Generated once
/// and persisted in the Keychain rather than derived from hardware (avoids
/// needing extra entitlements just to read a serial number).
struct DeviceIdentity {
    private static let keychainKey = "deviceIdentity.publicIdentifier"
    private let keychain: KeychainStore

    init(keychain: KeychainStore = KeychainStore()) {
        self.keychain = keychain
    }

    func loadOrCreate() throws -> String {
        if let existing = try keychain.getString(forKey: Self.keychainKey) {
            return existing
        }
        let generated = UUID().uuidString
        try keychain.set(generated, forKey: Self.keychainKey)
        return generated
    }

    /// Mints and stores a fresh identifier, discarding the old one. The backend keys a
    /// device's hardware identity to whichever account first registered it — Keychain-backed,
    /// this identifier can otherwise survive across a re-signed rebuild or reinstall, so a
    /// build that ends up signed into a *different* account than whoever registered it
    /// originally would fail to re-register forever with no local way to recover. Called only
    /// after that conflict is confirmed server-side (a 409 from `POST /devices`).
    func reset() throws -> String {
        try keychain.delete(forKey: Self.keychainKey)
        return try loadOrCreate()
    }
}
