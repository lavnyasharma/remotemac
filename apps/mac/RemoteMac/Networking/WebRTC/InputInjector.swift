import Foundation
import CoreGraphics
import ApplicationServices
import os

/// Injects remote mouse/keyboard input as native `CGEvent`s (build plan §19-21). Has no
/// knowledge of WebRTC — it's handed a bare `{type, payload}` message shape (the wire
/// contract shared with the iPhone) by `WebRTCClient`'s data-channel handler and turns it
/// into CoreGraphics events. Not `@MainActor`: called directly from the data channel's
/// callback thread for minimal latency, and CGEvent posting doesn't require the main thread.
final class InputInjector {
    private let eventSource = CGEventSource(stateID: .hidSystemState)
    /// Modifier state is tracked here rather than re-derived per event, since `keyboard.modifier`
    /// arrives as its own down/up message, independent of the key/text events it should apply to.
    private var modifierFlags: CGEventFlags = []

    // `AXIsProcessTrusted()` is cheap but non-zero, and `handle` runs on the highest-frequency
    // path in the app (every mouse move during a drag can be dozens of calls per second) — a
    // syscall per event there is pure waste. Cached for a second at a time instead of per-call;
    // that's still fast enough to notice a revoke made in System Settings without a relaunch,
    // which is the only reason this is checked repeatedly at all rather than once at connect.
    // `OSAllocatedUnfairLock` (not a plain `static var`) so this stays `Sendable`-safe under
    // Swift 6 strict concurrency without forcing `isAuthorized`/`handle` to become `async`.
    private static let authorizationCacheInterval: TimeInterval = 1.0
    private static let cachedAuthorization = OSAllocatedUnfairLock(initialState: (value: false, checkedAt: Date.distantPast))

    static func isAuthorized() -> Bool {
        cachedAuthorization.withLock { state in
            let now = Date()
            if now.timeIntervalSince(state.checkedAt) >= authorizationCacheInterval {
                state = (AXIsProcessTrusted(), now)
            }
            return state.value
        }
    }

    /// Prompts the system Accessibility dialog. Only call this from a deliberate user action
    /// (Settings' "Check Again" / enable flow) — never from `handle`, or the dialog would
    /// reappear on every incoming input message.
    @discardableResult
    static func requestAuthorization() -> Bool {
        // Swift 6 strict concurrency flags `kAXTrustedCheckOptionPrompt` (a `CFString` global)
        // as not concurrency-safe to reference directly, so this uses its well-known, stable
        // literal value instead of the imported constant.
        let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    func handle(type: String, payload: [String: Any]) {
        // Checked per-message, not cached: the user can grant/revoke this in System Settings
        // without relaunching the app. `AXIsProcessTrusted` never prompts, so this can't spam
        // the system permission dialog — an unauthorized message is just silently dropped
        // (build plan §21).
        guard Self.isAuthorized() else { return }
        switch type {
        case "mouse.move": moveMouse(payload)
        case "mouse.down": mouseButton(payload, type: .leftMouseDown)
        case "mouse.up": mouseButton(payload, type: .leftMouseUp)
        case "mouse.click": click(payload)
        case "mouse.rightClick": rightClick(payload)
        case "mouse.doubleClick": click(payload, clickCount: 2)
        case "mouse.scroll": scroll(payload)
        case "keyboard.key": keyEvent(payload)
        case "keyboard.text": textEvent(payload)
        case "keyboard.modifier": modifierEvent(payload)
        default: break
        }
    }

    // MARK: - Mouse

    private func point(from payload: [String: Any]) -> CGPoint? {
        guard let x = payload["x"] as? Double, let y = payload["y"] as? Double else { return nil }
        let bounds = CGDisplayBounds(CGMainDisplayID())
        return CGPoint(x: bounds.minX + x * bounds.width, y: bounds.minY + y * bounds.height)
    }

    private func moveMouse(_ payload: [String: Any]) {
        guard let point = point(from: payload) else { return }
        let event = CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)
        event?.flags = modifierFlags
        post(event)
    }

    private func mouseButton(_ payload: [String: Any], type: CGEventType) {
        guard let point = point(from: payload) else { return }
        let event = CGEvent(mouseEventSource: eventSource, mouseType: type, mouseCursorPosition: point, mouseButton: .left)
        event?.flags = modifierFlags
        post(event)
    }

    private func click(_ payload: [String: Any], clickCount: Int64 = 1) {
        guard let point = point(from: payload) else { return }
        let down = CGEvent(mouseEventSource: eventSource, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)
        down?.flags = modifierFlags
        down?.setIntegerValueField(.mouseEventClickState, value: clickCount)
        let up = CGEvent(mouseEventSource: eventSource, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
        up?.flags = modifierFlags
        up?.setIntegerValueField(.mouseEventClickState, value: clickCount)
        post(down)
        post(up)
    }

    private func rightClick(_ payload: [String: Any]) {
        guard let point = point(from: payload) else { return }
        let down = CGEvent(mouseEventSource: eventSource, mouseType: .rightMouseDown, mouseCursorPosition: point, mouseButton: .right)
        down?.flags = modifierFlags
        let up = CGEvent(mouseEventSource: eventSource, mouseType: .rightMouseUp, mouseCursorPosition: point, mouseButton: .right)
        up?.flags = modifierFlags
        post(down)
        post(up)
    }

    private func scroll(_ payload: [String: Any]) {
        guard let deltaX = payload["deltaX"] as? Double, let deltaY = payload["deltaY"] as? Double else { return }
        // wheel1 is the vertical axis, wheel2 the horizontal one, per CGEvent's convention.
        let event = CGEvent(
            scrollWheelEvent2Source: eventSource,
            units: .pixel,
            wheelCount: 2,
            wheel1: Int32(deltaY),
            wheel2: Int32(deltaX),
            wheel3: 0
        )
        post(event)
    }

    // MARK: - Keyboard

    private func keyEvent(_ payload: [String: Any]) {
        guard
            let key = payload["key"] as? String,
            let down = payload["down"] as? Bool,
            let keyCode = InputInjector.namedKeyCodes[key]
        else { return }
        let event = CGEvent(keyboardEventSource: eventSource, virtualKey: keyCode, keyDown: down)
        event?.flags = modifierFlags
        post(event)
    }

    /// Literal text arrives as Unicode, not a per-character keycode mapping — `virtualKey: 0`
    /// plus `keyboardSetUnicodeString` injects it directly, letters/numbers/symbols alike.
    private func textEvent(_ payload: [String: Any]) {
        guard let text = payload["text"] as? String, !text.isEmpty else { return }
        let utf16 = Array(text.utf16)
        let down = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: true)
        down?.flags = modifierFlags
        down?.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: utf16)
        let up = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: false)
        up?.flags = modifierFlags
        up?.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: utf16)
        post(down)
        post(up)
    }

    private func modifierEvent(_ payload: [String: Any]) {
        guard
            let modifier = payload["modifier"] as? String,
            let down = payload["down"] as? Bool,
            let flag = InputInjector.namedModifierFlags[modifier]
        else { return }
        if down {
            modifierFlags.insert(flag)
        } else {
            modifierFlags.remove(flag)
        }
    }

    private func post(_ event: CGEvent?) {
        event?.post(tap: .cghidEventTap)
    }

    private static let namedModifierFlags: [String: CGEventFlags] = [
        "shift": .maskShift,
        "control": .maskControl,
        "option": .maskAlternate,
        "command": .maskCommand,
    ]

    /// Standard ANSI-US virtual keycodes for the named keys the iPhone sends (build plan §20).
    /// Plain letters/numbers/symbols arrive via `keyboard.text` instead, so they aren't here.
    private static let namedKeyCodes: [String: CGKeyCode] = [
        "Escape": 0x35,
        "Tab": 0x30,
        "Enter": 0x24,
        "Backspace": 0x33,
        "Delete": 0x75,
        "ArrowUp": 0x7E,
        "ArrowDown": 0x7D,
        "ArrowLeft": 0x7B,
        "ArrowRight": 0x7C,
        "Home": 0x73,
        "End": 0x77,
        "PageUp": 0x74,
        "PageDown": 0x79,
    ]
}
