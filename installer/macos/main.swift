import AppKit

final class CompanionDelegate: NSObject, NSApplicationDelegate {
    let setup = NativeSetup()
    var receivedURL = false
    var selected: URL?
    var progress: NSWindow?

    func application(_ application: NSApplication, open urls: [URL]) {
        receivedURL = true
        guard let url = urls.first, url.scheme == "queue-companion", ["start", "repair"].contains(url.host ?? ""),
              url.query == nil, url.fragment == nil else { NSApp.terminate(nil); return }
        if url.host == "repair" {
            NSWorkspace.shared.open(setup.setup); NSApp.terminate(nil)
        } else {
            do { try setup.startHelper() } catch { showError(error) }
            NSApp.terminate(nil)
        }
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        if Bundle.main.bundleIdentifier == "org.queuecompanion.setup" { menu(); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if self.receivedURL { return }
            do { try self.setup.startHelper() } catch { self.showError(error) }
            NSApp.terminate(nil)
        }
    }
    func showError(_ error: Error) {
        let alert = NSAlert(); alert.messageText = "Queue Companion setup could not finish"
        alert.informativeText = error.localizedDescription; alert.alertStyle = .warning
        alert.runModal()
    }
    func menu() {
        NSApp.setActivationPolicy(.regular); NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert(); alert.messageText = "Queue Companion"
        alert.informativeText = "Install the Queue Companion search bar inside Spotify’s Queue. Spotify will restart during installation or restore. Connect ChatGPT or Claude API in the bar’s settings.\n\nmacOS preview: appending songs is available. Queue replacement awaits Mac verification."
        for label in ["Install / Repair", "Choose Spotify…", "Restore Spotify", "Uninstall", "Cancel"] { alert.addButton(withTitle: label) }
        switch alert.runModal() {
        case .alertFirstButtonReturn: execute("Installing Queue Companion…") { try self.setup.install(self.selected); return "Installed. Open Spotify’s Queue or click the queue icon beside Search. Connect Claude API or ChatGPT using the gear." }
        case .alertSecondButtonReturn:
            let panel = NSOpenPanel(); panel.canChooseFiles = true; panel.canChooseDirectories = false
            panel.allowsMultipleSelection = false; panel.message = "Choose the installed Spotify.app"
            panel.directoryURL = URL(fileURLWithPath: "/Applications")
            if panel.runModal() == .OK { selected = panel.url }; menu()
        case .alertThirdButtonReturn: execute("Restoring Spotify…") { try self.setup.restore(); return "Stock Spotify restored. Use Install / Repair to reinstall Queue Companion." }
        case NSApplication.ModalResponse(rawValue: NSApplication.ModalResponse.alertFirstButtonReturn.rawValue + 3):
            let confirm = NSAlert(); confirm.messageText = "Uninstall Queue Companion?"
            confirm.informativeText = "This removes Queue Companion and its saved connections, history and settings. Spotify will restart."
            confirm.addButton(withTitle: "Uninstall"); confirm.addButton(withTitle: "Cancel")
            if confirm.runModal() == .alertFirstButtonReturn {
                execute("Removing Queue Companion…") {
                    let unconfirmed = try self.setup.uninstall()
                    return "Queue Companion was removed." + (unconfirmed ? " Also revoke Queue Companion in ChatGPT settings: network revocation could not be confirmed." : "")
                }
            } else { menu() }
        default: NSApp.terminate(nil)
        }
    }
    func execute(_ label: String, operation: @escaping () throws -> String) {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 410, height: 130), styleMask: [.titled], backing: .buffered, defer: false)
        window.title = "Queue Companion"; window.center()
        let text = NSTextField(labelWithString: label); text.frame = NSRect(x: 25, y: 70, width: 360, height: 25)
        let spinner = NSProgressIndicator(frame: NSRect(x: 25, y: 35, width: 360, height: 20)); spinner.style = .bar
        spinner.isIndeterminate = true; spinner.startAnimation(nil)
        window.contentView?.addSubview(text); window.contentView?.addSubview(spinner)
        progress = window; window.makeKeyAndOrderFront(nil)
        DispatchQueue.global(qos: .userInitiated).async {
            let result = Result { try operation() }
            DispatchQueue.main.async {
                self.progress?.close(); self.progress = nil
                switch result {
                case .success(let message):
                    let alert = NSAlert(); alert.messageText = "Queue Companion"; alert.informativeText = message; alert.runModal(); NSApp.terminate(nil)
                case .failure(let error): self.showError(error); self.menu()
                }
            }
        }
    }
}

if CommandLine.arguments.contains("--self-test") {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let child = root.appendingPathComponent("safe/file")
    precondition(NativeSetup.inside(child, root))
    precondition(!NativeSetup.inside(root, root))
    precondition(!NativeSetup.inside(root.appendingPathComponent("../escape"), root))
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("link"), withDestinationURL: URL(fileURLWithPath: "/tmp"))
    precondition(!NativeSetup.inside(root.appendingPathComponent("link/foreign"), root))
    let native = NativeSetup()
    let fake = root.appendingPathComponent("Spotify.app")
    try FileManager.default.createDirectory(at: fake.appendingPathComponent("Contents"), withIntermediateDirectories: true)
    precondition(!native.validSpotify(fake))
    try native.write(Data("private".utf8), to: root.appendingPathComponent("private.json"), privateFile: true)
    let mode = try FileManager.default.attributesOfItem(atPath: root.appendingPathComponent("private.json").path)[.posixPermissions] as! Int
    precondition(mode == 0o600)
    print("6 native macOS installer checks passed")
    exit(0)
}
let application = NSApplication.shared
let delegate = CompanionDelegate()
application.delegate = delegate
application.run()
