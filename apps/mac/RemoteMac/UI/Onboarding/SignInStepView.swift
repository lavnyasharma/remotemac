import SwiftUI

struct SignInStepView: View {
    @EnvironmentObject private var appState: AppState
    @State private var email = ""
    @State private var password = ""
    @State private var mode: Mode = .signIn

    private enum Mode {
        case signIn
        case register
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sign in with your RemoteMac account")
                .font(.subheadline)

            TextField("Email", text: $email)
                .textFieldStyle(.roundedBorder)
            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)

            Button(mode == .signIn ? "Sign In" : "Create Account") {
                Task {
                    switch mode {
                    case .signIn:
                        await appState.signIn(email: email, password: password)
                    case .register:
                        await appState.register(email: email, password: password)
                    }
                }
            }
            .keyboardShortcut(.defaultAction)
            .disabled(!isValid || appState.isBusy)
            .buttonStyle(.borderedProminent)

            Button(mode == .signIn ? "Need an account? Register" : "Already have an account? Sign in") {
                mode = mode == .signIn ? .register : .signIn
            }
            .buttonStyle(.link)
            .font(.footnote)
        }
    }

    private var isValid: Bool {
        email.contains("@") && password.count >= 8
    }
}
