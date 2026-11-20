import WidgetKit
import SwiftUI
import ActivityKit

@main
struct TruTimeClockWidgetBundle: WidgetBundle {
    var body: some Widget {
        TruTimeClockLiveActivity()
    }
}

struct TruTimeClockLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TruTimeClockAttributes.self) { context in
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("TRUTIMECLOCK")
                        .font(.caption2.bold())
                        .foregroundColor(.red)
                    Text(context.state.title)
                        .font(.caption)
                        .lineLimit(1)
                }
                Spacer()
                Text(timerInterval: Date()...max(Date().addingTimeInterval(1),
                      context.state.deadline), countsDown: true, showsHours: true)
                    .monospacedDigit()
                    .font(.system(.title2, design: .monospaced))
            }
            .padding(12)
            .activityBackgroundTint(.black)
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("TRUTIMECLOCK").font(.caption2.bold()).foregroundStyle(.red)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: Date()...max(Date().addingTimeInterval(1),
                         context.state.deadline), countsDown: true)
                        .monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("OPEN TRUTIMECLOCK TO MANAGE").font(.caption2)
                }
            } compactLeading: {
                Image(systemName: "timer").foregroundStyle(.red)
            } compactTrailing: {
                Text(timerInterval: Date()...max(Date().addingTimeInterval(1),
                     context.state.deadline), countsDown: true)
                    .monospacedDigit()
                    .font(.caption2)
            } minimal: {
                Image(systemName: "timer").foregroundStyle(.red)
            }
            .keylineTint(.red)
        }
    }
}
