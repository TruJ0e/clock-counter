import Foundation
import ActivityKit

/// Pure timer payload sent by the bundled, offline web clock.
struct MobileClockSnapshot: Codable, Equatable {
    let id: String
    let name: String
    let mode: String
    let color: String
    let running: Bool
    let scheduledStartMs: Double?
    let deadlineMs: Double?
    let remainingMs: Double
    let elapsedMs: Double
    let durationMs: Double
    let ended: Bool

    var start: Date? {
        guard let ms = scheduledStartMs, ms > 0 else { return nil }
        return Date(timeIntervalSince1970: ms / 1000)
    }

    var deadline: Date? {
        if let ms = deadlineMs, ms > 0 {
            return Date(timeIntervalSince1970: ms / 1000)
        }
        if let start = start { return start.addingTimeInterval(durationMs / 1000) }
        return nil
    }

    var isEligibleForLiveActivity: Bool {
        running && deadline != nil && mode != "stopwatch"
    }
}

struct TruTimeClockAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var title: String
        var deadline: Date
        var isRunning: Bool
        var remainingSeconds: Int
    }

    let clockID: String
}
