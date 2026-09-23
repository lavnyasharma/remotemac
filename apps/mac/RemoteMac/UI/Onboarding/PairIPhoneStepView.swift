import SwiftUI

struct PairIPhoneStepView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Pair your iPhone")
                .font(.subheadline)

            if appState.pairingState == .paired {
                Label("Paired successfully", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Button("Continue") {
                    appState.advanceToTestConnection()
                }
                .buttonStyle(.borderedProminent)
            } else {
                PairingControlView()
            }
        }
    }
}
