import SwiftUI

/// First-launch wizard (build plan §29): sign in, name this Mac, pair an
/// iPhone, test the connection. Screen Recording and Accessibility
/// permission steps are added in Phases 7–8 once those features exist.
struct OnboardingView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Welcome to RemoteMac")
                .font(.title2.bold())

            StepIndicator(current: appState.onboardingStep)

            Group {
                switch appState.onboardingStep {
                case .signIn:
                    SignInStepView()
                case .nameMac:
                    NameMacStepView()
                case .pairIPhone:
                    PairIPhoneStepView()
                case .testConnection:
                    TestConnectionStepView()
                }
            }

            if let error = appState.lastError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
        .padding()
    }
}

private struct StepIndicator: View {
    let current: OnboardingStep

    var body: some View {
        HStack(spacing: 6) {
            ForEach(OnboardingStep.allCases, id: \.rawValue) { step in
                Circle()
                    .fill(step.rawValue <= current.rawValue ? Color.accentColor : Color.secondary.opacity(0.3))
                    .frame(width: 6, height: 6)
            }
        }
    }
}
