import SwiftUI

/// The steady-state dropdown shown once onboarding is complete (build plan §28).
struct MenuBarView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("RemoteMac")
                .font(.headline)

            HStack(spacing: 6) {
                Circle()
                    .fill(appState.connectionStatus == .connected ? Color.green : Color.gray)
                    .frame(width: 8, height: 8)
                Text(appState.connectionStatus == .connected ? "Online" : "Offline")
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 4) {
                LabeledRow(label: "Connection", value: connectionLabel)
                LabeledRow(label: "Device", value: appState.macDeviceName ?? "Unnamed Mac")
            }

            Divider()

            PairingSection()

            Divider()

            Button("Open Settings") {
                NSApp.activate(ignoringOtherApps: true)
                openSettings()
            }

            // Drops the signaling connection only — credentials and pairing survive.
            // Signing out entirely lives in Settings, where it's a deliberate, separate action.
            if appState.connectionStatus == .disconnected {
                Button("Reconnect") {
                    appState.reconnectSignaling()
                }
            } else {
                Button("Disconnect") {
                    appState.disconnectSignaling()
                }
            }

            Button("Quit RemoteMac") {
                NSApplication.shared.terminate(nil)
            }
        }
        .padding()
    }

    private var connectionLabel: String {
        switch appState.connectionStatus {
        case .connected: return "Connected"
        case .connecting: return "Connecting…"
        case .disconnected: return "Disconnected"
        }
    }
}

/// Steady-state pairing status/management — the counterpart to onboarding's "Pair iPhone"
/// step, since pairing (a re-pair, a second iPhone, approving a request that arrives after
/// setup) isn't a one-time onboarding-only action.
private struct PairingSection: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Pairing")
                .font(.subheadline.bold())

            if appState.pairingState == .paired {
                HStack(spacing: 6) {
                    Circle()
                        .fill(appState.pairedRemoteOnline ? Color.green : Color.gray)
                        .frame(width: 8, height: 8)
                    Text("\(appState.pairedRemoteDeviceName ?? "Paired iPhone"): \(appState.pairedRemoteOnline ? "Online" : "Offline")")
                        .foregroundStyle(.secondary)
                }
                Button("Pair Another Device") {
                    Task { await appState.requestPairingCode() }
                }
                .buttonStyle(.link)
                .font(.footnote)

                if appState.webrtcConnectionState != .idle {
                    WebRTCStatusRow()
                }
            } else {
                PairingControlView()
            }
        }
    }
}

/// Minimal, functional readout of the Phase 4 WebRTC data channel — plumbing verification,
/// not a polished connection UI (that's a later phase once media/PTY exist).
private struct WebRTCStatusRow: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(dotColor)
                .frame(width: 8, height: 8)
            Text("Session: \(label)")
                .foregroundStyle(.secondary)
            if let roundTrip = appState.lastPingRoundTripMs {
                Text("(\(Int(roundTrip)) ms)")
                    .foregroundStyle(.secondary)
            }
        }
        .font(.footnote)
    }

    private var label: String {
        switch appState.webrtcConnectionState {
        case .idle: return "Idle"
        case .negotiating: return "Negotiating…"
        case .connected: return "Connected"
        case .disconnected: return "Disconnected"
        case .failed: return "Failed"
        }
    }

    private var dotColor: Color {
        switch appState.webrtcConnectionState {
        case .connected: return .green
        case .negotiating: return .yellow
        case .failed: return .red
        case .idle, .disconnected: return .gray
        }
    }
}

private struct LabeledRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text("\(label):")
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
        }
    }
}
