import UIKit
import WebKit

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate, UIPencilInteractionDelegate {
    static let shared = WebViewController()

    private var webView: WKWebView!
    private var loaded = false
    private var waiting: [URL] = []                 // files handed over before the page was up
    private var saving: [WKDownload: URL] = [:]
    private var theme: NSKeyValueObservation?
    private var dark = false { didSet { if dark != oldValue { setNeedsStatusBarAppearanceUpdate() } } }

    override var preferredStatusBarStyle: UIStatusBarStyle { dark ? .lightContent : .darkContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AppFiles(), forURLScheme: AppFiles.scheme)
        config.userContentController.add(self, name: "btl")        // (the page knows it is in the app by this being there)
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never     // (the page sees the safe areas itself)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif

        // under the status bar (and, in a window, under the window's buttons), down to the very bottom and both sides
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        let top: NSLayoutYAxisAnchor
        if #available(iOS 26.0, *) { top = view.layoutGuide(for: .safeArea(cornerAdaptation: .vertical)).topAnchor } else { top = view.safeAreaLayoutGuide.topAnchor }
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: top), webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor), webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)])

        // the strip behind the status bar takes the page's own colour, light or dark as chosen in the app
        theme = webView.observe(\.themeColor, options: [.initial, .new]) { [weak self] web, _ in
            guard let self, let c = web.themeColor else { return }
            self.view.backgroundColor = c
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            if c.getRed(&r, green: &g, blue: &b, alpha: &a) { self.dark = 0.299 * r + 0.587 * g + 0.114 * b < 0.5 }
        }

        let pencil: UIPencilInteraction
        if #available(iOS 17.5, *) { pencil = UIPencilInteraction(delegate: self) } else { pencil = UIPencilInteraction(); pencil.delegate = self }
        webView.addInteraction(pencil)

        webView.load(URLRequest(url: AppFiles.home))
    }

    // MARK: files handed over (Files app, Share, "Open in")

    func open(fileAt file: URL) {
        guard loaded else { waiting.append(file); return }
        let scoped = file.startAccessingSecurityScopedResource()
        let held = AppFiles.hold(file)
        if scoped { file.stopAccessingSecurityScopedResource() }
        guard let held else { return }
        webView.callAsyncJavaScript("await btlApp.open(url, name, type); return true",
                                    arguments: ["url": held.url.absoluteString, "name": file.lastPathComponent, "type": AppFiles.mimeType(file.pathExtension)],
                                    in: nil, in: .page) { _ in try? FileManager.default.removeItem(at: held.folder) }
    }

    // MARK: the page

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !loaded else { return }
        loaded = true
        for f in waiting { open(fileAt: f) }
        waiting = []
        #if DEBUG
        selfTest()
        #endif
    }

    // iPadOS can stop a page that uses a lot of memory (a long PDF): it comes back as it was last saved
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { loaded = false; webView.load(URLRequest(url: AppFiles.home)) }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload { return decisionHandler(.download) }
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { return decisionHandler(.cancel) }
        if [AppFiles.scheme, "about", "blob", "data"].contains(scheme) || action.targetFrame?.isMainFrame == false { return decisionHandler(.allow) }
        if ["http", "https", "mailto", "tel"].contains(scheme) { UIApplication.shared.open(url) }       // a link out of the notes opens in Safari (or Mail)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    // a link that asks for a new tab
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, ["http", "https", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "") { UIApplication.shared.open(url) }
        return nil
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {}

    // MARK: Download: the file goes to the Share sheet (Save to Files, AirDrop, Print, another app)

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("saving-" + UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent(suggestedFilename.isEmpty ? "Notebook" : suggestedFilename)
        saving[download] = file
        completionHandler(file)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = saving.removeValue(forKey: download) else { return }
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "btlAutoSave") {
            let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? -1
            return note("btl-saved.txt", "\(file.lastPathComponent) \(size ?? -1)")
        }
        #endif
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.safeAreaInsets.top + 60, width: 1, height: 1)
        sheet.popoverPresentationController?.permittedArrowDirections = [.up]
        present(sheet, animated: true)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let file = saving.removeValue(forKey: download) { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        webView.evaluateJavaScript("typeof toast === 'function' && toast(\"That file couldn't be saved. Try again.\")")
    }

    // MARK: Apple Pencil: double tap and squeeze do what is chosen in Settings > Apple Pencil

    private func pencil(_ action: UIPencilPreferredAction) {
        let act: String
        switch action {
        case .ignore: return
        case .switchEraser: act = "eraser"
        case .switchPrevious: act = "previous"
        case .showColorPalette, .showInkAttributes: act = "palette"
        default:
            if #available(iOS 17.5, *), action == .showContextualPalette { act = "palette" } else { return }      // (a shortcut is run by the iPad itself)
        }
        webView.evaluateJavaScript("window.btlApp && btlApp.pencil('\(act)')")
    }

    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) { pencil(UIPencilInteraction.preferredTapAction) }

    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) { pencil(UIPencilInteraction.preferredTapAction) }

    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        if squeeze.phase == .ended { pencil(UIPencilInteraction.preferredSqueezeAction) }
    }

    // MARK: checks run from the Mac against the simulator (debug builds only)

    #if DEBUG
    private func note(_ name: String, _ text: String) {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try? text.write(to: docs.appendingPathComponent(name), atomically: true, encoding: .utf8)
    }

    /// `-btlOpen <file>` hands the page a file as the Files app would; `-btlRunJS <file>` runs a script in the page and
    /// writes what it returns to Documents/btl-result.txt; `-btlAutoSave YES` writes a download's name and size instead of showing Share;
    /// `-btlPencil <action>` does what a double tap of the Pencil set to that action would.
    private func selfTest() {
        let d = UserDefaults.standard
        if let p = d.string(forKey: "btlOpen") { open(fileAt: URL(fileURLWithPath: p)) }
        if let a = d.string(forKey: "btlPencil") {
            let actions: [String: UIPencilPreferredAction] = ["eraser": .switchEraser, "previous": .switchPrevious, "palette": .showColorPalette, "ignore": .ignore]
            if let action = actions[a] { pencil(action) }
        }
        if let p = d.string(forKey: "btlRunJS"), let js = try? String(contentsOfFile: p, encoding: .utf8) {
            webView.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { [weak self] result in
                switch result {
                case .success(let v): self?.note("btl-result.txt", "\(v)")
                case .failure(let e): self?.note("btl-result.txt", "ERROR \(e)")
                }
            }
        }
    }
    #endif
}
