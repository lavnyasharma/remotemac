import SwiftUI

struct TestConnectionStepView: View {
    @EnvironmentObject private var appState: AppState
    @State private var result: String?
    @State private var isTesting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Test the connection")
                .font(.subheadline)

            if let result {
                Text(result)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Button(isTesting ? "Testing…" : "Test Connection") {
                Task {
                    isTesting = true
                    if let rtt = await appState.testConnection() {
                        result = String(format: "Round-trip time: %.0f ms", rtt * 1000)
                    } else {
                        result = "Could not reach the backend."
                    }
                    isTesting = false
                }
            }
            .disabled(isTesting)
            .buttonStyle(.borderedProminent)

            Button("Finish Setup") {
                appState.completeOnboarding()
            }
            .buttonStyle(.bordered)
        }
    }
}
