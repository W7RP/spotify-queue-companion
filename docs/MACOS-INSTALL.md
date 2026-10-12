# Queue Companion for macOS — preview

The Windows `.exe` does not run on macOS. This preview uses the same Queue panel, Search shortcut, playlist discovery and Claude API/ChatGPT settings, with a native Mac installer and background helper.

## Installation

1. Use the **arm64** disk image for Apple Silicon (M1 or newer), or **x64** for an Intel Mac. macOS 15 Sequoia or newer is required. No separate .NET, Python or Spicetify installation is needed.
2. Install Spotify from spotify.com, sign in, and open it once. Use desktop Spotify on this Mac as the playback device. Spotify Premium remains the tested target on Windows.
3. Open the `.dmg`, then **Queue Companion Setup.app** inside it. This is an ad-hoc signed preview, without Apple Developer ID notarization. If macOS blocks opening it, use **System Settings → Privacy & Security → Open Anyway** after attempting to open Setup, following [Apple’s opening instructions](https://support.apple.com/en-us/102445). Keep Gatekeeper enabled.
4. Choose **Install / Repair**. Spotify restarts. Setup installs Queue Companion and its maintenance app into **~/Applications**, and the helper starts at login without a window. Eject the disk image afterward.
5. In Spotify, click the queue icon beside Search or open Queue. Open the gear to connect your own **Claude API key** or **ChatGPT** account. Claude Pro/Max subscriptions do not supply API credits.

If Spotify is in a custom folder, use **Choose Spotify…** and select the installed Spotify.app. Setup checks the actual executable and bundle identifier. If Spotify’s app files are owned by another account, install a copy into **~/Applications** and select that copy. Setup does not grant everyone write access or require sudo.

## Repair and removal

Open **~/Applications/Queue Companion Setup.app** for Repair, Restore Spotify, or Uninstall. Restoring disables Queue Companion’s helper until Repair and retains the stock app backup. A pre-existing Spicetify v3 profile keeps its other modules; Uninstall removes only Queue Companion. Older Spicetify v2 installations must be restored with their existing tool before this installer can proceed.

Provider credentials live in your login **Keychain**. Settings, pairing, cache and local history live in **~/Library/Application Support/QueueCompanion** with owner-only permissions. macOS may request Keychain access. Repair preserves the existing connection. Uninstall removes provider Keychain items and product data; if network revocation cannot be confirmed, also revoke Queue Companion in ChatGPT settings. Shared integration profile/backup files are retained to avoid deleting later customizations.

## Preview limits

Native build checks cover Keychain read/update/delete, private file permissions, real loopback client process verification, installer path boundaries, signatures and the packaged helper. They do not prove the UI or queue writes on a signed-in Mac Spotify client. That final check is pending a friend’s Mac. **Append** is available; **Start over / queue replacement** is disabled on macOS until its removal semantics have been verified. No second window is used for everyday requests.

The integration is the same minimal Spicetify 3.0.0-rc.3 plus stdlib 1.13.2 runtime used on Windows. Queue Companion-owned profiles disable the optional Spicetify splash, Store and manager. Upstream licenses and corresponding source are bundled.

Build on a matching Mac with Node 24, .NET SDK 10.0.300, Xcode command-line tools and Python 3: `cd extension && npm ci && npm test && npm run build`, then run `python3 build-macos.py` from the repository root. GitHub’s **macOS installers** workflow builds Apple Silicon and Intel disk images on matching runners. Published release checksums identify the exact download.
