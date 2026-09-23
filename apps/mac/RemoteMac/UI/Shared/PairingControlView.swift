import SwiftUI

/// Renders the pairing UI driven by `AppState.pairingState` (generate a code, show it, or
/// approve/reject an incoming request). Shared between onboarding's "Pair iPhone" step and
/// the steady-state menu, so a pairing request that arrives after onboarding — a re-pair, a
/// second iPhone — has somewhere to show its Allow/Reject prompt. `.paired` renders nothing;
/// each call site decides how to present an already-paired state.
struct PairingControlView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        switch appState.pairingState {
        case .idle:
            VStack(alignment: .leading, spacing: 8) {
                Text("Generate a pairing code and enter it in the RemoteMac app on your iPhone.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button("Generate Code") {
                    Task { await appState.requestPairingCode() }
                }
                .buttonStyle(.borderedProminent)
            }

        case .requestingCode:
            ProgressView()

        case .codeReady(let code, let expiresAt):
            VStack(alignment: .leading, spacing: 8) {
                CodeDisplay(code: code)
                Text("Expires \(expiresAt, style: .relative)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

        case .awaitingApproval(_, let remoteDeviceName):
            VStack(alignment: .leading, spacing: 8) {
                Text("\(remoteDeviceName) wants to pair")
                    .font(.body.bold())
                HStack {
                    Button("Allow") { appState.approveIncomingPair() }
                        .buttonStyle(.borderedProminent)
                    Button("Reject") { appState.rejectIncomingPair() }
                }
            }

        case .paired:
            EmptyView()

        case .failed(let message):
            VStack(alignment: .leading, spacing: 8) {
                Text(message)
                    .foregroundStyle(.red)
                    .font(.footnote)
                Button("Try Again") {
                    Task { await appState.requestPairingCode() }
                }
            }
        }
    }
}

private struct CodeDisplay: View {
    let code: String

    var body: some View {
        Text(formatted)
            .font(.system(.title, design: .monospaced).bold())
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.secondary.opacity(0.1)))
    }

    private var formatted: String {
        guard code.count == 6 else { return code }
        let mid = code.index(code.startIndex, offsetBy: 3)
        return "\(code[..<mid]) \(code[mid...])"
    }
}
