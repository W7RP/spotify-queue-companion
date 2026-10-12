import AppKit
import Foundation

enum SetupError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(text) = self { return text }; return nil }
}

struct NativeSetup {
    let fm = FileManager.default
    let home = FileManager.default.homeDirectoryForCurrentUser
    var applications: URL { home.appendingPathComponent("Applications") }
    var app: URL { applications.appendingPathComponent("Queue Companion.app") }
    var setup: URL { applications.appendingPathComponent("Queue Companion Setup.app") }
    var data: URL { home.appendingPathComponent("Library/Application Support/QueueCompanion") }
    var profile: URL { home.appendingPathComponent(".config/spicetify") }
    var helper: URL { app.appendingPathComponent("Contents/Resources/QueueCompanion") }
    var spice: URL { app.appendingPathComponent("Contents/Resources/vendor/spicetify") }
    var agent: URL { home.appendingPathComponent("Library/LaunchAgents/org.queuecompanion.helper.plist") }
    var domain: String { "gui/\(getuid())" }

    @discardableResult
    func run(_ executable: URL, _ arguments: [String], timeout: TimeInterval = 120, allowFailure: Bool = false) throws -> Int32 {
        let process = Process(); process.executableURL = executable; process.arguments = arguments
        // Native integration output may contain paths. Keep it out of persistent logs.
        process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        try process.run()
        let deadline = Date().addingTimeInterval(timeout)
        while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
        if process.isRunning { process.terminate(); throw SetupError.message("An installation step timed out. Your backup is retained; use Repair.") }
        if process.terminationStatus != 0 && !allowFailure {
            throw SetupError.message("\(executable.lastPathComponent) could not complete this step (\(process.terminationStatus)). Your backup is retained. Check that Spotify is writable, then use Repair.")
        }
        return process.terminationStatus
    }

    static func inside(_ path: URL, _ root: URL) -> Bool {
        path.standardizedFileURL.path.hasPrefix(root.standardizedFileURL.path + "/")
            && path.resolvingSymlinksInPath().path.hasPrefix(root.resolvingSymlinksInPath().path + "/")
    }
    func removeOwned(_ path: URL, within root: URL) throws {
        guard Self.inside(path, root) else { throw SetupError.message("An installation path leaves the intended folder.") }
        if fm.fileExists(atPath: path.path) { try fm.removeItem(at: path) }
    }
    func write(_ bytes: Data, to path: URL, privateFile: Bool = false) throws {
        try fm.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
        try bytes.write(to: path, options: .atomic)
        if privateFile { try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path) }
    }
    func json(_ object: Any, to path: URL, privateFile: Bool = false) throws {
        try write(JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .prettyPrinted]), to: path, privateFile: privateFile)
    }
    func readJSON(_ path: URL) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: Data(contentsOf: path)) as? [String: Any] else { throw SetupError.message("The saved installation record is invalid.") }
        return value
    }
    func copyTree(_ source: URL, to destination: URL, preserveVault: Bool = false) throws {
        for entry in try fm.contentsOfDirectory(at: source, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey]) {
            let attrs = try entry.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard attrs.isSymbolicLink != true else { throw SetupError.message("A bundled integration file is unexpectedly a link.") }
            let name = entry.lastPathComponent
            if ["daemon-token", "queue-companion-pairing.js"].contains(name) || (preserveVault && name == "vault.json") { continue }
            let target = destination.appendingPathComponent(name)
            guard Self.inside(target, destination) else { throw SetupError.message("An integration destination is unexpectedly a link.") }
            if attrs.isDirectory == true {
                try fm.createDirectory(at: target, withIntermediateDirectories: true)
                try copyTree(entry, to: target)
            } else {
                try fm.createDirectory(at: destination, withIntermediateDirectories: true)
                try write(Data(contentsOf: entry), to: target)
            }
        }
    }

    func validSpotify(_ url: URL) -> Bool {
        guard let plist = NSDictionary(contentsOf: url.appendingPathComponent("Contents/Info.plist")),
              plist["CFBundleIdentifier"] as? String == "com.spotify.client" else { return false }
        return fm.isExecutableFile(atPath: url.appendingPathComponent("Contents/MacOS/Spotify").path)
            && fm.fileExists(atPath: url.appendingPathComponent("Contents/Resources/Apps").path)
    }
    func locateSpotify(_ selected: URL?) throws -> URL {
        if let chosen = selected {
            guard validSpotify(chosen) else { throw SetupError.message("Choose the installed Spotify.app, then retry.") }
            return chosen.resolvingSymlinksInPath()
        }
        let saved = try? readJSON(data.appendingPathComponent("install-macos.json"))["spotifyBundle"] as? String
        let candidates = [saved.map { URL(fileURLWithPath: $0) },
            NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.spotify.client"),
            URL(fileURLWithPath: "/Applications/Spotify.app"), applications.appendingPathComponent("Spotify.app")]
        if let found = candidates.compactMap({ $0 }).first(where: validSpotify) { return found.resolvingSymlinksInPath() }
        throw SetupError.message("Spotify could not be located. Use Choose Spotify to select Spotify.app. Install the desktop app and open it once first.")
    }
    func stopHelper() throws {
        try run(URL(fileURLWithPath: "/bin/launchctl"), ["bootout", domain + "/org.queuecompanion.helper"], timeout: 15, allowFailure: true)
        // Handles a helper started directly from the app, after verifying its executable.
        if fm.fileExists(atPath: helper.path) { try run(helper, ["--stop"], timeout: 15) }
    }
    func startHelper() throws {
        try run(URL(fileURLWithPath: "/bin/launchctl"), ["kickstart", domain + "/org.queuecompanion.helper"], timeout: 15, allowFailure: true)
        // The singleton makes this safe whether the login agent is already running or disabled.
        let process = Process(); process.executableURL = helper
        process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        try process.run()
    }
    func integration(_ bundle: URL, _ command: String) throws {
        try run(spice, ["--spotify-exec", bundle.appendingPathComponent("Contents/MacOS/Spotify").path,
            "--spotify-data-dir", bundle.appendingPathComponent("Contents/Resources").path, command])
    }
    func receipt() throws -> [String: Any] { try readJSON(data.appendingPathComponent("install-macos.json")) }

    func install(_ selected: URL?) throws {
        let bundle = try locateSpotify(selected)
        let resources = bundle.appendingPathComponent("Contents/Resources")
        let apps = resources.appendingPathComponent("Apps")
        for (path, identifier) in [(app, "org.queuecompanion.app"), (setup, "org.queuecompanion.setup")] {
            if fm.fileExists(atPath: path.path) {
                guard let plist = NSDictionary(contentsOf: path.appendingPathComponent("Contents/Info.plist")),
                      plist["CFBundleIdentifier"] as? String == identifier else {
                    throw SetupError.message("Another application occupies \(path.lastPathComponent). Move it out of ~/Applications before installing.")
                }
            }
        }
        guard fm.isWritableFile(atPath: apps.path) else {
            throw SetupError.message("Spotify’s app files are not writable by your account. Install Spotify into your Applications folder (~/Applications), open that copy once, and choose it here. Setup does not broaden Spotify’s permissions.")
        }
        let existing = fm.fileExists(atPath: data.appendingPathComponent("install-macos.json").path)
        if !existing && fm.fileExists(atPath: profile.appendingPathComponent("config-xpui.ini").path)
            && !fm.fileExists(atPath: profile.appendingPathComponent("config.toml").path) {
            throw SetupError.message("An older Spicetify installation is present. Restore stock Spotify with that installation before using Queue Companion.")
        }
        try fm.createDirectory(at: data, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try fm.setAttributes([.posixPermissions: 0o700], ofItemAtPath: data.path)
        var record: [String: Any]
        if existing {
            record = try receipt()
            guard record["spotifyBundle"] as? String == bundle.path else { throw SetupError.message("Restore the previous Spotify installation before selecting a different copy.") }
        } else {
            let config = profile.appendingPathComponent("config.toml")
            let owned = !fm.fileExists(atPath: config.path)
            record = ["version": "0.2.6-macos.1", "spotifyBundle": bundle.path, "ownedProfile": owned]
            if !owned { record["originalConfig"] = try String(contentsOf: config, encoding: .utf8) }
            let stock = apps.appendingPathComponent(fm.fileExists(atPath: apps.appendingPathComponent("xpui.spa.backup").path) ? "xpui.spa.backup" : "xpui.spa")
            guard fm.fileExists(atPath: stock.path) else { throw SetupError.message("Spotify’s original app archive is missing. Restore stock Spotify before installing.") }
            try write(Data(contentsOf: stock), to: data.appendingPathComponent("backup/xpui.spa"), privateFile: true)
            try json(record, to: data.appendingPathComponent("install-macos.json"), privateFile: true)
        }
        try stopHelper()
        let owned = record["ownedProfile"] as? Bool == true
        if owned && fm.fileExists(atPath: spice.path) { try run(spice, ["daemon", "stop"], timeout: 20, allowFailure: true) }
        try fm.createDirectory(at: applications, withIntermediateDirectories: true)
        let payload = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/Queue Companion.app")
        guard fm.fileExists(atPath: payload.path) else { throw SetupError.message("The installer payload is missing. Download the installer again.") }
        // Only replace this product's installed app, never arbitrary selected app bundles.
        if fm.fileExists(atPath: app.path) { try removeOwned(app, within: applications) }
        try fm.copyItem(at: payload, to: app)
        if Bundle.main.bundleURL.standardizedFileURL != setup.standardizedFileURL {
            if fm.fileExists(atPath: setup.path) { try removeOwned(setup, within: applications) }
            try fm.copyItem(at: Bundle.main.bundleURL, to: setup)
        }
        try fm.createDirectory(at: profile, withIntermediateDirectories: true)
        let vendor = app.appendingPathComponent("Contents/Resources/vendor/runtime")
        if owned {
            func quoted(_ value: String) throws -> String {
                let array = try JSONSerialization.data(withJSONObject: [value], options: [.fragmentsAllowed, .withoutEscapingSlashes])
                return String(data: array, encoding: .utf8)!.dropFirst().dropLast().description
            }
            let config = try "mirror = false\ndaemon = true\nauto_update = false\nspotify_exec = \(quoted(bundle.appendingPathComponent("Contents/MacOS/Spotify").path))\nspotify_data_dir = \(quoted(resources.path))\noffline_bnk_dir = \(quoted(home.appendingPathComponent("Library/Application Support/Spotify/PersistentCache").path))\n"
            try write(Data(config.utf8), to: profile.appendingPathComponent("config.toml"))
            for name in ["store", "modules", "classmaps", "cache"] {
                try copyTree(vendor.appendingPathComponent(name), to: profile.appendingPathComponent(name), preserveVault: name == "modules")
            }
            try applyMinimalProfile(vendor.appendingPathComponent("modules/vault.json"))
        }
        let module = profile.appendingPathComponent("modules/queue-companion")
        try fm.createDirectory(at: module, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try fm.setAttributes([.posixPermissions: 0o700], ofItemAtPath: module.path)
        try copyTree(app.appendingPathComponent("Contents/Resources/extension"), to: module)
        try run(helper, ["--init", "--extension-dir", module.path], timeout: 30)
        try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: module.appendingPathComponent("queue-companion-pairing.js").path)
        try json(["executable": bundle.appendingPathComponent("Contents/MacOS/Spotify").path, "dataDirectory": resources.path], to: data.appendingPathComponent("spotify-installation.json"), privateFile: true)
        try integration(bundle, "apply")
        let manifest = try readJSON(apps.appendingPathComponent("xpui/modules/manifest.json"))
        let ids = (manifest["modules"] as? [[String: Any]] ?? []).compactMap { $0["identifier"] as? String }
        guard ids.contains("queue-companion"), ids.contains("stdlib"),
              !owned || !ids.contains(where: { ["manager", "store", "spicetify-splash"].contains($0) }) else {
            throw SetupError.message("The Queue Companion module did not stage correctly. Your backup is retained; use Repair.")
        }
        try jsonAgent()
        let launchctl = URL(fileURLWithPath: "/bin/launchctl")
        try run(launchctl, ["enable", domain + "/org.queuecompanion.helper"], timeout: 15)
        try run(launchctl, ["bootstrap", domain, agent.path], timeout: 15)
        try run(URL(fileURLWithPath: "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"), ["-f", app.path], timeout: 15)
    }
    func applyMinimalProfile(_ bundledPath: URL) throws {
        let path = profile.appendingPathComponent("modules/vault.json")
        var current = (try? readJSON(path)) ?? [:]
        let bundled = try readJSON(bundledPath)
        var modules = current["modules"] as? [String: Any] ?? [:]
        let selections = bundled["modules"] as? [String: Any] ?? [:]
        for id in ["stdlib", "manager", "store", "spicetify-splash"] {
            guard let selected = selections[id] as? [String: Any] else { throw SetupError.message("The bundled module selection is incomplete.") }
            var merged = modules[id] as? [String: Any] ?? [:]
            var versions = merged["v"] as? [String: Any] ?? [:]
            for (key, value) in selected["v"] as? [String: Any] ?? [:] { versions[key] = value }
            merged["v"] = versions
            if id == "stdlib" { merged["enabled"] = selected["enabled"] }
            else { merged.removeValue(forKey: "enabled") }
            modules[id] = merged
        }
        current["modules"] = modules
        if let pending = current["pending_defaults"] as? [String] {
            current["pending_defaults"] = pending.filter { !["manager", "store", "spicetify-splash"].contains($0) }
        }
        try json(current, to: path)
        for id in ["manager", "store", "spicetify-splash"] {
            for parent in ["modules", "store"] {
                let path = profile.appendingPathComponent(parent + "/" + id)
                if fm.fileExists(atPath: path.path) { try removeOwned(path, within: profile) }
            }
        }
    }
    func jsonAgent() throws {
        let plist: [String: Any] = ["Label": "org.queuecompanion.helper", "ProgramArguments": [helper.path],
            "RunAtLoad": true, "KeepAlive": true, "ThrottleInterval": 10, "ProcessType": "Background",
            "WorkingDirectory": helper.deletingLastPathComponent().path]
        try write(PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0), to: agent, privateFile: true)
    }
    func restore() throws {
        let record = try receipt()
        guard record["ownedProfile"] as? Bool == true else {
            throw SetupError.message("This Spotify installation has an existing Spicetify setup. Use Uninstall to remove only Queue Companion and preserve that setup.")
        }
        try stopHelper()
        try run(spice, ["daemon", "stop"], timeout: 20, allowFailure: true)
        let bundle = URL(fileURLWithPath: record["spotifyBundle"] as! String)
        guard validSpotify(bundle) else { throw SetupError.message("The recorded Spotify installation is missing. Restore that copy before continuing.") }
        try integration(bundle, "restore")
    }
    func uninstall() throws -> Bool {
        let record = try receipt(); try stopHelper()
        let revoke = try run(helper, ["--revoke"], timeout: 40, allowFailure: true)
        try run(helper, ["--forget"], timeout: 40)
        let owned = record["ownedProfile"] as? Bool == true
        let module = profile.appendingPathComponent("modules/queue-companion")
        if fm.fileExists(atPath: module.path) { try removeOwned(module, within: profile) }
        if owned { try restore() }
        else {
            let bundle = URL(fileURLWithPath: record["spotifyBundle"] as! String)
            try integration(bundle, "apply")
        }
        if fm.fileExists(atPath: agent.path) { try removeOwned(agent, within: agent.deletingLastPathComponent()) }
        // Retain runtime/backup files: removing a shared profile or daemon outside
        // our app could discard modifications made after Queue Companion installed.
        if let original = record["originalConfig"] as? String { try write(Data(original.utf8), to: profile.appendingPathComponent("config.toml")) }
        if owned {
            try run(spice, ["daemon", "uninstall"], timeout: 20, allowFailure: true)
            let config = profile.appendingPathComponent("config.toml")
            if fm.fileExists(atPath: config.path) { try removeOwned(config, within: profile) }
        }
        try removeOwned(data, within: data.deletingLastPathComponent())
        try removeOwned(app, within: applications)
        if fm.fileExists(atPath: setup.path) { try removeOwned(setup, within: applications) }
        return revoke != 0
    }
}
