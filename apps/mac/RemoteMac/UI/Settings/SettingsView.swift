import SwiftUI

/// The Preferences window. A custom dark sidebar layout (General / Permissions / About) rather
/// than the native tabbed Form this used to be — the sidebar mirrors the reference design the
/// user asked to match pixel-for-pixel, so this trades the free native styling for hand-rolled
/// cards/badges consistent with `SettingsTheme` below.
struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var selection: SettingsSection = .general

    var body: some View {
        HStack(spacing: 0) {
            SidebarView(selection: $selection)
                .frame(width: 232)

            Rectangle()
                .fill(SettingsTheme.border)
                .frame(width: 1)

            ScrollView {
                content
                    .padding(28)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(SettingsTheme.background)
        }
        .frame(minWidth: 860, idealWidth: 920, minHeight: 640, idealHeight: 780)
        .background(SettingsTheme.background)
        .preferredColorScheme(.dark)
        .onAppear { appState.refreshPermissionStatus() }
    }

    @ViewBuilder
    private var content: some View {
        switch selection {
        case .general: GeneralPage()
        case .about: AboutPage()
        }
    }
}

private enum SettingsSection: String, CaseIterable, Identifiable {
    case general, about
    var id: Self { self }

    var label: String {
        switch self {
        case .general: return "General"
        case .about: return "About"
        }
    }

    var icon: String {
        switch self {
        case .general: return "gearshape.fill"
        case .about: return "info.circle.fill"
        }
    }
}

// MARK: - Theme

/// Hand-picked to match the reference design's near-black navy, not tied to the system accent
/// or appearance — the settings window is always dark regardless of the user's macOS theme
/// (see `.preferredColorScheme(.dark)` above), so these can't just delegate to system colors.
private enum SettingsTheme {
    static let background = Color(red: 0.043, green: 0.055, blue: 0.086)
    static let card = Color(red: 0.09, green: 0.105, blue: 0.145)
    static let rowFill = Color.black.opacity(0.18)
    static let border = Color.white.opacity(0.07)
    static let secondaryText = Color.white.opacity(0.55)
    static let accent = Color(red: 0.16, green: 0.42, blue: 0.94)
}

// MARK: - Sidebar

private struct SidebarView: View {
    @EnvironmentObject private var appState: AppState
    @Binding var selection: SettingsSection

    private var version: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0" }
    private var build: String { Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1" }

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 10) {
                Image(nsImage: NSApplication.shared.applicationIconImage)
                    .resizable()
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                Text("RemoteMac")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                Text("Version \(version) (\(build))")
                    .font(.system(size: 11))
                    .foregroundStyle(SettingsTheme.secondaryText)
            }
            .padding(.top, 28)
            .padding(.bottom, 22)

            VStack(spacing: 3) {
                ForEach(SettingsSection.allCases) { section in
                    SidebarRow(section: section, isSelected: section == selection) {
                        selection = section
                    }
                }
            }
            .padding(.horizontal, 14)

            Spacer()

            Button {
                appState.signOut()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                    Text("Sign Out")
                    Spacer()
                }
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SettingsTheme.secondaryText)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(SettingsTheme.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(14)
        }
        .frame(maxHeight: .infinity)
        .background(SettingsTheme.background)
    }
}

private struct SidebarRow: View {
    let section: SettingsSection
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: section.icon)
                    .frame(width: 18)
                Text(section.label)
                Spacer()
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(isSelected ? .white : SettingsTheme.secondaryText)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(isSelected ? SettingsTheme.accent : Color.clear, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - General (the full dashboard — every card the reference design shows at once)

private struct GeneralPage: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var keepAwake: KeepAwakeManager
    @State private var showAwakeConfirmation = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            PageHeader(title: "General", subtitle: "Manage your Mac connection and preferences.")

            SettingsCard(icon: "display", title: "This Mac") {
                VStack(spacing: 8) {
                    SettingsRow(title: "Name") {
                        Text(appState.macDeviceName ?? "Unnamed")
                            .font(.system(size: 13))
                            .foregroundStyle(SettingsTheme.secondaryText)
                    }
                    SettingsRow(title: "Connection") {
                        StatusBadge(text: connectionLabel, color: connectionColor, systemImage: connectionIcon)
                    }
                }
            }

            SettingsCard(icon: "iphone", title: "Paired iPhone") {
                SettingsRow(title: "Paired iPhone") {
                    HStack(spacing: 8) {
                        StatusBadge(text: pairedLabel, color: pairedColor, systemImage: pairedIcon)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(SettingsTheme.secondaryText)
                    }
                }
            }

            SettingsCard(icon: "moon.fill", title: "Remote Access") {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Keep Mac Awake (lid closed)")
                            .font(.system(size: 13))
                            .foregroundStyle(.white)
                        Spacer()
                        Toggle("", isOn: toggleBinding)
                            .labelsHidden()
                            .disabled(keepAwake.isApplying)
                            .tint(SettingsTheme.accent)
                    }
                    Text("Lets this Mac stay reachable from your iPhone over the internet with the lid closed. While on, it will not sleep — even on battery — until you turn this off. Keep it plugged in and somewhere ventilated, not in a closed bag.")
                        .font(.system(size: 12))
                        .foregroundStyle(SettingsTheme.secondaryText)
                    if let error = keepAwake.lastError {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(.red)
                    }
                }
            }
            .confirmationDialog(
                "Keep this Mac awake with the lid closed?",
                isPresented: $showAwakeConfirmation,
                titleVisibility: .visible
            ) {
                Button("Turn On") { keepAwake.setEnabled(true) }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This Mac will not sleep — even on battery — until you turn this off again. Keep it plugged in and somewhere ventilated; a closed bag can trap heat. macOS will ask for your admin password once.")
            }

            SettingsCard(icon: "hand.raised.fill", title: "Permissions", subtitle: "Required to view and control this Mac from your iPhone.") {
                VStack(spacing: 8) {
                    PermissionRow(
                        title: "Screen Recording",
                        systemImage: "rectangle.inset.filled.badge.record",
                        explanation: "RemoteMac needs Screen Recording permission to show this Mac's screen on your iPhone.",
                        isGranted: appState.screenRecordingPermissionGranted,
                        onOpenSettings: appState.openScreenRecordingSettings,
                        onCheckAgain: appState.requestScreenRecordingPermission
                    )
                    PermissionRow(
                        title: "Accessibility",
                        systemImage: "hand.point.up.left",
                        explanation: "RemoteMac needs Accessibility permission to control the Mac from your iPhone.",
                        isGranted: appState.accessibilityPermissionGranted,
                        onOpenSettings: appState.openAccessibilitySettings,
                        onCheckAgain: appState.requestAccessibilityPermission
                    )
                }
            }

            SettingsCard(icon: "info.circle.fill", title: "About", subtitle: "App information and account.") {
                VStack(alignment: .leading, spacing: 10) {
                    SettingsRow(title: "RemoteMac") {
                        Text("Version \(aboutVersion) (\(aboutBuild))")
                            .font(.system(size: 13))
                            .foregroundStyle(SettingsTheme.secondaryText)
                    }
                    Text("View and control this Mac securely from your iPhone, wherever you are.")
                        .font(.system(size: 12))
                        .foregroundStyle(SettingsTheme.secondaryText)
                }
            }
        }
    }

    private var aboutVersion: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0" }
    private var aboutBuild: String { Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1" }

    private var toggleBinding: Binding<Bool> {
        Binding(
            get: { keepAwake.isEnabled },
            set: { newValue in
                if newValue {
                    showAwakeConfirmation = true
                } else {
                    keepAwake.setEnabled(false)
                }
            }
        )
    }

    private var connectionLabel: String {
        switch appState.connectionStatus {
        case .connected: return "Connected"
        case .connecting: return "Connecting…"
        case .disconnected: return "Disconnected"
        }
    }

    private var connectionColor: Color {
        switch appState.connectionStatus {
        case .connected: return .green
        case .connecting: return .orange
        case .disconnected: return .secondary
        }
    }

    private var connectionIcon: String {
        appState.connectionStatus == .connected ? "checkmark.circle.fill" : "circle"
    }

    private var pairedLabel: String {
        if appState.pairingState == .paired {
            return appState.pairedRemoteOnline ? "Online" : "Offline"
        }
        return "Not paired"
    }

    private var pairedColor: Color {
        guard appState.pairingState == .paired else { return .secondary }
        return appState.pairedRemoteOnline ? .green : .secondary
    }

    private var pairedIcon: String {
        guard appState.pairingState == .paired else { return "iphone.slash" }
        return "iphone.gen3"
    }
}

// MARK: - About (standalone page for direct sidebar navigation)

private struct AboutPage: View {
    private var version: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0" }
    private var build: String { Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1" }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            PageHeader(title: "About", subtitle: "App information and account.")

            SettingsCard(icon: "info.circle.fill", title: "RemoteMac") {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 12) {
                        Image(nsImage: NSApplication.shared.applicationIconImage)
                            .resizable()
                            .frame(width: 44, height: 44)
                            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("RemoteMac")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.white)
                            Text("Version \(version) (\(build))")
                                .font(.system(size: 12))
                                .foregroundStyle(SettingsTheme.secondaryText)
                        }
                    }
                    Text("RemoteMac lets you view and control this Mac from your iPhone, wherever you are — live screen mirroring plus mouse and keyboard input, over a private connection paired directly to this Mac.")
                        .font(.system(size: 12))
                        .foregroundStyle(SettingsTheme.secondaryText)
                }
            }
        }
    }
}

// MARK: - Shared building blocks

private struct PageHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(.white)
            Text(subtitle)
                .font(.system(size: 13))
                .foregroundStyle(SettingsTheme.secondaryText)
        }
        .padding(.bottom, 4)
    }
}

private struct SettingsCard<Content: View>: View {
    let icon: String
    let title: String
    var subtitle: String? = nil
    let content: Content

    init(icon: String, title: String, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Image(systemName: icon)
                        .foregroundStyle(SettingsTheme.accent)
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                }
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(SettingsTheme.secondaryText)
                }
            }
            content
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SettingsTheme.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SettingsTheme.border, lineWidth: 1))
    }
}

private struct SettingsRow<Trailing: View>: View {
    let title: String
    let trailing: Trailing

    init(title: String, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.trailing = trailing()
    }

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 13))
                .foregroundStyle(.white)
            Spacer()
            trailing
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(SettingsTheme.rowFill, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

/// Screen Mode (build plan §18-21) needs two macOS permissions the app can't request silently:
/// Screen Recording (to capture the display) and Accessibility (to inject remote input). Each
/// row states plainly why it's needed, checks state without prompting, and only prompts the
/// system dialog on an explicit tap — never on its own.
private struct PermissionRow: View {
    let title: String
    let systemImage: String
    let explanation: String
    let isGranted: Bool
    let onOpenSettings: () -> Void
    let onCheckAgain: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(SettingsTheme.accent)
                    .frame(width: 20)
                Text(title)
                    .font(.system(size: 13))
                    .foregroundStyle(.white)
                Spacer()
                StatusBadge(
                    text: isGranted ? "Granted" : "Not Granted",
                    color: isGranted ? .green : .orange,
                    systemImage: isGranted ? "checkmark.circle.fill" : "exclamationmark.circle.fill"
                )
                if isGranted {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(SettingsTheme.secondaryText)
                }
            }
            if !isGranted {
                Text(explanation)
                    .font(.system(size: 12))
                    .foregroundStyle(SettingsTheme.secondaryText)
                HStack(spacing: 12) {
                    Button("Open System Settings", action: onOpenSettings)
                    Button("Check Again", action: onCheckAgain)
                }
                .font(.system(size: 12))
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(SettingsTheme.rowFill, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct StatusBadge: View {
    let text: String
    let color: Color
    let systemImage: String

    var body: some View {
        Label(text, systemImage: systemImage)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(color.opacity(0.16), in: Capsule())
    }
}
