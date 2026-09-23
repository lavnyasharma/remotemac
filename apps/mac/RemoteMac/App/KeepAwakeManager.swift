import Foundation
import IOKit.pwr_mgt

/// Keeps this Mac reachable for a remote session even with the lid closed. Two layers, because
/// they block different sleep triggers:
///
/// 1. An `IOPMAssertion` (no admin needed, released automatically if the app quits or crashes)
///    blocks *idle* sleep — the system deciding to sleep itself after inactivity.
/// 2. `pmset -a disablesleep 1` blocks the *forced* sleep macOS triggers specifically on lid
///    close, which no assertion can prevent. This is a persistent, system-wide setting (it
///    survives this app quitting, and isn't scoped to it), so it needs one-time admin
///    authorization through the system's own dialog — this never handles the password itself.
///
/// Enabling this keeps the Mac fully powered — CPU, fans, everything — with the display off and
/// lid shut. On battery, in a bag, or anywhere airflow is blocked, that's a real overheating
/// risk. `SettingsView` requires an explicit acknowledgement of that before the first enable;
/// this class only carries out what's already been confirmed.
@MainActor
final class KeepAwakeManager: ObservableObject {
    @Published private(set) var isEnabled: Bool
    @Published private(set) var isApplying = false
    @Published var lastError: String?

    private static let defaultsKey = "keepMacAwakeEnabled"
    private var idleSleepAssertionId: IOPMAssertionID = 0
    private var hasIdleSleepAssertion = false

    init() {
        isEnabled = UserDefaults.standard.bool(forKey: Self.defaultsKey)
    }

    /// Re-acquires the (process-scoped, prompt-free) idle-sleep assertion on launch, and only
    /// re-runs `pmset` — which would re-prompt for a password — if the system-wide setting
    /// isn't already where the last session left it (e.g. it was never applied, or something
    /// else reset it).
    func restoreOnLaunch() {
        guard isEnabled else { return }
        acquireIdleSleepAssertion()
        Task {
            let current = await Self.currentDisableSleepIsOn()
            guard current != true else { return }
            await apply(enabled: true)
        }
    }

    func setEnabled(_ enabled: Bool) {
        Task { await apply(enabled: enabled) }
    }

    private func apply(enabled: Bool) async {
        isApplying = true
        lastError = nil

        if enabled {
            acquireIdleSleepAssertion()
        } else {
            releaseIdleSleepAssertion()
        }

        let current = await Self.currentDisableSleepIsOn()
        let succeeded: Bool
        if current == enabled {
            succeeded = true
        } else {
            succeeded = await Self.setDisableSleep(enabled)
        }

        if !succeeded && enabled {
            // The admin prompt was declined or failed — don't leave the toggle showing "on"
            // for a lid-close protection that isn't actually in effect.
            releaseIdleSleepAssertion()
            lastError = "RemoteMac needs your admin password to keep this Mac awake with the lid closed. Leave this off (or keep the lid open, or connect an external display) if you'd rather not grant it."
            isEnabled = false
            UserDefaults.standard.set(false, forKey: Self.defaultsKey)
            isApplying = false
            return
        }

        if !succeeded && !enabled {
            // Failed to turn it back off — say so rather than silently claiming success while
            // the system-wide setting is still disabling sleep.
            lastError = "Couldn't confirm this Mac's sleep setting was restored. Check with `pmset -g` in Terminal, or run `sudo pmset -a disablesleep 0`."
        }

        isEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: Self.defaultsKey)
        isApplying = false
    }

    private func acquireIdleSleepAssertion() {
        guard !hasIdleSleepAssertion else { return }
        var assertionId: IOPMAssertionID = 0
        let result = IOPMAssertionCreateWithName(
            "PreventUserIdleSystemSleep" as CFString,
            IOPMAssertionLevel(kIOPMAssertionLevelOn),
            "RemoteMac: keep awake for remote sessions" as CFString,
            &assertionId
        )
        if result == kIOReturnSuccess {
            idleSleepAssertionId = assertionId
            hasIdleSleepAssertion = true
        }
    }

    private func releaseIdleSleepAssertion() {
        guard hasIdleSleepAssertion else { return }
        IOPMAssertionRelease(idleSleepAssertionId)
        hasIdleSleepAssertion = false
    }

    /// Reads the current system-wide setting — no privileges needed to read it, only to change
    /// it — so `apply` can skip the admin prompt when it's already in the desired state.
    private static func currentDisableSleepIsOn() async -> Bool? {
        await withCheckedContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/pmset")
            process.arguments = ["-g"]
            let stdoutPipe = Pipe()
            process.standardOutput = stdoutPipe
            process.terminationHandler = { proc in
                guard proc.terminationStatus == 0 else {
                    continuation.resume(returning: nil)
                    return
                }
                let data = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8) ?? ""
                // `pmset -a disablesleep <n>` is the write-side flag name, but `pmset -g`
                // reports the same property back under a different key, "SleepDisabled" —
                // matching on "disablesleep" here always misses, so the app never recognizes
                // an already-applied setting and re-prompts for the admin password every time.
                let isOn = output
                    .split(separator: "\n")
                    .contains { line in
                        let trimmed = line.trimmingCharacters(in: .whitespaces)
                        return trimmed.hasPrefix("SleepDisabled") && trimmed.hasSuffix("1")
                    }
                continuation.resume(returning: isOn)
            }
            do {
                try process.run()
            } catch {
                continuation.resume(returning: nil)
            }
        }
    }

    /// Runs `pmset -a disablesleep <0|1>` under one-time admin authorization via the system's
    /// own dialog (`osascript … with administrator privileges`) — no custom credential UI, no
    /// privileged helper tool to install. Returns whether it actually took effect.
    private static func setDisableSleep(_ disable: Bool) async -> Bool {
        await withCheckedContinuation { continuation in
            let script = "do shell script \"pmset -a disablesleep \(disable ? 1 : 0)\" with administrator privileges"
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-e", script]
            process.standardOutput = Pipe()
            process.standardError = Pipe()
            process.terminationHandler = { proc in
                continuation.resume(returning: proc.terminationStatus == 0)
            }
            do {
                try process.run()
            } catch {
                continuation.resume(returning: false)
            }
        }
    }
}
