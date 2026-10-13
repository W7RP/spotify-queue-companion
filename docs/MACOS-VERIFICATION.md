# macOS preview verification

The Mac preview keeps the 0.2.6 Spotify extension and selection behavior, adds native app bundles for setup and helper activation, and ports credential storage and peer verification. It targets macOS 15 and newer on Apple Silicon and Intel. The self-contained .NET runtime does not require a separate runtime installation.

Windows regression checks passed: 71 extension tests, 47 helper/installer tests and 21 UI checks across four viewports. The Windows helper still publishes with its locked dependencies, DPAPI and executable-path peer check.

Matching GitHub Mac runners compile Swift and publish .NET for each architecture. Each runs 17 native installer checks and 17 helper checks. Installer fixtures cover custom Spotify bundles, actual bundle identifiers, missing executables, ancestor aliases, traversal and external symlink rejection, file privacy, copy boundaries, preservation of local pairing, minimal module selection, unrelated selections, splash suppression and repeated Repair. Helper checks exercise actual login Keychain creation/update/read/deletion, isolated storage roots, owner-only files and real established TCP connections with both accepted and rejected executable paths.

The packaged helper also initializes pairing, serves its loopback endpoint, rejects a foreign Host and a non-Spotify WebSocket client, enforces a single instance and shuts down through its verified executable receipt. Both app bundles pass deep signature verification. Official upstream archive hashes are checked, original archives and corresponding source retained, and DMGs verified. Intel upstream executables receive ad-hoc signatures because their official release binaries are unsigned. No user credentials, pairing, history, cache or daemon token are packaged.

The `macOS installers` workflow produces per-architecture build proofs and disk-image SHA-256 files. Release assets include these records and matching source. These checks do not install the extension into a signed-in Mac Spotify client or verify native queue writes. That final test is pending the user's friend. Append is available; destructive queue replacement remains disabled on macOS.

The preview is ad-hoc signed and **not notarized by Apple**. It has no Apple Developer ID identity. It may require Open Anyway for initial launch. Daily use stays inside Spotify; maintenance controls are in Queue Companion Setup.

## Preview 2 installer crash fix

A user-supplied macOS 26 crash report showed `objc_release` failing while the main AppKit run loop drained an autorelease pool, with installation still running on a worker thread. The installer created a Swift-owned progress window with AppKit's default release-on-close behavior. [Apple documents that Swift/ARC clients must disable this behavior](https://developer.apple.com/documentation/appkit/nswindow/isreleasedwhenclosed) to avoid releasing a window too many times.

Preview 2 explicitly keeps Swift ownership of progress, alert and file-picker windows, and defers modal-to-progress transitions until the current modal call returns. The new UI test opens and dismisses real installer dialogs and progress windows for Install, Restore and Uninstall using harmless simulated work. Both architecture builds run it, and a separate macOS 26 runner exercises window cleanup with memory scribbling. Spotify and installation state are untouched by the UI fixtures. The original private crash report is not included in the repository or distribution.

The macOS 26 regression run reproduced a segmentation fault (exit signal 11) when the progress window's ownership fix was removed. With the fix restored, all three UI transitions completed successfully. These checks supplement the existing native/helper checks; signed-in Spotify queue testing remains separate.
