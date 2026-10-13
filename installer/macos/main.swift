import AppKit

final class CompanionDelegate: NSObject, NSApplicationDelegate {
    let setup = NativeSetup()
    var receivedURL = false
    var selected: URL?
    var progress: NSWindow?
    let uiTesting = CommandLine.arguments.contains("--ui-self-test")
    var uiCycles = 0

    func alert() -> NSAlert {
        let alert = NSAlert()
        // ARC owns these windows. AppKit's separate release-on-close would
        // release them twice when the main run loop drains its autorelease pool.
        alert.window.isReleasedWhenClosed = false
        return alert
    }

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
        if Bundle.main.bundleIdentifier == "org.queuecompanion.setup" || uiTesting {
            DispatchQueue.main.async { self.menu() }; return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if self.receivedURL { return }
            do { try self.setup.startHelper() } catch { self.showError(error) }
            NSApp.terminate(nil)
        }
    }
    func showError(_ error: Error) {
        let alert = alert(); alert.messageText = "Queue Companion setup could not finish"
        alert.informativeText = error.localizedDescription; alert.alertStyle = .warning
        alert.runModal()
    }
    func menu() {
        NSApp.setActivationPolicy(.regular); NSApp.activate(ignoringOtherApps: true)
        let alert = alert(); alert.messageText = "Queue Companion"
        alert.informativeText = "Install the Queue Companion search bar inside Spotify’s Queue. Spotify will restart during installation or restore. Connect ChatGPT or Claude API in the bar’s settings.\n\nmacOS preview: appending songs is available. Queue replacement awaits Mac verification."
        for label in ["Install / Repair", "Choose Spotify…", "Restore Spotify", "Uninstall", "Cancel"] { alert.addButton(withTitle: label) }
        if uiTesting {
            // Exercise real modal-to-progress transitions, without touching Spotify.
            let response = uiCycles == 1 ? NSApplication.ModalResponse.alertThirdButtonReturn :
                NSApplication.ModalResponse(rawValue: NSApplication.ModalResponse.alertFirstButtonReturn.rawValue + (uiCycles == 2 ? 3 : 0))
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { NSApp.stopModal(withCode: response); alert.window.orderOut(nil) }
        }
        switch alert.runModal() {
        case .alertFirstButtonReturn:
            DispatchQueue.main.async { self.execute("Installing Queue Companion…") {
                if self.uiTesting { Thread.sleep(forTimeInterval: 0.15); return "Installation UI test" }
                try self.setup.install(self.selected); return "Installed. Open Spotify’s Queue or click the queue icon beside Search. Connect Claude API or ChatGPT using the gear."
            } }
        case .alertSecondButtonReturn:
            let panel = NSOpenPanel(); panel.canChooseFiles = true; panel.canChooseDirectories = false
            panel.isReleasedWhenClosed = false
            panel.allowsMultipleSelection = false; panel.message = "Choose the installed Spotify.app"
            panel.directoryURL = URL(fileURLWithPath: "/Applications")
            if panel.runModal() == .OK { selected = panel.url }; DispatchQueue.main.async { self.menu() }
        case .alertThirdButtonReturn:
            DispatchQueue.main.async { self.execute("Restoring Spotify…") {
                if self.uiTesting { Thread.sleep(forTimeInterval: 0.15); return "Restore UI test" }
                try self.setup.restore(); return "Stock Spotify restored. Use Install / Repair to reinstall Queue Companion."
            } }
        case NSApplication.ModalResponse(rawValue: NSApplication.ModalResponse.alertFirstButtonReturn.rawValue + 3):
            let confirm = self.alert(); confirm.messageText = "Uninstall Queue Companion?"
            confirm.informativeText = "This removes Queue Companion and its saved connections, history and settings. Spotify will restart."
            confirm.addButton(withTitle: "Uninstall"); confirm.addButton(withTitle: "Cancel")
            if uiTesting { DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { NSApp.stopModal(withCode: .alertFirstButtonReturn); confirm.window.orderOut(nil) } }
            if confirm.runModal() == .alertFirstButtonReturn {
                execute("Removing Queue Companion…") {
                    if self.uiTesting { Thread.sleep(forTimeInterval: 0.15); return "Uninstall UI test" }
                    let unconfirmed = try self.setup.uninstall()
                    return "Queue Companion was removed." + (unconfirmed ? " Also revoke Queue Companion in ChatGPT settings: network revocation could not be confirmed." : "")
                }
            } else { DispatchQueue.main.async { self.menu() } }
        default: NSApp.terminate(nil)
        }
    }
    func execute(_ label: String, operation: @escaping () throws -> String) {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 410, height: 130), styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
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
                    let alert = self.alert(); alert.messageText = "Queue Companion"; alert.informativeText = message
                    if self.uiTesting { DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { NSApp.stopModal(withCode: .alertFirstButtonReturn); alert.window.orderOut(nil) } }
                    alert.runModal()
                    if self.uiTesting {
                        self.uiCycles += 1
                        if self.uiCycles < 3 { DispatchQueue.main.async { self.menu() } }
                        else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { print("3 installer UI lifecycle checks passed"); NSApp.terminate(nil) } }
                    } else { NSApp.terminate(nil) }
                case .failure(let error): self.showError(error); DispatchQueue.main.async { self.menu() }
                }
            }
        }
    }
}

if CommandLine.arguments.contains("--self-test") {
    var passed = 0
    func check(_ condition: Bool, _ label: String) {
        if !condition { FileHandle.standardError.write(Data(("Installer check failed: " + label + "\n").utf8)); exit(1) }
        passed += 1
    }
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let child = root.appendingPathComponent("safe/file")
    check(NativeSetup.inside(child, root), "new child path")
    check(!NativeSetup.inside(root, root), "root cannot be removed")
    check(!NativeSetup.inside(root.appendingPathComponent("../escape"), root), "parent traversal")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("link"), withDestinationURL: URL(fileURLWithPath: "/tmp"))
    check(!NativeSetup.inside(root.appendingPathComponent("link/foreign"), root), "external symlink")
    let native = NativeSetup(home: root)
    let fake = root.appendingPathComponent("Spotify.app")
    try FileManager.default.createDirectory(at: fake.appendingPathComponent("Contents"), withIntermediateDirectories: true)
    check(!native.validSpotify(fake), "empty Spotify bundle")
    try native.write(Data("private".utf8), to: root.appendingPathComponent("private.json"), privateFile: true)
    let mode = try FileManager.default.attributesOfItem(atPath: root.appendingPathComponent("private.json").path)[.posixPermissions] as! Int
    check(mode == 0o600, "private file permissions")
    let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
    try native.write(Data("module".utf8), to: source.appendingPathComponent("nested/module.js"))
    try native.write(Data("pairing".utf8), to: source.appendingPathComponent("queue-companion-pairing.js"))
    try native.copyTree(source, to: destination)
    check(FileManager.default.fileExists(atPath: destination.appendingPathComponent("nested/module.js").path)
        && !FileManager.default.fileExists(atPath: destination.appendingPathComponent("queue-companion-pairing.js").path), "module copy excludes local pairing")
    try FileManager.default.createSymbolicLink(at: source.appendingPathComponent("external"), withDestinationURL: URL(fileURLWithPath: "/tmp"))
    var rejected = false
    do { try native.copyTree(source, to: destination) } catch { rejected = true }
    check(rejected, "module copy rejects links")
    try native.write(PropertyListSerialization.data(fromPropertyList: ["CFBundleIdentifier": "com.spotify.client"], format: .xml, options: 0), to: fake.appendingPathComponent("Contents/Info.plist"))
    try FileManager.default.createDirectory(at: fake.appendingPathComponent("Contents/Resources/Apps"), withIntermediateDirectories: true)
    try native.write(Data(contentsOf: URL(fileURLWithPath: "/usr/bin/true")), to: fake.appendingPathComponent("Contents/MacOS/Spotify"))
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: fake.appendingPathComponent("Contents/MacOS/Spotify").path)
    check(native.validSpotify(fake), "valid custom Spotify bundle")
    check(try native.locateSpotify(fake).path == fake.resolvingSymlinksInPath().path, "custom Spotify selection")
    try native.write(PropertyListSerialization.data(fromPropertyList: ["CFBundleIdentifier": "other.app"], format: .xml, options: 0), to: fake.appendingPathComponent("Contents/Info.plist"))
    check(!native.validSpotify(fake), "foreign bundle identifier")
    let selection = root.appendingPathComponent("bundled-vault.json")
    let bundled: [String: Any] = ["modules": ["stdlib": ["enabled": "1.13.2", "v": ["1.13.2": ["installed": true]]],
        "manager": ["v": ["1": [:]]], "store": ["v": ["1": [:]]], "spicetify-splash": ["v": ["1": [:]]]]]
    try native.json(bundled, to: selection)
    try native.json(["modules": ["unrelated": ["enabled": "2", "v": ["2": ["custom": true]]], "spicetify-splash": ["enabled": "1"]],
        "pending_defaults": ["spicetify-splash", "unrelated"]], to: native.profile.appendingPathComponent("modules/vault.json"))
    for parent in ["modules", "store"] {
        for id in ["manager", "store", "spicetify-splash", "stdlib", "queue-companion"] {
            try native.write(Data("retained".utf8), to: native.profile.appendingPathComponent(parent + "/" + id + "/fixture.txt"))
        }
    }
    try native.applyMinimalProfile(selection)
    let vault = try native.readJSON(native.profile.appendingPathComponent("modules/vault.json"))
    let modules = vault["modules"] as! [String: Any]
    check((modules["unrelated"] as! [String: Any])["enabled"] as? String == "2", "unrelated selections preserved")
    check(["manager", "store", "spicetify-splash"].allSatisfy { (modules[$0] as! [String: Any])["enabled"] == nil }, "optional defaults disabled")
    check(vault["pending_defaults"] as? [String] == ["unrelated"], "only optional pending defaults removed")
    check(!FileManager.default.fileExists(atPath: native.profile.appendingPathComponent("modules/spicetify-splash").path), "optional package pruned")
    check(FileManager.default.fileExists(atPath: native.profile.appendingPathComponent("modules/stdlib/fixture.txt").path)
        && FileManager.default.fileExists(atPath: native.profile.appendingPathComponent("modules/queue-companion/fixture.txt").path), "stdlib and extension preserved")
    let first = try Data(contentsOf: native.profile.appendingPathComponent("modules/vault.json"))
    try native.applyMinimalProfile(selection)
    check(try Data(contentsOf: native.profile.appendingPathComponent("modules/vault.json")) == first, "repeat repair idempotent")
    print("\(passed) native macOS installer checks passed")
    exit(0)
}
let application = NSApplication.shared
let delegate = CompanionDelegate()
application.delegate = delegate
application.run()
