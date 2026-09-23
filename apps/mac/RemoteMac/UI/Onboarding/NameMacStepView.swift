import SwiftUI

struct NameMacStepView: View {
    @EnvironmentObject private var appState: AppState
    @State private var name: String = Host.current().localizedName ?? "My Mac"

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Name this Mac")
                .font(.subheadline)

            TextField("Mac name", text: $name)
                .textFieldStyle(.roundedBorder)

            Button("Continue") {
                Task { await appState.registerMacDevice(name: name) }
            }
            .keyboardShortcut(.defaultAction)
            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || appState.isBusy)
            .buttonStyle(.borderedProminent)
        }
    }
}
