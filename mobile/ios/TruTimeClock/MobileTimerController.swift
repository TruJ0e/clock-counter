import Foundation
import Combine
import ActivityKit
import UserNotifications

@MainActor
final class MobileTimerController: ObservableObject {
    @Published var currentClock: MobileClockSnapshot?
    @Published var liveEnabled = false
    @Published var status = "Open a timer, then enable Live Activity"

    private var activity: Activity<TruTimeClockAttributes>?
    private var lastStateKey = ""

    func receive(_ snapshot: MobileClockSnapshot) {
        currentClock = snapshot
        guard liveEnabled else { return }
        guard snapshot.isEligibleForLiveActivity else {
            if !snapshot.running { Task { await stopLiveActivity() } }
            return
        }
        let key = "\(snapshot.id)|\(snapshot.deadlineMs ?? 0)|\(snapshot.running)|\(snapshot.name)"
        guard lastStateKey != key else { return }
        lastStateKey = key
        Task { await showLiveActivity(snapshot) }
    }

    func toggleLiveActivity() async {
        if liveEnabled {
            await stopLiveActivity()
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            status = "Enable Live Activities in iPhone Settings"
            return
        }
        guard let snapshot = currentClock, snapshot.isEligibleForLiveActivity else {
            status = "Start a countdown in the clock first"
            return
        }
        liveEnabled = true
        lastStateKey = ""
        await showLiveActivity(snapshot)
    }

    private func showLiveActivity(_ snapshot: MobileClockSnapshot) async {
        guard let deadline = snapshot.deadline else { return }
        let content = TruTimeClockAttributes.ContentState(
            title: String(snapshot.name.prefix(36)),
            deadline: deadline,
            isRunning: true,
            remainingSeconds: max(0, Int(snapshot.remainingMs / 1000))
        )
        do {
            if let previous = activity, previous.attributes.clockID != snapshot.id {
                await previous.end(nil, dismissalPolicy: .immediate)
                activity = nil
            }
            if let existing = activity {
                await existing.update(ActivityContent(state: content, staleDate: deadline))
            } else {
                activity = try Activity.request(
                    attributes: TruTimeClockAttributes(clockID: snapshot.id),
                    content: ActivityContent(state: content, staleDate: deadline),
                    pushType: nil
                )
            }
            status = "Live countdown visible on Lock Screen / Dynamic Island"
            await scheduleCompletionNotification(snapshot)
        } catch {
            liveEnabled = false
            status = "Live Activity couldn't start: \(error.localizedDescription)"
        }
    }

    private func scheduleCompletionNotification(_ snapshot: MobileClockSnapshot) async {
        guard let deadline = snapshot.deadline else { return }
        let identifier = "trutimeclock.\(snapshot.id)"
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        let seconds = deadline.timeIntervalSinceNow
        guard seconds > 1 && seconds < 48 * 3600 else { return }
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        guard granted else { return }
        let contents = UNMutableNotificationContent()
        contents.title = snapshot.name
        contents.body = "Time is up"
        contents.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        try? await center.add(UNNotificationRequest(
            identifier: identifier, content: contents, trigger: trigger
        ))
    }

    func stopLiveActivity() async {
        liveEnabled = false
        lastStateKey = ""
        if let snapshot = currentClock {
            UNUserNotificationCenter.current().removePendingNotificationRequests(
                withIdentifiers: ["trutimeclock.\(snapshot.id)"]
            )
        }
        if let existing = activity {
            await existing.end(nil, dismissalPolicy: .immediate)
            activity = nil
        }
        status = "Live Activity disabled"
    }
}
