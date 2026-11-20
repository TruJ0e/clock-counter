import SwiftUI

@main
struct TruTimeClockMobileApp: App {
    var body: some Scene {
        WindowGroup { ClockRootView() }
    }
}

struct ClockRootView: View {
    @StateObject private var controller = MobileTimerController()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("TRUTIMECLOCK")
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundStyle(.white)
                    Text(controller.status)
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.gray)
                        .lineLimit(2)
                }
                Spacer(minLength: 6)
                Button {
                    Task { await controller.toggleLiveActivity() }
                } label: {
                    Text(controller.liveEnabled ? "STOP LIVE" : "SHOW LIVE")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 10)
                        .foregroundStyle(.white)
                        .overlay(Rectangle().stroke(.green, lineWidth: 1))
                }
                .accessibilityLabel(controller.liveEnabled ? "Stop Live Activity" : "Show timer in Dynamic Island")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.black)

            ClockWebView(controller: controller)
                .background(Color.black)
        }
        .background(Color.black)
        .preferredColorScheme(.dark)
    }
}
