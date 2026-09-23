import Foundation
import Security

enum KeychainError: Error, LocalizedError {
    case unexpectedStatus(OSStatus)
    case unexpectedData

    var errorDescription: String? {
        switch self {
        case .unexpectedStatus(let status):
            return "Keychain operation failed (status \(status))."
        case .unexpectedData:
            return "Keychain returned data in an unexpected format."
        }
    }
}

/// Thin wrapper around the macOS Keychain for small sensitive values — auth
/// tokens and device identity secrets. Never used for plaintext passwords
/// (those never leave the sign-in form), and never a substitute for
/// UserDefaults (build plan §27).
struct KeychainStore {
    private let service: String

    init(service: String = "app.remotemac.mac") {
        self.service = service
    }

    func set(_ value: String, forKey key: String) throws {
        guard let data = value.data(using: .utf8) else { throw KeychainError.unexpectedData }
        try set(data, forKey: key)
    }

    func set(_ data: Data, forKey key: String) throws {
        let query = baseQuery(forKey: key)
        let updateStatus = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)

        if updateStatus == errSecItemNotFound {
            var addQuery = query
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw KeychainError.unexpectedStatus(addStatus) }
        } else if updateStatus != errSecSuccess {
            throw KeychainError.unexpectedStatus(updateStatus)
        }
    }

    func getString(forKey key: String) throws -> String? {
        guard let data = try getData(forKey: key) else { return nil }
        guard let string = String(data: data, encoding: .utf8) else { throw KeychainError.unexpectedData }
        return string
    }

    func getData(forKey key: String) throws -> Data? {
        var query = baseQuery(forKey: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw KeychainError.unexpectedStatus(status) }
        return result as? Data
    }

    func delete(forKey key: String) throws {
        let status = SecItemDelete(baseQuery(forKey: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    private func baseQuery(forKey key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }
}
