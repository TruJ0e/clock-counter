import SwiftUI
import WebKit

struct ClockWebView: UIViewRepresentable {
    @ObservedObject var controller: MobileTimerController

    func makeCoordinator() -> Coordinator {
        Coordinator(controller: controller)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let content = WKUserContentController()
        content.add(context.coordinator, name: "clock")
        config.userContentController = content
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsBackForwardNavigationGestures = false
        web.isInspectable = false

        if let file = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") {
            web.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent())
        } else {
            // A missing resource is a build/configuration error, not a reason to
            // load arbitrary remote content or a remote-control endpoint.
            web.loadHTMLString(
                "<html><body style='background:black;color:white'>Bundled clock files missing</body></html>",
                baseURL: nil
            )
        }
        return web
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        private let controller: MobileTimerController

        init(controller: MobileTimerController) { self.controller = controller }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "clock",
                  let json = message.body as? [String: Any],
                  JSONSerialization.isValidJSONObject(json),
                  let bytes = try? JSONSerialization.data(withJSONObject: json),
                  let snapshot = try? JSONDecoder().decode(MobileClockSnapshot.self, from: bytes)
            else { return }
            Task { @MainActor in self.controller.receive(snapshot) }
        }

        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel); return
            }
            if url.isFileURL {
                decisionHandler(.allow); return
            }
            if navigationAction.navigationType == .linkActivated,
               url.scheme == "https" {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }
}
