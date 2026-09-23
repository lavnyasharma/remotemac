import ScreenCaptureKit
import CoreMedia
import CoreVideo

enum ScreenCaptureError: Error, LocalizedError {
    case permissionDenied
    case noDisplay

    var errorDescription: String? {
        switch self {
        case .permissionDenied: return "Screen Recording permission has not been granted."
        case .noDisplay: return "No capturable display was found."
        }
    }
}

/// Wraps a single `SCStream` capturing the primary display (build plan §18). `start()` checks
/// permission and throws immediately rather than looping or silently retrying — prompting the
/// system dialog is a separate, deliberate action (`requestPermission()`, wired from Settings),
/// never something this class does on its own.
final class ScreenCaptureManager: NSObject, @unchecked Sendable {
    var onFrame: ((CMSampleBuffer) -> Void)?
    /// Fires when the stream stops on its own (e.g. the display sleeps or capture is denied
    /// mid-stream). `nil` error means `stop()` was called deliberately.
    var onStopped: ((Error?) -> Void)?

    private var stream: SCStream?
    private let sampleQueue = DispatchQueue(label: "app.remotemac.screencapture")

    /// The exact pixel dimensions passed to `SCStreamConfiguration` in `start()` — the iPhone
    /// needs these (not just an assumption that video fills its display box) to map a tap
    /// through `RTCView`'s `objectFit="contain"` letterboxing onto the right screen point.
    private(set) var capturedSize: (width: Int, height: Int)?

    static func hasPermission() -> Bool {
        CGPreflightScreenCaptureAccess()
    }

    /// Prompts the system Screen Recording dialog. Only call this from a deliberate user
    /// action (Settings' "Check Again" / enable flow) — never from `start()`.
    @discardableResult
    static func requestPermission() -> Bool {
        CGRequestScreenCaptureAccess()
    }

    func start() async throws {
        guard Self.hasPermission() else { throw ScreenCaptureError.permissionDenied }

        let content = try await SCShareableContent.current
        // `InputInjector` converts every click's normalized [0,1] coordinate against
        // `CGDisplayBounds(CGMainDisplayID())` — capturing anything other than that same
        // display would make the video the iPhone sees and the screen clicks actually land on
        // two different monitors on a multi-display Mac. `displays.first` isn't guaranteed to
        // be the main display (ScreenCaptureKit orders it by attachment, not "primary-ness"),
        // so the main display is looked up explicitly and only falls back to `.first` if it's
        // somehow absent from the shareable-content list.
        let mainDisplayID = CGMainDisplayID()
        guard let display = content.displays.first(where: { $0.displayID == mainDisplayID }) ?? content.displays.first else {
            throw ScreenCaptureError.noDisplay
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        // Downscale very high-res displays — a first working version doesn't need native
        // resolution, and this keeps the encoder/bandwidth load reasonable (build plan §18).
        let scale = min(1.0, 1920.0 / Double(display.width))
        config.width = max(2, Int(Double(display.width) * scale))
        config.height = max(2, Int(Double(display.height) * scale))
        capturedSize = (width: config.width, height: config.height)
        config.minimumFrameInterval = CMTime(value: 1, timescale: 20) // ~20fps
        // NV12 (bi-planar YCbCr), not BGRA: `pushVideoSampleBuffer` hands this buffer straight
        // to `RTCCVPixelBuffer` for VideoToolbox's H264 hardware encoder, which is built around
        // ingesting NV12 directly. Capturing BGRA instead would force a CPU-side color
        // conversion (ARGB -> NV12) on every single frame before the encoder could touch it —
        // a steady, avoidable CPU/battery/latency tax at 20fps.
        config.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
        config.showsCursor = true
        // A deep queue buffers frames rather than dropping them under backpressure (e.g. a
        // brief CPU spike or a slow encode callback), silently accumulating latency instead of
        // always presenting the newest frame. Shallow so a stall drops stale frames immediately.
        config.queueDepth = 2

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleQueue)
        try await stream.startCapture()
        self.stream = stream
    }

    func stop() async {
        guard let stream else { return }
        self.stream = nil
        try? await stream.stopCapture()
    }
}

extension ScreenCaptureManager: SCStreamOutput {
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid else { return }
        onFrame?(sampleBuffer)
    }
}

extension ScreenCaptureManager: SCStreamDelegate {
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        self.stream = nil
        onStopped?(error)
    }
}
