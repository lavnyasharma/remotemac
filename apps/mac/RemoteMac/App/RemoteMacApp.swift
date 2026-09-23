import SwiftUI

@main
struct RemoteMacApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var keepAwakeManager = KeepAwakeManager()

    init() {
        // Diagnostic-only: a long-lived GUI process fully buffers stdout when it isn't a
        // tty, so `print()` output sits in the buffer indefinitely instead of reaching a
        // redirected log file. Unbuffered stdout makes [RM-WS] lines show up immediately.
        setvbuf(stdout, nil, _IONBF, 0)
    }

    var body: some Scene {
        MenuBarExtra {
            RootMenuBarContent()
                .environmentObject(appState)
                .environmentObject(keepAwakeManager)
                .task { await appState.bootstrap() }
                .task { keepAwakeManager.restoreOnLaunch() }
        } label: {
            MenuBarLabel(status: appState.connectionStatus)
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView()
                .environmentObject(appState)
                .environmentObject(keepAwakeManager)
        }
    }
}

private struct MenuBarLabel: View {
    let status: ConnectionStatus

    var body: some View {
        Image(systemName: iconName)
    }

    private var iconName: String {
        switch status {
        case .connected:
            return "bolt.horizontal.circle.fill"
        case .connecting, .disconnected:
            return "bolt.horizontal.circle"
        }
    }
}

/// Switches between the onboarding wizard and the steady-state menu based on
/// `AppState.stage` — this app never opens a full document window (build
/// plan §28: "should run without requiring a visible full window after setup").
private struct RootMenuBarContent: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            switch appState.stage {
            case .launching:
                ProgressView("Loading…")
                    .padding()
            case .onboarding:
                OnboardingView()
            case .ready:
                MenuBarView()
            }
        }
        .frame(width: 340)
    }
}
