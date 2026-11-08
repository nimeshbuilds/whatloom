import AppKit
import WebKit
import Foundation
import Darwin

private let localURL = URL(string: "http://127.0.0.1:4310")!

private final class LocalServer {
    private var process: Process?
    private var stopping = false
    private var startupFinished = false
    private var stopCompletion: (() -> Void)?
    var onReady: (() -> Void)?
    var onFailure: ((String) -> Void)?

    private func probe(_ completion: @escaping (Bool, Bool) -> Void) {
        var request = URLRequest(url: localURL.appendingPathComponent("api/health"))
        request.timeoutInterval = 1.5
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { data, response, error in
            let body = data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
            let healthy = (response as? HTTPURLResponse)?.statusCode == 200 && body?["app"] as? String == "whatloom"
            let occupied = response != nil || (error as? URLError)?.code == .timedOut
            DispatchQueue.main.async { completion(healthy, occupied) }
        }.resume()
    }

    func start() {
        stopping = false
        startupFinished = false
        probe { [weak self] healthy, occupied in
            guard let self = self, !self.stopping else { return }
            if healthy { self.finishStartup(); return }
            if self.process?.isRunning == true {
                self.waitForServer(until: Date().addingTimeInterval(45)); return
            }
            if occupied {
                self.fail("Another application is using port 4310. Close that application, then try again.")
                return
            }
            self.launchBundledServer()
        }
    }

    private func launchBundledServer() {
        guard let resources = Bundle.main.resourceURL else {
            fail("Whatloom’s bundled resources are missing. Download a fresh copy of the app."); return
        }
        let runtime = resources.appendingPathComponent("runtime/node")
        let server = resources.appendingPathComponent("server/server.js")
        guard FileManager.default.isExecutableFile(atPath: runtime.path),
              FileManager.default.fileExists(atPath: server.path) else {
            fail("Whatloom’s local runtime is incomplete. Download a fresh copy of the app."); return
        }
        let child = Process()
        child.executableURL = runtime
        child.arguments = [server.path]
        child.currentDirectoryURL = server.deletingLastPathComponent()
        var environment = ProcessInfo.processInfo.environment
        let userHome = NSHomeDirectory()
        let extraPaths = [resources.appendingPathComponent("runtime").path,
                          "\(userHome)/.local/bin", "\(userHome)/.npm-global/bin", "\(userHome)/.volta/bin",
                          "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
        environment["PATH"] = extraPaths.joined(separator: ":") + ":" + (environment["PATH"] ?? "")
        environment["HOSTNAME"] = "127.0.0.1"
        environment["PORT"] = "4310"
        environment["NODE_ENV"] = "production"
        environment["NEXT_TELEMETRY_DISABLED"] = "1"
        child.environment = environment
        // The desktop app does not persist prompts, model responses, or server logs.
        child.standardOutput = FileHandle.nullDevice
        child.standardError = FileHandle.nullDevice
        child.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.process = nil
                if self.stopping {
                    self.stopCompletion?()
                    self.stopCompletion = nil
                } else {
                    self.fail("The local Whatloom server stopped. Choose Try Again to restart it.")
                }
            }
        }
        process = child
        do {
            try child.run()
            waitForServer(until: Date().addingTimeInterval(45))
        } catch {
            process = nil
            fail("Whatloom could not start its bundled runtime. Move the app to Applications and try again, or download a fresh copy.")
        }
    }

    private func waitForServer(until deadline: Date) {
        guard !stopping, !startupFinished else { return }
        probe { [weak self] healthy, _ in
            guard let self = self, !self.stopping, !self.startupFinished else { return }
            if healthy { self.finishStartup(); return }
            if Date() > deadline {
                self.fail("The local server is taking longer than expected. Choose Try Again to check it again.")
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in self?.waitForServer(until: deadline) }
        }
    }

    private func finishStartup() {
        startupFinished = true
        onReady?()
    }

    private func fail(_ message: String) {
        startupFinished = true
        onFailure?(message)
    }

    func stop(_ completion: @escaping () -> Void) {
        stopping = true
        startupFinished = true
        guard let child = process, child.isRunning else { completion(); return }
        stopCompletion = completion
        child.terminate()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self, weak child] in
            if let child = child, child.isRunning { kill(child.processIdentifier, SIGKILL) }
            if let finish = self?.stopCompletion {
                self?.stopCompletion = nil
                finish()
            }
        }
    }
}

private final class WhatloomDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private let server = LocalServer()
    private var overlay: NSView!
    private var statusLabel: NSTextField!
    private var spinner: NSProgressIndicator!
    private var retryButton: NSButton!
    private var isClosing = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMenus()
        createWindow()
        server.onReady = { [weak self] in self?.webView.load(URLRequest(url: localURL)) }
        server.onFailure = { [weak self] message in self?.showError(message) }
        server.start()
        NSApp.activate(ignoringOtherApps: true)
    }

    private func createWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.translatesAutoresizingMaskIntoConstraints = false
        if #available(macOS 13.3, *) { webView.isInspectable = false }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1360, height: 900),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Whatloom"
        window.minSize = NSSize(width: 900, height: 650)
        window.backgroundColor = NSColor(calibratedRed: 0.97, green: 0.97, blue: 0.94, alpha: 1)
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.center()
        let content = NSView()
        window.contentView = content
        content.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: content.leadingAnchor), webView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            webView.topAnchor.constraint(equalTo: content.topAnchor), webView.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])

        overlay = NSView()
        overlay.wantsLayer = true
        overlay.layer?.backgroundColor = window.backgroundColor.cgColor
        overlay.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(overlay)
        NSLayoutConstraint.activate([
            overlay.leadingAnchor.constraint(equalTo: content.leadingAnchor), overlay.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            overlay.topAnchor.constraint(equalTo: content.topAnchor), overlay.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])
        let heading = NSTextField(labelWithString: "Whatloom")
        heading.font = NSFont(name: "Georgia", size: 42) ?? .systemFont(ofSize: 42)
        heading.alignment = .center
        heading.textColor = NSColor(calibratedRed: 0.16, green: 0.19, blue: 0.15, alpha: 1)
        statusLabel = NSTextField(wrappingLabelWithString: "Opening your invention studio…")
        statusLabel.font = .systemFont(ofSize: 15)
        statusLabel.alignment = .center
        statusLabel.textColor = NSColor(calibratedRed: 0.35, green: 0.38, blue: 0.33, alpha: 1)
        spinner = NSProgressIndicator()
        spinner.style = .spinning
        spinner.controlSize = .regular
        spinner.startAnimation(nil)
        retryButton = NSButton(title: "Try Again", target: self, action: #selector(retry))
        retryButton.bezelStyle = .rounded
        retryButton.isHidden = true
        let stack = NSStackView(views: [heading, statusLabel, spinner, retryButton])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 20
        stack.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: overlay.centerXAnchor), stack.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
            statusLabel.widthAnchor.constraint(equalToConstant: 440),
        ])
        window.makeKeyAndOrderFront(nil)
    }

    private func installMenus() {
        let menu = NSMenu()
        let app = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Whatloom", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Hide Whatloom", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit Whatloom", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        app.submenu = appMenu
        menu.addItem(app)
        let edit = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        for (title, selector, key) in [("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            editMenu.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key)
        }
        edit.submenu = editMenu
        menu.addItem(edit)
        let view = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Reload Studio", action: #selector(reload), keyEquivalent: "r").target = self
        viewMenu.addItem(withTitle: "Open in Browser", action: #selector(openInBrowser), keyEquivalent: "").target = self
        view.submenu = viewMenu
        menu.addItem(view)
        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.zoom(_:)), keyEquivalent: "")
        windowItem.submenu = windowMenu
        menu.addItem(windowItem)
        NSApp.mainMenu = menu
        NSApp.windowsMenu = windowMenu
    }

    @objc private func retry() {
        overlay.isHidden = false
        statusLabel.stringValue = "Opening your invention studio…"
        retryButton.isHidden = true
        spinner.isHidden = false
        spinner.startAnimation(nil)
        server.start()
    }

    @objc private func reload() { webView.reload() }
    @objc private func openInBrowser() { NSWorkspace.shared.open(localURL) }

    private func showError(_ message: String) {
        guard !isClosing else { return }
        overlay.isHidden = false
        statusLabel.stringValue = message
        spinner.stopAnimation(nil)
        spinner.isHidden = true
        retryButton.isHidden = false
    }

    private func isLocalPage(_ url: URL) -> Bool {
        return url.scheme == "http" && url.host == "127.0.0.1" && url.port == 4310
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if navigationAction.shouldPerformDownload { decisionHandler(.download); return }
        if isLocalPage(url) || url.scheme == "blob" || url.absoluteString == "about:blank" { decisionHandler(.allow); return }
        if navigationAction.navigationType == .linkActivated && ["http", "https"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        overlay.isHidden = true
        spinner.stopAnimation(nil)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showError("The studio could not load. Choose Try Again to reconnect to the local server.") }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showError("The studio connection was interrupted. Choose Try Again to reconnect.") }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = (suggestedFilename as NSString).lastPathComponent
        panel.canCreateDirectories = true
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.url : nil) }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        let alert = NSAlert()
        alert.messageText = "The export could not be saved."
        alert.informativeText = "Try exporting again and choose a writable location."
        alert.beginSheetModal(for: window)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "Continue")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { result in completionHandler(result == .alertFirstButtonReturn) }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window.makeKeyAndOrderFront(nil) }
        return true
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if isClosing { return .terminateNow }
        isClosing = true
        server.stop { DispatchQueue.main.async { NSApp.reply(toApplicationShouldTerminate: true) } }
        return .terminateLater
    }
}

let application = NSApplication.shared
private let delegate = WhatloomDelegate()
application.setActivationPolicy(.regular)
application.delegate = delegate
application.run()
