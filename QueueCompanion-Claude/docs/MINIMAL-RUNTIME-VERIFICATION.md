# Minimal bundled integration — 0.2.2

Queue Companion still lives in Spotify's native Queue panel, with the Search shortcut, larger request bar, existing settings and both provider choices. This release changes the bundled integration profile only.

The retained components are the unmodified Spicetify 3.0.0-rc.3 CLI/daemon and stdlib 1.13.2. The optional `spicetify-splash`, `store` and `manager` module/store trees and their separate source archives are excluded. Required dependency notices, exact source archives and file checksums remain in `vendor`.

On installations created by Queue Companion, upgrade removes the old optional trees and merges the minimal selection into the current runtime configuration. Other module selections and versions are preserved. Disabled metadata records prevent upstream Apply's default recovery logic from downloading the manager or Store again; these records contain no executable module code. Pending splash retries are cancelled. Install and Repair verify that the staged manifest contains stdlib and Queue Companion without the optional modules.

An independently installed Spicetify configuration remains the user's configuration: its modules and appearance are preserved. This release does not replace the upstream loader or remove locally installed custom modules from Spotify browser storage.

## Automated verification

The full release build passed 18 extension selection/queue tests, 34 helper/installer tests and 21 headless browser UI checks. The six new runtime tests cover preserving unrelated selections, preventing default recovery on fresh/repeated repairs, cancelling optional pending retries, pruning only owned optional trees, preserving independent Spicetify installations and rejecting optional modules in staged manifests. The build verifies every retained vendor checksum and rejects optional module payloads.

The original provider and Queue-panel behavior is unchanged. See `CLAUDE-VERIFICATION.md` and `QUEUE-PANEL-VERIFICATION.md` for the earlier releases' observations. No live Claude API request was made for this runtime-only change.

## Live Windows verification

Verified on desktop Spotify Premium 1.3.4.258, Windows 10 x64, on the existing Queue Companion-owned installation. Spotify uses the same public 1030003 classmap fallback as the previous release; upstream Apply reports that fallback.

The live module registry contained exactly stdlib and Queue Companion, both loaded successfully. No optional splash, Store or manager was loaded, and no optional local-storage module overrides were present on this account. Their absent executable packages and absent live registry entries confirm that the optional startup splash cannot run in this tested installation.

All 19 live checks passed: the required Spotify APIs were ready; the Search icon opened Queue and focused the composer; the request bar remained 44px with 16px text; the icon aligned beside Browse; native queue space was reserved; repeated clicks, close/reopen, draft preservation and Recently played switching worked; settings opened and Escape closed them. The three pending manual queue entries and current playback were unchanged by these checks. The saved provider remained ChatGPT and its connection remained available.

The public results are in `minimal-runtime-live-proof.json`, with build output in `minimal-runtime-build-verification.txt`. Installation and final Repair reports and installed-file verification are included beside them. Temporary live-check instrumentation is removed from the installed production extension.

The second Windows-account installation and a live request with the friend's Anthropic API key remain unverified. This release's runtime and UI checks do not establish those results.
